<?php

namespace App\Support;

use App\Models\InventoryAuditCycle;
use App\Models\InventoryAuditSetting;
use App\Models\Role;
use App\Models\User;
use App\Notifications\WorkflowNotification;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

final class InventoryAuditCycles
{
    public const BUSINESS_TIMEZONE = 'Asia/Manila';
    public const DEFAULT_MONTHS = [2, 6, 9, 12];

    public static function currentDate(): CarbonInterface
    {
        return now(self::BUSINESS_TIMEZONE);
    }

    public static function setting(): InventoryAuditSetting
    {
        return InventoryAuditSetting::query()->firstOrCreate(['id' => 1], ['audit_months' => self::DEFAULT_MONTHS]);
    }

    public static function ensureFor(CarbonInterface $date): ?InventoryAuditCycle
    {
        $months = array_map('intval', self::setting()->audit_months ?? []);
        if (! in_array((int) $date->month, $months, true)) {
            return null;
        }

        $scheduledFor = $date->copy()->startOfMonth()->toDateString();
        $cycle = DB::transaction(function () use ($date, $scheduledFor) {
            InventoryAuditCycle::query()
                ->where('status', InventoryAuditCycle::STATUS_ACTIVE)
                ->whereDate('scheduled_for', '<', $scheduledFor)
                ->update(['status' => InventoryAuditCycle::STATUS_COMPLETED, 'completed_at' => now()]);

            return InventoryAuditCycle::query()->firstOrCreate(
                ['scheduled_for' => $scheduledFor],
                [
                    'reference' => sprintf('IQA-%s', $date->format('Y-m')),
                    'name' => $date->format('F Y').' Audit',
                    'status' => InventoryAuditCycle::STATUS_ACTIVE,
                ]
            );
        });

        if ($cycle->wasRecentlyCreated) {
            AuditLogger::success('INVENTORY_AUDIT_CYCLE_STARTED', AuditLogger::MODULE_INVENTORY_AUDIT, [
                'resource' => $cycle,
                'resource_label' => $cycle->reference,
                'details' => "Started {$cycle->name} from the configured audit schedule.",
            ]);
        }

        return $cycle;
    }

    public static function notifyDue(InventoryAuditCycle $cycle): bool
    {
        $qaRoleId = Role::query()->where('slug', 'QA_SUPERVISOR')->value('id');
        $recipients = $qaRoleId
            ? User::query()->where('role_id', $qaRoleId)->where('status', 'ACTIVE')->get()
            : collect();
        if ($recipients->isEmpty()) return false;

        $claimed = InventoryAuditCycle::query()
            ->whereKey($cycle->id)
            ->whereNull('due_notified_at')
            ->update(['due_notified_at' => now()]);

        if (! $claimed) return false;

        WorkflowNotificationSender::send($recipients, new WorkflowNotification(
            'Inventory Quality Audit Due',
            "The scheduled Inventory Quality Audit for {$cycle->scheduled_for->format('F Y')} is due this month.",
            'info',
            (string) $cycle->id,
            'Inventory Quality Audit',
            ['path' => '/qa/inventory-audit']
        ));

        return true;
    }
}
