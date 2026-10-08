<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\ReplenishmentRequest;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use App\Notifications\WorkflowNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ReceivingPurchaseOrderTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $plantManager;
    private PurchaseOrder $purchaseOrder;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->admin = $this->user('ADMIN');
        $this->plantManager = $this->user('PLANT_MANAGER');
        Product::create(['name' => 'IPAD AIR', 'unit' => 'pcs', 'cost_price' => 100]);
        $this->purchaseOrder = PurchaseOrder::create([
            'po_number' => 'PO-2026-0001', 'supplier_name' => 'Approved Supplier',
            'delivery_details' => 'Main warehouse', 'expected_delivery_date' => '2026-09-01',
            'total_amount' => 1000, 'status' => 'Approved', 'approved_by' => $this->admin->id,
        ]);
        $this->purchaseOrder->items()->create([
            'product_name' => 'IPAD AIR', 'ordered_quantity' => 10,
            'unit_price' => 100, 'total_price' => 1000,
        ]);
    }

    private function receipt(string $name = 'supplier-receipt.pdf'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, "%PDF-1.4\n%%EOF\n");
    }

    private function user(string $slug): User
    {
        $role = Role::firstOrCreate(['slug' => $slug], ['name' => str_replace('_', ' ', $slug)]);
        return User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
    }

    public function test_plant_manager_can_fetch_approved_purchase_orders_with_remaining_items(): void
    {
        $this->actingAs($this->plantManager)->getJson('/api/purchase-orders/approved')
            ->assertOk()->assertJsonPath('data.0.po_number', 'PO-2026-0001')
            ->assertJsonPath('data.0.supplier_name', 'Approved Supplier')
            ->assertJsonPath('data.0.items.0.product_name', 'IPAD AIR')
            ->assertJsonPath('data.0.items.0.ordered_quantity', 10)
            ->assertJsonPath('data.0.items.0.unit', 'pcs')
            ->assertJsonPath('data.0.items.0.remaining_quantity', 10);
    }

    public function test_receiving_data_is_mapped_from_the_purchase_order_and_completion_updates_status(): void
    {
        Notification::fake();
        $branch = Branch::create(['name' => 'Receiving Branch', 'code' => 'RECV']);
        $warehouse = Warehouse::create(['name' => 'Receiving Warehouse', 'code' => 'RECV-WH', 'branch_id' => $branch->id]);
        $product = Product::query()->where('name', 'IPAD AIR')->firstOrFail();
        $replenishmentRequest = ReplenishmentRequest::create([
            'request_no' => 'RR-RECEIVING-COMPLETE',
            'requested_by' => $this->plantManager->id,
            'warehouse_id' => $warehouse->id,
            'product_id' => $product->id,
            'requested_qty' => 10,
            'priority' => 'Critical',
            'status' => ReplenishmentRequest::STATUS_PO_CREATED,
            'submitted_at' => now(),
        ]);
        $this->purchaseOrder->update(['replenishment_request_id' => $replenishmentRequest->id]);
        $qa = $this->user('QA_SUPERVISOR');
        $inactiveQa = $this->user('QA_SUPERVISOR');
        $inactiveQa->update(['status' => 'SUSPENDED']);
        $item = $this->purchaseOrder->items()->firstOrFail();
        $response = $this->actingAs($this->plantManager)->post('/api/receivings', [
            'purchase_order_id' => $this->purchaseOrder->id,
            'reference_no' => 'DEL-1', 'delivery_date' => '2026-09-01',
            'items' => [['purchase_order_item_id' => $item->id, 'delivered_quantity' => 10]],
            'receipts' => [$this->receipt()],
        ], ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('purchase_order', 'PO-2026-0001')
            ->assertJsonPath('supplier', 'Approved Supplier')->assertJsonPath('items.0.product_name', 'IPAD AIR')
            ->assertJsonPath('items.0.ordered_quantity', 10)->assertJsonPath('items.0.delivered_quantity', 10)
            ->assertJsonPath('items.0.unit', 'pcs')->assertJsonPath('status', 'Pending QA');

        $this->assertDatabaseHas('receivings', ['id' => $response->json('id'), 'purchase_order_id' => $this->purchaseOrder->id]);
        $this->assertDatabaseHas('purchase_orders', ['id' => $this->purchaseOrder->id, 'status' => 'Completed']);
        $this->assertDatabaseHas('replenishment_requests', [
            'id' => $replenishmentRequest->id,
            'status' => ReplenishmentRequest::STATUS_COMPLETED,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'REPLENISHMENT_REQUEST_COMPLETED',
            'resource_id' => (string) $replenishmentRequest->id,
        ]);
        $receivingNumber = $response->json('receiving_no');
        Notification::assertNothingSent();
        $this->patchJson("/api/receivings/{$response->json('id')}/assign-qa", ['qa_user_id' => $qa->id])->assertOk();
        Notification::assertSentTo($qa, WorkflowNotification::class, fn ($notification) =>
            $notification->title === 'QA Inspection Assigned'
            && $notification->message === "Receiving #{$receivingNumber} was assigned to you."
            && $notification->type === 'info'
            && $notification->referenceId === $receivingNumber);
        Notification::assertNotSentTo($inactiveQa, WorkflowNotification::class);
    }

    public function test_receiving_rejects_items_from_another_po_and_over_delivery(): void
    {
        $item = $this->purchaseOrder->items()->firstOrFail();
        $payload = ['purchase_order_id' => $this->purchaseOrder->id, 'delivery_date' => '2026-09-01',
            'items' => [['purchase_order_item_id' => $item->id, 'delivered_quantity' => 11]], 'receipts' => [$this->receipt()]];
        $this->actingAs($this->plantManager)->post('/api/receivings', $payload, ['Accept' => 'application/json'])->assertUnprocessable();
        $this->assertDatabaseCount('receivings', 0);
    }

    public function test_receiving_dropdown_excludes_completed_and_cancelled_purchase_orders(): void
    {
        $cancelled = PurchaseOrder::create([
            'po_number' => 'PO-2026-CANCELLED', 'supplier_name' => 'Approved Supplier',
            'delivery_details' => 'Main warehouse', 'expected_delivery_date' => '2026-09-01',
            'total_amount' => 100, 'status' => PurchaseOrder::STATUS_CANCELLED, 'approved_by' => $this->admin->id,
        ]);
        $completed = PurchaseOrder::create([
            'po_number' => 'PO-2026-COMPLETED', 'supplier_name' => 'Approved Supplier',
            'delivery_details' => 'Main warehouse', 'expected_delivery_date' => '2026-09-01',
            'total_amount' => 100, 'status' => PurchaseOrder::STATUS_COMPLETED, 'approved_by' => $this->admin->id,
        ]);

        $rows = collect($this->actingAs($this->plantManager)
            ->getJson('/api/purchase-orders/approved')
            ->assertOk()
            ->json('data'));

        $this->assertTrue($rows->contains('id', $this->purchaseOrder->id));
        $this->assertFalse($rows->contains('id', $cancelled->id));
        $this->assertFalse($rows->contains('id', $completed->id));
    }

    public function test_receiving_preserves_null_when_no_legitimate_unit_exists(): void
    {
        $product = Product::create(['name' => 'TOMAHAWK EC', 'category' => 'WOOD PRESERVATIVE PRODUCTS']);
        $order = PurchaseOrder::create([
            'po_number' => 'PO-2026-NULL-UNIT', 'supplier_name' => 'Approved Supplier',
            'delivery_details' => 'Main warehouse', 'expected_delivery_date' => '2026-09-01',
            'total_amount' => 2000, 'status' => 'Approved', 'approved_by' => $this->admin->id,
        ]);
        $item = $order->items()->create([
            'product_name' => $product->name, 'ordered_quantity' => 20,
            'unit_price' => 100, 'total_price' => 2000,
        ]);

        $approved = $this->actingAs($this->plantManager)->getJson('/api/purchase-orders/approved')
            ->assertOk()->json('data');
        $approvedOrder = collect($approved)->firstWhere('id', $order->id);
        $this->assertNotNull($approvedOrder);
        $this->assertNull($approvedOrder['items'][0]['unit']);

        $response = $this->post('/api/receivings', [
            'purchase_order_id' => $order->id, 'reference_no' => 'RTX-12345',
            'delivery_date' => '2026-09-07',
            'items' => [['purchase_order_item_id' => $item->id, 'delivered_quantity' => 20]],
            'receipts' => [$this->receipt('null-unit.pdf')],
        ], ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('status', 'Pending QA')
            ->assertJsonPath('items.0.product_name', 'TOMAHAWK EC')
            ->assertJsonPath('items.0.delivered_quantity', 20)
            ->assertJsonPath('items.0.unit', null);

        $this->assertDatabaseHas('receiving_items', [
            'receiving_id' => $response->json('id'), 'product_id' => $product->id,
            'product_name' => 'TOMAHAWK EC', 'unit' => null, 'inspection_status' => 'Pending QA',
        ]);
        $this->assertDatabaseCount('inventories', 0);
        $this->assertDatabaseCount('qa_inspections', 0);
    }

    public function test_receiving_failure_rolls_back_header_and_items(): void
    {
        Notification::fake();
        Product::query()->where('name', 'IPAD AIR')->delete();
        $item = $this->purchaseOrder->items()->firstOrFail();

        $this->actingAs($this->plantManager)->post('/api/receivings', [
            'purchase_order_id' => $this->purchaseOrder->id, 'delivery_date' => '2026-09-01',
            'items' => [['purchase_order_item_id' => $item->id, 'delivered_quantity' => 10]],
            'receipts' => [$this->receipt('rollback.pdf')],
        ], ['Accept' => 'application/json'])->assertNotFound();

        $this->assertDatabaseCount('receivings', 0);
        $this->assertDatabaseCount('receiving_items', 0);
        $this->assertDatabaseHas('purchase_orders', ['id' => $this->purchaseOrder->id, 'status' => 'Approved']);
        Notification::assertNothingSent();
    }
}
