<?php

namespace Tests\Feature;

use App\Models\FinancialPoSubmission;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class FinancialPurchaseOrderSubmissionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Supplier $supplier;

    private Product $product;

    private PurchaseOrder $order;

    protected function setUp(): void
    {
        parent::setUp();
        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        $this->supplier = Supplier::create(['supplier_code' => 'SUP-FIN-01', 'name' => 'Financial Fixture Supplier', 'email' => 'supplier@example.test', 'status' => 'ACTIVE']);
        $this->product = Product::create(['name' => 'Legacy Drum Material', 'unit' => 'KG', 'cost_price' => 125.50]);
        $this->order = $this->purchaseOrder();
        config([
            'financial.enabled' => true,
            'financial.contract_confirmed' => true,
            'financial.base_url' => 'https://financial.example.test/api/v1/integration',
            'financial.api_key' => 'synthetic-financial-test-key',
            'financial.request_path' => '/purchase-orders',
        ]);
    }

    public function test_admin_submits_exact_amount_and_legacy_unit_and_stores_acknowledgment(): void
    {
        Http::fake(['financial.example.test/*' => Http::response($this->ack('FIN-PO-1001'), 201)]);

        $this->actingAs($this->admin)->postJson($this->endpoint())->assertOk()
            ->assertJsonPath('financial_integration.state', FinancialPoSubmission::ACKNOWLEDGED)
            ->assertJsonPath('financial_integration.financial_reference', 'FIN-PO-1001');

        $submission = FinancialPoSubmission::sole();
        $this->assertSame('1255.00', $submission->payload_snapshot['total_amount']);
        $this->assertSame('KG', $submission->payload_snapshot['items'][0]['unit']);
        $this->assertSame('125.50', $submission->payload_snapshot['items'][0]['unit_price']);
        $this->assertSame('1255.00', $submission->payload_snapshot['items'][0]['line_total']);
        $this->assertSame(PurchaseOrder::STATUS_APPROVED, $this->order->fresh()->status);

        Http::assertSent(function (Request $request) use ($submission) {
            $this->assertSame('synthetic-financial-test-key', $request->header('X-API-KEY')[0]);
            $this->assertSame($submission->message_id, $request->header('Idempotency-Key')[0]);
            $this->assertSame('https://financial.example.test/api/v1/integration/purchase-orders', $request->url());
            $this->assertSame('1.0', $request['schema_version']);
            $this->assertSame('SMARTCHAIN', $request['source_system']);
            $this->assertSame($submission->message_id, $request['message_id']);
            $this->assertSame('PO-FIN-1001', $request['external_reference_id']);
            $this->assertSame('INVENTORY_PURCHASE', $request['category_type']);
            $this->assertSame('PHP', $request['currency']);
            $this->assertSame('1255.00', $request['total_amount']);
            $this->assertSame('SUP-FIN-01', $request['supplier']['supplier_code']);
            $this->assertSame('Financial Fixture Supplier', $request['supplier']['name']);
            $this->assertSame((string) $this->order->items->first()->id, $request['items'][0]['source_po_line_id']);
            $this->assertSame((string) $this->product->id, $request['items'][0]['product_id']);
            $this->assertSame('10', $request['items'][0]['quantity']);
            $this->assertSame('KG', $request['items'][0]['unit']);

            return true;
        });
    }

    public function test_feature_and_contract_flags_prevent_network_transmission(): void
    {
        Http::fake();
        config(['financial.enabled' => false]);
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertUnprocessable()->assertJsonValidationErrors('financial');
        config(['financial.enabled' => true, 'financial.contract_confirmed' => false]);
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertUnprocessable()->assertJsonValidationErrors('financial');
        Http::assertNothingSent();
        $this->assertDatabaseCount('financial_po_submissions', 0);
    }

    public function test_only_admin_can_submit_and_pending_order_is_ineligible(): void
    {
        Http::fake();
        $role = Role::firstOrCreate(['slug' => 'SUPPLIER'], ['name' => 'Supplier']);
        $supplierUser = User::factory()->create(['role_id' => $role->id, 'supplier_id' => $this->supplier->id, 'status' => 'ACTIVE']);
        $this->actingAs($supplierUser)->postJson($this->endpoint())->assertForbidden();
        $this->order->update(['status' => PurchaseOrder::STATUS_PENDING_APPROVAL]);
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertUnprocessable()->assertJsonValidationErrors('status');
        Http::assertNothingSent();
    }

    public function test_successful_http_with_unknown_schema_requires_reconciliation_not_approval(): void
    {
        Http::fake(['financial.example.test/*' => Http::response(['status' => 'APPROVED'], 200)]);
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertAccepted()
            ->assertJsonPath('financial_integration.state', FinancialPoSubmission::RECONCILIATION_REQUIRED);
        $this->assertSame(PurchaseOrder::STATUS_APPROVED, $this->order->fresh()->status);
        $this->assertNull(FinancialPoSubmission::sole()->financial_reference);
    }

    public function test_unconfirmed_2xx_status_is_not_accepted_even_with_a_valid_body(): void
    {
        Http::fake(['financial.example.test/*' => Http::response($this->ack('FIN-UNEXPECTED'), 202)]);
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertAccepted()
            ->assertJsonPath('financial_integration.state', FinancialPoSubmission::RECONCILIATION_REQUIRED);
        $this->assertNull(FinancialPoSubmission::sole()->financial_reference);
    }

    public function test_repeated_submission_reuses_identity_and_does_not_send_twice(): void
    {
        Http::fake(['financial.example.test/*' => Http::response($this->ack('FIN-ONE'), 201)]);
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertOk();
        $messageId = FinancialPoSubmission::sole()->message_id;
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertOk()
            ->assertJsonPath('financial_integration.message_id', $messageId);
        Http::assertSentCount(1);
        $this->assertDatabaseCount('financial_po_submissions', 1);
        $this->assertDatabaseCount('financial_po_submission_attempts', 1);
    }

    public function test_zero_value_order_is_blocked_without_mutation(): void
    {
        Http::fake();
        $this->order->items()->update(['unit_price' => 0, 'total_price' => 0]);
        $this->order->update(['total_amount' => 0]);
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertUnprocessable()->assertJsonValidationErrors('total_amount');
        Http::assertNothingSent();
        $this->assertSame('0.00', (string) $this->order->fresh()->total_amount);
    }

    public function test_retryable_server_failure_keeps_same_durable_identity(): void
    {
        Http::fake(['financial.example.test/*' => Http::sequence()
            ->push(['message' => 'temporary'], 503)
            ->push($this->ack('FIN-RETRY'), 201)]);
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertAccepted()
            ->assertJsonPath('financial_integration.state', FinancialPoSubmission::RETRY_PENDING);
        $messageId = FinancialPoSubmission::sole()->message_id;
        Carbon::setTestNow(now()->addSeconds(61));
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertOk()
            ->assertJsonPath('financial_integration.message_id', $messageId)
            ->assertJsonPath('financial_integration.financial_reference', 'FIN-RETRY');
        $this->assertDatabaseCount('financial_po_submissions', 1);
        $this->assertDatabaseCount('financial_po_submission_attempts', 2);
    }

    public function test_award_origin_metadata_does_not_change_canonical_submission_support(): void
    {
        $this->order->update(['conversion_key' => 'award:synthetic:supplier:'.$this->supplier->id]);
        Http::fake(['financial.example.test/*' => Http::response($this->ack('FIN-AWARD'), 201)]);
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertOk()
            ->assertJsonPath('financial_integration.financial_reference', 'FIN-AWARD');
        $this->assertSame($this->order->id, FinancialPoSubmission::sole()->purchase_order_id);
    }

    public function test_connection_timeout_can_retry_with_the_same_idempotency_identity(): void
    {
        $calls = 0;
        Http::fake(function () use (&$calls) {
            if ($calls++ === 0) {
                return Http::failedConnection('Synthetic timeout');
            }

            return Http::response($this->ack('FIN-TIMEOUT'), 200);
        });
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertAccepted()
            ->assertJsonPath('financial_integration.state', FinancialPoSubmission::RETRY_PENDING);
        $messageId = FinancialPoSubmission::sole()->message_id;
        Carbon::setTestNow(now()->addSeconds(61));
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertOk()
            ->assertJsonPath('financial_integration.financial_reference', 'FIN-TIMEOUT');
        $this->assertSame($messageId, FinancialPoSubmission::sole()->message_id);
        $this->assertDatabaseCount('financial_po_submission_attempts', 2);
    }

    public function test_identical_duplicate_200_is_a_valid_intake_acknowledgment(): void
    {
        Http::fake(['financial.example.test/*' => Http::response($this->ack('FIN-DUPLICATE'), 200)]);
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertOk()
            ->assertJsonPath('financial_integration.financial_reference', 'FIN-DUPLICATE');
    }

    public function test_multiple_items_and_l_unit_are_serialized_without_conversion(): void
    {
        $liquid = Product::create(['name' => 'Liquid Ingredient', 'unit' => 'L', 'cost_price' => 25]);
        $this->order->items()->create([
            'product_id' => $liquid->id, 'product_name' => $liquid->name,
            'ordered_quantity' => 2, 'unit' => 'L', 'unit_price' => '25.00', 'total_price' => '50.00',
        ]);
        $this->order->update(['total_amount' => '1305.00']);
        Http::fake(['financial.example.test/*' => Http::response($this->ack('FIN-MULTI'), 201)]);

        $this->actingAs($this->admin)->postJson($this->endpoint())->assertOk();
        Http::assertSent(function (Request $request) {
            $this->assertCount(2, $request['items']);
            $this->assertSame(['KG', 'L'], array_column($request['items'], 'unit'));

            return true;
        });
    }

    public function test_invalid_stored_line_total_is_blocked_without_network_transmission(): void
    {
        Http::fake();
        $this->order->items()->update(['total_price' => '1254.99']);
        $this->order->update(['total_amount' => '1254.99']);
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertUnprocessable()->assertJsonValidationErrors('items');
        Http::assertNothingSent();
    }

    #[DataProvider('permanentFailureProvider')]
    public function test_confirmed_permanent_failures_are_not_retried(int $status, string $state): void
    {
        Http::fake(['financial.example.test/*' => Http::response(['success' => false, 'message' => 'Synthetic rejection'], $status)]);
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertAccepted()
            ->assertJsonPath('financial_integration.state', $state);
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertUnprocessable();
        Http::assertSentCount(1);
    }

    public static function permanentFailureProvider(): array
    {
        return [
            'invalid credential' => [401, FinancialPoSubmission::FAILED],
            'changed duplicate payload' => [409, FinancialPoSubmission::RECONCILIATION_REQUIRED],
            'validation failure' => [422, FinancialPoSubmission::FAILED],
        ];
    }

    public function test_obsolete_disbursement_path_is_rejected_before_network_transmission(): void
    {
        Http::fake();
        config(['financial.request_path' => '/request-disbursement']);
        $this->actingAs($this->admin)->postJson($this->endpoint())->assertUnprocessable()->assertJsonValidationErrors('financial');
        Http::assertNothingSent();
    }

    private function endpoint(): string
    {
        return "/api/purchase-orders/{$this->order->id}/financial-submissions";
    }

    private function ack(string $financialReference): array
    {
        return [
            'success' => true,
            'message' => 'Purchase order received and queued for financial review.',
            'data' => [
                'source_system' => 'SMARTCHAIN',
                'external_reference_id' => 'PO-FIN-1001',
                'financial_reference' => $financialReference,
                'receipt_status' => 'RECEIVED',
                'processing_status' => 'PENDING_REVIEW',
            ],
        ];
    }

    private function purchaseOrder(): PurchaseOrder
    {
        $order = PurchaseOrder::create([
            'po_number' => 'PO-FIN-1001', 'supplier_id' => $this->supplier->id,
            'supplier_name' => $this->supplier->name, 'delivery_details' => 'Synthetic test warehouse',
            'expected_delivery_date' => now()->addWeek()->toDateString(), 'total_amount' => '1255.00',
            'currency' => 'PHP', 'status' => PurchaseOrder::STATUS_APPROVED, 'approved_by' => $this->admin->id,
        ]);
        $order->items()->create([
            'product_id' => $this->product->id, 'product_name' => $this->product->name,
            'ordered_quantity' => 10, 'unit' => 'KG', 'unit_price' => '125.50', 'total_price' => '1255.00',
        ]);

        return $order;
    }
}
