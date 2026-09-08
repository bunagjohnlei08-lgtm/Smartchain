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

class InventoryAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private Role $adminRole;
    private Role $plantManagerRole;
    private Role $qaSupervisorRole;
    private Warehouse $ownWarehouse;
    private Warehouse $otherWarehouse;
    private Inventory $ownInventory;
    private Inventory $otherInventory;

    protected function setUp(): void
    {
        parent::setUp();

        $this->adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->plantManagerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $this->qaSupervisorRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);

        $ownBranch = Branch::create(['name' => 'Own Branch', 'code' => 'OWN']);
        $otherBranch = Branch::create(['name' => 'Other Branch', 'code' => 'OTHER']);
        $this->ownWarehouse = Warehouse::create(['name' => 'Own Warehouse', 'code' => 'WH-OWN', 'branch_id' => $ownBranch->id]);
        $this->otherWarehouse = Warehouse::create(['name' => 'Other Warehouse', 'code' => 'WH-OTHER', 'branch_id' => $otherBranch->id]);

        $product = Product::create([
            'name' => 'Secure Inventory Product',
            'category' => 'Materials',
            'brand' => 'SmartChain',
            'unit' => 'pcs',
            'cost_price' => 125.50,
        ]);

        $this->ownInventory = $this->inventory($product, $this->ownWarehouse, 'OWN-BARCODE');
        $this->otherInventory = $this->inventory($product, $this->otherWarehouse, 'OTHER-BARCODE');
    }

    private function inventory(Product $product, Warehouse $warehouse, string $barcode): Inventory
    {
        return Inventory::create([
            'barcode' => $barcode,
            'product_id' => $product->id,
            'warehouse_id' => $warehouse->id,
            'available_stock' => 10,
            'reserved_stock' => 2,
            'backload' => 1,
            'status' => 'Available',
            'pending_receiving' => true,
        ]);
    }

    private function user(Role $role, ?Warehouse $warehouse = null): User
    {
        return User::factory()->create([
            'role_id' => $role->id,
            'branch_id' => $warehouse?->branch_id,
            'warehouse_id' => $warehouse?->id,
            'status' => 'ACTIVE',
        ]);
    }

    public function test_unauthenticated_inventory_index_is_rejected(): void
    {
        $this->getJson('/api/inventory')->assertUnauthorized();
    }

    public function test_admin_can_view_inventory_across_warehouses_with_full_fields(): void
    {
        $admin = $this->user($this->adminRole);

        $this->actingAs($admin)->getJson('/api/inventory')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.cost_price', 125.5);

        $this->actingAs($admin)->getJson("/api/inventory/{$this->otherInventory->id}")
            ->assertOk()
            ->assertJsonPath('id', $this->otherInventory->id);
    }

    public function test_inventory_index_is_newest_first_for_admin_and_plant_manager(): void
    {
        $product = $this->ownInventory->product;
        $newestInventory = $this->inventory($product, $this->ownWarehouse, 'NEWEST-BARCODE');

        $this->ownInventory->timestamps = false;
        $this->ownInventory->created_at = now()->subDay();
        $this->ownInventory->save();
        $this->otherInventory->timestamps = false;
        $this->otherInventory->created_at = now()->subHours(2);
        $this->otherInventory->save();

        $admin = $this->user($this->adminRole);
        $this->actingAs($admin)->getJson('/api/inventory')
            ->assertOk()
            ->assertJsonPath('data.0.id', $newestInventory->id)
            ->assertJsonPath('data.1.id', $this->otherInventory->id)
            ->assertJsonPath('data.2.id', $this->ownInventory->id);

        $manager = $this->user($this->plantManagerRole, $this->ownWarehouse);
        $this->actingAs($manager)->getJson('/api/inventory')
            ->assertOk()
            ->assertJsonPath('data.0.id', $newestInventory->id)
            ->assertJsonPath('data.1.id', $this->ownInventory->id);
    }

    public function test_plant_manager_only_sees_assigned_warehouse_inventory(): void
    {
        $manager = $this->user($this->plantManagerRole, $this->ownWarehouse);

        $response = $this->actingAs($manager)->getJson('/api/inventory')->assertOk();
        $response->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $this->ownInventory->id)
            ->assertJsonMissing(['cost_price' => 125.5])
            ->assertJsonMissing(['pending_receiving' => true]);

        $this->actingAs($manager)->getJson('/api/inventory?warehouse_id='.$this->otherWarehouse->id)
            ->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_plant_manager_cannot_access_inventory_by_changing_id(): void
    {
        $manager = $this->user($this->plantManagerRole, $this->ownWarehouse);

        $this->actingAs($manager)->getJson("/api/inventory/{$this->ownInventory->id}")
            ->assertOk()->assertJsonPath('id', $this->ownInventory->id);

        $this->actingAs($manager)->getJson("/api/inventory/{$this->otherInventory->id}")
            ->assertNotFound()->assertJsonMissing(['barcode' => 'OTHER-BARCODE']);
    }

    public function test_qa_supervisor_has_scoped_view_only_inventory_access(): void
    {
        $qaSupervisor = $this->user($this->qaSupervisorRole, $this->ownWarehouse);

        $this->actingAs($qaSupervisor)->getJson('/api/inventory')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $this->ownInventory->id)
            ->assertJsonMissing(['cost_price' => 125.5])
            ->assertJsonMissing(['reserved_stock' => 2])
            ->assertJsonMissing(['backload' => 1])
            ->assertJsonMissing(['pending_receiving' => true]);

        $this->actingAs($qaSupervisor)->getJson("/api/inventory/{$this->otherInventory->id}")
            ->assertNotFound()->assertJsonMissing(['barcode' => 'OTHER-BARCODE']);

        $this->actingAs($qaSupervisor)->putJson("/api/inventory/{$this->ownInventory->id}", [
            'available_stock' => 999,
        ])->assertForbidden();

        $this->assertDatabaseHas('inventories', [
            'id' => $this->ownInventory->id,
            'available_stock' => 10,
        ]);
    }
}
