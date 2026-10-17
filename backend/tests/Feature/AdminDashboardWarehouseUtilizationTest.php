<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminDashboardWarehouseUtilizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_dashboard_returns_main_warehouse_live_capacity_utilization(): void
    {
        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $warehouse = Warehouse::create([
            'name' => 'Main Warehouse',
            'code' => 'WH-MAIN',
            'branch_id' => $branch->id,
            'capacity' => 1000, 'capacity_powder' => 0, 'capacity_liquid' => 0, 'capacity_solid' => 900, 'capacity_returned' => 100,
            'status' => 'Active',
        ]);
        $product = Product::create(['name' => 'Capacity Product', 'unit' => 'PCS']);

        Inventory::create([
            'barcode' => 'CAPACITY-1',
            'product_id' => $product->id,
            'warehouse_id' => $warehouse->id,
            'available_stock' => 600,
            'reserved_stock' => 80,
            'returned_stock' => 20,
        ]);

        $this->actingAs($admin)->getJson('/api/admin/dashboard')
            ->assertOk()
            ->assertJsonPath('data.metrics.warehouse_name', 'Main Warehouse')
            ->assertJsonPath('data.metrics.warehouse_capacity.used_capacity', 700)
            ->assertJsonPath('data.metrics.warehouse_capacity.remaining_capacity', 300)
            ->assertJsonPath('data.metrics.warehouse_capacity.occupancy_percentage', 70)
            ->assertJsonPath('data.metrics.warehouse_capacity.area_capacity.SOLID.used', 680)
            ->assertJsonPath('data.metrics.warehouse_capacity.area_capacity.RETURNED.used', 20);
    }

    public function test_dashboard_returns_null_utilization_when_capacity_is_not_configured(): void
    {
        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        Warehouse::create([
            'name' => 'Main Warehouse',
            'code' => 'WH-MAIN',
            'branch_id' => $branch->id,
            'capacity' => 1000,
            'status' => 'Active',
        ]);

        $this->actingAs($admin)->getJson('/api/admin/dashboard')
            ->assertOk()
            ->assertJsonPath('data.metrics.warehouse_capacity.allocation_configured', false)
            ->assertJsonPath('data.metrics.warehouse_capacity.used_capacity', 0)
            ->assertJsonPath('data.metrics.warehouse_capacity.occupancy_percentage', 0);
    }

    public function test_dashboard_reports_zero_and_over_capacity_without_clamping(): void
    {
        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $warehouse = Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id,
            'capacity' => 100, 'capacity_powder' => 0, 'capacity_liquid' => 0, 'capacity_solid' => 100, 'capacity_returned' => 0, 'status' => 'Active']);

        $this->actingAs($admin)->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('data.metrics.warehouse_capacity.used_capacity', 0)
            ->assertJsonPath('data.metrics.warehouse_capacity.remaining_capacity', 100)
            ->assertJsonPath('data.metrics.warehouse_capacity.occupancy_percentage', 0);

        $product = Product::create(['name' => 'Over Capacity Product', 'unit' => 'PCS']);
        Inventory::create(['barcode' => 'OVER-1', 'product_id' => $product->id, 'warehouse_id' => $warehouse->id,
            'available_stock' => 110, 'reserved_stock' => 5, 'returned_stock' => 0]);
        $this->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('data.metrics.warehouse_capacity.used_capacity', 115)
            ->assertJsonPath('data.metrics.warehouse_capacity.remaining_capacity', -15)
            ->assertJsonPath('data.metrics.warehouse_capacity.occupancy_percentage', 115)
            ->assertJsonPath('data.metrics.warehouse_capacity.over_capacity', true);
    }
}
