<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ReportsController extends Controller
{
    private const REPORTS = [
        'inventory' => 'Inventory Report',
        'receiving' => 'Receiving Report',
        'stock-in' => 'Stock In Report',
        'stock-out' => 'Stock Out Report',
        'shipment' => 'Shipment Report',
        'inventory-movement' => 'Inventory Movement Report',
        'warehouse-utilization' => 'Warehouse Utilization Report',
        'low-stock' => 'Low Stock Report',
        'damage-waste' => 'Damage & Waste Report',
        'order-fulfillment' => 'Order Fulfillment Report',
    ];

    public function dashboard(Request $request): JsonResponse
    {
        $this->authorizePlantManager($request);

        $today = now()->startOfDay();
        $tomorrow = $today->copy()->addDay();
        $yesterday = $today->copy()->subDay();

        $todayStockIn = $this->stockInQuantity($today, $tomorrow);
        $yesterdayStockIn = $this->stockInQuantity($yesterday, $today);
        $todayStockOut = $this->stockOutQuantity($today, $tomorrow);
        $yesterdayStockOut = $this->stockOutQuantity($yesterday, $today);
        $todayDeliveries = $this->deliveredCount($today, $tomorrow);
        $yesterdayDeliveries = $this->deliveredCount($yesterday, $today);

        $capacity = $this->warehouseCapacity();
        $trendStart = $today->copy()->subDays(29);
        $stockInByDate = $this->stockInByDate($trendStart, $tomorrow);
        $stockOutByDate = $this->stockOutByDate($trendStart, $tomorrow);

        $trend = collect(range(0, 29))->map(function (int $offset) use ($trendStart, $stockInByDate, $stockOutByDate) {
            $date = $trendStart->copy()->addDays($offset)->toDateString();

            return ['date' => $date, 'stock_in' => (int) ($stockInByDate[$date] ?? 0), 'stock_out' => (int) ($stockOutByDate[$date] ?? 0)];
        });

        $weekStart = $today->copy()->subWeeks(4)->startOfWeek();
        $weeklyIn = $this->stockInByDate($weekStart, $tomorrow);
        $weeklyOut = $this->stockOutByDate($weekStart, $tomorrow);
        $weekly = collect(range(0, 4))->map(function (int $index) use ($weekStart, $today, $weeklyIn, $weeklyOut) {
            $start = $weekStart->copy()->addWeeks($index);
            $end = $start->copy()->endOfWeek()->min($today);
            $dates = collect();
            for ($date = $start->copy(); $date->lte($end); $date->addDay()) {
                $dates->push($date->toDateString());
            }

            return [
                'week' => 'Week '.($index + 1),
                'stock_in' => (int) $dates->sum(fn (string $date) => $weeklyIn[$date] ?? 0),
                'stock_out' => (int) $dates->sum(fn (string $date) => $weeklyOut[$date] ?? 0),
            ];
        });

        $inventory = DB::table('inventories')
            ->selectRaw('COALESCE(SUM(available_stock), 0) AS available')
            ->selectRaw('COALESCE(SUM(reserved_stock), 0) AS reserved')
            ->selectRaw('COALESCE(SUM(backload), 0) AS in_transit')
            ->first();
        return response()->json([
            'kpis' => [
                'todays_deliveries' => ['value' => $todayDeliveries, 'change_percentage' => $this->percentageChange($todayDeliveries, $yesterdayDeliveries)],
                'todays_stock_in' => ['value' => $todayStockIn, 'change_percentage' => $this->percentageChange($todayStockIn, $yesterdayStockIn)],
                'todays_stock_out' => ['value' => $todayStockOut, 'change_percentage' => $this->percentageChange($todayStockOut, $yesterdayStockOut)],
                'pending_qa' => ['value' => DB::table('receivings')->where('status', 'Pending QA')->count()],
                'pending_shipment' => ['value' => DB::table('orders')->where('status', 'READY_FOR_SHIPMENT')->count()],
                'warehouse_utilization' => ['value' => $capacity['utilization_percentage'], 'change_percentage' => 0],
            ],
            'stock_movement_trend' => $trend,
            'weekly_stock' => $weekly,
            'inventory_status' => [
                ['name' => 'Available', 'value' => (int) $inventory->available],
                ['name' => 'In Transit', 'value' => (int) $inventory->in_transit],
                ['name' => 'Reserved', 'value' => (int) $inventory->reserved],
            ],
            'warehouse_capacity' => $capacity,
        ]);
    }

    public function generate(Request $request): JsonResponse
    {
        $this->authorizePlantManager($request);
        $validated = $request->validate([
            'type' => ['required', Rule::in(array_keys(self::REPORTS))],
            'format' => ['required', Rule::in(['preview', 'print', 'pdf', 'excel'])],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);

        $from = isset($validated['from']) ? Carbon::createFromFormat('Y-m-d', $validated['from'])->startOfDay() : null;
        $to = isset($validated['to']) ? Carbon::createFromFormat('Y-m-d', $validated['to'])->endOfDay() : null;
        [$columns, $rows, $summary] = $this->reportData($validated['type'], $from, $to);

        return response()->json(['report' => [
            'type' => $validated['type'],
            'title' => self::REPORTS[$validated['type']],
            'generated_at' => now()->toIso8601String(),
            'format' => $validated['format'],
            'filters' => ['from' => $validated['from'] ?? null, 'to' => $validated['to'] ?? null],
            'columns' => $columns,
            'rows' => $rows,
            'summary' => $summary,
        ]]);
    }

    public function recent(Request $request): JsonResponse
    {
        $this->authorizePlantManager($request);

        return response()->json(['data' => []]);
    }

    private function reportData(string $type, ?Carbon $from, ?Carbon $to): array
    {
        return match ($type) {
            'inventory' => $this->inventoryReport(false),
            'low-stock' => $this->inventoryReport(true),
            'receiving' => $this->receivingReport($from, $to),
            'stock-in' => $this->stockInReport($from, $to),
            'stock-out' => $this->stockOutReport($from, $to),
            'shipment' => $this->shipmentReport($from, $to),
            'inventory-movement' => $this->movementReport($from, $to),
            'warehouse-utilization' => $this->warehouseReport(),
            'damage-waste' => $this->damageReport($from, $to),
            'order-fulfillment' => $this->orderReport($from, $to),
        };
    }

    private function inventoryReport(bool $lowStock): array
    {
        $query = DB::table('inventories')->join('products', 'products.id', '=', 'inventories.product_id')->join('warehouses', 'warehouses.id', '=', 'inventories.warehouse_id');
        if ($lowStock) {
            $query->whereColumn('inventories.available_stock', '<=', 'products.reorder_level');
        }
        $rows = $query->orderBy('products.name')->get([
            'inventories.barcode', 'products.name as product', 'products.category', 'warehouses.name as warehouse',
            'inventories.available_stock', 'inventories.reserved_stock', 'inventories.backload', 'inventories.status',
        ])->map(fn ($row) => (array) $row)->all();

        return [array_keys($rows[0] ?? ['barcode' => null, 'product' => null, 'category' => null, 'warehouse' => null, 'available_stock' => null, 'reserved_stock' => null, 'backload' => null, 'status' => null]), $rows, ['records' => count($rows), 'available_units' => array_sum(array_column($rows, 'available_stock'))]];
    }

    private function receivingReport(?Carbon $from, ?Carbon $to): array
    {
        $query = DB::table('receivings')->leftJoin('receiving_items', 'receiving_items.receiving_id', '=', 'receivings.id')->groupBy('receivings.id')->orderByDesc('receivings.delivery_date');
        $this->applyDateRange($query, 'receivings.delivery_date', $from, $to);
        $rows = $query->get(['receivings.receiving_no', 'receivings.purchase_order', 'receivings.supplier', 'receivings.delivery_date', 'receivings.status', DB::raw('COALESCE(SUM(receiving_items.delivered_quantity), 0) as delivered_quantity')])->map(fn ($row) => (array) $row)->all();
        return [['receiving_no', 'purchase_order', 'supplier', 'delivery_date', 'status', 'delivered_quantity'], $rows, ['records' => count($rows), 'delivered_quantity' => array_sum(array_column($rows, 'delivered_quantity'))]];
    }

    private function stockInReport(?Carbon $from, ?Carbon $to): array
    {
        $query = DB::table('receiving_items')->join('receivings', 'receivings.id', '=', 'receiving_items.receiving_id')->leftJoin('qa_inspection_items', 'qa_inspection_items.receiving_item_id', '=', 'receiving_items.id')->whereNotNull('receiving_items.stocked_in_at')->orderByDesc('receiving_items.stocked_in_at');
        $this->applyDateRange($query, 'receiving_items.stocked_in_at', $from, $to);
        $rows = $query->get(['receivings.receiving_no', 'receiving_items.product_name as product', DB::raw('COALESCE(qa_inspection_items.accepted_quantity, receiving_items.delivered_quantity) as quantity'), 'receiving_items.unit', 'receiving_items.stocked_in_at'])->map(fn ($row) => (array) $row)->all();
        return [['receiving_no', 'product', 'quantity', 'unit', 'stocked_in_at'], $rows, ['records' => count($rows), 'quantity' => array_sum(array_column($rows, 'quantity'))]];
    }

    private function stockOutReport(?Carbon $from, ?Carbon $to): array
    {
        $query = DB::table('stock_out_transactions')->join('orders', 'orders.id', '=', 'stock_out_transactions.order_id')->join('products', 'products.id', '=', 'stock_out_transactions.product_id')->join('warehouses', 'warehouses.id', '=', 'stock_out_transactions.warehouse_id')->orderByDesc('stock_out_transactions.created_at');
        $this->applyDateRange($query, 'stock_out_transactions.created_at', $from, $to);
        $rows = $query->get(['stock_out_transactions.reference_no', 'orders.order_no', 'products.name as product', 'warehouses.name as warehouse', 'stock_out_transactions.quantity', 'stock_out_transactions.unit', 'stock_out_transactions.created_at'])->map(fn ($row) => (array) $row)->all();
        return [['reference_no', 'order_no', 'product', 'warehouse', 'quantity', 'unit', 'created_at'], $rows, ['records' => count($rows), 'quantity' => array_sum(array_column($rows, 'quantity'))]];
    }

    private function shipmentReport(?Carbon $from, ?Carbon $to): array
    {
        $statuses = ['READY_FOR_SHIPMENT', 'FORWARDED_TO_LOGISTICS', 'IN_TRANSIT', 'DELIVERED'];
        $query = DB::table('orders')->whereIn('status', $statuses)->orderByDesc('updated_at');
        $this->applyDateRange($query, 'updated_at', $from, $to);
        $rows = $query->get(['order_no', 'customer_name', 'required_delivery_date', 'status', 'total_amount', 'updated_at'])->map(fn ($row) => (array) $row)->all();
        return [['order_no', 'customer_name', 'required_delivery_date', 'status', 'total_amount', 'updated_at'], $rows, ['records' => count($rows), 'delivered' => collect($rows)->where('status', 'DELIVERED')->count()]];
    }

    private function movementReport(?Carbon $from, ?Carbon $to): array
    {
        [, $stockIn] = $this->stockInReport($from, $to);
        [, $stockOut] = $this->stockOutReport($from, $to);
        $rows = collect($stockIn)->map(fn ($row) => ['type' => 'Stock In', 'reference' => $row['receiving_no'], 'product' => $row['product'], 'quantity' => (int) $row['quantity'], 'occurred_at' => $row['stocked_in_at']])
            ->concat(collect($stockOut)->map(fn ($row) => ['type' => 'Stock Out', 'reference' => $row['reference_no'], 'product' => $row['product'], 'quantity' => (int) $row['quantity'], 'occurred_at' => $row['created_at']]))
            ->sortByDesc('occurred_at')->values()->all();
        return [['type', 'reference', 'product', 'quantity', 'occurred_at'], $rows, ['records' => count($rows), 'stock_in_quantity' => collect($rows)->where('type', 'Stock In')->sum('quantity'), 'stock_out_quantity' => collect($rows)->where('type', 'Stock Out')->sum('quantity')]];
    }

    private function warehouseReport(): array
    {
        $rows = DB::table('warehouses')
            ->leftJoin('inventories', 'inventories.warehouse_id', '=', 'warehouses.id')
            ->where('warehouses.code', 'WH-MAIN')
            ->where('warehouses.status', 'Active')
            ->groupBy('warehouses.id')
            ->orderBy('warehouses.name')
            ->get([
            'warehouses.name', 'warehouses.code', 'warehouses.capacity', 'warehouses.status',
            DB::raw('COALESCE(SUM(inventories.available_stock + inventories.reserved_stock), 0) as used'),
        ])->map(function ($row) {
            $used = (int) $row->used;
            $total = $row->capacity === null ? null : (int) $row->capacity;
            return ['name' => $row->name, 'code' => $row->code, 'status' => $row->status, 'used' => $used, 'free' => $total === null ? null : max(0, $total - $used), 'total' => $total, 'utilization_percentage' => $total && $total > 0 ? round(min(100, $used / $total * 100), 1) : null];
        })->all();
        return [['name', 'code', 'status', 'used', 'free', 'total', 'utilization_percentage'], $rows, ['warehouses' => count($rows), 'capacity' => array_sum(array_filter(array_column($rows, 'total'), fn ($value) => $value !== null))]];
    }

    private function damageReport(?Carbon $from, ?Carbon $to): array
    {
        $query = DB::table('qa_inspection_items')->join('receiving_items', 'receiving_items.id', '=', 'qa_inspection_items.receiving_item_id')->join('qa_inspections', 'qa_inspections.id', '=', 'qa_inspection_items.qa_inspection_id')->join('receivings', 'receivings.id', '=', 'qa_inspections.receiving_id')->where('qa_inspection_items.rejected_quantity', '>', 0)->orderByDesc('qa_inspections.completed_at');
        $this->applyDateRange($query, 'qa_inspections.completed_at', $from, $to);
        $rows = $query->get(['receivings.receiving_no', 'receiving_items.product_name as product', 'qa_inspection_items.rejected_quantity', 'qa_inspection_items.inspection_result', 'qa_inspection_items.remarks', 'qa_inspections.completed_at'])->map(fn ($row) => (array) $row)->all();
        return [['receiving_no', 'product', 'rejected_quantity', 'inspection_result', 'remarks', 'completed_at'], $rows, ['records' => count($rows), 'rejected_quantity' => array_sum(array_column($rows, 'rejected_quantity')), 'expired_quantity' => 0]];
    }

    private function orderReport(?Carbon $from, ?Carbon $to): array
    {
        $query = DB::table('orders')->leftJoin('order_items', 'order_items.order_id', '=', 'orders.id')->groupBy('orders.id')->orderByDesc('orders.order_date');
        $this->applyDateRange($query, 'orders.order_date', $from, $to);
        $rows = $query->get(['orders.order_no', 'orders.customer_name', 'orders.order_date', 'orders.required_delivery_date', 'orders.status', 'orders.total_amount', DB::raw('COUNT(order_items.id) as item_lines'), DB::raw('COALESCE(SUM(order_items.quantity), 0) as quantity')])->map(fn ($row) => (array) $row)->all();
        return [['order_no', 'customer_name', 'order_date', 'required_delivery_date', 'status', 'total_amount', 'item_lines', 'quantity'], $rows, ['records' => count($rows), 'delivered' => collect($rows)->where('status', 'DELIVERED')->count()]];
    }

    private function stockInQuantity(Carbon $from, Carbon $to): int
    {
        return (int) DB::table('receiving_items')->leftJoin('qa_inspection_items', 'qa_inspection_items.receiving_item_id', '=', 'receiving_items.id')->whereBetween('receiving_items.stocked_in_at', [$from, $to])->sum(DB::raw('COALESCE(qa_inspection_items.accepted_quantity, receiving_items.delivered_quantity)'));
    }

    private function stockOutQuantity(Carbon $from, Carbon $to): int
    {
        return (int) DB::table('stock_out_transactions')->whereBetween('created_at', [$from, $to])->sum('quantity');
    }

    private function deliveredCount(Carbon $from, Carbon $to): int
    {
        return DB::table('order_status_histories')->where('new_status', 'DELIVERED')->whereBetween('created_at', [$from, $to])->distinct('order_id')->count('order_id');
    }

    private function stockInByDate(Carbon $from, Carbon $to): array
    {
        return DB::table('receiving_items')->leftJoin('qa_inspection_items', 'qa_inspection_items.receiving_item_id', '=', 'receiving_items.id')->whereBetween('receiving_items.stocked_in_at', [$from, $to])->selectRaw('DATE(receiving_items.stocked_in_at) AS movement_date, COALESCE(SUM(COALESCE(qa_inspection_items.accepted_quantity, receiving_items.delivered_quantity)), 0) AS quantity')->groupByRaw('DATE(receiving_items.stocked_in_at)')->pluck('quantity', 'movement_date')->map(fn ($value) => (int) $value)->all();
    }

    private function stockOutByDate(Carbon $from, Carbon $to): array
    {
        return DB::table('stock_out_transactions')->whereBetween('created_at', [$from, $to])->selectRaw('DATE(created_at) AS movement_date, COALESCE(SUM(quantity), 0) AS quantity')->groupByRaw('DATE(created_at)')->pluck('quantity', 'movement_date')->map(fn ($value) => (int) $value)->all();
    }

    private function warehouseCapacity(): array
    {
        $row = DB::table('warehouses')->leftJoin('inventories', 'inventories.warehouse_id', '=', 'warehouses.id')->selectRaw('COALESCE(SUM(warehouses.capacity), 0) AS total')->selectRaw('COALESCE(SUM(inventories.available_stock + inventories.reserved_stock), 0) AS used')->first();
        // The capacity value is repeated by the inventory join, so calculate it separately.
        $total = (int) DB::table('warehouses')->sum('capacity');
        $used = (int) $row->used;
        return ['used' => $used, 'free' => max(0, $total - $used), 'total' => $total, 'utilization_percentage' => $total > 0 ? round(min(100, $used / $total * 100), 1) : 0];
    }

    private function percentageChange(int $today, int $yesterday): float
    {
        if ($yesterday === 0) {
            return $today === 0 ? 0 : 100;
        }
        return round((($today - $yesterday) / $yesterday) * 100, 1);
    }

    private function applyDateRange(Builder $query, string $column, ?Carbon $from, ?Carbon $to): void
    {
        $query->when($from, fn (Builder $builder) => $builder->where($column, '>=', $from))
            ->when($to, fn (Builder $builder) => $builder->where($column, '<=', $to));
    }

    private function authorizePlantManager(Request $request): void
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');
    }
}
