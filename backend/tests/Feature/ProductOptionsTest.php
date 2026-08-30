<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductOptionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_plant_manager_can_load_product_catalog_options(): void
    {
        Product::create(['name' => 'IPAD AIR', 'unit' => 'pcs', 'cost_price' => 100]);
        Product::create(['name' => 'Steel Pipe', 'unit' => 'pcs', 'cost_price' => 50]);
        $role = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $user = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);

        $this->actingAs($user)->getJson('/api/products')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'IPAD AIR')
            ->assertJsonPath('data.1.name', 'Steel Pipe')
            ->assertJsonMissingPath('data.0.cost_price');
    }

    public function test_product_options_require_authentication(): void
    {
        $this->getJson('/api/products')->assertUnauthorized();
    }
}
