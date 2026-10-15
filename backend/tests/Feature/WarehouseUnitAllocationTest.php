<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use App\Support\WarehouseCapacity;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class WarehouseUnitAllocationTest extends TestCase
{
    use RefreshDatabase;

    private Warehouse $warehouse;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $branch = Branch::create(['name' => 'Allocation Branch', 'code' => 'ALLOC']);
        $this->warehouse = Warehouse::create(['name' => 'Allocation Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id, 'capacity' => 10000, 'status' => 'Active']);
        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
    }

    private function configure(Warehouse $warehouse, int $kg = 4000, int $pcs = 3000, int $liters = 3000): void
    {
        $warehouse->update(['capacity' => $kg + $pcs + $liters, 'capacity_kg' => $kg, 'capacity_pcs' => $pcs, 'capacity_l' => $liters]);
    }

    private function allocationPayload(array $overrides = []): array
    {
        return array_replace(['name' => $this->warehouse->name, 'code' => 'WH-MAIN', 'status' => 'Active', 'capacity' => 10000, 'capacity_kg' => 4000, 'capacity_pcs' => 3000, 'capacity_l' => 3000], $overrides);
    }

    private function inventory(string $unit, int $available, int $reserved = 0, ?Warehouse $warehouse = null): Inventory
    {
        $product = Product::create(['name' => 'Material '.uniqid(), 'unit' => $unit, 'cost_price' => 1]);
        return Inventory::create(['barcode' => uniqid('ALLOC-'), 'product_id' => $product->id, 'warehouse_id' => ($warehouse ?? $this->warehouse)->id, 'available_stock' => $available, 'reserved_stock' => $reserved, 'backload' => 0, 'status' => 'Available']);
    }

    private function stockPayload(string $unit, int $quantity, array $extra = []): array
    {
        return array_replace(['barcode' => uniqid('NEW-'), 'product' => uniqid('New Product '), 'unit' => $unit, 'warehouse_id' => $this->warehouse->id, 'available_stock' => $quantity, 'reserved_stock' => 0, 'backload' => 0, 'status' => 'Available'], $extra);
    }

    public function test_explicit_split_is_saved_against_one_total_and_no_example_is_prepopulated(): void
    {
        $this->actingAs($this->admin)->getJson('/api/admin/warehouse/location')->assertOk()
            ->assertJsonPath('capacity', 10000)->assertJsonPath('capacity_kg', null)
            ->assertJsonPath('capacity_pcs', null)->assertJsonPath('capacity_l', null)
            ->assertJsonPath('allocation_configured', false)->assertJsonPath('allocated_total', 0);
        $this->putJson('/api/admin/warehouse/location', $this->allocationPayload())->assertOk()
            ->assertJsonPath('capacity', 10000)->assertJsonPath('allocated_total', 10000)
            ->assertJsonPath('allocation_configured', true)->assertJsonPath('unit_capacity.KG.allocated', 4000)
            ->assertJsonPath('unit_capacity.PCS.allocated', 3000)->assertJsonPath('unit_capacity.L.allocated', 3000);
    }

    public function test_bad_totals_negative_fractional_and_missing_values_are_rejected(): void
    {
        $this->actingAs($this->admin);
        foreach ([['capacity_kg' => 10000, 'capacity_pcs' => 10000, 'capacity_l' => 10000], ['capacity_kg' => 3999], ['capacity_kg' => -1], ['capacity_l' => 1.5], ['capacity_pcs' => null]] as $values) {
            $this->putJson('/api/admin/warehouse/location', $this->allocationPayload($values))->assertUnprocessable();
            $this->assertNull($this->warehouse->fresh()->capacity_kg);
            $this->assertSame(10000, $this->warehouse->fresh()->capacity);
        }
        $this->putJson('/api/admin/warehouse/location', $this->allocationPayload(['capacity_kg' => 3999]))
            ->assertJsonValidationErrors('capacity')->assertJsonPath('errors.capacity.0', 'KG, PCS, and L allocations must add up exactly to Total Capacity.');
    }

    public function test_database_rejects_invalid_allocations_outside_the_api(): void
    {
        foreach ([['capacity_kg' => -1, 'capacity_pcs' => 7001, 'capacity_l' => 3000], ['capacity_kg' => 4000], ['capacity_kg' => 10000, 'capacity_pcs' => 10000, 'capacity_l' => 10000]] as $values) {
            try {
                DB::transaction(fn () => DB::table('warehouses')->where('id', $this->warehouse->id)->update($values));
                $this->fail('Database accepted invalid allocation values.');
            } catch (QueryException $exception) {
                $this->assertStringContainsString('warehouse_capacity_allocations_valid', $exception->getMessage());
            }
        }
    }

    public function test_usage_is_scoped_by_catalog_unit_and_warehouse_and_includes_reserved_stock(): void
    {
        $this->configure($this->warehouse);
        $kg = $this->inventory(' kg ', 1000, 200);
        $kg->update(['backload' => 999]);
        $this->inventory("\tKg\n", 30, 20);
        $this->inventory('PCS', 450, 50);
        $this->inventory('l', 75, 25);
        $this->inventory('BAG', 20);
        $other = Warehouse::create(['name' => 'Other', 'code' => 'OTHER', 'branch_id' => $this->warehouse->branch_id]);
        $this->inventory('KG', 8000, 0, $other);
        $this->actingAs($this->admin)->getJson('/api/admin/warehouse/location')->assertOk()
            ->assertJsonPath('unit_capacity.KG.used', 1250)->assertJsonPath('unit_capacity.KG.remaining', 2750)
            ->assertJsonPath('unit_capacity.PCS.used', 500)->assertJsonPath('unit_capacity.PCS.remaining', 2500)
            ->assertJsonPath('unit_capacity.L.used', 100)->assertJsonPath('unit_capacity.L.remaining', 2900)
            ->assertJsonPath('unsupported_unit_usage.0.unit', 'BAG')->assertJsonPath('unsupported_unit_usage.0.used', 20)
            ->assertJsonPath('utilized', null)->assertJsonPath('utilization_percentage', null);
    }

    public function test_addition_can_fill_its_unit_exactly_but_cannot_borrow_another_units_space(): void
    {
        $this->configure($this->warehouse);
        $this->inventory('KG', 3999);
        $this->actingAs($this->admin)->postJson('/api/inventory', $this->stockPayload('KG', 1))->assertCreated();
        $this->postJson('/api/inventory', $this->stockPayload('KG', 1))->assertUnprocessable()
            ->assertJsonPath('capacity_unit', 'KG')->assertJsonPath('available_capacity', 0);
        $this->postJson('/api/inventory', $this->stockPayload('L', 1))->assertCreated();
        $this->assertSame(4000, WarehouseCapacity::snapshot($this->warehouse)['unit_capacity']['KG']['used']);
    }

    public function test_inventory_update_uses_only_positive_delta_and_catalog_unit_even_if_client_lies(): void
    {
        $this->configure($this->warehouse);
        $item = $this->inventory('KG', 3990, 5);
        $this->actingAs($this->admin)->putJson("/api/inventory/{$item->id}", ['available_stock' => 3995, 'unit' => 'PCS'])->assertOk();
        $this->putJson("/api/inventory/{$item->id}", ['reserved_stock' => 6])->assertUnprocessable()->assertJsonPath('capacity_unit', 'KG');
        $this->assertSame(5, $item->fresh()->reserved_stock);
        $this->putJson("/api/inventory/{$item->id}", ['available_stock' => 3900, 'warehouse_id' => (string) $this->warehouse->id])->assertOk();
        $this->assertSame('KG', $item->product->unit);
    }

    public function test_transfer_validates_destination_allocation_and_keeps_failed_move_atomic(): void
    {
        $this->configure($this->warehouse);
        $other = Warehouse::create(['name' => 'Destination', 'code' => 'DEST', 'branch_id' => $this->warehouse->branch_id]);
        $this->configure($other, 5, 100, 100);
        $item = $this->inventory('KG', 4, 2);
        $this->actingAs($this->admin)->putJson("/api/inventory/{$item->id}", ['warehouse_id' => $other->id])->assertUnprocessable()
            ->assertJsonPath('capacity_unit', 'KG')->assertJsonPath('requested_quantity', 6)->assertJsonPath('available_capacity', 5);
        $this->assertSame($this->warehouse->id, $item->fresh()->warehouse_id);
        $this->assertSame(4, $item->fresh()->available_stock);
        $this->putJson("/api/inventory/{$item->id}", ['warehouse_id' => $other->id, 'reserved_stock' => 1])->assertOk();
        $this->assertSame($other->id, $item->fresh()->warehouse_id);
        $snapshot = WarehouseCapacity::snapshot($other);
        $this->assertSame(5, $snapshot['unit_capacity']['KG']['used']);
        $this->assertSame(0, $snapshot['unit_capacity']['KG']['remaining']);
    }

    public function test_legacy_warehouses_preserve_stock_and_allow_reductions_but_block_increases_and_transfers(): void
    {
        $item = $this->inventory('PCS', 7, 2);
        $barcode = $item->barcode;
        $this->actingAs($this->admin)->postJson('/api/inventory', $this->stockPayload('PCS', 1))->assertUnprocessable();
        $this->putJson("/api/inventory/{$item->id}", ['available_stock' => 8])->assertUnprocessable();
        $this->putJson("/api/inventory/{$item->id}", ['available_stock' => 6])->assertOk();
        $this->putJson('/api/admin/warehouse/location', ['name' => 'Renamed', 'code' => 'WH-MAIN', 'status' => 'Active'])->assertOk();
        $this->assertNull($this->warehouse->fresh()->capacity_pcs);
        $this->assertSame($barcode, $item->fresh()->barcode);
        $other = Warehouse::create(['name' => 'Unconfigured', 'code' => 'UNCONFIGURED', 'branch_id' => $this->warehouse->branch_id]);
        $this->putJson("/api/inventory/{$item->id}", ['warehouse_id' => $other->id])->assertUnprocessable();
        $this->assertSame($this->warehouse->id, $item->fresh()->warehouse_id);
    }

    public function test_zero_allocation_unknown_units_and_existing_product_creation_cannot_bypass_limits(): void
    {
        $this->configure($this->warehouse, 0, 10000, 0);
        $this->actingAs($this->admin)->postJson('/api/inventory', $this->stockPayload('KG', 1))->assertUnprocessable();
        $this->postJson('/api/inventory', $this->stockPayload('BAG', 1))->assertUnprocessable();
        $product = Product::create(['name' => 'Existing KG Product', 'unit' => 'KG']);
        $this->postJson('/api/inventory', $this->stockPayload('PCS', 1, ['product' => $product->name]))->assertUnprocessable()->assertJsonValidationErrors('unit');
        $this->assertDatabaseCount('inventories', 0);
    }

    public function test_configuration_cannot_lower_a_unit_limit_below_existing_stock(): void
    {
        $this->inventory('KG', 4001);
        $this->actingAs($this->admin)->putJson('/api/admin/warehouse/location', $this->allocationPayload())->assertUnprocessable()->assertJsonValidationErrors('capacity_kg');
        $this->assertNull($this->warehouse->fresh()->capacity_kg);
    }

    public function test_plant_manager_can_read_stock_in_target_allocations_but_cannot_edit_them(): void
    {
        $this->configure($this->warehouse);
        $role = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $manager = User::factory()->create(['role_id' => $role->id, 'warehouse_id' => $this->warehouse->id, 'status' => 'ACTIVE']);
        $this->actingAs($manager)->getJson('/api/stock-in/capacity')->assertOk()->assertJsonPath('unit_capacity.PCS.allocated', 3000);
        $this->putJson('/api/admin/warehouse/location', $this->allocationPayload())->assertForbidden();
        $this->getJson('/api/plant-manager/warehouse')->assertOk()->assertJsonPath('allocated_total', 10000);
    }

    public function test_additive_migration_preserves_legacy_capacity_stock_and_barcodes_without_allocations(): void
    {
        $item = $this->inventory('PCS', 12);
        $migration = require database_path('migrations/2026_10_14_000000_add_unit_capacity_allocations_to_warehouses.php');
        $migration->down();
        $migration->up();
        $this->assertSame(10000, $this->warehouse->fresh()->capacity);
        $this->assertNull($this->warehouse->fresh()->capacity_kg);
        $this->assertNull($this->warehouse->fresh()->capacity_pcs);
        $this->assertNull($this->warehouse->fresh()->capacity_l);
        $this->assertSame($item->barcode, $item->fresh()->barcode);
        $this->assertSame(12, $item->fresh()->available_stock);
    }

    public function test_catalog_edit_cannot_relabel_kg_stock_as_pcs_to_bypass_allocation_limits(): void
    {
        $this->configure($this->warehouse);
        $item = $this->inventory('KG', 100);
        $this->actingAs($this->admin)->putJson('/api/admin/products/'.$item->product_id, ['name' => $item->product->name, 'unit' => 'PCS'])
            ->assertUnprocessable()->assertJsonValidationErrors('unit');
        $this->assertSame('KG', $item->product->fresh()->unit);
        $this->assertSame(100, WarehouseCapacity::snapshot($this->warehouse)['unit_capacity']['KG']['used']);
        $item->product->update(['unit' => null]);
        $this->putJson('/api/admin/products/'.$item->product_id, ['name' => $item->product->name, 'unit' => 'PCS'])
            ->assertUnprocessable()->assertJsonValidationErrors('unit');
        $this->assertNull($item->product->fresh()->unit);
    }
}
