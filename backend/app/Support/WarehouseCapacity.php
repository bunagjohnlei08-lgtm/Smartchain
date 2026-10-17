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
    public const UNITS = ['PCS', 'SACK', 'DRUM'];
    public const AREAS = [
        'POWDER' => ['field' => 'capacity_powder', 'label' => 'Powder Products Area', 'unit' => 'SACK'],
        'LIQUID' => ['field' => 'capacity_liquid', 'label' => 'Liquid Products Area', 'unit' => 'DRUM'],
        'SOLID' => ['field' => 'capacity_solid', 'label' => 'Solid Products Area', 'unit' => 'PCS'],
        'RETURNED' => ['field' => 'capacity_returned', 'label' => 'Returned Products Area', 'unit' => null],
    ];
    public const UNIT_AREA = ['SACK' => 'POWDER', 'DRUM' => 'LIQUID', 'PCS' => 'SOLID'];
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
            ->where('inventories.warehouse_id', $warehouse->id)->select('products.unit')
            ->selectRaw('SUM(available_stock) AS available_stock, SUM(reserved_stock) AS reserved_stock, SUM(backload) AS backload, SUM(returned_stock) AS returned_stock')
            ->groupBy('products.unit')->get()->groupBy(fn ($row) => self::normalizeUnit($row->unit))
            ->map(fn ($rows) => (object) [
                'available_stock' => (int) $rows->sum('available_stock'), 'reserved_stock' => (int) $rows->sum('reserved_stock'),
                'backload' => (int) $rows->sum('backload'), 'returned_stock' => (int) $rows->sum('returned_stock'),
            ]);
        $configured = $warehouse->capacity !== null;
        $allocatedTotal = 0;
        foreach (self::AREAS as $area) {
            $allocated = $warehouse->{$area['field']};
            $configured = $configured && $allocated !== null && $allocated >= 0;
            $allocatedTotal += $allocated ?? 0;
        }
        $configured = $configured && $allocatedTotal === $warehouse->capacity;
        $areas = [];
        foreach (self::AREAS as $key => $area) {
            $allocated = $configured ? $warehouse->{$area['field']} : null;
            if ($key === 'RETURNED') {
                $breakdown = $usage->mapWithKeys(fn ($row, $unit) => [(string) $unit => (int) $row->returned_stock])->filter()->all();
                $used = array_sum($breakdown); $available = $reserved = $backload = 0;
            } else {
                $row = $usage[$area['unit']] ?? null;
                $available = (int) ($row->available_stock ?? 0); $reserved = (int) ($row->reserved_stock ?? 0);
                $backload = (int) ($row->backload ?? 0); $used = $available + $reserved; $breakdown = null;
            }
            $percentage = $allocated === null ? null : ($allocated > 0 ? round($used / $allocated * 100, 1) : ($used > 0 ? 100 : 0));
            $state = match (true) { $percentage === null => 'setup_required', $used > 0 && $used >= $allocated => 'full', $percentage >= self::WARNING_THRESHOLD => 'warning', default => 'normal' };
            $areas[$key] = [
                'label' => $area['label'], 'supported_unit' => $area['unit'], 'allocated' => $allocated, 'used' => $used,
                'remaining' => $allocated === null ? null : max(0, $allocated - $used), 'over_capacity' => $allocated !== null && $used > $allocated,
                'utilization_percentage' => $percentage === null ? null : min(100, $percentage), 'capacity_state' => $state,
                'available_stock' => $available, 'reserved_stock' => $reserved, 'backload' => $backload, 'unit_breakdown' => $breakdown,
            ];
        }
        $unsupported = $usage->except(self::UNITS)->map(fn ($row, $unit) => [
            'unit' => (string) $unit, 'used' => (int) $row->available_stock + (int) $row->reserved_stock,
            'available_stock' => (int) $row->available_stock, 'reserved_stock' => (int) $row->reserved_stock,
            'backload' => (int) $row->backload, 'returned_stock' => (int) $row->returned_stock,
        ])->values()->all();
        $states = array_column($areas, 'capacity_state');
        $state = ! $configured ? 'setup_required' : (in_array('full', $states, true) ? 'full' : (in_array('warning', $states, true) ? 'warning' : 'normal'));
        $usedCapacity = array_sum(array_column($areas, 'used'));
        $remainingCapacity = $warehouse->capacity === null ? null : (int) $warehouse->capacity - $usedCapacity;
        $occupancyPercentage = $warehouse->capacity !== null && $warehouse->capacity > 0
            ? round($usedCapacity / $warehouse->capacity * 100, 2)
            : null;
        return [
            'capacity' => $warehouse->capacity, 'capacity_powder' => $warehouse->capacity_powder,
            'capacity_liquid' => $warehouse->capacity_liquid, 'capacity_solid' => $warehouse->capacity_solid,
            'capacity_returned' => $warehouse->capacity_returned, 'allocation_configured' => $configured,
            'allocated_total' => $allocatedTotal, 'unallocated_capacity' => $warehouse->capacity === null ? null : $warehouse->capacity - $allocatedTotal,
            'used_capacity' => $usedCapacity, 'remaining_capacity' => $remainingCapacity,
            'occupancy_percentage' => $occupancyPercentage, 'over_capacity' => $remainingCapacity !== null && $remainingCapacity < 0,
            'area_capacity' => $areas, 'unit_capacity' => collect(self::UNIT_AREA)->mapWithKeys(fn ($area, $unit) => [$unit => $areas[$area]])->all(),
            'unsupported_unit_usage' => $unsupported, 'utilized' => null, 'available' => null, 'utilization_percentage' => null,
            'capacity_state' => $state, 'capacity_warning' => in_array($state, ['warning', 'full'], true),
        ];
    }

    public static function validateAllocations(Warehouse $warehouse, array $values): void
    {
        $fields = ['capacity', ...array_column(self::AREAS, 'field')];
        if (array_intersect($fields, array_keys($values)) === []) return;
        $merged = array_replace($warehouse->only($fields), $values);
        if (collect($fields)->contains(fn ($field) => ! isset($merged[$field]))) throw ValidationException::withMessages(['capacity' => 'Enter Total Capacity and all four storage-area allocations. Existing warehouses require explicit setup.']);
        $sum = collect(array_column(self::AREAS, 'field'))->sum(fn ($field) => (int) $merged[$field]);
        if ((int) $merged['capacity'] !== $sum) throw ValidationException::withMessages(['capacity' => 'Powder, Liquid, Solid, and Returned area allocations must add up exactly to Total Capacity.']);
        $snapshot = self::snapshot($warehouse);
        foreach (self::AREAS as $key => $area) if ((int) $merged[$area['field']] < $snapshot['area_capacity'][$key]['used']) throw ValidationException::withMessages([$area['field'] => "{$area['label']} allocation cannot be below its current occupancy ({$snapshot['area_capacity'][$key]['used']} slots)."]);
    }

    public static function ensureAdditionsFit(Warehouse $warehouse, array $additions): void
    {
        $snapshot = self::snapshot($warehouse);
        foreach ($additions as $rawUnit => $quantity) {
            if ($quantity <= 0) continue;
            $unit = self::normalizeUnit($rawUnit); $area = self::UNIT_AREA[$unit] ?? null;
            $remaining = $area ? $snapshot['area_capacity'][$area]['remaining'] : null;
            $message = match (true) {
                ! $snapshot['allocation_configured'] => 'Warehouse storage-area setup is required. Ask an administrator to divide Total Capacity among Powder, Liquid, Solid, and Returned areas.',
                $area === null => "No new-storage area is defined for {$unit}. Supported package units are PCS, SACK, and DRUM; legacy quantities are preserved without conversion.",
                $quantity > $remaining => "Cannot add stock: {$unit} quantity exceeds the remaining {$snapshot['area_capacity'][$area]['label']} capacity ({$remaining} slots).", default => null,
            };
            if ($message !== null) throw new HttpResponseException(response()->json(['message' => $message, 'capacity_unit' => $unit, 'capacity_area' => $area, 'available_capacity' => $remaining, 'requested_quantity' => $quantity], 422));
        }
    }

    public static function ensureReturnedAdditionFits(Warehouse $warehouse, int $quantity): void
    {
        if ($quantity <= 0) return;
        $snapshot = self::snapshot($warehouse); $remaining = $snapshot['area_capacity']['RETURNED']['remaining'];
        if (! $snapshot['allocation_configured'] || $remaining === null || $quantity > $remaining) throw new HttpResponseException(response()->json([
            'message' => ! $snapshot['allocation_configured'] ? 'Warehouse storage-area setup is required before returned goods can be received.' : "Cannot move returned stock: quantity exceeds the remaining Returned Products Area capacity ({$remaining} slots).",
            'capacity_area' => 'RETURNED', 'available_capacity' => $remaining, 'requested_quantity' => $quantity,
        ], 422));
    }

    public static function recordTransition(Warehouse $warehouse): void
    {
        $snapshot = self::snapshot($warehouse); $previous = $warehouse->capacity_unit_alert_levels ?? []; $levels = []; $alerts = [];
        foreach ($snapshot['area_capacity'] as $area => $capacity) {
            $level = strtoupper($capacity['capacity_state']); $levels[$area] = $level; $old = $previous[$area] ?? self::NORMAL;
            if ((in_array($old, [self::NORMAL, 'SETUP_REQUIRED'], true) && in_array($level, [self::WARNING, self::FULL], true)) || ($old === self::WARNING && $level === self::FULL)) $alerts[$area] = $capacity;
        }
        $overall = $snapshot['allocation_configured'] ? strtoupper($snapshot['capacity_state']) : self::NORMAL;
        $warehouse->forceFill(['capacity_alert_level' => $overall, 'capacity_unit_alert_levels' => $levels])->saveQuietly();
        if ($alerts === []) return;
        $warehouseId = $warehouse->id; $name = $warehouse->name; $code = $warehouse->code;
        DB::afterCommit(function () use ($warehouseId, $name, $code, $alerts): void {
            $recipients = User::query()->where('status', 'ACTIVE')->where(function ($query) use ($warehouseId) { $query->whereHas('role', fn ($role) => $role->where('slug', 'ADMIN'))->orWhere(fn ($managers) => $managers->where('warehouse_id', $warehouseId)->whereHas('role', fn ($role) => $role->where('slug', 'PLANT_MANAGER'))); })->get();
            $full = collect($alerts)->contains(fn ($capacity) => $capacity['capacity_state'] === 'full');
            $details = collect($alerts)->map(fn ($capacity) => sprintf('%s: %s allocated; %s used; %s remaining (%.1f%%).', $capacity['label'], number_format($capacity['allocated']), number_format($capacity['used']), number_format($capacity['remaining']), $capacity['utilization_percentage']))->implode(' ');
            WorkflowNotificationSender::send($recipients, new WorkflowNotification($full ? 'Warehouse Full' : 'Warehouse Near Capacity', "{$name}: {$details}", $full ? 'error' : 'warning', $code, 'Warehouse Capacity'));
        });
    }
}
