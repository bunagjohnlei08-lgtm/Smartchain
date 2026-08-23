<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Plant Manager Shipment stage of the shared order state machine.
 *
 * Stock Out sets an order to READY_FOR_SHIPMENT once every item is released. This module
 * owns the order from that point until the Plant Manager forwards it, which moves it to
 * FORWARDED_TO_LOGISTICS and hands it to Admin Logistics (DTRS).
 */
class PlantManagerShipmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $this->plantManager($request);

        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = $this->shipmentOrders($user)
            ->with([
                'items:id,order_id,product_id,product_name,quantity,unit',
                'items.product:id,name',
                'assignee:id,name,employee_id,warehouse_id',
                'assignee.warehouse:id,name,code',
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

        $orders = $query
            ->orderBy('required_delivery_date')
            ->paginate($validated['per_page'] ?? 15)
            ->through(fn (Order $order) => $this->shipmentData($order));

        return response()->json($orders);
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

            $record->update(['status' => Order::LOGISTICS_STATUS]);
            $record->histories()->create([
                'previous_status' => Order::SHIPMENT_STATUS,
                'new_status' => Order::LOGISTICS_STATUS,
                'action' => 'FORWARDED_TO_LOGISTICS',
                'performed_by' => $user->id,
            ]);

            return $record;
        });

        return response()->json(['id' => $record->id, 'status' => $record->status]);
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
            ->where('status', Order::SHIPMENT_STATUS);
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
}
