<?php

namespace Tests\Feature;

use App\Models\Inventory;
use App\Models\Branch;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use App\Notifications\WorkflowNotification;
use App\Support\WarehouseCapacity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use RuntimeException;
use Tests\TestCase;

class WarehouseCapacityWarningTest extends TestCase
{
    use RefreshDatabase;

    private Warehouse $warehouse;
    private Inventory $inventory;
    private User $admin;
    private User $manager;
    private User $otherManager;
    private User $qa;

    protected function setUp(): void
    {
        parent::setUp();
        $roles = collect(['ADMIN', 'PLANT_MANAGER', 'QA_SUPERVISOR'])->mapWithKeys(fn ($slug) => [
            $slug => Role::create(['name' => $slug, 'slug' => $slug]),
        ]);
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $this->warehouse = Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id, 'capacity' => 1000, 'status' => 'Active']);
        $other = Warehouse::create(['name' => 'Other Warehouse', 'code' => 'WH-OTHER', 'branch_id' => $branch->id, 'capacity' => 1000, 'status' => 'Active']);
        $this->admin = User::factory()->create(['role_id' => $roles['ADMIN']->id, 'status' => 'ACTIVE']);
        $this->manager = User::factory()->create(['role_id' => $roles['PLANT_MANAGER']->id, 'warehouse_id' => $this->warehouse->id, 'status' => 'ACTIVE']);
        $this->otherManager = User::factory()->create(['role_id' => $roles['PLANT_MANAGER']->id, 'warehouse_id' => $other->id, 'status' => 'ACTIVE']);
        $this->qa = User::factory()->create(['role_id' => $roles['QA_SUPERVISOR']->id, 'status' => 'ACTIVE']);
        $product = Product::create(['name' => 'Capacity Product', 'unit' => 'pcs', 'cost_price' => 1]);
        $this->inventory = Inventory::create(['barcode' => 'CAP-1', 'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'available_stock' => 940, 'reserved_stock' => 0, 'backload' => 0]);
    }

    private function setUtilized(int $quantity): void
    {
        DB::transaction(function () use ($quantity): void {
            $warehouse = Warehouse::query()->lockForUpdate()->findOrFail($this->warehouse->id);
            Inventory::query()->whereKey($this->inventory->id)->update(['available_stock' => $quantity]);
            WarehouseCapacity::recordTransition($warehouse);
        });
    }

    public function test_warning_transitions_are_deduplicated_and_rearmed(): void
    {
        Notification::fake();
        $this->setUtilized(949);
        Notification::assertNothingSent();

        $this->setUtilized(950);
        Notification::assertSentTo([$this->admin, $this->manager], WorkflowNotification::class, fn ($notification) =>
            $notification->title === 'Warehouse Near Capacity'
            && str_contains($notification->message, 'Main Warehouse')
            && str_contains($notification->message, '95.0%')
            && str_contains($notification->message, '50 units')
        );
        Notification::assertNotSentTo([$this->otherManager, $this->qa], WorkflowNotification::class);

        Notification::fake();
        $this->setUtilized(960);
        $this->setUtilized(970);
        $this->setUtilized(990);
        Notification::assertNothingSent();

        $this->setUtilized(900);
        $this->assertSame('NORMAL', $this->warehouse->fresh()->capacity_alert_level);
        $this->setUtilized(960);
        Notification::assertSentToTimes($this->admin, WorkflowNotification::class, 1);
        Notification::assertSentToTimes($this->manager, WorkflowNotification::class, 1);
    }

    public function test_full_state_notifies_once_and_api_exposes_shared_state(): void
    {
        Notification::fake();
        $this->setUtilized(950);
        Notification::fake();
        $this->setUtilized(1000);
        Notification::assertSentTo($this->admin, WorkflowNotification::class, fn ($notification) =>
            $notification->title === 'Warehouse Full' && $notification->type === 'error'
        );
        $this->setUtilized(1000);
        Notification::assertSentToTimes($this->admin, WorkflowNotification::class, 1);

        $this->actingAs($this->manager)->getJson('/api/plant-manager/warehouse')
            ->assertOk()->assertJsonPath('capacity_state', 'full')
            ->assertJsonPath('capacity_warning', true)
            ->assertJsonPath('utilization_percentage', 100)
            ->assertJsonPath('available', 0);
    }

    public function test_rolled_back_change_does_not_persist_state_or_send_warning(): void
    {
        Notification::fake();
        try {
            DB::transaction(function (): void {
                $warehouse = Warehouse::query()->lockForUpdate()->findOrFail($this->warehouse->id);
                Inventory::query()->whereKey($this->inventory->id)->update(['available_stock' => 950]);
                WarehouseCapacity::recordTransition($warehouse);
                throw new RuntimeException('rollback');
            });
        } catch (RuntimeException) {
        }

        Notification::assertNothingSent();
        $this->assertSame(940, $this->inventory->fresh()->available_stock);
        $this->assertSame('NORMAL', $this->warehouse->fresh()->capacity_alert_level);
    }
}
