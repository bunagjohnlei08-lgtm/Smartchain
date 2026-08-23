<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Read-only view of the shipments prepared by Plant Manager Shipment.
 *
 * There is no separate shipment table: a shipment IS the existing order once
 * Stock Out has released every item and moved it to READY_FOR_SHIPMENT. This
 * controller only reads those existing orders/order items and never writes.
 */
class AdminLogisticsController extends Controller
{
    /**
     * Strictly orders the Plant Manager has forwarded. Orders still sitting in
     * READY_FOR_SHIPMENT belong to Plant Manager Shipment and must not appear here.
     */
    private const LOGISTICS_STATUSES = [Order::LOGISTICS_STATUS];

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Order::class);

        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', Rule::in(self::LOGISTICS_STATUSES)],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = Order::query()
            ->whereIn('status', self::LOGISTICS_STATUSES)
            ->with([
                'items:id,order_id,product_id,product_name,quantity,unit',
                'items.product:id,name',
                'assignee:id,name,employee_id,warehouse_id',
                'assignee.warehouse:id,name,code',
                'histories' => fn ($histories) => $histories->oldest(),
            ])
            ->withCount('items');

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

        $shipments = $query
            ->orderByDesc('assigned_at')
            ->paginate($validated['per_page'] ?? 15)
            ->through(fn (Order $order) => $this->shipmentData($order));

        return response()->json($shipments);
    }

    private function shipmentData(Order $order): array
    {
        return [
            'id' => $order->id,
            // The order number is the shipment identifier shared with Plant Manager Shipment.
            'shipment_no' => $order->order_no,
            'order_no' => $order->order_no,
            'reference_no' => $order->reference_no,
            'customer_name' => $order->customer_name,
            'destination' => $order->customer_address,
            'warehouse' => $order->assignee?->warehouse?->name,
            'prepared_by' => $order->assignee?->name,
            'prepared_date' => $order->assigned_at,
            // No logistics assignment column exists on orders yet.
            'assigned_logistics' => null,
            'status' => $order->status,
            'required_delivery_date' => $order->required_delivery_date,
            'items_count' => $order->items_count,
            'total_quantity' => (float) $order->items->sum('quantity'),
            'items' => $order->items->map(fn ($item) => [
                'product_name' => $item->product?->name ?? $item->product_name,
                'quantity' => $item->quantity,
                'unit' => $item->unit,
            ])->values(),
            'timeline' => $order->histories->map(fn ($history) => [
                'action' => $history->action,
                'new_status' => $history->new_status,
                'occurred_at' => $history->created_at,
            ])->values(),
        ];
    }
}
