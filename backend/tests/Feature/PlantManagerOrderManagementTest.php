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
use Illuminate\Support\Facades\DB;
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

        $this->actingAs($this->admin)->getJson('/api/admin/logistics/shipments')
            ->assertOk()->assertJsonPath('data.0.packing', null)
            ->assertJsonPath('data.0.legacy_packing', true);

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

    public function test_orders_are_sorted_by_latest_assignment_before_pagination_with_id_tie_breaker(): void
    {
        $oldest = $this->order($this->manager, overrides: ['assigned_at' => now()->subHours(2)]);
        $sameTime = now()->subHour();
        $olderTie = $this->order($this->manager, overrides: ['assigned_at' => $sameTime]);
        $newerTie = $this->order($this->manager, overrides: ['assigned_at' => $sameTime]);

        $this->actingAs($this->manager)->getJson('/api/plant-manager/orders?per_page=2')
            ->assertOk()
            ->assertJsonPath('total', 3)
            ->assertJsonPath('data.0.id', $newerTie->id)
            ->assertJsonPath('data.1.id', $olderTie->id)
            ->assertJsonMissing(['id' => $oldest->id]);
    }

    public function test_shipment_queue_is_sorted_by_entry_time_before_pagination_with_filters_and_ownership(): void
    {
        $oldest = $this->order($this->manager, Order::SHIPMENT_STATUS, ['customer_name' => 'Queue Customer']);
        $sameTime = now()->subHour();
        $olderTie = $this->order($this->manager, Order::SHIPMENT_STATUS, ['customer_name' => 'Queue Customer']);
        $newerTie = $this->order($this->manager, Order::SHIPMENT_STATUS, ['customer_name' => 'Queue Customer']);
        $otherManagers = $this->order($this->otherManager, Order::SHIPMENT_STATUS, ['customer_name' => 'Queue Customer']);
        $notInQueue = $this->order($this->manager, 'ASSIGNED', ['customer_name' => 'Queue Customer']);

        foreach ([
            [$oldest, now()->subHours(2)],
            [$olderTie, $sameTime],
            [$newerTie, $sameTime],
            [$otherManagers, now()],
        ] as [$order, $enteredAt]) {
            DB::table('order_status_histories')->insert([
                'order_id' => $order->id,
                'previous_status' => 'STOCK_OUT_IN_PROGRESS',
                'new_status' => Order::SHIPMENT_STATUS,
                'action' => 'STOCK_OUT_COMPLETED',
                'performed_by' => $this->manager->id,
                'created_at' => $enteredAt,
                'updated_at' => $enteredAt,
            ]);
        }

        $firstPage = $this->actingAs($this->manager)
            ->getJson('/api/plant-manager/shipments?search=Queue%20Customer&per_page=2')
            ->assertOk()
            ->assertJsonPath('total', 3);

        $this->assertSame([$newerTie->id, $olderTie->id], array_column($firstPage->json('data'), 'id'));

        $this->actingAs($this->manager)
            ->getJson('/api/plant-manager/shipments?search=Queue%20Customer&per_page=2&page=2')
            ->assertOk()
            ->assertJsonPath('data.0.id', $oldest->id);
    }

    public function test_shipment_queue_contains_every_packing_stage_and_filters_by_status(): void
    {
        $forPacking = $this->order($this->manager, Order::FOR_PACKING_STATUS);
        $packing = $this->order($this->manager, Order::PACKING_STATUS);
        $ready = $this->order($this->manager, Order::SHIPMENT_STATUS);
        $this->order($this->manager, Order::LOGISTICS_STATUS);
        $this->order($this->manager, 'STOCK_OUT_IN_PROGRESS');

        $all = $this->actingAs($this->manager)->getJson('/api/plant-manager/shipments')->assertOk()->assertJsonPath('total', 3);
        $this->assertEqualsCanonicalizing([$forPacking->id, $packing->id, $ready->id], array_column($all->json('data'), 'id'));

        foreach ([[Order::FOR_PACKING_STATUS, $forPacking], [Order::PACKING_STATUS, $packing], [Order::SHIPMENT_STATUS, $ready]] as [$status, $order]) {
            $this->actingAs($this->manager)->getJson("/api/plant-manager/shipments?status={$status}")
                ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $order->id)->assertJsonPath('data.0.status', $status);
        }
        $this->actingAs($this->manager)->getJson('/api/plant-manager/shipments?status='.Order::LOGISTICS_STATUS)
            ->assertUnprocessable()->assertJsonValidationErrors('status');
    }

    public function test_shipment_entry_time_stays_the_sort_key_after_packing_progresses(): void
    {
        $enteredFirst = $this->order($this->manager, Order::SHIPMENT_STATUS);
        $enteredLater = $this->order($this->manager, Order::FOR_PACKING_STATUS);
        $history = fn (Order $order, string $status, $at) => DB::table('order_status_histories')->insert([
            'order_id' => $order->id, 'new_status' => $status, 'action' => 'TEST', 'performed_by' => $this->manager->id,
            'created_at' => $at, 'updated_at' => $at,
        ]);
        // Packed and marked ready most recently, but entered the queue first.
        $history($enteredFirst, Order::FOR_PACKING_STATUS, now()->subHours(3));
        $history($enteredFirst, Order::PACKING_STATUS, now()->subMinutes(20));
        $history($enteredFirst, Order::SHIPMENT_STATUS, now()->subMinutes(10));
        $history($enteredLater, Order::FOR_PACKING_STATUS, now()->subHour());

        $response = $this->actingAs($this->manager)->getJson('/api/plant-manager/shipments?per_page=1')->assertOk()
            ->assertJsonPath('total', 2)->assertJsonPath('data.0.id', $enteredLater->id);
        $this->assertNull($response->json('data.0.ready_for_shipment_at'));
        $this->actingAs($this->manager)->getJson('/api/plant-manager/shipments?per_page=1&page=2')->assertOk()
            ->assertJsonPath('data.0.id', $enteredFirst->id)
            ->assertJsonPath('data.0.ready_for_shipment_at', fn ($value) => $value !== null);
    }

    public function test_orders_without_shipment_history_sort_after_timestamped_orders_by_id(): void
    {
        $history = fn (Order $order, string $status, $at) => DB::table('order_status_histories')->insert([
            'order_id' => $order->id, 'new_status' => $status, 'action' => 'TEST', 'performed_by' => $this->manager->id,
            'created_at' => $at, 'updated_at' => $at,
        ]);
        // Legacy rows are created first and last so neither ID order nor creation order explains the result.
        $legacyOlderId = $this->order($this->manager, Order::SHIPMENT_STATUS);
        $newest = $this->order($this->manager, Order::FOR_PACKING_STATUS);
        $older = $this->order($this->manager, Order::PACKING_STATUS);
        $legacyNewerId = $this->order($this->manager, Order::SHIPMENT_STATUS);
        $othersLegacy = $this->order($this->otherManager, Order::SHIPMENT_STATUS);
        $history($newest, Order::FOR_PACKING_STATUS, now()->subHour());
        $history($older, Order::FOR_PACKING_STATUS, now()->subDay());
        $history($older, Order::PACKING_STATUS, now()->subMinutes(5));

        $ids = [];
        foreach ([1, 2] as $page) {
            $response = $this->actingAs($this->manager)->getJson("/api/plant-manager/shipments?per_page=2&page={$page}")
                ->assertOk()->assertJsonPath('total', 4);
            $ids = [...$ids, ...array_column($response->json('data'), 'id')];
        }
        $this->assertSame([$newest->id, $older->id, $legacyNewerId->id, $legacyOlderId->id], $ids);
        $this->assertNotContains($othersLegacy->id, $ids);

        // Status filters keep the same ordering and still include legacy rows.
        $this->actingAs($this->manager)->getJson('/api/plant-manager/shipments?status='.Order::SHIPMENT_STATUS)->assertOk()
            ->assertJsonPath('total', 2)->assertJsonPath('data.0.id', $legacyNewerId->id)->assertJsonPath('data.1.id', $legacyOlderId->id);
        $this->actingAs($this->manager)->getJson('/api/plant-manager/shipments?status='.Order::FOR_PACKING_STATUS)->assertOk()
            ->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $newest->id);
        $this->actingAs($this->manager)->getJson('/api/plant-manager/shipments?status='.Order::PACKING_STATUS)->assertOk()
            ->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $older->id);

        // A legacy order without history is still usable.
        $this->actingAs($this->manager)->postJson("/api/plant-manager/shipments/{$legacyOlderId->id}/forward-to-logistics")
            ->assertOk()->assertJsonPath('status', Order::LOGISTICS_STATUS);
    }

    public function test_packing_transitions_notify_nobody_and_only_the_handoff_notifies_admin(): void
    {
        Notification::fake();
        $order = $this->order($this->manager, Order::FOR_PACKING_STATUS);

        $this->actingAs($this->manager)->postJson("/api/plant-manager/shipments/{$order->id}/start-packing")->assertOk();
        $this->actingAs($this->manager)->postJson("/api/plant-manager/shipments/{$order->id}/mark-ready-for-shipment", [
            'number_of_boxes' => 1, 'estimated_weight_kg' => 5, 'is_fragile' => false,
            'correct_product' => true, 'correct_quantity' => true,
            'package_condition' => true, 'items_complete' => true,
        ])->assertOk();
        Notification::assertNothingSent();

        $this->actingAs($this->manager)->postJson("/api/plant-manager/shipments/{$order->id}/forward-to-logistics")->assertOk();
        Notification::assertSentToTimes($this->admin, WorkflowNotification::class, 1);
    }

    public function test_shipment_transitions_enforce_ownership_and_role(): void
    {
        $others = $this->order($this->otherManager, Order::FOR_PACKING_STATUS);
        $othersPacking = $this->order($this->otherManager, Order::PACKING_STATUS);
        $othersReady = $this->order($this->otherManager, Order::SHIPMENT_STATUS);

        $this->actingAs($this->manager)->postJson("/api/plant-manager/shipments/{$others->id}/start-packing")->assertNotFound();
        $this->actingAs($this->manager)->postJson("/api/plant-manager/shipments/{$othersPacking->id}/mark-ready-for-shipment")->assertNotFound();
        $this->actingAs($this->manager)->postJson("/api/plant-manager/shipments/{$othersReady->id}/forward-to-logistics")->assertNotFound();
        $this->actingAs($this->admin)->postJson("/api/plant-manager/shipments/{$others->id}/start-packing")->assertForbidden();
        $this->actingAs($this->admin)->postJson("/api/plant-manager/shipments/{$othersPacking->id}/mark-ready-for-shipment")->assertForbidden();

        $this->assertDatabaseHas('orders', ['id' => $others->id, 'status' => Order::FOR_PACKING_STATUS]);
        $this->assertDatabaseHas('orders', ['id' => $othersPacking->id, 'status' => Order::PACKING_STATUS]);
        $this->assertDatabaseHas('orders', ['id' => $othersReady->id, 'status' => Order::SHIPMENT_STATUS]);
    }

    public function test_order_management_lists_and_filters_packing_statuses(): void
    {
        $forPacking = $this->order($this->manager, Order::FOR_PACKING_STATUS);
        $packing = $this->order($this->manager, Order::PACKING_STATUS);

        $this->actingAs($this->manager)->getJson('/api/plant-manager/orders?status=FOR_PACKING')->assertOk()
            ->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $forPacking->id)
            ->assertJsonPath('data.0.status', 'FOR_PACKING')->assertJsonPath('data.0.fulfillment_progress', 100);
        $this->actingAs($this->manager)->getJson("/api/plant-manager/orders/{$packing->id}")->assertOk()
            ->assertJsonPath('status', 'PACKING');
        $this->actingAs($this->admin)->getJson('/api/admin/orders/summary')->assertOk()
            ->assertJsonPath('FOR_PACKING', 1)->assertJsonPath('PACKING', 1);
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
