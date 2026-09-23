<?php

namespace App\Support;

use App\Models\User;
use App\Models\Warehouse;
use App\Notifications\WorkflowNotification;
use Illuminate\Support\Facades\DB;

class WarehouseCapacity
{
    public const WARNING_THRESHOLD = 95;
    public const NORMAL = 'NORMAL';
    public const WARNING = 'WARNING';
    public const FULL = 'FULL';

    public static function snapshot(Warehouse $warehouse): array
    {
        $utilized = (int) $warehouse->inventories()
            ->selectRaw('COALESCE(SUM(available_stock + reserved_stock), 0) AS aggregate')
            ->value('aggregate');
        $capacity = $warehouse->capacity;
        $rawPercentage = $capacity !== null && $capacity > 0
            ? round($utilized / $capacity * 100, 1)
            : null;
        $level = match (true) {
            $rawPercentage === null, $rawPercentage < self::WARNING_THRESHOLD => self::NORMAL,
            $rawPercentage >= 100 => self::FULL,
            default => self::WARNING,
        };

        return [
            'capacity' => $capacity,
            'utilized' => $utilized,
            'available' => $capacity === null ? null : max(0, $capacity - $utilized),
            // Preserve the existing API contract: the displayed bar percentage is capped at 100.
            'utilization_percentage' => $rawPercentage === null ? null : min(100, $rawPercentage),
            'capacity_state' => strtolower($level),
            'capacity_warning' => $level !== self::NORMAL,
        ];
    }

    /** Call while the warehouse row is locked in the capacity-changing transaction. */
    public static function recordTransition(Warehouse $warehouse): void
    {
        $snapshot = self::snapshot($warehouse);
        $previous = $warehouse->capacity_alert_level ?? self::NORMAL;
        $current = strtoupper($snapshot['capacity_state']);

        if ($previous !== $current) {
            $warehouse->forceFill(['capacity_alert_level' => $current])->saveQuietly();
        }

        $shouldNotify = ($previous === self::NORMAL && in_array($current, [self::WARNING, self::FULL], true))
            || ($previous === self::WARNING && $current === self::FULL);

        if (! $shouldNotify) {
            return;
        }

        $warehouseId = $warehouse->id;
        $warehouseName = $warehouse->name;
        $warehouseCode = $warehouse->code;
        DB::afterCommit(function () use ($warehouseId, $warehouseName, $warehouseCode, $snapshot, $current): void {
            $recipients = User::query()
                ->where('status', 'ACTIVE')
                ->where(function ($query) use ($warehouseId) {
                    $query->whereHas('role', fn ($role) => $role->where('slug', 'ADMIN'))
                        ->orWhere(function ($plantManagers) use ($warehouseId) {
                            $plantManagers->where('warehouse_id', $warehouseId)
                                ->whereHas('role', fn ($role) => $role->where('slug', 'PLANT_MANAGER'));
                        });
                })->get();

            $percentage = number_format((float) $snapshot['utilization_percentage'], 1, '.', '');
            $title = $current === self::FULL ? 'Warehouse Full' : 'Warehouse Near Capacity';
            $message = $current === self::FULL
                ? "{$warehouseName} has reached its configured capacity. Capacity: ".number_format((int) $snapshot['capacity'])." units; used: ".number_format($snapshot['utilized'])." units; available: ".number_format((int) $snapshot['available']).' units.'
                : "{$warehouseName} is now {$percentage}% utilized. Capacity: ".number_format((int) $snapshot['capacity'])." units; used: ".number_format($snapshot['utilized'])." units; available: ".number_format((int) $snapshot['available']).' units.';

            WorkflowNotificationSender::send($recipients, new WorkflowNotification(
                $title, $message, $current === self::FULL ? 'error' : 'warning', $warehouseCode, 'Warehouse Capacity'
            ));
        });
    }
}
