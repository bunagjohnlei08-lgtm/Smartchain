<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Order;
use App\Models\Product;
use App\Models\Inventory;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use App\Notifications\WorkflowNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class PlantManagerOrderManagementTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private User $otherManager;
    private User $admin;
    private Warehouse $warehouse;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $branch = Branch::create(['name' => 'Test Branch', 'code' => 'TEST']);
        $this->warehouse = Warehouse::create(['name' => 'Central Depot', 'code' => 'CENTRAL', 'branch_id' => $branch->id]);
        $this->product = Product::create(['name' => 'Steel Pipe', 'unit' => 'pcs', 'cost_price' => 500]);
        $plantRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->manager = User::factory()->create(['role_id' => $plantRole->id, 'warehouse_id' => $this->warehouse->id, 'status' => 'ACTIVE']);
        $this->otherManager = User::factory()->create(['role_id' => $plantRole->id, 'warehouse_id' => $this->warehouse->id, 'status' => 'ACTIVE']);
        $this->admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
    }

    private function order(User $manager, string $status = 'ASSIGNED', array $overrides = []): Order
    {
        $order = Order::create(array_merge([
            'order_no' => 'SO-'.uniqid(),
            'reference_no' => 'REF-'.uniqid(),
            'customer_name' => 'BuildRight Corp.',
            'customer_address' => 'Makati City',
            'order_date' => now(),
            'required_delivery_date' => now()->addDays(2),
            'total_amount' => 1000,
            'status' => $status,
            'assigned_to' => $manager->id,
            'assigned_at' => now(),
        ], $overrides));
        $order->items()->create([
            'product_id' => $this->product->id,
            'product_name' => 'Steel Pipe', 'quantity' => 2, 'unit' => 'pcs',
            'unit_price' => 500, 'subtotal' => 1000,
        ]);
        return $order;
    }

    public function test_logistics_handoff_notifies_admin_once_after_the_transition(): void
    {
        Notification::fake();
        $order = $this->order($this->manager, Order::SHIPMENT_STATUS);

        $this->actingAs($this->manager)
            ->postJson("/api/plant-manager/shipments/{$order->id}/forward-to-logistics")
            ->assertOk()->assertJsonPath('status', Order::LOGISTICS_STATUS);

        Notification::assertSentTo($this->admin, WorkflowNotification::class, fn ($notification) =>
            $notification->title === 'Order Ready for Logistics'
            && $notification->type === 'success'
            && $notification->referenceId === $order->order_no);

        $this->actingAs($this->manager)
            ->postJson("/api/plant-manager/shipments/{$order->id}/forward-to-logistics")
            ->assertNotFound();
        Notification::assertSentToTimes($this->admin, WorkflowNotification::class, 1);
    }

    public function test_manager_lists_only_owned_orders_with_search_and_filters(): void
    {
        $mine = $this->order($this->manager);
        $this->order($this->otherManager);

        $this->actingAs($this->manager)->getJson('/api/plant-manager/orders?search=Steel&status=ASSIGNED&priority=HIGH&warehouse_id='.$this->warehouse->id)
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $mine->id)
            ->assertJsonPath('data.0.warehouse.name', 'Central Depot')
            ->assertJsonPath('data.0.items.0.product_id', $this->product->id)
            ->assertJsonPath('data.0.items.0.product_name', 'Steel Pipe')
            ->assertJsonPath('data.0.items.0.required_quantity', '2.000')
            ->assertJsonPath('data.0.items.0.product_reference_required', false);
    }

    public function test_historical_item_without_product_reference_is_displayed_without_guessing(): void
    {
        $order = $this->order($this->manager);
        $order->items()->update([
            'product_id' => null,
            'product_name' => 'Legacy Steel Item',
        ]);

        $this->actingAs($this->manager)->getJson('/api/plant-manager/orders')
            ->assertOk()
            ->assertJsonPath('data.0.items.0.product_id', null)
            ->assertJsonPath('data.0.items.0.product_name', 'Legacy Steel Item')
            ->assertJsonPath('data.0.items.0.product_reference_required', true);

        $this->assertDatabaseHas('order_items', [
            'order_id' => $order->id,
            'product_id' => null,
            'product_name' => 'Legacy Steel Item',
        ]);
    }

    public function test_manager_cannot_view_or_process_another_managers_order(): void
    {
        $other = $this->order($this->otherManager);
        $this->actingAs($this->manager)->getJson("/api/plant-manager/orders/{$other->id}")->assertNotFound();
        $this->actingAs($this->manager)->postJson("/api/plant-manager/orders/{$other->id}/start-preparing")->assertNotFound();
    }

    public function test_summary_counts_only_owned_orders(): void
    {
        $this->order($this->manager, 'ASSIGNED');
        $this->order($this->manager, 'PREPARING');
        $this->order($this->manager, 'READY_FOR_STOCK_OUT');
        $this->order($this->otherManager, 'DELIVERED');

        $this->actingAs($this->manager)->getJson('/api/plant-manager/orders/summary')->assertOk()
            ->assertJsonPath('assigned', 1)->assertJsonPath('preparing', 1)
            ->assertJsonPath('readyForStockOut', 1)->assertJsonPath('delivered', 0);
    }

    public function test_valid_preparation_transitions_update_status_and_history(): void
    {
        $order = $this->order($this->manager);
        Inventory::create(['barcode' => 'ready-order-test', 'product_id' => $this->product->id, 'warehouse_id' => $this->warehouse->id, 'available_stock' => 2, 'status' => 'Available']);
        $this->actingAs($this->manager)->postJson("/api/plant-manager/orders/{$order->id}/start-preparing")
            ->assertOk()->assertJsonPath('status', 'PREPARING');
        $this->assertDatabaseHas('order_status_histories', [
            'order_id' => $order->id, 'action' => 'PREPARATION_STARTED', 'performed_by' => $this->manager->id,
        ]);

        $this->actingAs($this->manager)->postJson("/api/plant-manager/orders/{$order->id}/ready-for-stock-out")
            ->assertOk()->assertJsonPath('status', 'READY_FOR_STOCK_OUT');
        $this->assertDatabaseHas('order_status_histories', [
            'order_id' => $order->id, 'action' => 'READY_FOR_STOCK_OUT', 'performed_by' => $this->manager->id,
        ]);

        $this->actingAs($this->admin)->getJson("/api/admin/orders/{$order->id}")
            ->assertOk()->assertJsonPath('status', 'READY_FOR_STOCK_OUT');
    }

    public function test_ready_for_stock_out_requires_inventory_in_assigned_warehouse(): void
    {
        $order = $this->order($this->manager, 'PREPARING');

        $this->actingAs($this->manager)->postJson("/api/plant-manager/orders/{$order->id}/ready-for-stock-out")
            ->assertUnprocessable()->assertJsonValidationErrors('items');
        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'PREPARING']);
    }

    public function test_admin_reassignment_moves_the_same_order_between_manager_lists(): void
    {
        $order = $this->order($this->manager);

        $this->actingAs($this->admin)->patchJson("/api/admin/orders/{$order->id}/assign", [
            'assigned_to' => $this->otherManager->id,
        ])->assertOk()->assertJsonPath('assigned_to.id', $this->otherManager->id);

        $this->actingAs($this->manager)->getJson('/api/plant-manager/orders')
            ->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($this->otherManager)->getJson('/api/plant-manager/orders')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $order->id);
        $this->assertDatabaseHas('orders', ['id' => $order->id, 'assigned_to' => $this->otherManager->id]);
        $this->assertDatabaseHas('order_status_histories', ['order_id' => $order->id, 'action' => 'ORDER_REASSIGNED']);
    }

    public function test_invalid_or_cancelled_transitions_are_rejected(): void
    {
        $assigned = $this->order($this->manager);
        $cancelled = $this->order($this->manager, 'CANCELLED');
        $this->actingAs($this->manager)->postJson("/api/plant-manager/orders/{$assigned->id}/ready-for-stock-out")
            ->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->actingAs($this->manager)->postJson("/api/plant-manager/orders/{$assigned->id}/ready-for-shipment")
            ->assertNotFound();
        $this->actingAs($this->manager)->postJson("/api/plant-manager/orders/{$cancelled->id}/start-preparing")
            ->assertUnprocessable()->assertJsonValidationErrors('status');
    }

    public function test_non_plant_manager_is_forbidden(): void
    {
        $order = $this->order($this->manager);
        $this->actingAs($this->admin)->getJson('/api/plant-manager/orders')->assertForbidden();
        $this->actingAs($this->admin)->postJson("/api/plant-manager/orders/{$order->id}/start-preparing")->assertForbidden();
    }
}
