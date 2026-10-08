<?php

namespace App\Support;

use App\Models\PurchaseOrder;
use App\Models\ReplenishmentRequest;
use Illuminate\Support\Facades\DB;

final class ReplenishmentLifecycle
{
    public function statusForPurchaseOrder(PurchaseOrder $purchaseOrder): string
    {
        return match ($purchaseOrder->status) {
            PurchaseOrder::STATUS_COMPLETED,
            PurchaseOrder::STATUS_CLOSED_WITH_SHORTAGE => ReplenishmentRequest::STATUS_COMPLETED,
            PurchaseOrder::STATUS_CANCELLED => ReplenishmentRequest::STATUS_CANCELLED,
            default => ReplenishmentRequest::STATUS_PO_CREATED,
        };
    }

    public function synchronize(PurchaseOrder $purchaseOrder): ?ReplenishmentRequest
    {
        if (! $purchaseOrder->replenishment_request_id) {
            return null;
        }

        $targetStatus = $this->statusForPurchaseOrder($purchaseOrder);
        $changed = false;

        $replenishmentRequest = DB::transaction(function () use ($purchaseOrder, $targetStatus, &$changed) {
            $request = ReplenishmentRequest::query()
                ->lockForUpdate()
                ->find($purchaseOrder->replenishment_request_id);

            if (! $request || $request->status === $targetStatus) {
                return $request;
            }

            $request->update(['status' => $targetStatus]);
            $changed = true;

            return $request;
        });

        if ($replenishmentRequest && $changed) {
            AuditLogger::success(
                $targetStatus === ReplenishmentRequest::STATUS_COMPLETED
                    ? 'REPLENISHMENT_REQUEST_COMPLETED'
                    : ($targetStatus === ReplenishmentRequest::STATUS_CANCELLED
                        ? 'REPLENISHMENT_REQUEST_CANCELLED'
                        : 'REPLENISHMENT_PURCHASE_ORDER_CREATED'),
                AuditLogger::MODULE_PROCUREMENT,
                [
                    'resource' => $replenishmentRequest,
                    'resource_label' => $replenishmentRequest->request_no,
                    'details' => "Synchronized from linked Purchase Order {$purchaseOrder->po_number} ({$purchaseOrder->status}).",
                    'metadata' => [
                        'purchase_order_id' => $purchaseOrder->id,
                        'purchase_order_status' => $purchaseOrder->status,
                        'request_status' => $targetStatus,
                    ],
                ],
            );
        }

        return $replenishmentRequest;
    }
}
