<?php

namespace App\Services\Financial;

use App\Models\{ExcessDeliveryReview, PurchaseOrder, Receiving, ReceivingDiscrepancy, SupplierRejectionCase};
use App\Support\{PurchaseOrderSupplier, SupplierRejectionWorkflow, WarehouseCapacity};
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Validator;

/** Internal preparation only. This schema is NOT Financial's approved request contract. */
class FinancialCaseEventPayloadBuilder
{
    public function build(ExcessDeliveryReview|SupplierRejectionCase|ReceivingDiscrepancy $case): array
    {
        $errors = [];
        if ($case instanceof ExcessDeliveryReview) {
            $case->loadMissing(['receiving.receiptAttachments', 'purchaseOrder.items', 'items.purchaseOrderItem', 'items.receivingItem', 'items.authorizedReceivingItem', 'documents']);
            $receiving = $case->receiving;
            $order = $case->purchaseOrder;
            $type = 'EXCESS_DELIVERY';
            $reference = $case->reference;
            $occurredAt = $case->created_at;
            $details = $this->excess($case, $errors);
        } elseif ($case instanceof SupplierRejectionCase) {
            $case->loadMissing(['inspectionItem.inspection.receiving.receiptAttachments', 'inspectionItem.inspection.receiving.purchaseOrder.items', 'inspectionItem.inspection.attachments', 'inspectionItem.receivingItem.purchaseOrderItem']);
            $receiving = $case->inspectionItem?->inspection?->receiving;
            $order = $receiving?->purchaseOrder;
            $type = 'QA_REJECTED_ITEMS';
            $reference = SupplierRejectionWorkflow::reference($case);
            $occurredAt = $case->inspectionItem?->inspection?->completed_at;
            $details = $this->rejection($case, $errors);
        } else {
            $case->loadMissing(['receiving.receiptAttachments', 'receiving.items.purchaseOrderItem', 'purchaseOrder.items']);
            $receiving = $case->receiving;
            $order = $case->purchaseOrder;
            $type = 'DELIVERY_DISCREPANCY';
            // The source has no dedicated human reference; use its real primary key.
            $reference = 'receiving_discrepancies:'.$case->id;
            $occurredAt = $case->reported_at;
            $details = $this->discrepancy($case, $errors);
        }

        if (! $order || ! $receiving || $receiving->purchase_order_id !== $order->id) {
            $errors['purchase_order'][] = 'An authoritative matching Purchase Order and Receiving are required.';
        }
        $supplier = $order ? app(PurchaseOrderSupplier::class)->resolve($order) : null;
        if (! $supplier || ! filled($supplier->name)) $errors['supplier'][] = 'The original PO supplier must resolve unambiguously to a registered supplier.';
        if (($case instanceof ExcessDeliveryReview || $case instanceof ReceivingDiscrepancy)
            && $case->supplier_id !== null && $case->supplier_id !== $supplier?->id) {
            $errors['supplier'][] = 'Case supplier does not match the original PO supplier.';
        }

        $financial = $order?->financialSubmission;
        $payload = [
            'schema_version' => '1.0',
            'source_system' => 'SMARTCHAIN',
            'event_type' => $type,
            'event_id' => 'smartchain:financial:'.$type.':'.$case->id.':v1',
            'external_reference_id' => $reference,
            'purchase_order_reference' => $order?->po_number,
            'financial_reference' => $financial?->state === 'ACKNOWLEDGED' ? $financial->financial_reference : null,
            'supplier' => ['supplier_id' => $supplier?->id, 'supplier_code' => $supplier?->supplier_code, 'name' => $supplier?->name],
            'receiving_reference' => $receiving?->receiving_no,
            'occurred_at' => $occurredAt?->toIso8601String(),
            'details' => $details,
            'evidence' => $this->evidence($case, $receiving),
        ];
        $validation = Validator::make($payload, [
            'schema_version' => ['required', 'in:1.0'], 'source_system' => ['required', 'in:SMARTCHAIN'],
            'event_type' => ['required', 'in:EXCESS_DELIVERY,QA_REJECTED_ITEMS,DELIVERY_DISCREPANCY'],
            'event_id' => ['required', 'string', 'max:150'], 'external_reference_id' => ['required', 'string', 'max:150'],
            'purchase_order_reference' => ['required', 'string'], 'financial_reference' => ['nullable', 'string'],
            'supplier.supplier_id' => ['required', 'integer', 'min:1'], 'supplier.name' => ['required', 'string'],
            'receiving_reference' => ['required', 'string'], 'occurred_at' => ['required', 'date'],
            'details' => ['required', 'array'], 'evidence' => ['required', 'array', 'min:1'],
            'evidence.*.reference' => ['required', 'string'], 'evidence.*.type' => ['required', 'string'],
            'evidence.*.label' => ['required', 'string'], 'evidence.*.source_reference' => ['required', 'string'],
        ]);
        foreach ($validation->errors()->messages() as $field => $messages) $errors[$field] = array_merge($errors[$field] ?? [], $messages);

        return [
            'source_ready' => $errors === [], 'validation_errors' => $errors,
            'payload' => $payload,
            // A preview hash detects changing source data; it is NOT a durable submission snapshot.
            'payload_sha256' => hash('sha256', json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)),
        ];
    }

    private function excess(ExcessDeliveryReview $case, array &$errors): array
    {
        if ($case->status !== ExcessDeliveryReview::STATUS_FINANCIAL_HOLD || ! $case->reviewed_at || ! $case->reviewed_by_id) {
            $errors['case_readiness'][] = 'Admin must place this case on Financial review hold before handoff.';
        }
        if (! filled($case->review_notes)) $errors['review_reason'][] = 'An Admin Financial review reason is required.';
        if ($case->items->isEmpty()) $errors['items'][] = 'Excess lines are required.';
        $lines = $case->items->sortBy('id')->map(function ($item) use ($case, &$errors) {
            $poLine = $item->purchaseOrderItem;
            $receiptLine = $item->receivingItem ?? $item->authorizedReceivingItem;
            if (! $poLine || $poLine->purchase_order_id !== $case->purchase_order_id
                || ! $receiptLine || $receiptLine->receiving_id !== $case->receiving_id
                || $poLine->product_id !== $item->product_id || $receiptLine->product_id !== $item->product_id
                || $receiptLine->purchase_order_item_id !== $poLine->id) {
                $errors['items'][] = 'Excess line must match its original PO line, Receiving and product.';
            }
            $unit = $this->unit($item->unit, $errors);
            if ($poLine && $this->unit($poLine->unit, $errors) !== $unit) $errors['unit'][] = 'Excess and PO units must match without conversion.';
            if ($receiptLine && $this->unit($receiptLine->unit, $errors) !== $unit) $errors['unit'][] = 'Excess and Receiving units must match without conversion.';
            if (! $item->product_id || ! filled($receiptLine?->product_name) || ! $poLine || $poLine->ordered_quantity <= 0) {
                $errors['product'][] = 'A named product and positive original PO quantity are required.';
            }
            if ($item->po_remaining_quantity < 0 || $item->actual_delivered_quantity < 0 || $item->authorized_quantity < 0 || $item->excess_quantity < 0
                || ($poLine && $item->po_remaining_quantity > $poLine->ordered_quantity)
                || $item->authorized_quantity !== min($item->po_remaining_quantity, $item->actual_delivered_quantity)
                || $item->excess_quantity !== max(0, $item->actual_delivered_quantity - $item->po_remaining_quantity)) {
                $errors['quantities'][] = 'Excess quantities do not reconcile with the recorded PO balance and physical delivery.';
            }
            foreach (['receivingItem' => $item->excess_quantity, 'authorizedReceivingItem' => $item->authorized_quantity] as $relation => $quantity) {
                $physicalLine = $item->{$relation};
                if ($quantity > 0 && (! $physicalLine || $physicalLine->delivered_quantity !== $quantity
                    || $physicalLine->receiving_id !== $case->receiving_id || $physicalLine->purchase_order_item_id !== $poLine?->id
                    || $physicalLine->product_id !== $item->product_id || $this->unit($physicalLine->unit, $errors) !== $unit)) {
                    $errors['physical_lines'][] = 'The authorized and held physical Receiving portions must match the recorded excess snapshot.';
                }
            }
            $price = $poLine?->unit_price;
            if ($price !== null && ! preg_match('/^\d+\.\d{2}$/', $price)) $errors['unit_price'][] = 'Historical unit price must remain an exact fixed-decimal string.';
            return [
                'source_line_id' => $item->id, 'purchase_order_line_id' => $poLine?->id,
                'product_id' => $item->product_id, 'product_name' => $receiptLine?->product_name,
                'unit' => $unit, 'original_ordered_quantity' => $poLine?->ordered_quantity,
                'po_remaining_quantity_at_receipt' => $item->po_remaining_quantity,
                'actual_delivered_quantity' => $item->actual_delivered_quantity, 'authorized_quantity' => $item->authorized_quantity,
                'confirmed_excess_quantity' => $item->excess_quantity, 'qa_status' => $receiptLine?->inspection_status,
                'historical_po_unit_price' => $price, 'agreement_reference' => $poLine?->agreement_reference,
            ];
        })->values()->all();
        if (! $case->items->contains(fn ($item) => $item->excess_quantity > 0)) $errors['quantities'][] = 'At least one positive excess quantity is required.';
        return ['case_status' => $case->status, 'review_reason' => $case->review_notes,
            'cost_resolution' => $case->cost_resolution, 'financial_reconciliation_status' => $case->financial_reconciliation_status,
            'supplier_confirmation_reference' => $case->supplier_confirmation_reference,
            'reviewed_at' => $case->reviewed_at?->toIso8601String(), 'currency' => $case->purchaseOrder?->currency,
            'lines' => $lines];
    }

    private function rejection(SupplierRejectionCase $case, array &$errors): array
    {
        $item = $case->inspectionItem;
        $inspection = $item?->inspection;
        $line = $item?->receivingItem;
        if (! $inspection?->completed_at || ! $line || $line->receiving_id !== $inspection->receiving_id
            || ! in_array($item?->inspection_result, ['Partial', 'Rejected'], true)) {
            $errors['inspection'][] = 'The rejected line must belong to a completed QA inspection of this Receiving.';
        }
        if (! $item || $item->rejected_quantity <= 0 || $item->accepted_quantity < 0
            || $item->accepted_quantity + $item->rejected_quantity !== $line?->delivered_quantity) {
            $errors['quantities'][] = 'Positive rejected quantity must reconcile with the inspected physical delivery.';
        }
        if (! filled($item?->remarks)) $errors['rejection_reason'][] = 'A recorded QA rejection reason is required.';
        if ($case->status === 'RESOLVED') $errors['case_readiness'][] = 'This rejection case is already resolved; review its history instead of submitting a new notice.';
        if (! $line?->product_id) $errors['product'][] = 'An authoritative product reference is required.';
        $poLine = $line?->purchaseOrderItem;
        if ($poLine && ($poLine->purchase_order_id !== $inspection?->receiving?->purchase_order_id || $poLine->product_id !== $line?->product_id)) {
            $errors['purchase_order_line'][] = 'The rejected line does not match its original PO product.';
        }
        $unit = $this->unit($line?->unit, $errors);
        if ($poLine && $this->unit($poLine->unit, $errors) !== $unit) $errors['unit'][] = 'Rejected item and PO units must match without conversion.';
        return ['case_status' => $case->status, 'resolution_request' => $case->resolution_type,
            'resolution_notes' => $case->resolution_notes, 'qa_inspection_id' => $inspection?->id,
            'qa_cycle_number' => $inspection?->cycle_number, 'inspection_result' => $item?->inspection_result,
            'rejection_date' => $inspection?->completed_at?->toIso8601String(), 'rejection_reason' => $item?->remarks,
            'product_id' => $line?->product_id, 'product_name' => $line?->product_name,
            'purchase_order_line_id' => $line?->purchase_order_item_id,
            'delivered_quantity' => $line?->delivered_quantity, 'rejected_quantity' => $item?->rejected_quantity,
            'unit' => $unit,
            // Supplier email state is factual context, never Financial transmission state.
            'supplier_notification' => ['state' => $case->status, 'sent_at' => $case->sent_at?->toIso8601String()]];
    }

    private function discrepancy(ReceivingDiscrepancy $case, array &$errors): array
    {
        // Existing aggregates describe an outstanding PO balance, not a confirmed shipment shortage.
        $errors['shipment_confirmation'][] = 'Missing authoritative shipment plan / current-delivery expected quantity and confirmation distinguishing planned partial shipment from genuine short delivery.';
        $errors['line_allocation'][] = 'The discrepancy stores aggregate quantities without product/unit shortage allocation. Confirm per-line shortage quantities before Financial handoff.';
        if ($case->discrepancy_type !== ReceivingDiscrepancy::TYPE_SHORT_DELIVERY || $case->short_quantity <= 0
            || $case->expected_quantity < 0 || $case->delivered_quantity < 0
            || $case->expected_quantity - $case->delivered_quantity !== $case->short_quantity) {
            $errors['quantities'][] = 'Recorded discrepancy balance quantities do not reconcile.';
        }
        return ['case_status' => $case->status, 'discrepancy_type' => $case->discrepancy_type,
            'supplier_response_code' => $case->supplier_response_code, 'response_notes' => $case->response_notes,
            'resolution_notes' => $case->resolution_notes,
            'recorded_aggregate' => ['po_balance_expected' => $case->expected_quantity, 'delivered' => $case->delivered_quantity,
                'short_balance' => $case->short_quantity, 'unit' => null],
            'expected_current_delivery_quantity' => null, 'shipment_classification' => null,
            'receiving_lines' => ($case->receiving?->items ?? collect())->map(fn ($line) => [
                'receiving_line_id' => $line->id, 'purchase_order_line_id' => $line->purchase_order_item_id,
                'product_id' => $line->product_id, 'product_name' => $line->product_name,
                'original_ordered_quantity' => $line->purchaseOrderItem?->ordered_quantity,
                'actual_received_line_quantity' => $line->delivered_quantity,
                'unit' => $this->unit($line->unit, $errors),
                'previously_received_quantity' => null, 'confirmed_short_quantity' => null,
            ])->values()->all()];
    }

    private function unit(?string $value, array &$errors): ?string
    {
        $unit = $value === null ? null : WarehouseCapacity::normalizeUnit($value);
        if (! in_array($unit, ['PCS', 'SACK', 'DRUM', 'KG', 'L'], true)) $errors['unit'][] = 'A supported canonical source unit is required; historical quantities are not converted.';
        return $unit;
    }

    private function evidence(Model $case, ?Receiving $receiving): array
    {
        $files = [];
        foreach ($receiving?->receiptAttachments ?? [] as $file) {
            $files[] = ['reference' => 'receiving_receipt_attachments:'.$file->id, 'type' => 'RECEIVING_RECEIPT',
                'label' => basename($file->original_name), 'mime_type' => $file->mime_type, 'source_reference' => $receiving->receiving_no];
        }
        if ($case instanceof ExcessDeliveryReview) {
            foreach ($case->documents as $file) {
                $files[] = ['reference' => $file->internal_reference, 'type' => $file->document_type,
                    'label' => basename($file->original_name), 'mime_type' => $file->mime_type, 'source_reference' => $case->reference];
            }
        }
        if ($case instanceof SupplierRejectionCase) {
            foreach ($case->inspectionItem?->inspection?->attachments ?? [] as $file) {
                $files[] = ['reference' => 'qa_inspection_attachments:'.$file->id, 'type' => 'QA_EVIDENCE',
                    'label' => basename($file->original_name), 'mime_type' => $file->mime_type,
                    'source_reference' => 'qa_inspections:'.$file->qa_inspection_id];
            }
        }
        return $files;
    }
}
