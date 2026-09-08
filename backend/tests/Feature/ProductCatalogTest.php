<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
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

    public function test_optional_metadata_can_be_omitted_or_null_without_creating_operational_records(): void
    {
        $counts = collect(Schema::getTableListing())->reject(fn ($table) => $table === 'products' || $table === 'public.products')
            ->mapWithKeys(fn ($table) => [$table => DB::table($table)->count()]);
        $missing = ['unit' => null, 'cost_price' => null, 'selling_price' => null, 'reorder_level' => null];

        foreach (['Omitted' => [], 'Explicit null' => $missing] as $name => $metadata) {
            $response = $this->actingAs($this->admin)->postJson('/api/admin/products', [
                'name' => $name, 'category' => 'REFRACTORY PRODUCTS', ...$metadata,
            ])->assertCreated()->assertJsonPath('current_stock', 0)->assertJsonPath('status', 'OUT OF STOCK');
            foreach ($missing as $field => $value) {
                $response->assertJsonPath($field, null);
            }
            $this->assertDatabaseHas('products', ['id' => $response->json('id'), ...$missing]);
        }

        foreach ($counts as $table => $count) {
            $this->assertSame($count, DB::table($table)->count(), "Unexpected write to {$table}");
        }
    }

    public function test_optional_metadata_can_be_added_preserved_and_cleared_on_edit(): void
    {
        $product = Product::create(['name' => 'Editable metadata', 'category' => 'INDUSTRIAL CHEMICALS']);
        $values = ['unit' => 'kg', 'cost_price' => 12.5, 'selling_price' => 20, 'reorder_level' => 3];
        $this->actingAs($this->admin)->putJson("/api/admin/products/{$product->id}", ['name' => $product->name, ...$values])
            ->assertOk()->assertJsonPath('unit', 'kg')->assertJsonPath('cost_price', 12.5);
        $this->putJson("/api/admin/products/{$product->id}", ['name' => 'Renamed metadata'])
            ->assertOk()->assertJsonPath('cost_price', 12.5)->assertJsonPath('reorder_level', 3);
        $this->assertDatabaseHas('products', ['id' => $product->id, ...$values]);

        $response = $this->putJson("/api/admin/products/{$product->id}", [
            'name' => 'Renamed metadata', 'unit' => '', 'cost_price' => '', 'selling_price' => '', 'reorder_level' => '',
        ])->assertOk();
        foreach (array_keys($values) as $field) {
            $response->assertJsonPath($field, null);
            $this->assertNull($product->fresh()->{$field});
        }
        $this->putJson("/api/admin/products/{$product->id}", [
            'name' => 'Renamed metadata', 'unit' => 'kg', 'cost_price' => 0, 'selling_price' => 0, 'reorder_level' => 0,
        ])->assertOk()->assertJsonPath('cost_price', 0)->assertJsonPath('selling_price', 0)->assertJsonPath('reorder_level', 0);
    }

    public function test_optional_metadata_still_validates_supplied_values(): void
    {
        foreach ([['unit' => 42], ['unit' => str_repeat('x', 51)], ['cost_price' => -1], ['cost_price' => 'invalid'],
            ['selling_price' => -1], ['selling_price' => 'invalid'], ['reorder_level' => -1], ['reorder_level' => 1.5]] as $invalid) {
            $this->actingAs($this->admin)->postJson('/api/admin/products', ['name' => 'Invalid metadata', ...$invalid])
                ->assertUnprocessable()->assertJsonValidationErrors(array_keys($invalid));
        }
        $this->postJson('/api/admin/products', ['category' => 'INDUSTRIAL CHEMICALS'])
            ->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->assertDatabaseCount('products', 0);
    }

    public function test_category_and_search_filters_and_options_support_missing_metadata(): void
    {
        $categories = ['REFRACTORY PRODUCTS', 'CONSTRUCTION CHEMICALS', 'WOOD PRESERVATIVE PRODUCTS', 'INDUSTRIAL CHEMICALS'];
        foreach ($categories as $index => $category) {
            Product::create(['name' => "Matching product {$index}", 'category' => $category]);
        }
        $this->actingAs($this->admin)->getJson('/api/admin/products')->assertOk()->assertJsonPath('total', 4)
            ->assertJsonCount(4, 'filters.categories')->assertJsonPath('summary.total_products', 4);
        $this->getJson('/api/products')->assertOk()->assertJsonCount(4, 'data')
            ->assertJsonPath('data.0.name', 'Matching product 0');
        foreach ($categories as $category) {
            $this->getJson('/api/admin/products?'.http_build_query(['category' => $category, 'search' => 'Matching']))
                ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.category', $category)
                ->assertJsonPath('data.0.cost_price', null);
        }
        $this->getJson('/api/admin/products?'.http_build_query(['category' => $categories[0], 'search' => 'Matching product 3']))
            ->assertOk()->assertJsonPath('total', 0);
    }

    public function test_catalog_does_not_present_unknown_price_or_reorder_level_as_zero_for_existing_stock(): void
    {
        $product = Product::create(['name' => 'Unpriced stocked product']);
        Inventory::create(['barcode' => 'unpriced-stock', 'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'available_stock' => 7]);
        $this->actingAs($this->admin)->getJson('/api/admin/products')->assertOk()
            ->assertJsonPath('data.0.current_stock', 7)->assertJsonPath('data.0.status', null)
            ->assertJsonPath('data.0.inventory_value', null)->assertJsonPath('summary.total_inventory_value', null)
            ->assertJsonPath('summary.out_of_stock', 0);
        $this->assertSame($product->id, $product->inventories->sole()->product_id);
        $this->deleteJson("/api/admin/products/{$product->id}")->assertConflict();
    }
}
