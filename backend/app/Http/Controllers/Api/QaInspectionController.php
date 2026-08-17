<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\QaInspection;
use App\Models\QaInspectionItem;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\ReceivingTimeline;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Throwable;

class QaInspectionController extends Controller
{
    private const FINAL_STATUSES = ['Passed', 'Rejected', 'Partial'];

    private const ITEM_STATUSES = ['Pending', 'Passed', 'Rejected', 'Partial'];

    private function authorizeQa(Request $request): ?JsonResponse
    {
        $user = $request->user();

        if (! $user || (! $user->isAdmin() && ! $user->isQaSupervisor())) {
            return response()->json(['message' => 'Unauthorized QA access.'], 403);
        }

        return null;
    }

    private function normalizeInspectionStatus(Receiving $receiving): string
    {
        $qaInspection = $receiving->qaInspection;

        if ($qaInspection && ! $qaInspection->completed_at) {
            return 'In Progress';
        }

        return match ($receiving->status) {
            'Pending QA' => 'Pending',
            default => $receiving->status,
        };
    }

    private function actionForStatus(string $status): string
    {
        return match ($status) {
            'Pending' => 'Start Inspection',
            'In Progress' => 'Continue',
            default => 'View Inspection',
        };
    }

    private function buildItemPresentation(ReceivingItem $item, ?QaInspectionItem $inspectionItem): array
    {
        $accepted = $inspectionItem?->accepted_quantity ?? 0;
        $rejected = $inspectionItem?->rejected_quantity ?? 0;
        $result = $inspectionItem?->inspection_result ?? 'Pending';

        return [
            'id' => $item->id,
            'receiving_item_id' => $item->id,
            'product' => $item->product_name,
            'ordered_qty' => $item->delivered_quantity,
            'delivered_qty' => $item->delivered_quantity,
            'accepted_qty' => $accepted,
            'rejected_qty' => $rejected,
            'unit' => $item->unit,
            'inspection_result' => $result,
            'remarks' => $inspectionItem?->remarks,
        ];
    }

    private function presentListItem(Receiving $receiving): array
    {
        $receiving->loadMissing(['items', 'preparedBy', 'qaInspection.items']);

        $status = $this->normalizeInspectionStatus($receiving);
        $firstProduct = $receiving->items->first()?->product_name ?? '—';

        return [
            'id' => $receiving->id,
            'receiving_no' => $receiving->receiving_no,
            'purchase_order' => $receiving->purchase_order,
            'product' => $firstProduct,
            'supplier' => $receiving->supplier,
            'delivery_date' => $receiving->delivery_date?->toDateString(),
            'items' => $receiving->items->sum('delivered_quantity'),
            'prepared_by' => $receiving->preparedBy?->name,
            'inspection_status' => $status,
            'action' => $this->actionForStatus($status),
        ];
    }

    private function presentDetail(Receiving $receiving): array
    {
        $receiving->loadMissing([
            'items',
            'preparedBy',
            'timeline',
            'qaInspection.items',
            'qaInspection.inspectedBy',
            'qaInspection.submittedBy',
        ]);

        $inspectionItems = $receiving->qaInspection?->items?->keyBy('receiving_item_id') ?? collect();
        $items = $receiving->items->map(
            fn (ReceivingItem $item) => $this->buildItemPresentation($item, $inspectionItems->get($item->id))
        )->values();

        return [
            'id' => $receiving->id,
            'receiving_no' => $receiving->receiving_no,
            'purchase_order' => $receiving->purchase_order,
            'supplier' => $receiving->supplier,
            'delivery_date' => $receiving->delivery_date?->toDateString(),
            'reference_no' => $receiving->reference_no,
            'prepared_by' => $receiving->preparedBy?->name,
            'inspection_status' => $this->normalizeInspectionStatus($receiving),
            'action' => $this->actionForStatus($this->normalizeInspectionStatus($receiving)),
            'items_count' => $receiving->items->sum('delivered_quantity'),
            'products' => $items,
            'totals' => [
                'ordered_qty' => $items->sum('ordered_qty'),
                'delivered_qty' => $items->sum('delivered_qty'),
                'accepted_qty' => $items->sum('accepted_qty'),
                'rejected_qty' => $items->sum('rejected_qty'),
            ],
            'timeline' => $receiving->timeline->map(fn (ReceivingTimeline $event) => [
                'status' => $event->status,
                'performed_by' => $event->performed_by,
                'occurred_at' => $event->occurred_at,
            ])->values(),
            'inspection' => [
                'started_at' => $receiving->qaInspection?->started_at,
                'completed_at' => $receiving->qaInspection?->completed_at,
                'inspected_by' => $receiving->qaInspection?->inspectedBy?->name,
                'submitted_by' => $receiving->qaInspection?->submittedBy?->name,
            ],
        ];
    }

    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'items' => 'required|array|min:1',
            'items.*.receiving_item_id' => 'required|integer|distinct',
            'items.*.accepted_quantity' => 'required|integer|min:0',
            'items.*.rejected_quantity' => 'required|integer|min:0',
            'items.*.inspection_result' => ['required', Rule::in(self::ITEM_STATUSES)],
            'items.*.remarks' => 'nullable|string|max:1000',
        ]);
    }

    private function resolveOverallStatus(Collection $items): string
    {
        if ($items->every(fn (array $item) => $item['accepted_quantity'] === 0 && $item['rejected_quantity'] > 0)) {
            return 'Rejected';
        }

        if ($items->every(fn (array $item) => $item['accepted_quantity'] > 0 && $item['rejected_quantity'] === 0)) {
            return 'Passed';
        }

        return 'Partial';
    }

    private function ensureTimelineEvent(Receiving $receiving, string $status, string $performedBy): void
    {
        ReceivingTimeline::firstOrCreate(
            [
                'receiving_id' => $receiving->id,
                'status' => $status,
            ],
            [
                'performed_by' => $performedBy,
                'occurred_at' => now(),
            ]
        );
    }

    private function persistInspection(Request $request, int $receivingId): JsonResponse
    {
        if ($response = $this->authorizeQa($request)) {
            return $response;
        }

        $validated = $this->validatePayload($request);
        $shouldSubmit = $request->boolean('submit', true);
        $user = $request->user();

        try {
            $receiving = DB::transaction(function () use ($validated, $receivingId, $user, $shouldSubmit) {
                $receiving = Receiving::query()
                    ->with(['items', 'qaInspection.items'])
                    ->lockForUpdate()
                    ->find($receivingId);

                if (! $receiving) {
                    abort(404, 'Receiving not found.');
                }

                if ($receiving->items->isEmpty()) {
                    abort(422, 'Receiving has no products.');
                }

                $expectedItemIds = $receiving->items->pluck('id')->sort()->values();
                $submittedItems = collect($validated['items']);
                $submittedIds = $submittedItems->pluck('receiving_item_id')->sort()->values();

                if (! $submittedIds->values()->all() || $submittedIds->count() !== $expectedItemIds->count() || $submittedIds->diff($expectedItemIds)->isNotEmpty()) {
                    abort(422, 'QA inspection items must match the products on this receiving.');
                }

                foreach ($submittedItems as $itemPayload) {
                    $receivingItem = $receiving->items->firstWhere('id', $itemPayload['receiving_item_id']);
                    $total = $itemPayload['accepted_quantity'] + $itemPayload['rejected_quantity'];

                    if ($total > $receivingItem->delivered_quantity) {
                        abort(422, 'Accepted and rejected quantities cannot exceed delivered quantity.');
                    }
                }

                $inspection = QaInspection::firstOrCreate(
                    ['receiving_id' => $receiving->id],
                    [
                        'status' => 'In Progress',
                        'started_at' => now(),
                        'inspected_by_id' => $user->id,
                    ]
                );

                if (! $inspection->started_at) {
                    $inspection->forceFill([
                        'started_at' => now(),
                        'inspected_by_id' => $inspection->inspected_by_id ?? $user->id,
                        'status' => 'In Progress',
                    ])->save();
                }

                foreach ($submittedItems as $itemPayload) {
                    $receivingItem = $receiving->items->firstWhere('id', $itemPayload['receiving_item_id']);

                    QaInspectionItem::updateOrCreate(
                        [
                            'qa_inspection_id' => $inspection->id,
                            'receiving_item_id' => $receivingItem->id,
                        ],
                        [
                            'accepted_quantity' => $itemPayload['accepted_quantity'],
                            'rejected_quantity' => $itemPayload['rejected_quantity'],
                            'inspection_result' => $itemPayload['inspection_result'],
                            'remarks' => $itemPayload['remarks'] ?? null,
                        ]
                    );

                    if ($shouldSubmit) {
                        $receivingItem->update([
                            'inspection_status' => $itemPayload['inspection_result'],
                        ]);
                    }
                }

                $this->ensureTimelineEvent($receiving, 'Inspection Started', $inspection->inspectedBy?->name ?? $user->name);

                if ($shouldSubmit) {
                    $overallStatus = $this->resolveOverallStatus($submittedItems);

                    $inspection->update([
                        'status' => $overallStatus,
                        'completed_at' => now(),
                        'submitted_by_id' => $user->id,
                    ]);

                    $receiving->update(['status' => $overallStatus]);
                    $this->ensureTimelineEvent($receiving, 'Inspection Completed', $user->name);
                } else {
                    $inspection->update([
                        'status' => 'In Progress',
                        'completed_at' => null,
                        'submitted_by_id' => null,
                    ]);
                }

                return $receiving->fresh([
                    'items',
                    'preparedBy',
                    'timeline',
                    'qaInspection.items',
                    'qaInspection.inspectedBy',
                    'qaInspection.submittedBy',
                ]);
            });
        } catch (Throwable $e) {
            $status = $e->getCode();
            if (in_array($status, [404, 422], true)) {
                return response()->json(['message' => $e->getMessage()], $status);
            }

            report($e);

            return response()->json(['message' => 'Failed to save QA inspection.'], 500);
        }

        return response()->json($this->presentDetail($receiving));
    }

    public function index(Request $request): JsonResponse
    {
        if ($response = $this->authorizeQa($request)) {
            return $response;
        }

        $query = Receiving::query()->with(['items', 'preparedBy', 'qaInspection']);

        if ($request->filled('status')) {
            $query->where(function ($builder) use ($request) {
                $status = $request->string('status')->toString();

                if ($status === 'Pending') {
                    $builder->where('status', 'Pending QA')->whereDoesntHave('qaInspection');
                    return;
                }

                if ($status === 'In Progress') {
                    $builder->whereHas('qaInspection', fn ($qa) => $qa->whereNull('completed_at'));
                    return;
                }

                $builder->where('status', $status);
            });
        }

        if ($request->filled('search')) {
            $search = $request->string('search')->toString();
            $query->where(function ($builder) use ($search) {
                $builder->where('receiving_no', 'like', "%{$search}%")
                    ->orWhere('purchase_order', 'like', "%{$search}%")
                    ->orWhere('supplier', 'like', "%{$search}%");
            });
        }

        $receivings = $query->orderByDesc('created_at')->get()->map(fn (Receiving $receiving) => $this->presentListItem($receiving));

        return response()->json(['data' => $receivings]);
    }

    public function show(Request $request, int $receivingId): JsonResponse
    {
        if ($response = $this->authorizeQa($request)) {
            return $response;
        }

        $receiving = Receiving::with([
            'items',
            'preparedBy',
            'timeline',
            'qaInspection.items',
            'qaInspection.inspectedBy',
            'qaInspection.submittedBy',
        ])->find($receivingId);

        if (! $receiving) {
            return response()->json(['message' => 'Receiving not found.'], 404);
        }

        if ($receiving->items->isEmpty()) {
            return response()->json(['message' => 'Receiving has no products.'], 422);
        }

        return response()->json($this->presentDetail($receiving));
    }

    public function store(Request $request, int $receivingId): JsonResponse
    {
        return $this->persistInspection($request, $receivingId);
    }

    public function update(Request $request, int $receivingId): JsonResponse
    {
        return $this->persistInspection($request, $receivingId);
    }
}
