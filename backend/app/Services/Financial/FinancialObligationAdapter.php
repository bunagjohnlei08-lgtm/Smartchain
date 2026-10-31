<?php

namespace App\Services\Financial;

class FinancialObligationAdapter
{
    public function payload(array $snapshot): array
    {
        return [
            'external_module' => 'SUPPLY_CHAIN',
            'external_reference_id' => $snapshot['external_reference_id'],
            'category_type' => 'INVENTORY_PURCHASE',
            'amount' => (float) $snapshot['amount'],
            'payee_info' => $snapshot['payee_info'],
            'description' => $snapshot['description'],
        ];
    }

    public function acknowledgment(mixed $body): ?array
    {
        $data = is_array($body) ? ($body['data'] ?? null) : null;
        if (($body['success'] ?? null) !== true || ! is_array($data)
            || ! filled($data['bill_number'] ?? null)
            || ! filled($data['transaction_code'] ?? null)
            || ($data['status'] ?? null) !== 'UNPAID') {
            return null;
        }

        return [
            'bill_number' => trim($data['bill_number']),
            'transaction_code' => trim($data['transaction_code']),
            'financial_status' => 'UNPAID',
        ];
    }
}
