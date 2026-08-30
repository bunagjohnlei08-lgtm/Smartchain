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

class AdminReportsDashboardTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $slug): User
    {
        $role = Role::create(['name' => $slug, 'slug' => $slug]);
        return User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
    }

    public function test_admin_reports_dashboard_returns_live_inventory_aggregates(): void
    {
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $warehouse = Warehouse::create(['name' => 'Main Warehouse', 'code' => 'MAIN-WH', 'branch_id' => $branch->id]);
        $available = Product::create(['name' => 'Available Product', 'unit' => 'pcs', 'cost_price' => 10, 'reorder_level' => 5]);
        $low = Product::create(['name' => 'Low Product', 'unit' => 'pcs', 'cost_price' => 20, 'reorder_level' => 5]);
        Inventory::create(['barcode' => 'REPORT-1', 'product_id' => $available->id, 'warehouse_id' => $warehouse->id, 'available_stock' => 10, 'reserved_stock' => 2, 'backload' => 3]);
        Inventory::create(['barcode' => 'REPORT-2', 'product_id' => $low->id, 'warehouse_id' => $warehouse->id, 'available_stock' => 4]);

        $this->actingAs($this->user('ADMIN'))->getJson('/api/admin/reports/dashboard')
            ->assertOk()
            ->assertJsonPath('metrics.total_inventory_value', 180)
            ->assertJsonPath('inventory_value_by_warehouse.0.name', 'Main Warehouse')
            ->assertJsonPath('inventory_value_by_warehouse.0.value', 180)
            ->assertJsonPath('stock_status_overview.0.value', 10)
            ->assertJsonPath('stock_status_overview.1.value', 2)
            ->assertJsonPath('stock_status_overview.2.value', 3)
            ->assertJsonPath('stock_status_overview.3.value', 4)
            ->assertJsonCount(10, 'reports_list');
    }

    public function test_reports_dashboard_is_admin_only(): void
    {
        $this->getJson('/api/admin/reports/dashboard')->assertUnauthorized();
        $this->actingAs($this->user('PLANT_MANAGER'))->getJson('/api/admin/reports/dashboard')->assertForbidden();
    }
}
