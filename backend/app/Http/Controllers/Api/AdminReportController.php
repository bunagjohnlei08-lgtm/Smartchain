<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminReportController extends Controller
{
    private const COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];

    public function dashboard(Request $request): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Administrator access is required.');

        $warehouseCapacity = DB::table('warehouses')
            ->leftJoin('inventories', 'inventories.warehouse_id', '=', 'warehouses.id')
            ->where('warehouses.status', 'Active')
            ->groupBy('warehouses.id', 'warehouses.name', 'warehouses.code', 'warehouses.capacity')
            ->orderBy('warehouses.name')
            ->get([
                'warehouses.id', 'warehouses.name', 'warehouses.code', 'warehouses.capacity',
                DB::raw('COALESCE(SUM(inventories.available_stock + inventories.reserved_stock), 0) as used'),
            ])->values()->map(fn ($row, $index) => [
                'name' => $row->name,
                'code' => $row->code,
                'used' => (int) $row->used,
                'capacity' => $row->capacity === null ? null : (int) $row->capacity,
                'utilization_percentage' => $row->capacity && (int) $row->capacity > 0
                    ? round(min(100, (int) $row->used / (int) $row->capacity * 100), 1)
                    : null,
                'color' => self::COLORS[$index % count(self::COLORS)],
            ]);

        $stock = DB::table('inventories')
            ->join('products', 'products.id', '=', 'inventories.product_id')
            ->selectRaw('COALESCE(SUM(CASE WHEN inventories.available_stock > products.reorder_level THEN 1 ELSE 0 END), 0) as healthy')
            ->selectRaw('COALESCE(SUM(CASE WHEN inventories.available_stock > 0 AND inventories.available_stock <= products.reorder_level THEN 1 ELSE 0 END), 0) as low_stock')
            ->selectRaw('COALESCE(SUM(CASE WHEN inventories.available_stock = 0 THEN 1 ELSE 0 END), 0) as out_of_stock')
            ->first();

        $reports = collect($this->reportDefinitions())->map(function (array $report) {
            return [
                'id' => $report['id'],
                'name' => $report['name'],
                'description' => $report['description'],
                'category' => $report['category'],
                'last_generated' => null,
                'format' => $report['format'],
                'status' => 'Available',
                'file_size' => 'N/A',
                'parameters' => $report['parameters'],
            ];
        });

        $configuredWarehouses = $warehouseCapacity->filter(fn ($warehouse) => $warehouse['capacity'] !== null && $warehouse['capacity'] > 0);
        $usedCapacity = (int) $configuredWarehouses->sum('used');
        $totalCapacity = (int) $configuredWarehouses->sum('capacity');
        $capacityPercentage = $totalCapacity > 0 ? round(min(100, $usedCapacity / $totalCapacity * 100), 1) : null;

        return response()->json([
            'metrics' => [
                'total_reports_available' => $reports->count(),
                'exports_today' => null,
                'pending_reports' => null,
                'generated_today' => null,
                'warehouse_capacity' => [
                    'used' => $usedCapacity,
                    'total' => $totalCapacity > 0 ? $totalCapacity : null,
                    'utilization_percentage' => $capacityPercentage,
                ],
                'total_stock_units' => (int) (DB::table('inventories')
                    ->selectRaw('COALESCE(SUM(available_stock + reserved_stock), 0) as total')
                    ->value('total') ?? 0),
                'ai_forecast_accuracy' => null,
            ],
            'reports_list' => $reports->values(),
            'warehouse_capacity_overview' => $warehouseCapacity,
            'stock_status_overview' => [
                ['name' => 'Healthy', 'value' => (int) $stock->healthy, 'color' => '#10b981'],
                ['name' => 'Low Stock', 'value' => (int) $stock->low_stock, 'color' => '#f59e0b'],
                ['name' => 'Out of Stock', 'value' => (int) $stock->out_of_stock, 'color' => '#ef4444'],
            ],
            'recent_exports' => [],
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Administrator access is required.');

        $definitions = collect($this->reportDefinitions())->keyBy('id');
        $validated = $request->validate([
            'report_id' => ['required', 'string', Rule::in($definitions->keys()->all())],
            'format' => ['required', Rule::in(['CSV'])],
            'name' => ['nullable', 'string', 'max:100'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
        ]);
        $definition = $definitions->get($validated['report_id']);
        $table = $definition['table'];
        $columns = Schema::getColumnListing($table);
        $safeName = preg_replace('/[^A-Za-z0-9_-]+/', '_', $validated['name'] ?? $definition['name']);
        $filename = trim((string) $safeName, '_').'_'.now()->toDateString().'.csv';

        return response()->streamDownload(function () use ($table, $columns, $validated): void {
            $output = fopen('php://output', 'wb');
            fputcsv($output, $columns);
            $query = DB::table($table);
            $orderColumn = 'id';
            $dateColumn = 'created_at';
            if ($validated['report_id'] === 'low-stock') {
                $query->join('products', 'products.id', '=', 'inventories.product_id')
                    ->whereColumn('inventories.available_stock', '<=', 'products.reorder_level')
                    ->select('inventories.*');
                $orderColumn = 'inventories.id';
                $dateColumn = 'inventories.created_at';
            } elseif ($validated['report_id'] === 'shipment') {
                $query->whereIn('status', ['READY_FOR_SHIPMENT', 'FORWARDED_TO_LOGISTICS', 'IN_TRANSIT', 'DELIVERED']);
            } elseif ($validated['report_id'] === 'warehouse') {
                $query->where('status', 'Active');
            }
            if (! empty($validated['start_date'])) $query->whereDate($dateColumn, '>=', $validated['start_date']);
            if (! empty($validated['end_date'])) $query->whereDate($dateColumn, '<=', $validated['end_date']);
            $query->orderBy($orderColumn)->chunk(500, function ($rows) use ($output, $columns): void {
                foreach ($rows as $row) {
                    $values = array_map(function (string $column) use ($row) {
                        $value = $row->{$column};
                        if (is_string($value) && preg_match('/^[=+\-@\t\r]/', $value)) return "'".$value;
                        return $value;
                    }, $columns);
                    fputcsv($output, $values);
                }
            });
            fclose($output);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function reportDefinitions(): array
    {
        return [
            ['id' => 'inventory-summary', 'name' => 'Inventory Summary Report', 'description' => 'Current inventory quantities and stock status by warehouse.', 'category' => 'Inventory Reports', 'table' => 'inventories', 'format' => 'CSV', 'parameters' => 'All warehouses'],
            ['id' => 'low-stock', 'name' => 'Low Stock Alert Report', 'description' => 'Products at or below their reorder level.', 'category' => 'Inventory Reports', 'table' => 'inventories', 'format' => 'CSV', 'parameters' => 'Product reorder levels'],
            ['id' => 'stock-movement', 'name' => 'Stock Movement Report', 'description' => 'Recorded stock-out transactions and inventory activity.', 'category' => 'Stock Movement Reports', 'table' => 'stock_out_transactions', 'format' => 'CSV', 'parameters' => 'All recorded movements'],
            ['id' => 'receiving', 'name' => 'Receiving Report', 'description' => 'Incoming deliveries and receiving status.', 'category' => 'Receiving Reports', 'table' => 'receivings', 'format' => 'CSV', 'parameters' => 'All receiving records'],
            ['id' => 'shipment', 'name' => 'Shipment Report', 'description' => 'Orders forwarded through shipment and logistics.', 'category' => 'Shipment Reports', 'table' => 'orders', 'format' => 'CSV', 'parameters' => 'Shipment-related order statuses'],
            ['id' => 'order', 'name' => 'Order Report', 'description' => 'Customer order and fulfillment summary.', 'category' => 'Order Reports', 'table' => 'orders', 'format' => 'CSV', 'parameters' => 'All customer orders'],
            ['id' => 'procurement', 'name' => 'Procurement Report', 'description' => 'Replenishment requests and approval activity.', 'category' => 'Procurement Reports', 'table' => 'replenishment_requests', 'format' => 'CSV', 'parameters' => 'All replenishment requests'],
            ['id' => 'supplier', 'name' => 'Supplier Report', 'description' => 'Supplier master data and activity overview.', 'category' => 'Supplier Reports', 'table' => 'suppliers', 'format' => 'CSV', 'parameters' => 'All suppliers'],
            ['id' => 'warehouse', 'name' => 'Warehouse Utilization Report', 'description' => 'Physical stock utilization across active warehouses.', 'category' => 'Warehouse Reports', 'table' => 'warehouses', 'format' => 'CSV', 'parameters' => 'Active warehouses'],
            ['id' => 'forecast', 'name' => 'AI Demand Forecast Report', 'description' => 'Demand forecast availability summary.', 'category' => 'AI Forecast Reports', 'table' => 'products', 'format' => 'CSV', 'parameters' => 'Current product catalog'],
        ];
    }
}
