<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Notifications\WorkflowNotification;
use App\Support\WorkflowNotificationSender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminOrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Order::class);
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', Rule::in(Order::STATUSES)],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'sort_by' => ['nullable', Rule::in(['order_no', 'customer_name', 'order_date', 'required_delivery_date', 'total_amount', 'status', 'created_at'])],
            'sort_direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = Order::query()->with(['assignee:id,name', 'items.product:id,name'])->withCount('items');
        if (!empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($q) use ($search) {
                $q->where('order_no', 'like', "%{$search}%")
                    ->orWhere('reference_no', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%")
                    ->orWhereHas('items', fn ($items) => $items->where('product_name', 'like', "%{$search}%"));
            });
        }
        if (!empty($validated['status'])) $query->where('status', $validated['status']);
        if (!empty($validated['date_from'])) $query->whereDate('order_date', '>=', $validated['date_from']);
        if (!empty($validated['date_to'])) $query->whereDate('order_date', '<=', $validated['date_to']);

        $orders = $query
            ->orderBy($validated['sort_by'] ?? 'created_at', $validated['sort_direction'] ?? 'desc')
            ->paginate($validated['per_page'] ?? 15)
            ->through(fn (Order $order) => $this->listData($order));

        return response()->json($orders);
    }

    public function summary(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Order::class);
        $counts = Order::query()->selectRaw('status, COUNT(*) as aggregate')->groupBy('status')->pluck('aggregate', 'status');

        return response()->json(collect(Order::STATUSES)->mapWithKeys(
            fn (string $status) => [$status => (int) ($counts[$status] ?? 0)]
        ));
    }

    public function plantManagers(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Order::class);
        return response()->json(User::query()
            ->where('status', 'ACTIVE')
            ->whereHas('role', fn ($q) => $q->where('slug', 'PLANT_MANAGER'))
            ->orderBy('name')->get(['id', 'name', 'employee_id']));
    }

    public function products(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Order::class);

        return response()->json(Product::query()
            ->orderBy('name')
            ->get(['id', 'name', 'category', 'unit', 'cost_price']));
    }

    public function show(Request $request, Order $order): JsonResponse
    {
        $this->authorize('view', $order);
        $order->load(['items.product:id,name,unit', 'assignee:id,name,employee_id', 'histories' => fn ($q) => $q->with('performer:id,name')->latest()]);
        return response()->json($this->detailData($order));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Order::class);
        $validated = $request->validate([
            'order_no' => ['nullable', 'string', 'max:50', 'unique:orders,order_no'],
            'reference_no' => ['nullable', 'string', 'max:100'],
            'customer_name' => ['required', 'string', 'max:255'],
            'customer_address' => ['required', 'string'],
            'customer_contact' => ['nullable', 'string', 'max:255'],
            'order_date' => ['required', 'date'],
            'required_delivery_date' => ['required', 'date', 'after_or_equal:order_date'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.unit' => ['nullable', 'string', 'max:50'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
        ], [
            'items.*.product_id.required' => 'Please select a valid product.',
            'items.*.product_id.exists' => 'Please select a valid product.',
        ]);

        $order = DB::transaction(function () use ($validated, $request) {
            $items = collect($validated['items'])->map(function (array $item, int $index) {
                $product = Product::query()->findOrFail($item['product_id']);
                $item['product_name'] = $product->name;
                $item['unit'] = ($item['unit'] ?? null) ?: $product->unit;
                if (!filled($item['unit'])) {
                    throw ValidationException::withMessages([
                        "items.{$index}.unit" => 'Unit is required when the selected Product Catalog record has no unit.',
                    ]);
                }
                $item['subtotal'] = round((float) $item['quantity'] * (float) $item['unit_price'], 2);
                return $item;
            });
            unset($validated['items']);
            $validated['order_no'] ??= $this->nextOrderNumber();
            $validated['total_amount'] = $items->sum('subtotal');
            $validated['status'] = 'NEW';
            $validated['created_by'] = $request->user()->id;
            $order = Order::create($validated);
            $order->items()->createMany($items->all());
            $order->histories()->create([
                'previous_status' => null, 'new_status' => 'NEW',
                'action' => 'ORDER_CREATED', 'performed_by' => $request->user()->id,
            ]);
            return $order;
        });

        return response()->json($this->detailData($order->load(['items.product', 'assignee', 'histories.performer'])), 201);
    }

    public function assign(Request $request, Order $order): JsonResponse
    {
        $this->authorize('update', $order);
        $validated = $request->validate(['assigned_to' => ['required', 'integer', 'exists:users,id']]);
        $manager = User::with('role')->findOrFail($validated['assigned_to']);
        if (!$manager->isPlantManager() || $manager->status !== 'ACTIVE') {
            throw ValidationException::withMessages(['assigned_to' => 'The assignee must be an active Plant Manager.']);
        }
        if (!in_array($order->status, ['NEW', 'ASSIGNED'], true)) {
            throw ValidationException::withMessages(['status' => 'Only NEW or ASSIGNED orders can be assigned.']);
        }
        $previousAssignee = $order->assigned_to;
        DB::transaction(function () use ($order, $manager, $request) {
            $previousAssignee = $order->assigned_to;
            $previousStatus = $order->status;
            $order->update(['assigned_to' => $manager->id, 'assigned_at' => now(), 'status' => 'ASSIGNED']);
            $order->histories()->create([
                'previous_status' => $previousStatus, 'new_status' => 'ASSIGNED',
                'action' => $previousAssignee ? 'ORDER_REASSIGNED' : 'ORDER_ASSIGNED', 'performed_by' => $request->user()->id,
            ]);
        });

        if ($previousAssignee !== $manager->id) {
            WorkflowNotificationSender::send($manager, new WorkflowNotification(
                'New Order Assigned',
                "Order #{$order->order_no} assigned for preparation.",
                'info',
                $order->order_no,
                'Order',
            ));
        }

        return response()->json($this->detailData($order->fresh()->load(['items.product', 'assignee', 'histories.performer'])));
    }

    public function updateStatus(Request $request, Order $order): JsonResponse
    {
        $this->authorize('update', $order);
        $validated = $request->validate(['status' => ['required', Rule::in(Order::STATUSES)]]);
        if ($validated['status'] !== 'CANCELLED' || !in_array($order->status, ['NEW', 'ASSIGNED'], true)) {
            throw ValidationException::withMessages(['status' => "Transition from {$order->status} to {$validated['status']} is not allowed for Admin Order Management."]);
        }

        DB::transaction(function () use ($order, $request) {
            $previous = $order->status;
            $order->update(['status' => 'CANCELLED']);
            $order->histories()->create([
                'previous_status' => $previous, 'new_status' => 'CANCELLED',
                'action' => 'ORDER_CANCELLED', 'performed_by' => $request->user()->id,
            ]);
        });

        return response()->json($this->detailData($order->fresh()->load(['items', 'assignee', 'histories.performer'])));
    }

    private function nextOrderNumber(): string
    {
        $year = now()->format('Y');
        $last = Order::query()->where('order_no', 'like', "SO-{$year}-%")->lockForUpdate()->pluck('order_no')
            ->map(fn ($number) => (int) substr($number, -4))->max() ?? 0;
        return sprintf('SO-%s-%04d', $year, $last + 1);
    }

    private function listData(Order $order): array
    {
        return [
            'id' => $order->id, 'order_no' => $order->order_no, 'reference_no' => $order->reference_no,
            'customer_name' => $order->customer_name, 'order_date' => $order->order_date,
            'required_delivery_date' => $order->required_delivery_date, 'items_count' => $order->items_count,
            'total_amount' => $order->total_amount, 'status' => $order->status,
            'assigned_to' => $order->assignee ? ['id' => $order->assignee->id, 'name' => $order->assignee->name] : null,
            'assigned_at' => $order->assigned_at,
            'products' => $order->items->map(fn ($item) => $item->product?->name ?? $item->product_name)->values(),
            'has_invalid_product_references' => $order->items->contains(fn ($item) => !$item->product_id || !$item->product),
        ];
    }

    private function detailData(Order $order): array
    {
        return array_merge($order->only([
            'id', 'order_no', 'reference_no', 'customer_name', 'customer_address', 'customer_contact',
            'order_date', 'required_delivery_date', 'total_amount', 'status', 'assigned_at', 'created_at', 'updated_at',
        ]), [
            'assigned_to' => $order->assignee ? $order->assignee->only(['id', 'name', 'employee_id']) : null,
            'items' => $order->items->map(fn ($item) => [
                'id' => $item->id,
                'product_id' => $item->product_id,
                'product_name' => $item->product?->name ?? $item->product_name,
                'product_reference_required' => !$item->product_id || !$item->product,
                'quantity' => $item->quantity,
                'unit' => $item->unit,
                'unit_price' => $item->unit_price,
                'subtotal' => $item->subtotal,
            ])->values(),
            'history' => $order->relationLoaded('histories') ? $order->histories->map(fn ($history) => [
                'id' => $history->id, 'previous_status' => $history->previous_status, 'new_status' => $history->new_status,
                'action' => $history->action, 'performed_by' => $history->performer?->only(['id', 'name']), 'created_at' => $history->created_at,
            ])->values() : [],
        ]);
    }
}
