<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\QaInspection;
use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use App\Notifications\WorkflowNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class QaInspectionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    private function proof(string $name = 'proof.pdf'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
    }

    private function qaUser(): User
    {
        $role = Role::create([
            'name' => 'QA Supervisor',
            'slug' => 'QA_SUPERVISOR',
        ]);

        return User::factory()->create(['role_id' => $role->id]);
    }

    private function makeReceiving(array $items, string $status = 'Pending QA'): Receiving
    {
        $receiving = Receiving::create([
            'receiving_no' => 'RCV-'.uniqid(),
            'purchase_order' => 'PO-1',
            'supplier' => 'Test Supplier',
            'reference_no' => 'REF-1',
            'delivery_date' => now()->toDateString(),
            'status' => $status,
        ]);

        foreach ($items as $item) {
            $product = Product::create([
                'name' => $item['product'],
                'unit' => $item['unit'] ?? 'pcs',
                'cost_price' => 100,
            ]);

            ReceivingItem::create([
                'receiving_id' => $receiving->id,
                'product_id' => $product->id,
                'product_name' => $product->name,
                'delivered_quantity' => $item['qty'],
                'unit' => $item['unit'] ?? 'pcs',
                'inspection_status' => $item['inspection_status'] ?? 'Pending QA',
            ]);
        }

        return $receiving->fresh('items');
    }

    public function test_index_lists_existing_receivings_for_qa(): void
    {
        $qa = $this->qaUser();
        $receiving = $this->makeReceiving([
            ['product' => 'Stainless Steel Pipe 2in', 'qty' => 8],
        ]);

        $response = $this->actingAs($qa)->getJson('/api/qa/inspections');

        $response->assertOk();
        $response->assertJsonPath('data.0.receiving_no', $receiving->receiving_no);
        $response->assertJsonPath('data.0.product', 'Stainless Steel Pipe 2in');
        $response->assertJsonPath('data.0.inspection_status', 'Pending');
        $response->assertJsonPath('data.0.action', 'Start Inspection');
    }

    public function test_show_returns_receiving_products_without_sku(): void
    {
        $qa = $this->qaUser();
        $receiving = $this->makeReceiving([
            ['product' => 'Industrial Valve DN50', 'qty' => 10],
        ]);

        $response = $this->actingAs($qa)->getJson("/api/qa/inspections/{$receiving->id}");

        $response->assertOk();
        $response->assertJsonPath('receiving_no', $receiving->receiving_no);
        $response->assertJsonMissingPath('products.0.sku');
        $response->assertJsonPath('products.0.product', 'Industrial Valve DN50');
        $response->assertJsonPath('products.0.ordered_qty', 10);
        $response->assertJsonPath('products.0.delivered_qty', 10);
    }

    public function test_submiting_inspection_updates_qa_and_receiving_statuses(): void
    {
        Notification::fake();
        $qa = $this->qaUser();
        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $plantRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        $plantManager = User::factory()->create(['role_id' => $plantRole->id, 'status' => 'ACTIVE']);
        $otherPlantManager = User::factory()->create(['role_id' => $plantRole->id, 'status' => 'ACTIVE']);
        $receiving = $this->makeReceiving([
            ['product' => 'Widget A', 'qty' => 10],
            ['product' => 'Widget B', 'qty' => 5],
        ]);
        $receiving->update(['prepared_by_id' => $plantManager->id]);

        $payload = [
            'attachment' => $this->proof(),
            'items' => [
                [
                    'receiving_item_id' => $receiving->items[0]->id,
                    'accepted_quantity' => 10,
                    'rejected_quantity' => 0,
                    'inspection_result' => 'Passed',
                    'remarks' => 'Accepted.',
                ],
                [
                    'receiving_item_id' => $receiving->items[1]->id,
                    'accepted_quantity' => 3,
                    'rejected_quantity' => 2,
                    // The server must derive the auditable result from quantities.
                    'inspection_result' => 'Passed',
                    'remarks' => 'Two damaged pieces.',
                ],
            ],
        ];

        $response = $this->actingAs($qa)->post("/api/qa/inspections/{$receiving->id}", $payload, ['Accept' => 'application/json']);

        $response->assertOk();
        $response->assertJsonPath('inspection_status', 'Partial');
        $response->assertJsonPath('products.0.accepted_qty', 10);
        $response->assertJsonPath('products.1.rejected_qty', 2);

        $this->assertDatabaseHas('receivings', [
            'id' => $receiving->id,
            'status' => 'Partial',
        ]);

        $this->assertDatabaseHas('receiving_items', [
            'id' => $receiving->items[0]->id,
            'inspection_status' => 'Passed',
        ]);

        $this->assertDatabaseHas('receiving_items', [
            'id' => $receiving->items[1]->id,
            'inspection_status' => 'Partial',
        ]);

        $this->assertDatabaseHas('qa_inspections', [
            'receiving_id' => $receiving->id,
            'status' => 'Partial',
        ]);
        $this->assertDatabaseHas('qa_inspection_items', [
            'receiving_item_id' => $receiving->items[1]->id,
            'inspection_result' => 'Partial',
            'remarks' => 'Two damaged pieces.',
        ]);
        $this->assertDatabaseHas('receiving_timelines', [
            'receiving_id' => $receiving->id,
            'status' => 'Ready for Stock In',
        ]);

        $this->actingAs($qa)
            ->getJson('/api/qa/inspections')
            ->assertOk()
            ->assertJsonMissing(['receiving_no' => $receiving->receiving_no]);
        Notification::assertSentTo($plantManager, WorkflowNotification::class, fn ($notification) =>
            $notification->title === 'QA Inspection Completed'
            && $notification->message === "Receiving #{$receiving->receiving_no} was marked as Partial."
            && $notification->type === 'warning'
            && $notification->referenceId === $receiving->receiving_no);
        Notification::assertSentToTimes($plantManager, WorkflowNotification::class, 1);
        Notification::assertNotSentTo($admin, WorkflowNotification::class);
        Notification::assertNotSentTo($otherPlantManager, WorkflowNotification::class);
        Notification::assertNotSentTo($qa, WorkflowNotification::class);
    }

    public function test_partial_inspection_moves_only_accepted_quantity_to_stock_in(): void
    {
        $qa = $this->qaUser();
        $plantManagerRole = Role::create([
            'name' => 'Plant Manager',
            'slug' => 'PLANT_MANAGER',
        ]);
        $plantManager = User::factory()->create(['role_id' => $plantManagerRole->id]);
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'BR-MAIN']);
        Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id]);
        $receiving = $this->makeReceiving([
            ['product' => 'Partial Widget', 'qty' => 5],
        ]);
        $item = $receiving->items->firstOrFail();

        $inspection = $this->actingAs($qa)->post("/api/qa/inspections/{$receiving->id}", [
            'attachment' => $this->proof(),
            'items' => [[
                'receiving_item_id' => $item->id,
                'accepted_quantity' => 3,
                'rejected_quantity' => 2,
                'inspection_result' => 'Partial',
                'remarks' => 'Two rejected units.',
            ]],
        ]);

        $inspection->assertOk()
            ->assertJsonPath('inspection_status', 'Partial')
            ->assertJsonPath('products.0.inspection_result', 'Partial');

        $stockInList = $this->actingAs($plantManager)->getJson('/api/stock-in/receivings');
        $stockInList->assertOk()
            ->assertJsonPath('data.0.qa_status', 'Partial')
            ->assertJsonPath('data.0.stock_in_status', 'Ready for Stock In')
            ->assertJsonPath('data.0.eligible_quantity', 3);

        $this->actingAs($plantManager)
            ->postJson("/api/stock-in/receivings/{$receiving->id}/stock-in")
            ->assertOk()
            ->assertJsonPath('qa_status', 'Partial')
            ->assertJsonPath('stock_in_status', 'Completed');

        $this->assertDatabaseHas('inventories', [
            'product_id' => $item->product_id,
            'available_stock' => 3,
        ]);
        $this->assertDatabaseMissing('inventories', [
            'product_id' => $item->product_id,
            'available_stock' => 5,
        ]);
        $this->assertDatabaseHas('qa_inspections', [
            'receiving_id' => $receiving->id,
            'status' => 'Partial',
        ]);
    }

    public function test_rejects_invalid_quantities(): void
    {
        $qa = $this->qaUser();
        $receiving = $this->makeReceiving([
            ['product' => 'Widget A', 'qty' => 5],
        ]);

        $payload = [
            'items' => [
                [
                    'receiving_item_id' => $receiving->items[0]->id,
                    'accepted_quantity' => 4,
                    'rejected_quantity' => 2,
                    'inspection_result' => 'Partial',
                ],
            ],
        ];

        $response = $this->actingAs($qa)->postJson("/api/qa/inspections/{$receiving->id}", $payload);

        $response->assertStatus(422);
        $response->assertJsonPath('message', 'Accepted and rejected quantities cannot exceed delivered quantity.');
    }

    public function test_draft_derives_pending_result_for_incomplete_quantities(): void
    {
        $qa = $this->qaUser();
        $receiving = $this->makeReceiving([
            ['product' => 'Widget A', 'qty' => 20],
        ]);

        $response = $this->actingAs($qa)->postJson("/api/qa/inspections/{$receiving->id}", [
            'submit' => false,
            'items' => [[
                'receiving_item_id' => $receiving->items[0]->id,
                'accepted_quantity' => 10,
                'rejected_quantity' => 0,
                'inspection_result' => 'Passed',
            ]],
        ]);

        $response->assertOk()
            ->assertJsonPath('products.0.inspection_result', 'Pending');
        $this->assertDatabaseHas('qa_inspection_items', [
            'receiving_item_id' => $receiving->items[0]->id,
            'accepted_quantity' => 10,
            'rejected_quantity' => 0,
            'inspection_result' => 'Pending',
        ]);
    }

    public function test_non_qa_users_are_forbidden(): void
    {
        $user = User::factory()->create();
        $receiving = $this->makeReceiving([
            ['product' => 'Widget A', 'qty' => 5],
        ]);

        $response = $this->actingAs($user)->getJson("/api/qa/inspections/{$receiving->id}");

        $response->assertStatus(403);
        $response->assertJsonPath('message', 'Unauthorized QA access.');
    }

    public function test_admin_can_view_but_cannot_update_qa_notes(): void
    {
        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $admin = User::factory()->create(['role_id' => $adminRole->id]);
        $receiving = $this->makeReceiving([
            ['product' => 'Widget A', 'qty' => 5],
        ]);

        $this->actingAs($admin)
            ->getJson("/api/qa/inspections/{$receiving->id}")
            ->assertOk();

        $this->actingAs($admin)
            ->postJson("/api/qa/inspections/{$receiving->id}", [
                'submit' => false,
                'items' => [[
                    'receiving_item_id' => $receiving->items[0]->id,
                    'accepted_quantity' => 0,
                    'rejected_quantity' => 0,
                    'inspection_result' => 'Pending',
                    'remarks' => 'Admin must not be able to save this note.',
                ]],
            ])
            ->assertForbidden()
            ->assertJsonPath('message', 'Only QA Supervisors can save QA inspections and notes.');

        $this->assertDatabaseMissing('qa_inspection_items', [
            'receiving_item_id' => $receiving->items[0]->id,
            'remarks' => 'Admin must not be able to save this note.',
        ]);
    }

    private function attachmentPayload(Receiving $receiving, int $accepted = 3, int $rejected = 2): array
    {
        return [
            'submit' => '1',
            'items' => [[
                'receiving_item_id' => (string) $receiving->items[0]->id,
                'accepted_quantity' => (string) $accepted,
                'rejected_quantity' => (string) $rejected,
                'inspection_result' => 'Passed',
                'remarks' => 'Proof checked.',
            ]],
        ];
    }

    public function test_all_passed_without_attachment_still_submits(): void
    {
        $qa = $this->qaUser();
        $receiving = $this->makeReceiving([['product' => 'Passed', 'qty' => 5]]);
        $this->actingAs($qa)->post('/api/qa/inspections/'.$receiving->id, $this->attachmentPayload($receiving, 5, 0))
            ->assertOk()->assertJsonPath('inspection_status', 'Passed')->assertJsonPath('inspection.attachment_path', null);
        $this->assertSame([], Storage::disk('local')->allFiles('qa-attachments'));
    }

    public function test_direct_api_rejection_without_proof_cannot_be_bypassed_with_aggregate(): void
    {
        $qa = $this->qaUser();
        $receiving = $this->makeReceiving([['product' => 'Rejected', 'qty' => 5]]);
        $payload = $this->attachmentPayload($receiving);
        $payload['rejected_qty'] = 0;
        $this->actingAs($qa)->postJson('/api/qa/inspections/'.$receiving->id, $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('attachment')
            ->assertJsonPath('errors.attachment.0', 'Proof of rejection is required. Please upload an attachment.');
        $this->assertDatabaseMissing('qa_inspections', ['receiving_id' => $receiving->id]);
        $this->assertSame('Pending QA', $receiving->fresh()->status);
        $this->assertSame([], Storage::disk('local')->allFiles('qa-attachments'));
    }

    public function test_valid_jpeg_png_pdf_persist_and_are_available_on_fresh_detail_request(): void
    {
        $qa = $this->qaUser();
        foreach (['jpg', 'jpeg', 'png', 'pdf'] as $extension) {
            $receiving = $this->makeReceiving([['product' => 'Proof '.$extension, 'qty' => 5]]);
            $file = $extension === 'pdf' ? $this->proof() : UploadedFile::fake()->image('damage.'.$extension);
            $response = $this->actingAs($qa)->post('/api/qa/inspections/'.$receiving->id,
                [...$this->attachmentPayload($receiving, 0, 5), 'attachment' => $file], ['Accept' => 'application/json']);
            $response->assertOk()->assertJsonPath('inspection_status', 'Rejected')
                ->assertJsonPath('products.0.remarks', 'Proof checked.');
            $path = $response->json('inspection.attachment_path');
            $this->assertMatchesRegularExpression('~^qa-attachments/[A-Za-z0-9]+\.(jpg|jpeg|png|pdf)$~', $path);
            Storage::disk('local')->assertExists($path);
            $this->assertSame($path, $receiving->fresh()->qaInspection->attachment_path);
            $this->getJson('/api/qa/inspections/'.$receiving->id)->assertOk()->assertJsonPath('inspection.attachment_path', $path);
            $this->get('/api/qa/inspections/'.$receiving->id.'/attachment')->assertOk()->assertDownload(basename($path))
                ->assertHeader('X-Content-Type-Options', 'nosniff');
            $this->assertDatabaseMissing('receiving_timelines', ['receiving_id' => $receiving->id, 'status' => 'Ready for Stock In']);
        }
    }

    public function test_invalid_and_oversized_attachments_are_rejected_even_without_rejected_quantity(): void
    {
        $qa = $this->qaUser();
        $files = [
            UploadedFile::fake()->createWithContent('proof.txt', 'not a supported file'),
            UploadedFile::fake()->createWithContent('spoof.jpg', '<?php echo 1;'),
            $this->proof('proof.exe'),
            UploadedFile::fake()->createWithContent('large.pdf', "%PDF-1.4\n".str_repeat('a', 5 * 1024 * 1024)),
        ];
        foreach ($files as $fixture) {
            // Use Symfony's real MIME detection; Laravel fakes infer MIME from the filename.
            $file = new UploadedFile($fixture->getPathname(), $fixture->getClientOriginalName(), null, null, true);
            $receiving = $this->makeReceiving([['product' => 'Invalid proof', 'qty' => 5]]);
            $this->actingAs($qa)->post('/api/qa/inspections/'.$receiving->id,
                [...$this->attachmentPayload($receiving, 5, 0), 'attachment' => $file], ['Accept' => 'application/json'])
                ->assertUnprocessable()->assertJsonValidationErrors('attachment');
            $this->assertDatabaseMissing('qa_inspections', ['receiving_id' => $receiving->id]);
        }
        $this->assertSame([], Storage::disk('local')->allFiles('qa-attachments'));
    }

    public function test_draft_replacement_method_spoofing_and_submission_with_persisted_proof(): void
    {
        $qa = $this->qaUser();
        $receiving = $this->makeReceiving([['product' => 'Draft', 'qty' => 5]]);
        $payload = [...$this->attachmentPayload($receiving), 'submit' => '0'];
        $this->actingAs($qa)->post('/api/qa/inspections/'.$receiving->id, $payload)->assertOk();
        $response = $this->post('/api/qa/inspections/'.$receiving->id, [...$payload, '_method' => 'PUT', 'attachment' => $this->proof()]);
        $response->assertOk();
        $oldPath = $response->json('inspection.attachment_path');
        $response = $this->post('/api/qa/inspections/'.$receiving->id, [...$payload, '_method' => 'PUT', 'attachment' => $this->proof()]);
        $response->assertOk();
        $newPath = $response->json('inspection.attachment_path');
        $this->assertNotSame($oldPath, $newPath);
        Storage::disk('local')->assertMissing($oldPath);
        Storage::disk('local')->assertExists($newPath);
        $this->post('/api/qa/inspections/'.$receiving->id, [...$payload, '_method' => 'PUT', 'submit' => '1'])
            ->assertOk()->assertJsonPath('inspection_status', 'Partial')->assertJsonPath('inspection.attachment_path', $newPath);
    }

    public function test_attachment_download_preserves_qa_authorization(): void
    {
        $qa = $this->qaUser();
        $receiving = $this->makeReceiving([['product' => 'Private proof', 'qty' => 5]]);
        $this->actingAs($qa)->post('/api/qa/inspections/'.$receiving->id,
            [...$this->attachmentPayload($receiving), 'attachment' => $this->proof()])->assertOk();
        $this->actingAs(User::factory()->create())->getJson('/api/qa/inspections/'.$receiving->id.'/attachment')->assertForbidden();
    }

    public function test_exactly_five_megabytes_is_allowed_and_client_path_cannot_replace_proof(): void
    {
        $qa = $this->qaUser();
        $receiving = $this->makeReceiving([['product' => 'Boundary', 'qty' => 5]]);
        $this->actingAs($qa)->postJson('/api/qa/inspections/'.$receiving->id,
            [...$this->attachmentPayload($receiving), 'attachment_path' => 'qa-attachments/forged.pdf'])
            ->assertUnprocessable()->assertJsonValidationErrors('attachment');
        $fixture = UploadedFile::fake()->createWithContent('boundary.pdf', '%PDF-1.4'.str_repeat(' ', 5 * 1024 * 1024 - 8));
        $file = new UploadedFile($fixture->getPathname(), 'boundary.pdf', null, null, true);
        $this->post('/api/qa/inspections/'.$receiving->id,
            [...$this->attachmentPayload($receiving), 'attachment' => $file], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('inspection_status', 'Partial');
    }

    public function test_database_failure_cleans_up_new_upload(): void
    {
        $qa = $this->qaUser();
        $receiving = $this->makeReceiving([['product' => 'Rollback', 'qty' => 5]]);
        QaInspection::updating(function () { throw new \RuntimeException('Simulated database failure'); });
        try {
            $this->actingAs($qa)->post('/api/qa/inspections/'.$receiving->id,
                [...$this->attachmentPayload($receiving), 'attachment' => $this->proof()], ['Accept' => 'application/json'])
                ->assertStatus(500)->assertJsonPath('message', 'Failed to save QA inspection.');
            $this->assertSame([], Storage::disk('local')->allFiles('qa-attachments'));
            $this->assertDatabaseMissing('qa_inspections', ['receiving_id' => $receiving->id]);
        } finally {
            QaInspection::flushEventListeners();
        }
    }
}
