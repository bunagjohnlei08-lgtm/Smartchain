<?php
namespace Tests\Feature;

use App\Models\Inventory;
use App\Models\Product;
use App\Models\ReplenishmentRequest;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;
use Tests\Support\ProductionFixture;

class CatalogClassificationAndDeletionTest extends ProductionFixture
{
    public function test_inventory_deletion_cannot_bypass_product_stock_history_protection(): void
    {
        $used = $this->product(); $inventory = $this->stock($used, 1); $inventory->update(['available_stock' => 0]);
        $this->actingAs($this->admin)->deleteJson("/api/inventory/{$inventory->id}")->assertConflict();
        $this->deleteJson("/api/admin/products/{$used->id}")->assertConflict();
        $unused = $this->product(); $setup = $unused->inventories()->firstOrFail();
        $this->deleteJson("/api/inventory/{$setup->id}")->assertOk();
        $this->deleteJson("/api/admin/products/{$unused->id}")->assertOk();
    }

    public function test_legacy_manual_adjustment_history_survives_a_previously_removed_inventory_row(): void
    {
        $product = $this->product(); $inventory = $product->inventories()->firstOrFail();
        $this->actingAs($this->admin)->putJson("/api/inventory/{$inventory->id}", ['available_stock' => 1])->assertOk();
        $this->putJson("/api/inventory/{$inventory->id}", ['available_stock' => 0])->assertOk();
        DB::table('inventories')->where('id', $inventory->id)->delete(); // Simulate the earlier unrestricted deletion API.
        $this->deleteJson("/api/admin/products/{$product->id}")->assertConflict()->assertJsonFragment(['audit_logs (inventory adjustments)']);
        $this->putJson("/api/admin/products/{$product->id}", ['name' => $product->name, 'unit' => 'KG'])->assertUnprocessable();
    }
    public function test_additive_catalog_migration_preserves_existing_units_quantities_and_barcodes(): void
    {
        $explicit = $this->product(Product::FINISHED_PRODUCT, 'KG');
        $legacy = $this->product();
        $stock = $this->stock($explicit, 7, 2);
        $before = $stock->only(['barcode', 'available_stock', 'reserved_stock', 'backload', 'product_id', 'warehouse_id']);
        $migration = require database_path('migrations/2026_10_14_010000_add_catalog_classification_and_setup_provenance.php');
        $migration->down();
        DB::table('products')->where('id', $legacy->id)->update(['unit' => null]);
        $migration->up();
        $this->assertSame($before, $stock->fresh()->only(array_keys($before)));
        $this->assertSame('KG', $explicit->fresh()->unit);
        $this->assertSame('PCS', $legacy->fresh()->unit);
        $this->assertSame(Product::FINISHED_PRODUCT, $explicit->fresh()->item_classification);
        $this->assertNull($this->warehouse->fresh()->capacity_unit_alert_levels);
    }

    public function test_name_only_legacy_purchase_order_protects_empty_setup_after_catalog_rename(): void
    {
        $product = $this->product();
        $po = \App\Models\PurchaseOrder::create(['po_number' => 'LEGACY-PO', 'supplier_name' => 'Test Supplier',
            'delivery_details' => 'Test', 'expected_delivery_date' => now()->toDateString(), 'status' => 'Completed', 'total_amount' => 1, 'approved_by' => $this->admin->id]);
        $po->items()->create(['product_name' => $product->name, 'ordered_quantity' => 1, 'unit_price' => 1, 'total_price' => 1]);
        $this->actingAs($this->admin)->putJson("/api/admin/products/{$product->id}", ['name' => 'Renamed Legacy Product'])->assertOk();
        $this->deleteJson("/api/admin/products/{$product->id}")->assertConflict()->assertJsonFragment(['purchase_order_items']);
        $this->putJson("/api/admin/products/{$product->id}", ['name' => 'Renamed Legacy Product', 'unit' => 'KG'])->assertUnprocessable()->assertJsonValidationErrors('unit');
    }
    public function test_legacy_defaults_and_each_classification_support_all_three_configured_units(): void
    {
        $legacy = Product::create(['name' => 'Default Legacy']);
        $this->assertSame(Product::FINISHED_PRODUCT, $legacy->item_classification);
        $this->assertSame('PCS', $legacy->unit);
        foreach (Product::CLASSIFICATIONS as $classification) foreach (['KG', 'L', 'PCS'] as $unit) {
            $product = $this->product($classification, $unit);
            $this->assertSame($unit, $product->unit);
            $this->assertSame($classification, $product->item_classification);
            $this->assertSame($this->supplier->id, $product->suppliers()->first()->id);
            $this->assertSame(0, $product->inventories()->first()->available_stock);
        }
        $this->actingAs($this->admin)->getJson('/api/admin/products?item_classification=RAW_MATERIAL')->assertOk()->assertJsonCount(3, 'data');
        $this->getJson('/api/inventory?item_classification=RAW_MATERIAL')->assertOk()->assertJsonCount(3, 'data');
    }

    public function test_zero_stock_creation_uses_saved_supported_units_even_when_allocation_is_full(): void
    {
        $raw = $this->product(Product::RAW_MATERIAL, 'KG'); $this->stock($raw, 4000);
        $created = $this->product(Product::FINISHED_PRODUCT, 'KG');
        $this->assertSame(0, $created->inventories()->first()->available_stock);
        $this->actingAs($this->admin)->putJson('/api/admin/warehouse/location', ['name' => $this->warehouse->name, 'code' => 'WH-MAIN', 'status' => 'Active',
            'capacity' => 10000, 'capacity_kg' => 0, 'capacity_pcs' => 7000, 'capacity_l' => 3000])->assertUnprocessable()->assertJsonValidationErrors('capacity_kg');
    }

    public function test_missing_or_disabled_unit_setup_and_invalid_classification_are_rejected(): void
    {
        $payload = ['name' => 'Invalid Setup', 'unit' => 'KG', 'supplier_id' => $this->supplier->id, 'warehouse_id' => $this->warehouse->id];
        $this->warehouse->update(['capacity_kg' => 0, 'capacity_pcs' => 7000]);
        $this->actingAs($this->admin)->postJson('/api/admin/products', $payload)->assertUnprocessable()->assertJsonValidationErrors('unit');
        $this->warehouse->update(['capacity_kg' => null, 'capacity_pcs' => null, 'capacity_l' => null]);
        $this->postJson('/api/admin/products', [...$payload, 'unit' => 'PCS'])->assertUnprocessable();
        $this->postJson('/api/admin/products', [...$payload, 'item_classification' => 'GUESSED'])->assertUnprocessable()->assertJsonValidationErrors('item_classification');
        $this->postJson('/api/admin/products', array_diff_key($payload, ['unit' => true]))->assertUnprocessable()->assertJsonValidationErrors('unit');
    }

    public function test_unused_setup_can_change_unit_without_changing_stock_or_barcode_and_can_be_deleted(): void
    {
        $product = $this->product(Product::RAW_MATERIAL, 'KG'); $inventory = $product->inventories()->firstOrFail();
        $this->actingAs($this->admin)->putJson("/api/admin/products/{$product->id}", ['name' => $product->name, 'unit' => 'L'])
            ->assertOk()->assertJsonPath('unit', 'L');
        $this->assertSame($inventory->barcode, $inventory->fresh()->barcode);
        $this->assertSame(0, $inventory->fresh()->available_stock);
        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/options')->assertOk()->assertJsonCount(1, 'data');
        $this->assertDatabaseCount('replenishment_requests', 0);
        $this->actingAs($this->admin)->deleteJson("/api/admin/products/{$product->id}")->assertOk();
        $this->assertDatabaseMissing('products', ['id' => $product->id]);
        $this->assertDatabaseMissing('inventories', ['id' => $inventory->id]);
        $this->assertDatabaseMissing('product_supplier', ['product_id' => $product->id]);
        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/options')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_real_stock_reservations_or_unproven_zero_inventory_block_deletion_and_unit_changes(): void
    {
        $product = $this->product(); $inventory = $this->stock($product, 1, 2);
        $this->actingAs($this->admin)->deleteJson("/api/admin/products/{$product->id}")->assertConflict();
        $this->putJson("/api/admin/products/{$product->id}", ['name' => $product->name, 'unit' => 'KG'])->assertUnprocessable();
        $inventory->update(['available_stock' => 0, 'reserved_stock' => 0]);
        $this->assertNull($inventory->fresh()->catalog_setup_at);
        $this->deleteJson("/api/admin/products/{$product->id}")->assertConflict();
        $this->putJson("/api/admin/products/{$product->id}", ['name' => $product->name, 'unit' => 'KG'])->assertUnprocessable();
    }

    public function test_actual_replenishment_history_and_bom_dependencies_remain_protected_at_zero_stock(): void
    {
        $product = $this->product();
        ReplenishmentRequest::create(['request_no' => 'RR-HISTORY', 'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id,
            'requested_by' => $this->manager->id, 'requested_qty' => 5, 'priority' => 'Critical', 'status' => 'completed']);
        $this->actingAs($this->admin)->deleteJson("/api/admin/products/{$product->id}")->assertConflict()->assertJsonFragment(['replenishment_requests']);
        [$raw, $output] = $this->prepared();
        foreach ([$raw, $output] as $item) {
            $this->actingAs($this->admin)->deleteJson("/api/admin/products/{$item->id}")->assertConflict();
            $this->putJson("/api/admin/products/{$item->id}", ['name' => $item->name, 'unit' => 'L'])->assertUnprocessable();
        }
    }

    public function test_raw_materials_are_filtered_and_rejected_by_customer_order_api_and_catalog_is_admin_only(): void
    {
        $raw = $this->product(Product::RAW_MATERIAL, 'L'); $finished = $this->product(Product::FINISHED_PRODUCT, 'KG');
        $this->actingAs($this->admin)->getJson('/api/admin/orders/products')->assertOk()->assertJsonFragment(['id' => $finished->id])->assertJsonMissing(['id' => $raw->id]);
        $this->postJson('/api/admin/orders', ['customer_name' => 'Test Customer', 'customer_address' => 'Test Address', 'order_date' => now()->toDateString(),
            'required_delivery_date' => now()->addDay()->toDateString(), 'items' => [['product_id' => $raw->id, 'quantity' => 1, 'unit' => 'L', 'unit_price' => 1]]])
            ->assertUnprocessable()->assertJsonValidationErrors('items.0.product_id');
        $this->actingAs($this->manager)->deleteJson("/api/admin/products/{$finished->id}")->assertForbidden();
        $this->assertDatabaseHas('products', ['id' => $finished->id]);
    }

    public function test_same_product_unit_must_be_supported_in_all_assigned_warehouses_on_edit(): void
    {
        $product = $this->product();
        $this->otherWarehouse->update(['capacity_kg' => 0, 'capacity_pcs' => 7000]);
        $this->actingAs($this->admin)->postJson("/api/admin/products/{$product->id}/warehouse", ['warehouse_id' => $this->otherWarehouse->id])->assertOk();
        $this->putJson("/api/admin/products/{$product->id}", ['name' => $product->name, 'unit' => 'KG'])->assertUnprocessable()->assertJsonValidationErrors('unit');
        $this->assertSame('PCS', $product->fresh()->unit);
    }
}
