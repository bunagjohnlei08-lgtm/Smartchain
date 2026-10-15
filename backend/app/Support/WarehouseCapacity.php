<?php

namespace App\Support;

use App\Models\User;
use App\Models\Warehouse;
use App\Notifications\WorkflowNotification;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class WarehouseCapacity
{
    public const UNITS = ['KG', 'PCS', 'L'];
    public const WARNING_THRESHOLD = 95;
    public const NORMAL = 'NORMAL';
    public const WARNING = 'WARNING';
    public const FULL = 'FULL';

    public static function normalizeUnit(?string $unit): string
    {
        return strtoupper(trim($unit ?? '')) ?: 'UNSPECIFIED';
    }

    public static function snapshot(Warehouse $warehouse): array
    {
        $usage = DB::table('inventories')->join('products', 'products.id', '=', 'inventories.product_id')
            ->where('inventories.warehouse_id', $warehouse->id)
            ->select('products.unit')
            ->selectRaw('SUM(available_stock) AS available_stock, SUM(reserved_stock) AS reserved_stock, SUM(backload) AS backload')
            ->groupBy('products.unit')->get()
            // Use the same normalization as stock validation, including tabs/newlines.
            ->groupBy(fn ($row) => self::normalizeUnit($row->unit))
            ->map(fn ($rows) => (object) [
                'available_stock' => (int) $rows->sum('available_stock'),
                'reserved_stock' => (int) $rows->sum('reserved_stock'),
                'backload' => (int) $rows->sum('backload'),
            ]);
        $configured = $warehouse->capacity !== null;
        $allocatedTotal = 0;
        foreach (self::UNITS as $unit) {
            $allocated = $warehouse->{'capacity_'.strtolower($unit)};
            $configured = $configured && $allocated !== null && $allocated >= 0;
            $allocatedTotal += $allocated ?? 0;
        }
        $configured = $configured && $allocatedTotal === $warehouse->capacity;
        $units = [];
        foreach (self::UNITS as $unit) {
            $allocated = $configured ? $warehouse->{'capacity_'.strtolower($unit)} : null;
            $availableStock = (int) ($usage[$unit]->available_stock ?? 0);
            $reserved = (int) ($usage[$unit]->reserved_stock ?? 0);
            $used = $availableStock + $reserved;
            $percentage = $allocated === null ? null : ($allocated > 0 ? round($used / $allocated * 100, 1) : ($used > 0 ? 100 : 0));
            $state = match (true) {
                $percentage === null => 'setup_required',
                $used > 0 && $used >= $allocated => 'full',
                $percentage >= self::WARNING_THRESHOLD => 'warning',
                default => 'normal',
            };
            $units[$unit] = [
                'allocated' => $allocated, 'used' => $used,
                'remaining' => $allocated === null ? null : max(0, $allocated - $used),
                'over_capacity' => $allocated !== null && $used > $allocated,
                'utilization_percentage' => $percentage === null ? null : min(100, $percentage),
                'capacity_state' => $state,
                'available_stock' => $availableStock, 'reserved_stock' => $reserved,
                'backload' => (int) ($usage[$unit]->backload ?? 0),
            ];
        }
        $unsupported = $usage->except(self::UNITS)->map(fn ($row, $unit) => [
            'unit' => (string) $unit, 'used' => (int) $row->available_stock + (int) $row->reserved_stock,
            'available_stock' => (int) $row->available_stock, 'reserved_stock' => (int) $row->reserved_stock,
            'backload' => (int) $row->backload,
        ])->values()->all();
        $states = array_column($units, 'capacity_state');
        $state = ! $configured ? 'setup_required' : (in_array('full', $states, true) ? 'full' : (in_array('warning', $states, true) ? 'warning' : 'normal'));
        return [
            'capacity' => $warehouse->capacity,
            'capacity_kg' => $warehouse->capacity_kg, 'capacity_pcs' => $warehouse->capacity_pcs, 'capacity_l' => $warehouse->capacity_l,
            'allocation_configured' => $configured, 'allocated_total' => $allocatedTotal,
            'unallocated_capacity' => $warehouse->capacity === null ? null : max(0, $warehouse->capacity - $allocatedTotal),
            'unit_capacity' => $units, 'unsupported_unit_usage' => $unsupported,
            // Nullable compatibility keys: mixed units have no physical aggregate.
            'utilized' => null, 'available' => null, 'utilization_percentage' => null,
            'capacity_state' => $state, 'capacity_warning' => in_array($state, ['warning', 'full'], true),
        ];
    }

    /** Validate configuration while the warehouse row is locked. */
    public static function validateAllocations(Warehouse $warehouse, array $values): void
    {
        $fields = ['capacity', 'capacity_kg', 'capacity_pcs', 'capacity_l'];
        if (array_intersect($fields, array_keys($values)) === []) return;
        $merged = array_replace($warehouse->only($fields), $values);
        if (collect($fields)->contains(fn ($field) => ! isset($merged[$field]))) {
            throw ValidationException::withMessages(['capacity' => 'Enter Total Capacity and all three allocations: KG, PCS, and L. Existing warehouses require explicit allocation setup.']);
        }
        if ((int) $merged['capacity'] !== (int) $merged['capacity_kg'] + (int) $merged['capacity_pcs'] + (int) $merged['capacity_l']) {
            throw ValidationException::withMessages(['capacity' => 'KG, PCS, and L allocations must add up exactly to Total Capacity.']);
        }
        $snapshot = self::snapshot($warehouse);
        foreach (self::UNITS as $unit) {
            $field = 'capacity_'.strtolower($unit);
            if ((int) $merged[$field] < $snapshot['unit_capacity'][$unit]['used']) {
                throw ValidationException::withMessages([$field => "The {$unit} allocation cannot be below its current used quantity ({$snapshot['unit_capacity'][$unit]['used']} {$unit})."]);
            }
        }
    }

    /** Call under a warehouse lock, with all incoming items grouped by catalog unit. */
    public static function ensureAdditionsFit(Warehouse $warehouse, array $additions): void
    {
        $snapshot = self::snapshot($warehouse);
        foreach ($additions as $rawUnit => $quantity) {
            if ($quantity <= 0) continue;
            $unit = self::normalizeUnit($rawUnit);
            $remaining = $snapshot['unit_capacity'][$unit]['remaining'] ?? null;
            $message = match (true) {
                ! $snapshot['allocation_configured'] => 'Warehouse capacity allocation setup is required. Ask an administrator to allocate Total Capacity among KG, PCS, and L before adding stock.',
                ! in_array($unit, self::UNITS, true) => "No warehouse allocation is defined for {$unit}. Only KG, PCS, and L stock additions are supported; no unit conversion is applied.",
                $quantity > $remaining => "Cannot add stock: {$unit} quantity exceeds its remaining warehouse allocation ({$remaining} {$unit}).",
                default => null,
            };
            if ($message !== null) {
                throw new HttpResponseException(response()->json([
                    'message' => $message, 'capacity_unit' => $unit,
                    'available_capacity' => $remaining, 'requested_quantity' => $quantity,
                ], 422));
            }
        }
    }

    /** Unit alerts are deduplicated independently and sent only after commit. */
    public static function recordTransition(Warehouse $warehouse): void
    {
        $snapshot = self::snapshot($warehouse);
        $previous = $warehouse->capacity_unit_alert_levels ?? [];
        $levels = [];
        $alerts = [];
        foreach ($snapshot['unit_capacity'] as $unit => $capacity) {
            $level = strtoupper($capacity['capacity_state']);
            $levels[$unit] = $level;
            $old = $previous[$unit] ?? self::NORMAL;
            if ((in_array($old, [self::NORMAL, 'SETUP_REQUIRED'], true) && in_array($level, [self::WARNING, self::FULL], true))
                || ($old === self::WARNING && $level === self::FULL)) {
                $alerts[$unit] = $capacity;
            }
        }
        // The legacy column is varchar(10) and stores only NORMAL/WARNING/FULL.
        $overallLevel = $snapshot['allocation_configured'] ? strtoupper($snapshot['capacity_state']) : self::NORMAL;
        $warehouse->forceFill(['capacity_alert_level' => $overallLevel, 'capacity_unit_alert_levels' => $levels])->saveQuietly();
        if ($alerts === []) return;
        $warehouseId = $warehouse->id;
        $warehouseName = $warehouse->name;
        $warehouseCode = $warehouse->code;
        DB::afterCommit(function () use ($warehouseId, $warehouseName, $warehouseCode, $alerts): void {
            $recipients = User::query()->where('status', 'ACTIVE')->where(function ($query) use ($warehouseId) {
                $query->whereHas('role', fn ($role) => $role->where('slug', 'ADMIN'))
                    ->orWhere(fn ($managers) => $managers->where('warehouse_id', $warehouseId)->whereHas('role', fn ($role) => $role->where('slug', 'PLANT_MANAGER')));
            })->get();
            $full = collect($alerts)->contains(fn ($capacity) => $capacity['capacity_state'] === 'full');
            $details = collect($alerts)->map(fn ($capacity, $unit) => sprintf('%s allocation: %s allocated; %s used; %s remaining (%.1f%%).', $unit, number_format($capacity['allocated']), number_format($capacity['used']), number_format($capacity['remaining']), $capacity['utilization_percentage']))->implode(' ');
            WorkflowNotificationSender::send($recipients, new WorkflowNotification(
                $full ? 'Warehouse Full' : 'Warehouse Near Capacity', "{$warehouseName}: {$details}",
                $full ? 'error' : 'warning', $warehouseCode, 'Warehouse Capacity',
            ));
        });
    }
}
