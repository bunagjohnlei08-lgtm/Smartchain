<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\ReceivingItem;
use App\Models\StockOutTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

class InventoryHistoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'type' => ['nullable', Rule::in(['STOCK_IN', 'STOCK_OUT'])],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $movements = $this->movements($validated);
        $perPage = $validated['per_page'] ?? 10;
        $page = LengthAwarePaginator::resolveCurrentPage();
        $paginator = new LengthAwarePaginator(
            $movements->forPage($page, $perPage)->values(),
            $movements->count(),
            $perPage,
            $page,
            ['path' => $request->url(), 'query' => $request->query()]
        );

        return response()->json($paginator);
    }

    public function recent(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $validated = $request->validate(['limit' => ['nullable', 'integer', 'min:1', 'max:10']]);

        return response()->json([
            'data' => $this->movements([])->take($validated['limit'] ?? 10)->values(),
        ]);
    }

    private function movements(array $filters): Collection
    {
        $movements = collect();

        if (($filters['type'] ?? null) !== 'STOCK_OUT') {
            $inventoryBarcodes = Inventory::query()
                ->get(['product_id', 'warehouse_id', 'barcode'])
                ->keyBy(fn (Inventory $inventory) => $inventory->product_id.':'.$inventory->warehouse_id);

            $stockIns = ReceivingItem::query()
                ->with(['warehouse:id,name', 'qaInspectionItem'])
                ->whereNotNull('stocked_in_at')
                ->get()
                ->map(function (ReceivingItem $item) use ($inventoryBarcodes) {
                    $inventory = $inventoryBarcodes->get($item->product_id.':'.$item->warehouse_id);

                    return [
                        'type' => 'STOCK_IN',
                        'product' => $item->product_name,
                        'barcode' => $inventory?->barcode,
                        'warehouse' => $item->warehouse?->name,
                        'warehouse_id' => $item->warehouse_id,
                        'quantity' => (int) ($item->qaInspectionItem?->accepted_quantity ?? $item->delivered_quantity),
                        'occurred_at' => $item->stocked_in_at?->toISOString(),
                    ];
                });
            $movements = $movements->concat($stockIns);
        }

        if (($filters['type'] ?? null) !== 'STOCK_IN') {
            $stockOuts = StockOutTransaction::query()
                ->with(['product:id,name', 'warehouse:id,name'])
                ->get()
                ->map(fn (StockOutTransaction $transaction) => [
                    'type' => 'STOCK_OUT',
                    'product' => $transaction->product?->name,
                    'barcode' => $transaction->barcode,
                    'warehouse' => $transaction->warehouse?->name,
                    'warehouse_id' => $transaction->warehouse_id,
                    'quantity' => $transaction->quantity,
                    'occurred_at' => $transaction->created_at?->toISOString(),
                ]);
            $movements = $movements->concat($stockOuts);
        }

        if (! empty($filters['warehouse_id'])) {
            $movements = $movements->where('warehouse_id', (int) $filters['warehouse_id']);
        }
        if (! empty($filters['date_from'])) {
            $movements = $movements->filter(fn (array $movement) => substr($movement['occurred_at'], 0, 10) >= $filters['date_from']);
        }
        if (! empty($filters['date_to'])) {
            $movements = $movements->filter(fn (array $movement) => substr($movement['occurred_at'], 0, 10) <= $filters['date_to']);
        }
        if (! empty($filters['search'])) {
            $search = mb_strtolower($filters['search']);
            $movements = $movements->filter(fn (array $movement) => collect([
                $movement['product'], $movement['barcode'], $movement['warehouse'],
            ])->filter()->contains(fn ($value) => str_contains(mb_strtolower((string) $value), $search)));
        }

        return $movements->sortByDesc('occurred_at')->values();
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Admin access is required.');
    }
}
