<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use App\Support\WarehouseCapacity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class WarehouseUnitAllocationTest extends TestCase
{
    use RefreshDatabase;

    private Warehouse $warehouse;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp(); Notification::fake();
        $branch = Branch::create(['name' => 'Allocation Branch', 'code' => 'ALLOC']);
        $this->warehouse = Warehouse::create(['name' => 'Main', 'code' => 'WH-MAIN', 'branch_id' => $branch->id, 'capacity' => 100, 'status' => 'Active']);
        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
    }

    private function allocations(array $overrides = []): array
    {
        return array_replace(['name' => 'Main', 'code' => 'WH-MAIN', 'status' => 'Active', 'capacity' => 100,
            'capacity_powder' => 30, 'capacity_liquid' => 20, 'capacity_solid' => 40, 'capacity_returned' => 10], $overrides);
    }

    private function configure(Warehouse $warehouse): void
    {
        $warehouse->update(['capacity' => 100, 'capacity_powder' => 30, 'capacity_liquid' => 20, 'capacity_solid' => 40, 'capacity_returned' => 10]);
    }

    private function inventory(string $unit, int $available, int $reserved = 0): Inventory
    {
        $product = Product::create(['name' => uniqid('Product '), 'unit' => $unit, 'cost_price' => 1]);
        return Inventory::create(['barcode' => uniqid('INV-'), 'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id,
            'available_stock' => $available, 'reserved_stock' => $reserved, 'returned_stock' => 0, 'backload' => 0, 'status' => 'Available']);
    }

    public function test_four_areas_must_exactly_share_one_total(): void
    {
        $this->actingAs($this->admin)->getJson('/api/admin/warehouse/location')->assertOk()
            ->assertJsonPath('allocation_configured', false)->assertJsonPath('capacity_powder', null);
        $this->putJson('/api/admin/warehouse/location', $this->allocations())->assertOk()
            ->assertJsonPath('allocated_total', 100)->assertJsonPath('area_capacity.POWDER.allocated', 30)
            ->assertJsonPath('area_capacity.LIQUID.allocated', 20)->assertJsonPath('area_capacity.SOLID.allocated', 40)
            ->assertJsonPath('area_capacity.RETURNED.allocated', 10);
        $this->putJson('/api/admin/warehouse/location', $this->allocations(['capacity_returned' => 11]))
            ->assertUnprocessable()->assertJsonValidationErrors('capacity');
        $this->putJson('/api/admin/warehouse/location', $this->allocations(['capacity_powder' => -1]))->assertUnprocessable();
    }

    public function test_package_units_map_to_areas_and_reserved_stock_is_not_double_counted(): void
    {
        $this->configure($this->warehouse);
        $this->inventory('SACK', 10, 2); $this->inventory('DRUM', 4, 1); $this->inventory('PCS', 7, 3);
        $this->inventory('KG', 9, 1);
        $snapshot = WarehouseCapacity::snapshot($this->warehouse->fresh());
        $this->assertSame(12, $snapshot['area_capacity']['POWDER']['used']);
        $this->assertSame(5, $snapshot['area_capacity']['LIQUID']['used']);
        $this->assertSame(10, $snapshot['area_capacity']['SOLID']['used']);
        $this->assertSame('KG', $snapshot['unsupported_unit_usage'][0]['unit']);
    }

    public function test_move_to_returned_is_atomic_idempotent_and_preserves_original_unit(): void
    {
        $this->configure($this->warehouse); $inventory = $this->inventory('SACK', 12, 2);
        $payload = ['quantity' => 4, 'source_bucket' => 'available_stock', 'source_type' => 'CUSTOMER_RETURN',
            'source_reference' => 'RET-100', 'idempotency_key' => 'return-100'];
        $this->actingAs($this->admin)->postJson("/api/inventory/{$inventory->id}/returned-storage", $payload)->assertOk();
        $this->postJson("/api/inventory/{$inventory->id}/returned-storage", $payload)->assertOk();
        $inventory->refresh(); $this->assertSame(8, $inventory->available_stock); $this->assertSame(4, $inventory->returned_stock);
        $snapshot = WarehouseCapacity::snapshot($this->warehouse->fresh());
        $this->assertSame(10, $snapshot['area_capacity']['POWDER']['used']);
        $this->assertSame(4, $snapshot['area_capacity']['RETURNED']['used']);
        $this->assertSame(4, $snapshot['area_capacity']['RETURNED']['unit_breakdown']['SACK']);
        $this->assertDatabaseCount('inventory_return_movements', 1);
    }

    public function test_return_area_overflow_rolls_back_source_quantity(): void
    {
        $this->configure($this->warehouse); $inventory = $this->inventory('PCS', 20);
        $this->actingAs($this->admin)->postJson("/api/inventory/{$inventory->id}/returned-storage", [
            'quantity' => 11, 'source_bucket' => 'available_stock', 'source_type' => 'INTERNAL_QA', 'source_reference' => 'QA-1',
        ])->assertUnprocessable()->assertJsonPath('capacity_area', 'RETURNED');
        $this->assertSame(20, $inventory->fresh()->available_stock); $this->assertSame(0, $inventory->fresh()->returned_stock);
    }

    public function test_external_return_counts_only_when_physically_received_and_is_idempotent(): void
    {
        $this->configure($this->warehouse); $inventory = $this->inventory('DRUM', 2);
        $payload = ['quantity' => 3, 'source_type' => 'CUSTOMER_RETURN', 'source_reference' => 'RMA-9', 'idempotency_key' => 'rma-9-received'];
        $this->actingAs($this->admin)->postJson("/api/inventory/{$inventory->id}/returned-receipt", $payload)->assertOk();
        $this->postJson("/api/inventory/{$inventory->id}/returned-receipt", $payload)->assertOk();
        $inventory->refresh(); $this->assertSame(2, $inventory->available_stock); $this->assertSame(3, $inventory->returned_stock);
        $snapshot = WarehouseCapacity::snapshot($this->warehouse->fresh());
        $this->assertSame(2, $snapshot['area_capacity']['LIQUID']['used']);
        $this->assertSame(3, $snapshot['area_capacity']['RETURNED']['unit_breakdown']['DRUM']);
        $this->assertDatabaseCount('inventory_return_movements', 1);
    }

    public function test_allocations_cannot_be_reduced_below_physical_occupancy(): void
    {
        $this->configure($this->warehouse); $this->inventory('DRUM', 18, 2);
        $this->actingAs($this->admin)->putJson('/api/admin/warehouse/location', $this->allocations([
            'capacity_liquid' => 19, 'capacity_solid' => 41,
        ]))->assertUnprocessable()->assertJsonValidationErrors('capacity_liquid');
    }

    public function test_legacy_kg_and_l_are_preserved_but_blocked_from_new_stock_operations(): void
    {
        $this->configure($this->warehouse); $legacy = $this->inventory('KG', 3);
        $this->actingAs($this->admin)->putJson("/api/inventory/{$legacy->id}", ['available_stock' => 4])
            ->assertUnprocessable()->assertJsonPath('capacity_unit', 'KG');
        $this->assertSame('KG', $legacy->product->fresh()->unit); $this->assertSame(3, $legacy->fresh()->available_stock);
    }
}
