<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\StockOutTransaction;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class StockOutController extends Controller
{
    private const STATUSES = ['READY_FOR_STOCK_OUT', 'STOCK_OUT_IN_PROGRESS', 'READY_FOR_SHIPMENT'];

    public function index(Request $request): JsonResponse
    {
        $user = $this->plantManager($request);
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', Rule::in(self::STATUSES)],
            'priority' => ['nullable', Rule::in(['HIGH', 'MEDIUM', 'LOW'])],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'sort_by' => ['nullable', Rule::in(['order_no', 'customer_name', 'order_date', 'required_delivery_date', 'total_amount', 'status'])],
            'sort_direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = $this->ordersFor($user)
            ->with(['assignee:id,name,warehouse_id', 'assignee.warehouse:id,name,code'])
            ->withCount('items')
            ->withSum('items as total_units', 'quantity');

        if (!empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function (Builder $query) use ($search) {
                $query->where('order_no', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%")
                    ->orWhere('customer_address', 'like', "%{$search}%")
                    ->orWhereHas('items', fn(Builder $items) => $items->where('product_name', 'like', "%{$search}%"))
                    ->orWhereHas('items.product.inventories', fn(Builder $inventory) => $inventory->where('barcode', 'like', "%{$search}%"));
            });
        }
        if (!empty($validated['status'])) $query->where('status', $validated['status']);
        if (!empty($validated['warehouse_id'])) {
            $query->whereHas('assignee', fn(Builder $assignee) => $assignee->where('warehouse_id', $validated['warehouse_id']));
        }
        if (!empty($validated['date_from'])) $query->whereDate('order_date', '>=', $validated['date_from']);
        if (!empty($validated['date_to'])) $query->whereDate('order_date', '<=', $validated['date_to']);
        if (!empty($validated['priority'])) $this->applyPriority($query, $validated['priority']);

        $orders = $query
            ->orderBy($validated['sort_by'] ?? 'required_delivery_date', $validated['sort_direction'] ?? 'asc')
            ->paginate($validated['per_page'] ?? 15)
            ->through(fn(Order $order) => $this->listData($order));

        return response()->json($orders);
    }

    public function summary(Request $request): JsonResponse
    {
        $user = $this->plantManager($request);
        $orders = $this->ordersFor($user);
        $counts = (clone $orders)->selectRaw('status, COUNT(*) aggregate')->groupBy('status')->pluck('aggregate', 'status');
        $today = StockOutTransaction::query()
            ->whereHas('order', fn(Builder $query) => $query->where('assigned_to', $user->id))
            ->whereDate('stock_out_transactions.created_at', today());

        return response()->json([
            'orders_ready' => (int) ($counts['READY_FOR_STOCK_OUT'] ?? 0),
            'picking_today' => (clone $orders)->where('status', 'STOCK_OUT_IN_PROGRESS')
                ->whereHas('histories', fn(Builder $history) => $history->where('action', 'STOCK_OUT_STARTED')->whereDate('created_at', today()))->count(),
            'ready_for_shipment' => (int) ($counts['READY_FOR_SHIPMENT'] ?? 0),
            'waiting_logistics' => (int) ($counts['READY_FOR_SHIPMENT'] ?? 0),
            'released_today' => (clone $orders)->where('status', 'READY_FOR_SHIPMENT')
                ->whereHas('histories', fn(Builder $history) => $history->where('action', 'STOCK_OUT_COMPLETED')->whereDate('created_at', today()))->count(),
            'items_released' => (int) (clone $today)->sum('quantity'),
            'value_released' => round((float) (clone $today)->join('order_items', 'stock_out_transactions.order_item_id', '=', 'order_items.id')
                ->sum(DB::raw('stock_out_transactions.quantity * order_items.unit_price')), 2),
        ]);
    }

    public function show(Request $request, int $order): JsonResponse
    {
        $user = $this->plantManager($request);
        $record = $this->ordersFor($user)->findOrFail($order);

        return response()->json($this->detailData($record));
    }

    public function start(Request $request, int $order): JsonResponse
    {
        $user = $this->plantManager($request);
        $record = DB::transaction(function () use ($user, $order) {
            $record = $this->ordersFor($user)->lockForUpdate()->findOrFail($order);
            if ($record->status !== 'READY_FOR_STOCK_OUT') {
                throw ValidationException::withMessages(['status' => 'Order is not ready for stock out.']);
            }
            if (!$record->items()->exists()) {
                throw ValidationException::withMessages(['items' => 'The order must contain items before Stock Out can start.']);
            }
            $record->update(['status' => 'STOCK_OUT_IN_PROGRESS']);
            $record->histories()->create([
                'previous_status' => 'READY_FOR_STOCK_OUT',
                'new_status' => 'STOCK_OUT_IN_PROGRESS',
                'action' => 'STOCK_OUT_STARTED',
                'performed_by' => $user->id,
            ]);

            return $record;
        });

        return response()->json($this->detailData($record->fresh()));
    }

    public function scan(Request $request, int $order): JsonResponse
    {
        return $this->release($request, $order);
    }

    public function release(Request $request, int $order): JsonResponse
    {
        $user = $this->plantManager($request);
        $validated = $request->validate([
            'barcode' => ['required', 'string', 'max:100', 'regex:/^[A-Za-z0-9._-]+$/'],
            'idempotency_key' => ['nullable', 'uuid'],
        ]);

        $validated['idempotency_key'] ??= (string) Str::uuid();

        $result = DB::transaction(function () use ($user, $order, $validated) {
            $record = $this->ordersFor($user)->lockForUpdate()->findOrFail($order);
            $existing = StockOutTransaction::where('idempotency_key', $validated['idempotency_key'])->first();
            if ($existing) {
                if ($existing->order_id !== $record->id) {
                    throw ValidationException::withMessages(['idempotency_key' => 'This request key belongs to another order.']);
                }
                return $this->scanData($existing, $record, true);
            }
            if ($record->status === 'READY_FOR_STOCK_OUT') {
                if (!$record->items()->exists()) {
                    throw ValidationException::withMessages(['items' => 'The order must contain items before Stock Out can start.']);
                }
                $record->update(['status' => 'STOCK_OUT_IN_PROGRESS']);
                $record->histories()->create([
                    'previous_status' => 'READY_FOR_STOCK_OUT',
                    'new_status' => 'STOCK_OUT_IN_PROGRESS',
                    'action' => 'STOCK_OUT_STARTED',
                    'performed_by' => $user->id,
                ]);
            } elseif ($record->status !== 'STOCK_OUT_IN_PROGRESS') {
                throw ValidationException::withMessages(['status' => 'Order has already been completed.']);
            }

            $warehouseId = $user->warehouse_id;
            if (!$warehouseId) {
                throw ValidationException::withMessages(['warehouse' => 'The assigned Plant Manager has no warehouse.']);
            }

            [$inventory, $item, $released, $remaining] = $this->resolveBarcode(
                $record,
                $warehouseId,
                trim($validated['barcode']),
                true
            );
            $quantity = 1;
            if ($quantity > $remaining) {
                throw ValidationException::withMessages(['quantity' => 'Requested quantity exceeds remaining order quantity.']);
            }
            if ($quantity > $inventory->available_stock) {
                throw ValidationException::withMessages(['quantity' => 'Insufficient inventory.']);
            }

            $inventory->available_stock -= $quantity;
            if ($inventory->available_stock === 0) $inventory->status = 'Out of Stock';
            $inventory->save();

            $transaction = StockOutTransaction::create([
                'reference_no' => (string) Str::uuid(),
                'idempotency_key' => $validated['idempotency_key'],
                'order_id' => $record->id,
                'order_item_id' => $item->id,
                'inventory_id' => $inventory->id,
                'product_id' => $inventory->product_id,
                'warehouse_id' => $warehouseId,
                'barcode' => $inventory->barcode,
                'quantity' => $quantity,
                'unit' => $item->unit,
                'performed_by' => $user->id,
            ]);

            if ($this->allItemsReleased($record)) {
                $record->update(['status' => 'READY_FOR_SHIPMENT']);
                $record->histories()->create([
                    'previous_status' => 'STOCK_OUT_IN_PROGRESS',
                    'new_status' => 'READY_FOR_SHIPMENT',
                    'action' => 'STOCK_OUT_COMPLETED',
                    'performed_by' => $user->id,
                ]);
            }

            return $this->scanData($transaction, $record->fresh(), false);
        }, 3);

        return response()->json($result);
    }

    public function submitToShipment(Request $request, int $order): JsonResponse
    {
        $user = $this->plantManager($request);
        $record = DB::transaction(function () use ($user, $order) {
            $record = $this->ordersFor($user)->lockForUpdate()->findOrFail($order);
            if ($record->status !== 'READY_FOR_SHIPMENT') {
                throw ValidationException::withMessages(['status' => 'Complete Stock Out before submitting this order to Shipment.']);
            }
            if (!$this->allItemsReleased($record)) {
                throw ValidationException::withMessages(['items' => 'All required order items must be stocked out before shipment submission.']);
            }

            $record->histories()->create([
                'previous_status' => 'READY_FOR_SHIPMENT',
                'new_status' => 'READY_FOR_SHIPMENT',
                'action' => 'SUBMITTED_TO_SHIPMENT',
                'performed_by' => $user->id,
            ]);

            return $record;
        });

        return response()->json(['id' => $record->id, 'status' => $record->status]);
    }

    private function assertOrderReady(Order $order, ?int $warehouseId): void
    {
        $errors = [];
        if (!$warehouseId) {
            $errors[] = ['order_item_id' => null, 'product_name' => null, 'reason' => 'The Plant Manager has no assigned warehouse.', 'expected_reference' => 'users.warehouse_id'];
        }

        $order->loadMissing('items.product');
        foreach ($order->items as $item) {
            $reason = null;
            $expected = 'inventories.barcode -> inventory product';
            if ($warehouseId) {
                $inventory = $this->inventoryForItem($item, $warehouseId);
                if (!$inventory) $reason = 'No inventory exists for this product in the assigned warehouse.';
                elseif (!trim((string) $inventory->barcode)) $reason = 'Inventory has no valid barcode.';
                elseif ($inventory->pending_receiving || $inventory->status === 'Out of Stock') $reason = 'Inventory is not usable for Stock Out.';
                elseif ($inventory->available_stock < (float) $item->quantity) $reason = 'Available inventory is insufficient for the ordered quantity.';
            }
            if ($reason) {
                $errors[] = ['order_item_id' => $item->id, 'product_name' => $item->product_name, 'reason' => $reason, 'expected_reference' => $expected];
            }
        }

        if ($errors) {
            throw new HttpResponseException(response()->json(['message' => 'This order cannot start Stock Out.', 'errors' => $errors], 422));
        }
    }

    private function resolveBarcode(Order $order, ?int $warehouseId, string $barcode, bool $lock = false): array
    {
        if (!$warehouseId) throw ValidationException::withMessages(['warehouse' => 'The Plant Manager has no assigned warehouse.']);
        $query = Inventory::query()->with('product')->where('barcode', $barcode);
        if ($lock) $query->lockForUpdate();
        $inventory = $query->first();
        if (!$inventory) throw ValidationException::withMessages(['barcode' => 'Barcode not found in inventory.']);
        if ($inventory->warehouse_id !== $warehouseId) throw ValidationException::withMessages(['barcode' => 'This inventory item does not belong to your assigned warehouse.']);
        if ($inventory->pending_receiving || $inventory->available_stock <= 0 || $inventory->status === 'Out of Stock') throw ValidationException::withMessages(['inventory' => 'Inventory is not usable or has no available quantity.']);

        $productName = trim((string) $inventory->product?->name);
        $items = $order->items()->where(function (Builder $query) use ($inventory, $productName) {
            $query->where('product_id', $inventory->product_id);
            if ($productName !== '') {
                $query->orWhere(function (Builder $fallback) use ($productName) {
                    $fallback->whereNull('product_id')->whereRaw('LOWER(TRIM(product_name)) = ?', [mb_strtolower($productName)]);
                });
            }
        });
        if ($lock) $items->lockForUpdate();
        $item = $items->get()->first(fn(OrderItem $candidate) => $this->releasedFor($candidate) < (float) $candidate->quantity);
        if (!$item) {
            $belongs = (clone $items)->exists();
            if ($belongs) throw ValidationException::withMessages(['quantity' => 'This item has already been fully released.']);
            throw ValidationException::withMessages(['barcode' => 'This product is not included in this order.']);
        }
        $released = $this->releasedFor($item);
        $remaining = (int) ((float) $item->quantity - $released);
        return [$inventory, $item, $released, $remaining];
    }

    private function inventoryForItem(OrderItem $item, int $warehouseId): ?Inventory
    {
        $query = Inventory::query()->with('product')->where('warehouse_id', $warehouseId);
        if ($item->product_id) {
            return $query->where('product_id', $item->product_id)->first();
        }

        $name = trim((string) $item->product_name);
        return $name === '' ? null : $query->whereHas('product', fn (Builder $product) =>
            $product->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower($name)]))->first();
    }

    private function barcodeData(Inventory $inventory, OrderItem $item, Order $order, int $released, int $remaining): array
    {
        $inventory->loadMissing('warehouse:id,name,code');
        return [
            'valid' => true,
            'inventory' => ['id' => $inventory->id, 'barcode' => $inventory->barcode, 'product_id' => $inventory->product_id, 'warehouse_id' => $inventory->warehouse_id, 'warehouse' => $inventory->warehouse?->only(['id', 'name', 'code']), 'available_stock' => $inventory->available_stock],
            'order_item' => ['id' => $item->id, 'product_id' => $item->product_id, 'product_name' => $item->product_name, 'ordered_quantity' => (float) $item->quantity, 'released_quantity' => $released, 'remaining_quantity' => $remaining],
            'quantity_can_release' => min($remaining, $inventory->available_stock),
            'order' => ['id' => $order->id, 'status' => $order->status],
        ];
    }

    private function plantManager(Request $request): User
    {
        $user = $request->user();
        abort_unless($user?->isPlantManager(), 403, 'Plant Manager access is required.');
        return $user;
    }

    private function ordersFor(User $user): Builder
    {
        return Order::query()
            ->where('assigned_to', $user->id)
            ->whereIn('status', self::STATUSES)
            ->whereDoesntHave('histories', fn (Builder $history) => $history->where('action', 'SUBMITTED_TO_SHIPMENT'));
    }

    private function releasedFor(OrderItem $item): int
    {
        return (int) StockOutTransaction::where('order_item_id', $item->id)->sum('quantity');
    }

    private function allItemsReleased(Order $order): bool
    {
        return $order->items()->get()->every(fn(OrderItem $item) => $this->releasedFor($item) >= (float) $item->quantity);
    }

    private function priority(Order $order): string
    {
        $days = now()->diffInDays($order->required_delivery_date, false);
        return $days <= 3 ? 'HIGH' : ($days <= 7 ? 'MEDIUM' : 'LOW');
    }

    private function applyPriority(Builder $query, string $priority): void
    {
        $high = now()->addDays(3);
        $medium = now()->addDays(7);
        match ($priority) {
            'HIGH' => $query->where('required_delivery_date', '<=', $high),
            'MEDIUM' => $query->where('required_delivery_date', '>', $high)->where('required_delivery_date', '<=', $medium),
            'LOW' => $query->where('required_delivery_date', '>', $medium),
        };
    }

    private function listData(Order $order): array
    {
        return [
            'id' => $order->id,
            'order_no' => $order->order_no,
            'customer_name' => $order->customer_name,
            'customer_address' => $order->customer_address,
            'warehouse' => $order->assignee?->warehouse?->only(['id', 'name', 'code']),
            'order_date' => $order->order_date,
            'required_delivery_date' => $order->required_delivery_date,
            'products_count' => $order->items_count,
            'total_units' => (float) $order->total_units,
            'total_amount' => $order->total_amount,
            'priority' => $this->priority($order),
            'status' => $order->status,
        ];
    }

    private function detailData(Order $order): array
    {
        $order->load(['items.product', 'assignee.warehouse', 'histories.performer', 'stockOutTransactions.performer']);
        $warehouseId = $order->assignee?->warehouse_id;
        $items = $order->items->map(function (OrderItem $item) use ($warehouseId) {
            $released = $this->releasedFor($item);
            $inventory = $warehouseId ? $this->inventoryForItem($item, $warehouseId) : null;
            return [
                'id' => $item->id,
                'product_id' => $item->product_id,
                'barcode' => $inventory?->barcode,
                'product_name' => $item->product_name,
                'ordered_quantity' => (float) $item->quantity,
                'released_quantity' => $released,
                'remaining_quantity' => max(0, (float) $item->quantity - $released),
                'available_quantity' => $inventory?->available_stock ?? 0,
                'unit' => $item->unit,
                'batch_lot' => null,
                'expiry_date' => null,
                'location' => null,
                'status' => $released >= (float) $item->quantity ? 'COMPLETED' : ($released > 0 ? 'PARTIAL' : 'PENDING'),
            ];
        })->values();

        $history = collect($order->histories)->map(fn($event) => [
            'id' => 'status-' . $event->id,
            'action' => $event->action,
            'barcode' => null,
            'quantity' => null,
            'performed_by' => $event->performer?->name,
            'created_at' => $event->created_at,
        ])->concat($order->stockOutTransactions->map(fn($event) => [
            'id' => 'release-' . $event->id,
            'action' => 'INVENTORY_RELEASED',
            'barcode' => $event->barcode,
            'quantity' => $event->quantity,
            'performed_by' => $event->performer?->name,
            'created_at' => $event->created_at,
        ]))->sortByDesc('created_at')->values();

        return array_merge($this->listData($order->loadCount('items')->loadSum('items as total_units', 'quantity')), [
            'prepared_by' => $order->assignee?->name,
            'items' => $items,
            'history' => $history,
        ]);
    }

    private function scanData(StockOutTransaction $transaction, Order $order, bool $duplicate): array
    {
        $item = $transaction->orderItem()->firstOrFail();
        $released = $this->releasedFor($item);
        return [
            'success' => true,
            'message' => $duplicate ? 'This release request was already processed.' : 'Inventory released successfully.',
            'reference_no' => $transaction->reference_no,
            'duplicate' => $duplicate,
            'barcode' => $transaction->barcode,
            'product' => $item->product_name,
            'quantity_released' => $transaction->quantity,
            'ordered_quantity' => (float) $item->quantity,
            'released_quantity' => $released,
            'remaining_quantity' => max(0, (float) $item->quantity - $released),
            'inventory_remaining_quantity' => $transaction->inventory()->value('available_stock'),
            'order_status' => $order->status,
            'order' => ['id' => $order->id, 'status' => $order->status],
            'order_item' => ['id' => $item->id, 'product_id' => $item->product_id],
            'inventory' => ['id' => $transaction->inventory_id, 'warehouse_id' => $transaction->warehouse_id],
        ];
    }
}
