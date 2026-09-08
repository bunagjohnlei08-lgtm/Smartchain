<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\ReceivingTimeline;
use App\Models\Warehouse;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class StockInController extends Controller
{
    /**
     * The Receiving/ReceivingItem schema does not yet carry a warehouse
     * assignment. Until that is added upstream, stock-in posts to the
     * primary warehouse so inventory can still be kept accurate.
     */
    private function resolveDefaultWarehouse(): ?Warehouse
    {
        return Warehouse::where('code', 'WH-MAIN')->first() ?? Warehouse::orderBy('id')->first();
    }

    private function resolveStockableQuantity(ReceivingItem $item): int
    {
        $inspectionItem = $item->qaInspectionItem;
        if (! $inspectionItem?->inspection?->completed_at || $item->stocked_in_at) {
            return 0;
        }

        $acceptedQuantity = (int) $inspectionItem->accepted_quantity;

        return match ($item->inspection_status) {
            'Passed', 'Partial' => $acceptedQuantity,
            default => 0,
        };
    }

    private function resolveStockedQuantity(ReceivingItem $item): int
    {
        return (int) ($item->qaInspectionItem?->accepted_quantity ?? $item->delivered_quantity);
    }

    private function findInventoryRecord(ReceivingItem $item): ?Inventory
    {
        if (! $item->warehouse_id) {
            return null;
        }

        return Inventory::where('product_id', $item->product_id)
            ->where('warehouse_id', $item->warehouse_id)
            ->first();
    }

    private function resolveEligibilityMessage(Receiving $receiving, Collection $items): string
    {
        if ($receiving->status === 'Rejected') {
            return 'Rejected QA items cannot be stocked in.';
        }

        if ($receiving->status === 'Pending QA') {
            return 'QA approval is required before Stock In.';
        }

        if ($items->every(fn (ReceivingItem $item) => $item->stocked_in_at !== null)) {
            return 'This receiving has already been stocked in.';
        }

        if ($items->contains(fn (ReceivingItem $item) => $item->inspection_status === 'Partial' && $this->resolveStockableQuantity($item) > 0)) {
            return 'Only the QA-accepted quantity is eligible for Stock In.';
        }

        if ($items->contains(fn (ReceivingItem $item) => $this->resolveStockableQuantity($item) > 0)) {
            return 'QA-approved items are ready for Stock In.';
        }

        return 'QA approval is required before Stock In.';
    }

    private function present(Receiving $receiving): array
    {
        $receiving->loadMissing(['items.product', 'items.warehouse', 'items.qaInspectionItem.inspection', 'timeline', 'preparedBy']);

        $items = $receiving->items;
        $productSummary = match (true) {
            $items->isEmpty() => '—',
            $items->count() === 1 => $items->first()->product_name,
            default => $items->first()->product_name.' +'.($items->count() - 1).' more',
        };

        $pendingStockInItems = $items->filter(fn (ReceivingItem $item) => $this->resolveStockableQuantity($item) > 0);

        $stockInStatus = match (true) {
            $receiving->status === 'Rejected' => 'Rejected',
            $pendingStockInItems->isEmpty() && $items->contains(fn (ReceivingItem $item) => $item->stocked_in_at !== null) => 'Completed',
            $pendingStockInItems->isEmpty() => 'Pending QA',
            default => 'Ready for Stock In',
        };

        $receivedValue = $items->sum(
            fn (ReceivingItem $item) => $this->resolveStockedQuantity($item) * (float) ($item->product?->cost_price ?? 0)
        );

        $latestStockedInAt = $items->pluck('stocked_in_at')->filter()->sort()->last();

        return [
            'id' => $receiving->id,
            'receiving_no' => $receiving->receiving_no,
            'purchase_order' => $receiving->purchase_order,
            'supplier' => $receiving->supplier,
            'ref_no' => $receiving->reference_no,
            'delivery_date' => $receiving->delivery_date?->toDateString(),
            'qa_status' => $receiving->status,
            'stock_in_status' => $stockInStatus,
            'prepared_by' => $receiving->preparedBy?->name,
            'product_summary' => $productSummary,
            'items_count' => $items->count(),
            'total_quantity' => $items->sum('delivered_quantity'),
            'eligible_items_count' => $pendingStockInItems->count(),
            'eligible_quantity' => $pendingStockInItems->sum(fn (ReceivingItem $item) => $this->resolveStockableQuantity($item)),
            'eligibility_message' => $this->resolveEligibilityMessage($receiving, $items),
            'received_value' => round($receivedValue, 2),
            'items' => $items->map(function (ReceivingItem $item) {
                $inventory = $this->findInventoryRecord($item);

                return [
                    'id' => $item->id,
                    'product_id' => $item->product_id,
                    'product_name' => $item->product_name,
                    'delivered_quantity' => $item->delivered_quantity,
                    'accepted_quantity' => (int) ($item->qaInspectionItem?->accepted_quantity ?? 0),
                    'stockable_quantity' => $this->resolveStockableQuantity($item),
                    'stocked_quantity' => $item->stocked_in_at ? $this->resolveStockedQuantity($item) : 0,
                    'unit' => $item->unit,
                    'inspection_status' => $item->inspection_status,
                    'warehouse' => $item->warehouse?->name,
                    'stocked_in_at' => $item->stocked_in_at,
                    'barcode' => $inventory?->barcode,
                ];
            })->values(),
            'timeline' => $receiving->timeline->map(fn ($event) => [
                'status' => $event->status,
                'performed_by' => $event->performed_by,
                'occurred_at' => $event->occurred_at,
            ])->values(),
            'stocked_in_at' => $latestStockedInAt,
            'created_at' => $receiving->created_at,
            'updated_at' => $receiving->updated_at,
        ];
    }

    public function index(Request $request)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        $query = Receiving::query()->with(['items.product', 'items.warehouse', 'items.qaInspectionItem.inspection', 'timeline', 'preparedBy']);

        if ($request->filled('qa_status')) {
            $query->where('status', $request->qa_status);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('receiving_no', 'like', "%{$search}%")
                    ->orWhere('supplier', 'like', "%{$search}%")
                    ->orWhere('reference_no', 'like', "%{$search}%");
            });
        }

        $items = $query->orderByDesc('created_at')
            ->get()
            ->map(fn (Receiving $receiving) => $this->present($receiving))
            ->filter(fn (array $receiving) => $receiving['stock_in_status'] !== 'Completed')
            ->values();

        return response()->json(['data' => $items]);
    }

    public function show(Request $request, $id)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        $receiving = Receiving::with(['items.product', 'items.warehouse', 'items.qaInspectionItem.inspection', 'timeline', 'preparedBy'])->findOrFail($id);

        return response()->json($this->present($receiving));
    }

    private function generateUniqueBarcode(): string
    {
        do {
            $barcode = (string) random_int(2000000000000, 2999999999999);
        } while (Inventory::where('barcode', $barcode)->exists());

        return $barcode;
    }

    public function performStockIn(Request $request, $id)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        try {
            $receiving = DB::transaction(function () use ($id, $request) {
                $receiving = Receiving::query()
                    ->with(['items.qaInspectionItem.inspection'])
                    ->lockForUpdate()
                    ->findOrFail($id);

                $eligibleItems = $receiving->items
                    ->filter(fn (ReceivingItem $item) => $this->resolveStockableQuantity($item) > 0)
                    ->values();

                if ($eligibleItems->isEmpty()) {
                    abort(422, 'This receiving has no QA-approved quantity awaiting stock in.');
                }

                $warehouse = $this->resolveDefaultWarehouse();
                if (! $warehouse) {
                    abort(422, 'No warehouse is configured to receive stock.');
                }
                // Serialize creation/update of inventory rows in this warehouse,
                // including the case where the product row does not exist yet.
                $warehouse = Warehouse::query()->lockForUpdate()->findOrFail($warehouse->id);

                $incomingQuantity = (int) $eligibleItems->sum(
                    fn (ReceivingItem $item) => $this->resolveStockableQuantity($item)
                );
                $utilizedCapacity = (int) Inventory::query()
                    ->where('warehouse_id', $warehouse->id)
                    ->sum(DB::raw('available_stock + reserved_stock'));
                $availableCapacity = $warehouse->capacity === null
                    ? null
                    : max(0, (int) $warehouse->capacity - $utilizedCapacity);

                if ($availableCapacity !== null && $incomingQuantity > $availableCapacity) {
                    throw new HttpResponseException(response()->json([
                        'message' => 'Cannot stock in: Quantity exceeds maximum warehouse capacity.',
                        'available_capacity' => $availableCapacity,
                        'requested_quantity' => $incomingQuantity,
                    ], 422));
                }

                foreach ($eligibleItems as $item) {
                    $stockQuantity = $this->resolveStockableQuantity($item);

                    $inventory = Inventory::where('product_id', $item->product_id)
                        ->where('warehouse_id', $warehouse->id)
                        ->lockForUpdate()
                        ->first();

                    if ($inventory) {
                        $inventory->available_stock += $stockQuantity;
                        if ($inventory->status === 'Out of Stock' && $inventory->available_stock > 0) {
                            $inventory->status = 'Available';
                        }
                        $inventory->pending_receiving = false;
                        $inventory->save();
                    } else {
                        $inventory = Inventory::create([
                            'barcode' => $this->generateUniqueBarcode(),
                            'product_id' => $item->product_id,
                            'warehouse_id' => $warehouse->id,
                            'available_stock' => $stockQuantity,
                            'reserved_stock' => 0,
                            'backload' => 0,
                            'status' => 'Available',
                            'pending_receiving' => false,
                        ]);
                    }

                    $item->warehouse_id = $warehouse->id;
                    $item->stocked_in_at = now();
                    $item->save();
                }

                ReceivingTimeline::firstOrCreate(
                    ['receiving_id' => $receiving->id, 'status' => 'Stock In Completed'],
                    ['performed_by' => $request->user()->name, 'occurred_at' => now()]
                );

                return $receiving->fresh(['items.product', 'items.warehouse', 'items.qaInspectionItem.inspection', 'timeline', 'preparedBy']);
            });
        } catch (Throwable $e) {
            if ($e instanceof ModelNotFoundException) {
                return response()->json(['message' => 'Receiving not found.'], 404);
            }

            if ($e instanceof HttpResponseException) {
                return $e->getResponse();
            }

            if ($e instanceof HttpExceptionInterface) {
                return response()->json(['message' => $e->getMessage()], $e->getStatusCode());
            }

            Log::error('Stock In transaction failed', ['receiving_id' => $id, 'error' => $e->getMessage()]);

            return response()->json(['message' => 'Stock In failed due to a server error. Please try again.'], 500);
        }

        return response()->json($this->present($receiving));
    }

    public function recentStockedIn(Request $request)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        $items = ReceivingItem::query()
            ->with(['receiving', 'warehouse', 'qaInspectionItem.inspection'])
            ->whereNotNull('stocked_in_at')
            ->orderByDesc('stocked_in_at')
            ->get()
            ->map(function (ReceivingItem $item) {
                $inventory = $this->findInventoryRecord($item);

                return [
                    'id' => $item->id,
                    'receiving_id' => $item->receiving_id,
                    'receiving_no' => $item->receiving?->receiving_no,
                    'barcode' => $inventory?->barcode,
                    'product' => $item->product_name,
                    'warehouse' => $item->warehouse?->name ?? '—',
                    'quantity' => $this->resolveStockedQuantity($item),
                    'stock_in_date' => $item->stocked_in_at?->toISOString(),
                    'status' => 'Stocked In',
                ];
            })
            ->take(5)
            ->values();

        return response()->json(['data' => $items]);
    }

    public function history(Request $request)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        $items = ReceivingItem::query()
            ->with(['receiving', 'warehouse', 'qaInspectionItem.inspection'])
            ->whereNotNull('stocked_in_at')
            ->orderByDesc('stocked_in_at')
            ->get()
            ->map(function (ReceivingItem $item) {
                $inventory = $this->findInventoryRecord($item);

                return [
                    'id' => $item->id,
                    'receiving_id' => $item->receiving_id,
                    'receiving_no' => $item->receiving?->receiving_no,
                    'product' => $item->product_name,
                    'supplier' => $item->receiving?->supplier,
                    'receiving_date' => $item->receiving?->delivery_date?->toDateString(),
                    'reference_no' => $item->receiving?->reference_no,
                    'stocked_quantity' => $this->resolveStockedQuantity($item),
                    'barcode' => $inventory?->barcode,
                    'stock_in_date' => $item->stocked_in_at?->toISOString(),
                    'status' => 'Completed',
                ];
            })
            ->values();

        return response()->json(['data' => $items]);
    }
}
