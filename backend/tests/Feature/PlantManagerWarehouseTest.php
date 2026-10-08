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

    private function user(string $slug, array $attributes = []): User
    {
        $role = Role::create(['name' => $slug, 'slug' => $slug]);

        return User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE'] + $attributes);
    }

    public function test_plant_manager_sees_the_main_warehouse_and_live_inventory_totals(): void
    {
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $warehouse = Warehouse::create([
            'name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id,
            'address' => 'G/F, Brgy. New Marikina Subd., 29 Flamingo, Marikina, 1800 Metro Manila', 'latitude' => 14.6305374,
            'longitude' => 121.1010625, 'capacity' => 1000, 'status' => 'Active',
        ]);
        $product = Product::create(['name' => 'Warehouse Product', 'unit' => 'pcs', 'cost_price' => 10]);
        Inventory::create([
            'barcode' => 'PM-WH-1', 'product_id' => $product->id, 'warehouse_id' => $warehouse->id,
            'available_stock' => 300, 'reserved_stock' => 50, 'backload' => 10,
        ]);

        $this->actingAs($this->user('PLANT_MANAGER', ['warehouse_id' => $warehouse->id]))->getJson('/api/plant-manager/warehouse')
            ->assertOk()
            ->assertJsonPath('id', $warehouse->id)
            ->assertJsonPath('name', 'Main Warehouse')
            ->assertJsonPath('code', 'WH-MAIN')
            ->assertJsonPath('address', 'G/F, Brgy. New Marikina Subd., 29 Flamingo, Marikina, 1800 Metro Manila')
            ->assertJsonPath('latitude', 14.6305374)
            ->assertJsonPath('longitude', 121.1010625)
            ->assertJsonPath('map_embed_url', 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3679.48874398943!2d121.1010625!3d14.6305374!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397b9485ea55b87%3A0x2e093784a1e3763b!2sArchon%20Nell%20Incorporated!5e1!3m2!1sen!2sph!4v1791469640495!5m2!1sen!2sph')
            ->assertJsonPath('directions_url', 'https://www.google.com/maps/dir/?api=1&destination=14.6305374%2C121.1010625')
            ->assertJsonPath('utilized', 350)
            ->assertJsonPath('available', 650)
            ->assertJsonPath('utilization_percentage', 35)
            ->assertJsonPath('capacity_state', 'normal')
            ->assertJsonPath('capacity_warning', false)
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
