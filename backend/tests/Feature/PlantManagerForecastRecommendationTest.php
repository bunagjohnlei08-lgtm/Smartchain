<?php

namespace Tests\Feature;

use App\Models\Inventory;
use App\Models\Branch;
use App\Models\Product;
use App\Models\ReplenishmentRequest;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class PlantManagerForecastRecommendationTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private Warehouse $warehouse;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.ai_forecast.enabled' => true]);
        $role = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $branch = Branch::create(['name' => 'Forecast Test Branch', 'code' => 'FCST']);
        $this->warehouse = Warehouse::create(['name' => 'Forecast Test Warehouse', 'code' => 'FCST-WH', 'branch_id' => $branch->id]);
        $this->manager = User::factory()->create(['role_id' => $role->id, 'branch_id' => $branch->id, 'warehouse_id' => $this->warehouse->id, 'status' => 'ACTIVE']);
    }

    public function test_forecast_recommendations_and_requests_are_disabled_without_side_effects(): void
    {
        config(['services.ai_forecast.enabled' => false]);
        $this->removeForecastContextColumns();
        $inventory = $this->inventory('Disabled Forecast Product', 'PCS', 0);
        Http::fake();

        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/forecast-recommendations')
            ->assertNotFound();
        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/forecast-requests', [
            'product_id' => $inventory->product_id,
            'requested_qty' => 10,
        ])->assertNotFound();

        Http::assertNothingSent();
        $this->assertDatabaseCount('replenishment_requests', 0);
    }

    public function test_enabled_forecast_fails_closed_without_phase_two_forecast_columns(): void
    {
        $this->removeForecastContextColumns();
        $inventory = $this->inventory('Missing Forecast Schema Product', 'PCS', 0);
        Http::fake();

        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/forecast-recommendations')
            ->assertServiceUnavailable();
        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/forecast-requests', [
            'product_id' => $inventory->product_id,
            'requested_qty' => 10,
        ])->assertServiceUnavailable();

        Http::assertNothingSent();
        $this->assertDatabaseCount('replenishment_requests', 0);
    }

    public function test_whole_package_recommendations_use_raw_net_need_once(): void
    {
        $drum = $this->inventory('Forecast Drum', 'DRUM', 0);
        $sack = $this->inventory('Forecast Sack', 'SACK', 0);
        $pcs = $this->inventory('Forecast Piece', 'PCS', 200);
        Http::fake(fn ($request) => Http::response($this->forecast((string) $request['product_name'], match ((string) $request['product_name']) {
            'Forecast Drum' => [49.4, 49.4, 49.4, 49.4],
            'Forecast Sack' => [0.025, 0.025, 0.025, 0.025],
            default => [49.25, 49.25, 49.25, 49.25],
        })));

        $rows = collect($this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/forecast-recommendations')->assertOk()->json('data'))->keyBy('product_id');
        $this->assertSame(198, $rows[$drum->product_id]['recommended_reorder']);
        $this->assertSame(1, $rows[$sack->product_id]['recommended_reorder']);
        $this->assertSame(0, $rows[$pcs->product_id]['recommended_reorder']);
        $this->assertSame(197.6, $rows[$drum->product_id]['raw_demand']);
        $this->assertCount(4, $rows[$drum->product_id]['forecast']);
        $this->assertSame([49.4, 49.4, 49.4, 49.4], collect($rows[$drum->product_id]['forecast'])->pluck('expected_quantity')->all());
        $this->assertCount(4, $rows[$pcs->product_id]['forecast'], 'Zero-reorder products must retain weekly chart data.');
        $this->assertSame(197.0, collect($rows[$pcs->product_id]['forecast'])->sum('expected_quantity'));
    }

    public function test_company_forecast_is_not_replicated_to_multiple_warehouses(): void
    {
        $inventory = $this->inventory('Shared Forecast Product', 'DRUM', 5);
        $otherBranch = Branch::create(['name' => 'Other Branch', 'code' => 'OTHER']);
        $other = Warehouse::create(['name' => 'Other Warehouse', 'code' => 'OTHER-WH', 'branch_id' => $otherBranch->id]);
        Inventory::create(['barcode' => 'FCST-OTHER-'.$inventory->product_id, 'product_id' => $inventory->product_id, 'warehouse_id' => $other->id, 'available_stock' => 0, 'reserved_stock' => 0, 'backload' => 0, 'returned_stock' => 0, 'status' => 'Out of Stock']);
        Http::fake();

        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/forecast-recommendations')
            ->assertOk()->assertJsonPath('data.0.status', 'WAREHOUSE_SCOPE_UNAVAILABLE')
            ->assertJsonPath('data.0.actionable', false);
        Http::assertNothingSent();
    }

    public function test_forecast_request_above_manual_threshold_uses_existing_lifecycle_once(): void
    {
        $inventory = $this->inventory('High Stock Forecast Product', 'DRUM', 50);
        Http::fake(['*' => Http::response($this->forecast('High Stock Forecast Product', [30.0, 30.0, 30.0, 30.0]))]);
        $payload = ['product_id' => $inventory->product_id, 'requested_qty' => 65, 'recommendation_generated_at' => now()->toIso8601String(), 'raw_demand' => 120, 'available_stock' => 50, 'recommended_reorder' => 70];

        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/forecast-requests', $payload)
            ->assertCreated()->assertJsonPath('source', 'AI_FORECAST')->assertJsonPath('requested_qty', 65);
        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/forecast-requests', $payload)->assertUnprocessable();

        $this->assertDatabaseCount('replenishment_requests', 1);
        $request = ReplenishmentRequest::sole();
        $this->assertSame(ReplenishmentRequest::STATUS_PENDING, $request->status);
        $this->assertSame(70, $request->recommendation_snapshot['recommended_reorder']);
    }

    public function test_invalid_quantities_and_other_roles_are_rejected_without_side_effects(): void
    {
        $inventory = $this->inventory('Validation Product', 'PCS', 0);
        $base = ['product_id' => $inventory->product_id, 'recommendation_generated_at' => now()->toIso8601String(), 'raw_demand' => 40, 'available_stock' => 0, 'recommended_reorder' => 40];
        foreach ([-1, 0, 1.5, 'abc', 1000001] as $invalid) {
            $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/forecast-requests', [...$base, 'requested_qty' => $invalid])->assertUnprocessable();
        }
        $qaRole = Role::create(['name' => 'QA', 'slug' => 'QA_SUPERVISOR']);
        $qa = User::factory()->create(['role_id' => $qaRole->id, 'status' => 'ACTIVE']);
        $this->actingAs($qa)->getJson('/api/plant-manager/procurement/forecast-recommendations')->assertForbidden();
        $this->assertDatabaseCount('replenishment_requests', 0);
    }

    private function inventory(string $name, string $unit, int $stock): Inventory
    {
        $product = Product::create(['name' => $name, 'unit' => $unit, 'item_classification' => Product::RAW_MATERIAL]);
        return Inventory::create(['barcode' => 'FCST-'.$product->id, 'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'available_stock' => $stock, 'reserved_stock' => 0, 'backload' => 0, 'returned_stock' => 0, 'status' => $stock ? 'In Stock' : 'Out of Stock']);
    }

    private function removeForecastContextColumns(): void
    {
        foreach (['source', 'recommendation_snapshot'] as $column) {
            if (Schema::hasColumn('replenishment_requests', $column)) {
                Schema::table('replenishment_requests', fn ($table) => $table->dropColumn($column));
            }
        }
    }

    private function forecast(string $productName, array $weeks): array
    {
        return ['product_id' => 999, 'product_name' => $productName, 'horizon_weeks' => 4,
            'generated_at' => now()->toIso8601String(), 'model_version' => 'test-v1', 'training_weeks' => 52,
            'model_quality' => ['mae' => 1.234], 'decision_support_only' => true,
            'forecast' => collect($weeks)->map(fn ($quantity, $index) => ['week_start' => now()->addWeeks($index + 1)->toDateString(), 'expected_quantity' => $quantity])->all()];
    }
}
