<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Order;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class StockOutManagementTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private User $otherManager;
    private User $admin;
    private Warehouse $warehouse;
    private Warehouse $otherWarehouse;
    private Product $product;
    private Product $otherProduct;

    protected function setUp(): void
    {
        parent::setUp();
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $this->warehouse = Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id]);
        $this->otherWarehouse = Warehouse::create(['name' => 'Other Warehouse', 'code' => 'WH-OTHER', 'branch_id' => $branch->id]);
        $plantRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->manager = User::factory()->create(['role_id' => $plantRole->id, 'warehouse_id' => $this->warehouse->id, 'status' => 'ACTIVE']);
        $this->otherManager = User::factory()->create(['role_id' => $plantRole->id, 'warehouse_id' => $this->otherWarehouse->id, 'status' => 'ACTIVE']);
        $this->admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        $this->product = Product::create(['name' => 'Steel Pipe', 'unit' => 'pcs', 'cost_price' => 50]);
        $this->otherProduct = Product::create(['name' => 'Safety Helmet', 'unit' => 'pcs', 'cost_price' => 20]);
    }

    private function order(string $status = 'READY_FOR_STOCK_OUT', ?User $manager = null, int $quantity = 3): Order
    {
        $manager ??= $this->manager;
        $order = Order::create([
            'order_no' => 'SO-'.Str::upper(Str::random(8)),
            'customer_name' => 'BuildRight Corp.',
            'customer_address' => 'Makati City',
            'order_date' => now(),
            'required_delivery_date' => now()->addDays(2),
            'total_amount' => $quantity * 100,
            'status' => $status,
            'assigned_to' => $manager->id,
            'assigned_at' => now(),
        ]);
        $order->items()->create([
            'product_id' => $this->product->id,
            'product_name' => $this->product->name,
            'quantity' => $quantity,
            'unit' => 'pcs',
            'unit_price' => 100,
            'subtotal' => $quantity * 100,
        ]);
        return $order;
    }

    private function inventory(Product $product, Warehouse $warehouse, string $barcode, int $quantity): Inventory
    {
        return Inventory::create([
            'barcode' => $barcode,
            'product_id' => $product->id,
            'warehouse_id' => $warehouse->id,
            'available_stock' => $quantity,
            'reserved_stock' => 0,
            'backload' => 0,
            'status' => 'Available',
            'pending_receiving' => false,
        ]);
    }

    private function scan(Order $order, string $barcode, int $quantity = 1, ?string $key = null)
    {
        return $this->actingAs($this->manager)->postJson("/api/stock-out/orders/{$order->id}/release", [
            'barcode' => $barcode,
            'quantity' => $quantity,
            'idempotency_key' => $key ?? (string) Str::uuid(),
        ]);
    }

    public function test_only_ready_assigned_order_can_start_stock_out(): void
    {
        $ready = $this->order();
        $this->inventory($this->product, $this->warehouse, 'start-ready', 3);
        $this->actingAs($this->manager)->postJson("/api/stock-out/orders/{$ready->id}/start")
            ->assertOk()->assertJsonPath('status', 'STOCK_OUT_IN_PROGRESS');
        $this->assertDatabaseHas('order_status_histories', ['order_id' => $ready->id, 'action' => 'STOCK_OUT_STARTED']);

        foreach (['ASSIGNED', 'PREPARING', 'CANCELLED'] as $status) {
            $order = $this->order($status);
            $this->actingAs($this->manager)->postJson("/api/stock-out/orders/{$order->id}/start")->assertNotFound();
        }

        $other = $this->order('READY_FOR_STOCK_OUT', $this->otherManager);
        $this->actingAs($this->manager)->postJson("/api/stock-out/orders/{$other->id}/start")->assertNotFound();
    }

    public function test_manager_can_load_own_order_but_not_another_managers_order(): void
    {
        $mine = $this->order();
        $other = $this->order('READY_FOR_STOCK_OUT', $this->otherManager);

        $this->actingAs($this->manager)->getJson("/api/stock-out/orders/{$mine->id}")
            ->assertOk()->assertJsonPath('id', $mine->id);
        $this->actingAs($this->manager)->getJson("/api/stock-out/orders/{$other->id}")->assertNotFound();
    }

    public function test_barcode_releases_order_item_when_product_id_is_missing(): void
    {
        $order = $this->order('READY_FOR_STOCK_OUT', quantity: 1);
        $item = $order->items()->firstOrFail();
        $item->update(['product_id' => null]);
        $inventory = $this->inventory($this->product, $this->warehouse, 'barcode-first', 2);

        $this->actingAs($this->manager)->postJson("/api/stock-out/orders/{$order->id}/release", [
            'barcode' => $inventory->barcode,
        ])->assertOk()->assertJsonPath('released_quantity', 1)->assertJsonPath('order_status', 'READY_FOR_SHIPMENT');

        $this->assertDatabaseHas('inventories', ['id' => $inventory->id, 'available_stock' => 1]);
        $this->assertDatabaseHas('stock_out_transactions', ['order_item_id' => $item->id, 'inventory_id' => $inventory->id]);
    }

    public function test_start_rejects_missing_warehouse_inventory_with_structured_item_error(): void
    {
        $order = $this->order();

        $this->actingAs($this->manager)->postJson("/api/stock-out/orders/{$order->id}/start")
            ->assertUnprocessable()
            ->assertJsonPath('message', 'This order cannot start Stock Out.')
            ->assertJsonPath('errors.0.order_item_id', $order->items()->firstOrFail()->id)
            ->assertJsonPath('errors.0.reason', 'No inventory exists for this product in the assigned warehouse.');
    }

    public function test_scan_endpoint_uses_the_same_automatic_release_logic(): void
    {
        $order = $this->order('STOCK_OUT_IN_PROGRESS');
        $inventory = $this->inventory($this->product, $this->warehouse, 'validate-only', 5);

        $this->actingAs($this->manager)->postJson("/api/stock-out/orders/{$order->id}/scan", ['barcode' => $inventory->barcode])
            ->assertOk()->assertJsonPath('quantity_released', 1)
            ->assertJsonPath('inventory_id', $inventory->id)
            ->assertJsonPath('order_item.id', $order->items()->firstOrFail()->id);

        $this->assertDatabaseHas('inventories', ['id' => $inventory->id, 'available_stock' => 4]);
        $this->assertDatabaseCount('stock_out_transactions', 1);
    }

    public function test_database_rejects_order_item_referencing_non_existing_product(): void
    {
        $order = $this->order();
        $item = $order->items()->firstOrFail();

        $this->expectException(QueryException::class);
        $item->update(['product_id' => 999999]);
    }

    public function test_valid_barcode_scan_releases_one_unit_and_creates_audit(): void
    {
        $order = $this->order('STOCK_OUT_IN_PROGRESS', quantity: 3);
        $inventory = $this->inventory($this->product, $this->warehouse, '2000000000001', 10);

        $this->scan($order, $inventory->barcode)->assertOk()
            ->assertJsonPath('released_quantity', 1)
            ->assertJsonPath('remaining_quantity', 2)
            ->assertJsonPath('inventory_remaining_quantity', 9)
            ->assertJsonPath('order_status', 'STOCK_OUT_IN_PROGRESS');

        $this->assertDatabaseHas('inventories', ['id' => $inventory->id, 'available_stock' => 9]);
        $this->assertDatabaseHas('stock_out_transactions', [
            'order_id' => $order->id,
            'order_item_id' => $order->items()->firstOrFail()->id,
            'inventory_id' => $inventory->id,
            'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'performed_by' => $this->manager->id,
            'quantity' => 1,
            'barcode' => $inventory->barcode,
        ]);
    }

    public function test_unknown_wrong_product_and_wrong_warehouse_barcodes_do_not_deduct(): void
    {
        $order = $this->order('STOCK_OUT_IN_PROGRESS');
        $wrongProduct = $this->inventory($this->otherProduct, $this->warehouse, '2000000000002', 5);
        $wrongWarehouse = $this->inventory($this->product, $this->otherWarehouse, '2000000000003', 5);

        $this->scan($order, '9999999999999')->assertUnprocessable()->assertJsonValidationErrors('barcode');
        $this->scan($order, $wrongProduct->barcode)->assertUnprocessable()->assertJsonValidationErrors('barcode');
        $this->scan($order, $wrongWarehouse->barcode)->assertUnprocessable()->assertJsonValidationErrors('barcode');
        $this->assertDatabaseHas('inventories', ['id' => $wrongProduct->id, 'available_stock' => 5]);
        $this->assertDatabaseHas('inventories', ['id' => $wrongWarehouse->id, 'available_stock' => 5]);
        $this->assertDatabaseCount('stock_out_transactions', 0);
    }

    public function test_camera_style_scan_without_quantity_releases_exactly_one_unit(): void
    {
        $order = $this->order('STOCK_OUT_IN_PROGRESS', quantity: 2);
        $inventory = $this->inventory($this->product, $this->warehouse, '2000000000004', 2);

        $this->actingAs($this->manager)->postJson("/api/stock-out/orders/{$order->id}/release", [
            'barcode' => $inventory->barcode,
        ])->assertOk()->assertJsonPath('quantity_released', 1);
        $this->assertDatabaseHas('inventories', ['id' => $inventory->id, 'available_stock' => 1]);
        $this->assertDatabaseCount('stock_out_transactions', 1);
    }

    public function test_manual_release_accepts_a_positive_whole_number_quantity_as_one_transaction(): void
    {
        $order = $this->order('STOCK_OUT_IN_PROGRESS', quantity: 20);
        $inventory = $this->inventory($this->product, $this->warehouse, 'manual-bulk', 25);

        $this->scan($order, $inventory->barcode, 20)->assertOk()
            ->assertJsonPath('quantity_released', 20)
            ->assertJsonPath('inventory_remaining_quantity', 5)
            ->assertJsonPath('order_status', 'READY_FOR_SHIPMENT');

        $this->assertDatabaseHas('stock_out_transactions', [
            'order_id' => $order->id,
            'barcode' => $inventory->barcode,
            'quantity' => 20,
        ]);
        $this->assertDatabaseCount('stock_out_transactions', 1);
    }

    public function test_manual_release_rejects_invalid_quantities(): void
    {
        $order = $this->order('STOCK_OUT_IN_PROGRESS', quantity: 3);
        $inventory = $this->inventory($this->product, $this->warehouse, 'manual-invalid', 3);

        foreach ([0, -5, 1.5, '', null, 'invalid'] as $quantity) {
            $this->actingAs($this->manager)->postJson("/api/stock-out/orders/{$order->id}/release", [
                'barcode' => $inventory->barcode,
                'quantity' => $quantity,
            ])->assertUnprocessable()->assertJsonValidationErrors('quantity');
        }

        $this->assertDatabaseHas('inventories', ['id' => $inventory->id, 'available_stock' => 3]);
        $this->assertDatabaseCount('stock_out_transactions', 0);
    }

    public function test_idempotent_retry_does_not_double_deduct(): void
    {
        $order = $this->order('STOCK_OUT_IN_PROGRESS', quantity: 3);
        $inventory = $this->inventory($this->product, $this->warehouse, '2000000000005', 5);
        $key = (string) Str::uuid();

        $this->scan($order, $inventory->barcode, 1, $key)->assertOk()->assertJsonPath('duplicate', false);
        $this->scan($order, $inventory->barcode, 1, $key)->assertOk()->assertJsonPath('duplicate', true);

        $this->assertDatabaseHas('inventories', ['id' => $inventory->id, 'available_stock' => 4]);
        $this->assertDatabaseCount('stock_out_transactions', 1);
    }

    public function test_all_order_items_must_complete_before_stock_out_completes(): void
    {
        $order = $this->order('STOCK_OUT_IN_PROGRESS', quantity: 2);
        $order->items()->create([
            'product_id' => $this->otherProduct->id,
            'product_name' => $this->otherProduct->name,
            'quantity' => 1,
            'unit' => 'pcs',
            'unit_price' => 20,
            'subtotal' => 20,
        ]);
        $first = $this->inventory($this->product, $this->warehouse, '2000000000006', 2);
        $second = $this->inventory($this->otherProduct, $this->warehouse, '2000000000007', 1);

        $this->scan($order, $first->barcode)->assertOk()->assertJsonPath('order_status', 'STOCK_OUT_IN_PROGRESS');
        $this->scan($order, $first->barcode)->assertOk()->assertJsonPath('order_status', 'STOCK_OUT_IN_PROGRESS');
        $this->scan($order, $second->barcode, 1)->assertOk()->assertJsonPath('order_status', 'READY_FOR_SHIPMENT');

        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'READY_FOR_SHIPMENT']);
        $this->assertDatabaseHas('order_status_histories', ['order_id' => $order->id, 'action' => 'STOCK_OUT_COMPLETED']);
    }

    public function test_fully_released_item_and_completed_order_reject_further_scans(): void
    {
        $order = $this->order('STOCK_OUT_IN_PROGRESS', quantity: 1);
        $inventory = $this->inventory($this->product, $this->warehouse, '2000000000008', 3);
        $this->scan($order, $inventory->barcode)->assertOk()->assertJsonPath('order_status', 'READY_FOR_SHIPMENT');
        // Completion moves the order out of the Stock Out queue, so a further scan can no
        // longer resolve it. The guarantee that matters is that no extra stock is released.
        $this->scan($order, $inventory->barcode)->assertNotFound();
        $this->assertDatabaseHas('inventories', ['id' => $inventory->id, 'available_stock' => 2]);
    }

    public function test_cancelled_and_delivered_orders_cannot_be_released(): void
    {
        $inventory = $this->inventory($this->product, $this->warehouse, '2000000000011', 5);
        foreach (['CANCELLED', 'DELIVERED'] as $status) {
            $order = $this->order($status);
            $this->scan($order, $inventory->barcode)->assertNotFound();
        }
        $this->assertDatabaseHas('inventories', ['id' => $inventory->id, 'available_stock' => 5]);
        $this->assertDatabaseCount('stock_out_transactions', 0);
    }

    public function test_completed_stock_out_leaves_the_queue_and_is_forwarded_from_shipment(): void
    {
        $order = $this->order('STOCK_OUT_IN_PROGRESS', quantity: 1);
        $inventory = $this->inventory($this->product, $this->warehouse, 'submit-shipment', 1);

        // Completion is automatic; there is no manual submit step in Stock Out.
        $this->scan($order, $inventory->barcode)->assertOk()->assertJsonPath('order_status', 'READY_FOR_SHIPMENT');
        $this->actingAs($this->manager)->getJson("/api/stock-out/orders/{$order->id}")->assertNotFound();
        $this->actingAs($this->manager)->getJson('/api/stock-out/orders')
            ->assertOk()->assertJsonCount(0, 'data');

        // Plant Manager Shipment owns it while it is READY_FOR_SHIPMENT.
        $this->actingAs($this->manager)->getJson('/api/plant-manager/shipments')
            ->assertOk()->assertJsonPath('data.0.order_no', $order->order_no);

        $this->actingAs($this->manager)->postJson("/api/plant-manager/shipments/{$order->id}/forward-to-logistics")
            ->assertOk()->assertJsonPath('status', 'FORWARDED_TO_LOGISTICS');

        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'FORWARDED_TO_LOGISTICS']);
        $this->assertDatabaseHas('order_status_histories', ['order_id' => $order->id, 'action' => 'FORWARDED_TO_LOGISTICS']);

        // Forwarded orders leave the Shipment stage and cannot be forwarded twice.
        $this->actingAs($this->manager)->getJson('/api/plant-manager/shipments')
            ->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($this->manager)->postJson("/api/plant-manager/shipments/{$order->id}/forward-to-logistics")
            ->assertNotFound();
    }

    public function test_competing_releases_cannot_make_inventory_negative(): void
    {
        $order = $this->order('STOCK_OUT_IN_PROGRESS', quantity: 2);
        $inventory = $this->inventory($this->product, $this->warehouse, '2000000000012', 1);

        $this->scan($order, $inventory->barcode)->assertOk();
        $this->scan($order, $inventory->barcode)->assertUnprocessable();

        $this->assertDatabaseHas('inventories', ['id' => $inventory->id, 'available_stock' => 0]);
        $this->assertDatabaseCount('stock_out_transactions', 1);
    }

    public function test_non_plant_manager_cannot_access_or_release_stock(): void
    {
        $order = $this->order('STOCK_OUT_IN_PROGRESS');
        $inventory = $this->inventory($this->product, $this->warehouse, '2000000000009', 3);

        $this->actingAs($this->admin)->getJson('/api/stock-out/orders')->assertForbidden();
        $this->actingAs($this->admin)->postJson("/api/stock-out/orders/{$order->id}/release", [
            'barcode' => $inventory->barcode, 'quantity' => 1, 'idempotency_key' => (string) Str::uuid(),
        ])->assertForbidden();
        $this->assertDatabaseHas('inventories', ['id' => $inventory->id, 'available_stock' => 3]);
    }

    public function test_summary_returns_safe_real_counts_and_release_totals(): void
    {
        $order = $this->order(quantity: 2);
        $inventory = $this->inventory($this->product, $this->warehouse, '2000000000010', 3);
        $this->actingAs($this->manager)->postJson("/api/stock-out/orders/{$order->id}/start")->assertOk();
        $this->scan($order, $inventory->barcode)->assertOk();

        $this->actingAs($this->manager)->getJson('/api/stock-out/summary')->assertOk()
            ->assertJsonPath('orders_ready', 0)
            ->assertJsonPath('picking_today', 1)
            ->assertJsonPath('ready_for_shipment', 0)
            ->assertJsonPath('released_today', 0)
            ->assertJsonPath('items_released', 1)
            ->assertJsonPath('value_released', 100);
    }
}
