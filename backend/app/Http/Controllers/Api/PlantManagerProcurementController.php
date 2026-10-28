<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\ReplenishmentRequest;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\ForecastReorderService;
use App\Notifications\WorkflowNotification;
use App\Support\AuditLogger;
use App\Support\ReplenishmentFulfillmentStage;
use App\Support\StockLevel;
use App\Support\WorkflowNotificationSender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

class PlantManagerProcurementController extends Controller
{
    private const STATUS_DRAFT = ReplenishmentRequest::STATUS_DRAFT;

    private const STATUS_PENDING = ReplenishmentRequest::STATUS_PENDING;

    /** Requested quantities are entered by the Plant Manager; this only bounds them. */
    public const MAX_REQUESTED_QTY = 1000000;

    public function forecastRecommendations(Request $request, ForecastReorderService $recommendations): JsonResponse
    {
        abort_unless($request->user()->isPlantManager(), 403);
        abort_unless(config('services.ai_forecast.enabled') === true, 404, 'AI forecasting is not enabled.');
        abort_unless($this->supportsForecastContext(), 503, 'AI forecast persistence requires the Phase 2 database schema.');
        $warehouseId = $request->user()->warehouse_id;
        abort_unless($warehouseId, 403, 'A warehouse assignment is required.');

        $inventories = Inventory::query()
            ->where('warehouse_id', $warehouseId)
            ->with(['product:id,name,unit,item_classification', 'warehouse:id,name'])
            ->orderBy('product_id')->get();

        $rows = $inventories->map(function (Inventory $inventory) use ($recommendations) {
            try {
                return $recommendations->recommendation($inventory);
            } catch (HttpException $exception) {
                if ($exception->getStatusCode() === 503) throw $exception;
                return [
                    'product_id' => $inventory->product_id,
                    'product_name' => $inventory->product?->name,
                    'item_classification' => $inventory->product?->item_classification,
                    'warehouse_id' => $inventory->warehouse_id,
                    'warehouse_name' => $inventory->warehouse?->name,
                    'unit' => $inventory->product?->unit,
                    'available_stock' => (int) $inventory->available_stock,
                    'status' => in_array($exception->getStatusCode(), [404, 422], true) ? 'NO_HISTORY' : 'UNAVAILABLE',
                    'actionable' => false,
                    'message' => $exception->getMessage(),
                ];
            }
        })->values();

        return response()->json([
            'data' => $rows,
            'warehouse' => Warehouse::query()->find($warehouseId)?->only(['id', 'name']),
            'scope' => 'Company-wide demand is used only when this warehouse is the product\'s sole inventory location.',
            'formula' => 'ceil(max(0, raw_4_week_demand - available_stock - eligible_confirmed_incoming))',
            'incoming_data_supported' => false,
        ]);
    }

    public function storeForecastRequest(Request $request, ForecastReorderService $recommendations): JsonResponse
    {
        abort_unless($request->user()->isPlantManager(), 403);
        abort_unless(config('services.ai_forecast.enabled') === true, 404, 'AI forecasting is not enabled.');
        abort_unless($this->supportsForecastContext(), 503, 'AI forecast persistence requires the Phase 2 database schema.');
        $validated = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'requested_qty' => ['required', 'integer', 'min:1', 'max:'.self::MAX_REQUESTED_QTY],
            'recommendation_generated_at' => ['required', 'date'],
            'raw_demand' => ['required', 'numeric', 'min:0'],
            'available_stock' => ['required', 'integer', 'min:0'],
            'recommended_reorder' => ['required', 'integer', 'min:1', 'max:'.self::MAX_REQUESTED_QTY],
        ]);
        $warehouseId = $request->user()->warehouse_id;
        abort_unless($warehouseId, 403, 'A warehouse assignment is required.');

        $inventory = Inventory::query()->where('product_id', $validated['product_id'])
            ->where('warehouse_id', $warehouseId)->firstOrFail();
        $current = $recommendations->recommendation($inventory);
        abort_unless(($current['actionable'] ?? false) === true, 422, $current['message'] ?? 'This recommendation is not actionable.');

        $changed = abs((float) $validated['raw_demand'] - (float) $current['raw_demand']) > 0.0005
            || (int) $validated['available_stock'] !== (int) $current['available_stock']
            || (int) $validated['recommended_reorder'] !== (int) $current['recommended_reorder'];
        abort_if($changed, 409, 'The forecast or stock position changed. Review the refreshed recommendation before forwarding.');

        $replenishmentRequest = DB::transaction(function () use ($validated, $warehouseId, $request, $current) {
            Warehouse::query()->lockForUpdate()->findOrFail($warehouseId);
            $inventory = Inventory::query()->where('product_id', $validated['product_id'])
                ->where('warehouse_id', $warehouseId)->lockForUpdate()->firstOrFail();
            $this->ensureNoOpenRequest((int) $validated['product_id'], (int) $warehouseId);
            $lockedRecommendation = (int) ceil(max(0, (float) $current['raw_demand'] - (int) $inventory->available_stock));
            abort_if($lockedRecommendation !== (int) $current['recommended_reorder'], 409, 'The stock position changed. Review the refreshed recommendation before forwarding.');

            return $this->createRequest(
                (int) $validated['product_id'], (int) $warehouseId, (int) $validated['requested_qty'],
                (int) $request->user()->id, self::STATUS_PENDING, (int) $inventory->available_stock,
                'AI_FORECAST', [
                    'horizon_weeks' => $current['horizon_weeks'],
                    'generated_at' => $current['generated_at'],
                    'raw_demand' => $current['raw_demand'],
                    'planning_demand' => $current['planning_demand'],
                    'available_stock' => (int) $inventory->available_stock,
                    'eligible_confirmed_incoming' => 0,
                    'recommended_reorder' => $current['recommended_reorder'],
                    'requested_quantity' => (int) $validated['requested_qty'],
                    'model_version' => $current['model_version'],
                ],
            );
        }, 3);

        $this->afterRequestCreated($replenishmentRequest, true);
        return response()->json($this->requestData($replenishmentRequest), 201);
    }

    public function options(Request $request): JsonResponse
    {
        abort_unless($request->user()->isPlantManager(), 403);
        $warehouseId = $request->user()->warehouse_id;
        abort_unless($warehouseId, 403, 'A warehouse assignment is required.');

        $inventories = Inventory::query()
            ->where('warehouse_id', $warehouseId)
            ->where('available_stock', '<=', 30)
            ->with(['product:id,name,unit,item_classification', 'product.suppliers:id,name,status', 'warehouse:id,name'])
            ->orderBy('available_stock')
            ->orderBy('product_id')
            ->get();

        $requests = ReplenishmentRequest::query()
            ->where('warehouse_id', $warehouseId)
            ->whereIn('product_id', $inventories->pluck('product_id'))
            ->active()
            ->with([
                'product:id,name,unit,item_classification', 'warehouse:id,name', 'requester:id,name',
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
                'unit' => $inventory->product?->unit,
                'item_classification' => $inventory->product?->item_classification,
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
                'product:id,name,unit,item_classification', 'warehouse:id,name', 'requester:id,name',
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
        string $source = 'MANUAL',
        ?array $recommendationSnapshot = null,
    ): ReplenishmentRequest {
        $attributes = [
            'product_id' => $productId,
            'warehouse_id' => $warehouseId,
            'requested_qty' => $requestedQty,
            'priority' => StockLevel::priority($currentStock),
            'request_no' => 'RR-'.now()->format('Ymd').'-'.strtoupper(Str::random(6)),
            'requested_by' => $requestedBy,
            'status' => $status,
            'submitted_at' => $status === self::STATUS_PENDING ? now() : null,
        ];
        if ($this->supportsForecastContext()) {
            $attributes['source'] = $source;
            $attributes['recommendation_snapshot'] = $recommendationSnapshot;
        }

        return ReplenishmentRequest::create($attributes);
    }

    private function supportsForecastContext(): bool
    {
        return Schema::hasColumns('replenishment_requests', ['source', 'recommendation_snapshot']);
    }

    private function afterRequestCreated(ReplenishmentRequest $replenishmentRequest, bool $submitted): void
    {
        $replenishmentRequest->load(['product:id,name,unit,item_classification', 'warehouse:id,name', 'requester:id,name']);
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
            'unit' => $request->product?->unit,
            'item_classification' => $request->product?->item_classification,
            'requested_qty' => $request->requested_qty,
            'source' => $request->source ?? 'MANUAL',
            'recommendation_snapshot' => $request->recommendation_snapshot,
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
