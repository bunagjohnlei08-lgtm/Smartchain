<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\Order;
use App\Models\PurchaseOrder;
use App\Models\ReceivingItem;
use App\Models\StockOutTransaction;
use App\Models\Supplier;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    private const LOW_STOCK_THRESHOLD = 20;

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);

        $start = now()->subDays(6)->startOfDay();
        $end = now()->endOfDay();

        $stockIn = ReceivingItem::query()
            ->leftJoin('qa_inspection_items', 'qa_inspection_items.receiving_item_id', '=', 'receiving_items.id')
            ->whereNotNull('receiving_items.stocked_in_at')
            ->whereBetween('receiving_items.stocked_in_at', [$start, $end])
            ->get([
                'receiving_items.stocked_in_at',
                'receiving_items.delivered_quantity',
                'qa_inspection_items.accepted_quantity',
            ])
            ->groupBy(fn ($item) => Carbon::parse($item->stocked_in_at)->toDateString())
            ->map(fn ($items) => $items->sum(fn ($item) => (int) ($item->accepted_quantity ?? $item->delivered_quantity)));

        $stockOut = StockOutTransaction::query()
            ->whereBetween('created_at', [$start, $end])
            ->get(['created_at', 'quantity'])
            ->groupBy(fn (StockOutTransaction $transaction) => $transaction->created_at->toDateString())
            ->map(fn ($transactions) => $transactions->sum('quantity'));

        $movement = collect(range(0, 6))->map(function (int $offset) use ($start, $stockIn, $stockOut) {
            $date = $start->copy()->addDays($offset);
            $key = $date->toDateString();
            return [
                'date' => $key,
                'day' => $date->format('D'),
                'stock_in' => (int) ($stockIn[$key] ?? 0),
                'stock_out' => (int) ($stockOut[$key] ?? 0),
            ];
        });

        $inventoryStatus = Inventory::query()
            ->join('products', 'products.id', '=', 'inventories.product_id')
            ->select([
                'inventories.id',
                'inventories.available_stock',
                'products.name as product_name',
                'products.category as product_category',
            ])
            ->orderBy('inventories.available_stock')
            ->limit(5)
            ->get()
            ->map(function ($inventory) {
                $stock = (int) $inventory->available_stock;
                $status = $stock <= 0 ? 'Out of Stock' : ($stock <= 10 ? 'Critical' : ($stock <= self::LOW_STOCK_THRESHOLD ? 'Low Stock' : 'Healthy'));
                return [
                    'id' => $inventory->id,
                    'product' => $inventory->product_name,
                    'category' => $inventory->product_category ?? 'Uncategorized',
                    'stock' => $stock,
                    'status' => $status,
                ];
            });

        $recentPurchaseOrders = PurchaseOrder::query()
            ->latest()
            ->limit(5)
            ->get(['id', 'po_number', 'supplier_name', 'total_amount', 'status', 'created_at'])
            ->map(fn (PurchaseOrder $order) => [
                'id' => $order->id,
                'po_number' => $order->po_number,
                'supplier_name' => $order->supplier_name,
                'total_amount' => (float) $order->total_amount,
                'status' => $order->status,
                'created_at' => $order->created_at?->toDateString(),
            ]);

        $forecast = $movement->map(fn (array $day) => [
            'date' => $day['date'],
            'day' => $day['day'],
            'actual' => $day['stock_out'],
            'projected' => (int) round($day['stock_out'] * 1.05),
            'source' => 'placeholder_5_percent_trend',
        ]);

        return response()->json([
            'data' => [
                'metrics' => [
                    'warehouse_utilization' => 68,
                    'open_purchase_orders' => PurchaseOrder::query()->whereNotIn('status', ['Completed', 'Cancelled'])->count(),
                    'shipments_in_transit' => Order::query()->where('status', 'IN_TRANSIT')->count(),
                    'low_stock_items' => Inventory::query()->where('available_stock', '<=', self::LOW_STOCK_THRESHOLD)->count(),
                    'low_stock_threshold' => self::LOW_STOCK_THRESHOLD,
                    'stock_in' => (int) ReceivingItem::query()
                        ->leftJoin('qa_inspection_items', 'qa_inspection_items.receiving_item_id', '=', 'receiving_items.id')
                        ->whereNotNull('receiving_items.stocked_in_at')
                        ->selectRaw('COALESCE(SUM(COALESCE(qa_inspection_items.accepted_quantity, receiving_items.delivered_quantity)), 0) as total')
                        ->value('total'),
                    'stock_out' => (int) StockOutTransaction::query()->sum('quantity'),
                    'orders' => Order::query()->count(),
                    'active_suppliers' => Supplier::query()->where('status', 'ACTIVE')->count(),
                ],
                'recent_purchase_orders' => $recentPurchaseOrders,
                'inventory_status' => $inventoryStatus,
                'inventory_movement' => $movement,
                'ai_forecast' => $forecast,
                'generated_at' => Carbon::now()->toIso8601String(),
            ],
        ]);
    }
}
