<?php

namespace App\Services\Financial;

use App\Models\PurchaseOrder;
use Illuminate\Validation\ValidationException;

class FinancialPoPayloadBuilder
{
    private const VALID_UNITS = ['PCS', 'SACK', 'DRUM', 'KG', 'L'];

    public function build(PurchaseOrder $order, string $messageId): array
    {
        $order->loadMissing(['items', 'supplier']);
        $errors = [];

        if ($order->status !== PurchaseOrder::STATUS_APPROVED) {
            $errors['status'][] = 'Only an internally approved Purchase Order can be submitted to Financial.';
        }
        if (! filled($order->po_number)) {
            $errors['po_number'][] = 'The Purchase Order number is required.';
        }
        if (filled($order->currency) && $order->currency !== 'PHP') {
            $errors['currency'][] = 'Only PHP Purchase Orders can be submitted to Financial.';
        }
        if (! $order->supplier || ! filled($order->supplier->name)) {
            $errors['supplier'][] = 'The Purchase Order must reference a registered supplier with a name.';
        }
        if ($order->items->isEmpty()) {
            $errors['items'][] = 'The Purchase Order must contain at least one item.';
        }

        $lineTotalCents = 0;
        foreach ($order->items as $item) {
            if ((int) $item->ordered_quantity <= 0) {
                $errors['items'][] = "{$item->product_name} must have a positive quantity.";
            }
            if (! in_array($item->unit, self::VALID_UNITS, true)) {
                $errors['items'][] = "{$item->product_name} must use one of the Financial units: PCS, SACK, DRUM, KG, or L.";
            }
            if (! $item->product_id) {
                $errors['items'][] = "{$item->product_name} must have a product reference.";
            }
            $unitPriceCents = $this->moneyCents((string) $item->unit_price, 'unit price');
            $storedLineTotalCents = $this->moneyCents((string) $item->total_price, 'line total');
            if ($unitPriceCents <= 0) {
                $errors['items'][] = "{$item->product_name} must have a positive unit price.";
            }
            if ($storedLineTotalCents !== ((int) $item->ordered_quantity * $unitPriceCents)) {
                $errors['items'][] = "{$item->product_name} line total does not match quantity multiplied by unit price.";
            }
            $lineTotalCents += $storedLineTotalCents;
        }

        $orderTotalCents = $this->moneyCents((string) $order->total_amount, 'order total');
        if ($lineTotalCents !== $orderTotalCents) {
            $errors['total_amount'][] = 'The Purchase Order total does not match its line totals.';
        }
        if ($orderTotalCents <= 0) {
            $errors['total_amount'][] = 'The Purchase Order total must be greater than zero for Financial submission.';
        }
        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        return [
            'schema_version' => '1.0',
            'source_system' => 'SMARTCHAIN',
            'message_id' => $messageId,
            'external_reference_id' => $order->po_number,
            'category_type' => 'INVENTORY_PURCHASE',
            'currency' => 'PHP',
            'total_amount' => $this->money($orderTotalCents),
            'supplier' => array_filter([
                'supplier_code' => filled($order->supplier->supplier_code) ? $order->supplier->supplier_code : null,
                'name' => $order->supplier->name,
            ], fn ($value) => $value !== null),
            'items' => $order->items->map(fn ($item) => [
                'source_po_line_id' => (string) $item->id,
                'product_id' => (string) $item->product_id,
                'product_name' => $item->product_name,
                'quantity' => (string) (int) $item->ordered_quantity,
                'unit' => $item->unit,
                'unit_price' => $this->money($this->moneyCents((string) $item->unit_price, 'unit price')),
                'line_total' => $this->money($this->moneyCents((string) $item->total_price, 'line total')),
            ])->values()->all(),
        ];
    }

    private function moneyCents(string $value, string $field): int
    {
        if (! preg_match('/^\d+(?:\.\d{1,2})?$/', $value)) {
            throw ValidationException::withMessages(['amount' => ["The {$field} is not a valid fixed-decimal amount."]]);
        }
        [$whole, $decimal] = array_pad(explode('.', $value, 2), 2, '');

        return ((int) $whole * 100) + (int) str_pad($decimal, 2, '0');
    }

    private function money(int $cents): string
    {
        return intdiv($cents, 100).'.'.str_pad((string) ($cents % 100), 2, '0', STR_PAD_LEFT);
    }
}
