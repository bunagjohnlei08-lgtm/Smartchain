<?php
namespace Tests\Feature;

use App\Models\Inventory;
use App\Models\Product;
use App\Models\ProductionBatch;
use Illuminate\Support\Facades\DB;
use Tests\Support\ProductionFixture;

class InternalProductionTest extends ProductionFixture
{
    public function test_existing_reports_expose_classified_stock_and_scoped_production_history(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared();
        $this->actingAs($this->admin)->getJson('/api/admin/reports/preview?report_key=inventory.raw_materials')->assertOk()
            ->assertJsonFragment(['product' => $raw->name, 'unit' => 'KG'])->assertJsonMissing(['product' => $output->name]);
        $this->getJson('/api/admin/reports/preview?report_key=inventory.finished_products')->assertOk()->assertJsonFragment(['product' => $output->name]);
        $this->getJson('/api/admin/reports/preview?report_key=warehouse.production_batches')->assertOk()->assertJsonFragment(['product' => $output->name, 'unit' => 'PCS']);
        $this->actingAs($this->manager)->getJson('/api/plant-manager/reports/generate?type=production&format=preview')->assertOk()->assertJsonCount(1, 'report.rows');
        $this->actingAs($this->otherManager)->getJson('/api/plant-manager/reports/generate?type=production&format=preview')->assertOk()->assertJsonCount(0, 'report.rows');
    }

    public function test_production_notifications_follow_admin_warehouse_manager_and_assigned_qa_roles(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared();
        \Illuminate\Support\Facades\Notification::assertSentTo($this->admin, \App\Notifications\WorkflowNotification::class,
            fn ($notification) => $notification->category === 'Production' && $notification->title === 'Production Batch Created');
        \Illuminate\Support\Facades\Notification::assertNotSentTo($this->otherManager, \App\Notifications\WorkflowNotification::class);
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/issue")->assertOk();
        $this->travel(30)->minutes();
        $this->postJson("/api/production/batches/{$batch}/output", ['actual_quantity' => 2, 'assigned_qa_user_id' => $this->qa->id])->assertOk();
        \Illuminate\Support\Facades\Notification::assertSentTo($this->qa, \App\Notifications\WorkflowNotification::class,
            fn ($notification) => $notification->category === 'Production' && $notification->title === 'Production Output Awaiting QA');
    }
    public function test_independent_production_issues_once_waits_for_manual_qa_and_stocks_only_passed_output(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared();
        $outputInventory = $output->inventories()->firstOrFail(); $barcode = $outputInventory->barcode;
        $this->assertSame(10, $inventory->fresh()->available_stock);
        $this->assertDatabaseCount('replenishment_requests', 0);
        $this->assertDatabaseCount('purchase_orders', 0);
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/stock-in")->assertUnprocessable();
        $this->postJson("/api/production/batches/{$batch}/issue")->assertOk()->assertJsonPath('data.status', 'IN_PRODUCTION');
        $this->postJson("/api/production/batches/{$batch}/issue")->assertOk();
        $this->assertSame(9, $inventory->fresh()->available_stock);
        $this->assertDatabaseCount('production_material_issues', 1);
        $this->outputAndQa($batch, 3, 2, 1);
        $this->assertSame(0, $outputInventory->fresh()->available_stock);
        $this->assertDatabaseHas('production_non_conformances', ['production_batch_id' => $batch, 'quantity' => 1, 'disposition' => 'HOLD']);
        $this->assertDatabaseCount('supplier_rejection_cases', 0);
        $this->assertSame(0, $outputInventory->fresh()->backload);
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/stock-in")->assertOk()->assertJsonPath('data.status', 'STOCKED_IN');
        $this->postJson("/api/production/batches/{$batch}/stock-in")->assertOk();
        $this->assertSame(2, $outputInventory->fresh()->available_stock);
        $this->assertSame($barcode, $outputInventory->fresh()->barcode);
        $this->assertDatabaseCount('replenishment_requests', 0);
        $this->actingAs($this->admin)->getJson('/api/admin/orders/products')->assertOk()->assertJsonFragment(['id' => $output->id])->assertJsonMissing(['id' => $raw->id]);
        $orderId = $this->postJson('/api/admin/orders', ['customer_name' => 'Isolated Production Customer', 'customer_address' => 'Fixture destination',
            'order_date' => now()->toDateString(), 'required_delivery_date' => now()->addDay()->toDateString(),
            'items' => [['product_id' => $output->id, 'quantity' => 1, 'unit' => 'PCS', 'unit_price' => 1]]])->assertCreated()->json('id');
        $this->patchJson("/api/admin/orders/{$orderId}/assign", ['assigned_to' => $this->manager->id])->assertOk();
        $this->actingAs($this->manager)->postJson("/api/plant-manager/orders/{$orderId}/start-preparing")->assertOk();
        $this->postJson("/api/plant-manager/orders/{$orderId}/ready-for-stock-out")->assertOk();
        $this->postJson("/api/stock-out/orders/{$orderId}/release", ['barcode' => $barcode])->assertOk()->assertJsonPath('order_status', 'FOR_PACKING');
        $this->assertSame(1, $outputInventory->fresh()->available_stock);
        $this->assertDatabaseHas('stock_out_transactions', ['order_id' => $orderId, 'product_id' => $output->id, 'barcode' => $barcode]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'FINISHED_GOODS_STOCKED_IN', 'resource_id' => (string) $batch]);
    }

    public function test_shortage_in_one_component_rolls_back_all_materials_and_does_not_create_requests(): void
    {
        $rawA = $this->product(Product::RAW_MATERIAL, 'KG'); $rawB = $this->product(Product::RAW_MATERIAL, 'L'); $output = $this->product();
        $a = $this->stock($rawA, 10); $b = $this->stock($rawB, 1);
        $this->bom($output, [['product_id' => $rawA->id, 'required_quantity' => '1'], ['product_id' => $rawB->id, 'required_quantity' => '1']]);
        $batch = $this->planned($output, 2);
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/issue")->assertUnprocessable()->assertJsonValidationErrors('materials');
        $this->assertSame(10, $a->fresh()->available_stock); $this->assertSame(1, $b->fresh()->available_stock);
        $this->assertDatabaseCount('production_material_issues', 0); $this->assertDatabaseCount('replenishment_requests', 0);
        $this->assertDatabaseHas('production_batches', ['id' => $batch, 'status' => 'PLANNED']);
    }

    public function test_exact_fractional_demand_is_reported_and_blocked_until_batch_quantity_is_compatible(): void
    {
        [$raw, $output, $inventory] = $this->prepared('0.25');
        $odd = $this->planned($output, 3);
        $this->actingAs($this->manager)->getJson("/api/production/batches/{$odd}")->assertOk()
            ->assertJsonPath('data.materials.0.required_quantity', null)->assertJsonPath('data.materials.0.required_quantity_exact', '3/4');
        $this->postJson("/api/production/batches/{$odd}/issue")->assertUnprocessable();
        $this->assertSame(10, $inventory->fresh()->available_stock);
        $whole = $this->planned($output, 4);
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$whole}/issue")->assertOk();
        $this->assertSame(9, $inventory->fresh()->available_stock);
    }

    public function test_missing_bom_wrong_output_classification_and_unauthorized_warehouses_are_blocked(): void
    {
        $finished = $this->product(); $raw = $this->product(Product::RAW_MATERIAL, 'KG');
        $this->actingAs($this->manager)->postJson('/api/production/batches', ['product_id' => $finished->id, 'warehouse_id' => $this->warehouse->id, 'target_quantity' => 1])->assertUnprocessable()->assertJsonValidationErrors('bom');
        $this->postJson('/api/production/batches', ['product_id' => $raw->id, 'warehouse_id' => $this->warehouse->id, 'target_quantity' => 1])->assertUnprocessable();
        $this->postJson('/api/production/batches', ['product_id' => $finished->id, 'warehouse_id' => $this->otherWarehouse->id, 'target_quantity' => 1])->assertForbidden();
        $this->actingAs($this->qa)->postJson('/api/production/batches', [])->assertForbidden();
        $this->assertDatabaseCount('production_batches', 0);
    }

    public function test_bom_rejects_non_raw_ingredients_and_excess_decimal_precision_and_is_admin_only(): void
    {
        $output = $this->product(); $raw = $this->product(Product::RAW_MATERIAL, 'KG');
        $base = ['product_id' => $output->id, 'output_quantity' => 1];
        $this->actingAs($this->manager)->postJson('/api/admin/boms', $base)->assertForbidden();
        $this->actingAs($this->qa)->getJson('/api/admin/boms')->assertForbidden();
        $this->actingAs($this->admin)->postJson('/api/admin/boms', [...$base, 'materials' => [['product_id' => $output->id, 'required_quantity' => '1']]])->assertUnprocessable();
        $this->postJson('/api/admin/boms', [...$base, 'materials' => [['product_id' => $raw->id, 'required_quantity' => '0.0000001']]])->assertUnprocessable();
        $this->assertDatabaseCount('boms', 0);
    }

    public function test_bom_edits_preserve_existing_batch_material_snapshot(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared('1');
        $this->actingAs($this->admin)->putJson("/api/admin/boms/{$bom->id}", ['product_id' => $output->id, 'output_quantity' => 1, 'materials' => [['product_id' => $raw->id, 'required_quantity' => '3']]])->assertOk();
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/issue")->assertOk()->assertJsonPath('data.materials.0.issued_quantity', 2);
        $this->assertSame(8, $inventory->fresh()->available_stock);
        $this->assertSame('3.000000', $bom->materials()->first()->required_quantity);
    }

    public function test_roles_and_assignment_protect_qa_and_material_actions(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared();
        $this->actingAs($this->otherManager)->getJson("/api/production/batches/{$batch}")->assertForbidden();
        $this->postJson("/api/production/batches/{$batch}/issue")->assertForbidden();
        $this->getJson('/api/production/batches')->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($this->admin)->postJson("/api/production/batches/{$batch}/issue")->assertForbidden();
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/issue")->assertOk();
        $this->postJson("/api/production/batches/{$batch}/qa", [])->assertForbidden();
        $this->travel(30)->minutes();
        $this->postJson("/api/production/batches/{$batch}/output", ['actual_quantity' => 2, 'assigned_qa_user_id' => $this->qa->id])->assertOk();
        $otherQa = $this->actor('QA_SUPERVISOR', $this->warehouse);
        $this->actingAs($otherQa)->postJson("/api/production/batches/{$batch}/qa", [])->assertForbidden();
        $this->actingAs($this->qa)->postJson("/api/production/batches/{$batch}/qa", ['passed_quantity' => 1, 'failed_quantity' => 0, 'notes' => 'Invalid total'])->assertUnprocessable();
        $this->assertDatabaseCount('production_non_conformances', 0);
    }

    public function test_finished_stock_in_checks_its_unit_allocation_and_remains_retry_safe(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared();
        $otherFinished = $this->product(); $otherStock = $this->stock($otherFinished, 2999);
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/issue")->assertOk();
        $this->outputAndQa($batch);
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/stock-in")->assertUnprocessable()->assertJsonPath('capacity_unit', 'PCS');
        $this->assertSame(0, $output->inventories()->first()->available_stock); $this->assertNull(ProductionBatch::find($batch)->stocked_in_at);
        $otherStock->update(['available_stock' => 2998]);
        $this->postJson("/api/production/batches/{$batch}/stock-in")->assertOk();
        $this->assertSame(2, $output->inventories()->first()->available_stock);
    }

    public function test_internal_failure_is_separate_and_qa_records_disposition_without_stock_or_backload(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared();
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/issue")->assertOk();
        $this->outputAndQa($batch, 2, 0, 2);
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/stock-in")->assertUnprocessable();
        $this->actingAs($this->qa)->postJson("/api/production/batches/{$batch}/non-conformance", ['disposition' => 'REWORK', 'notes' => 'Held for internal rework'])->assertOk();
        $this->postJson("/api/production/batches/{$batch}/non-conformance", ['disposition' => 'DISPOSAL', 'notes' => 'Failed output disposed internally'])->assertOk();
        $this->assertDatabaseHas('production_non_conformances', ['production_batch_id' => $batch, 'disposition' => 'DISPOSAL']);
        $this->assertDatabaseCount('supplier_rejection_cases', 0);
        $this->assertSame(0, $output->inventories()->first()->backload);
        $this->assertSame(0, $output->inventories()->first()->available_stock);
    }

    public function test_cancellation_after_issue_requires_explicit_disposition_and_returns_unused_material_once(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared();
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/issue")->assertOk();
        $this->postJson("/api/production/batches/{$batch}/cancel", ['reason' => 'Stop batch'])->assertUnprocessable();
        $payload = ['reason' => 'All materials physically returned unused', 'material_disposition' => 'RETURN_UNUSED', 'confirm_unused_materials' => true];
        $this->postJson("/api/production/batches/{$batch}/cancel", $payload)->assertOk()->assertJsonPath('data.status', 'CANCELLED');
        $this->postJson("/api/production/batches/{$batch}/cancel", $payload)->assertOk();
        $this->assertSame(10, $inventory->fresh()->available_stock);
        $this->assertDatabaseCount('production_material_issues', 1);
        $this->postJson("/api/production/batches/{$batch}/issue")->assertUnprocessable();
    }

    public function test_return_checks_capacity_and_disposal_preserves_issue_history_without_fabricating_stock(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared();
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/issue")->assertOk();
        $inventory->update(['available_stock' => 4000]);
        $this->postJson("/api/production/batches/{$batch}/cancel", ['reason' => 'Return unused', 'material_disposition' => 'RETURN_UNUSED', 'confirm_unused_materials' => true])->assertUnprocessable();
        $this->assertDatabaseHas('production_batches', ['id' => $batch, 'status' => 'IN_PRODUCTION']);
        $this->postJson("/api/production/batches/{$batch}/cancel", ['reason' => 'Consumed materials safely disposed', 'material_disposition' => 'DISPOSED'])->assertOk();
        $this->assertSame(4000, $inventory->fresh()->available_stock);
        $this->assertDatabaseHas('production_material_issues', ['quantity' => 1]);
    }
}
