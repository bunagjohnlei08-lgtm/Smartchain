<?php

namespace App\Support;

use App\Models\QaInspection;
use App\Models\QaInspectionItem;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\ReceivingTimeline;
use App\Models\Role;
use App\Models\SupplierRejectionCase;
use App\Models\User;
use App\Notifications\WorkflowNotification;
use Illuminate\Support\Facades\DB;

class SupplierRejectionWorkflow
{
    public const SEND_FIRST_MESSAGE = 'Send the rejection report to the supplier before resolving this case.';

    public function syncInspection(QaInspection $inspection, bool $notifyAdmins = false): int
    {
        if (! $inspection->completed_at) return 0;
        $inspection->loadMissing('receiving:id,receiving_no');

        $created = 0;
        $inspection->items()->where('rejected_quantity', '>', 0)->each(function (QaInspectionItem $item) use (&$created) {
            $case = SupplierRejectionCase::firstOrCreate(['qa_inspection_item_id' => $item->id]);
            $created += $case->wasRecentlyCreated ? 1 : 0;
        });

        if ($notifyAdmins && $created > 0) {
            $admins = Role::query()->where('slug', 'ADMIN')->first()?->users()->where('status', 'ACTIVE')->get() ?? collect();
            WorkflowNotificationSender::send($admins, new WorkflowNotification(
                'Rejected Items Need Review',
                "New rejected QA ".($created === 1 ? 'item' : 'items')." requires review: {$inspection->receiving->receiving_no}",
                'warning',
                $inspection->receiving->receiving_no,
                'Rejected Items',
            ));
        }

        return $created;
    }

    public function syncCompleted(): void
    {
        QaInspection::query()
            ->whereNotNull('completed_at')
            ->whereHas('items', fn ($query) => $query->where('rejected_quantity', '>', 0)->whereDoesntHave('supplierRejectionCase'))
            ->with('items')
            ->each(fn (QaInspection $inspection) => $this->syncInspection($inspection));
    }

    /**
     * Why a disposition cannot be chosen yet, or null when it can. A case in
     * REPLACEMENT_PENDING may only be closed once the replacement has been inspected.
     */
    public function resolutionBlockReason(SupplierRejectionCase $case, string $type): ?string
    {
        if ($case->status === 'RESOLVED') return 'This case is already resolved.';
        if ($case->status === 'REPLACEMENT_PENDING') {
            if ($type === 'REPLACEMENT') return null; // idempotent retry returns the existing replacement
            $replacement = $case->relationLoaded('replacementReceiving')
                ? $case->replacementReceiving?->loadMissing('qaInspection')
                : $case->replacementReceiving()->with('qaInspection')->first();
            return $replacement?->qaInspection?->completed_at
                ? null
                : 'The replacement delivery is still in progress in Receiving. Close the case after its QA inspection is completed.';
        }
        if (! $case->sent_at) return self::SEND_FIRST_MESSAGE;
        if ($case->status === 'SENDING') return 'The rejection report is still being sent.';

        return null;
    }

    /**
     * Create (once) the expected replacement delivery for the rejected quantity.
     * No inventory, QA, or Stock In state is touched here.
     *
     * @return array{0: Receiving, 1: bool} the replacement and whether it was created now
     */
    public function routeToReceiving(SupplierRejectionCase $case, User $admin, ?string $notes): array
    {
        [$receiving, $created, $original] = DB::transaction(function () use ($case, $admin, $notes) {
            $locked = SupplierRejectionCase::query()->lockForUpdate()->findOrFail($case->id);
            $existing = $locked->replacementReceiving()->first();
            if ($existing) return [$existing, false, null];
            abort_if(($reason = $this->resolutionBlockReason($locked, 'REPLACEMENT')) !== null, 422, $reason);

            $locked->load('inspectionItem.receivingItem', 'inspectionItem.inspection.receiving.purchaseOrder');
            $item = $locked->inspectionItem;
            $original = $item->inspection->receiving;
            $po = $original->purchaseOrder;
            abort_unless($po !== null, 422, 'The QA inspection is not linked to its original Purchase Order.');
            abort_unless($item->rejected_quantity > 0, 422, 'This case has no rejected quantity to replace.');

            $replacement = Receiving::create([
                'receiving_no' => Receiving::nextReceivingNo(),
                'purchase_order_id' => $po->id,
                'replacement_for_rejection_case_id' => $locked->id,
                'purchase_order' => $po->po_number,
                'supplier' => $po->supplier_name,
                'delivery_date' => now()->toDateString(),
                'status' => Receiving::STATUS_AWAITING_REPLACEMENT,
                'prepared_by_id' => $original->prepared_by_id,
            ]);
            ReceivingItem::create([
                'receiving_id' => $replacement->id,
                'product_id' => $item->receivingItem->product_id,
                'warehouse_id' => $item->receivingItem->warehouse_id,
                'product_name' => $item->receivingItem->product_name,
                'ordered_quantity' => $item->rejected_quantity,
                'delivered_quantity' => 0,
                'unit' => $item->receivingItem->unit,
                'inspection_status' => Receiving::STATUS_AWAITING_REPLACEMENT,
            ]);
            ReceivingTimeline::create([
                'receiving_id' => $replacement->id, 'status' => 'Replacement Requested',
                'performed_by' => $admin->name, 'occurred_at' => now(),
            ]);

            $locked->update([
                'status' => 'REPLACEMENT_PENDING', 'resolution_type' => 'REPLACEMENT',
                'resolution_notes' => $notes ?: $locked->resolution_notes,
                'routed_to_receiving_at' => now(), 'routed_by_id' => $admin->id,
            ]);

            $metadata = [
                'rejection_case_id' => $locked->id, 'original_receiving_id' => $original->id,
                'replacement_receiving_id' => $replacement->id, 'purchase_order_id' => $po->id,
                'product_id' => $item->receivingItem->product_id, 'quantity' => $item->rejected_quantity,
                'admin_user_id' => $admin->id, 'assigned_plant_manager_id' => $original->prepared_by_id,
            ];
            AuditLogger::success('REJECTED_ITEM_ROUTED_TO_RECEIVING', AuditLogger::MODULE_REJECTED_ITEMS, [
                'resource' => $locked, 'resource_label' => self::reference($locked),
                'details' => "Routed rejected quantity to replacement receiving {$replacement->receiving_no}",
                'metadata' => $metadata,
            ]);
            AuditLogger::success('REPLACEMENT_RECEIVING_CREATED', AuditLogger::MODULE_RECEIVING, [
                'resource' => $replacement, 'resource_label' => $replacement->receiving_no,
                'details' => "Replacement receiving created for {$original->receiving_no}",
                'metadata' => $metadata,
            ]);

            return [$replacement, true, $original];
        });

        if ($created) $this->notifyPlantManagers($receiving, $original);

        return [$receiving, $created];
    }

    public function close(SupplierRejectionCase $case, User $admin, string $notes): SupplierRejectionCase
    {
        return DB::transaction(function () use ($case, $admin, $notes) {
            $locked = SupplierRejectionCase::query()->lockForUpdate()->findOrFail($case->id);
            abort_if(($reason = $this->resolutionBlockReason($locked, 'NO_REPLACEMENT')) !== null, 422, $reason);
            $locked->update([
                'status' => 'RESOLVED', 'resolution_type' => 'NO_REPLACEMENT', 'resolution_notes' => $notes,
                'resolved_at' => now(), 'resolved_by_id' => $admin->id,
            ]);
            AuditLogger::success('REJECTED_ITEM_CLOSED', AuditLogger::MODULE_REJECTED_ITEMS, [
                'resource' => $locked, 'resource_label' => self::reference($locked),
                'details' => 'Rejected item case closed without replacement',
                'metadata' => ['rejection_case_id' => $locked->id, 'admin_user_id' => $admin->id, 'resolution_type' => 'NO_REPLACEMENT'],
            ]);

            return $locked;
        });
    }

    /**
     * Resolve the originating case once its replacement is inspected with the full
     * expected quantity accepted. Any rejection leaves the original case pending;
     * the new rejection gets its own case through syncInspection().
     */
    public function completeReplacement(QaInspection $inspection): void
    {
        if (! $inspection->completed_at) return;
        $receiving = $inspection->receiving()->with('items')->first();
        if (! $receiving?->replacement_for_rejection_case_id) return;

        DB::transaction(function () use ($inspection, $receiving) {
            $case = SupplierRejectionCase::query()->lockForUpdate()->find($receiving->replacement_for_rejection_case_id);
            if (! $case || $case->status !== 'REPLACEMENT_PENDING') return;

            $items = $inspection->items()->get();
            $expected = (int) $receiving->items->sum('ordered_quantity');
            if ((int) $items->sum('rejected_quantity') > 0 || (int) $items->sum('accepted_quantity') < $expected) return;

            $case->update(['status' => 'RESOLVED', 'resolution_type' => 'REPLACEMENT_RECEIVED', 'resolved_at' => now()]);
            AuditLogger::success('REPLACEMENT_COMPLETED', AuditLogger::MODULE_REJECTED_ITEMS, [
                'resource' => $case, 'resource_label' => self::reference($case),
                'details' => "Replacement {$receiving->receiving_no} passed QA",
                'metadata' => [
                    'rejection_case_id' => $case->id, 'replacement_receiving_id' => $receiving->id,
                    'qa_inspection_id' => $inspection->id, 'quantity' => (int) $items->sum('accepted_quantity'),
                ],
            ]);
        });
    }

    public static function reference(SupplierRejectionCase $case): string
    {
        return sprintf('RJ-%06d', $case->id);
    }

    private function notifyPlantManagers(Receiving $replacement, Receiving $original): void
    {
        $replacement->loadMissing('items', 'preparedBy.role');
        $owner = $replacement->preparedBy;
        // Fall back to the shared Receiving queue only when the original owner cannot act.
        $recipients = $owner?->status === 'ACTIVE' && $owner->isPlantManager()
            ? $owner
            : (Role::query()->where('slug', 'PLANT_MANAGER')->first()?->users()->where('status', 'ACTIVE')->get() ?? collect());
        $item = $replacement->items->first();

        WorkflowNotificationSender::send($recipients, new WorkflowNotification(
            'Supplier Replacement Expected',
            "Supplier replacement expected for {$original->receiving_no}: {$item->ordered_quantity} {$item->unit} {$item->product_name}. Replacement receiving {$replacement->receiving_no}.",
            'info',
            $replacement->receiving_no,
            'Receiving',
        ));
    }
}
