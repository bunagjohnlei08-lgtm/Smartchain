<?php

namespace Tests\Feature;

use App\Models\{Branch, Inventory, Product, PurchaseOrder, QaInspection, Receiving, Role, Supplier, User, Warehouse};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ReleaseMigrationCompatibilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_release_migrations_preserve_existing_procurement_receiving_and_qa_records(): void
    {
        // RefreshDatabase and TestCase enforce smartchain_test_db. PostgreSQL DDL
        // runs inside the test transaction and is rolled back with the fixtures.
        $names = [
            '2026_11_01_000000_create_excess_delivery_reviews.php',
            '2026_11_02_000000_complete_excess_delivery_resolution_workflow.php',
            '2026_11_03_000000_allow_multiple_qa_inspection_cycles.php',
            '2026_11_04_000000_create_supplier_product_purchasing_terms.php',
            '2026_11_05_000000_make_purchasing_term_agreement_reference_nullable.php',
        ];
        $migrations = array_map(fn ($name) => require database_path('migrations/'.$name), $names);
        foreach (array_reverse($migrations) as $migration) $migration->down();

        $role = Role::create(['slug'=>'ADMIN', 'name'=>'Admin']);
        $admin = User::factory()->create(['role_id'=>$role->id]);
        $product = Product::create(['name'=>'Existing legacy product', 'unit'=>'kg', 'cost_price'=>'12.50']);
        $supplier = Supplier::create(['supplier_code'=>'SUP-MIGRATION', 'name'=>'Existing supplier', 'status'=>'ACTIVE']);
        $branch = Branch::create(['name'=>'Migration branch', 'code'=>'MIGRATION']);
        $warehouse = Warehouse::create(['name'=>'Migration warehouse', 'code'=>'MIGRATION', 'branch_id'=>$branch->id]);
        Inventory::create(['barcode'=>'INV-MIGRATION', 'product_id'=>$product->id, 'warehouse_id'=>$warehouse->id, 'available_stock'=>8]);
        $order = PurchaseOrder::create(['po_number'=>'PO-MIGRATION', 'supplier_id'=>$supplier->id, 'supplier_name'=>$supplier->name,
            'delivery_details'=>'Existing destination', 'expected_delivery_date'=>today(), 'status'=>'Approved', 'total_amount'=>'125.00', 'approved_by'=>$admin->id]);
        $poItem = $order->items()->create(['product_id'=>$product->id, 'product_name'=>$product->name, 'unit'=>'kg', 'ordered_quantity'=>10, 'unit_price'=>'12.50', 'total_price'=>'125.00']);
        $receiving = Receiving::create(['receiving_no'=>'RCV-MIGRATION', 'purchase_order_id'=>$order->id, 'purchase_order'=>$order->po_number,
            'supplier'=>$supplier->name, 'delivery_date'=>today(), 'status'=>'Partial', 'prepared_by_id'=>$admin->id]);
        $item = $receiving->items()->create(['purchase_order_item_id'=>$poItem->id, 'product_id'=>$product->id, 'product_name'=>$product->name,
            'unit'=>'kg', 'ordered_quantity'=>10, 'delivered_quantity'=>10, 'inspection_status'=>'Partial']);
        $inspection = QaInspection::create(['receiving_id'=>$receiving->id, 'status'=>'Partial', 'completed_at'=>now(), 'inspected_by_id'=>$admin->id]);
        $inspection->items()->create(['receiving_item_id'=>$item->id, 'accepted_quantity'=>8, 'rejected_quantity'=>2, 'inspection_result'=>'Partial']);
        $tables = ['products','suppliers','purchase_orders','purchase_order_items','receivings','receiving_items','qa_inspections','qa_inspection_items','inventories'];
        $before = [];
        foreach ($tables as $table) $before[$table] = DB::table($table)->orderBy('id')->get()->toArray();
        foreach ($migrations as $migration) $migration->up();
        foreach ($tables as $table) {
            $originalColumns = array_keys((array) $before[$table][0]);
            $after = DB::table($table)->select($originalColumns)->orderBy('id')->get()->toArray();
            $this->assertEquals($before[$table], $after, $table.' existing data changed');
        }
        $this->assertSame(1, $inspection->fresh()->cycle_number);
        $this->assertNull($poItem->fresh()->supplier_product_purchasing_term_id);
        $this->assertSame('kg', $product->fresh()->unit);
        $this->assertTrue(Schema::hasTable('excess_delivery_documents'));
        $this->assertTrue(Schema::hasTable('supplier_product_purchasing_terms'));
        $secondCycle = $receiving->qaInspections()->create(['cycle_number'=>2, 'status'=>'Pending', 'inspected_by_id'=>$admin->id]);
        $this->assertSame(2, $secondCycle->fresh()->cycle_number);
        $this->assertSame(2, $receiving->qaInspections()->count());
        $this->assertSame($secondCycle->id, $receiving->fresh()->qaInspection->id);
        $this->assertSame(8, (int) Inventory::where('barcode', 'INV-MIGRATION')->value('available_stock'));
    }
}
