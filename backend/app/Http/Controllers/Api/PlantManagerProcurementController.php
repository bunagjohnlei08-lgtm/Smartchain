<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\ReplenishmentRequest;
use App\Models\User;
use App\Models\Warehouse;
use App\Notifications\WorkflowNotification;
use App\Support\AuditLogger;
use App\Support\ReplenishmentFulfillmentStage;
use App\Support\StockLevel;
use App\Support\WorkflowNotificationSender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PlantManagerProcurementController extends Controller
{
    private const STATUS_DRAFT = ReplenishmentRequest::STATUS_DRAFT;

    private const STATUS_PENDING = ReplenishmentRequest::STATUS_PENDING;

    /** Requested quantities are entered by the Plant Manager; this only bounds them. */
    public const MAX_REQUESTED_QTY = 1000000;

    public function options(Request $request): JsonResponse
    {
        abort_unless($request->user()->isPlantManager(), 403);
        $warehouseId = $request->user()->warehouse_id;
        abort_unless($warehouseId, 403, 'A warehouse assignment is required.');

        $inventories = Inventory::query()
            ->where('warehouse_id', $warehouseId)
            ->where('available_stock', '<=', 30)
            ->with(['product:id,name', 'product.suppliers:id,name,status', 'warehouse:id,name'])
            ->orderBy('available_stock')
            ->orderBy('product_id')
            ->get();

        $requests = ReplenishmentRequest::query()
            ->where('warehouse_id', $warehouseId)
            ->whereIn('product_id', $inventories->pluck('product_id'))
            ->active()
            ->with([
                'product:id,name', 'warehouse:id,name', 'requester:id,name',
                ...ReplenishmentFulfillmentStage::RELATIONS,
            ])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get()
            ->unique('product_id')
            ->keyBy('product_id');

        $items = $inventories->map(function (Inventory $inventory) use ($requests) {
            $quantity = (int) $inventory->available_stock;
            $stockLevel = StockLevel::classify($quantity);
            /** @var ReplenishmentRequest|null $relatedRequest */
            $relatedRequest = $requests->get($inventory->product_id);
            // Informational only: Admin still selects an ACTIVE supplier at PO creation.
            $primarySupplier = $inventory->product?->activePrimarySupplier();

            return [
                'id' => (string) $inventory->id,
                'productId' => $inventory->product_id,
                'warehouseId' => $inventory->warehouse_id,
                'name' => $inventory->product?->name,
                'sku' => $inventory->barcode,
                'warehouse' => $inventory->warehouse?->name,
                'currentStock' => $quantity,
                'forecastedDemand' => $quantity + (int) $inventory->backload,
                'recommendedReorderQty' => max((int) $inventory->backload, 1),
                'priority' => $stockLevel['priority'],
                'stockCondition' => $stockLevel['condition'],
                'needsReplenishment' => true,
                'request' => $relatedRequest ? $this->requestData($relatedRequest, $stockLevel['priority']) : null,
                'requestStatus' => $relatedRequest?->lifecycleStatus() ?? 'not_submitted',
                'canRequest' => ! $relatedRequest,
                'primarySupplier' => $primarySupplier?->only(['id', 'name']),
                'supplierWarning' => $primarySupplier ? null : 'NO_ACTIVE_SUPPLIER',
            ];
        })->values();

        $warehouse = Warehouse::query()->find($warehouseId);

        return response()->json([
            'data' => $items,
            'warehouse' => $warehouse?->only(['id', 'name']),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->isPlantManager(), 403);

        $validated = $request->validate([
            'scope' => ['nullable', Rule::in(['history'])],
        ]);

        $query = ReplenishmentRequest::query()
            ->where('requested_by', $request->user()->id)
            ->with([
                'product:id,name', 'warehouse:id,name', 'requester:id,name',
                ...ReplenishmentFulfillmentStage::RELATIONS,
            ]);

        if (($validated['scope'] ?? null) === 'history') {
            $query->whereNotNull('submitted_at')
                ->orderByDesc('submitted_at')
                ->orderByDesc('id')
                ->limit(5);
        } else {
            $query->whereIn('status', ReplenishmentRequest::PLANT_MANAGER_ACTIVE_STATUSES);
            $query->latest('created_at');
        }

        $requests = $query->get()
            ->map(fn (ReplenishmentRequest $item) => $this->requestData($item));

        return response()->json(['data' => $requests]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->isPlantManager(), 403);
        $validated = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'requested_qty' => ['required', 'integer', 'min:1', 'max:'.self::MAX_REQUESTED_QTY],
            'status' => ['nullable', Rule::in([self::STATUS_DRAFT, self::STATUS_PENDING])],
        ]);

        $warehouseId = $request->user()->warehouse_id;
        abort_unless($warehouseId && (int) $validated['warehouse_id'] === (int) $warehouseId, 403);
        $status = $validated['status'] ?? self::STATUS_PENDING;
        $replenishmentRequest = DB::transaction(function () use ($validated, $warehouseId, $status, $request) {
            Warehouse::query()->lockForUpdate()->findOrFail($warehouseId);
            $inventory = $this->lockEligibleInventory((int) $validated['product_id'], (int) $warehouseId);
            $this->ensureNoOpenRequest((int) $validated['product_id'], (int) $warehouseId);

            return $this->createRequest(
                (int) $validated['product_id'],
                (int) $warehouseId,
                (int) $validated['requested_qty'],
                (int) $request->user()->id,
                $status,
                (int) $inventory->available_stock,
            );
        }, 3);
        $this->afterRequestCreated($replenishmentRequest, $status === self::STATUS_PENDING);

        return response()->json($this->requestData($replenishmentRequest), 201);
    }

    public function bulkStore(Request $request): JsonResponse
    {
        abort_unless($request->user()->isPlantManager(), 403);
        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:50'],
            'items.*.product_id' => ['required', 'integer', 'distinct', 'exists:products,id'],
            'items.*.requested_qty' => ['required', 'integer', 'min:1', 'max:'.self::MAX_REQUESTED_QTY],
        ]);
        $warehouseId = $request->user()->warehouse_id;
        abort_unless($warehouseId, 403, 'A warehouse assignment is required.');

        $items = collect($validated['items'])->sortBy('product_id')->values();
        $requests = DB::transaction(function () use ($items, $warehouseId, $request) {
            Warehouse::query()->lockForUpdate()->findOrFail($warehouseId);

            return $items->map(function (array $item) use ($warehouseId, $request) {
                $productId = (int) $item['product_id'];
                $inventory = $this->lockEligibleInventory($productId, (int) $warehouseId);
                $this->ensureNoOpenRequest($productId, (int) $warehouseId);

                return $this->createRequest(
                    $productId,
                    (int) $warehouseId,
                    (int) $item['requested_qty'],
                    (int) $request->user()->id,
                    self::STATUS_PENDING,
                    (int) $inventory->available_stock,
                );
            });
        }, 3);

        $requests->each(fn (ReplenishmentRequest $item) => $this->afterRequestCreated($item, true));

        return response()->json([
            'data' => $requests->map(fn (ReplenishmentRequest $item) => $this->requestData($item))->values(),
        ], 201);
    }

    public function submit(Request $request, ReplenishmentRequest $replenishmentRequest): JsonResponse
    {
        abort_unless($request->user()->isPlantManager(), 403);
        $this->authorize('view', $replenishmentRequest);
        abort_unless(
            $request->user()->warehouse_id
                && (int) $request->user()->warehouse_id === (int) $replenishmentRequest->warehouse_id,
            403,
            'This request is outside your assigned warehouse.',
        );
        if ($replenishmentRequest->status !== self::STATUS_DRAFT) {
            throw ValidationException::withMessages([
                'status' => 'Only Draft replenishment requests can be submitted.',
            ]);
        }

        $replenishmentRequest = DB::transaction(function () use ($replenishmentRequest) {
            $lockedRequest = ReplenishmentRequest::query()->lockForUpdate()->findOrFail($replenishmentRequest->id);
            if ($lockedRequest->status !== self::STATUS_DRAFT) {
                throw ValidationException::withMessages([
                    'status' => 'Only Draft replenishment requests can be submitted.',
                ]);
            }

            $inventory = $this->lockEligibleInventory($lockedRequest->product_id, $lockedRequest->warehouse_id);
            $this->ensureNoOpenRequest($lockedRequest->product_id, $lockedRequest->warehouse_id, $lockedRequest->id);

            $lockedRequest->update([
                'priority' => StockLevel::priority((int) $inventory->available_stock),
                'status' => self::STATUS_PENDING,
                'submitted_at' => now(),
            ]);

            return $lockedRequest;
        }, 3);
        $this->afterRequestCreated($replenishmentRequest, true);

        return response()->json($this->requestData($replenishmentRequest));
    }

    private function lockEligibleInventory(int $productId, int $warehouseId): Inventory
    {
        $inventory = Inventory::query()
            ->where('product_id', $productId)
            ->where('warehouse_id', $warehouseId)
            ->lockForUpdate()
            ->first();

        if (!$inventory) {
            throw ValidationException::withMessages([
                'product_id' => 'The product is not present in your assigned warehouse inventory.',
            ]);
        }
        if (!StockLevel::needsReplenishment((int) $inventory->available_stock)) {
            throw ValidationException::withMessages([
                'product_id' => 'This inventory item is above the replenishment threshold.',
            ]);
        }

        return $inventory;
    }

    private function ensureNoOpenRequest(int $productId, int $warehouseId, ?int $ignoreRequestId = null): void
    {
        $duplicate = ReplenishmentRequest::query()
            ->where('product_id', $productId)
            ->where('warehouse_id', $warehouseId)
            ->active()
            ->when($ignoreRequestId, fn ($query) => $query->whereKeyNot($ignoreRequestId))
            ->exists();

        if ($duplicate) {
            throw ValidationException::withMessages([
                'product_id' => 'An active replenishment request already exists for this product and warehouse.',
            ]);
        }
    }

    private function createRequest(
        int $productId,
        int $warehouseId,
        int $requestedQty,
        int $requestedBy,
        string $status,
        int $currentStock,
    ): ReplenishmentRequest {
        return ReplenishmentRequest::create([
            'product_id' => $productId,
            'warehouse_id' => $warehouseId,
            'requested_qty' => $requestedQty,
            'priority' => StockLevel::priority($currentStock),
            'request_no' => 'RR-'.now()->format('Ymd').'-'.strtoupper(Str::random(6)),
            'requested_by' => $requestedBy,
            'status' => $status,
            'submitted_at' => $status === self::STATUS_PENDING ? now() : null,
        ]);
    }

    private function afterRequestCreated(ReplenishmentRequest $replenishmentRequest, bool $submitted): void
    {
        $replenishmentRequest->load(['product:id,name', 'warehouse:id,name', 'requester:id,name']);
        if (!$submitted) {
            return;
        }

        AuditLogger::success('PROCUREMENT_REQUEST_SUBMITTED', AuditLogger::MODULE_PROCUREMENT, [
            'resource' => $replenishmentRequest,
            'resource_label' => $replenishmentRequest->request_no,
            'details' => sprintf(
                'Submitted request %s for %s at %s (%s, quantity %d)',
                $replenishmentRequest->request_no,
                $replenishmentRequest->product?->name ?? 'Unknown product',
                $replenishmentRequest->warehouse?->name ?? 'Unknown warehouse',
                $replenishmentRequest->priority,
                $replenishmentRequest->requested_qty,
            ),
            'metadata' => ['status' => self::STATUS_PENDING],
        ]);
        $this->notifyAdmins($replenishmentRequest);
    }

    private function notifyAdmins(ReplenishmentRequest $replenishmentRequest): void
    {
        $admins = User::query()
            ->where('status', 'ACTIVE')
            ->whereHas('role', fn ($query) => $query->where('slug', 'ADMIN'))
            ->get();

        WorkflowNotificationSender::send($admins, new WorkflowNotification(
            'New Replenishment Request',
            sprintf(
                '%s submitted %s for %s at %s — %s priority, quantity %d.',
                $replenishmentRequest->requester?->name ?? 'A Plant Manager',
                $replenishmentRequest->request_no,
                $replenishmentRequest->product?->name ?? 'Unknown product',
                $replenishmentRequest->warehouse?->name ?? 'Unknown warehouse',
                $replenishmentRequest->priority,
                $replenishmentRequest->requested_qty,
            ),
            'info',
            $replenishmentRequest->request_no,
            'Procurement',
        ));
    }

    private function requestData(ReplenishmentRequest $request, ?string $currentPriority = null): array
    {
        if ($currentPriority === null) {
            $availableStock = Inventory::query()
                ->where('product_id', $request->product_id)
                ->where('warehouse_id', $request->warehouse_id)
                ->value('available_stock');
            $currentPriority = StockLevel::priority((int) ($availableStock ?? 31));
        }
        $stage = ReplenishmentFulfillmentStage::resolve($request);

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
            'current_priority' => $currentPriority,
            'status' => $request->lifecycleStatus(),
            'submitted_date' => $request->submitted_at?->toDateString(),
            'admin_decision' => $request->admin_decision,
            'linked_purchase_order' => $request->purchaseOrder ? [
                'number' => $request->purchaseOrder->po_number,
                'status' => $request->purchaseOrder->status,
            ] : null,
            'current_fulfillment_stage' => $stage['key'],
            'current_fulfillment_stage_label' => $stage['label'],
            'fulfillment' => $stage['details'],
            'timeline' => $stage['timeline'],
        ];
    }
}
