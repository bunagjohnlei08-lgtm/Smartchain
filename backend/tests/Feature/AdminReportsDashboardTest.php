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
        $warehouse = Warehouse::create(['name' => 'Main Warehouse', 'code' => 'MAIN-WH', 'branch_id' => $branch->id, 'capacity' => 100, 'status' => 'Active']);
        $available = Product::create(['name' => 'Available Product', 'unit' => 'pcs', 'cost_price' => 10, 'reorder_level' => 5]);
        $low = Product::create(['name' => 'Low Product', 'unit' => 'pcs', 'cost_price' => 20, 'reorder_level' => 5]);
        Inventory::create(['barcode' => 'REPORT-1', 'product_id' => $available->id, 'warehouse_id' => $warehouse->id, 'available_stock' => 10, 'reserved_stock' => 2, 'backload' => 3]);
        Inventory::create(['barcode' => 'REPORT-2', 'product_id' => $low->id, 'warehouse_id' => $warehouse->id, 'available_stock' => 4]);

        $this->actingAs($this->user('ADMIN'))->getJson('/api/admin/reports/dashboard')
            ->assertOk()
            ->assertJsonPath('metrics.exports_today', null)
            ->assertJsonPath('metrics.pending_reports', null)
            ->assertJsonPath('metrics.generated_today', null)
            ->assertJsonPath('metrics.ai_forecast_accuracy', null)
            ->assertJsonPath('metrics.warehouse_capacity.used', 16)
            ->assertJsonPath('metrics.warehouse_capacity.total', 100)
            ->assertJsonPath('metrics.warehouse_capacity.utilization_percentage', 16)
            ->assertJsonPath('metrics.total_stock_units', 16)
            ->assertJsonPath('warehouse_capacity_overview.0.name', 'Main Warehouse')
            ->assertJsonPath('warehouse_capacity_overview.0.used', 16)
            ->assertJsonPath('warehouse_capacity_overview.0.capacity', 100)
            ->assertJsonPath('stock_status_overview.0.value', 1)
            ->assertJsonPath('stock_status_overview.1.value', 1)
            ->assertJsonPath('stock_status_overview.2.value', 0)
            ->assertJsonCount(0, 'recent_exports')
            ->assertJsonCount(10, 'reports_list');
    }

    public function test_reports_dashboard_is_admin_only(): void
    {
        $plantManager = $this->user('PLANT_MANAGER');
        $this->getJson('/api/admin/reports/dashboard')->assertUnauthorized();
        $this->postJson('/api/admin/reports/export', ['report_id' => 'inventory-summary', 'format' => 'CSV'])->assertUnauthorized();
        $this->actingAs($plantManager)->getJson('/api/admin/reports/dashboard')->assertForbidden();
        $this->actingAs($plantManager)->postJson('/api/admin/reports/export', ['report_id' => 'inventory-summary', 'format' => 'CSV'])->assertForbidden();
    }

    public function test_admin_can_export_an_allowlisted_report_as_csv(): void
    {
        $response = $this->actingAs($this->user('ADMIN'))->postJson('/api/admin/reports/export', [
            'report_id' => 'inventory-summary',
            'format' => 'CSV',
            'name' => 'Inventory Summary',
        ]);

        $response->assertOk()->assertDownload('Inventory_Summary_'.now()->toDateString().'.csv');
        $this->assertStringContainsString('available_stock', $response->streamedContent());
    }

    public function test_report_export_rejects_unknown_reports_and_formats(): void
    {
        $admin = $this->user('ADMIN');
        $this->actingAs($admin)->postJson('/api/admin/reports/export', ['report_id' => '../users', 'format' => 'CSV'])->assertUnprocessable();
        $this->actingAs($admin)->postJson('/api/admin/reports/export', ['report_id' => 'inventory-summary', 'format' => 'PDF'])->assertUnprocessable();
    }
}
