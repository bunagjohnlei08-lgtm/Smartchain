<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\StockOutTransaction;
use App\Models\Supplier;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlantManagerDashboardController extends Controller
{
    private const REORDER_LEVEL = 20;
    private const BUSINESS_TIMEZONE = 'Asia/Manila';

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->isPlantManager(), 403);

        $today = now();
        $historyStart = $today->copy()->subMonths(7)->startOfMonth();
        $trendToday = now(self::BUSINESS_TIMEZONE);
        $trendHistoryStart = $trendToday->copy()->subMonths(7)->startOfMonth();
        $allStockInRows = ReceivingItem::query()
            ->leftJoin('qa_inspection_items', 'qa_inspection_items.receiving_item_id', '=', 'receiving_items.id')
            ->whereNotNull('receiving_items.stocked_in_at')
            ->get([
                'receiving_items.id', 'receiving_items.product_id', 'receiving_items.warehouse_id', 'receiving_items.product_name',
                'receiving_items.stocked_in_at', 'receiving_items.delivered_quantity',
                'qa_inspection_items.accepted_quantity',
            ])
            ->map(function ($item) {
                $item->quantity = (int) ($item->accepted_quantity ?? $item->delivered_quantity);
                return $item;
            });
        $allStockOutRows = StockOutTransaction::query()
            ->with(['product:id,name', 'performer:id,name'])
            ->get();
        $stockInRows = $allStockInRows->filter(fn ($row) => Carbon::parse($row->stocked_in_at)->gte($historyStart));
        $stockOutRows = $allStockOutRows->filter(fn ($row) => $row->created_at->gte($historyStart));
        $trendStockInRows = $allStockInRows->filter(fn ($row) => Carbon::parse($row->stocked_in_at)
            ->setTimezone(self::BUSINESS_TIMEZONE)->gte($trendHistoryStart));
        $trendStockOutRows = $allStockOutRows->filter(fn ($row) => $row->created_at->copy()
            ->setTimezone(self::BUSINESS_TIMEZONE)->gte($trendHistoryStart));

        $currentUnits = (int) Inventory::query()->sum('available_stock');
        $currentValue = (float) Inventory::query()
            ->join('products', 'products.id', '=', 'inventories.product_id')
            ->selectRaw('COALESCE(SUM(inventories.available_stock * products.cost_price), 0) as total')
            ->value('total');
        $inventoryRecords = Inventory::query()->get(['product_id', 'warehouse_id', 'available_stock']);
        $totalProducts = Product::query()->count();
        $availabilityFor = static function ($balances) use ($totalProducts): int {
            if ($totalProducts === 0) {
                return 0;
            }

            $availableProducts = $balances
                ->groupBy('product_id')
                ->filter(fn ($rows) => $rows->sum('balance') > 0)
                ->count();

            return (int) round(100 * $availableProducts / $totalProducts);
        };
        $inventoryTrend = collect(range(6, 1))->map(function (int $monthsAgo) use ($trendToday, $inventoryRecords, $trendStockInRows, $trendStockOutRows, $availabilityFor) {
            $month = $trendToday->copy()->subMonths($monthsAgo)->endOfMonth();
            $balances = $inventoryRecords->map(function (Inventory $inventory) use ($month, $trendStockInRows, $trendStockOutRows) {
                $stockedInAfter = $trendStockInRows->filter(fn ($row) => (int) $row->product_id === $inventory->product_id
                    && (int) $row->warehouse_id === $inventory->warehouse_id
                    && Carbon::parse($row->stocked_in_at)->setTimezone(self::BUSINESS_TIMEZONE)->gt($month))->sum('quantity');
                $stockedOutAfter = $trendStockOutRows->filter(fn ($row) => (int) $row->product_id === $inventory->product_id
                    && (int) $row->warehouse_id === $inventory->warehouse_id
                    && $row->created_at->copy()->setTimezone(self::BUSINESS_TIMEZONE)->gt($month))->sum('quantity');

                return [
                    'product_id' => $inventory->product_id,
                    'balance' => max(0, (int) $inventory->available_stock - $stockedInAfter + $stockedOutAfter),
                ];
            });
            $units = (int) $balances->sum('balance');

            return ['month' => $month->format('M'), 'stock' => $units, 'availability' => $availabilityFor($balances)];
        })->push([
            'month' => $trendToday->format('M'),
            'stock' => $currentUnits,
            'availability' => $availabilityFor($inventoryRecords->map(fn (Inventory $inventory) => [
                'product_id' => $inventory->product_id,
                'balance' => (int) $inventory->available_stock,
            ])),
        ]);

        $activityToday = now(self::BUSINESS_TIMEZONE);
        $weekStart = $activityToday->copy()->startOfWeek(Carbon::MONDAY)->startOfDay();
        $stockMovement = collect(range(0, 6))->map(function (int $offset) use ($weekStart, $allStockInRows, $allStockOutRows) {
            $date = $weekStart->copy()->addDays($offset);
            return [
                'day' => $date->format('D'),
                'in' => $allStockInRows->filter(fn ($row) => Carbon::parse($row->stocked_in_at)
                    ->setTimezone(self::BUSINESS_TIMEZONE)->isSameDay($date))->sum('quantity'),
                'out' => $allStockOutRows->filter(fn ($row) => $row->created_at->copy()
                    ->setTimezone(self::BUSINESS_TIMEZONE)->isSameDay($date))->sum('quantity'),
            ];
        });

        $monthlyActivity = collect(range(5, 1))->map(function (int $monthsAgo) use ($activityToday, $allStockInRows, $allStockOutRows) {
            $month = $activityToday->copy()->subMonths($monthsAgo);
            return [
                'month' => $month->format('M'),
                'receiving' => $allStockInRows->filter(fn ($row) => Carbon::parse($row->stocked_in_at)
                    ->setTimezone(self::BUSINESS_TIMEZONE)->isSameMonth($month))->sum('quantity'),
                'release' => $allStockOutRows->filter(fn ($row) => $row->created_at->copy()
                    ->setTimezone(self::BUSINESS_TIMEZONE)->isSameMonth($month))->sum('quantity'),
                'transfers' => 0,
            ];
        })->push([
            'month' => $activityToday->format('M'),
            'receiving' => $allStockInRows->filter(fn ($row) => Carbon::parse($row->stocked_in_at)
                ->setTimezone(self::BUSINESS_TIMEZONE)->isSameMonth($activityToday))->sum('quantity'),
            'release' => $allStockOutRows->filter(fn ($row) => $row->created_at->copy()
                ->setTimezone(self::BUSINESS_TIMEZONE)->isSameMonth($activityToday))->sum('quantity'),
            'transfers' => 0,
        ]);

        $lowStock = Inventory::query()
            ->join('products', 'products.id', '=', 'inventories.product_id')
            ->where('inventories.available_stock', '<=', self::REORDER_LEVEL)
            ->orderBy('inventories.available_stock')->limit(5)
            ->get(['inventories.id', 'inventories.barcode', 'inventories.available_stock', 'products.name'])
            ->map(fn ($item) => [
                'id' => (string) $item->id, 'name' => $item->name, 'sku' => $item->barcode,
                'currentStock' => (int) $item->available_stock, 'reorderLevel' => self::REORDER_LEVEL,
                'status' => (int) $item->available_stock === 0 ? 'critical' : ((int) $item->available_stock <= 10 ? 'low' : 'warning'),
            ]);

        $stockInTransactions = $allStockInRows->map(fn ($row) => [
            'id' => 'IN-'.$row->id, 'reference' => 'STOCK-IN-'.$row->id, 'type' => 'Approved',
            'product' => $row->product_name, 'qty' => $row->quantity, 'user' => 'Stock In',
            'occurred_at' => Carbon::parse($row->stocked_in_at),
        ]);
        $stockOutTransactions = $allStockOutRows->map(fn ($row) => [
            'id' => 'OUT-'.$row->id, 'reference' => $row->reference_no, 'type' => 'Info',
            'product' => $row->product?->name ?? 'Unknown product', 'qty' => -(int) $row->quantity,
            'user' => $row->performer?->name ?? 'System', 'occurred_at' => $row->created_at,
        ]);
        $allTransactions = $stockInTransactions->concat($stockOutTransactions)->sortByDesc('occurred_at')->values()
            ->map(fn ($row) => array_merge($row, ['time' => $row['occurred_at']->diffForHumans()]))
            ->map(fn ($row) => collect($row)->except('occurred_at')->all());
        $recentTransactions = $allTransactions->take(8)->values();

        $supplierPerformance = Supplier::query()->where('status', 'ACTIVE')->orderBy('name')->limit(5)->get()
            ->map(function (Supplier $supplier) {
                $orders = PurchaseOrder::query()->where('supplier_name', $supplier->name)->count();
                $deliveries = Receiving::query()->where('supplier', $supplier->name)->count();
                $onTime = Receiving::query()->where('receivings.supplier', $supplier->name)
                    ->join('purchase_orders', 'purchase_orders.po_number', '=', 'receivings.purchase_order')
                    ->whereColumn('receivings.delivery_date', '<=', 'purchase_orders.expected_delivery_date')->count();
                $quality = Receiving::query()->where('receivings.supplier', $supplier->name)
                    ->join('receiving_items', 'receiving_items.receiving_id', '=', 'receivings.id')
                    ->join('qa_inspection_items', 'qa_inspection_items.receiving_item_id', '=', 'receiving_items.id')
                    ->selectRaw('COALESCE(100.0 * SUM(qa_inspection_items.accepted_quantity) / NULLIF(SUM(qa_inspection_items.accepted_quantity + qa_inspection_items.rejected_quantity), 0), 0) as score')
                    ->value('score');
                return [
                    'id' => (string) $supplier->id, 'name' => $supplier->name, 'orders' => $orders,
                    'onTime' => $deliveries > 0 ? (int) round(100 * $onTime / $deliveries) : 0,
                    'quality' => (int) round((float) $quality),
                ];
            });

        $forecastProducts = $lowStock->take(4)->map(function (array $item) use ($stockOutRows) {
            $recentDemand = $stockOutRows->filter(fn ($row) => $row->inventory_id === (int) $item['id'] && $row->created_at->gte(now()->subDays(30)))->sum('quantity');
            return [
                'id' => $item['id'], 'name' => $item['name'], 'demand' => (int) round($recentDemand * 1.05),
                'reorder' => max(0, self::REORDER_LEVEL - $item['currentStock']), 'confidence' => 75,
            ];
        })->values();

        return response()->json(['data' => [
            'metrics' => [
                'total_products' => Product::query()->count(),
                'total_categories' => Product::query()->whereNotNull('category')->where('category', '<>', '')->distinct('category')->count('category'),
                'stock_value' => round($currentValue, 2),
                'low_stock_items' => Inventory::query()->where('available_stock', '<=', self::REORDER_LEVEL)->count(),
                'out_of_stock' => Inventory::query()->where('available_stock', 0)->count(),
                'todays_stock_in' => $stockInRows->filter(fn ($row) => Carbon::parse($row->stocked_in_at)->isToday())->sum('quantity'),
                'todays_stock_out' => $stockOutRows->filter(fn ($row) => $row->created_at->isToday())->sum('quantity'),
            ],
            'inventory_trend' => $inventoryTrend,
            'stock_movement' => $stockMovement,
            'monthly_inventory_activity' => $monthlyActivity,
            'low_stock_summary' => $lowStock,
            'recent_transactions' => $recentTransactions,
            'all_transactions' => $allTransactions,
            'supplier_performance' => $supplierPerformance,
            'ai_forecast_summary' => [
                'headline' => 'Placeholder forecast based on the last 30 days of stock-out demand.',
                'products' => $forecastProducts,
                'source' => 'placeholder_5_percent_trend',
            ],
        ]]);
    }
}
