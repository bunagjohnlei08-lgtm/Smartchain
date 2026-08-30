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

class ProductCatalogTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Warehouse $warehouse;

    protected function setUp(): void
    {
        parent::setUp();
        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
        $branch = Branch::create(['name' => 'Main', 'code' => 'MAIN']);
        $this->warehouse = Warehouse::create(['name' => 'Central Warehouse', 'code' => 'CENTRAL', 'branch_id' => $branch->id]);
    }

    public function test_catalog_uses_product_names_and_aggregates_inventory_and_summary(): void
    {
        $product = Product::create(['name' => 'IPAD AIR', 'category' => 'Electronics', 'brand' => 'Apple', 'unit' => 'pcs', 'cost_price' => 100, 'selling_price' => 150, 'reorder_level' => 5]);
        Inventory::create(['barcode' => 'catalog-1', 'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'available_stock' => 2]);
        Inventory::create(['barcode' => 'catalog-2', 'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'available_stock' => 3]);

        $this->actingAs($this->admin)->getJson('/api/admin/products?search=IPAD&category=Electronics&brand=Apple')
            ->assertOk()->assertJsonPath('data.0.name', 'IPAD AIR')
            ->assertJsonPath('data.0.current_stock', 5)->assertJsonPath('data.0.status', 'LOW STOCK')
            ->assertJsonPath('data.0.inventory_value', 500)
            ->assertJsonPath('summary.total_products', 1)->assertJsonPath('summary.low_stock_items', 1);
    }

    public function test_admin_can_create_update_and_delete_an_unreferenced_product(): void
    {
        $payload = ['name' => 'Steel Bolt', 'category' => 'Hardware', 'brand' => 'Acme', 'unit' => 'box', 'cost_price' => 20, 'selling_price' => 30, 'reorder_level' => 4];
        $created = $this->actingAs($this->admin)->postJson('/api/admin/products', $payload)->assertCreated()->assertJsonPath('name', 'Steel Bolt');
        $id = $created->json('id');
        $this->actingAs($this->admin)->putJson("/api/admin/products/{$id}", [...$payload, 'name' => 'Steel Bolts'])->assertOk()->assertJsonPath('name', 'Steel Bolts');
        $this->actingAs($this->admin)->deleteJson("/api/admin/products/{$id}")->assertOk();
        $this->assertDatabaseMissing('products', ['id' => $id]);
    }

    public function test_referenced_product_cannot_be_deleted(): void
    {
        $product = Product::create(['name' => 'Protected', 'unit' => 'pcs', 'cost_price' => 1, 'selling_price' => 2, 'reorder_level' => 1]);
        Inventory::create(['barcode' => 'protected-1', 'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'available_stock' => 0]);
        $this->actingAs($this->admin)->deleteJson("/api/admin/products/{$product->id}")->assertConflict();
        $this->assertDatabaseHas('products', ['id' => $product->id]);
    }

    public function test_non_admin_cannot_access_catalog(): void
    {
        $role = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $user = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
        $this->actingAs($user)->getJson('/api/admin/products')->assertForbidden();
    }
}
