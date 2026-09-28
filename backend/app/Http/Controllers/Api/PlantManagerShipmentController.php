<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\ShipmentPacking;
use App\Models\User;
use App\Notifications\WorkflowNotification;
use App\Support\WorkflowNotificationSender;
use App\Support\AuditLogger;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Plant Manager Shipment stage of the shared order state machine.
 *
 * Stock Out sets an order to FOR_PACKING once every item is released. This module owns
 * the order from that point: FOR_PACKING → PACKING → READY_FOR_SHIPMENT, after which the
 * Plant Manager forwards it, which moves it to FORWARDED_TO_LOGISTICS and hands it to
 * Admin Logistics (DTRS). Orders already READY_FOR_SHIPMENT from before the packing
 * stages existed stay in the queue and can be forwarded as-is.
 */
class PlantManagerShipmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $this->plantManager($request);

        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', Rule::in(Order::SHIPMENT_QUEUE_STATUSES)],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = $this->shipmentQueue($user);

        if (!empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function (Builder $query) use ($search) {
                $query->where('order_no', 'like', "%{$search}%")
                    ->orWhere('reference_no', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%");
            });
        }
        if (!empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        $orders = $query
            // PostgreSQL sorts NULLs first on DESC; orders with no Shipment history go last.
            ->orderByRaw('shipment_queue_entered_at DESC NULLS LAST')
            ->orderByDesc('orders.id')
            ->paginate($validated['per_page'] ?? 15)
            ->through(fn (Order $order) => $this->shipmentData($order));

        return response()->json($orders);
    }

    public function startPacking(Request $request, int $order): JsonResponse
    {
        $user = $this->plantManager($request);

        $record = DB::transaction(function () use ($user, $order) {
            $record = $this->shipmentOrders($user)->lockForUpdate()->findOrFail($order);

            if ($record->status === Order::PACKING_STATUS && $record->shipmentPacking()->exists()) {
                return $record;
            }
            if ($record->status !== Order::FOR_PACKING_STATUS) {
                throw ValidationException::withMessages(['status' => 'Only orders that are For Packing can start packing.']);
            }
            $stockOutFlow = $record->histories()->where('action', 'STOCK_OUT_COMPLETED')->exists();
            if ($stockOutFlow && ! $this->barcodeVerified($record)) {
                throw ValidationException::withMessages(['barcode' => 'Stock Out barcode verification is incomplete.']);
            }

            $packing = $record->shipmentPacking()->firstOrCreate([]);
            if (! $packing->package_id) {
                $packing->forceFill(['package_id' => sprintf('PKG-%s-%06d', now()->format('Y'), $packing->id)])->save();
            }

            $record->update(['status' => Order::PACKING_STATUS]);
            $record->histories()->create([
                'previous_status' => Order::FOR_PACKING_STATUS,
                'new_status' => Order::PACKING_STATUS,
                'action' => 'PACKING_STARTED',
                'performed_by' => $user->id,
            ]);
            AuditLogger::success('PACKING_STARTED', AuditLogger::MODULE_ORDERS, $this->auditContext($record, $packing, $user));

            return $record;
        }, 3);

        return response()->json($this->shipmentData($this->shipmentQueue($user)->findOrFail($record->id)));
    }

    public function markReadyForShipment(Request $request, int $order): JsonResponse
    {
        $user = $this->plantManager($request);
        $record = DB::transaction(function () use ($user, $order, $request) {
            $record = $this->shipmentOrders($user)->lockForUpdate()->findOrFail($order);
            if ($record->status !== Order::PACKING_STATUS) {
                throw ValidationException::withMessages(['status' => 'Only orders that are being packed can be marked Ready for Shipment.']);
            }
            $data = $request->validate([
                'number_of_boxes' => ['required', 'integer', 'min:1', 'max:100000'],
                'estimated_weight_kg' => ['required', 'numeric', 'gt:0', 'max:99999999.99'],
                'is_fragile' => ['required', 'boolean'],
                'packing_notes' => ['nullable', 'string', 'max:2000'],
                'correct_product' => ['accepted'],
                'correct_quantity' => ['accepted'],
                'package_condition' => ['accepted'],
                'items_complete' => ['accepted'],
            ]);
            $stockOutFlow = $record->histories()->where('action', 'STOCK_OUT_COMPLETED')->exists();
            if ($stockOutFlow && ! $this->barcodeVerified($record)) {
                throw ValidationException::withMessages(['barcode' => 'Stock Out barcode verification is incomplete.']);
            }

            $packing = $record->shipmentPacking()->lockForUpdate()->first();
            if (! $packing?->package_id) {
                throw ValidationException::withMessages(['packing' => 'Start packing before marking the shipment ready.']);
            }
            $packing->fill($data + ['packed_by_id' => $user->id, 'packed_at' => now()])->save();

            $record->update(['status' => Order::SHIPMENT_STATUS]);
            $record->histories()->create([
                'previous_status' => Order::PACKING_STATUS,
                'new_status' => Order::SHIPMENT_STATUS,
                'action' => 'PACKING_COMPLETED',
                'performed_by' => $user->id,
            ]);
            AuditLogger::success('PACKING_COMPLETED', AuditLogger::MODULE_ORDERS, $this->auditContext($record, $packing, $user));

            return $record;
        }, 3);

        return response()->json($this->shipmentData($this->shipmentQueue($user)->findOrFail($record->id)));
    }

    public function forwardToLogistics(Request $request, int $order): JsonResponse
    {
        $user = $this->plantManager($request);

        $record = DB::transaction(function () use ($user, $order) {
            $record = $this->shipmentOrders($user)->lockForUpdate()->findOrFail($order);

            if ($record->status !== Order::SHIPMENT_STATUS) {
                throw ValidationException::withMessages([
                    'status' => 'Only orders that are Ready for Shipment can be forwarded to Logistics.',
                ]);
            }

            $packing = $record->shipmentPacking()->first();
            $newFlow = $record->histories()->where('action', 'PACKING_STARTED')->exists();
            if ($newFlow && ! $this->completedPacking($packing, $record)) {
                throw ValidationException::withMessages(['packing' => 'Completed packing information is required before forwarding to Logistics.']);
            }

            $record->update(['status' => Order::LOGISTICS_STATUS]);
            $record->histories()->create([
                'previous_status' => Order::SHIPMENT_STATUS,
                'new_status' => Order::LOGISTICS_STATUS,
                'action' => 'FORWARDED_TO_LOGISTICS',
                'performed_by' => $user->id,
            ]);
            AuditLogger::success('FORWARDED_TO_LOGISTICS', AuditLogger::MODULE_ORDERS, $this->auditContext($record, $packing, $user));

            return $record;
        });

        $admins = User::query()
            ->where('status', 'ACTIVE')
            ->whereHas('role', fn ($query) => $query->where('slug', 'ADMIN'))
            ->get();
        WorkflowNotificationSender::send($admins, new WorkflowNotification(
            'Order Ready for Logistics',
            "Order #{$record->order_no} has been packed and forwarded to Logistics by the Plant Manager.",
            'success',
            $record->order_no,
            'Logistics',
        ));

        return response()->json(['id' => $record->id, 'status' => $record->status]);
    }

    private function transition(Request $request, int $orderId, string $from, string $to, string $action, string $message): JsonResponse
    {
        $user = $this->plantManager($request);

        DB::transaction(function () use ($user, $orderId, $from, $to, $action, $message) {
            $record = $this->shipmentOrders($user)->lockForUpdate()->findOrFail($orderId);

            if ($record->status !== $from) {
                throw ValidationException::withMessages(['status' => $message]);
            }

            $record->update(['status' => $to]);
            $record->histories()->create([
                'previous_status' => $from,
                'new_status' => $to,
                'action' => $action,
                'performed_by' => $user->id,
            ]);
        });

        return response()->json($this->shipmentData($this->shipmentQueue($user)->findOrFail($orderId)));
    }

    private function plantManager(Request $request): User
    {
        $user = $request->user();
        abort_unless($user?->isPlantManager(), 403, 'Plant Manager access is required.');

        return $user;
    }

    /** Strictly the orders sitting in the Shipment stage for this manager. */
    private function shipmentOrders(User $user): Builder
    {
        return Order::query()
            ->where('assigned_to', $user->id)
            ->whereIn('status', Order::SHIPMENT_QUEUE_STATUSES);
    }

    /** The Shipment stage with the recorded stage timestamps and the relations the list needs. */
    private function shipmentQueue(User $user): Builder
    {
        return $this->shipmentOrders($user)
            ->select('orders.*')
            // Queue entry is the first Shipment-stage status recorded: FOR_PACKING for new
            // orders, READY_FOR_SHIPMENT for orders that entered before packing existed.
            ->selectSub($this->historyAt(Order::SHIPMENT_QUEUE_STATUSES, 'MIN'), 'shipment_queue_entered_at')
            ->selectSub($this->historyAt([Order::PACKING_STATUS]), 'packing_started_at')
            ->selectSub($this->historyAt([Order::SHIPMENT_STATUS]), 'ready_for_shipment_at')
            ->with([
                'items:id,order_id,product_id,product_name,quantity,unit',
                'items.product:id,name',
                'assignee:id,name,employee_id,warehouse_id',
                'assignee.warehouse:id,name,code',
                'shipmentPacking.packedBy:id,name,employee_id',
            ])
            ->withCount('items');
    }

    private function historyAt(array $statuses, string $aggregate = 'MAX'): Closure
    {
        return fn ($query) => $query->from('order_status_histories')
            ->selectRaw("{$aggregate}(created_at)")
            ->whereColumn('order_status_histories.order_id', 'orders.id')
            ->whereIn('order_status_histories.new_status', $statuses);
    }

    private function shipmentData(Order $order): array
    {
        return [
            'id' => $order->id,
            'order_no' => $order->order_no,
            'reference_no' => $order->reference_no,
            'customer_name' => $order->customer_name,
            'customer_address' => $order->customer_address,
            'warehouse' => $order->assignee?->warehouse?->only(['id', 'name', 'code']),
            'prepared_by' => $order->assignee?->name,
            'assigned_at' => $order->assigned_at,
            'required_delivery_date' => $order->required_delivery_date,
            'status' => $order->status,
            'shipment_queue_entered_at' => $this->timestamp($order->shipment_queue_entered_at),
            'packing_started_at' => $this->timestamp($order->packing_started_at),
            'ready_for_shipment_at' => $this->timestamp($order->ready_for_shipment_at),
            'barcode_verified' => $this->barcodeVerified($order),
            'packing' => $this->packingData($order->shipmentPacking),
            'items_count' => $order->items_count,
            'items' => $order->items->map(fn ($item) => [
                'id' => $item->id,
                'product_id' => $item->product_id,
                'product_name' => $item->product?->name ?? $item->product_name ?? 'Unnamed product',
                'required_quantity' => $item->quantity,
                'unit' => $item->unit,
            ])->values(),
        ];
    }

    /** Raw subquery values come back as database strings; serialize them like model dates. */
    private function timestamp(mixed $value): ?string
    {
        return $value ? Carbon::parse($value)->toJSON() : null;
    }

    private function barcodeVerified(Order $order): bool
    {
        $order->loadMissing('items:id,order_id,quantity');
        if ($order->items->isEmpty()) return false;

        return $order->items->every(function ($item) {
            $transactions = $item->stockOutTransactions()->whereNotNull('barcode')->where('barcode', '<>', '');
            return (int) $transactions->sum('quantity') >= (int) $item->quantity;
        });
    }

    private function completedPacking(?ShipmentPacking $packing, Order $order): bool
    {
        return $packing?->package_id
            && $packing->number_of_boxes >= 1
            && (float) $packing->estimated_weight_kg > 0
            && $packing->correct_product && $packing->correct_quantity
            && $packing->package_condition && $packing->items_complete
            && $packing->packed_by_id && $packing->packed_at
            && (! $order->histories()->where('action', 'STOCK_OUT_COMPLETED')->exists() || $this->barcodeVerified($order));
    }

    private function packingData(?ShipmentPacking $packing): ?array
    {
        if (! $packing) return null;
        return [
            'package_id' => $packing->package_id,
            'number_of_boxes' => $packing->number_of_boxes,
            'estimated_weight_kg' => $packing->estimated_weight_kg,
            'is_fragile' => $packing->is_fragile,
            'packing_notes' => $packing->packing_notes,
            'correct_product' => $packing->correct_product,
            'correct_quantity' => $packing->correct_quantity,
            'package_condition' => $packing->package_condition,
            'items_complete' => $packing->items_complete,
            'packed_by' => $packing->packedBy?->only(['name', 'employee_id']),
            'packed_at' => $packing->packed_at,
        ];
    }

    private function auditContext(Order $order, ?ShipmentPacking $packing, User $user): array
    {
        return [
            'actor' => $user, 'resource' => $order, 'resource_label' => $order->order_no,
            'details' => "Shipment packing workflow updated for {$order->order_no}",
            'metadata' => ['order_id' => $order->id, 'package_id' => $packing?->package_id],
        ];
    }
}
