<?php

namespace Tests\Feature;

use App\Models\{Branch, ExcessDeliveryReview, FinancialPoSubmission, Product, PurchaseOrder, QaInspection, QaInspectionItem, Receiving, ReceivingDiscrepancy, Role, Supplier, SupplierRejectionCase, User, Warehouse};
use App\Services\Financial\{FinancialCaseEventAdapter, FinancialCaseEventService};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class FinancialCaseEventReadinessTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $manager;
    private User $qa;
    private PurchaseOrder $order;
    private Receiving $receiving;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Http::fake();
        config(['financial.enabled' => true, 'financial.contract_confirmed' => true, 'financial.disbursement_enabled' => true]);
        $this->admin = $this->actor('ADMIN');
        $this->manager = $this->actor('PLANT_MANAGER');
        $this->qa = $this->actor('QA_SUPERVISOR');
        $supplier = Supplier::create(['supplier_code' => 'SUP-EVENT', 'name' => 'Original event supplier', 'status' => 'ACTIVE']);
        $product = Product::create(['name' => 'Event product', 'unit' => 'SACK', 'cost_price' => '123.45']);
        $this->order = PurchaseOrder::create(['po_number' => 'PO-HISTORICAL-0042', 'supplier_id' => $supplier->id,
            'supplier_name' => 'Historical supplier name', 'delivery_details' => 'Main warehouse', 'expected_delivery_date' => now()->toDateString(),
            'currency' => 'PHP', 'total_amount' => '1234.50', 'status' => PurchaseOrder::STATUS_COMPLETED, 'approved_by' => $this->admin->id]);
        $poLine = $this->order->items()->create(['product_id' => $product->id, 'product_name' => $product->name,
            'ordered_quantity' => 10, 'unit' => 'SACK', 'unit_price' => '123.45', 'total_price' => '1234.50', 'agreement_reference' => 'AGREEMENT-42']);
        $this->receiving = Receiving::create(['receiving_no' => 'RCV-EVENT-42', 'purchase_order_id' => $this->order->id,
            'purchase_order' => $this->order->po_number, 'supplier' => 'Untrusted receiving snapshot',
            'delivery_date' => now()->toDateString(), 'status' => 'Pending QA', 'prepared_by_id' => $this->manager->id]);
        $this->receiving->items()->create(['purchase_order_item_id' => $poLine->id, 'product_id' => $product->id, 'product_name' => $product->name,
            'ordered_quantity' => 10, 'delivered_quantity' => 8, 'unit' => 'sack', 'inspection_status' => 'Pending QA']);
        $this->receiving->receiptAttachments()->create(['original_name' => 'delivery.pdf', 'stored_path' => 'private/never-export.pdf',
            'mime_type' => 'application/pdf', 'file_size' => 42, 'file_sha256' => str_repeat('a', 64), 'uploaded_by' => $this->manager->id]);
        FinancialPoSubmission::create(['purchase_order_id' => $this->order->id, 'message_id' => (string) \Illuminate\Support\Str::uuid(),
            'state' => 'ACKNOWLEDGED', 'payload_version' => '1.0', 'payload_sha256' => str_repeat('b', 64), 'payload_snapshot' => [],
            'financial_reference' => 'FIN-PO-TEST-42', 'created_by' => $this->admin->id]);
    }

    private function actor(string $role): User
    {
        $model = Role::firstOrCreate(['slug' => $role], ['name' => $role]);
        return User::factory()->create(['role_id' => $model->id, 'status' => 'ACTIVE']);
    }

    private function excess(): ExcessDeliveryReview
    {
        $line = $this->receiving->items()->firstOrFail();
        $line->update(['delivered_quantity' => 2, 'inspection_status' => 'On Hold']);
        $authorized = $this->receiving->items()->create(['purchase_order_item_id' => $line->purchase_order_item_id,
            'product_id' => $line->product_id, 'product_name' => $line->product_name, 'ordered_quantity' => 10,
            'delivered_quantity' => 10, 'unit' => 'SACK', 'inspection_status' => 'Pending QA']);
        $branch = Branch::create(['name' => 'Event branch', 'code' => 'EVENT-BR']);
        $warehouse = Warehouse::create(['name' => 'Event warehouse', 'code' => 'EVENT-WH', 'branch_id' => $branch->id, 'status' => 'ACTIVE', 'capacity' => 1000]);
        $case = ExcessDeliveryReview::create(['submission_key' => (string) \Illuminate\Support\Str::uuid(),
            'delivery_identity' => hash('sha256', 'event-delivery'), 'reference' => 'EXC-TEST-42', 'receiving_id' => $this->receiving->id,
            'purchase_order_id' => $this->order->id, 'supplier_id' => $this->order->supplier_id, 'warehouse_id' => $warehouse->id,
            'submitted_by_id' => $this->manager->id, 'status' => ExcessDeliveryReview::STATUS_FINANCIAL_HOLD,
            'review_notes' => 'ADDITIONAL_SUPPLIER_CHARGE', 'reviewed_by_id' => $this->admin->id, 'reviewed_at' => now(),
            'financial_reconciliation_status' => 'MANUAL_RECONCILIATION_REQUIRED']);
        $case->items()->create(['receiving_item_id' => $line->id, 'authorized_receiving_item_id' => $authorized->id, 'purchase_order_item_id' => $line->purchase_order_item_id,
            'product_id' => $line->product_id, 'po_remaining_quantity' => 10, 'actual_delivered_quantity' => 12,
            'authorized_quantity' => 10, 'excess_quantity' => 2, 'unit' => 'SACK']);
        $case->documents()->create(['internal_reference' => 'EXDOC-TEST-42', 'purpose' => 'SUPPLIER_CONFIRMATION',
            'document_type' => 'SUPPLIER_LETTER', 'original_name' => 'supplier-letter.pdf', 'stored_path' => 'private/letter.pdf',
            'mime_type' => 'application/pdf', 'file_size' => 50, 'file_sha256' => str_repeat('c', 64), 'uploaded_by_id' => $this->admin->id]);
        return $case;
    }

    private function rejection(): SupplierRejectionCase
    {
        $line = $this->receiving->items()->firstOrFail();
        $inspection = QaInspection::create(['receiving_id' => $this->receiving->id, 'cycle_number' => 1, 'status' => 'Partial',
            'started_at' => now()->subHour(), 'completed_at' => now(), 'inspected_by_id' => $this->qa->id, 'submitted_by_id' => $this->qa->id]);
        $inspection->attachments()->create(['original_name' => 'qa-photo.jpg', 'stored_path' => 'private/qa.jpg',
            'mime_type' => 'image/jpeg', 'file_size' => 50, 'file_sha256' => str_repeat('d', 64), 'uploaded_by' => $this->qa->id]);
        $item = QaInspectionItem::create(['qa_inspection_id' => $inspection->id, 'receiving_item_id' => $line->id,
            'accepted_quantity' => 5, 'rejected_quantity' => 3, 'inspection_result' => 'Partial', 'remarks' => 'Damaged seals']);
        return SupplierRejectionCase::create(['qa_inspection_item_id' => $item->id, 'status' => 'SENDING', 'send_attempts' => 1]);
    }

    private function discrepancy(array $values = []): ReceivingDiscrepancy
    {
        return ReceivingDiscrepancy::create($values + ['purchase_order_id' => $this->order->id, 'receiving_id' => $this->receiving->id,
            'supplier_id' => $this->order->supplier_id, 'discrepancy_type' => 'SHORT_DELIVERY',
            'expected_quantity' => 10, 'delivered_quantity' => 8, 'short_quantity' => 2, 'status' => 'REPORTED',
            'reported_by_id' => $this->manager->id, 'reported_at' => now()]);
    }

    private function preview(string $type, int $id)
    {
        return $this->actingAs($this->admin)->getJson("/api/financial-case-events/{$type}/{$id}/preview");
    }

    public function test_excess_payload_uses_historical_identity_exact_decimals_and_safe_evidence_without_effects(): void
    {
        $case = $this->excess();
        $before = $case->fresh()->getAttributes();
        $response = $this->preview('excess', $case->id)->assertOk()
            ->assertJsonPath('data.source_ready', true)->assertJsonPath('data.can_submit', false)
            ->assertJsonPath('data.contract_status', 'CONTRACT_PENDING')->assertJsonPath('data.transport_status', 'NOT_SUBMITTED')
            ->assertJsonPath('data.payload.purchase_order_reference', 'PO-HISTORICAL-0042')
            ->assertJsonPath('data.payload.financial_reference', 'FIN-PO-TEST-42')
            ->assertJsonPath('data.payload.supplier.name', 'Original event supplier')
            ->assertJsonPath('data.payload.details.lines.0.original_ordered_quantity', 10)
            ->assertJsonPath('data.payload.details.lines.0.actual_delivered_quantity', 12)
            ->assertJsonPath('data.payload.details.lines.0.confirmed_excess_quantity', 2)
            ->assertJsonPath('data.payload.details.lines.0.historical_po_unit_price', '123.45')
            ->assertJsonPath('data.payload.details.lines.0.agreement_reference', 'AGREEMENT-42')
            ->assertJsonPath('data.payload.details.cost_resolution', null)->assertJsonCount(2, 'data.payload.evidence');
        $this->assertStringNotContainsString('stored_path', $response->getContent());
        $this->assertStringNotContainsString('private/', $response->getContent());
        $this->assertStringNotContainsString('view_url', $response->getContent());
        $this->assertSame($before, $case->fresh()->getAttributes());
        $this->assertSame('On Hold', $this->receiving->items()->first()->inspection_status);
        $this->assertSame('1234.50', $this->order->fresh()->total_amount);
        $this->assertDatabaseCount('inventories', 0);
        $this->assertDatabaseCount('financial_obligations', 0);
        Http::assertNothingSent();
    }

    public function test_invalid_or_unreviewed_excess_is_held_with_explicit_missing_information(): void
    {
        $case = $this->excess();
        $case->update(['status' => 'PENDING_REVIEW', 'review_notes' => null, 'reviewed_at' => null]);
        $case->items()->update(['excess_quantity' => 4, 'unit' => 'UNSUPPORTED']);
        $this->receiving->receiptAttachments()->delete();
        $case->documents()->delete();
        $this->preview('excess', $case->id)->assertOk()->assertJsonPath('data.source_ready', false)
            ->assertJsonStructure(['data' => ['validation_errors' => ['case_readiness', 'review_reason', 'quantities', 'unit', 'evidence']]]);
        Http::assertNothingSent();
    }

    public function test_rejection_notice_preserves_supplier_email_state_qa_evidence_and_unresolved_case(): void
    {
        $case = $this->rejection();
        $before = $case->fresh()->getAttributes();
        $this->preview('rejection', $case->id)->assertOk()->assertJsonPath('data.source_ready', true)
            ->assertJsonPath('data.payload.details.rejected_quantity', 3)->assertJsonPath('data.payload.details.unit', 'SACK')
            ->assertJsonPath('data.payload.details.rejection_reason', 'Damaged seals')
            ->assertJsonPath('data.payload.details.supplier_notification.state', 'SENDING')
            ->assertJsonPath('data.transport_status', 'NOT_SUBMITTED')->assertJsonPath('data.financial_event_reference', null)
            ->assertJsonPath('data.payload.evidence.1.type', 'QA_EVIDENCE');
        $this->assertSame($before, $case->fresh()->getAttributes());
        $this->assertNull($case->fresh()->resolved_at);
        Http::assertNothingSent();
    }

    public function test_incomplete_qa_or_missing_reason_and_resolved_rejections_are_ineligible(): void
    {
        $case = $this->rejection();
        $case->inspectionItem->inspection->update(['completed_at' => null]);
        $case->inspectionItem->update(['remarks' => null]);
        $this->preview('rejection', $case->id)->assertOk()->assertJsonPath('data.source_ready', false)
            ->assertJsonStructure(['data' => ['validation_errors' => ['inspection', 'rejection_reason', 'occurred_at']]]);
        $case->update(['status' => 'RESOLVED']);
        $this->preview('rejection', $case->id)->assertOk()->assertJsonPath('data.source_ready', false)
            ->assertJsonStructure(['data' => ['validation_errors' => ['case_readiness']]]);
    }

    public function test_partial_shipment_is_not_invented_as_confirmed_shortage_and_identity_is_stable(): void
    {
        $case = $this->discrepancy(['supplier_response_code' => 'WILL_FULFILL', 'status' => 'AWAITING_BALANCE_DELIVERY']);
        $first = $this->preview('discrepancy', $case->id)->assertOk()->assertJsonPath('data.source_ready', false)
            ->assertJsonPath('data.payload.details.recorded_aggregate.short_balance', 2)
            ->assertJsonPath('data.payload.details.recorded_aggregate.unit', null)
            ->assertJsonPath('data.payload.details.expected_current_delivery_quantity', null)
            ->assertJsonPath('data.payload.details.receiving_lines.0.unit', 'SACK')
            ->assertJsonPath('data.payload.details.receiving_lines.0.confirmed_short_quantity', null)
            ->assertJsonStructure(['data' => ['validation_errors' => ['shipment_confirmation', 'line_allocation']]]);
        $second = $this->preview('discrepancy', $case->id)->assertOk();
        $this->assertSame($first->json('data.event_id'), $second->json('data.event_id'));
        $this->assertSame($first->json('data.payload_sha256'), $second->json('data.payload_sha256'));
        $this->assertDatabaseCount('receiving_discrepancies', 1);
        Http::assertNothingSent();
    }

    public function test_even_closed_nonfulfillment_retains_accurate_balance_but_cannot_invent_shipment_confirmation(): void
    {
        $case = $this->discrepancy(['supplier_response_code' => 'WILL_NOT_FULFILL', 'status' => 'CLOSED_WITH_SHORTAGE',
            'response_notes' => 'Supplier cannot fulfill balance', 'resolution_notes' => 'Closed remaining balance', 'resolved_at' => now()]);
        $this->preview('discrepancy', $case->id)->assertOk()->assertJsonPath('data.source_ready', false)
            ->assertJsonPath('data.payload.details.recorded_aggregate.po_balance_expected', 10)
            ->assertJsonPath('data.payload.details.recorded_aggregate.delivered', 8)
            ->assertJsonPath('data.payload.details.recorded_aggregate.short_balance', 2);
        $this->assertSame('CLOSED_WITH_SHORTAGE', $case->fresh()->status);
        Http::assertNothingSent();
    }

    public function test_preview_permissions_and_pm_redaction_match_existing_case_ownership(): void
    {
        $case = $this->excess();
        $url = "/api/financial-case-events/excess/{$case->id}/preview";
        $this->getJson($url)->assertUnauthorized();
        $this->actingAs($this->qa)->getJson($url)->assertForbidden();
        $this->actingAs($this->actor('SUPPLIER'))->getJson($url)->assertForbidden();
        $this->actingAs($this->manager)->getJson($url)->assertOk()->assertJsonMissingPath('data.payload')->assertJsonMissingPath('data.payload_sha256');
        $other = $this->actor('PLANT_MANAGER');
        $this->actingAs($other)->getJson($url)->assertNotFound();
        $discrepancy = $this->discrepancy();
        $url = "/api/financial-case-events/discrepancy/{$discrepancy->id}/preview";
        $this->getJson($url)->assertNotFound();
        $this->actingAs($this->manager)->getJson($url)->assertOk();
        $this->getJson('/api/financial-case-events/rejection/9999/preview')->assertForbidden();
        $this->actingAs($this->admin)->getJson('/api/financial-case-events/unknown/1/preview')->assertNotFound();
    }

    public function test_unknown_case_contract_cannot_send_even_with_po_flags_enabled_or_repeated_calls(): void
    {
        $service = app(FinancialCaseEventService::class);
        foreach (range(1, 2) as $attempt) {
            try { $service->submit($this->admin); $this->fail('Case transmission must be unavailable.'); }
            catch (ValidationException $error) { $this->assertArrayHasKey('financial_contract', $error->errors()); }
        }
        $adapter = app(FinancialCaseEventAdapter::class);
        $this->assertNull($adapter->validatedAcknowledgment(['success' => true, 'data' => ['receipt_status' => 'RECEIVED']], 'event-1'));
        try { $adapter->outbound(['event_id' => 'event-1']); $this->fail('A request mapping has not been agreed.'); }
        catch (ValidationException $error) { $this->assertArrayHasKey('financial_contract', $error->errors()); }
        $this->assertDatabaseCount('financial_obligations', 0);
        $this->assertDatabaseCount('financial_po_submissions', 1);
        Http::assertNothingSent();
    }

    public function test_source_changes_keep_identity_but_change_preview_hash_and_unacknowledged_po_reference_is_not_claimed(): void
    {
        $case = $this->excess();
        $first = $this->preview('excess', $case->id)->assertOk();
        $case->update(['review_notes' => 'INVOICE_ADJUSTMENT_REQUIRED']);
        $this->order->financialSubmission->update(['state' => 'FAILED']);
        $second = $this->preview('excess', $case->id)->assertOk()->assertJsonPath('data.payload.financial_reference', null);
        $this->assertSame($first->json('data.event_id'), $second->json('data.event_id'));
        $this->assertNotSame($first->json('data.payload_sha256'), $second->json('data.payload_sha256'));
        $supplier = Supplier::create(['supplier_code' => 'SUP-OTHER', 'name' => 'Other supplier', 'status' => 'ACTIVE']);
        $case->update(['supplier_id' => $supplier->id]);
        $this->preview('excess', $case->id)->assertOk()->assertJsonPath('data.source_ready', false)
            ->assertJsonStructure(['data' => ['validation_errors' => ['supplier']]]);
        $this->assertDatabaseCount('financial_po_submissions', 1);
        Http::assertNothingSent();
    }

    public function test_test_only_adapter_can_map_synthetic_receipts_without_claiming_a_partner_contract(): void
    {
        // Synthetic fixture protocol only: these keys and statuses are NOT partner proposals.
        $adapter = new class extends FinancialCaseEventAdapter {
            public function outbound(array $internalEnvelope): array { return ['fixture_id' => $internalEnvelope['event_id']]; }
            public function acknowledgment(mixed $body, string $expectedEventId): ?array {
                return is_array($body) && ($body['fixture_id'] ?? null) === $expectedEventId && isset($body['fixture_reference'], $body['fixture_status'])
                    ? ['event_id' => $expectedEventId, 'financial_reference' => $body['fixture_reference'], 'external_status' => $body['fixture_status']] : null;
            }
        };
        $case = $this->excess();
        $payload = $this->preview('excess', $case->id)->json('data.payload');
        $this->assertSame(['fixture_id' => $payload['event_id']], $adapter->outbound($payload));
        $this->assertNull($adapter->validatedAcknowledgment(['fixture_id' => 'wrong'], $payload['event_id']));
        $this->assertNull($adapter->validatedAcknowledgment(['fixture_id' => $payload['event_id'], 'fixture_reference' => '', 'fixture_status' => 'arbitrary-test-status'], $payload['event_id']));
        $receipt = $adapter->validatedAcknowledgment(['fixture_id' => $payload['event_id'], 'fixture_reference' => 'TEST-ONLY', 'fixture_status' => 'arbitrary-test-status'], $payload['event_id']);
        $this->assertSame('arbitrary-test-status', $receipt['external_status']);
        $this->assertSame(ExcessDeliveryReview::STATUS_FINANCIAL_HOLD, $case->fresh()->status);
        Http::assertNothingSent();
    }
}
