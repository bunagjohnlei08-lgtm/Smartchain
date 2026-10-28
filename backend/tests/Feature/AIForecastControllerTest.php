<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AIForecastControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.ai_forecast.enabled' => true]);
    }

    public function test_forecast_endpoint_is_disabled_by_default_configuration(): void
    {
        config(['services.ai_forecast.enabled' => false]);
        $admin = $this->user('ADMIN');
        $product = Product::create(['name' => 'Disabled Forecast Product', 'category' => 'TOOLS']);
        Http::fake();

        $this->actingAs($admin)->postJson('/api/ai/forecast', ['product_id' => $product->id])
            ->assertNotFound();

        Http::assertNothingSent();
    }

    public function test_admin_can_request_a_forecast(): void
    {
        $admin = $this->user('ADMIN');
        $product = Product::create(['name' => 'TOMAHAWK EC', 'category' => 'WOOD PRESERVATIVE PRODUCTS']);
        Http::fake(['http://127.0.0.1:8001/forecast' => Http::response([
            'product_id' => 191,
            'product_name' => $product->name,
            'horizon_weeks' => 4,
            'forecast' => [
                ['week_start' => '2026-11-02', 'expected_quantity' => 1.0],
                ['week_start' => '2026-11-09', 'expected_quantity' => 1.0],
                ['week_start' => '2026-11-16', 'expected_quantity' => 1.0],
                ['week_start' => '2026-11-23', 'expected_quantity' => 1.0],
            ],
            'decision_support_only' => true,
        ])]);

        $this->actingAs($admin)->postJson('/api/ai/forecast', ['product_id' => $product->id])
            ->assertOk()
            ->assertJsonPath('decision_support_only', true)
            ->assertJsonPath('product_id', $product->id)
            ->assertJsonPath('model_product_id', 191);

        Http::assertSent(fn ($request) => $request->url() === 'http://127.0.0.1:8001/forecast'
            && $request['product_name'] === $product->name
            && ! isset($request['product_id']));
    }

    public function test_service_connection_failure_is_graceful(): void
    {
        $admin = $this->user('ADMIN');
        $product = Product::create(['name' => 'MegaFlow P', 'category' => 'CONSTRUCTION CHEMICALS']);
        Http::fake(fn () => throw new ConnectionException('offline'));

        $this->actingAs($admin)->postJson('/api/ai/forecast', ['product_id' => $product->id])
            ->assertStatus(503)
            ->assertJsonPath('code', 'AI_SERVICE_UNAVAILABLE');
    }

    public function test_catalog_spelling_variant_maps_without_losing_the_live_product_id(): void
    {
        $admin = $this->user('ADMIN');
        $product = Product::create([
            'name' => 'MegaFlow SP404 – High performance superplasticiser',
            'category' => 'CONSTRUCTION CHEMICALS',
        ]);
        Http::fake(['*' => Http::response([
            'product_id' => 190,
            'product_name' => 'MegaFlow SP404 – High performance superplasticizer',
            'horizon_weeks' => 1,
            'forecast' => [['week_start' => '2026-11-02', 'expected_quantity' => 3.5]],
            'decision_support_only' => true,
        ])]);

        $this->actingAs($admin)->postJson('/api/ai/forecast', ['product_id' => $product->id])
            ->assertOk()
            ->assertJsonPath('product_id', $product->id)
            ->assertJsonPath('model_product_id', 190)
            ->assertJsonPath('product_name', $product->name);
    }

    public function test_upstream_server_failure_is_graceful(): void
    {
        $admin = $this->user('ADMIN');
        $product = Product::create(['name' => 'MegaFlow P4', 'category' => 'CONSTRUCTION CHEMICALS']);
        Http::fake(['*' => Http::response(['detail' => 'Model failure'], 500)]);

        $this->actingAs($admin)->postJson('/api/ai/forecast', ['product_id' => $product->id])
            ->assertStatus(503)
            ->assertJsonPath('code', 'AI_SERVICE_UNAVAILABLE');
    }

    public function test_invalid_upstream_forecast_is_rejected(): void
    {
        $admin = $this->user('ADMIN');
        $product = Product::create(['name' => 'Invalid Forecast Product', 'category' => 'TOOLS']);
        Http::fake(['*' => Http::response([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'horizon_weeks' => 1,
            'forecast' => [['week_start' => 'not-a-date', 'expected_quantity' => -1]],
            'decision_support_only' => true,
        ])]);

        $this->actingAs($admin)->postJson('/api/ai/forecast', ['product_id' => $product->id])
            ->assertStatus(502)
            ->assertJsonPath('code', 'AI_SERVICE_INVALID_RESPONSE');
    }

    public function test_unknown_upstream_product_remains_a_not_found_response(): void
    {
        $admin = $this->user('ADMIN');
        $product = Product::create(['name' => 'Unknown Model Product', 'category' => 'INDUSTRIAL CHEMICALS']);
        Http::fake(['*' => Http::response(['detail' => 'Product is not available in the trained model.'], 404)]);

        $this->actingAs($admin)->postJson('/api/ai/forecast', ['product_id' => $product->id])
            ->assertNotFound()
            ->assertJsonPath('code', 'FORECAST_REQUEST_REJECTED');
    }

    public function test_request_requires_exactly_one_product_identifier(): void
    {
        $admin = $this->user('ADMIN');
        $product = Product::create(['name' => 'QEMI DF 220FG', 'category' => 'INDUSTRIAL CHEMICALS']);

        $this->actingAs($admin)->postJson('/api/ai/forecast', [])->assertUnprocessable();
        $this->actingAs($admin)->postJson('/api/ai/forecast', [
            'product_id' => $product->id,
            'product_name' => $product->name,
        ])->assertUnprocessable();

        Http::assertNothingSent();
    }

    public function test_unprivileged_user_cannot_request_a_forecast(): void
    {
        $user = $this->user('QA_SUPERVISOR');
        $product = Product::create(['name' => 'QEMI DF 210FG', 'category' => 'INDUSTRIAL CHEMICALS']);

        $this->actingAs($user)->postJson('/api/ai/forecast', ['product_id' => $product->id])->assertForbidden();
    }

    private function user(string $slug): User
    {
        $role = Role::create(['name' => $slug, 'slug' => $slug]);

        return User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
    }
}
