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
            'capacity' => 1000,
            'status' => 'Active',
        ]);
        $product = Product::create(['name' => 'Capacity Product']);

        Inventory::create([
            'barcode' => 'CAPACITY-1',
            'product_id' => $product->id,
            'warehouse_id' => $warehouse->id,
            'available_stock' => 600,
            'reserved_stock' => 80,
        ]);

        $this->actingAs($admin)->getJson('/api/admin/dashboard')
            ->assertOk()
            ->assertJsonPath('data.metrics.warehouse_name', 'Main Warehouse')
            ->assertJsonPath('data.metrics.warehouse_utilization', 68);
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
            'capacity' => 0,
            'status' => 'Active',
        ]);

        $this->actingAs($admin)->getJson('/api/admin/dashboard')
            ->assertOk()
            ->assertJsonPath('data.metrics.warehouse_utilization', null);
    }
}
