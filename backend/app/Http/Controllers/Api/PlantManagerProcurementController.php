<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ReplenishmentRequest;
use App\Models\Inventory;
use App\Models\Warehouse;
use App\Models\User;
use App\Notifications\WorkflowNotification;
use App\Support\WorkflowNotificationSender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PlantManagerProcurementController extends Controller
{
    private const STATUS_DRAFT = 'draft';
    private const STATUS_PENDING = 'pending';

    public function options(Request $request): JsonResponse
    {
        abort_unless($request->user()->isPlantManager(), 403);

        $query = Inventory::query()->with(['product:id,name', 'warehouse:id,name']);
        if ($request->user()->warehouse_id) {
            $query->where('warehouse_id', $request->user()->warehouse_id);
        }

        $items = $query->get()->map(function (Inventory $inventory) {
            $needsReplenishment = in_array($inventory->status, ['Low Stock', 'Out of Stock'], true);
            $recommendedQty = max((int) $inventory->backload, $needsReplenishment ? 1 : 0);

            return [
                'id' => (string) $inventory->id,
                'productId' => $inventory->product_id,
                'warehouseId' => $inventory->warehouse_id,
                'name' => $inventory->product?->name,
                'sku' => $inventory->barcode,
                'warehouse' => $inventory->warehouse?->name,
                'currentStock' => (int) $inventory->available_stock,
                'minStock' => $needsReplenishment ? (int) $inventory->available_stock + 1 : 0,
                'forecastedDemand' => (int) $inventory->available_stock + (int) $inventory->backload,
                'recommendedReorderQty' => $recommendedQty,
                'priority' => $inventory->status === 'Out of Stock' ? 'Critical' : ($needsReplenishment ? 'High' : 'Low'),
                'needsReplenishment' => $needsReplenishment,
            ];
        })->values();

        $warehouse = $request->user()->warehouse_id
            ? Warehouse::query()->find($request->user()->warehouse_id)
            : Warehouse::query()
                ->where(fn ($query) => $query->where('code', 'WH-MAIN')->orWhere('name', 'Main Warehouse'))
                ->orderByRaw("CASE WHEN code = 'WH-MAIN' THEN 0 ELSE 1 END")
                ->first();

        return response()->json([
            'data' => $items,
            'warehouse' => $warehouse?->only(['id', 'name']),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->isPlantManager(), 403);

        $requests = ReplenishmentRequest::query()
            ->where('requested_by', $request->user()->id)
            ->with(['product:id,name', 'warehouse:id,name', 'requester:id,name'])
            ->latest('created_at')
            ->get()
            ->map(fn (ReplenishmentRequest $item) => $this->requestData($item));

        return response()->json(['data' => $requests]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->isPlantManager(), 403);
        $validated = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'requested_qty' => ['required', 'integer', 'min:1'],
            'priority' => ['required', Rule::in(ReplenishmentRequest::PRIORITIES)],
            'status' => ['nullable', Rule::in([self::STATUS_DRAFT, self::STATUS_PENDING])],
        ]);

        $status = $validated['status'] ?? self::STATUS_PENDING;
        $replenishmentRequest = ReplenishmentRequest::create([
            ...$validated,
            'request_no' => 'RR-'.now()->format('Ymd').'-'.strtoupper(Str::random(6)),
            'requested_by' => $request->user()->id,
            'status' => $status,
            'submitted_at' => $status === self::STATUS_PENDING ? now() : null,
        ]);
        $replenishmentRequest->load(['product:id,name', 'warehouse:id,name', 'requester:id,name']);

        if ($status === self::STATUS_PENDING) {
            $this->notifyAdmins($replenishmentRequest);
        }

        return response()->json($this->requestData($replenishmentRequest), 201);
    }

    public function submit(Request $request, ReplenishmentRequest $replenishmentRequest): JsonResponse
    {
        abort_unless($request->user()->isPlantManager(), 403);
        $this->authorize('view', $replenishmentRequest);
        if ($replenishmentRequest->status !== self::STATUS_DRAFT) {
            throw ValidationException::withMessages([
                'status' => 'Only Draft replenishment requests can be submitted.',
            ]);
        }

        $replenishmentRequest->update([
            'status' => self::STATUS_PENDING,
            'submitted_at' => now(),
        ]);
        $replenishmentRequest->load(['product:id,name', 'warehouse:id,name', 'requester:id,name']);
        $this->notifyAdmins($replenishmentRequest);

        return response()->json($this->requestData($replenishmentRequest));
    }

    private function notifyAdmins(ReplenishmentRequest $replenishmentRequest): void
    {
        $admins = User::query()
            ->where('status', 'ACTIVE')
            ->whereHas('role', fn ($query) => $query->where('slug', 'ADMIN'))
            ->get();

        WorkflowNotificationSender::send($admins, new WorkflowNotification(
            'New Replenishment Request',
            "Request #{$replenishmentRequest->request_no} requires your approval.",
            'info',
            $replenishmentRequest->request_no,
            'Procurement',
        ));
    }

    private function requestData(ReplenishmentRequest $request): array
    {
        return [
            'id' => $request->id,
            'request_no' => $request->request_no,
            'requested_by' => $request->requester?->name,
            'warehouse_id' => $request->warehouse_id,
            'warehouse_name' => $request->warehouse?->name,
            'product_id' => $request->product_id,
            'product_name' => $request->product?->name,
            'requested_qty' => $request->requested_qty,
            'priority' => $request->priority,
            'status' => $request->status,
            'submitted_date' => $request->submitted_at?->toDateString(),
        ];
    }
}
