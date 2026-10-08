<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ReceivingReceiptAttachmentTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private PurchaseOrder $order;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        $this->manager = User::factory()->create(['role_id' => $managerRole->id, 'status' => 'ACTIVE']);
        $product = Product::create(['name' => 'Receipt Product', 'unit' => 'pcs', 'cost_price' => 50]);
        $this->order = PurchaseOrder::create([
            'po_number' => 'PO-RECEIPT-1', 'supplier_name' => 'Receipt Supplier',
            'delivery_details' => 'Main warehouse', 'expected_delivery_date' => '2026-10-04', 'total_amount' => 500,
            'status' => 'Sent to Supplier', 'approved_by' => $admin->id,
        ]);
        $this->order->items()->create([
            'product_name' => $product->name, 'ordered_quantity' => 10,
            'unit_price' => 50, 'total_price' => 500,
        ]);
    }

    private function payload(int $quantity = 10): array
    {
        return [
            'purchase_order_id' => $this->order->id,
            'delivery_date' => '2026-10-04',
            'items' => [[
                'purchase_order_item_id' => $this->order->items()->sole()->id,
                'delivered_quantity' => $quantity,
            ]],
        ];
    }

    private function receipt(string $name, string $content): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, "%PDF-1.4\n{$content}\n%%EOF");
    }

    public function test_final_receiving_requires_one_supplier_receipt(): void
    {
        $this->actingAs($this->manager)->postJson('/api/receivings', $this->payload())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('receipts');

        $this->assertDatabaseCount('receivings', 0);
    }

    public function test_receipt_is_private_and_short_quantity_remains_a_receiving_discrepancy(): void
    {
        $response = $this->actingAs($this->manager)->post('/api/receivings', [
            ...$this->payload(9),
            'receipts' => [UploadedFile::fake()->image('receipt-one.jpg')],
        ], ['Accept' => 'application/json'])->assertCreated()
            ->assertJsonPath('status', 'Pending QA')
            ->assertJsonPath('short_quantity', 1)
            ->assertJsonCount(1, 'receipt_attachments')
            ->assertJsonPath('receipt_attachments.0.original_name', 'receipt-one.jpg');

        $attachment = $response->json('receipt_attachments.0');
        $record = $this->order->receivings()->sole()->receiptAttachments()->sole();
        Storage::disk('local')->assertExists($record->stored_path);
        $this->assertMatchesRegularExpression('~^receiving-receipts/\d+/[A-Za-z0-9]+\.jpg$~', $record->stored_path);
        $this->assertDatabaseHas('receiving_discrepancies', [
            'receiving_id' => $response->json('id'), 'short_quantity' => 1,
        ]);
        $this->assertDatabaseCount('supplier_rejection_cases', 0);
        $this->assertDatabaseCount('qa_inspections', 0);
        $this->assertDatabaseCount('inventories', 0);

        $url = '/api'.$attachment['view_url'];
        $this->get($url)->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->app['auth']->forgetGuards();
        $this->getJson($url)->assertUnauthorized();
    }

    public function test_receipt_count_type_size_and_role_are_enforced(): void
    {
        $four = collect(range(1, 4))->map(fn (int $index) => UploadedFile::fake()->image("receipt-{$index}.png"))->all();
        $this->actingAs($this->manager)->post('/api/receivings', [...$this->payload(), 'receipts' => $four], ['Accept' => 'application/json'])
            ->assertUnprocessable()->assertJsonValidationErrors('receipts');

        $this->actingAs($this->manager)->post('/api/receivings', [
            ...$this->payload(), 'receipts' => [UploadedFile::fake()->createWithContent('receipt.exe', '<?php echo 1;')],
        ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('receipts.0');

        $this->actingAs($this->manager)->post('/api/receivings', [
            ...$this->payload(), 'receipts' => [UploadedFile::fake()->create('oversized.pdf', 5121, 'application/pdf')],
        ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('receipts.0');

        $ordinaryUser = User::factory()->create(['status' => 'ACTIVE']);
        $this->actingAs($ordinaryUser)->post('/api/receivings', [
            ...$this->payload(), 'receipts' => [UploadedFile::fake()->image('receipt.jpg')],
        ], ['Accept' => 'application/json'])->assertForbidden();
    }

    public function test_duplicate_receipts_in_same_create_request_are_rejected_when_renamed(): void
    {
        $bytes = 'same supplier receipt bytes';

        $this->actingAs($this->manager)->post('/api/receivings', [
            ...$this->payload(),
            'receipts' => [
                $this->receipt('receipt.pdf', $bytes),
                $this->receipt('delivery-copy.pdf', $bytes),
            ],
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('receipts')
            ->assertJsonPath('errors.receipts.0', 'Duplicate file detected. This exact receipt has already been added.');

        $this->assertDatabaseCount('receivings', 0);
        $this->assertDatabaseCount('receiving_receipt_attachments', 0);
        $this->assertSame([], Storage::disk('local')->allFiles('receiving-receipts'));
    }

    public function test_same_receipt_name_with_different_content_is_allowed(): void
    {
        $response = $this->actingAs($this->manager)->post('/api/receivings', [
            ...$this->payload(),
            'receipts' => [
                $this->receipt('receipt.pdf', 'first receipt content'),
                $this->receipt('receipt.pdf', 'second receipt content'),
            ],
        ], ['Accept' => 'application/json'])->assertCreated()->assertJsonCount(2, 'receipt_attachments');

        $receiving = $this->order->receivings()->findOrFail($response->json('id'));
        $this->assertSame(2, $receiving->receiptAttachments()->distinct('file_sha256')->count('file_sha256'));
    }

    public function test_same_exact_receipt_is_allowed_for_different_receivings(): void
    {
        $secondOrder = $this->order->replicate();
        $secondOrder->po_number = 'PO-RECEIPT-2';
        $secondOrder->save();
        $secondOrder->items()->create([
            'product_name' => 'Receipt Product', 'ordered_quantity' => 10,
            'unit_price' => 50, 'total_price' => 500,
        ]);
        $bytes = 'shared legitimate supplier receipt';

        foreach ([[$this->order, 'receipt.pdf'], [$secondOrder, 'renamed-receipt.pdf']] as [$order, $name]) {
            $this->order = $order;
            $this->actingAs($this->manager)->post('/api/receivings', [
                ...$this->payload(),
                'receipts' => [$this->receipt($name, $bytes)],
            ], ['Accept' => 'application/json'])->assertCreated();
        }

        $this->assertDatabaseCount('receiving_receipt_attachments', 2);
    }
}
