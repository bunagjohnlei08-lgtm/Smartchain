<?php

namespace App\Support;

use App\Models\PurchaseOrder;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\ReplenishmentRequest;
use App\Models\SupplierRejectionCase;
use Illuminate\Support\Collection;

/**
 * Read-only presentation of where a replenishment cycle currently is,
 * derived from its linked PO, Receiving, QA and rejected-item records.
 * It never writes; the request status remains the lifecycle source of truth.
 */
final class ReplenishmentFulfillmentStage
{
    public const DRAFT = 'draft';
    public const PENDING_ADMIN_APPROVAL = 'pending_admin_approval';
    public const FOR_PURCHASE_ORDER = 'for_purchase_order';
    public const PO_CREATED = 'po_created';
    public const SENT_TO_SUPPLIER = 'sent_to_supplier';
    public const RECEIVING = 'receiving';
    public const PARTIALLY_RECEIVED = 'partially_received';
    public const PENDING_QA = 'pending_qa';
    public const QA_REJECTED = 'qa_rejected';
    public const AWAITING_SUPPLIER_REPLACEMENT = 'awaiting_supplier_replacement';
    public const REPLACEMENT_RECEIVING = 'replacement_receiving';
    public const READY_FOR_STOCK_IN = 'ready_for_stock_in';
    public const COMPLETED = 'completed';
    public const REJECTED = 'rejected';
    public const CANCELLED = 'cancelled';

    public const LABELS = [
        self::DRAFT => 'Draft',
        self::PENDING_ADMIN_APPROVAL => 'Pending Admin Approval',
        self::FOR_PURCHASE_ORDER => 'For Purchase Order',
        self::PO_CREATED => 'PO Created',
        self::SENT_TO_SUPPLIER => 'Sent to Supplier',
        self::RECEIVING => 'Receiving',
        self::PARTIALLY_RECEIVED => 'Partially Received',
        self::PENDING_QA => 'Pending QA',
        self::QA_REJECTED => 'QA Rejected – Supplier Resolution',
        self::AWAITING_SUPPLIER_REPLACEMENT => 'Awaiting Supplier Replacement',
        self::REPLACEMENT_RECEIVING => 'Replacement Receiving',
        self::READY_FOR_STOCK_IN => 'Ready for Stock In',
        self::COMPLETED => 'Completed',
        self::REJECTED => 'Rejected',
        self::CANCELLED => 'Cancelled',
    ];

    /** Relations to eager-load on ReplenishmentRequest queries before calling resolve(). */
    public const RELATIONS = [
        'purchaseOrder:id,replenishment_request_id,po_number,status',
        'purchaseOrder.receivings:id,purchase_order_id,receiving_no,status,replacement_for_rejection_case_id,created_at',
        'purchaseOrder.receivings.items:id,receiving_id,stocked_in_at',
        'purchaseOrder.receivings.items.qaInspectionItem:id,receiving_item_id,accepted_quantity,rejected_quantity',
        'purchaseOrder.receivings.items.qaInspectionItem.supplierRejectionCase:id,qa_inspection_item_id,status',
    ];

    private const QA_IN_PROGRESS = ['Pending QA', 'In Progress'];
    private const QA_DONE_WITH_ACCEPTED = ['Passed', 'Partial'];
    private const CASE_AWAITING_RESOLUTION = ['PENDING_REVIEW', 'SENDING', 'SENT', 'FAILED'];
    private const CASE_REPLACEMENT_PENDING = 'REPLACEMENT_PENDING';

    /**
     * @return array{key: string, label: string, details: array<string, mixed>, timeline: list<array{key: string, label: string, state: string}>}
     */
    public static function resolve(ReplenishmentRequest $request): array
    {
        $purchaseOrder = $request->purchaseOrder;
        $receivings = $purchaseOrder?->receivings ?? collect();
        $cases = self::rejectionCases($receivings);
        $key = self::stageKey($request, $purchaseOrder, $receivings, $cases);

        return [
            'key' => $key,
            'label' => self::LABELS[$key],
            'details' => self::details($purchaseOrder, $receivings, $cases),
            'timeline' => self::timeline($key, $request, $cases->isNotEmpty()),
        ];
    }

    private static function stageKey(ReplenishmentRequest $request, ?PurchaseOrder $purchaseOrder, Collection $receivings, Collection $cases): string
    {
        $status = $request->lifecycleStatus();
        if (! $purchaseOrder) {
            return match ($status) {
                ReplenishmentRequest::STATUS_DRAFT => self::DRAFT,
                ReplenishmentRequest::STATUS_PENDING => self::PENDING_ADMIN_APPROVAL,
                ReplenishmentRequest::STATUS_REJECTED => self::REJECTED,
                ReplenishmentRequest::STATUS_CANCELLED => self::CANCELLED,
                ReplenishmentRequest::STATUS_COMPLETED => self::COMPLETED,
                default => self::FOR_PURCHASE_ORDER,
            };
        }
        if ($purchaseOrder->status === PurchaseOrder::STATUS_CANCELLED || $status === ReplenishmentRequest::STATUS_CANCELLED) {
            return self::CANCELLED;
        }

        // Later operational states take precedence over earlier ones.
        $replacements = $receivings->whereNotNull('replacement_for_rejection_case_id');
        if ($cases->contains(fn (SupplierRejectionCase $case) => $case->status === self::CASE_REPLACEMENT_PENDING
            && $replacements->contains(fn (Receiving $receiving) => $receiving->replacement_for_rejection_case_id === $case->id
                && $receiving->status === Receiving::STATUS_AWAITING_REPLACEMENT))) {
            return self::AWAITING_SUPPLIER_REPLACEMENT;
        }
        if ($cases->contains(fn (SupplierRejectionCase $case) => in_array($case->status, self::CASE_AWAITING_RESOLUTION, true))) {
            return self::QA_REJECTED;
        }
        if ($replacements->contains(fn (Receiving $receiving) => in_array($receiving->status, self::QA_IN_PROGRESS, true))) {
            return self::REPLACEMENT_RECEIVING;
        }
        if ($receivings->contains(fn (Receiving $receiving) => in_array($receiving->status, self::QA_IN_PROGRESS, true))) {
            return self::PENDING_QA;
        }
        if ($receivings->contains(fn (Receiving $receiving) => self::hasAcceptedStockAwaitingStockIn($receiving))) {
            return self::READY_FOR_STOCK_IN;
        }
        if ($purchaseOrder->status === PurchaseOrder::STATUS_PARTIALLY_RECEIVED) {
            return self::PARTIALLY_RECEIVED;
        }
        if ($receivings->isNotEmpty()) {
            return in_array($purchaseOrder->status, PurchaseOrder::TERMINAL_STATUSES, true) ? self::COMPLETED : self::RECEIVING;
        }

        return $purchaseOrder->status === PurchaseOrder::STATUS_SENT_TO_SUPPLIER ? self::SENT_TO_SUPPLIER : self::PO_CREATED;
    }

    private static function hasAcceptedStockAwaitingStockIn(Receiving $receiving): bool
    {
        return in_array($receiving->status, self::QA_DONE_WITH_ACCEPTED, true)
            && $receiving->items->contains(fn (ReceivingItem $item) => $item->stocked_in_at === null
                && (int) ($item->qaInspectionItem?->accepted_quantity ?? 0) > 0);
    }

    private static function rejectionCases(Collection $receivings): Collection
    {
        return $receivings->flatMap(fn (Receiving $receiving) => $receiving->items)
            ->map(fn (ReceivingItem $item) => $item->qaInspectionItem?->supplierRejectionCase)
            ->filter()->values();
    }

    private static function details(?PurchaseOrder $purchaseOrder, Collection $receivings, Collection $cases): array
    {
        $original = $receivings->whereNull('replacement_for_rejection_case_id')->sortBy('id')->last();
        $replacement = $receivings->whereNotNull('replacement_for_rejection_case_id')->sortBy('id')->last();
        $qaStatus = $original && ! in_array($original->status, [...self::QA_IN_PROGRESS, Receiving::STATUS_AWAITING_REPLACEMENT], true)
            ? $original->status : ($original ? 'Pending' : null);
        $latestCase = $cases->sortBy('id')->last();

        return [
            'purchase_order' => $purchaseOrder ? ['number' => $purchaseOrder->po_number, 'status' => $purchaseOrder->status] : null,
            'receiving' => $original ? ['number' => $original->receiving_no, 'status' => $original->status] : null,
            'qa_status' => $qaStatus,
            'replacement' => $latestCase ? [
                'case_status' => $latestCase->status,
                'receiving_number' => $replacement?->receiving_no,
                'receiving_status' => $replacement?->status,
            ] : null,
        ];
    }

    /** @return list<array{key: string, label: string, state: string}> */
    private static function timeline(string $key, ReplenishmentRequest $request, bool $hasRejection): array
    {
        if (in_array($key, [self::REJECTED, self::CANCELLED], true) || $key === self::DRAFT) {
            $submitted = $request->submitted_at !== null;
            $steps = [['forwarded', 'Forwarded to Admin', $key === self::DRAFT ? 'current' : ($submitted ? 'done' : 'upcoming')]];
            if ($key === self::REJECTED) {
                $steps[] = ['rejected', 'Rejected by Admin', 'failed'];
            } elseif ($key === self::CANCELLED) {
                $steps[] = ['cancelled', 'Cancelled', 'failed'];
            }

            return self::format($steps);
        }

        $common = [
            ['forwarded', 'Forwarded to Admin'],
            ['approved', 'Admin Approved'],
            ['po_created', 'Purchase Order Created'],
            ['delivery_received', $key === self::PARTIALLY_RECEIVED ? 'Partially Received' : 'Delivery Received'],
        ];
        if ($hasRejection) {
            $flow = [...$common,
                ['qa_rejected', 'QA Rejected'],
                ['supplier_replacement', $key === self::QA_REJECTED ? 'Supplier Resolution' : 'Awaiting Supplier Replacement'],
                ['replacement_receiving', 'Replacement Receiving'],
                ['qa_reinspection', 'QA Reinspection'],
                ['ready_for_stock_in', 'Ready for Stock In'],
                ['completed', 'Completed'],
            ];
            $current = [
                self::QA_REJECTED => 5, self::AWAITING_SUPPLIER_REPLACEMENT => 5,
                self::REPLACEMENT_RECEIVING => 7, self::PENDING_QA => 7,
                self::READY_FOR_STOCK_IN => 8, self::RECEIVING => 8, self::PARTIALLY_RECEIVED => 8,
                self::COMPLETED => 10,
            ][$key] ?? 5;
        } else {
            $flow = [...$common,
                ['pending_qa', 'Pending QA'],
                ['ready_for_stock_in', 'Ready for Stock In'],
                ['completed', 'Completed'],
            ];
            $current = [
                self::PENDING_ADMIN_APPROVAL => 1, self::FOR_PURCHASE_ORDER => 2,
                self::PO_CREATED => 3, self::SENT_TO_SUPPLIER => 3, self::PARTIALLY_RECEIVED => 3,
                self::RECEIVING => 4, self::PENDING_QA => 4, self::READY_FOR_STOCK_IN => 5,
                self::COMPLETED => 7,
            ][$key] ?? 0;
        }

        $steps = [];
        foreach ($flow as $index => [$stepKey, $label]) {
            $state = $index < $current ? 'done' : ($index === $current ? 'current' : 'upcoming');
            if ($stepKey === 'qa_rejected' && $index < $current) {
                $state = 'failed';
            }
            $steps[] = [$stepKey, $label, $state];
        }

        return self::format($steps);
    }

    private static function format(array $steps): array
    {
        return array_map(fn (array $step) => ['key' => $step[0], 'label' => $step[1], 'state' => $step[2]], $steps);
    }
}
