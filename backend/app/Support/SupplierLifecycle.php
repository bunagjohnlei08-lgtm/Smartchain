<?php

namespace App\Support;

use App\Models\PurchaseOrder;
use App\Models\Supplier;
use App\Models\User;
use App\Notifications\WorkflowNotification;
use Illuminate\Support\Facades\DB;

class SupplierLifecycle
{
    /** @return array{supplier: Supplier, changed: bool} */
    public function requestRemoval(Supplier $supplier, User $actor): array
    {
        $result = DB::transaction(function () use ($supplier, $actor): array {
            $locked = Supplier::query()->lockForUpdate()->findOrFail($supplier->id);

            if ($locked->status === Supplier::STATUS_PENDING_REMOVAL) {
                return ['supplier' => $locked, 'changed' => false];
            }

            abort_unless($locked->status === Supplier::STATUS_ACTIVE, 422, 'Only active suppliers can be removed.');

            $locked->update([
                'status' => Supplier::STATUS_PENDING_REMOVAL,
                'removal_requested_at' => now(),
                'removal_requested_by_id' => $actor->id,
                'archived_at' => null,
            ]);

            return ['supplier' => $locked->fresh(), 'changed' => true];
        }, 3);

        if ($result['changed']) {
            $supplier = $result['supplier'];
            AuditLogger::success('SUPPLIER_REMOVAL_REQUESTED', AuditLogger::MODULE_SUPPLIERS, [
                'actor' => $actor,
                'resource' => $supplier,
                'resource_label' => $supplier->name,
                'details' => "{$supplier->name} was removed from active suppliers by {$actor->name}.",
                'metadata' => [
                    'old_status' => Supplier::STATUS_ACTIVE,
                    'new_status' => Supplier::STATUS_PENDING_REMOVAL,
                    'recovery_deadline' => $supplier->recoveryDeadline()?->toIso8601String(),
                ],
            ]);
            $this->notifyAdmins(
                'Supplier Removed',
                "{$supplier->name} was removed from active suppliers by {$actor->name}.",
                'SUPPLIER_REMOVAL_REQUESTED',
                $supplier,
            );
        }

        return $result;
    }

    /** @return array{supplier: Supplier, restored: bool, expired: bool} */
    public function restore(Supplier $supplier, User $actor): array
    {
        $result = DB::transaction(function () use ($supplier): array {
            $locked = Supplier::query()->lockForUpdate()->findOrFail($supplier->id);

            if ($locked->status === Supplier::STATUS_ACTIVE) {
                return ['supplier' => $locked, 'restored' => false, 'expired' => false];
            }

            abort_unless($locked->status === Supplier::STATUS_PENDING_REMOVAL, 422, 'Only recently removed suppliers can be restored.');

            if (! $locked->canBeRestored()) {
                $locked->update([
                    'status' => Supplier::STATUS_ARCHIVED,
                    'archived_at' => now(),
                ]);

                return ['supplier' => $locked->fresh(), 'restored' => false, 'expired' => true];
            }

            $locked->update([
                'status' => Supplier::STATUS_ACTIVE,
                'removal_requested_at' => null,
                'removal_requested_by_id' => null,
                'archived_at' => null,
            ]);

            return ['supplier' => $locked->fresh(), 'restored' => true, 'expired' => false];
        }, 3);

        $supplier = $result['supplier'];
        if ($result['expired']) {
            $this->recordArchived($supplier, $actor);
        } elseif ($result['restored']) {
            AuditLogger::success('SUPPLIER_RESTORED', AuditLogger::MODULE_SUPPLIERS, [
                'actor' => $actor,
                'resource' => $supplier,
                'resource_label' => $supplier->name,
                'details' => "{$supplier->name} was restored as an active supplier.",
                'metadata' => [
                    'old_status' => Supplier::STATUS_PENDING_REMOVAL,
                    'new_status' => Supplier::STATUS_ACTIVE,
                ],
            ]);
            $this->notifyAdmins(
                'Supplier Restored',
                "{$supplier->name} was restored as an active supplier by {$actor->name}.",
                'SUPPLIER_RESTORED',
                $supplier,
            );
        }

        return $result;
    }

    public function archiveExpired(int $limit = 500): int
    {
        $cutoff = now(Supplier::BUSINESS_TIMEZONE)->subDays(Supplier::RECOVERY_DAYS)->utc();
        $ids = Supplier::query()
            ->where('status', Supplier::STATUS_PENDING_REMOVAL)
            ->whereNotNull('removal_requested_at')
            ->where('removal_requested_at', '<=', $cutoff)
            ->orderBy('id')
            ->limit($limit)
            ->pluck('id');
        $archived = 0;

        foreach ($ids as $id) {
            $supplier = DB::transaction(function () use ($id): ?Supplier {
                $locked = Supplier::query()->lockForUpdate()->find($id);
                if (! $locked || $locked->status !== Supplier::STATUS_PENDING_REMOVAL || $locked->canBeRestored()) {
                    return null;
                }

                $locked->update([
                    'status' => Supplier::STATUS_ARCHIVED,
                    'archived_at' => now(),
                ]);

                return $locked->fresh();
            }, 3);

            if ($supplier) {
                $archived++;
                $this->recordArchived($supplier);
            }
        }

        return $archived;
    }

    public function openPurchaseOrders(Supplier $supplier): int
    {
        return $supplier->purchaseOrders()->whereIn('status', PurchaseOrder::ACTIVE_STATUSES)->count();
    }

    private function recordArchived(Supplier $supplier, ?User $actor = null): void
    {
        AuditLogger::success('SUPPLIER_ARCHIVED', AuditLogger::MODULE_SUPPLIERS, [
            'actor' => $actor,
            'resource' => $supplier,
            'resource_label' => $supplier->name,
            'details' => "{$supplier->name} completed the 30-day removal period and was archived.",
            'metadata' => [
                'old_status' => Supplier::STATUS_PENDING_REMOVAL,
                'new_status' => Supplier::STATUS_ARCHIVED,
            ],
        ]);
        $this->notifyAdmins(
            'Supplier Archived',
            "{$supplier->name} completed the 30-day removal period and was archived.",
            'SUPPLIER_ARCHIVED',
            $supplier,
        );
    }

    private function notifyAdmins(string $title, string $message, string $type, Supplier $supplier): void
    {
        $admins = User::query()->where('status', 'ACTIVE')
            ->whereHas('role', fn ($query) => $query->where('slug', 'ADMIN'))
            ->get();

        WorkflowNotificationSender::send($admins, new WorkflowNotification(
            title: $title,
            message: $message,
            type: $type,
            referenceId: (string) $supplier->id,
            category: 'Supplier Management',
            metadata: ['supplier_code' => $supplier->supplier_code],
        ));
    }
}
