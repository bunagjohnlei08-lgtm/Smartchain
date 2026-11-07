<?php

namespace App\Services\Financial;

use Illuminate\Validation\ValidationException;

/** Separate contract boundary: never fall back to PO intake or AP/disbursement. */
class FinancialCaseEventAdapter
{
    public const CONTRACT_STATUS = 'CONTRACT_PENDING';

    public function outbound(array $internalEnvelope): array
    {
        throw ValidationException::withMessages(['financial_contract' => [
            'Financial API contract pending for case events. No partner request mapping or transport is implemented.',
        ]]);
    }

    /**
     * A future agreed mapper may normalize a partner receipt here. An HTTP success
     * or a PO acknowledgment is never sufficient for any of these case contracts.
     * No partner status vocabulary is assumed, and this method changes no records.
     *
     * @return array{event_id:string, financial_reference:string, external_status:string}|null
     */
    public function acknowledgment(mixed $body, string $expectedEventId): ?array
    {
        return null;
    }

    /** Validate a future mapper's normalized receipt without applying a business decision. */
    final public function validatedAcknowledgment(mixed $body, string $expectedEventId): ?array
    {
        $receipt = $this->acknowledgment($body, $expectedEventId);
        if (! is_array($receipt) || ($receipt['event_id'] ?? null) !== $expectedEventId
            || ! is_string($receipt['financial_reference'] ?? null) || trim($receipt['financial_reference']) === ''
            || ! is_string($receipt['external_status'] ?? null) || trim($receipt['external_status']) === '') {
            return null;
        }
        return ['event_id' => $expectedEventId, 'financial_reference' => $receipt['financial_reference'],
            'external_status' => $receipt['external_status']];
    }
}
