<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class PlantManagerProcurementFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private Product $product;
    private Warehouse $warehouse;

    protected function setUp(): void
    {
        parent::setUp();
        $role = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $this->warehouse = Warehouse::create([
            'name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id,
        ]);
        $this->manager = User::factory()->create([
            'role_id' => $role->id, 'warehouse_id' => $this->warehouse->id, 'status' => 'ACTIVE',
        ]);
        $this->product = Product::create(['name' => 'TOMAHAWK EC', 'category' => 'WOOD PRESERVATIVE PRODUCTS']);
    }

    public function test_catalog_product_without_inventory_can_be_requested_for_a_valid_warehouse(): void
    {
        $this->assertDatabaseCount('inventories', 0);

        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/options')
            ->assertOk()
            ->assertJsonCount(0, 'data')
            ->assertJsonPath('warehouse.id', $this->warehouse->id)
            ->assertJsonPath('warehouse.name', 'Main Warehouse');

        $response = $this->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'requested_qty' => 15,
            'priority' => 'Medium',
            'status' => 'pending',
        ])->assertCreated()
            ->assertJsonPath('product_name', 'TOMAHAWK EC')
            ->assertJsonPath('warehouse_name', 'Main Warehouse')
            ->assertJsonPath('requested_qty', 15)
            ->assertJsonPath('status', 'pending');

        $this->assertDatabaseHas('replenishment_requests', [
            'id' => $response->json('id'), 'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id, 'requested_qty' => 15, 'status' => 'pending',
        ]);
        foreach (['inventories', 'inventory_movements', 'receivings', 'receiving_items',
            'qa_inspections', 'qa_inspection_items', 'purchase_orders', 'purchase_order_items',
            'suppliers', 'orders', 'order_items', 'stock_out_transactions'] as $table) {
            if (Schema::hasTable($table)) {
                $this->assertDatabaseCount($table, 0);
            }
        }
        $this->assertDatabaseCount('products', 1);
        $this->assertDatabaseCount('warehouses', 1);
    }

    public function test_invalid_product_is_rejected(): void
    {
        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => 999999, 'warehouse_id' => $this->warehouse->id,
            'requested_qty' => 15, 'priority' => 'Medium',
        ])->assertUnprocessable()->assertJsonValidationErrors('product_id');
        $this->assertDatabaseCount('replenishment_requests', 0);
    }

    public function test_invalid_warehouse_is_rejected(): void
    {
        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => $this->product->id, 'warehouse_id' => 999999,
            'requested_qty' => 15, 'priority' => 'Medium',
        ])->assertUnprocessable()->assertJsonValidationErrors('warehouse_id');
        $this->assertDatabaseCount('replenishment_requests', 0);
    }

    public function test_quantity_must_be_greater_than_zero(): void
    {
        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => $this->product->id, 'warehouse_id' => $this->warehouse->id,
            'requested_qty' => 0, 'priority' => 'Medium',
        ])->assertUnprocessable()->assertJsonValidationErrors('requested_qty');
        $this->assertDatabaseCount('replenishment_requests', 0);
    }
}
