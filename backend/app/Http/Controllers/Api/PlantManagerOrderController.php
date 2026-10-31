<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Inventory;
use App\Support\WarehouseCapacity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PlantManagerOrderController extends Controller
{
    private const VISIBLE_STATUSES = [
        'ASSIGNED', 'PREPARING', 'READY_FOR_STOCK_OUT',
        'STOCK_OUT_COMPLETED', 'FOR_PACKING', 'PACKING', 'READY_FOR_SHIPMENT',
        'FORWARDED_TO_LOGISTICS', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED',
    ];

    public function index(Request $request): JsonResponse
    {
        $user = $this->plantManager($request);
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', Rule::in(self::VISIBLE_STATUSES)],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'priority' => ['nullable', Rule::in(['HIGH', 'MEDIUM', 'LOW'])],
            'sort_by' => ['nullable', Rule::in(['order_no', 'customer_name', 'assigned_at', 'required_delivery_date', 'total_amount', 'status'])],
            'sort_direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = $this->assignedOrders($user->id)
            ->with([
                'items:id,order_id,product_id,product_name,quantity,unit',
                'items.product:id,name,unit',
                'items.product.inventories:id,product_id,warehouse_id,available_stock,reserved_stock,status,pending_receiving',
                'items.stockOutTransactions:id,order_item_id,quantity',
                'assignee:id,name,employee_id,warehouse_id',
                'assignee.warehouse:id,name,code',
            ])
            ->withCount('items');

        if (!empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function (Builder $query) use ($search) {
                $query->where('order_no', 'like', "%{$search}%")
                    ->orWhere('reference_no', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%")
                    ->orWhereHas('items', fn (Builder $items) => $items->where('product_name', 'like', "%{$search}%"));
            });
        }
        if (!empty($validated['status'])) $query->where('status', $validated['status']);
        if (!empty($validated['warehouse_id'])) {
            $query->whereHas('assignee', fn (Builder $assignee) => $assignee->where('warehouse_id', $validated['warehouse_id']));
        }
        if (!empty($validated['priority'])) $this->applyPriorityFilter($query, $validated['priority']);

        if (! empty($validated['sort_by'])) {
            $query->orderBy($validated['sort_by'], $validated['sort_direction'] ?? 'asc');
        } else {
            $query->orderByDesc('assigned_at');
        }

        $orders = $query
            ->orderByDesc('id')
            ->paginate($validated['per_page'] ?? 15)
            ->through(fn (Order $order) => $this->listData($order));

        return response()->json($orders);
    }

    public function summary(Request $request): JsonResponse
    {
        $user = $this->plantManager($request);
        $counts = $this->assignedOrders($user->id)
            ->selectRaw('status, COUNT(*) as aggregate')->groupBy('status')->pluck('aggregate', 'status');

        return response()->json([
            'assigned' => (int) ($counts['ASSIGNED'] ?? 0),
            'preparing' => (int) ($counts['PREPARING'] ?? 0),
            'readyForStockOut' => (int) ($counts['READY_FOR_STOCK_OUT'] ?? 0),
            'inTransit' => (int) ($counts['IN_TRANSIT'] ?? 0),
            'delivered' => (int) ($counts['DELIVERED'] ?? 0),
            'cancelled' => (int) ($counts['CANCELLED'] ?? 0),
        ]);
    }

    public function show(Request $request, int $order): JsonResponse
    {
        $user = $this->plantManager($request);
        $record = $this->assignedOrders($user->id)
            ->with([
                'items.product:id,name,unit',
                'items.product.inventories:id,product_id,warehouse_id,available_stock,reserved_stock,status,pending_receiving',
                'items.stockOutTransactions:id,order_item_id,quantity',
                'assignee:id,name,employee_id,warehouse_id',
                'assignee.warehouse:id,name,code',
                'histories' => fn ($query) => $query->with('performer:id,name')->oldest(),
            ])->findOrFail($order);

        return response()->json($this->detailData($record));
    }

    public function startPreparing(Request $request, int $order): JsonResponse
    {
        return $this->transition($request, $order, 'ASSIGNED', 'PREPARING', 'PREPARATION_STARTED');
    }

    public function readyForStockOut(Request $request, int $order): JsonResponse
    {
        return $this->transition($request, $order, 'PREPARING', 'READY_FOR_STOCK_OUT', 'READY_FOR_STOCK_OUT');
    }

    private function transition(Request $request, int $orderId, string $from, string $to, string $action): JsonResponse
    {
        $user = $this->plantManager($request);

        $order = DB::transaction(function () use ($user, $orderId, $from, $to, $action) {
            $record = $this->assignedOrders($user->id)->lockForUpdate()->findOrFail($orderId);
            if ($record->status !== $from) {
                throw ValidationException::withMessages([
                    'status' => "Only {$from} orders can transition to {$to}.",
                ]);
            }
            if (!$record->items()->exists() || $record->items()->where('quantity', '<=', 0)->exists()) {
                throw ValidationException::withMessages([
                    'items' => 'The order must contain valid items before its preparation status can change.',
                ]);
            }
            if ($to === 'READY_FOR_STOCK_OUT') {
                $record->load('items.product');
                $invalidItem = $record->items->first(fn ($item) => !$item->product_id || !$item->product || $item->product->item_classification !== \App\Models\Product::FINISHED_PRODUCT);
                if ($invalidItem) {
                    throw ValidationException::withMessages([
                        'items' => "Order item {$invalidItem->id} does not have a valid product reference.",
                    ]);
                }
                $unitMismatch = $record->items->first(fn ($item) =>
                    WarehouseCapacity::normalizeUnit($item->unit) !== WarehouseCapacity::normalizeUnit($item->product->unit)
                );
                if ($unitMismatch) {
                    throw ValidationException::withMessages([
                        'items' => "Order item {$unitMismatch->id} uses {$unitMismatch->unit}, but its catalog product uses {$unitMismatch->product->unit}. Reconcile the order before Stock Out; units are not converted automatically.",
                    ]);
                }
                $warehouseId = $user->warehouse_id;
                if (!$warehouseId) throw ValidationException::withMessages(['warehouse' => 'A warehouse assignment is required before Stock Out.']);
                $missingInventory = $record->items->first(function ($item) use ($warehouseId) {
                    return !Inventory::query()->where('product_id', $item->product_id)->where('warehouse_id', $warehouseId)
                        ->whereNotNull('barcode')->where('barcode', '<>', '')->where('pending_receiving', false)
                        ->where('status', '<>', 'Out of Stock')
                        ->whereRaw('available_stock >= CAST(? AS NUMERIC)', [$item->quantity])
                        ->exists();
                });
                if ($missingInventory) throw ValidationException::withMessages([
                    'items' => "Order item {$missingInventory->id} has no usable inventory with sufficient stock in your assigned warehouse.",
                ]);
            }

            $record->update(['status' => $to]);
            $record->histories()->create([
                'previous_status' => $from,
                'new_status' => $to,
                'action' => $action,
                'performed_by' => $user->id,
            ]);

            return $record;
        });

        $order->load([
            'items.product:id,name,unit',
            'items.product.inventories:id,product_id,warehouse_id,available_stock,reserved_stock,status,pending_receiving',
            'items.stockOutTransactions:id,order_item_id,quantity',
            'assignee:id,name,employee_id,warehouse_id',
            'assignee.warehouse:id,name,code', 'histories.performer:id,name',
        ]);

        return response()->json($this->detailData($order));
    }

    private function plantManager(Request $request)
    {
        $user = $request->user();
        abort_unless($user?->isPlantManager(), 403, 'Plant Manager access is required.');
        return $user;
    }

    private function assignedOrders(int $userId): Builder
    {
        return Order::query()->where('assigned_to', $userId)->whereIn('status', self::VISIBLE_STATUSES);
    }

    private function applyPriorityFilter(Builder $query, string $priority): void
    {
        $highCutoff = now()->addDays(3);
        $mediumCutoff = now()->addDays(7);
        match ($priority) {
            'HIGH' => $query->where('required_delivery_date', '<=', $highCutoff),
            'MEDIUM' => $query->where('required_delivery_date', '>', $highCutoff)->where('required_delivery_date', '<=', $mediumCutoff),
            'LOW' => $query->where('required_delivery_date', '>', $mediumCutoff),
        };
    }

    private function priority(Order $order): string
    {
        $days = now()->diffInDays($order->required_delivery_date, false);
        return $days <= 3 ? 'HIGH' : ($days <= 7 ? 'MEDIUM' : 'LOW');
    }

    private function workflowProgress(string $status): int
    {
        return match ($status) {
            'ASSIGNED' => 0,
            'PREPARING' => 50,
            'READY_FOR_STOCK_OUT', 'STOCK_OUT_COMPLETED', 'FOR_PACKING', 'PACKING', 'READY_FOR_SHIPMENT',
            'FORWARDED_TO_LOGISTICS', 'IN_TRANSIT', 'DELIVERED' => 100,
            default => 0,
        };
    }

    private function listData(Order $order): array
    {
        $warehouseId = $order->assignee?->warehouse_id;
        return [
            'id' => $order->id,
            'order_no' => $order->order_no,
            'reference_no' => $order->reference_no,
            'customer_name' => $order->customer_name,
            'customer_address' => $order->customer_address,
            'order_date' => $order->order_date,
            'assigned_at' => $order->assigned_at,
            'required_delivery_date' => $order->required_delivery_date,
            'warehouse' => $order->assignee?->warehouse?->only(['id', 'name', 'code']),
            'priority' => $this->priority($order),
            'status' => $order->status,
            'items_count' => $order->items_count,
            'items' => $order->items->map(fn ($item) => $this->itemAllocationData($item, $warehouseId))->values(),
            'total_amount' => $order->total_amount,
            'fulfillment_progress' => $this->workflowProgress($order->status),
            'allocation_status' => 'NOT_TRACKED',
        ];
    }

    private function detailData(Order $order): array
    {
        $warehouseId = $order->assignee?->warehouse_id;
        return array_merge($order->only([
            'id', 'order_no', 'reference_no', 'customer_name', 'customer_address', 'customer_contact',
            'order_date', 'required_delivery_date', 'assigned_at', 'total_amount', 'status', 'created_at', 'updated_at',
        ]), [
            'assigned_to' => $order->assignee?->only(['id', 'name', 'employee_id']),
            'warehouse' => $order->assignee?->warehouse?->only(['id', 'name', 'code']),
            'priority' => $this->priority($order),
            'fulfillment_progress' => $this->workflowProgress($order->status),
            'allocation_status' => 'NOT_TRACKED',
            'items' => $order->items->map(fn ($item) => [
                ...$this->itemAllocationData($item, $warehouseId),
                'picked_quantity' => null,
                'unit_price' => $item->unit_price,
                'subtotal' => $item->subtotal,
            ])->values(),
            'timeline' => $order->histories->map(fn ($history) => [
                'id' => $history->id,
                'action' => $history->action,
                'previous_status' => $history->previous_status,
                'new_status' => $history->new_status,
                'performed_by' => $history->performer?->only(['id', 'name']),
                'created_at' => $history->created_at,
            ])->values(),
        ]);
    }

    private function itemAllocationData($item, ?int $warehouseId): array
    {
        $product = $item->product;
        $catalogUnit = $product?->unit;
        $unitMismatch = filled($catalogUnit)
            && WarehouseCapacity::normalizeUnit($item->unit) !== WarehouseCapacity::normalizeUnit($catalogUnit);
        $inventory = $product?->inventories?->firstWhere('warehouse_id', $warehouseId);
        $released = (float) $item->stockOutTransactions->sum('quantity');
        $required = (float) $item->quantity;
        $remaining = max($required - $released, 0);
        $usable = $inventory && !$inventory->pending_receiving && $inventory->status !== 'Out of Stock';
        $available = $usable ? (float) $inventory->available_stock : 0;

        $allocationState = match (true) {
            !$item->product_id || !$product => 'ALLOCATION_BLOCKED',
            $unitMismatch => 'UNIT_MISMATCH',
            $remaining <= 0 => 'FULLY_ALLOCATED',
            $available <= 0 => 'OUT_OF_STOCK',
            $available < $remaining => 'INSUFFICIENT_STOCK',
            default => 'PENDING_ALLOCATION',
        };

        return [
            'id' => $item->id,
            'product_id' => $item->product_id,
            'product_name' => $product?->name ?? $item->product_name ?? 'Unnamed product',
            'product_reference_required' => !$item->product_id || !$product,
            'required_quantity' => $item->quantity,
            'allocated_quantity' => $released,
            'remaining_quantity' => $remaining,
            'available_quantity' => $available,
            'reserved_quantity' => (float) ($inventory?->reserved_stock ?? 0),
            'unit' => $item->unit,
            'catalog_unit' => $catalogUnit,
            'unit_mismatch' => $unitMismatch,
            'allocation_state' => $allocationState,
        ];
    }
}
