<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\QaInspection;
use App\Models\QaInspectionItem;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use App\Notifications\WorkflowNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class StockInTest extends TestCase
{
    use RefreshDatabase;

    private function makeReceiving(array $itemStates): Receiving
    {
        $hasAcceptedItems = collect($itemStates)->contains(
            fn (array $state) => in_array($state['inspection_status'], ['Passed', 'Partial'], true)
        );
        $hasRejectedItems = collect($itemStates)->contains(
            fn (array $state) => $state['inspection_status'] === 'Rejected'
        );
        $overallStatus = $hasAcceptedItems ? ($hasRejectedItems ? 'Partial' : 'Passed') : ($hasRejectedItems ? 'Rejected' : 'Pending QA');

        $receiving = Receiving::create([
            'receiving_no' => 'RCV-'.uniqid(),
            'purchase_order' => 'PO-1',
            'supplier' => 'Test Supplier',
            'reference_no' => 'REF-1',
            'delivery_date' => now()->toDateString(),
            'status' => $overallStatus,
        ]);

        $inspection = $overallStatus !== 'Pending QA'
            ? QaInspection::create([
                'receiving_id' => $receiving->id,
                'status' => $overallStatus,
                'started_at' => now()->subMinute(),
                'completed_at' => now(),
            ])
            : null;

        foreach ($itemStates as $state) {
            $product = Product::create([
                'name' => $state['product'],
                'unit' => 'pcs',
                'cost_price' => 100,
            ]);

            $receivingItem = ReceivingItem::create([
                'receiving_id' => $receiving->id,
                'product_id' => $product->id,
                'product_name' => $product->name,
                'delivered_quantity' => $state['qty'],
                'unit' => 'pcs',
                'inspection_status' => $state['inspection_status'],
            ]);

            if ($inspection) {
                $accepted = in_array($state['inspection_status'], ['Passed', 'Partial'], true) ? $state['qty'] : 0;
                QaInspectionItem::create([
                    'qa_inspection_id' => $inspection->id,
                    'receiving_item_id' => $receivingItem->id,
                    'accepted_quantity' => $accepted,
                    'rejected_quantity' => $state['qty'] - $accepted,
                    'inspection_result' => $state['inspection_status'],
                ]);
            }
        }

        return $receiving;
    }

    private function plantManager(): User
    {
        $role = Role::firstOrCreate(['slug' => 'PLANT_MANAGER'], ['name' => 'Plant Manager']);
        return User::factory()->create(['role_id' => $role->id]);
    }

    private function warehouseWithUtilization(int $capacity, int $utilized): Warehouse
    {
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'BR-'.uniqid()]);
        $warehouse = Warehouse::create([
            'name' => 'Main Warehouse',
            'code' => 'WH-MAIN',
            'branch_id' => $branch->id,
            'capacity' => $capacity,
            'status' => 'Active',
        ]);

        if ($utilized > 0) {
            $product = Product::create(['name' => 'Existing Stock', 'unit' => 'pcs', 'cost_price' => 1]);
            Inventory::create([
                'barcode' => 'CAP-'.uniqid(),
                'product_id' => $product->id,
                'warehouse_id' => $warehouse->id,
                'available_stock' => $utilized,
                'reserved_stock' => 0,
                'backload' => 0,
            ]);
        }

        return $warehouse;
    }

    public function test_index_returns_200_and_no_received_at_error(): void
    {
        $user = $this->plantManager();
        $this->makeReceiving([
            ['product' => 'Widget A', 'qty' => 10, 'inspection_status' => 'Passed'],
            ['product' => 'Widget B', 'qty' => 5, 'inspection_status' => 'Pending QA'],
        ]);

        $response = $this->actingAs($user)->getJson('/api/stock-in/receivings');

        $response->assertOk();
        $response->assertJsonPath('data.0.items_count', 2);
        $response->assertJsonPath('data.0.eligible_items_count', 1);
        $response->assertJsonPath('data.0.stock_in_status', 'Ready for Stock In');
    }

    public function test_perform_stock_in_updates_inventory_and_marks_items(): void
    {
        Notification::fake();
        $user = $this->plantManager();
        $adminRole = Role::firstOrCreate(['slug' => 'ADMIN'], ['name' => 'Admin']);
        $qaRole = Role::firstOrCreate(['slug' => 'QA_SUPERVISOR'], ['name' => 'QA Supervisor']);
        $admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        $qa = User::factory()->create(['role_id' => $qaRole->id, 'status' => 'ACTIVE']);
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'BR-MAIN']);
        Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id]);

        $receiving = $this->makeReceiving([
            ['product' => 'Widget A', 'qty' => 10, 'inspection_status' => 'Passed'],
            ['product' => 'Widget B', 'qty' => 5, 'inspection_status' => 'Rejected'],
        ]);

        $response = $this->actingAs($user)->postJson("/api/stock-in/receivings/{$receiving->id}/stock-in");

        $response->assertOk();
        $response->assertJsonPath('stock_in_status', 'Completed');
        $response->assertJsonPath('eligible_items_count', 0);

        $passedItem = $receiving->items()->where('product_name', 'Widget A')->first();
        $this->assertNotNull($passedItem->stocked_in_at);

        $this->assertDatabaseHas('inventories', [
            'product_id' => $passedItem->product_id,
            'available_stock' => 10,
        ]);
        $this->assertDatabaseHas('receiving_timelines', [
            'receiving_id' => $receiving->id,
            'status' => 'Stock In Completed',
            'performed_by' => $user->name,
        ]);
        Notification::assertSentTo($admin, WorkflowNotification::class, fn ($notification) =>
            $notification->title === 'Stock In Completed'
            && $notification->message === "Plant Manager successfully added inventory for Receiving #{$receiving->receiving_no}."
            && $notification->type === 'success'
            && $notification->referenceId === $receiving->receiving_no);
        Notification::assertSentToTimes($admin, WorkflowNotification::class, 1);
        Notification::assertNotSentTo($user, WorkflowNotification::class);
        Notification::assertNotSentTo($qa, WorkflowNotification::class);

        $rejectedItem = $receiving->items()->where('product_name', 'Widget B')->first();
        $this->assertNull($rejectedItem->stocked_in_at);

        // Calling again must not double-stock the already-completed item.
        $second = $this->actingAs($user)->postJson("/api/stock-in/receivings/{$receiving->id}/stock-in");
        $second->assertStatus(422);
        Notification::assertSentToTimes($admin, WorkflowNotification::class, 1);

        $this->assertDatabaseHas('inventories', [
            'product_id' => $passedItem->product_id,
            'available_stock' => 10,
        ]);
    }

    public function test_perform_stock_in_fails_without_eligible_items(): void
    {
        $user = $this->plantManager();
        $receiving = $this->makeReceiving([
            ['product' => 'Widget C', 'qty' => 3, 'inspection_status' => 'Pending QA'],
        ]);

        $response = $this->actingAs($user)->postJson("/api/stock-in/receivings/{$receiving->id}/stock-in");

        $response->assertStatus(422);
    }

    public function test_stock_in_increases_existing_warehouse_inventory(): void
    {
        $user = $this->plantManager();
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'BR-MAIN']);
        $warehouse = Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id]);
        $receiving = $this->makeReceiving([['product' => 'Valve', 'qty' => 5, 'inspection_status' => 'Passed']]);
        $item = $receiving->items()->firstOrFail();
        Inventory::create([
            'barcode' => '2940080739867', 'product_id' => $item->product_id, 'warehouse_id' => $warehouse->id,
            'available_stock' => 10, 'reserved_stock' => 2, 'backload' => 1, 'status' => 'Available', 'pending_receiving' => false,
        ]);

        $this->actingAs($user)->postJson("/api/stock-in/receivings/{$receiving->id}/stock-in")->assertOk();

        $this->assertDatabaseHas('inventories', ['product_id' => $item->product_id, 'warehouse_id' => $warehouse->id, 'available_stock' => 15, 'reserved_stock' => 2, 'backload' => 1]);
    }

    public function test_stock_in_below_capacity_succeeds(): void
    {
        $user = $this->plantManager();
        $warehouse = $this->warehouseWithUtilization(10000, 9000);
        $receiving = $this->makeReceiving([['product' => 'Below Capacity', 'qty' => 500, 'inspection_status' => 'Passed']]);

        $this->actingAs($user)->postJson("/api/stock-in/receivings/{$receiving->id}/stock-in")->assertOk();

        $this->assertSame(9500, (int) Inventory::where('warehouse_id', $warehouse->id)->sum(DB::raw('available_stock + reserved_stock')));
    }

    public function test_stock_in_may_fill_warehouse_to_exact_capacity(): void
    {
        $user = $this->plantManager();
        $warehouse = $this->warehouseWithUtilization(10000, 9500);
        $receiving = $this->makeReceiving([['product' => 'Exact Capacity', 'qty' => 500, 'inspection_status' => 'Passed']]);

        $this->actingAs($user)->postJson("/api/stock-in/receivings/{$receiving->id}/stock-in")->assertOk();

        $this->assertSame(10000, (int) Inventory::where('warehouse_id', $warehouse->id)->sum(DB::raw('available_stock + reserved_stock')));
    }

    public function test_stock_in_exceeding_capacity_is_rejected_without_partial_changes(): void
    {
        Notification::fake();
        $user = $this->plantManager();
        $adminRole = Role::firstOrCreate(['slug' => 'ADMIN'], ['name' => 'Admin']);
        $admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        $warehouse = $this->warehouseWithUtilization(10000, 9500);
        $receiving = $this->makeReceiving([['product' => 'Exceeds Capacity', 'qty' => 501, 'inspection_status' => 'Passed']]);
        $item = $receiving->items()->firstOrFail();

        $this->actingAs($user)->postJson("/api/stock-in/receivings/{$receiving->id}/stock-in")
            ->assertStatus(422)
            ->assertJson([
                'message' => 'Cannot stock in: Quantity exceeds maximum warehouse capacity.',
                'available_capacity' => 500,
                'requested_quantity' => 501,
            ]);

        $this->assertSame(9500, (int) Inventory::where('warehouse_id', $warehouse->id)->sum(DB::raw('available_stock + reserved_stock')));
        $this->assertNull($item->fresh()->stocked_in_at);
        $this->assertDatabaseMissing('receiving_timelines', ['receiving_id' => $receiving->id, 'status' => 'Stock In Completed']);
        Notification::assertNotSentTo($admin, WorkflowNotification::class);
    }

    public function test_stock_in_is_rejected_when_warehouse_is_already_full(): void
    {
        $user = $this->plantManager();
        $this->warehouseWithUtilization(10000, 10000);
        $receiving = $this->makeReceiving([['product' => 'Full Warehouse', 'qty' => 1, 'inspection_status' => 'Passed']]);

        $this->actingAs($user)->postJson("/api/stock-in/receivings/{$receiving->id}/stock-in")
            ->assertStatus(422)
            ->assertJsonPath('available_capacity', 0)
            ->assertJsonPath('requested_quantity', 1);
    }

    public function test_stock_in_is_rejected_when_warehouse_is_already_over_capacity(): void
    {
        $user = $this->plantManager();
        $this->warehouseWithUtilization(10000, 11544);
        $receiving = $this->makeReceiving([['product' => 'Over Capacity Warehouse', 'qty' => 1, 'inspection_status' => 'Passed']]);

        $this->actingAs($user)->postJson("/api/stock-in/receivings/{$receiving->id}/stock-in")
            ->assertStatus(422)
            ->assertJsonPath('available_capacity', 0)
            ->assertJsonPath('requested_quantity', 1);
    }

    public function test_multi_item_stock_in_validates_total_incoming_quantity(): void
    {
        $user = $this->plantManager();
        $warehouse = $this->warehouseWithUtilization(10000, 9900);
        $receiving = $this->makeReceiving([
            ['product' => 'Item A', 'qty' => 60, 'inspection_status' => 'Passed'],
            ['product' => 'Item B', 'qty' => 60, 'inspection_status' => 'Passed'],
        ]);

        $this->actingAs($user)->postJson("/api/stock-in/receivings/{$receiving->id}/stock-in")
            ->assertStatus(422)
            ->assertJsonPath('available_capacity', 100)
            ->assertJsonPath('requested_quantity', 120);

        $this->assertSame(9900, (int) Inventory::where('warehouse_id', $warehouse->id)->sum(DB::raw('available_stock + reserved_stock')));
        $this->assertSame(0, $receiving->items()->whereNotNull('stocked_in_at')->count());
    }

    public function test_non_plant_manager_cannot_perform_stock_in(): void
    {
        $user = User::factory()->create();
        $receiving = $this->makeReceiving([['product' => 'Restricted', 'qty' => 2, 'inspection_status' => 'Passed']]);

        $this->actingAs($user)->postJson("/api/stock-in/receivings/{$receiving->id}/stock-in")->assertForbidden();
        $this->assertDatabaseCount('inventories', 0);
    }

    public function test_unauthenticated_user_cannot_perform_stock_in(): void
    {
        $receiving = $this->makeReceiving([['product' => 'Restricted', 'qty' => 2, 'inspection_status' => 'Passed']]);

        $this->postJson("/api/stock-in/receivings/{$receiving->id}/stock-in")->assertUnauthorized();
        $this->assertDatabaseCount('inventories', 0);
    }
}
