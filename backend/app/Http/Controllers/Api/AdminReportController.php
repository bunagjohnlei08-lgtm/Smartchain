<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AdminReportController extends Controller
{
    private const COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];

    public function dashboard(Request $request): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Administrator access is required.');

        $warehouseValues = DB::table('warehouses')
            ->leftJoin('inventories', 'inventories.warehouse_id', '=', 'warehouses.id')
            ->leftJoin('products', 'products.id', '=', 'inventories.product_id')
            ->groupBy('warehouses.id', 'warehouses.name')
            ->orderBy('warehouses.name')
            ->get([
                'warehouses.id', 'warehouses.name',
                DB::raw('COALESCE(SUM(inventories.available_stock * products.cost_price), 0) as value'),
            ])->values()->map(fn ($row, $index) => [
                'name' => $row->name,
                'value' => round((float) $row->value, 2),
                'color' => self::COLORS[$index % count(self::COLORS)],
            ]);

        $stock = DB::table('inventories')
            ->join('products', 'products.id', '=', 'inventories.product_id')
            ->selectRaw('COALESCE(SUM(CASE WHEN inventories.available_stock > products.reorder_level THEN inventories.available_stock ELSE 0 END), 0) as available')
            ->selectRaw('COALESCE(SUM(CASE WHEN inventories.available_stock > 0 AND inventories.available_stock <= products.reorder_level THEN inventories.available_stock ELSE 0 END), 0) as low_stock')
            ->selectRaw('COALESCE(SUM(CASE WHEN inventories.available_stock = 0 THEN 1 ELSE 0 END), 0) as out_of_stock')
            ->selectRaw('COALESCE(SUM(inventories.reserved_stock), 0) as reserved')
            ->selectRaw('COALESCE(SUM(inventories.backload), 0) as in_transit')
            ->first();

        $reports = collect($this->reportDefinitions())->map(function (array $report) {
            $lastGenerated = DB::table($report['table'])->max('updated_at');
            return [
                'id' => $report['id'],
                'name' => $report['name'],
                'description' => $report['description'],
                'category' => $report['category'],
                'last_generated' => $lastGenerated ? Carbon::parse($lastGenerated)->toIso8601String() : null,
                'format' => $report['format'],
                'status' => $lastGenerated ? 'Generated' : 'Pending',
                'file_size' => 'N/A',
                'parameters' => $report['parameters'],
            ];
        });

        $recentExports = $reports->where('status', 'Generated')->sortByDesc('last_generated')->take(5)
            ->map(fn ($report) => [
                'filename' => str_replace(' ', '_', $report['name']).'.'.strtolower($report['format'] === 'Excel' ? 'xlsx' : $report['format']),
                'date' => $report['last_generated'],
                'size' => $report['file_size'],
                'format' => $report['format'],
            ])->values();
        $today = today()->toDateString();
        $generatedToday = $reports->filter(fn ($report) => $report['last_generated']
            && Carbon::parse($report['last_generated'])->toDateString() === $today)->count();
        $exportsToday = $recentExports->filter(fn ($export) => Carbon::parse($export['date'])->toDateString() === $today)->count();

        return response()->json([
            'metrics' => [
                'total_reports_available' => $reports->count(),
                'exports_today' => $exportsToday,
                'pending_reports' => $reports->where('status', 'Pending')->count(),
                'generated_today' => $generatedToday,
                'total_inventory_value' => round($warehouseValues->sum('value'), 2),
                'ai_forecast_accuracy' => 87.6,
            ],
            'reports_list' => $reports->values(),
            'inventory_value_by_warehouse' => $warehouseValues,
            'stock_status_overview' => [
                ['name' => 'Available', 'value' => (int) $stock->available, 'color' => '#10b981'],
                ['name' => 'Reserved', 'value' => (int) $stock->reserved, 'color' => '#3b82f6'],
                ['name' => 'In Transit', 'value' => (int) $stock->in_transit, 'color' => '#8b5cf6'],
                ['name' => 'Low Stock', 'value' => (int) $stock->low_stock, 'color' => '#f59e0b'],
                ['name' => 'Out of Stock', 'value' => (int) $stock->out_of_stock, 'color' => '#ef4444'],
            ],
            'recent_exports' => $recentExports,
        ]);
    }

    private function reportDefinitions(): array
    {
        return [
            ['id' => 'inventory-valuation', 'name' => 'Inventory Valuation Report', 'description' => 'Current inventory quantity and value by warehouse.', 'category' => 'Inventory Reports', 'table' => 'inventories', 'format' => 'PDF', 'parameters' => 'All warehouses'],
            ['id' => 'low-stock', 'name' => 'Low Stock Alert Report', 'description' => 'Products at or below their reorder level.', 'category' => 'Inventory Reports', 'table' => 'inventories', 'format' => 'PDF', 'parameters' => 'Product reorder levels'],
            ['id' => 'stock-movement', 'name' => 'Stock Movement Report', 'description' => 'Recorded stock-out transactions and inventory activity.', 'category' => 'Stock Movement Reports', 'table' => 'stock_out_transactions', 'format' => 'CSV', 'parameters' => 'All recorded movements'],
            ['id' => 'receiving', 'name' => 'Receiving Report', 'description' => 'Incoming deliveries and receiving status.', 'category' => 'Receiving Reports', 'table' => 'receivings', 'format' => 'Excel', 'parameters' => 'All receiving records'],
            ['id' => 'shipment', 'name' => 'Shipment Report', 'description' => 'Orders forwarded through shipment and logistics.', 'category' => 'Shipment Reports', 'table' => 'orders', 'format' => 'CSV', 'parameters' => 'Shipment-related order statuses'],
            ['id' => 'order', 'name' => 'Order Report', 'description' => 'Customer order and fulfillment summary.', 'category' => 'Order Reports', 'table' => 'orders', 'format' => 'Excel', 'parameters' => 'All customer orders'],
            ['id' => 'procurement', 'name' => 'Procurement Report', 'description' => 'Replenishment requests and approval activity.', 'category' => 'Procurement Reports', 'table' => 'replenishment_requests', 'format' => 'PDF', 'parameters' => 'All replenishment requests'],
            ['id' => 'supplier', 'name' => 'Supplier Report', 'description' => 'Supplier master data and activity overview.', 'category' => 'Supplier Reports', 'table' => 'suppliers', 'format' => 'Excel', 'parameters' => 'All suppliers'],
            ['id' => 'warehouse', 'name' => 'Warehouse Utilization Report', 'description' => 'Inventory quantities and value across warehouses.', 'category' => 'Warehouse Reports', 'table' => 'warehouses', 'format' => 'Excel', 'parameters' => 'All warehouses'],
            ['id' => 'forecast', 'name' => 'AI Demand Forecast Report', 'description' => 'Demand forecast availability and accuracy summary.', 'category' => 'AI Forecast Reports', 'table' => 'products', 'format' => 'CSV', 'parameters' => 'Current product catalog'],
        ];
    }
}
