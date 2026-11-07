<?php

namespace App\Services\Financial;

use App\Models\{ExcessDeliveryReview, ReceivingDiscrepancy, SupplierRejectionCase, User};
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class FinancialCaseEventService
{
    public function __construct(private readonly FinancialCaseEventPayloadBuilder $builder) {}

    public function preview(string $type, int $id, User $actor): array
    {
        abort_unless($actor->isAdmin() || $actor->isPlantManager(), 403);
        // Read a consistent source view without persisting an event or touching workflow states.
        $ownsTransaction = DB::transactionLevel() === 0;
        return DB::transaction(function () use ($type, $id, $actor, $ownsTransaction) {
            if ($ownsTransaction) DB::statement('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
            $case = match ($type) {
                'excess' => ExcessDeliveryReview::query()
                    ->when(! $actor->isAdmin(), fn ($q) => $q->where('submitted_by_id', $actor->id))
                    ->findOrFail($id),
                'rejection' => $this->rejection($id, $actor),
                'discrepancy' => ReceivingDiscrepancy::query()
                    ->when(! $actor->isAdmin(), fn ($q) => $q->whereHas('receiving', fn ($r) => $r->where('prepared_by_id', $actor->id)))
                    ->findOrFail($id),
                default => abort(404),
            };
            $result = $this->builder->build($case);
            $payload = $result['payload'];
            $summary = [
                'contract_status' => FinancialCaseEventAdapter::CONTRACT_STATUS,
                'transport_status' => 'NOT_SUBMITTED', 'can_submit' => false,
                'message' => 'Financial API contract pending. Internal preparation does not send data or approve a commercial resolution.',
                'event_id' => $payload['event_id'], 'case_reference' => $payload['external_reference_id'],
                'purchase_order_reference' => $payload['purchase_order_reference'],
                'financial_po_reference' => $payload['financial_reference'],
                'financial_event_reference' => null, 'external_status' => null,
                'source_ready' => $result['source_ready'], 'validation_errors' => $result['validation_errors'],
            ];
            // PM's existing case visibility does not imply access to historical PO pricing,
            // Admin commercial notes or QA documents. Only Admin gets the internal draft.
            return $actor->isAdmin() ? $summary + $result : $summary;
        });
    }

    public function submit(User $actor): never
    {
        abort_unless($actor->isAdmin(), 403);
        // Deliberately no HTTP client, configurable destination or writable attempt record.
        // Enabling the PO flags cannot activate an unknown case-event contract.
        throw ValidationException::withMessages(['financial_contract' => ['Financial API contract pending. Case-event transmission is unavailable.']]);
    }

    private function rejection(int $id, User $actor): SupplierRejectionCase
    {
        abort_unless($actor->isAdmin(), 403);
        return SupplierRejectionCase::findOrFail($id);
    }
}
