<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\QaInspection;
use App\Models\QaInspectionItem;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierRejectionCase;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SupplierRejectionReplacementTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $qa;
    private User $manager;
    private User $otherManager;
    private Supplier $supplier;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $qaRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $this->admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        $this->qa = User::factory()->create(['role_id' => $qaRole->id, 'status' => 'ACTIVE']);
        $this->manager = User::factory()->create(['role_id' => $managerRole->id, 'status' => 'ACTIVE']);
        $this->otherManager = User::factory()->create(['role_id' => $managerRole->id, 'status' => 'ACTIVE']);
        $this->supplier = Supplier::create(['supplier_code' => 'SUP-016', 'name' => 'joey odon', 'email' => 'joey@example.com', 'status' => 'ACTIVE']);
        $this->product = Product::create(['name' => 'MegaAdd CI', 'unit' => 'pcs', 'cost_price' => 10]);
    }

    private function sentCase(int $delivered = 100, int $accepted = 50, int $rejected = 50, bool $sent = true): SupplierRejectionCase
    {
        $po = PurchaseOrder::create([
            'po_number' => 'PO-2026-0016', 'supplier_id' => $this->supplier->id, 'supplier_name' => 'joey odon',
            'delivery_details' => 'Main warehouse', 'expected_delivery_date' => now()->toDateString(),
            'total_amount' => 1000, 'status' => 'Completed', 'approved_by' => $this->admin->id,
        ]);
        $receiving = Receiving::create([
            'receiving_no' => 'RCV-00016', 'purchase_order_id' => $po->id, 'purchase_order' => $po->po_number,
            'supplier' => 'joey odon', 'delivery_date' => now()->toDateString(), 'status' => 'Partial',
            'assigned_qa_user_id' => $this->qa->id, 'prepared_by_id' => $this->manager->id,
        ]);
        $receivingItem = ReceivingItem::create([
            'receiving_id' => $receiving->id, 'product_id' => $this->product->id, 'product_name' => $this->product->name,
            'ordered_quantity' => $delivered, 'delivered_quantity' => $delivered, 'unit' => 'pcs', 'inspection_status' => 'Partial',
        ]);
        $inspection = QaInspection::create([
            'receiving_id' => $receiving->id, 'status' => 'Partial', 'started_at' => now()->subHour(),
            'completed_at' => now(), 'inspected_by_id' => $this->qa->id, 'submitted_by_id' => $this->qa->id,
        ]);
        $item = QaInspectionItem::create([
            'qa_inspection_id' => $inspection->id, 'receiving_item_id' => $receivingItem->id,
            'accepted_quantity' => $accepted, 'rejected_quantity' => $rejected, 'inspection_result' => 'Partial',
            'remarks' => 'Seal broken.',
        ]);

        return SupplierRejectionCase::create(array_merge(
            ['qa_inspection_item_id' => $item->id],
            $sent ? ['status' => 'SENT', 'sent_at' => now()->subMinutes(5), 'sent_by_id' => $this->admin->id] : [],
        ));
    }

    private function resolve(SupplierRejectionCase $case, array $payload, ?User $user = null)
    {
        return $this->actingAs($user ?? $this->admin)->postJson("/api/admin/rejected-items/{$case->id}/resolve", $payload);
    }

    private function route(SupplierRejectionCase $case): Receiving
    {
        $this->resolve($case, ['resolution_type' => 'REPLACEMENT'])->assertOk();

        return Receiving::query()->where('replacement_for_rejection_case_id', $case->id)->sole();
    }

    private function inspectReplacement(Receiving $replacement, int $delivered, int $accepted, int $rejected)
    {
        $item = $replacement->items()->sole();
        $this->actingAs($this->manager)->post("/api/receivings/{$replacement->id}/confirm-replacement", [
            'delivery_date' => now()->toDateString(),
            'items' => [['receiving_item_id' => $item->id, 'delivered_quantity' => $delivered]],
            'receipts' => [UploadedFile::fake()->image('replacement-receipt.jpg')],
        ], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('status', 'Pending QA');
        $this->actingAs($this->manager)->patchJson("/api/receivings/{$replacement->id}/assign-qa", ['qa_user_id' => $this->qa->id])->assertOk();

        $payload = ['items' => [[
            'receiving_item_id' => $item->id, 'accepted_quantity' => $accepted, 'rejected_quantity' => $rejected,
            'inspection_result' => $rejected > 0 ? 'Partial' : 'Passed', 'remarks' => $rejected > 0 ? 'Still damaged.' : null,
        ]]];
        if ($rejected > 0) $payload['attachments'] = [UploadedFile::fake()->image('damage.png')];

        return $this->actingAs($this->qa)->post("/api/qa/inspections/{$replacement->id}", $payload, ['Accept' => 'application/json']);
    }

    public function test_resolution_is_blocked_before_supplier_report_is_sent(): void
    {
        $case = $this->sentCase(sent: false);
        $this->actingAs($this->admin)->getJson("/api/admin/rejected-items/{$case->id}")->assertOk()
            ->assertJsonPath('data.can_resolve', false)
            ->assertJsonPath('data.resolve_block_reason', 'Send the rejection report to the supplier before resolving this case.');

        foreach ([['resolution_type' => 'REPLACEMENT'], ['resolution_type' => 'NO_REPLACEMENT', 'resolution_notes' => 'Supplier credit']] as $payload) {
            $this->resolve($case, $payload)->assertUnprocessable()
                ->assertJsonPath('message', 'Send the rejection report to the supplier before resolving this case.');
        }
        // A failed first attempt never reached the supplier either.
        $case->update(['status' => 'FAILED', 'last_error' => 'Provider down']);
        $this->resolve($case, ['resolution_type' => 'REPLACEMENT'])->assertUnprocessable();

        $this->assertDatabaseCount('receivings', 1);
        $this->assertSame('FAILED', $case->fresh()->status);
    }

    public function test_sent_case_can_open_resolution(): void
    {
        $case = $this->sentCase();
        $this->actingAs($this->admin)->getJson("/api/admin/rejected-items/{$case->id}")->assertOk()
            ->assertJsonPath('data.can_resolve', true)
            ->assertJsonPath('data.can_route_to_receiving', true)
            ->assertJsonPath('data.can_close', true)
            ->assertJsonPath('data.resolve_block_reason', null);
    }

    public function test_send_to_receiving_creates_one_linked_replacement_for_rejected_quantity_only(): void
    {
        $case = $this->sentCase();
        $original = $case->inspectionItem->inspection->receiving;

        $response = $this->resolve($case, ['resolution_type' => 'REPLACEMENT', 'resolution_notes' => 'Supplier will resend.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'REPLACEMENT_PENDING')
            ->assertJsonPath('data.resolution_type', 'REPLACEMENT')
            ->assertJsonPath('data.resolved_at', null)
            ->assertJsonPath('data.replacement_receiving.expected_quantity', 50);

        $replacement = Receiving::query()->where('replacement_for_rejection_case_id', $case->id)->sole();
        $this->assertSame('RCV-00017', $replacement->receiving_no);
        $this->assertNotSame($original->receiving_no, $replacement->receiving_no);
        $response->assertJsonPath('data.replacement_receiving.number', 'RCV-00017');
        $this->assertSame($original->purchase_order_id, $replacement->purchase_order_id);
        $this->assertSame('PO-2026-0016', $replacement->purchase_order);
        $this->assertSame('joey odon', $replacement->supplier);
        $this->assertSame($this->supplier->id, $replacement->purchaseOrder->supplier_id);
        $this->assertSame(Receiving::STATUS_AWAITING_REPLACEMENT, $replacement->status);
        $this->assertSame($this->manager->id, $replacement->prepared_by_id);
        $this->assertSame($original->id, $replacement->replacementForCase->inspectionItem->inspection->receiving_id);

        $item = $replacement->items()->sole();
        $this->assertSame($this->product->id, $item->product_id);
        $this->assertSame(50, $item->ordered_quantity);
        $this->assertSame(0, $item->delivered_quantity);
        $this->assertNull($item->stocked_in_at);

        $case->refresh();
        $this->assertSame('REPLACEMENT_PENDING', $case->status);
        $this->assertNull($case->resolved_at);
        $this->assertNotNull($case->routed_to_receiving_at);
        $this->assertSame($this->admin->id, $case->routed_by_id);
        $this->assertSame('Supplier will resend.', $case->resolution_notes);
        $this->assertTrue(AuditLog::query()->where('action', 'REJECTED_ITEM_ROUTED_TO_RECEIVING')->exists());
        $this->assertTrue(AuditLog::query()->where('action', 'REPLACEMENT_RECEIVING_CREATED')->exists());
    }

    public function test_retry_does_not_duplicate_replacement_or_notification(): void
    {
        $case = $this->sentCase();
        $this->resolve($case, ['resolution_type' => 'REPLACEMENT'])->assertOk();
        $this->resolve($case, ['resolution_type' => 'REPLACEMENT'])->assertOk()
            ->assertJsonPath('message', 'Replacement receiving RCV-00017 already exists for this case.');

        $this->assertSame(1, Receiving::query()->whereNotNull('replacement_for_rejection_case_id')->count());
        $this->assertSame(1, $this->manager->notifications()->count());
        $this->assertStringContainsString('RCV-00016: 50 pcs MegaAdd CI', $this->manager->notifications()->first()->data['message']);
        $this->assertStringContainsString('RCV-00017', $this->manager->notifications()->first()->data['message']);
        $this->assertSame(0, $this->otherManager->notifications()->count());
        $this->assertSame(0, $this->admin->notifications()->count());
    }

    public function test_creating_replacement_does_not_touch_inventory_or_stock_in(): void
    {
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $warehouse = Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id, 'capacity' => 1000, 'status' => 'Active']);
        $inventory = Inventory::create(['barcode' => 'MEGA-1', 'product_id' => $this->product->id, 'warehouse_id' => $warehouse->id, 'available_stock' => 50, 'reserved_stock' => 0]);
        $case = $this->sentCase();
        $replacement = $this->route($case);

        $this->assertSame(50, (int) $inventory->fresh()->available_stock);
        $this->assertDatabaseCount('inventories', 1);
        $this->assertSame(0, ReceivingItem::query()->whereNotNull('stocked_in_at')->count());
        $this->assertDatabaseMissing('qa_inspections', ['receiving_id' => $replacement->id]);
        $this->actingAs($this->manager)->postJson("/api/stock-in/receivings/{$replacement->id}/stock-in")->assertUnprocessable();
        $this->actingAs($this->manager)->getJson('/api/stock-in/receivings')->assertOk()
            ->assertJsonMissing(['receiving_no' => $replacement->receiving_no]);
    }

    public function test_replacement_awaiting_delivery_cannot_be_assigned_or_inspected(): void
    {
        $replacement = $this->route($this->sentCase());
        $this->actingAs($this->manager)->patchJson("/api/receivings/{$replacement->id}/assign-qa", ['qa_user_id' => $this->qa->id])
            ->assertUnprocessable();
        $replacement->update(['assigned_qa_user_id' => $this->qa->id]);
        $item = $replacement->items()->sole();
        $this->actingAs($this->qa)->postJson("/api/qa/inspections/{$replacement->id}", ['items' => [[
            'receiving_item_id' => $item->id, 'accepted_quantity' => 0, 'rejected_quantity' => 0, 'inspection_result' => 'Passed',
        ]]])->assertUnprocessable();
        $this->actingAs($this->qa)->getJson('/api/qa/inspections')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_confirmation_is_limited_to_expected_quantity_and_happens_once(): void
    {
        $case = $this->sentCase();
        $replacement = $this->route($case);
        $item = $replacement->items()->sole();
        $payload = fn (int $quantity) => ['delivery_date' => now()->toDateString(), 'items' => [['receiving_item_id' => $item->id, 'delivered_quantity' => $quantity]], 'receipts' => [UploadedFile::fake()->image("replacement-{$quantity}.jpg")]];
        $this->actingAs($this->manager)->post("/api/receivings/{$replacement->id}/confirm-replacement", $payload(51), ['Accept' => 'application/json'])->assertUnprocessable();
        $this->actingAs($this->manager)->post("/api/receivings/{$replacement->id}/confirm-replacement", $payload(50), ['Accept' => 'application/json'])->assertOk();
        $this->actingAs($this->manager)->post("/api/receivings/{$replacement->id}/confirm-replacement", $payload(50), ['Accept' => 'application/json'])->assertUnprocessable();
        $this->actingAs($this->qa)->post("/api/receivings/{$replacement->id}/confirm-replacement", $payload(50), ['Accept' => 'application/json'])->assertForbidden();
        $original = $case->inspectionItem->inspection->receiving;
        $this->actingAs($this->manager)->post("/api/receivings/{$original->id}/confirm-replacement", $payload(1), ['Accept' => 'application/json'])->assertUnprocessable();
    }

    public function test_replacement_appears_in_plant_manager_receiving_with_traceability(): void
    {
        $case = $this->sentCase();
        $replacement = $this->route($case);
        $response = $this->actingAs($this->manager)->getJson('/api/receivings')->assertOk();
        $row = collect($response->json('data'))->firstWhere('id', $replacement->id);
        $this->assertTrue($row['is_replacement']);
        $this->assertSame('PO-2026-0016', $row['purchase_order']);
        $this->assertSame('joey odon', $row['supplier']);
        $this->assertSame('MegaAdd CI', $row['product_summary']);
        $this->assertSame(sprintf('RJ-%06d', $case->id), $row['replacement']['rejection_reference']);
        $this->assertSame('RCV-00016', $row['replacement']['original_receiving_no']);
        $this->assertSame(50, $row['replacement']['expected_quantity']);
        $this->assertTrue($row['replacement']['awaiting_delivery']);
        $this->assertFalse(collect($response->json('data'))->firstWhere('receiving_no', 'RCV-00016')['is_replacement']);
    }

    public function test_replacement_access_follows_existing_receiving_role_scope(): void
    {
        $case = $this->sentCase();
        $this->getJson('/api/receivings')->assertUnauthorized();
        $this->postJson("/api/receivings/{$case->id}/confirm-replacement", [])->assertUnauthorized();
        $replacement = $this->route($case);
        $this->actingAs($this->qa)->getJson("/api/receivings/{$replacement->id}")->assertForbidden();
        $this->actingAs($this->admin)->getJson('/api/receivings')->assertForbidden();
        // Receiving is a shared single-warehouse Plant Manager queue; ownership is shown via prepared_by.
        $this->actingAs($this->manager)->getJson("/api/receivings/{$replacement->id}")->assertOk()
            ->assertJsonPath('prepared_by', $this->manager->name);
    }

    public function test_close_case_requires_notes_resolves_and_creates_no_receiving(): void
    {
        $case = $this->sentCase();
        $this->resolve($case, ['resolution_type' => 'NO_REPLACEMENT'])->assertUnprocessable()->assertJsonValidationErrors('resolution_notes');
        $this->resolve($case, ['resolution_type' => 'NO_REPLACEMENT', 'resolution_notes' => '  '])->assertUnprocessable();
        $this->resolve($case, ['resolution_type' => 'DELETE', 'resolution_notes' => 'Remove it'])->assertUnprocessable()->assertJsonValidationErrors('resolution_type');
        $this->resolve($case, ['resolution_type' => 'NO_REPLACEMENT', 'resolution_notes' => 'Supplier issued credit.'])->assertOk()
            ->assertJsonPath('data.status', 'RESOLVED')
            ->assertJsonPath('data.resolution_type', 'NO_REPLACEMENT')
            ->assertJsonPath('data.resolution_notes', 'Supplier issued credit.')
            ->assertJsonPath('data.replacement_receiving', null);

        $case->refresh();
        $this->assertNotNull($case->resolved_at);
        $this->assertSame($this->admin->id, $case->resolved_by_id);
        $this->assertDatabaseCount('receivings', 1);
        $this->assertDatabaseHas('supplier_rejection_cases', ['id' => $case->id]);
        $this->assertTrue(AuditLog::query()->where('action', 'REJECTED_ITEM_CLOSED')->exists());
        $this->resolve($case, ['resolution_type' => 'REPLACEMENT'])->assertUnprocessable();
    }

    public function test_non_admins_cannot_resolve_and_guest_is_unauthorized(): void
    {
        $case = $this->sentCase();
        $payload = ['resolution_type' => 'REPLACEMENT'];
        $this->postJson("/api/admin/rejected-items/{$case->id}/resolve", $payload)->assertUnauthorized();
        $this->resolve($case, $payload, $this->qa)->assertForbidden();
        $this->resolve($case, $payload, $this->manager)->assertForbidden();
        $this->assertDatabaseCount('receivings', 1);
        $this->assertSame('SENT', $case->fresh()->status);
    }

    public function test_pending_replacement_cannot_be_resent_or_closed_before_its_inspection(): void
    {
        $case = $this->sentCase();
        $this->route($case);
        $this->actingAs($this->admin)->postJson("/api/admin/rejected-items/{$case->id}/send")->assertUnprocessable();
        $this->resolve($case, ['resolution_type' => 'NO_REPLACEMENT', 'resolution_notes' => 'Changed my mind'])->assertUnprocessable();
        $this->assertSame('REPLACEMENT_PENDING', $case->fresh()->status);
    }

    public function test_replacement_qa_pass_resolves_original_case(): void
    {
        $case = $this->sentCase();
        $replacement = $this->route($case);
        $this->inspectReplacement($replacement, 50, 50, 0)->assertOk();

        $case->refresh();
        $this->assertSame('RESOLVED', $case->status);
        $this->assertSame('REPLACEMENT_RECEIVED', $case->resolution_type);
        $this->assertNotNull($case->resolved_at);
        $this->assertSame('Passed', $replacement->fresh()->status);
        $this->assertTrue(AuditLog::query()->where('action', 'REPLACEMENT_COMPLETED')->exists());
        $this->assertSame(1, SupplierRejectionCase::query()->count());
    }

    public function test_replacement_rejected_again_keeps_original_pending_and_opens_traceable_new_case(): void
    {
        $case = $this->sentCase();
        $replacement = $this->route($case);
        $this->inspectReplacement($replacement, 50, 40, 10)->assertOk();

        $case->refresh();
        $this->assertSame('REPLACEMENT_PENDING', $case->status);
        $this->assertNull($case->resolved_at);
        $newCase = SupplierRejectionCase::query()->whereKeyNot($case->id)->sole();
        $this->assertSame('PENDING_REVIEW', $newCase->status);
        $this->actingAs($this->admin)->getJson("/api/admin/rejected-items/{$newCase->id}")->assertOk()
            ->assertJsonPath('data.receiving.number', $replacement->receiving_no)
            ->assertJsonPath('data.receiving.replacement_for_reference', sprintf('RJ-%06d', $case->id))
            ->assertJsonPath('data.rejected_quantity', 10);
        // The new case is not auto-routed; it waits for its own supplier report.
        $this->assertSame(1, Receiving::query()->whereNotNull('replacement_for_rejection_case_id')->count());

        // After the replacement was inspected the Admin may close the original explicitly.
        $this->resolve($case, ['resolution_type' => 'NO_REPLACEMENT', 'resolution_notes' => 'Remaining shortage tracked on new case.'])
            ->assertOk()->assertJsonPath('data.status', 'RESOLVED');
    }

    public function test_short_replacement_delivery_does_not_auto_resolve(): void
    {
        $case = $this->sentCase();
        $replacement = $this->route($case);
        $this->inspectReplacement($replacement, 30, 30, 0)->assertOk();
        $this->assertSame('REPLACEMENT_PENDING', $case->fresh()->status);
    }

    public function test_replacement_quantities_do_not_consume_normal_po_balance(): void
    {
        $case = $this->sentCase();
        $po = PurchaseOrder::query()->sole();
        $po->update(['status' => 'Sent to Supplier']);
        $poItem = $po->items()->create(['product_name' => 'MegaAdd CI', 'ordered_quantity' => 200, 'unit_price' => 10, 'total_price' => 2000]);
        $replacement = $this->route($case);
        $replacement->items()->sole()->update(['delivered_quantity' => 50]);

        // 100 were delivered on the original receiving; the replacement must not reduce the 100 still open.
        $this->actingAs($this->manager)->post('/api/receivings', [
            'purchase_order_id' => $po->id, 'delivery_date' => now()->toDateString(),
            'items' => [['purchase_order_item_id' => $poItem->id, 'delivered_quantity' => 100]],
            'receipts' => [UploadedFile::fake()->image('balance-receipt.jpg')],
        ], ['Accept' => 'application/json'])->assertCreated();
    }
}
