<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AdminOrderExampleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use App\Notifications\WorkflowNotification;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AdminOrderManagementTest extends TestCase
{
    use RefreshDatabase;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->product = Product::create(['name' => 'Steel Pipe', 'unit' => 'pcs', 'cost_price' => 100]);
    }

    private function userWithRole(string $slug): User
    {
        $role = Role::firstOrCreate(['slug' => $slug], ['name' => str_replace('_', ' ', $slug)]);
        return User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
    }

    private function payload(array $overrides = []): array
    {
        return array_replace_recursive([
            'reference_no' => 'REF-100',
            'customer_name' => 'Acme Construction',
            'customer_address' => 'Makati City',
            'customer_contact' => '+63 900 000 0000',
            'order_date' => '2026-08-18 09:00:00',
            'required_delivery_date' => '2026-08-25 17:00:00',
            'items' => [[
                'product_id' => $this->product->id, 'quantity' => 2, 'unit_price' => 125.50,
            ]],
        ], $overrides);
    }

    public function test_admin_can_create_list_search_filter_and_view_an_order(): void
    {
        $admin = $this->userWithRole('ADMIN');
        $payload = $this->payload(['items' => [[
            'product_id' => $this->product->id, 'product_name' => 'Client supplied name is ignored',
            'quantity' => 2, 'unit_price' => 125.50,
        ]]]);

        $created = $this->actingAs($admin)->postJson('/api/admin/orders', $payload)
            ->assertCreated()
            ->assertJsonPath('status', 'NEW')
            ->assertJsonPath('total_amount', '251.00')
            ->assertJsonPath('history.0.action', 'ORDER_CREATED');

        $id = $created->json('id');
        $this->assertMatchesRegularExpression('/^SO-2026-\d{4}$/', $created->json('order_no'));
        $this->actingAs($admin)->getJson('/api/admin/orders?search=Steel&status=NEW')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $id);
        $this->actingAs($admin)->getJson("/api/admin/orders/{$id}")
            ->assertOk()->assertJsonPath('items.0.product_id', $this->product->id)
            ->assertJsonPath('items.0.product_name', 'Steel Pipe');
    }

    public function test_order_creation_requires_a_valid_product_for_every_item(): void
    {
        $admin = $this->userWithRole('ADMIN');
        $payload = $this->payload();
        unset($payload['items'][0]['product_id']);

        $this->actingAs($admin)->postJson('/api/admin/orders', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('items.0.product_id');
        $this->assertDatabaseCount('orders', 0);
    }

    public function test_admin_can_create_a_new_order_for_a_real_product_without_catalog_unit_or_inventory(): void
    {
        $admin = $this->userWithRole('ADMIN');
        $product = Product::create(['name' => 'TOMAHAWK EC', 'category' => 'WOOD PRESERVATIVE PRODUCTS']);

        $response = $this->actingAs($admin)->postJson('/api/admin/orders', [
            'customer_name' => 'Test Customer',
            'customer_address' => 'Test delivery destination',
            'order_date' => '2026-09-07',
            'required_delivery_date' => '2026-09-14',
            'items' => [[
                'product_id' => $product->id,
                'quantity' => 3,
                'unit' => 'drum',
                'unit_price' => 125.50,
            ]],
        ])->assertCreated()
            ->assertJsonPath('status', 'NEW')
            ->assertJsonPath('assigned_to', null)
            ->assertJsonPath('items.0.product_id', $product->id)
            ->assertJsonPath('items.0.product_name', 'TOMAHAWK EC')
            ->assertJsonPath('items.0.unit', 'drum')
            ->assertJsonPath('items.0.subtotal', '376.50')
            ->assertJsonPath('total_amount', '376.50');

        $this->assertDatabaseHas('orders', [
            'id' => $response->json('id'), 'status' => 'NEW', 'assigned_to' => null,
        ]);
        $this->assertDatabaseHas('order_items', [
            'order_id' => $response->json('id'), 'product_id' => $product->id,
            'product_name' => 'TOMAHAWK EC', 'quantity' => 3, 'unit' => 'drum',
            'unit_price' => 125.50, 'subtotal' => 376.50,
        ]);

        foreach (['inventories', 'inventory_movements', 'purchase_orders', 'receivings',
            'receiving_items', 'qa_inspections', 'stock_out_transactions', 'shipments'] as $table) {
            if (Schema::hasTable($table)) {
                $this->assertDatabaseCount($table, 0);
            }
        }
    }

    public function test_order_creation_requires_customer_destination_and_item_unit_without_partial_writes(): void
    {
        $admin = $this->userWithRole('ADMIN');
        $payload = $this->payload();
        $this->product->update(['unit' => null]);
        unset($payload['customer_address']);

        $this->actingAs($admin)->postJson('/api/admin/orders', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('customer_address');
        $this->assertDatabaseCount('orders', 0);

        $payload['customer_address'] = 'Test destination';
        $this->actingAs($admin)->postJson('/api/admin/orders', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('items.0.unit');
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('order_items', 0);
        $this->assertDatabaseCount('order_status_histories', 0);
    }

    public function test_admin_product_selector_uses_existing_product_records(): void
    {
        $admin = $this->userWithRole('ADMIN');
        Product::create(['name' => 'Industrial Valve DN50', 'category' => 'INDUSTRIAL CHEMICALS', 'unit' => 'pcs', 'cost_price' => 750]);

        $this->actingAs($admin)->getJson('/api/admin/orders/products')
            ->assertOk()
            ->assertJsonFragment(['id' => $this->product->id, 'name' => 'Steel Pipe', 'unit' => 'pcs'])
            ->assertJsonFragment(['name' => 'Industrial Valve DN50', 'category' => 'INDUSTRIAL CHEMICALS', 'unit' => 'pcs']);
    }

    public function test_multiple_products_are_derived_and_returned_in_the_order_list(): void
    {
        $admin = $this->userWithRole('ADMIN');
        $second = Product::create(['name' => 'Welding Rod', 'unit' => 'box', 'cost_price' => 50]);
        $payload = $this->payload(['items' => [
            ['product_id' => $this->product->id, 'quantity' => 2, 'unit_price' => 125.50],
            ['product_id' => $second->id, 'quantity' => 3, 'unit_price' => 60],
        ]]);

        $this->actingAs($admin)->postJson('/api/admin/orders', $payload)->assertCreated();
        $this->actingAs($admin)->getJson('/api/admin/orders')->assertOk()
            ->assertJsonPath('data.0.products.0', 'Steel Pipe')
            ->assertJsonPath('data.0.products.1', 'Welding Rod');
    }

    public function test_existing_invalid_item_is_flagged_and_cannot_be_edited_through_admin_api(): void
    {
        $admin = $this->userWithRole('ADMIN');
        $order = Order::create([
            'order_no' => 'SO-2026-9999', 'customer_name' => 'Legacy Customer', 'order_date' => now(),
            'required_delivery_date' => now()->addDay(), 'total_amount' => 251, 'status' => 'NEW',
        ]);
        $item = $order->items()->create(['product_id' => null, 'product_name' => 'Legacy text', 'quantity' => 2, 'unit' => 'pcs', 'unit_price' => 125.50, 'subtotal' => 251]);

        $this->actingAs($admin)->getJson("/api/admin/orders/{$order->id}")
            ->assertOk()->assertJsonPath('items.0.product_reference_required', true)
            ->assertJsonPath('items.0.product_name', 'Legacy text');
        $this->actingAs($admin)->patchJson("/api/admin/orders/{$order->id}/items/{$item->id}", ['product_id' => $this->product->id])
            ->assertNotFound();
        $this->assertDatabaseHas('order_items', ['id' => $item->id, 'product_id' => null, 'product_name' => 'Legacy text']);
    }

    public function test_assignment_requires_an_active_plant_manager_and_records_history(): void
    {
        Notification::fake();
        $admin = $this->userWithRole('ADMIN');
        $manager = $this->userWithRole('PLANT_MANAGER');
        $other = $this->userWithRole('QA_SUPERVISOR');
        $id = $this->actingAs($admin)->postJson('/api/admin/orders', $this->payload())->json('id');

        $this->actingAs($admin)->patchJson("/api/admin/orders/{$id}/assign", ['assigned_to' => $other->id])
            ->assertUnprocessable()->assertJsonValidationErrors('assigned_to');

        $this->actingAs($admin)->patchJson("/api/admin/orders/{$id}/assign", ['assigned_to' => $manager->id])
            ->assertOk()->assertJsonPath('status', 'ASSIGNED')->assertJsonPath('assigned_to.id', $manager->id);
        $orderNumber = Order::query()->findOrFail($id)->order_no;
        $this->assertDatabaseHas('order_status_histories', [
            'order_id' => $id, 'previous_status' => 'NEW', 'new_status' => 'ASSIGNED', 'action' => 'ORDER_ASSIGNED',
        ]);
        Notification::assertSentTo($manager, WorkflowNotification::class, fn ($notification) =>
            $notification->title === 'New Order Assigned'
            && $notification->message === "Order #{$orderNumber} assigned for preparation."
            && $notification->type === 'info'
            && $notification->referenceId === $orderNumber);

        $this->actingAs($admin)->patchJson("/api/admin/orders/{$id}/assign", ['assigned_to' => $manager->id])
            ->assertOk();
        Notification::assertSentToTimes($manager, WorkflowNotification::class, 1);
        Notification::assertNotSentTo($other, WorkflowNotification::class);
    }

    public function test_existing_order_assignment_updates_the_same_record(): void
    {
        $admin = $this->userWithRole('ADMIN');
        $manager = $this->userWithRole('PLANT_MANAGER');
        $order = Order::create([
            'order_no' => 'SO-2026-9998', 'customer_name' => 'Invalid Legacy Order', 'order_date' => now(),
            'required_delivery_date' => now()->addDay(), 'total_amount' => 100, 'status' => 'NEW',
        ]);
        $order->items()->create(['product_id' => null, 'product_name' => 'Unmapped product', 'quantity' => 1, 'unit' => 'pcs', 'unit_price' => 100, 'subtotal' => 100]);

        $this->actingAs($admin)->patchJson("/api/admin/orders/{$order->id}/assign", ['assigned_to' => $manager->id])
            ->assertOk()->assertJsonPath('id', $order->id)->assertJsonPath('status', 'ASSIGNED')
            ->assertJsonPath('assigned_to.id', $manager->id)->assertJsonPath('items.0.product_name', 'Unmapped product');
        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'ASSIGNED', 'assigned_to' => $manager->id]);
    }

    public function test_only_allowed_admin_status_transitions_are_accepted(): void
    {
        $admin = $this->userWithRole('ADMIN');
        $id = $this->actingAs($admin)->postJson('/api/admin/orders', $this->payload())->json('id');

        $this->actingAs($admin)->patchJson("/api/admin/orders/{$id}/status", ['status' => 'DELIVERED'])
            ->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->actingAs($admin)->patchJson("/api/admin/orders/{$id}/status", ['status' => 'CANCELLED'])
            ->assertOk()->assertJsonPath('status', 'CANCELLED');
        $this->assertDatabaseHas('order_status_histories', ['order_id' => $id, 'action' => 'ORDER_CANCELLED']);
    }

    public function test_summary_uses_database_counts(): void
    {
        $admin = $this->userWithRole('ADMIN');
        $this->actingAs($admin)->postJson('/api/admin/orders', $this->payload());
        $second = $this->actingAs($admin)->postJson('/api/admin/orders', $this->payload(['reference_no' => 'REF-200']))->json('id');
        $this->actingAs($admin)->patchJson("/api/admin/orders/{$second}/status", ['status' => 'CANCELLED']);

        $this->actingAs($admin)->getJson('/api/admin/orders/summary')->assertOk()
            ->assertJsonPath('NEW', 1)->assertJsonPath('CANCELLED', 1)->assertJsonPath('DELIVERED', 0);
    }

    public function test_example_order_seeder_is_idempotent_and_orders_are_returned_by_the_api(): void
    {
        $admin = $this->userWithRole('ADMIN');
        $manager = $this->userWithRole('PLANT_MANAGER');
        Product::create(['name' => 'Industrial Valve', 'unit' => 'pcs', 'cost_price' => 750]);
        Product::create(['name' => 'Welding Rod', 'unit' => 'box', 'cost_price' => 50]);

        $this->seed(AdminOrderExampleSeeder::class);
        $this->seed(AdminOrderExampleSeeder::class);

        $this->assertSame(5, Order::query()->whereBetween('order_no', ['SO-2026-0009', 'SO-2026-0013'])->count());
        $this->assertSame(9, Order::query()->whereBetween('order_no', ['SO-2026-0009', 'SO-2026-0013'])->withCount('items')->get()->sum('items_count'));
        Order::query()->whereBetween('order_no', ['SO-2026-0009', 'SO-2026-0013'])->with('items')->get()
            ->each(fn (Order $order) => $this->assertEqualsWithDelta(
                (float) $order->total_amount,
                $order->items->sum(fn ($item) => (float) $item->subtotal),
                0.001
            ));
        foreach (range(9, 13) as $sequence) {
            $this->assertDatabaseHas('orders', [
                'order_no' => sprintf('SO-2026-%04d', $sequence),
                'status' => 'NEW',
                'assigned_to' => null,
                'assigned_at' => null,
            ]);
        }

        $response = $this->actingAs($admin)->getJson('/api/admin/orders?search=SO-2026-00&per_page=100')
            ->assertOk()
            ->assertJsonPath('total', 5)
            ->assertJsonCount(5, 'data');

        foreach ($response->json('data') as $order) {
            $this->assertGreaterThanOrEqual(1, $order['items_count']);
            $this->assertLessThanOrEqual(3, $order['items_count']);
            $this->actingAs($admin)->getJson("/api/admin/orders/{$order['id']}")
                ->assertOk()
                ->assertJsonCount($order['items_count'], 'items');
        }

        $this->actingAs($manager)->getJson('/api/plant-manager/orders?per_page=100')
            ->assertOk()->assertJsonPath('total', 0);

        $orderId = Order::query()->where('order_no', 'SO-2026-0009')->value('id');
        $this->actingAs($admin)->patchJson("/api/admin/orders/{$orderId}/assign", ['assigned_to' => $manager->id])
            ->assertOk()->assertJsonPath('id', $orderId)->assertJsonPath('status', 'ASSIGNED');
        $this->assertSame(5, Order::query()->whereBetween('order_no', ['SO-2026-0009', 'SO-2026-0013'])->count());
        $this->actingAs($manager)->getJson('/api/plant-manager/orders?per_page=100')
            ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $orderId);
    }

    public function test_non_admin_cannot_access_admin_order_management(): void
    {
        $manager = $this->userWithRole('PLANT_MANAGER');
        $this->actingAs($manager)->getJson('/api/admin/orders')->assertForbidden();
        $this->actingAs($manager)->postJson('/api/admin/orders', $this->payload())->assertForbidden();
    }
}
