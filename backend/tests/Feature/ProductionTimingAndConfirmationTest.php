<?php
namespace Tests\Feature;

use App\Models\{Product, ProductionBatch};
use App\Support\ProductionRules;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\Support\ProductionFixture;

class ProductionTimingAndConfirmationTest extends ProductionFixture
{
    private function issue(int $batch): void { $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/issue")->assertOk(); }
    private function outputPayload(int $quantity = 2): array { return ['actual_quantity' => $quantity, 'assigned_qa_user_id' => $this->qa->id]; }
    private function elapsed(int $batch): void { $this->travelTo(Carbon::parse(ProductionRules::timing(ProductionBatch::findOrFail($batch))['output_available_at'])); }
    private function outputAck(int $target, int $actual): array { return ['target_quantity' => $target, 'actual_quantity' => $actual, 'confirmed' => true]; }
    private function qaAck(int $target, int $actual, int $passed, int $failed, string $notes = 'Inspected the two passed units and held one failed unit.'): array { return ['target_quantity' => $target, 'actual_quantity' => $actual, 'passed_quantity' => $passed, 'failed_quantity' => $failed, 'inspection_notes' => $notes, 'quantity_verified' => true, 'passed_inspected' => $passed > 0, 'passed_meets_requirements' => $passed > 0, 'failed_excluded' => $failed > 0]; }

    public function test_processing_starts_only_at_successful_issue_and_rejects_output_before_but_allows_at_deadline(): void
    {
        $this->travelTo(Carbon::parse('2026-10-14 10:00:00'));
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared();
        $record = ProductionBatch::findOrFail($batch);
        $this->assertNull($record->production_started_at); $this->assertNull($record->output_available_at); $this->assertSame(30, $record->minimum_processing_minutes);
        $this->getJson("/api/production/batches/{$batch}/pick-list?format=html")->assertOk();
        $this->assertNull($record->fresh()->production_started_at);
        $this->issue($batch); $record->refresh();
        $deadline = $record->output_available_at->copy();
        $this->assertTrue($record->issued_at->equalTo($record->production_started_at));
        $this->assertTrue($deadline->equalTo($record->production_started_at->copy()->addMinutes(30)));
        $this->travelTo($deadline->copy()->subSecond());
        $this->postJson("/api/production/batches/{$batch}/output", $this->outputPayload())->assertUnprocessable()->assertJsonValidationErrors('actual_quantity');
        $this->postJson("/api/production/batches/{$batch}/output", [...$this->outputPayload(), 'production_started_at' => '2000-01-01'])->assertUnprocessable()->assertJsonValidationErrors('production_started_at');
        $this->assertNull($record->fresh()->actual_quantity);
        $this->travelTo($deadline); $this->postJson("/api/production/batches/{$batch}/output", $this->outputPayload())->assertOk();
        $this->assertSame(0, $output->inventories()->first()->available_stock);
    }
    public function test_timer_and_formula_snapshots_survive_bom_edits_duplicate_issue_and_refresh(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared();
        $this->actingAs($this->admin)->putJson("/api/admin/boms/{$bom->id}", ['product_id' => $output->id, 'output_quantity' => 1, 'minimum_processing_minutes' => 60, 'materials' => [['product_id' => $raw->id, 'required_quantity' => '4']]])->assertOk();
        $this->issue($batch); $deadline = ProductionBatch::find($batch)->output_available_at;
        $this->postJson("/api/production/batches/{$batch}/issue")->assertOk();
        $this->getJson("/api/production/batches/{$batch}")->assertOk()->assertJsonPath('data.minimum_processing_minutes', 30)->assertJsonPath('data.materials.0.required_quantity', 1);
        $this->assertTrue($deadline->equalTo(ProductionBatch::find($batch)->output_available_at)); $this->assertSame(9, $inventory->fresh()->available_stock);
        $this->travel(10)->minutes();
        $response = $this->getJson("/api/production/batches/{$batch}")->assertOk(); $this->assertLessThanOrEqual(1200, $response->json('data.timing.remaining_seconds'));
        $this->assertSame(60, $bom->fresh()->minimum_processing_minutes);
    }
    public function test_bom_duration_rejects_nonpositive_fractional_values_and_duplicate_creation(): void
    {
        [$raw, $output, $inventory, $bom] = $this->prepared();
        $base = ['product_id' => $output->id, 'output_quantity' => 1, 'materials' => [['product_id' => $raw->id, 'required_quantity' => '1']]];
        foreach ([0, -1, 1.5, 'invalid'] as $minutes) $this->actingAs($this->admin)->putJson("/api/admin/boms/{$bom->id}", [...$base, 'minimum_processing_minutes' => $minutes])->assertUnprocessable()->assertJsonValidationErrors('minimum_processing_minutes');
        $this->postJson('/api/admin/boms', $base)->assertUnprocessable()->assertJsonValidationErrors('product_id');
        $this->assertDatabaseCount('boms', 1);
    }
    public function test_options_hide_missing_invalid_and_wrong_warehouse_boms_but_keep_material_shortages_visible(): void
    {
        $missing = $this->product(); [$raw, $ready, $inventory, $bom] = $this->prepared(); $inventory->update(['available_stock' => 0]);
        $response = $this->actingAs($this->manager)->getJson('/api/production/options')->assertOk();
        $this->assertContains($ready->id, array_column($response->json('products'), 'id')); $this->assertNotContains($missing->id, array_column($response->json('products'), 'id'));
        $bom->materials()->delete();
        $this->getJson('/api/production/options')->assertOk()->assertJsonCount(0, 'products');
        $this->postJson('/api/production/batches', ['product_id' => $ready->id, 'warehouse_id' => $this->warehouse->id, 'target_quantity' => 1])->assertUnprocessable()->assertJsonValidationErrors('bom');
        $this->postJson('/api/production/batches', ['product_id' => $ready->id, 'warehouse_id' => $this->otherWarehouse->id, 'target_quantity' => 1])->assertForbidden();
    }
    public function test_remaining_shortage_is_zero_after_full_issue_even_when_current_stock_falls(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared('1'); $this->issue($batch); $inventory->update(['available_stock' => 1]);
        $this->getJson("/api/production/batches/{$batch}")->assertOk()->assertJsonPath('data.materials.0.required_quantity', 2)->assertJsonPath('data.materials.0.issued_quantity', 2)
            ->assertJsonPath('data.materials.0.available_quantity', 1)->assertJsonPath('data.materials.0.remaining_required', 0)->assertJsonPath('data.materials.0.shortage_quantity', 0);
    }
    public function test_pm_over_target_requires_current_explicit_confirmation_and_does_not_change_target_or_materials(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared(); $this->issue($batch); $this->elapsed($batch);
        $this->postJson("/api/production/batches/{$batch}/output", $this->outputPayload(3))->assertUnprocessable()->assertJsonValidationErrors('excess_confirmation');
        $this->postJson("/api/production/batches/{$batch}/output", [...$this->outputPayload(3), 'excess_confirmation' => $this->outputAck(2, 4)])->assertUnprocessable();
        $this->postJson("/api/production/batches/{$batch}/output", [...$this->outputPayload(3), 'excess_confirmation' => $this->outputAck(2, 3)])->assertOk();
        $this->assertSame(2, ProductionBatch::find($batch)->target_quantity); $this->assertSame(9, $inventory->fresh()->available_stock); $this->assertSame(0, $output->inventories()->first()->available_stock);
        $metadata = json_decode(DB::table('production_batch_events')->where('production_batch_id', $batch)->where('action', 'PRODUCTION_OUTPUT_RECORDED')->value('metadata'), true);
        $this->assertSame($this->manager->id, $metadata['excess_confirmation']['confirmed_by']); $this->assertSame(1, $metadata['excess_confirmation']['excess_quantity']); $this->assertNotEmpty($metadata['excess_confirmation']['confirmed_at']);
    }
    public function test_qa_independently_confirms_over_target_even_when_passed_is_at_target_and_records_truthful_mixed_result(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared(); $this->issue($batch); $this->elapsed($batch);
        $this->postJson("/api/production/batches/{$batch}/output", [...$this->outputPayload(3), 'excess_confirmation' => $this->outputAck(2, 3)])->assertOk();
        $qa = ['passed_quantity' => 2, 'failed_quantity' => 1, 'notes' => 'Inspected the two passed units and held one failed unit.'];
        $this->actingAs($this->qa)->postJson("/api/production/batches/{$batch}/qa", $qa)->assertUnprocessable()->assertJsonValidationErrors('excess_confirmation');
        $this->postJson("/api/production/batches/{$batch}/qa", [...$qa, 'excess_confirmation' => $this->qaAck(2, 3, 3, 0)])->assertUnprocessable();
        $this->postJson("/api/production/batches/{$batch}/qa", [...$qa, 'excess_confirmation' => [...$this->qaAck(2, 3, 2, 1), 'passed_meets_requirements' => false]])->assertUnprocessable();
        $this->postJson("/api/production/batches/{$batch}/qa", [...$qa, 'excess_confirmation' => $this->qaAck(2, 3, 2, 1)])->assertOk();
        $this->assertSame(0, $output->inventories()->first()->available_stock);
        $metadata = json_decode(DB::table('production_batch_events')->where('production_batch_id', $batch)->where('action', 'PRODUCTION_QA_COMPLETED')->value('metadata'), true);
        $this->assertSame($this->qa->id, $metadata['excess_confirmation']['inspector_id']); $this->assertSame(2, $metadata['excess_confirmation']['passed_quantity']); $this->assertTrue($metadata['excess_confirmation']['checks']['failed_excluded']);
        $this->assertDatabaseCount('supplier_rejection_cases', 0);
    }
    public function test_all_failed_excess_requires_quantity_and_exclusion_without_false_quality_acceptance(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared(); $this->issue($batch); $this->elapsed($batch);
        $this->postJson("/api/production/batches/{$batch}/output", [...$this->outputPayload(3), 'excess_confirmation' => $this->outputAck(2, 3)])->assertOk();
        $payload = ['passed_quantity' => 0, 'failed_quantity' => 3, 'notes' => 'All produced units failed inspection.', 'excess_confirmation' => $this->qaAck(2, 3, 0, 3, 'All produced units failed inspection.')];
        $this->actingAs($this->qa)->postJson("/api/production/batches/{$batch}/qa", $payload)->assertOk();
        $this->postJson("/api/production/batches/{$batch}/qa", $payload)->assertOk(); // Same persisted result retry is read-only.
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/stock-in")->assertUnprocessable();
        $this->assertDatabaseHas('production_non_conformances', ['production_batch_id' => $batch, 'quantity' => 3, 'disposition' => 'HOLD']);
        $metadata = json_decode(DB::table('production_batch_events')->where('production_batch_id', $batch)->where('action', 'PRODUCTION_QA_COMPLETED')->value('metadata'), true);
        $this->assertSame('not_applicable', $metadata['excess_confirmation']['checks']['passed_meets_requirements']);
    }
    public function test_legacy_recorded_issuance_uses_that_start_and_does_not_fabricate_snapshot_columns(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared(); $this->issue($batch);
        ProductionBatch::find($batch)->update(['minimum_processing_minutes' => null, 'production_started_at' => null, 'output_available_at' => null, 'issued_at' => now()->subMinutes(29)]);
        $this->getJson("/api/production/batches/{$batch}")->assertOk()->assertJsonPath('data.timing.compatibility', 'legacy_recorded_issuance');
        $this->postJson("/api/production/batches/{$batch}/output", $this->outputPayload())->assertUnprocessable(); $this->travel(1)->minutes();
        $this->postJson("/api/production/batches/{$batch}/output", $this->outputPayload())->assertOk();
        $this->assertDatabaseHas('production_batches', ['id' => $batch, 'minimum_processing_minutes' => null, 'production_started_at' => null]);
    }
    public function test_legacy_fulfilled_materials_without_reliable_start_preserve_explicit_compatibility(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared();
        $record = ProductionBatch::find($batch); $record->update(['minimum_processing_minutes' => null, 'status' => 'IN_PRODUCTION']);
        $record->materials()->update(['issued_quantity' => 1]); $inventory->update(['available_stock' => 9]);
        $this->actingAs($this->manager)->getJson("/api/production/batches/{$batch}")->assertOk()->assertJsonPath('data.timing.compatibility', 'legacy_no_recorded_start');
        $this->get("/api/production/batches/{$batch}/pick-list?format=html")->assertOk()->assertSee('ISSUED')->assertSee('reprint / recorded quantities');
        $this->postJson("/api/production/batches/{$batch}/output", $this->outputPayload())->assertOk();
        $this->assertNull($record->fresh()->production_started_at);
    }
    public function test_pick_list_pdf_and_print_share_units_remaining_quantities_and_do_not_mutate_stock(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared('1');
        $before = [$inventory->available_stock, ProductionBatch::find($batch)->status, DB::table('production_batch_events')->count()];
        $this->actingAs($this->manager)->get("/api/production/batches/{$batch}/pick-list?format=html")->assertOk()->assertSee('Archon Nell Incorporated')->assertSee('PLANNED')->assertSee($inventory->barcode)->assertSee('Remaining to Pick')->assertSee('KG');
        $pdf = $this->get("/api/production/batches/{$batch}/pick-list?format=pdf")->assertOk()->assertHeader('Content-Type', 'application/pdf'); $this->assertStringStartsWith('%PDF-', $pdf->getContent());
        $this->assertSame($before, [$inventory->fresh()->available_stock, ProductionBatch::find($batch)->status, DB::table('production_batch_events')->count()]);
        $this->issue($batch); $this->get("/api/production/batches/{$batch}/pick-list?format=html")->assertOk()->assertSee('ISSUED')->assertSee('reprint / recorded quantities');
        $this->actingAs($this->otherManager)->get("/api/production/batches/{$batch}/pick-list")->assertForbidden();
        $this->actingAs($this->qa)->get("/api/production/batches/{$batch}/pick-list")->assertForbidden();
        $this->actingAs($this->admin)->get("/api/production/batches/{$batch}/pick-list")->assertForbidden();
    }
    public function test_multi_page_pick_list_preserves_kg_l_pcs_without_fabricated_bins_or_mutations(): void
    {
        $output = $this->product(); $materials = [];
        for ($index = 0; $index < 45; $index++) { $raw = $this->product(Product::RAW_MATERIAL, ['KG','L','PCS'][$index % 3]); $materials[] = ['product_id' => $raw->id, 'required_quantity' => '1']; }
        $this->bom($output, $materials); $batch = $this->planned($output);
        $html = $this->actingAs($this->manager)->get("/api/production/batches/{$batch}/pick-list?format=html")->assertOk()->assertSee('Not recorded')->assertSee('KG')->assertSee('L')->assertSee('PCS');
        $pdf = $this->get("/api/production/batches/{$batch}/pick-list")->assertOk();
        preg_match_all('/\/Type\s*\/Page\b/', $pdf->getContent(), $pages); $this->assertGreaterThan(1, count($pages[0]));
        $this->assertDatabaseCount('production_material_issues', 0); $this->assertNull(ProductionBatch::find($batch)->issued_at);
    }

    public function test_failed_issue_never_starts_clock_and_elapsed_time_does_not_auto_submit(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared(); $inventory->update(['available_stock' => 0]);
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/issue")->assertUnprocessable();
        $this->assertNull(ProductionBatch::find($batch)->production_started_at); $this->assertNull(ProductionBatch::find($batch)->output_available_at);
        $inventory->update(['available_stock' => 10]); $this->issue($batch); $this->elapsed($batch); $this->travel(1)->seconds();
        $this->getJson("/api/production/batches/{$batch}")->assertOk()->assertJsonPath('data.timing.elapsed', true)->assertJsonPath('data.status', 'IN_PRODUCTION')->assertJsonPath('data.actual_quantity', null);
        $this->postJson("/api/production/batches/{$batch}/output", $this->outputPayload())->assertOk();
        $this->postJson("/api/production/batches/{$batch}/output", $this->outputPayload())->assertUnprocessable();
        $this->assertDatabaseCount('production_material_issues', 1);
    }
    public function test_qa_changed_notes_invalidate_excess_confirmation_and_passed_excess_still_checks_unit_capacity(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared(); $this->issue($batch); $this->elapsed($batch);
        $this->postJson("/api/production/batches/{$batch}/output", [...$this->outputPayload(3), 'excess_confirmation' => $this->outputAck(2, 3)])->assertOk();
        $notes = 'All three units inspected and accepted.';
        $payload = ['passed_quantity' => 3, 'failed_quantity' => 0, 'notes' => $notes, 'excess_confirmation' => $this->qaAck(2, 3, 3, 0, 'Previous notes')];
        $this->actingAs($this->qa)->postJson("/api/production/batches/{$batch}/qa", $payload)->assertUnprocessable()->assertJsonValidationErrors('excess_confirmation');
        $payload['excess_confirmation'] = $this->qaAck(2, 3, 3, 0, $notes);
        $this->postJson("/api/production/batches/{$batch}/qa", $payload)->assertOk()->assertJsonPath('data.passed_quantity', 3);
        $this->stock($output, 2998);
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/stock-in")->assertUnprocessable();
        $this->assertNull(ProductionBatch::find($batch)->stocked_in_at); $this->assertSame(2998, $output->inventories()->first()->available_stock);
        $this->stock($output, 2997); $this->postJson("/api/production/batches/{$batch}/stock-in")->assertOk();
        $this->assertSame(3000, $output->inventories()->first()->available_stock); $this->assertSame(2, ProductionBatch::find($batch)->target_quantity);
    }
    public function test_legacy_event_timestamp_is_authoritative_and_legacy_completed_history_is_not_relocked(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared(); $this->issue($batch);
        ProductionBatch::find($batch)->update(['minimum_processing_minutes' => null, 'production_started_at' => null, 'output_available_at' => null, 'issued_at' => null]);
        $this->getJson("/api/production/batches/{$batch}")->assertOk()->assertJsonPath('data.timing.compatibility', 'legacy_recorded_issuance');
        $this->postJson("/api/production/batches/{$batch}/output", $this->outputPayload())->assertUnprocessable();
        $this->elapsed($batch); $this->outputAndQa($batch);
        // An old completed batch cannot be re-locked by the new duration rule.
        DB::table('production_batch_events')->where('production_batch_id', $batch)->where('action', 'MATERIAL_ISSUED_TO_PRODUCTION')->update(['occurred_at' => now()]);
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/stock-in")->assertOk();
        $this->assertSame(2, $output->inventories()->first()->available_stock);
    }
    public function test_legacy_recorded_issued_quantities_still_require_cancellation_disposition(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared(); $record = ProductionBatch::find($batch);
        $record->update(['minimum_processing_minutes' => null, 'status' => 'IN_PRODUCTION']); $record->materials()->update(['issued_quantity' => 1]); $inventory->update(['available_stock' => 9]);
        $this->actingAs($this->manager)->postJson("/api/production/batches/{$batch}/cancel", ['reason' => 'Legacy cancellation'])->assertUnprocessable();
        $this->postJson("/api/production/batches/{$batch}/cancel", ['reason' => 'Unused material returned', 'material_disposition' => 'RETURN_UNUSED', 'confirm_unused_materials' => true])->assertOk();
        $this->assertSame(10, $inventory->fresh()->available_stock);
    }
    public function test_additive_migration_preserves_original_records_and_leaves_legacy_batch_timing_null(): void
    {
        [$raw, $output, $inventory, $bom, $batch] = $this->prepared(); $this->issue($batch);
        $migration = require database_path('migrations/2026_10_14_030000_add_production_processing_time_snapshots.php');
        $migration->down();
        $before = (array) DB::table('production_batches')->find($batch);
        $beforeBom = (array) DB::table('boms')->find($bom->id);
        $beforeEvents = DB::table('production_batch_events')->where('production_batch_id', $batch)->get()->toJson();
        $migration->up();
        $after = (array) DB::table('production_batches')->find($batch);
        foreach (['minimum_processing_minutes', 'production_started_at', 'output_available_at'] as $field) { $this->assertNull($after[$field]); unset($after[$field]); }
        $afterBom = (array) DB::table('boms')->find($bom->id); $this->assertSame(30, $afterBom['minimum_processing_minutes']); unset($afterBom['minimum_processing_minutes']);
        $this->assertSame($before, $after); $this->assertSame($beforeBom, $afterBom);
        $this->assertSame($beforeEvents, DB::table('production_batch_events')->where('production_batch_id', $batch)->get()->toJson());
        $this->assertSame(9, $inventory->fresh()->available_stock);
    }
}
