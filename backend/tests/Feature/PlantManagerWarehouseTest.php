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

class PlantManagerWarehouseTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $slug): User
    {
        $role = Role::create(['name' => $slug, 'slug' => $slug]);

        return User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
    }

    public function test_plant_manager_sees_the_main_warehouse_and_live_inventory_totals(): void
    {
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $warehouse = Warehouse::create([
            'name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id,
            'address' => 'Archon Nell Incorporated', 'latitude' => 14.6352911,
            'longitude' => 121.0884979, 'capacity' => 1000, 'status' => 'Active',
        ]);
        $product = Product::create(['name' => 'Warehouse Product', 'unit' => 'pcs', 'cost_price' => 10]);
        Inventory::create([
            'barcode' => 'PM-WH-1', 'product_id' => $product->id, 'warehouse_id' => $warehouse->id,
            'available_stock' => 300, 'reserved_stock' => 50, 'backload' => 10,
        ]);

        $this->actingAs($this->user('PLANT_MANAGER'))->getJson('/api/plant-manager/warehouse')
            ->assertOk()
            ->assertJsonPath('id', $warehouse->id)
            ->assertJsonPath('name', 'Main Warehouse')
            ->assertJsonPath('code', 'WH-MAIN')
            ->assertJsonPath('utilized', 350)
            ->assertJsonPath('available', 650)
            ->assertJsonPath('utilization_percentage', 35)
            ->assertJsonPath('inventory.available_stock', 300)
            ->assertJsonPath('inventory.reserved_stock', 50)
            ->assertJsonPath('inventory.backload', 10);
    }

    public function test_warehouse_overview_is_read_only_and_plant_manager_only(): void
    {
        $this->getJson('/api/plant-manager/warehouse')->assertUnauthorized();
        $this->actingAs($this->user('ADMIN'))->getJson('/api/plant-manager/warehouse')->assertForbidden();
        $this->actingAs($this->user('PLANT_MANAGER'))->putJson('/api/plant-manager/warehouse', [])->assertMethodNotAllowed();
    }
}
