<?php
namespace Tests\Support;

use App\Models\Bom;
use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

abstract class ProductionFixture extends TestCase
{
    use RefreshDatabase;
    protected User $admin;
    protected User $manager;
    protected User $qa;
    protected User $otherManager;
    protected Warehouse $warehouse;
    protected Warehouse $otherWarehouse;
    protected Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake(); Mail::fake(); Storage::fake('local');
        $branch = Branch::create(['name' => 'Test Branch', 'code' => 'PROD-TEST']);
        $this->warehouse = Warehouse::create(['name' => 'Test Main', 'code' => 'WH-MAIN', 'branch_id' => $branch->id, 'status' => 'Active', 'capacity' => 10000, 'capacity_kg' => 4000, 'capacity_pcs' => 3000, 'capacity_l' => 3000]);
        $this->otherWarehouse = Warehouse::create(['name' => 'Other', 'code' => 'WH-OTHER', 'branch_id' => $branch->id, 'status' => 'Active', 'capacity' => 10000, 'capacity_kg' => 4000, 'capacity_pcs' => 3000, 'capacity_l' => 3000]);
        foreach (['ADMIN', 'PLANT_MANAGER', 'QA_SUPERVISOR'] as $slug) Role::create(['slug' => $slug, 'name' => $slug]);
        $this->admin = $this->actor('ADMIN');
        $this->manager = $this->actor('PLANT_MANAGER', $this->warehouse);
        $this->qa = $this->actor('QA_SUPERVISOR', $this->warehouse);
        $this->otherManager = $this->actor('PLANT_MANAGER', $this->otherWarehouse);
        $this->supplier = Supplier::create(['supplier_code' => 'SUP-PROD', 'name' => 'Test Supplier', 'status' => 'ACTIVE']);
    }
    protected function actor(string $role, ?Warehouse $warehouse = null): User
    {
        return User::factory()->create(['role_id' => Role::where('slug', $role)->value('id'), 'warehouse_id' => $warehouse?->id, 'status' => 'ACTIVE']);
    }
    protected function product(string $classification = Product::FINISHED_PRODUCT, string $unit = 'PCS', ?Warehouse $warehouse = null): Product
    {
        $id = $this->actingAs($this->admin)->postJson('/api/admin/products', [
            'name' => 'Test '.uniqid(), 'unit' => $unit, 'item_classification' => $classification,
            'supplier_id' => $this->supplier->id, 'warehouse_id' => ($warehouse ?? $this->warehouse)->id,
        ])->assertCreated()->json('id');
        return Product::findOrFail($id);
    }
    protected function stock(Product $product, int $quantity, int $reserved = 0): Inventory
    {
        $inventory = $product->inventories()->where('warehouse_id', $this->warehouse->id)->firstOrFail();
        $inventory->update(['available_stock' => $quantity, 'reserved_stock' => $reserved, 'status' => $quantity ? 'Available' : 'Out of Stock']);
        return $inventory;
    }
    protected function bom(Product $output, array $materials, int $outputQuantity = 1): Bom
    {
        $id = $this->actingAs($this->admin)->postJson('/api/admin/boms', ['product_id' => $output->id, 'output_quantity' => $outputQuantity, 'materials' => $materials])
            ->assertCreated()->json('data.id');
        return Bom::findOrFail($id);
    }
    protected function planned(Product $output, int $quantity = 2): int
    {
        return $this->actingAs($this->manager)->postJson('/api/production/batches', ['product_id' => $output->id, 'warehouse_id' => $this->warehouse->id, 'target_quantity' => $quantity])
            ->assertCreated()->assertJsonPath('data.status', 'PLANNED')->json('data.id');
    }
    protected function prepared(string $coefficient = '0.5'): array
    {
        $raw = $this->product(Product::RAW_MATERIAL, 'KG');
        $output = $this->product(Product::FINISHED_PRODUCT, 'PCS');
        $inventory = $this->stock($raw, 10);
        $bom = $this->bom($output, [['product_id' => $raw->id, 'required_quantity' => $coefficient]]);
        $batch = $this->planned($output);
        return [$raw, $output, $inventory, $bom, $batch];
    }
    protected function outputAndQa(int $batch, int $produced = 2, int $passed = 2, int $failed = 0): void
    {
        $record = \App\Models\ProductionBatch::findOrFail($batch);
        $this->travelTo(\Illuminate\Support\Carbon::parse(\App\Support\ProductionRules::timing($record)['output_available_at'] ?? now()));
        $output = ['actual_quantity' => $produced, 'assigned_qa_user_id' => $this->qa->id];
        $inspection = ['passed_quantity' => $passed, 'failed_quantity' => $failed, 'notes' => 'Manual internal output inspection'];
        if ($produced > $record->target_quantity) {
            $output['excess_confirmation'] = ['target_quantity' => $record->target_quantity, 'actual_quantity' => $produced, 'confirmed' => true];
            $inspection['excess_confirmation'] = ['target_quantity' => $record->target_quantity, 'actual_quantity' => $produced, 'passed_quantity' => $passed, 'failed_quantity' => $failed,
                'inspection_notes' => $inspection['notes'],
                'quantity_verified' => true, 'passed_inspected' => $passed > 0, 'passed_meets_requirements' => $passed > 0, 'failed_excluded' => $failed > 0];
        }
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/output", $output)->assertOk()->assertJsonPath('data.status', 'PENDING_QA');
        $this->actingAs($this->qa)->postJson("/api/production/batches/{$batch}/qa", $inspection)->assertOk();
    }
}
