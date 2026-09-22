<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlantManagerInventoryTrendTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private Warehouse $warehouse;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::create(2026, 9, 23, 12, 0, 0, 'Asia/Manila'));
        $role = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'BR-MAIN']);
        $this->warehouse = Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id]);
        $this->manager = User::factory()->create([
            'role_id' => $role->id,
            'warehouse_id' => $this->warehouse->id,
            'status' => 'ACTIVE',
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function product(string $name): Product
    {
        return Product::create(['name' => $name, 'unit' => 'pcs', 'cost_price' => 1]);
    }

    private function inventory(Product $product, Warehouse $warehouse, int $stock, string $barcode): Inventory
    {
        return Inventory::create([
            'barcode' => $barcode,
            'product_id' => $product->id,
            'warehouse_id' => $warehouse->id,
            'available_stock' => $stock,
            'reserved_stock' => 0,
            'backload' => 0,
            'status' => $stock > 0 ? 'Available' : 'Out of Stock',
        ]);
    }

    private function trend(): array
    {
        return $this->actingAs($this->manager)
            ->getJson('/api/plant-manager/dashboard')
            ->assertOk()
            ->json('data.inventory_trend');
    }

    public function test_current_availability_uses_all_catalog_products_and_counts_each_product_once(): void
    {
        $available = $this->product('Available Product');
        $zero = $this->product('Zero Product');
        $this->product('No Inventory Product');
        $otherBranch = Branch::create(['name' => 'Other Branch', 'code' => 'BR-OTHER']);
        $otherWarehouse = Warehouse::create(['name' => 'Other Warehouse', 'code' => 'WH-OTHER', 'branch_id' => $otherBranch->id]);

        $this->inventory($available, $this->warehouse, 5, 'AVAILABLE-1');
        $this->inventory($available, $otherWarehouse, 7, 'AVAILABLE-2');
        $this->inventory($zero, $this->warehouse, 0, 'ZERO-1');

        $current = collect($this->trend())->last();

        $this->assertSame(12, $current['stock']);
        $this->assertSame(33, $current['availability']);
    }

    public function test_zero_catalog_products_returns_zero_availability(): void
    {
        $current = collect($this->trend())->last();

        $this->assertSame(0, $current['stock']);
        $this->assertSame(0, $current['availability']);
    }

    public function test_historical_stock_and_availability_reconstruct_at_manila_month_end(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 10, 1, 0, 30, 0, 'Asia/Manila'));
        $stocked = $this->product('October Stock');
        $this->product('No Inventory Product');
        $this->inventory($stocked, $this->warehouse, 10, 'OCTOBER-1');
        $receiving = Receiving::create([
            'receiving_no' => 'RCV-MONTH-END',
            'purchase_order' => 'PO-MONTH-END',
            'supplier' => 'Supplier',
            'delivery_date' => '2026-10-01',
            'status' => 'Passed',
        ]);
        ReceivingItem::create([
            'receiving_id' => $receiving->id,
            'product_id' => $stocked->id,
            'warehouse_id' => $this->warehouse->id,
            'product_name' => $stocked->name,
            'delivered_quantity' => 10,
            'unit' => 'pcs',
            'inspection_status' => 'Passed',
            'stocked_in_at' => Carbon::create(2026, 10, 1, 0, 30, 0, 'Asia/Manila')->utc(),
        ]);

        $trend = collect($this->trend());
        $september = $trend->firstWhere('month', 'Sep');
        $october = $trend->last();

        $this->assertSame(0, $september['stock']);
        $this->assertSame(0, $september['availability']);
        $this->assertSame('Oct', $october['month']);
        $this->assertSame(10, $october['stock']);
        $this->assertSame(50, $october['availability']);
    }

    public function test_stock_movement_is_monday_to_sunday_and_monthly_labels_are_unique(): void
    {
        $product = $this->product('Weekly Product');
        $receiving = Receiving::create([
            'receiving_no' => 'RCV-WEEKLY',
            'purchase_order' => 'PO-WEEKLY',
            'supplier' => 'Supplier',
            'delivery_date' => '2026-09-23',
            'status' => 'Passed',
        ]);
        ReceivingItem::create([
            'receiving_id' => $receiving->id,
            'product_id' => $product->id,
            'warehouse_id' => $this->warehouse->id,
            'product_name' => $product->name,
            'delivered_quantity' => 5,
            'unit' => 'pcs',
            'inspection_status' => 'Passed',
            'stocked_in_at' => Carbon::create(2026, 9, 23, 9, 0, 0, 'Asia/Manila')->utc(),
        ]);

        $data = $this->actingAs($this->manager)
            ->getJson('/api/plant-manager/dashboard')
            ->assertOk()
            ->json('data');
        $movement = collect($data['stock_movement']);
        $monthly = collect($data['monthly_inventory_activity']);

        $this->assertSame(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], $movement->pluck('day')->all());
        $this->assertSame([0, 0, 5, 0, 0, 0, 0], $movement->pluck('in')->all());
        $this->assertSame([0, 0, 0, 0, 0, 0, 0], $movement->pluck('out')->all());
        $this->assertSame(['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'], $monthly->pluck('month')->all());
        $this->assertSame($monthly->count(), $monthly->pluck('month')->unique()->count());
        $this->assertSame(5, $monthly->last()['receiving']);
    }
}
