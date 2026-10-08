<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Role;
use App\Models\Supplier;
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
        // One inventory row per product and warehouse; aggregation spans warehouses.
        $secondWarehouse = Warehouse::create(['name' => 'North Warehouse', 'code' => 'NORTH', 'branch_id' => $this->warehouse->branch_id]);
        Inventory::create(['barcode' => 'catalog-2', 'product_id' => $product->id, 'warehouse_id' => $secondWarehouse->id, 'available_stock' => 3]);

        $this->actingAs($this->admin)->getJson('/api/admin/products?search=IPAD&category=Electronics&brand=Apple')
            ->assertOk()->assertJsonPath('data.0.name', 'IPAD AIR')
            ->assertJsonPath('data.0.current_stock', 5)->assertJsonPath('data.0.status', 'LOW STOCK')
            ->assertJsonPath('data.0.inventory_value', 500)
            ->assertJsonPath('summary.total_products', 1)->assertJsonPath('summary.low_stock_items', 1);
    }

    /** New catalog products require an ACTIVE supplier and an active warehouse. */
    private function assignment(): array
    {
        $this->warehouse->update(['status' => 'Active']);
        $supplier = Supplier::query()->firstOrCreate(['supplier_code' => 'SUP-CAT'], ['name' => 'Catalog Supplier', 'status' => 'ACTIVE']);

        return ['supplier_id' => $supplier->id, 'warehouse_id' => $this->warehouse->id];
    }

    public function test_admin_can_create_update_and_delete_an_unreferenced_product(): void
    {
        $payload = ['name' => 'Steel Bolt', 'category' => 'Hardware', 'brand' => 'Acme', 'unit' => 'PCS', 'cost_price' => 20, 'selling_price' => 30, 'reorder_level' => 4];
        $created = $this->actingAs($this->admin)->postJson('/api/admin/products', [...$payload, ...$this->assignment()])->assertCreated()->assertJsonPath('name', 'Steel Bolt');
        $id = $created->json('id');
        $this->actingAs($this->admin)->putJson("/api/admin/products/{$id}", [...$payload, 'name' => 'Steel Bolts'])->assertOk()->assertJsonPath('name', 'Steel Bolts');
        // Creation now assigns a warehouse inventory row, which protects the product from deletion.
        $this->deleteJson("/api/admin/products/{$id}")->assertConflict();

        $unreferenced = Product::create(['name' => 'Unreferenced Bolt']);
        $this->deleteJson("/api/admin/products/{$unreferenced->id}")->assertOk();
        $this->assertDatabaseMissing('products', ['id' => $unreferenced->id]);
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
        $assignment = $this->assignment();
        // Product creation is audited and creates exactly one inventory row and supplier link; nothing else.
        $expected = ['products', 'public.products', 'audit_logs', 'public.audit_logs', 'inventories', 'public.inventories', 'product_supplier', 'public.product_supplier'];
        $counts = collect(Schema::getTableListing())->reject(fn ($table) => in_array($table, $expected, true))
            ->mapWithKeys(fn ($table) => [$table => DB::table($table)->count()]);
        $missing = ['cost_price' => null, 'selling_price' => null, 'reorder_level' => null];

        foreach (['Omitted' => [], 'Explicit null' => ['unit' => null, ...$missing]] as $name => $metadata) {
            // The new warehouse inventory row starts at zero: genuinely out of stock.
            $response = $this->actingAs($this->admin)->postJson('/api/admin/products', [
                'name' => $name, 'category' => 'REFRACTORY PRODUCTS', ...$metadata, ...$assignment,
            ])->assertCreated()->assertJsonPath('current_stock', 0)->assertJsonPath('status', 'OUT OF STOCK')
                ->assertJsonPath('unit', 'PCS');
            foreach ($missing as $field => $value) {
                $response->assertJsonPath($field, null);
            }
            $this->assertDatabaseHas('products', ['id' => $response->json('id'), 'unit' => 'PCS', ...$missing]);
        }

        foreach ($counts as $table => $count) {
            $this->assertSame($count, DB::table($table)->count(), "Unexpected write to {$table}");
        }
        $this->assertDatabaseCount('inventories', 2);
        $this->assertDatabaseCount('product_supplier', 2);
    }

    public function test_optional_metadata_can_be_added_preserved_and_cleared_on_edit(): void
    {
        $product = Product::create(['name' => 'Editable metadata', 'category' => 'INDUSTRIAL CHEMICALS']);
        $values = ['unit' => 'PCS', 'cost_price' => 12.5, 'selling_price' => 20, 'reorder_level' => 3];
        $this->actingAs($this->admin)->putJson("/api/admin/products/{$product->id}", ['name' => $product->name, ...$values])
            ->assertOk()->assertJsonPath('unit', 'PCS')->assertJsonPath('cost_price', 12.5);
        $this->putJson("/api/admin/products/{$product->id}", ['name' => 'Renamed metadata'])
            ->assertOk()->assertJsonPath('cost_price', 12.5)->assertJsonPath('reorder_level', 3);
        $this->assertDatabaseHas('products', ['id' => $product->id, ...$values]);

        $response = $this->putJson("/api/admin/products/{$product->id}", [
            'name' => 'Renamed metadata', 'unit' => '', 'cost_price' => '', 'selling_price' => '', 'reorder_level' => '',
        ])->assertOk();
        foreach (array_keys(array_diff_key($values, ['unit' => true])) as $field) {
            $response->assertJsonPath($field, null);
            $this->assertNull($product->fresh()->{$field});
        }
        // Unit is fixed to PCS; clearing it restores the default instead of NULL.
        $response->assertJsonPath('unit', 'PCS');
        $this->putJson("/api/admin/products/{$product->id}", [
            'name' => 'Renamed metadata', 'unit' => 'pcs', 'cost_price' => 0, 'selling_price' => 0, 'reorder_level' => 0,
        ])->assertOk()->assertJsonPath('cost_price', 0)->assertJsonPath('selling_price', 0)->assertJsonPath('reorder_level', 0);
    }

    public function test_optional_metadata_still_validates_supplied_values(): void
    {
        foreach ([['unit' => 42], ['unit' => str_repeat('x', 51)], ['unit' => 'kg'], ['cost_price' => -1], ['cost_price' => 'invalid'],
            ['selling_price' => -1], ['selling_price' => 'invalid'], ['reorder_level' => -1], ['reorder_level' => 1.5]] as $invalid) {
            $this->actingAs($this->admin)->postJson('/api/admin/products', ['name' => 'Invalid metadata', ...$invalid])
                ->assertUnprocessable()->assertJsonValidationErrors(array_keys($invalid));
        }
        $this->postJson('/api/admin/products', ['category' => 'INDUSTRIAL CHEMICALS'])
            ->assertUnprocessable()->assertJsonValidationErrors(['name', 'supplier_id', 'warehouse_id']);
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
            ->assertJsonPath('data.0.current_stock', 7)->assertJsonPath('data.0.status', 'LOW STOCK')
            ->assertJsonPath('data.0.inventory_value', null)->assertJsonPath('summary.total_inventory_value', null)
            ->assertJsonPath('summary.out_of_stock', 0);
        $this->assertSame($product->id, $product->inventories->sole()->product_id);
        $this->deleteJson("/api/admin/products/{$product->id}")->assertConflict();
    }

    // TEST 2 + 3 + 4
    public function test_new_product_requires_active_supplier_and_warehouse_and_is_created_atomically(): void
    {
        $assignment = $this->assignment();
        $this->actingAs($this->admin)->postJson('/api/admin/products', ['name' => 'smartPhone', 'warehouse_id' => $assignment['warehouse_id']])
            ->assertUnprocessable()->assertJsonPath('errors.supplier_id.0', 'Select an assigned supplier.');
        $this->postJson('/api/admin/products', ['name' => 'smartPhone', 'supplier_id' => $assignment['supplier_id']])
            ->assertUnprocessable()->assertJsonPath('errors.warehouse_id.0', 'Select a warehouse.');
        foreach (['ON_HOLD', 'INACTIVE', 'PENDING_REMOVAL', 'ARCHIVED'] as $status) {
            $blocked = Supplier::create(['supplier_code' => "SUP-{$status}", 'name' => "Blocked {$status}", 'status' => $status]);
            $this->postJson('/api/admin/products', ['name' => 'smartPhone', 'supplier_id' => $blocked->id, 'warehouse_id' => $assignment['warehouse_id']])
                ->assertUnprocessable()->assertJsonValidationErrors('supplier_id');
        }
        $this->assertDatabaseCount('products', 0);
        $this->assertDatabaseCount('inventories', 0);

        $this->postJson('/api/admin/products', ['name' => 'smartPhone', 'unit' => 'kg', ...$assignment])->assertUnprocessable();
        $id = $this->postJson('/api/admin/products', ['name' => 'smartPhone', ...$assignment])->assertCreated()
            ->assertJsonPath('unit', 'PCS')->assertJsonPath('supplier', 'Catalog Supplier')->assertJsonPath('status', 'OUT OF STOCK')->json('id');
        $this->assertDatabaseHas('product_supplier', ['product_id' => $id, 'supplier_id' => $assignment['supplier_id'], 'is_primary' => true]);
        $this->assertDatabaseHas('inventories', ['product_id' => $id, 'warehouse_id' => $assignment['warehouse_id'], 'available_stock' => 0]);
        $this->assertDatabaseCount('replenishment_requests', 0);
    }

    // TEST 6
    public function test_edit_assigns_supplier_to_legacy_product_without_touching_stock(): void
    {
        $assignment = $this->assignment();
        $product = Product::create(['name' => 'Legacy Product']);
        $inventory = Inventory::create(['barcode' => 'legacy-1', 'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'available_stock' => 12]);

        $this->actingAs($this->admin)->putJson("/api/admin/products/{$product->id}", ['name' => 'Legacy Product', 'supplier_id' => $assignment['supplier_id']])
            ->assertOk()->assertJsonPath('supplier', 'Catalog Supplier');
        $this->putJson("/api/admin/products/{$product->id}", ['name' => 'Legacy Product', 'supplier_id' => $assignment['supplier_id']])->assertOk();
        $this->assertDatabaseCount('product_supplier', 1);

        $other = Supplier::create(['supplier_code' => 'SUP-NEW', 'name' => 'Replacement Supplier', 'status' => 'ACTIVE']);
        $this->putJson("/api/admin/products/{$product->id}", ['name' => 'Legacy Product', 'supplier_id' => $other->id])
            ->assertOk()->assertJsonPath('supplier', 'Replacement Supplier');
        $this->assertSame([$other->id], DB::table('product_supplier')->where('product_id', $product->id)->where('is_primary', true)->pluck('supplier_id')->all());

        $archived = Supplier::create(['supplier_code' => 'SUP-ARC', 'name' => 'Archived', 'status' => 'ARCHIVED']);
        $this->putJson("/api/admin/products/{$product->id}", ['name' => 'Renamed', 'supplier_id' => $archived->id])
            ->assertUnprocessable()->assertJsonValidationErrors('supplier_id');
        $this->assertSame('Legacy Product', $product->fresh()->name);

        // Supplier is optional on edit for legacy compatibility; stock and warehouse never move here.
        $this->putJson("/api/admin/products/{$product->id}", ['name' => 'Legacy Product', 'warehouse_id' => 999])->assertOk();
        $this->assertSame([$this->warehouse->id, 12], [$inventory->fresh()->warehouse_id, $inventory->fresh()->available_stock]);
        $this->assertDatabaseCount('inventories', 1);
    }
}
