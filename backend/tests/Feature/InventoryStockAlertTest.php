<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use App\Notifications\WorkflowNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class InventoryStockAlertTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private User $otherManager;

    private User $qa;

    private Inventory $inventory;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $warehouse = Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id]);
        $otherWarehouse = Warehouse::create(['name' => 'Other Warehouse', 'code' => 'WH-OTHER', 'branch_id' => $branch->id]);
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $qaRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $this->manager = User::factory()->create(['role_id' => $managerRole->id, 'warehouse_id' => $warehouse->id, 'status' => 'ACTIVE']);
        $this->otherManager = User::factory()->create(['role_id' => $managerRole->id, 'warehouse_id' => $otherWarehouse->id, 'status' => 'ACTIVE']);
        $this->qa = User::factory()->create(['role_id' => $qaRole->id, 'warehouse_id' => $warehouse->id, 'status' => 'ACTIVE']);
        $product = Product::create(['name' => 'Industrial Gloves', 'unit' => 'pairs']);
        $this->inventory = Inventory::create([
            'barcode' => 'INV-GLOVES', 'product_id' => $product->id, 'warehouse_id' => $warehouse->id,
            'available_stock' => 30, 'reserved_stock' => 0, 'backload' => 0, 'status' => 'Available',
        ]);
    }

    public function test_only_worsening_stock_range_transitions_create_one_alert_each(): void
    {
        $this->inventory->update(['available_stock' => 20]);
        $this->inventory->update(['available_stock' => 18]);
        $this->inventory->update(['available_stock' => 10]);
        $this->inventory->update(['available_stock' => 7]);
        $this->inventory->update(['available_stock' => 0]);

        Notification::assertSentToTimes($this->manager, WorkflowNotification::class, 3);
        foreach (['Low Stock', 'Critical Stock', 'Out of Stock'] as $title) {
            Notification::assertSentTo($this->manager, WorkflowNotification::class, fn ($notification) => $notification->title === $title && $notification->category === 'Inventory');
        }
        Notification::assertNotSentTo($this->otherManager, WorkflowNotification::class);
        Notification::assertNotSentTo($this->qa, WorkflowNotification::class);
    }

    public function test_direct_multi_threshold_drop_sends_only_the_resulting_severity(): void
    {
        $this->inventory->update(['available_stock' => 35]);
        $this->inventory->update(['available_stock' => 5]);

        Notification::assertSentToTimes($this->manager, WorkflowNotification::class, 1);
        Notification::assertSentTo($this->manager, WorkflowNotification::class, fn ($notification) => $notification->title === 'Critical Stock');
    }

    public function test_direct_drop_to_zero_sends_only_out_of_stock(): void
    {
        $this->inventory->update(['available_stock' => 35]);
        $this->inventory->update(['available_stock' => 0]);

        Notification::assertSentToTimes($this->manager, WorkflowNotification::class, 1);
        Notification::assertSentTo($this->manager, WorkflowNotification::class, fn ($notification) => $notification->title === 'Out of Stock');
    }

    public function test_restock_sends_no_warning_and_starts_a_new_future_alert_cycle(): void
    {
        $this->inventory->update(['available_stock' => 0]);
        Notification::fake();

        $this->inventory->update(['available_stock' => 50]);
        Notification::assertNothingSent();
        $this->inventory->update(['available_stock' => 19]);
        $this->inventory->update(['available_stock' => 9]);

        Notification::assertSentToTimes($this->manager, WorkflowNotification::class, 2);
        Notification::assertSentTo($this->manager, WorkflowNotification::class, fn ($notification) => $notification->title === 'Low Stock');
        Notification::assertSentTo($this->manager, WorkflowNotification::class, fn ($notification) => $notification->title === 'Critical Stock');
    }

    public function test_read_endpoints_do_not_create_stock_alerts(): void
    {
        $this->actingAs($this->manager)->getJson('/api/inventory')->assertOk();
        $this->getJson('/api/plant-manager/procurement/options')->assertOk();
        $this->getJson('/api/notifications')->assertOk();
        Notification::assertNothingSent();
    }
}
