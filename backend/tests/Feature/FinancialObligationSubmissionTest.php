<?php

namespace Tests\Feature;

use App\Models\FinancialObligation;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\QaInspection;
use App\Models\Receiving;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierRejectionCase;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class FinancialObligationSubmissionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Supplier $supplier;

    private PurchaseOrder $order;

    private Receiving $receiving;

    protected function setUp(): void
    {
        parent::setUp();
        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
        $this->supplier = Supplier::create([
            'supplier_code' => 'SUP-OB-01', 'name' => 'Verified Payee Supplier',
            'status' => 'ACTIVE', 'bank_name' => 'Synthetic Test Bank', 'bank_account' => 'TEST-ACCOUNT-001',
        ]);
        $product = Product::create(['name' => 'Billable Material', 'unit' => 'KG', 'cost_price' => '25.50']);
        $this->order = PurchaseOrder::create([
            'po_number' => 'PO-OB-1001', 'supplier_id' => $this->supplier->id,
            'supplier_name' => $this->supplier->name, 'delivery_details' => 'Synthetic test receiving location',
            'expected_delivery_date' => now()->addWeek()->toDateString(), 'total_amount' => '255.00',
            'currency' => 'PHP', 'status' => PurchaseOrder::STATUS_APPROVED, 'approved_by' => $this->admin->id,
        ]);
        $poItem = $this->order->items()->create([
            'product_id' => $product->id, 'product_name' => $product->name, 'unit' => 'KG',
            'ordered_quantity' => 10, 'unit_price' => '25.50', 'total_price' => '255.00',
        ]);
        $this->receiving = Receiving::create([
            'receiving_no' => 'RCV-OB-001', 'purchase_order_id' => $this->order->id,
            'purchase_order' => $this->order->po_number, 'supplier' => $this->supplier->name,
            'delivery_date' => now()->toDateString(), 'status' => 'Passed', 'prepared_by_id' => $this->admin->id,
        ]);
        $receivingItem = $this->receiving->items()->create([
            'purchase_order_item_id' => $poItem->id, 'product_id' => $product->id,
            'product_name' => $product->name, 'ordered_quantity' => 10,
            'delivered_quantity' => 10, 'unit' => 'KG', 'inspection_status' => 'Partial',
        ]);
        $inspection = QaInspection::create([
            'receiving_id' => $this->receiving->id, 'status' => 'Partial',
            'started_at' => now()->subMinute(), 'completed_at' => now(),
            'inspected_by_id' => $this->admin->id, 'submitted_by_id' => $this->admin->id,
        ]);
        $inspection->items()->create([
            'receiving_item_id' => $receivingItem->id, 'accepted_quantity' => 8,
            'rejected_quantity' => 2, 'inspection_result' => 'Partial',
        ]);
        config([
            'financial.base_url' => 'https://fms-backend-gani.onrender.com/api/v1/integration',
            'financial.api_key' => 'synthetic-test-key',
            'financial.disbursement_enabled' => true,
            'financial.disbursement_request_path' => '/request-disbursement',
            'financial.disbursement_timeout_seconds' => 60,
        ]);
    }

    public function test_qa_accepted_receipt_creates_bill_and_persists_financial_references(): void
    {
        Http::fake(['fms-backend-gani.onrender.com/*' => Http::response($this->ack(), 200)]);

        $this->actingAs($this->admin)->postJson($this->endpoint(), ['external_reference_id' => 'SC-TEST-RCV-001'])
            ->assertOk()->assertJsonPath('financial_obligation.state', FinancialObligation::BILL_CREATED)
            ->assertJsonPath('financial_obligation.bill_number', 'BILL-TEST-001')
            ->assertJsonPath('financial_obligation.transaction_code', 'TXN-TEST-001')
            ->assertJsonPath('financial_obligation.financial_status', 'UNPAID');

        Http::assertSent(function (Request $request) {
            $this->assertSame('https://fms-backend-gani.onrender.com/api/v1/integration/request-disbursement', $request->url());
            $this->assertSame('synthetic-test-key', $request->header('X-API-KEY')[0]);
            $this->assertSame('SUPPLY_CHAIN', $request['external_module']);
            $this->assertSame('SC-TEST-RCV-001', $request['external_reference_id']);
            $this->assertSame('INVENTORY_PURCHASE', $request['category_type']);
            $this->assertSame(204.0, $request['amount']);
            $this->assertSame('Verified Payee Supplier', $request['payee_info']['name']);
            $this->assertSame('Synthetic Test Bank', $request['payee_info']['bank']);
            $this->assertSame('TEST-ACCOUNT-001', $request['payee_info']['account']);

            return true;
        });
        $this->assertSame(PurchaseOrder::STATUS_APPROVED, $this->order->fresh()->status);
        $this->assertDatabaseHas('financial_obligations', [
            'receiving_id' => $this->receiving->id, 'amount' => '204.00',
            'bill_number' => 'BILL-TEST-001', 'transaction_code' => 'TXN-TEST-001', 'financial_status' => 'UNPAID',
        ]);
    }

    public function test_missing_banking_details_block_transmission(): void
    {
        $this->supplier->update(['bank_name' => null, 'bank_account' => null]);
        Http::fake();
        $this->actingAs($this->admin)->postJson($this->endpoint(), ['external_reference_id' => 'SC-TEST-RCV-002'])
            ->assertUnprocessable()->assertJsonValidationErrors(['bank_name', 'bank_account']);
        Http::assertNothingSent();
    }

    public function test_disabled_feature_blocks_transmission(): void
    {
        config(['financial.disbursement_enabled' => false]);
        Http::fake();
        $this->actingAs($this->admin)->postJson($this->endpoint(), ['external_reference_id' => 'SC-TEST-RCV-003'])
            ->assertUnprocessable()->assertJsonValidationErrors('financial');
        Http::assertNothingSent();
    }

    public function test_duplicate_receipt_obligation_is_returned_without_second_request(): void
    {
        Http::fake(['fms-backend-gani.onrender.com/*' => Http::response($this->ack(), 200)]);
        $payload = ['external_reference_id' => 'SC-TEST-RCV-004'];
        $this->actingAs($this->admin)->postJson($this->endpoint(), $payload)->assertOk();
        $this->actingAs($this->admin)->postJson($this->endpoint(), $payload)->assertOk();
        Http::assertSentCount(1);
        $this->assertDatabaseCount('financial_obligations', 1);
        $this->assertDatabaseCount('financial_obligation_attempts', 1);
    }

    public function test_timeout_requires_reconciliation_and_is_not_blindly_retried(): void
    {
        Http::fake(fn () => Http::failedConnection('Synthetic Render timeout'));
        $payload = ['external_reference_id' => 'SC-TEST-RCV-005'];
        $this->actingAs($this->admin)->postJson($this->endpoint(), $payload)->assertAccepted()
            ->assertJsonPath('financial_obligation.state', FinancialObligation::RECONCILIATION_REQUIRED);
        $this->actingAs($this->admin)->postJson($this->endpoint(), $payload)->assertAccepted();
        Http::assertSentCount(1);
    }

    public function test_401_and_422_are_stored_as_failed_without_retry(): void
    {
        foreach ([401, 422] as $status) {
            $receipt = $status === 401 ? $this->receiving : $this->secondReceiving();
            Http::fake(['fms-backend-gani.onrender.com/*' => Http::response(['success' => false], $status)]);
            $this->actingAs($this->admin)->postJson($this->endpoint($receipt), ['external_reference_id' => "SC-TEST-{$status}"])
                ->assertAccepted()->assertJsonPath('financial_obligation.state', FinancialObligation::FAILED);
            Http::assertSentCount(1);
        }
        $this->assertDatabaseCount('financial_obligations', 2);
    }

    public function test_replacement_receipt_is_billed_only_for_its_accepted_quantity_once(): void
    {
        $replacement = $this->secondReceiving(true, 2, 2, 0);
        Http::fake(['fms-backend-gani.onrender.com/*' => Http::response($this->ack('BILL-REPLACEMENT', 'TXN-REPLACEMENT'), 200)]);
        $payload = ['external_reference_id' => 'AGREED-REPLACEMENT-REFERENCE'];
        $this->actingAs($this->admin)->postJson($this->endpoint($replacement), $payload)->assertOk();
        $this->actingAs($this->admin)->postJson($this->endpoint($replacement), $payload)->assertOk();
        $this->assertDatabaseHas('financial_obligations', ['receiving_id' => $replacement->id, 'amount' => '51.00']);
        Http::assertSentCount(1);
    }

    private function secondReceiving(bool $replacement = false, int $delivered = 10, int $accepted = 8, int $rejected = 2): Receiving
    {
        $rejectionCaseId = null;
        if ($replacement) {
            $rejectionCaseId = SupplierRejectionCase::create([
                'qa_inspection_item_id' => $this->receiving->items()->firstOrFail()->qaInspectionItem->id,
                'status' => 'SENT_TO_RECEIVING',
            ])->id;
        }
        $receiving = Receiving::create([
            'receiving_no' => 'RCV-OB-'.(Receiving::count() + 1), 'purchase_order_id' => $this->order->id,
            'replacement_for_rejection_case_id' => $rejectionCaseId, 'purchase_order' => $this->order->po_number,
            'supplier' => $this->supplier->name, 'delivery_date' => now()->toDateString(),
            'status' => 'Passed', 'prepared_by_id' => $this->admin->id,
        ]);
        $poItem = $this->order->items()->firstOrFail();
        $item = $receiving->items()->create([
            'purchase_order_item_id' => $poItem->id, 'product_id' => $poItem->product_id,
            'product_name' => $poItem->product_name, 'ordered_quantity' => $delivered,
            'delivered_quantity' => $delivered, 'unit' => $poItem->unit, 'inspection_status' => 'Passed',
        ]);
        $inspection = QaInspection::create([
            'receiving_id' => $receiving->id, 'status' => 'Passed', 'started_at' => now()->subMinute(),
            'completed_at' => now(), 'inspected_by_id' => $this->admin->id, 'submitted_by_id' => $this->admin->id,
        ]);
        $inspection->items()->create([
            'receiving_item_id' => $item->id, 'accepted_quantity' => $accepted,
            'rejected_quantity' => $rejected, 'inspection_result' => $rejected ? 'Partial' : 'Passed',
        ]);

        return $receiving;
    }

    private function endpoint(?Receiving $receiving = null): string
    {
        $receiving ??= $this->receiving;

        return "/api/purchase-orders/{$this->order->id}/receivings/{$receiving->id}/financial-obligation";
    }

    private function ack(string $bill = 'BILL-TEST-001', string $transaction = 'TXN-TEST-001'): array
    {
        return ['success' => true, 'message' => 'Disbursement request processed and queued successfully.', 'data' => [
            'bill_number' => $bill, 'transaction_code' => $transaction, 'status' => 'UNPAID',
        ]];
    }
}
