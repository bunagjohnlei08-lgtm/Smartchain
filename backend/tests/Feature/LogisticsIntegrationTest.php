<?php

namespace Tests\Feature;

use App\Jobs\SubmitDeliveryRequest;
use App\Models\Branch;
use App\Models\DeliveryRequest;
use App\Models\Inventory;
use App\Models\LogisticsItemMapping;
use App\Models\LogisticsPartner;
use App\Models\Order;
use App\Models\Product;
use App\Models\Role;
use App\Models\StockOutTransaction;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\Logistics\DeliveryPayloadBuilder;
use App\Services\Logistics\DeliverySubmissionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

class LogisticsIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $manager;
    private Warehouse $warehouse;
    private Product $product;
    private Inventory $inventory;

    protected function setUp(): void
    {
        parent::setUp();
        config(['logistics.public_base_url' => 'https://smartchain.test']);
        Http::preventStrayRequests();
        $branch = Branch::create(['name' => 'Test Branch', 'code' => 'TEST']);
        $this->warehouse = Warehouse::create([
            'name' => 'Test Warehouse', 'code' => 'WH-TEST', 'address' => '100 Test Avenue',
            'branch_id' => $branch->id,
        ]);
        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $this->admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        $this->manager = User::factory()->create(['role_id' => $managerRole->id, 'warehouse_id' => $this->warehouse->id, 'status' => 'ACTIVE']);
        $this->product = Product::create(['name' => 'Synthetic Product', 'unit' => 'PCS', 'cost_price' => 10]);
        $this->inventory = Inventory::create([
            'barcode' => 'TEST-BARCODE', 'product_id' => $this->product->id, 'warehouse_id' => $this->warehouse->id,
            'available_stock' => 0, 'reserved_stock' => 0, 'backload' => 0, 'status' => 'Out of Stock', 'pending_receiving' => false,
        ]);
    }

    private function partner(array $overrides = []): LogisticsPartner
    {
        return LogisticsPartner::create(array_merge([
            'code' => 'PARTNER_TEST', 'name' => 'Partner Test', 'enabled' => true,
            'base_url' => 'https://partner.test', 'request_path' => '/api/v1/delivery-requests',
            'outbound_token' => 'test-outbound-token', 'callback_secret' => 'test-callback-secret',
            'supports_idempotency' => true,
        ], $overrides));
    }

    private function readyOrder(LogisticsPartner $partner): Order
    {
        $order = Order::create([
            'order_no' => 'SO-TEST-'.Str::upper(Str::random(6)), 'reference_no' => 'UPSTREAM-TEST',
            'customer_name' => 'Synthetic Customer', 'customer_address' => '200 Example Street',
            'customer_contact' => '+63-900-000-0001', 'order_date' => now(),
            'required_delivery_date' => now()->addDays(2), 'total_amount' => 20,
            'status' => Order::LOGISTICS_STATUS, 'assigned_to' => $this->manager->id, 'assigned_at' => now(),
        ]);
        $item = $order->items()->create([
            'product_id' => $this->product->id, 'product_name' => $this->product->name,
            'quantity' => 2, 'unit' => 'PCS', 'unit_price' => 10, 'subtotal' => 20,
        ]);
        StockOutTransaction::create([
            'reference_no' => (string) Str::uuid(), 'idempotency_key' => (string) Str::uuid(),
            'order_id' => $order->id, 'order_item_id' => $item->id, 'inventory_id' => $this->inventory->id,
            'product_id' => $this->product->id, 'warehouse_id' => $this->warehouse->id,
            'barcode' => $this->inventory->barcode, 'quantity' => 2, 'unit' => 'PCS', 'performed_by' => $this->manager->id,
        ]);
        LogisticsItemMapping::create([
            'logistics_partner_id' => $partner->id, 'product_id' => $this->product->id,
            'partner_item_reference' => 'SKU-TEST-001',
        ]);
        return $order;
    }

    private function delivery(LogisticsPartner $partner, Order $order, string $state = 'ACCEPTED'): DeliveryRequest
    {
        $uuid = (string) Str::uuid();
        return DeliveryRequest::create([
            'request_uuid' => $uuid, 'order_id' => $order->id, 'logistics_partner_id' => $partner->id,
            'payload_snapshot' => app(DeliveryPayloadBuilder::class)->build($order, $partner, $uuid),
            'state' => $state, 'partner_request_id' => $state === 'ACCEPTED' ? 'LSP-TEST-1' : null,
        ]);
    }

    public function test_admin_send_is_authorized_validated_persisted_and_duplicate_safe(): void
    {
        Queue::fake();
        $partner = $this->partner();
        $order = $this->readyOrder($partner);

        $this->postJson("/api/admin/logistics/shipments/{$order->id}/send", ['logistics_partner_id' => $partner->id])->assertUnauthorized();
        $this->actingAs($this->manager)->postJson("/api/admin/logistics/shipments/{$order->id}/send", ['logistics_partner_id' => $partner->id])->assertForbidden();
        $first = $this->actingAs($this->admin)->postJson("/api/admin/logistics/shipments/{$order->id}/send", ['logistics_partner_id' => $partner->id])
            ->assertAccepted()->assertJsonPath('state', 'QUEUED');
        $second = $this->actingAs($this->admin)->postJson("/api/admin/logistics/shipments/{$order->id}/send", ['logistics_partner_id' => $partner->id])
            ->assertOk()->assertJsonPath('delivery_request_id', $first->json('delivery_request_id'));

        $this->assertDatabaseCount('delivery_requests', 1);
        Queue::assertPushed(SubmitDeliveryRequest::class, 1);
    }

    public function test_disabled_partner_is_rejected_but_missing_optional_mapping_uses_product_id(): void
    {
        Queue::fake();
        $partner = $this->partner(['enabled' => false]);
        $order = $this->readyOrder($partner);
        $this->actingAs($this->admin)->postJson("/api/admin/logistics/shipments/{$order->id}/send", ['logistics_partner_id' => $partner->id])
            ->assertUnprocessable()->assertJsonValidationErrors('partner');
        $partner->update(['enabled' => true]);
        LogisticsItemMapping::query()->delete();
        $preview = $this->actingAs($this->admin)->postJson("/api/admin/logistics/shipments/{$order->id}/preview", ['logistics_partner_id' => $partner->id])
            ->assertOk();
        $preview->assertJsonPath('payload.items.0.product_id', (string) $this->product->id)
            ->assertJsonPath('payload.items.0.product_name', 'Synthetic Product')
            ->assertJsonPath('payload.items.0.quantity', 2)
            ->assertJsonPath('payload.items.0.unit', 'PCS')
            ->assertJsonMissingPath('payload.items.0.partner_item_reference');

        $this->actingAs($this->admin)->postJson("/api/admin/logistics/shipments/{$order->id}/send", ['logistics_partner_id' => $partner->id])
            ->assertAccepted()->assertJsonPath('payload.items.0.product_id', (string) $this->product->id);
        $this->assertDatabaseCount('delivery_requests', 1);
    }

    public function test_submission_requires_valid_acceptance_and_preserves_stable_identity(): void
    {
        $partner = $this->partner();
        $order = $this->readyOrder($partner);
        $delivery = $this->delivery($partner, $order, 'QUEUED');
        Http::fake(['https://partner.test/*' => Http::response([
            'accepted' => true, 'delivery_request_id' => $delivery->request_uuid,
            'partner_delivery_request_id' => 'LSP-TEST-849203', 'status' => 'ACCEPTED',
        ], 202)]);
        app(DeliverySubmissionService::class)->submit($delivery->id);
        $delivery->refresh();
        $this->assertSame('ACCEPTED', $delivery->state);
        $this->assertSame('LSP-TEST-849203', $delivery->partner_request_id);
        Http::assertSent(fn ($request) => $request->header('Idempotency-Key')[0] === $delivery->request_uuid
            && $request['delivery_request_id'] === $delivery->request_uuid
            && $request['items'][0]['product_id'] === (string) $this->product->id
            && $request['items'][0]['product_name'] === 'Synthetic Product'
            && (float) $request['items'][0]['quantity'] === 2.0
            && $request['items'][0]['unit'] === 'PCS'
            && $request['items'][0]['partner_item_reference'] === 'SKU-TEST-001');
    }

    public function test_retry_reuses_the_immutable_snapshot_and_idempotency_identity(): void
    {
        $partner = $this->partner();
        $order = $this->readyOrder($partner);
        $delivery = $this->delivery($partner, $order, 'QUEUED');
        $snapshot = $delivery->payload_snapshot;
        Http::fakeSequence()
            ->push(['message' => 'temporarily unavailable'], 503)
            ->push([
                'accepted' => true,
                'delivery_request_id' => $delivery->request_uuid,
                'partner_delivery_request_id' => 'LSP-STABLE-1',
                'status' => 'ACCEPTED',
            ], 202);

        try { app(DeliverySubmissionService::class)->submit($delivery->id); } catch (\RuntimeException) {}
        $this->product->update(['name' => 'Changed After Queue']);
        $order->items()->firstOrFail()->update(['product_name' => 'Changed After Queue', 'quantity' => 99, 'unit' => 'KG']);
        app(DeliverySubmissionService::class)->submit($delivery->id);

        $delivery->refresh();
        $this->assertSame($snapshot, $delivery->payload_snapshot);
        $this->assertSame('ACCEPTED', $delivery->state);
        Http::assertSentCount(2);
        Http::assertSent(fn ($request) => $request->header('Idempotency-Key')[0] === $delivery->request_uuid
            && $request->data() === $snapshot);
    }

    public function test_timeout_is_bounded_and_marked_retry_pending_only_with_idempotency(): void
    {
        $partner = $this->partner();
        $delivery = $this->delivery($partner, $this->readyOrder($partner), 'QUEUED');
        Http::fake(fn () => throw new ConnectionException('Synthetic timeout'));
        try { app(DeliverySubmissionService::class)->submit($delivery->id); } catch (\RuntimeException) {}
        $this->assertDatabaseHas('delivery_requests', ['id' => $delivery->id, 'state' => 'RETRY_PENDING', 'retry_count' => 1]);
        $this->assertDatabaseHas('delivery_submission_attempts', ['delivery_request_id' => $delivery->id, 'result' => 'RETRY_PENDING']);
    }

    public function test_invalid_success_body_is_rejected_and_a_second_worker_does_not_send_again(): void
    {
        $partner = $this->partner();
        $delivery = $this->delivery($partner, $this->readyOrder($partner), 'QUEUED');
        Http::fake(['https://partner.test/*' => Http::response(['message' => 'ok'], 200)]);
        app(DeliverySubmissionService::class)->submit($delivery->id);
        app(DeliverySubmissionService::class)->submit($delivery->id);
        $this->assertDatabaseHas('delivery_requests', ['id' => $delivery->id, 'state' => 'REJECTED', 'last_error_code' => 'INVALID_ACCEPTANCE_RESPONSE']);
        Http::assertSentCount(1);
    }

    public function test_partner_rejection_and_non_idempotent_ambiguous_outcome_are_not_retried(): void
    {
        $partner = $this->partner();
        $rejected = $this->delivery($partner, $this->readyOrder($partner), 'QUEUED');
        Http::fake(['https://partner.test/*' => Http::response(['accepted' => false], 422)]);
        app(DeliverySubmissionService::class)->submit($rejected->id);
        $this->assertDatabaseHas('delivery_requests', ['id' => $rejected->id, 'state' => 'REJECTED']);

        $partnerTwo = $this->partner(['code' => 'PARTNER_NO_RETRY', 'name' => 'No Retry Partner']);
        $ambiguous = $this->delivery($partnerTwo, $this->readyOrder($partnerTwo), 'QUEUED');
        $partnerTwo->update(['supports_idempotency' => false]);
        Http::fake(fn () => throw new ConnectionException('Synthetic timeout'));
        app(DeliverySubmissionService::class)->submit($ambiguous->id);
        $this->assertDatabaseHas('delivery_requests', [
            'id' => $ambiguous->id, 'state' => 'RECONCILIATION_REQUIRED',
            'last_error_code' => 'AMBIGUOUS_NETWORK_FAILURE',
        ]);
    }

    public function test_a_fresh_sending_claim_prevents_a_second_worker_http_call(): void
    {
        $partner = $this->partner();
        $delivery = $this->delivery($partner, $this->readyOrder($partner), 'SENDING');
        Http::fake(['https://partner.test/*' => Http::response([], 500)]);
        app(DeliverySubmissionService::class)->submit($delivery->id);
        Http::assertNothingSent();
        $this->assertDatabaseCount('delivery_submission_attempts', 0);
    }

    public function test_legacy_unsent_sku_snapshot_requires_reconciliation_without_http_submission(): void
    {
        $partner = $this->partner();
        $delivery = $this->delivery($partner, $this->readyOrder($partner), 'QUEUED');
        $legacy = $delivery->payload_snapshot;
        $legacy['items'] = [['item_reference' => 'OLD-SKU', 'description' => 'Old item', 'quantity' => 2, 'unit' => 'PCS']];
        $delivery->update(['payload_snapshot' => $legacy]);
        Http::fake(['*' => Http::response([], 202)]);

        app(DeliverySubmissionService::class)->submit($delivery->id);

        Http::assertNothingSent();
        $this->assertDatabaseHas('delivery_requests', [
            'id' => $delivery->id, 'state' => 'RECONCILIATION_REQUIRED', 'last_error_code' => 'LEGACY_ITEM_IDENTITY',
        ]);
        $this->assertDatabaseCount('delivery_submission_attempts', 0);
    }

    public function test_authenticated_callbacks_are_deduplicated_partner_scoped_and_monotonic(): void
    {
        $partner = $this->partner();
        $order = $this->readyOrder($partner);
        $delivery = $this->delivery($partner, $order);
        $stockOutCount = StockOutTransaction::count();

        $inTransit = [
            'schema_version' => '1.0', 'event_id' => 'evt-test-1',
            'delivery_request_id' => $delivery->request_uuid, 'partner_delivery_request_id' => 'LSP-TEST-1',
            'status' => 'IN_TRANSIT', 'occurred_at' => now()->toAtomString(),
        ];
        $this->signedCallback($partner, $inTransit)->assertOk()->assertJsonPath('result', 'APPLIED');
        $this->signedCallback($partner, $inTransit)->assertOk()->assertJsonPath('result', 'DUPLICATE');
        $delivered = $inTransit + [];
        $delivered['event_id'] = 'evt-test-2'; $delivered['status'] = 'DELIVERED'; $delivered['occurred_at'] = now()->addMinute()->toAtomString();
        $this->signedCallback($partner, $delivered)->assertOk()->assertJsonPath('smartchain_status', 'DELIVERED');
        $late = $inTransit; $late['event_id'] = 'evt-test-3'; $late['occurred_at'] = now()->addMinutes(2)->toAtomString();
        $this->signedCallback($partner, $late)->assertOk()->assertJsonPath('result', 'IGNORED_OUT_OF_ORDER');

        $this->assertDatabaseCount('delivery_status_events', 3);
        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'DELIVERED']);
        $this->assertSame($stockOutCount, StockOutTransaction::count());
    }

    public function test_callback_rejects_missing_auth_stale_signature_wrong_partner_unknown_request_and_conflict(): void
    {
        $partner = $this->partner();
        $order = $this->readyOrder($partner);
        $delivery = $this->delivery($partner, $order);
        $payload = [
            'schema_version' => '1.0', 'event_id' => 'evt-conflict', 'delivery_request_id' => $delivery->request_uuid,
            'partner_delivery_request_id' => 'LSP-TEST-1', 'status' => 'IN_TRANSIT', 'occurred_at' => now()->toAtomString(),
        ];
        $this->postJson('/api/integrations/logistics/v1/status-events', $payload)->assertUnauthorized();
        $this->signedCallback($partner, $payload, now()->subMinutes(10)->timestamp)->assertUnauthorized();
        $this->signedCallback($partner, $payload)->assertOk();
        $payload['status'] = 'DELIVERED';
        $this->signedCallback($partner, $payload)->assertConflict()->assertJsonPath('error.code', 'EVENT_ID_CONFLICT');

        $other = $this->partner(['code' => 'PARTNER_OTHER', 'name' => 'Other Partner']);
        $payload['event_id'] = 'evt-wrong';
        $this->signedCallback($other, $payload)->assertForbidden()->assertJsonPath('error.code', 'WRONG_PARTNER');
        $payload['event_id'] = 'evt-unknown'; $payload['delivery_request_id'] = (string) Str::uuid();
        $this->signedCallback($partner, $payload)->assertNotFound()->assertJsonPath('error.code', 'UNKNOWN_DELIVERY_REQUEST');
    }

    public function test_direct_delivered_callback_can_arrive_before_acceptance_is_saved_and_invalid_schema_is_rejected(): void
    {
        $partner = $this->partner();
        $order = $this->readyOrder($partner);
        $delivery = $this->delivery($partner, $order, 'SENDING');
        $payload = [
            'schema_version' => '1.0', 'event_id' => 'evt-direct-delivered',
            'delivery_request_id' => $delivery->request_uuid, 'partner_delivery_request_id' => 'LSP-EARLY-1',
            'status' => 'DELIVERED', 'occurred_at' => now()->toAtomString(),
        ];
        $this->signedCallback($partner, $payload)->assertOk()->assertJsonPath('smartchain_status', 'DELIVERED');
        $this->assertDatabaseHas('delivery_requests', [
            'id' => $delivery->id, 'state' => 'DELIVERED', 'partner_request_id' => 'LSP-EARLY-1',
        ]);
        $invalid = $payload; $invalid['event_id'] = 'evt-invalid'; $invalid['status'] = 'PICKED_UP';
        $this->signedCallback($partner, $invalid)->assertUnprocessable();
        $unknown = $payload; $unknown['event_id'] = 'evt-unknown-field'; $unknown['vehicle_id'] = 'not-supported';
        $this->signedCallback($partner, $unknown)->assertUnprocessable()->assertJsonPath('error.code', 'UNKNOWN_FIELDS');
    }

    public function test_callback_rejects_an_order_that_is_no_longer_in_a_logistics_state(): void
    {
        $partner = $this->partner();
        $order = $this->readyOrder($partner);
        $delivery = $this->delivery($partner, $order);
        $order->update(['status' => 'CANCELLED']);
        $payload = [
            'schema_version' => '1.0', 'event_id' => 'evt-invalid-state',
            'delivery_request_id' => $delivery->request_uuid, 'partner_delivery_request_id' => 'LSP-TEST-1',
            'status' => 'IN_TRANSIT', 'occurred_at' => now()->toAtomString(),
        ];
        $this->signedCallback($partner, $payload)->assertConflict()->assertJsonPath('error.code', 'INVALID_STATE');
        $this->assertDatabaseMissing('delivery_status_events', ['event_id' => 'evt-invalid-state']);
    }

    private function signedCallback(LogisticsPartner $partner, array $payload, ?int $timestamp = null)
    {
        $timestamp ??= now()->timestamp;
        $body = json_encode($payload, JSON_UNESCAPED_SLASHES);
        $signature = hash_hmac('sha256', $timestamp.'.'.$body, $partner->callback_secret);
        return $this->call('POST', '/api/integrations/logistics/v1/status-events', [], [], [], [
            'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_SMARTCHAIN_PARTNER' => $partner->code,
            'HTTP_X_SMARTCHAIN_TIMESTAMP' => (string) $timestamp,
            'HTTP_X_SMARTCHAIN_SIGNATURE' => $signature,
        ], $body);
    }
}
