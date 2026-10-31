<?php

namespace App\Services\Financial;

class FinancialDisbursementAdapter
{
    public function outbound(array $snapshot): array
    {
        return $snapshot;
    }

    /** @return array{acknowledged: bool, external_reference: ?string, acknowledgment: ?string} */
    public function acknowledgment(mixed $body, string $expectedExternalReference): array
    {
        $data = is_array($body) ? ($body['data'] ?? null) : null;
        if (! is_array($body)
            || ($body['success'] ?? null) !== true
            || ! is_array($data)
            || ($data['source_system'] ?? null) !== 'SMARTCHAIN'
            || ($data['external_reference_id'] ?? null) !== $expectedExternalReference
            || ! is_string($data['financial_reference'] ?? null)
            || trim($data['financial_reference']) === ''
            || ($data['receipt_status'] ?? null) !== 'RECEIVED'
            || ($data['processing_status'] ?? null) !== 'PENDING_REVIEW') {
            return ['acknowledged' => false, 'external_reference' => null, 'acknowledgment' => null];
        }

        return [
            'acknowledged' => true,
            'external_reference' => trim($data['financial_reference']),
            'acknowledgment' => 'RECEIVED/PENDING_REVIEW',
        ];
    }
}
