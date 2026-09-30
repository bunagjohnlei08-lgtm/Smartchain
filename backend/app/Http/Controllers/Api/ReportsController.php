<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Receiving;
use App\Models\ReportExport;
use App\Models\User;
use App\Models\Warehouse;
use App\Support\WarehouseCapacity;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

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

    /** The date each report's From/To filter applies to; null means a current-state report that ignores dates. */
    private const REPORT_DATE_FIELDS = [
        'inventory' => null,
        'receiving' => 'Delivery date',
        'stock-in' => 'Stocked in at',
        'stock-out' => 'Released at',
        'shipment' => 'Ready for shipment at',
        'inventory-movement' => 'Movement date',
        'warehouse-utilization' => null,
        'low-stock' => null,
        'damage-waste' => 'QA completed at',
        'order-fulfillment' => 'Order date',
    ];

    /** Event timestamps are stored in the app timezone and shown to users in business time. */
    private const TIMESTAMP_COLUMNS = ['stocked_in_at', 'created_at', 'completed_at', 'occurred_at', 'ready_for_shipment_at', 'packed_at'];

    /** Same business day convention as the Plant Manager Dashboard trends. */
    private const BUSINESS_TIMEZONE = 'Asia/Manila';
    private const DEFAULT_TREND_DAYS = 30;
    private const DEFAULT_WEEKS = 5;
    private const MAX_CHART_RANGE_DAYS = 366;
    private const DAILY_GROUPING_MAX_DAYS = 14;

    public function dashboard(Request $request): JsonResponse
    {
        $this->authorizePlantManager($request);
        [$from, $to] = $this->validatedRange($request);

        $today = CarbonImmutable::now(self::BUSINESS_TIMEZONE)->startOfDay();
        $yesterday = $today->subDay();
        $custom = $from !== null || $to !== null;

        if ($custom) {
            // A partial range is anchored on the given side: From-only runs to today, To-only covers the default 30 days.
            $rangeEnd = $to ?? $from->max($today);
            $rangeStart = $from ?? $rangeEnd->subDays(self::DEFAULT_TREND_DAYS - 1);
            if ($this->dayCount($rangeStart, $rangeEnd) > self::MAX_CHART_RANGE_DAYS) {
                throw ValidationException::withMessages(['from' => 'The report date range cannot exceed '.self::MAX_CHART_RANGE_DAYS.' days.']);
            }
            [$trendStart, $trendEnd, $weeklyStart, $weeklyEnd] = [$rangeStart, $rangeEnd, $rangeStart, $rangeEnd];
        } else {
            [$trendStart, $trendEnd] = [$today->subDays(self::DEFAULT_TREND_DAYS - 1), $today];
            [$weeklyStart, $weeklyEnd] = [$today->subWeeks(self::DEFAULT_WEEKS - 1)->startOfWeek(), $today];
        }

        $todayStockIn = $this->stockInQuantity($today, $today);
        $yesterdayStockIn = $this->stockInQuantity($yesterday, $yesterday);
        $todayStockOut = $this->stockOutQuantity($today, $today);
        $yesterdayStockOut = $this->stockOutQuantity($yesterday, $yesterday);
        $todayDeliveries = $this->deliveredCount($today, $today);
        $yesterdayDeliveries = $this->deliveredCount($yesterday, $yesterday);

        // One aggregation over the union of both chart periods keeps the two charts on the same numbers.
        $movementStart = $trendStart->min($weeklyStart);
        $movementEnd = $trendEnd->max($weeklyEnd);
        $stockInByDate = $this->stockInByDate($movementStart, $movementEnd);
        $stockOutByDate = $this->stockOutByDate($movementStart, $movementEnd);
        $sum = fn (array $byDate, CarbonImmutable $start, CarbonImmutable $end) => (int) collect($this->dates($start, $end))
            ->sum(fn (string $date) => $byDate[$date] ?? 0);

        $trend = collect($this->dates($trendStart, $trendEnd))->map(fn (string $date) => [
            'date' => $date,
            'stock_in' => (int) ($stockInByDate[$date] ?? 0),
            'stock_out' => (int) ($stockOutByDate[$date] ?? 0),
        ])->values();

        $daily = $custom && $this->dayCount($weeklyStart, $weeklyEnd) <= self::DAILY_GROUPING_MAX_DAYS;
        $weekly = collect($this->buckets($weeklyStart, $weeklyEnd, $daily))->map(fn (array $bucket) => [
            'week' => $bucket[0]->equalTo($bucket[1]) ? $bucket[0]->format('M j') : $bucket[0]->format('M j').' – '.$bucket[1]->format('M j'),
            'start' => $bucket[0]->toDateString(),
            'end' => $bucket[1]->toDateString(),
            'stock_in' => $sum($stockInByDate, $bucket[0], $bucket[1]),
            'stock_out' => $sum($stockOutByDate, $bucket[0], $bucket[1]),
        ])->values();

        $inventory = DB::table('inventories')
            ->selectRaw('COALESCE(SUM(available_stock), 0) AS available')
            ->selectRaw('COALESCE(SUM(reserved_stock), 0) AS reserved')
            ->selectRaw('COALESCE(SUM(backload), 0) AS backload')
            ->first();
        $capacity = $this->warehouseCapacity($request->user());

        return response()->json([
            'filters' => ['from' => $from?->toDateString(), 'to' => $to?->toDateString(), 'custom' => $custom, 'timezone' => self::BUSINESS_TIMEZONE],
            'kpis' => [
                'todays_deliveries' => ['value' => $todayDeliveries, 'change_percentage' => $this->percentageChange($todayDeliveries, $yesterdayDeliveries)],
                'todays_stock_in' => ['value' => $todayStockIn, 'change_percentage' => $this->percentageChange($todayStockIn, $yesterdayStockIn)],
                'todays_stock_out' => ['value' => $todayStockOut, 'change_percentage' => $this->percentageChange($todayStockOut, $yesterdayStockOut)],
                'pending_qa' => ['value' => $this->pendingQaCount()],
                // Orders released by Stock Out that have not been handed to Logistics yet.
                'pending_shipment' => ['value' => Order::query()->whereIn('status', Order::SHIPMENT_QUEUE_STATUSES)->count()],
                // Capacity has no stored history, so there is no honest "vs yesterday" comparison.
                'warehouse_utilization' => ['value' => $capacity['utilization_percentage']],
            ],
            'stock_movement_period' => ['from' => $trendStart->toDateString(), 'to' => $trendEnd->toDateString()],
            'stock_movement_trend' => $trend,
            'weekly_stock_period' => ['from' => $weeklyStart->toDateString(), 'to' => $weeklyEnd->toDateString(), 'grouping' => $daily ? 'daily' : 'weekly'],
            'weekly_stock' => $weekly,
            'inventory_status' => [
                ['name' => 'Available', 'value' => (int) $inventory->available],
                ['name' => 'Reserved', 'value' => (int) $inventory->reserved],
                ['name' => 'Backload', 'value' => (int) $inventory->backload],
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
        ]);
        [$from, $to] = $this->validatedRange($request);
        $dateField = self::REPORT_DATE_FIELDS[$validated['type']];

        [$columns, $rows, $summary] = $this->reportData($validated['type'], $from, $to);
        $rows = array_map(fn (array $row) => $this->toBusinessTime($row), $rows);

        ReportExport::create([
            'user_id' => $request->user()->id,
            'action' => $validated['format'] === 'preview' ? ReportExport::ACTION_PREVIEW : ReportExport::ACTION_EXPORT,
            'source' => ReportExport::SOURCE_STANDARD,
            'report_key' => $validated['type'],
            'report_name' => self::REPORTS[$validated['type']],
            'category' => $validated['type'],
            'format' => $validated['format'],
            'filters' => ['from' => $from?->toDateString(), 'to' => $to?->toDateString()],
            'status' => ReportExport::STATUS_SUCCESS,
            'row_count' => count($rows),
            'generated_at' => now(),
        ]);

        return response()->json(['report' => [
            'type' => $validated['type'],
            'title' => self::REPORTS[$validated['type']],
            'generated_at' => now()->toIso8601String(),
            'format' => $validated['format'],
            'filters' => ['from' => $from?->toDateString(), 'to' => $to?->toDateString()],
            'date_filter' => ['supported' => $dateField !== null, 'field' => $dateField, 'timezone' => self::BUSINESS_TIMEZONE],
            'columns' => $columns,
            'rows' => $rows,
            'summary' => $summary,
        ]]);
    }

    public function recent(Request $request): JsonResponse
    {
        $this->authorizePlantManager($request);

        return response()->json(['data' => ReportExport::query()
            ->where('user_id', $request->user()->id)
            ->whereIn('report_key', array_keys(self::REPORTS))
            ->with('user:id,name')
            ->orderByDesc('generated_at')->orderByDesc('id')
            ->limit(20)->get()
            ->map(fn (ReportExport $export) => [
                'id' => $export->id,
                'name' => $export->report_name,
                'type' => $export->report_key,
                'category' => $export->report_key,
                'generated_at' => $export->generated_at?->toIso8601String(),
                'generated_by' => $export->user?->name,
                'format' => $export->format,
            ])]);
    }

    /**
     * Validates From/To once for every endpoint. Both are optional business-day dates (Y-m-d);
     * an inverted range is rejected rather than silently swapped.
     *
     * @return array{0: ?CarbonImmutable, 1: ?CarbonImmutable}
     */
    private function validatedRange(Request $request): array
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
        ]);
        $parse = fn (?string $date) => $date ? CarbonImmutable::createFromFormat('!Y-m-d', $date, self::BUSINESS_TIMEZONE) : null;
        $from = $parse($validated['from'] ?? null);
        $to = $parse($validated['to'] ?? null);

        if ($from && $to && $from->gt($to)) {
            throw ValidationException::withMessages(['to' => 'The To date must be the same as or after the From date.']);
        }

        return [$from, $to];
    }

    private function reportData(string $type, ?CarbonImmutable $from, ?CarbonImmutable $to): array
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

    private function receivingReport(?CarbonImmutable $from, ?CarbonImmutable $to): array
    {
        $itemTotals = DB::table('receiving_items')->select('receiving_id')
            ->selectRaw('COALESCE(SUM(ordered_quantity), 0) as ordered_quantity')
            ->selectRaw('COALESCE(SUM(delivered_quantity), 0) as delivered_quantity')
            ->selectRaw('MAX(stocked_in_at) as stocked_in_at')
            ->groupBy('receiving_id');
        $qaTotals = DB::table('qa_inspection_items')
            ->join('receiving_items', 'receiving_items.id', '=', 'qa_inspection_items.receiving_item_id')
            ->select('receiving_items.receiving_id')
            ->selectRaw('COALESCE(SUM(qa_inspection_items.accepted_quantity), 0) as accepted_quantity')
            ->selectRaw('COALESCE(SUM(qa_inspection_items.rejected_quantity), 0) as rejected_quantity')
            ->groupBy('receiving_items.receiving_id');
        $replacementOrigins = DB::table('supplier_rejection_cases as src')
            ->join('qa_inspection_items as original_qai', 'original_qai.id', '=', 'src.qa_inspection_item_id')
            ->join('receiving_items as original_item', 'original_item.id', '=', 'original_qai.receiving_item_id')
            ->join('receivings as original_receiving', 'original_receiving.id', '=', 'original_item.receiving_id')
            ->select(['src.id as case_id', 'original_receiving.receiving_no as replaces_receiving']);

        $query = DB::table('receivings')
            ->leftJoinSub($itemTotals, 'item_totals', 'item_totals.receiving_id', '=', 'receivings.id')
            ->leftJoinSub($qaTotals, 'qa_totals', 'qa_totals.receiving_id', '=', 'receivings.id')
            ->leftJoin('qa_inspections', 'qa_inspections.receiving_id', '=', 'receivings.id')
            ->leftJoin('receiving_discrepancies', 'receiving_discrepancies.receiving_id', '=', 'receivings.id')
            ->leftJoinSub($replacementOrigins, 'replacement_origins', 'replacement_origins.case_id', '=', 'receivings.replacement_for_rejection_case_id')
            ->orderByDesc('receivings.delivery_date')->orderByDesc('receivings.id');
        $this->applyDateRange($query, 'receivings.delivery_date', $from, $to);
        $rows = $query->get([
            'receivings.receiving_no', 'receivings.purchase_order', 'receivings.reference_no', 'receivings.supplier',
            'receivings.delivery_date', 'receivings.status',
            DB::raw("CASE WHEN receivings.replacement_for_rejection_case_id IS NULL THEN 'Original' ELSE 'Replacement' END as receiving_type"),
            'replacement_origins.replaces_receiving',
            DB::raw('COALESCE(item_totals.ordered_quantity, 0) as ordered_quantity'),
            DB::raw('COALESCE(item_totals.delivered_quantity, 0) as delivered_quantity'),
            DB::raw('COALESCE(receiving_discrepancies.short_quantity, 0) as short_quantity'),
            'receiving_discrepancies.status as discrepancy_status',
            'qa_inspections.status as qa_status',
            DB::raw('COALESCE(qa_totals.accepted_quantity, 0) as accepted_quantity'),
            DB::raw('COALESCE(qa_totals.rejected_quantity, 0) as rejected_quantity'),
            'item_totals.stocked_in_at',
        ])->map(fn ($row) => (array) $row)->all();

        return [[
            'receiving_no', 'purchase_order', 'reference_no', 'supplier', 'delivery_date', 'status', 'receiving_type',
            'replaces_receiving', 'ordered_quantity', 'delivered_quantity', 'short_quantity', 'discrepancy_status',
            'qa_status', 'accepted_quantity', 'rejected_quantity', 'stocked_in_at',
        ], $rows, [
            'records' => count($rows),
            'delivered_quantity' => array_sum(array_column($rows, 'delivered_quantity')),
            'accepted_quantity' => array_sum(array_column($rows, 'accepted_quantity')),
            'rejected_quantity' => array_sum(array_column($rows, 'rejected_quantity')),
            'short_quantity' => array_sum(array_column($rows, 'short_quantity')),
        ]];
    }

    private function stockInReport(?CarbonImmutable $from, ?CarbonImmutable $to): array
    {
        $query = $this->stockInQuery()->join('receivings', 'receivings.id', '=', 'receiving_items.receiving_id')->orderByDesc('receiving_items.stocked_in_at');
        $this->applyTimestampRange($query, 'receiving_items.stocked_in_at', $from, $to);
        $rows = $query->get(['receivings.receiving_no', 'receiving_items.product_name as product', DB::raw($this->stockedQuantitySql().' as quantity'), 'receiving_items.unit', 'receiving_items.stocked_in_at'])->map(fn ($row) => (array) $row)->all();
        return [['receiving_no', 'product', 'quantity', 'unit', 'stocked_in_at'], $rows, ['records' => count($rows), 'quantity' => array_sum(array_column($rows, 'quantity'))]];
    }

    private function stockOutReport(?CarbonImmutable $from, ?CarbonImmutable $to): array
    {
        $query = DB::table('stock_out_transactions')->join('orders', 'orders.id', '=', 'stock_out_transactions.order_id')->join('products', 'products.id', '=', 'stock_out_transactions.product_id')->join('warehouses', 'warehouses.id', '=', 'stock_out_transactions.warehouse_id')->orderByDesc('stock_out_transactions.created_at');
        $this->applyTimestampRange($query, 'stock_out_transactions.created_at', $from, $to);
        $rows = $query->get(['stock_out_transactions.reference_no', 'orders.order_no', 'products.name as product', 'warehouses.name as warehouse', 'stock_out_transactions.quantity', 'stock_out_transactions.unit', 'stock_out_transactions.created_at'])->map(fn ($row) => (array) $row)->all();
        return [['reference_no', 'order_no', 'product', 'warehouse', 'quantity', 'unit', 'created_at'], $rows, ['records' => count($rows), 'quantity' => array_sum(array_column($rows, 'quantity'))]];
    }

    private function shipmentReport(?CarbonImmutable $from, ?CarbonImmutable $to): array
    {
        $statuses = [...Order::SHIPMENT_QUEUE_STATUSES, Order::LOGISTICS_STATUS, 'IN_TRANSIT', 'DELIVERED'];
        // The recorded Packing → Ready for Shipment transition, not the order's last-touched updated_at.
        $readyAt = DB::table('order_status_histories')->selectRaw('MAX(order_status_histories.created_at)')
            ->whereColumn('order_status_histories.order_id', 'orders.id')->where('order_status_histories.new_status', Order::SHIPMENT_STATUS);
        // The range applies to when the order entered Shipment after Stock Out: FOR_PACKING,
        // or READY_FOR_SHIPMENT for orders that entered before the packing stages existed.
        $enteredAt = DB::table('order_status_histories')->selectRaw('MIN(order_status_histories.created_at)')
            ->whereColumn('order_status_histories.order_id', 'orders.id')->whereIn('order_status_histories.new_status', Order::SHIPMENT_QUEUE_STATUSES);
        $query = DB::table('orders')
            ->leftJoin('shipment_packings', 'shipment_packings.order_id', '=', 'orders.id')
            ->leftJoin('users as packers', 'packers.id', '=', 'shipment_packings.packed_by_id')
            ->whereIn('orders.status', $statuses)->orderByDesc('orders.updated_at')
            ->select([
                'orders.order_no', 'orders.customer_name', 'orders.required_delivery_date', 'orders.status', 'orders.total_amount',
                'shipment_packings.package_id', 'shipment_packings.number_of_boxes', 'shipment_packings.estimated_weight_kg',
                'shipment_packings.is_fragile', 'packers.name as packed_by', 'shipment_packings.packed_at',
            ])
            ->selectRaw("CASE WHEN shipment_packings.correct_product = ? AND shipment_packings.correct_quantity = ? AND shipment_packings.package_condition = ? AND shipment_packings.items_complete = ? THEN ? ELSE ? END as packing_checklist", [true, true, true, true, 'Complete', 'Incomplete'])
            ->selectSub($readyAt, 'ready_for_shipment_at');
        if ($from) {
            $query->where(clone $enteredAt, '>=', $this->startOf($from));
        }
        if ($to) {
            $query->where(clone $enteredAt, '<', $this->endBefore($to));
        }
        $rows = $query->get()->map(fn ($row) => (array) $row)->all();
        return [[
            'order_no', 'customer_name', 'required_delivery_date', 'status', 'total_amount', 'package_id',
            'number_of_boxes', 'estimated_weight_kg', 'is_fragile', 'packed_by', 'packed_at', 'packing_checklist',
            'ready_for_shipment_at',
        ], $rows, ['records' => count($rows), 'delivered' => collect($rows)->where('status', 'DELIVERED')->count()]];
    }

    private function movementReport(?CarbonImmutable $from, ?CarbonImmutable $to): array
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
        $rows = Warehouse::query()
            ->where('code', 'WH-MAIN')
            ->where('status', 'Active')
            ->orderBy('name')
            ->get()
            ->map(function (Warehouse $warehouse) {
                $snapshot = WarehouseCapacity::snapshot($warehouse);
                return ['name' => $warehouse->name, 'code' => $warehouse->code, 'status' => $warehouse->status, 'used' => $snapshot['utilized'], 'free' => $snapshot['available'], 'total' => $snapshot['capacity'], 'utilization_percentage' => $snapshot['utilization_percentage']];
            })->all();
        return [['name', 'code', 'status', 'used', 'free', 'total', 'utilization_percentage'], $rows, ['warehouses' => count($rows), 'capacity' => array_sum(array_filter(array_column($rows, 'total'), fn ($value) => $value !== null))]];
    }

    private function damageReport(?CarbonImmutable $from, ?CarbonImmutable $to): array
    {
        $query = DB::table('qa_inspection_items')->join('receiving_items', 'receiving_items.id', '=', 'qa_inspection_items.receiving_item_id')->join('qa_inspections', 'qa_inspections.id', '=', 'qa_inspection_items.qa_inspection_id')->join('receivings', 'receivings.id', '=', 'qa_inspections.receiving_id')->where('qa_inspection_items.rejected_quantity', '>', 0)->orderByDesc('qa_inspections.completed_at');
        $this->applyTimestampRange($query, 'qa_inspections.completed_at', $from, $to);
        $rows = $query->get(['receivings.receiving_no', 'receiving_items.product_name as product', 'qa_inspection_items.rejected_quantity', 'qa_inspection_items.inspection_result', 'qa_inspection_items.remarks', 'qa_inspections.completed_at'])->map(fn ($row) => (array) $row)->all();
        return [['receiving_no', 'product', 'rejected_quantity', 'inspection_result', 'remarks', 'completed_at'], $rows, ['records' => count($rows), 'rejected_quantity' => array_sum(array_column($rows, 'rejected_quantity'))]];
    }

    private function orderReport(?CarbonImmutable $from, ?CarbonImmutable $to): array
    {
        $query = DB::table('orders')->leftJoin('order_items', 'order_items.order_id', '=', 'orders.id')->groupBy('orders.id')->orderByDesc('orders.order_date');
        $this->applyDateRange($query, 'orders.order_date', $from, $to);
        $rows = $query->get(['orders.order_no', 'orders.customer_name', 'orders.order_date', 'orders.required_delivery_date', 'orders.status', 'orders.total_amount', DB::raw('COUNT(order_items.id) as item_lines'), DB::raw('COALESCE(SUM(order_items.quantity), 0) as quantity')])->map(fn ($row) => (array) $row)->all();
        return [['order_no', 'customer_name', 'order_date', 'required_delivery_date', 'status', 'total_amount', 'item_lines', 'quantity'], $rows, ['records' => count($rows), 'delivered' => collect($rows)->where('status', 'DELIVERED')->count()]];
    }

    /** Completed Stock In lines. A receiving item has at most one QA line (one inspection per receiving). */
    private function stockInQuery(): Builder
    {
        return DB::table('receiving_items')
            ->leftJoin('qa_inspection_items', 'qa_inspection_items.receiving_item_id', '=', 'receiving_items.id')
            ->whereNotNull('receiving_items.stocked_in_at');
    }

    /** Mirrors StockInController::resolveStockedQuantity — the quantity actually added to inventory. */
    private function stockedQuantitySql(): string
    {
        return 'COALESCE(qa_inspection_items.accepted_quantity, receiving_items.delivered_quantity)';
    }

    private function stockInQuantity(CarbonImmutable $from, CarbonImmutable $to): int
    {
        $query = $this->stockInQuery();
        $this->applyTimestampRange($query, 'receiving_items.stocked_in_at', $from, $to);

        return (int) $query->sum(DB::raw($this->stockedQuantitySql()));
    }

    private function stockOutQuantity(CarbonImmutable $from, CarbonImmutable $to): int
    {
        $query = DB::table('stock_out_transactions');
        $this->applyTimestampRange($query, 'created_at', $from, $to);

        return (int) $query->sum('quantity');
    }

    /** Orders currently Delivered whose latest recorded Delivered transition falls in the range. */
    private function deliveredCount(CarbonImmutable $from, CarbonImmutable $to): int
    {
        $deliveries = DB::table('order_status_histories')
            ->where('new_status', 'DELIVERED')
            ->groupBy('order_id')
            ->select('order_id')
            ->selectRaw('MAX(created_at) AS delivered_at');

        return DB::query()->fromSub($deliveries, 'deliveries')
            ->join('orders', 'orders.id', '=', 'deliveries.order_id')
            ->where('orders.status', 'DELIVERED')
            ->where('deliveries.delivered_at', '>=', $this->startOf($from))
            ->where('deliveries.delivered_at', '<', $this->endBefore($to))
            ->count();
    }

    /** Same eligibility as the QA inspection queue: Pending QA with no completed inspection. */
    private function pendingQaCount(): int
    {
        return Receiving::query()
            ->where('status', 'Pending QA')
            ->where(function ($query) {
                $query->whereDoesntHave('qaInspection')
                    ->orWhereHas('qaInspection', fn ($inspection) => $inspection->whereNull('completed_at'));
            })
            ->count();
    }

    private function stockInByDate(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $day = $this->businessDateSql('receiving_items.stocked_in_at');
        $query = $this->stockInQuery();
        $this->applyTimestampRange($query, 'receiving_items.stocked_in_at', $from, $to);

        return $this->keyedByDate($query->selectRaw("{$day} AS movement_date, COALESCE(SUM({$this->stockedQuantitySql()}), 0) AS quantity")->groupByRaw($day));
    }

    private function stockOutByDate(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $day = $this->businessDateSql('created_at');
        $query = DB::table('stock_out_transactions');
        $this->applyTimestampRange($query, 'created_at', $from, $to);

        return $this->keyedByDate($query->selectRaw("{$day} AS movement_date, COALESCE(SUM(quantity), 0) AS quantity")->groupByRaw($day));
    }

    private function keyedByDate(Builder $query): array
    {
        return $query->get()->mapWithKeys(fn ($row) => [substr((string) $row->movement_date, 0, 10) => (int) $row->quantity])->all();
    }

    /**
     * SQL for the business-timezone calendar date of a stored timestamp. Column names are
     * internal constants and the zones come from code/config, never from the request.
     */
    private function businessDateSql(string $column): string
    {
        $source = config('app.timezone');
        $target = self::BUSINESS_TIMEZONE;
        $offsetMinutes = CarbonImmutable::now($target)->utcOffset() - CarbonImmutable::now($source)->utcOffset();

        return match (DB::getDriverName()) {
            'pgsql' => "DATE(({$column} AT TIME ZONE '{$source}') AT TIME ZONE '{$target}')",
            'sqlite' => sprintf("DATE(%s, '%+d minutes')", $column, $offsetMinutes),
            default => sprintf('DATE(DATE_ADD(%s, INTERVAL %d MINUTE))', $column, $offsetMinutes),
        };
    }

    /** Snapshot of the Plant Manager's warehouse, identical to the Warehouse page. */
    private function warehouseCapacity(User $user): array
    {
        $warehouse = ($user->warehouse_id ? Warehouse::query()->find($user->warehouse_id) : null)
            ?? Warehouse::query()->where('code', 'WH-MAIN')->first();
        if (! $warehouse) {
            return ['used' => 0, 'free' => null, 'total' => null, 'utilization_percentage' => null];
        }
        $snapshot = WarehouseCapacity::snapshot($warehouse);

        return [
            'used' => $snapshot['utilized'],
            'free' => $snapshot['available'],
            'total' => $snapshot['capacity'],
            'utilization_percentage' => $snapshot['utilization_percentage'],
        ];
    }

    /** Null when yesterday had nothing to compare against, instead of a misleading 100%/Infinity. */
    private function percentageChange(int $today, int $yesterday): ?float
    {
        if ($yesterday === 0) {
            return null;
        }
        return round((($today - $yesterday) / $yesterday) * 100, 1);
    }

    /** Inclusive business-day range on an event timestamp: [From 00:00, day after To 00:00). */
    private function applyTimestampRange(Builder $query, string $column, ?CarbonImmutable $from, ?CarbonImmutable $to): void
    {
        $query->when($from, fn (Builder $builder) => $builder->where($column, '>=', $this->startOf($from)))
            ->when($to, fn (Builder $builder) => $builder->where($column, '<', $this->endBefore($to)));
    }

    /** Inclusive range on a column that already stores a business calendar date. */
    private function applyDateRange(Builder $query, string $column, ?CarbonImmutable $from, ?CarbonImmutable $to): void
    {
        $query->when($from, fn (Builder $builder) => $builder->whereDate($column, '>=', $from->toDateString()))
            ->when($to, fn (Builder $builder) => $builder->whereDate($column, '<=', $to->toDateString()));
    }

    private function startOf(CarbonImmutable $day): CarbonImmutable
    {
        return $day->startOfDay()->setTimezone(config('app.timezone'));
    }

    private function endBefore(CarbonImmutable $day): CarbonImmutable
    {
        return $day->addDay()->startOfDay()->setTimezone(config('app.timezone'));
    }

    /** @return list<string> */
    private function dates(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $dates = [];
        for ($date = $from; $date->lte($to); $date = $date->addDay()) {
            $dates[] = $date->toDateString();
        }
        return $dates;
    }

    /** @return list<array{0: CarbonImmutable, 1: CarbonImmutable}> Calendar-week (or single-day) buckets clipped to the range. */
    private function buckets(CarbonImmutable $from, CarbonImmutable $to, bool $daily): array
    {
        $buckets = [];
        for ($start = $from; $start->lte($to); $start = $end->addDay()) {
            $end = $daily ? $start : $start->endOfWeek()->startOfDay()->min($to);
            $buckets[] = [$start, $end];
        }
        return $buckets;
    }

    private function dayCount(CarbonImmutable $from, CarbonImmutable $to): int
    {
        return (int) round($from->diffInDays($to)) + 1;
    }

    private function toBusinessTime(array $row): array
    {
        foreach (self::TIMESTAMP_COLUMNS as $column) {
            if (! empty($row[$column])) {
                $row[$column] = CarbonImmutable::parse($row[$column], config('app.timezone'))->setTimezone(self::BUSINESS_TIMEZONE)->format('Y-m-d H:i:s');
            }
        }
        return $row;
    }

    private function authorizePlantManager(Request $request): void
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');
    }
}
