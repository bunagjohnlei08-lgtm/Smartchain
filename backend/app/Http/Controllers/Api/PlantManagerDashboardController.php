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

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->isPlantManager(), 403);

        $today = now();
        $historyStart = $today->copy()->subMonths(7)->startOfMonth();
        $stockInRows = ReceivingItem::query()
            ->leftJoin('qa_inspection_items', 'qa_inspection_items.receiving_item_id', '=', 'receiving_items.id')
            ->whereNotNull('receiving_items.stocked_in_at')
            ->where('receiving_items.stocked_in_at', '>=', $historyStart)
            ->get([
                'receiving_items.id', 'receiving_items.product_id', 'receiving_items.product_name',
                'receiving_items.stocked_in_at', 'receiving_items.delivered_quantity',
                'qa_inspection_items.accepted_quantity',
            ])
            ->map(function ($item) {
                $item->quantity = (int) ($item->accepted_quantity ?? $item->delivered_quantity);
                return $item;
            });
        $stockOutRows = StockOutTransaction::query()
            ->with(['product:id,name', 'performer:id,name'])
            ->where('created_at', '>=', $historyStart)
            ->get();

        $currentUnits = (int) Inventory::query()->sum('available_stock');
        $currentValue = (float) Inventory::query()
            ->join('products', 'products.id', '=', 'inventories.product_id')
            ->selectRaw('COALESCE(SUM(inventories.available_stock * products.cost_price), 0) as total')
            ->value('total');
        $averageUnitCost = $currentUnits > 0 ? $currentValue / $currentUnits : 0;

        $inventoryTrend = collect(range(6, 0))->map(function (int $monthsAgo) use ($today, $currentUnits, $averageUnitCost, $stockInRows, $stockOutRows) {
            $month = $today->copy()->subMonths($monthsAgo)->endOfMonth();
            $inAfter = $stockInRows->filter(fn ($row) => Carbon::parse($row->stocked_in_at)->gt($month))->sum('quantity');
            $outAfter = $stockOutRows->filter(fn ($row) => $row->created_at->gt($month))->sum('quantity');
            $units = max(0, $currentUnits - $inAfter + $outAfter);
            return ['month' => $month->format('M'), 'stock' => $units, 'value' => round(($units * $averageUnitCost) / 1000000, 2)];
        })->push(['month' => $today->format('M'), 'stock' => $currentUnits, 'value' => round($currentValue / 1000000, 2)]);

        $weekStart = $today->copy()->subDays(6)->startOfDay();
        $stockMovement = collect(range(0, 6))->map(function (int $offset) use ($weekStart, $stockInRows, $stockOutRows) {
            $date = $weekStart->copy()->addDays($offset);
            return [
                'day' => $date->format('D'),
                'in' => $stockInRows->filter(fn ($row) => Carbon::parse($row->stocked_in_at)->isSameDay($date))->sum('quantity'),
                'out' => $stockOutRows->filter(fn ($row) => $row->created_at->isSameDay($date))->sum('quantity'),
            ];
        });

        $monthlyActivity = collect(range(5, 0))->map(function (int $monthsAgo) use ($today, $stockInRows, $stockOutRows) {
            $month = $today->copy()->subMonths($monthsAgo);
            return [
                'month' => $month->format('M'),
                'receiving' => $stockInRows->filter(fn ($row) => Carbon::parse($row->stocked_in_at)->isSameMonth($month))->sum('quantity'),
                'release' => $stockOutRows->filter(fn ($row) => $row->created_at->isSameMonth($month))->sum('quantity'),
                'transfers' => 0,
            ];
        })->push([
            'month' => $today->format('M'),
            'receiving' => $stockInRows->filter(fn ($row) => Carbon::parse($row->stocked_in_at)->isSameMonth($today))->sum('quantity'),
            'release' => $stockOutRows->filter(fn ($row) => $row->created_at->isSameMonth($today))->sum('quantity'),
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

        $recentStockIn = $stockInRows->sortByDesc('stocked_in_at')->take(5)->map(fn ($row) => [
            'id' => 'IN-'.$row->id, 'reference' => 'STOCK-IN-'.$row->id, 'type' => 'Approved',
            'product' => $row->product_name, 'qty' => $row->quantity, 'user' => 'Stock In',
            'occurred_at' => Carbon::parse($row->stocked_in_at),
        ]);
        $recentStockOut = $stockOutRows->sortByDesc('created_at')->take(5)->map(fn ($row) => [
            'id' => 'OUT-'.$row->id, 'reference' => $row->reference_no, 'type' => 'Info',
            'product' => $row->product?->name ?? 'Unknown product', 'qty' => -(int) $row->quantity,
            'user' => $row->performer?->name ?? 'System', 'occurred_at' => $row->created_at,
        ]);
        $recentTransactions = $recentStockIn->concat($recentStockOut)->sortByDesc('occurred_at')->take(8)->values()
            ->map(fn ($row) => array_merge($row, ['time' => $row['occurred_at']->diffForHumans()]))
            ->map(fn ($row) => collect($row)->except('occurred_at')->all());

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
            'supplier_performance' => $supplierPerformance,
            'ai_forecast_summary' => [
                'headline' => 'Placeholder forecast based on the last 30 days of stock-out demand.',
                'products' => $forecastProducts,
                'source' => 'placeholder_5_percent_trend',
            ],
        ]]);
    }
}
