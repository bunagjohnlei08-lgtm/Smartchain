<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Receiving;
use App\Models\ReceivingDiscrepancy;
use App\Models\ExcessDeliveryReview;
use App\Models\QaInspection;
use App\Models\ReceivingItem;
use App\Models\ReceivingReceiptAttachment;
use App\Models\ReceivingTimeline;
use App\Models\User;
use App\Notifications\WorkflowNotification;
use App\Support\AuditLogger;
use App\Support\ExactFileDuplicateGuard;
use App\Support\WorkflowNotificationSender;
use App\Support\ReplenishmentLifecycle;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class ReceivingController extends Controller
{
    private function present(Receiving $receiving): array
    {
        $receiving->loadMissing(['items.purchaseOrderItem', 'items.product:id,item_classification', 'items.qaInspectionItem.inspection', 'items.excessReviewItem.review', 'receiptAttachments', 'timeline', 'preparedBy', 'assignedQa', 'discrepancy', 'excessDeliveryReview.items.receivingItem', 'excessDeliveryReview.items.authorizedReceivingItem', 'excessDeliveryReview.documents.uploadedBy:id,name', 'excessDeliveryReview.documentationRequestedBy:id,name', 'excessDeliveryReview.documentationAssignedTo:id,name', 'excessDeliveryReview.reviewedBy:id,name', 'replacementForCase.inspectionItem.inspection.receiving:id,receiving_no']);

        $items = $receiving->items;
        $productSummary = match (true) {
            $items->isEmpty() => '—',
            $items->count() === 1 => $items->first()->product_name,
            default => $items->first()->product_name.' +'.($items->count() - 1).' more',
        };
        $physicalQuantity = $receiving->excessDeliveryReview
            ? (int) $receiving->excessDeliveryReview->items->sum('actual_delivered_quantity')
            : (int) $items->sum('delivered_quantity');
        $authorizedQuantity = $receiving->excessDeliveryReview
            ? (int) $receiving->excessDeliveryReview->items->sum('authorized_quantity')
            : $physicalQuantity;
        $qaProcessedQuantity = (int) $items
            ->filter(fn (ReceivingItem $item) => $item->qaInspectionItem?->inspection?->completed_at)
            ->sum('delivered_quantity');
        $stockedQuantity = (int) $items
            ->filter(fn (ReceivingItem $item) => $item->stocked_in_at)
            ->sum(fn (ReceivingItem $item) => (int) ($item->qaInspectionItem?->accepted_quantity ?? 0));
        $heldQuantity = (int) $items->where('inspection_status', 'On Hold')->sum('delivered_quantity');
        $qaEligibleQuantity = (int) $items
            ->filter(fn (ReceivingItem $item) => $item->inspection_status === 'Pending QA' && ! $item->stocked_in_at)
            ->sum('delivered_quantity');
        $excessItems = $items->filter(fn (ReceivingItem $item) => $item->excessReviewItem !== null);
        $normalItems = $items->reject(fn (ReceivingItem $item) => $item->excessReviewItem !== null);
        $excessQuantity = (int) $excessItems->sum('delivered_quantity');
        $returnedExcessQuantity = (int) ($receiving->excessDeliveryReview?->items->sum('returned_quantity') ?? 0);
        $stockedExcessQuantity = (int) $excessItems->filter(fn (ReceivingItem $item) => $item->stocked_in_at)
            ->sum(fn (ReceivingItem $item) => (int) ($item->qaInspectionItem?->accepted_quantity ?? 0));
        $normalStockedQuantity = (int) $normalItems->filter(fn (ReceivingItem $item) => $item->stocked_in_at)
            ->sum(fn (ReceivingItem $item) => (int) ($item->qaInspectionItem?->accepted_quantity ?? 0));
        $quantitiesByUnit = $items->groupBy('unit')->map(function ($unitItems, $unit) use ($receiving) {
            $reviewItems = $receiving->excessDeliveryReview?->items->where('unit', $unit) ?? collect();
            $unitExcessItems = $unitItems->filter(fn (ReceivingItem $item) => $item->excessReviewItem !== null);
            $unitNormalItems = $unitItems->reject(fn (ReceivingItem $item) => $item->excessReviewItem !== null);
            return [
                'unit' => $unit,
                'physical_delivered' => $reviewItems->isNotEmpty() ? (int) $reviewItems->sum('actual_delivered_quantity') : (int) $unitItems->sum('delivered_quantity'),
                'po_authorized' => $reviewItems->isNotEmpty() ? (int) $reviewItems->sum('authorized_quantity') : (int) $unitItems->sum('delivered_quantity'),
                'normal_stocked_in' => (int) $unitNormalItems->filter(fn ($item) => $item->stocked_in_at)->sum(fn ($item) => (int) ($item->qaInspectionItem?->accepted_quantity ?? 0)),
                'excess_total' => (int) $unitExcessItems->sum('delivered_quantity'),
                'excess_stocked_in' => (int) $unitExcessItems->filter(fn ($item) => $item->stocked_in_at)->sum(fn ($item) => (int) ($item->qaInspectionItem?->accepted_quantity ?? 0)),
                'returned_excess' => (int) $reviewItems->sum('returned_quantity'),
                'qa_eligible' => (int) $unitItems->filter(fn ($item) => $item->inspection_status === 'Pending QA' && ! $item->stocked_in_at)->sum('delivered_quantity'),
            ];
        })->values();

        return [
            'id' => $receiving->id,
            'receiving_no' => $receiving->receiving_no,
            'purchase_order' => $receiving->purchase_order,
            'purchase_order_id' => $receiving->purchase_order_id,
            'supplier' => $receiving->supplier,
            'reference_no' => $receiving->reference_no,
            'notes' => $receiving->notes,
            'delivery_date' => $receiving->delivery_date?->toDateString(),
            'status' => $receiving->status,
            'is_replacement' => $receiving->replacement_for_rejection_case_id !== null,
            'replacement' => $this->presentReplacement($receiving),
            'prepared_by' => $receiving->preparedBy?->name,
            'assigned_qa_user_id' => $receiving->assigned_qa_user_id,
            'assigned_qa' => $receiving->assignedQa ? [
                'id' => $receiving->assignedQa->id,
                'name' => $receiving->assignedQa->name,
            ] : null,
            'product_summary' => $productSummary,
            'items_count' => $items->sum('delivered_quantity'),
            'quantity_summary' => [
                'physical_delivered' => $physicalQuantity,
                'po_authorized' => $authorizedQuantity,
                'qa_processed' => $qaProcessedQuantity,
                'stocked_in' => $stockedQuantity,
                'held_excess' => $heldQuantity,
                'qa_eligible' => $qaEligibleQuantity,
                'normal_stocked_in' => $normalStockedQuantity,
                'excess_total' => $excessQuantity,
                'excess_stocked_in' => $stockedExcessQuantity,
                'returned_excess' => $returnedExcessQuantity,
                'remaining_unresolved_excess' => max(0, $excessQuantity - $stockedExcessQuantity - $returnedExcessQuantity),
                'normal_status' => $normalItems->isNotEmpty() && $normalItems->every(fn (ReceivingItem $item) => $item->stocked_in_at !== null)
                    ? 'Completed'
                    : 'In Progress',
                'by_unit' => $quantitiesByUnit,
            ],
            'receipt_attachments' => $receiving->receiptAttachments->map(
                fn (ReceivingReceiptAttachment $attachment) => $this->presentReceiptAttachment($attachment, $receiving->id)
            )->values(),
            'short_quantity' => (int) ($receiving->discrepancy?->short_quantity ?? 0),
            'discrepancy' => $receiving->discrepancy ? [
                'id' => $receiving->discrepancy->id,
                'type' => $receiving->discrepancy->discrepancy_type,
                'short_quantity' => $receiving->discrepancy->short_quantity,
                'status' => $receiving->discrepancy->status,
            ] : null,
            'excess_review' => $this->presentExcessReview($receiving->excessDeliveryReview),
            'items' => $items->map(fn (ReceivingItem $item) => [
                'id' => $item->id,
                'product_id' => $item->product_id,
                'product_name' => $item->product_name,
                'item_classification' => $item->purchaseOrderItem?->item_classification ?? $item->product?->item_classification,
                'ordered_quantity' => $item->ordered_quantity,
                'delivered_quantity' => $item->delivered_quantity,
                'unit' => $item->unit,
                'inspection_status' => $item->inspection_status,
                'quantity_disposition' => $item->excessReviewItem ? 'EXCESS_HELD' : 'PO_AUTHORIZED',
                'created_at' => $item->created_at,
                'updated_at' => $item->updated_at,
            ])->values(),
            'timeline' => $receiving->timeline->map(fn (ReceivingTimeline $event) => [
                'status' => $event->status,
                'performed_by' => $event->performed_by,
                'occurred_at' => $event->occurred_at,
            ])->values(),
            'created_at' => $receiving->created_at,
            'updated_at' => $receiving->updated_at,
        ];
    }

    private function presentExcessReview(?ExcessDeliveryReview $review): ?array
    {
        if (! $review) return null;
        return [
            'id' => $review->id, 'reference' => $review->reference, 'status' => $review->status,
            'cost_resolution' => $review->cost_resolution, 'financial_reconciliation_status' => $review->financial_reconciliation_status,
            'rejection_reason' => $review->rejection_reason, 'reviewed_by' => $review->reviewedBy?->name,
            'documentation_type' => $review->documentation_type, 'documentation_requested_by' => $review->documentationRequestedBy?->name,
            'documentation_assigned_to' => $review->documentationAssignedTo?->name,
            'documentation_requested_at' => $review->documentation_requested_at?->toIso8601String(),
            'documentation_submitted_at' => $review->documentation_submitted_at?->toIso8601String(),
            'return_status' => $review->return_status, 'return_date' => $review->return_date?->toDateString(),
            'return_completed_at' => $review->return_completed_at?->toIso8601String(),
            'items' => $review->items->map(fn ($item) => ['id' => $item->id, 'product' => $item->receivingItem?->product_name ?? $item->authorizedReceivingItem?->product_name, 'authorized_quantity' => $item->authorized_quantity, 'actual_delivered_quantity' => $item->actual_delivered_quantity, 'excess_quantity' => $item->excess_quantity, 'return_requested_quantity' => $item->return_requested_quantity, 'returned_quantity' => $item->returned_quantity, 'unit' => $item->unit])->values(),
            'documents' => $review->documents->map(fn ($document) => ['id' => $document->id, 'internal_reference' => $document->internal_reference, 'purpose' => $document->purpose, 'document_type' => $document->document_type, 'external_reference' => $document->external_reference, 'name' => $document->original_name, 'mime_type' => $document->mime_type, 'file_size' => $document->file_size, 'uploaded_by' => $document->uploadedBy?->name, 'created_at' => $document->created_at?->toIso8601String(), 'url' => "/api/excess-delivery-reviews/{$review->id}/documents/{$document->id}"])->values(),
        ];
    }

    private function presentReplacement(Receiving $receiving): ?array
    {
        $case = $receiving->replacementForCase;
        if (! $case) {
            return null;
        }
        $original = $case->inspectionItem?->inspection?->receiving;

        return [
            'rejection_case_id' => $case->id,
            'rejection_reference' => sprintf('RJ-%06d', $case->id),
            'original_receiving_id' => $original?->id,
            'original_receiving_no' => $original?->receiving_no,
            'expected_quantity' => (int) $receiving->items->sum('ordered_quantity'),
            'awaiting_delivery' => $receiving->status === Receiving::STATUS_AWAITING_REPLACEMENT,
        ];
    }

    private function presentReceiptAttachment(ReceivingReceiptAttachment $attachment, int $receivingId): array
    {
        return [
            'id' => $attachment->id,
            'original_name' => $attachment->original_name,
            'mime_type' => $attachment->mime_type,
            'file_size' => $attachment->file_size,
            'view_url' => "/receivings/{$receivingId}/receipts/{$attachment->id}",
            'created_at' => $attachment->created_at,
        ];
    }

    private function receiptValidationRules(): array
    {
        return [
            'receipts' => 'required|array|min:1|max:4',
            'receipts.*' => [
                'file', 'mimes:jpeg,jpg,png,pdf',
                'mimetypes:image/jpeg,image/png,application/pdf',
                'extensions:jpeg,jpg,png,pdf', 'max:10240',
            ],
        ];
    }

    private function receiptValidationMessages(): array
    {
        return [
            'receipts.required' => 'At least one supplier delivery receipt is required.',
            'receipts.min' => 'At least one supplier delivery receipt is required.',
            'receipts.max' => 'A receiving may contain no more than 4 supplier receipt files.',
            'receipts.*.file' => 'Each supplier receipt must be a JPG, PNG, or PDF file.',
            'receipts.*.mimes' => 'Each supplier receipt must be a JPG, PNG, or PDF file.',
            'receipts.*.mimetypes' => 'Each supplier receipt must be a JPG, PNG, or PDF file.',
            'receipts.*.extensions' => 'Each supplier receipt must be a JPG, PNG, or PDF file.',
            'receipts.*.max' => 'Each supplier receipt must not exceed 10 MB.',
            'receipts.*.uploaded' => 'A supplier receipt could not be uploaded. Use JPG, PNG, or PDF files up to 10 MB each.',
        ];
    }

    /** @param array<int|string, string> $receiptHashes */
    private function storeReceiptAttachments(Receiving $receiving, Request $request, array $receiptHashes, array &$storedPaths): void
    {
        foreach ($request->file('receipts', []) as $index => $upload) {
            $storedPath = Storage::disk('local')->putFile("receiving-receipts/{$receiving->id}", $upload);
            if (! $storedPath) {
                throw new \RuntimeException('Receiving receipt storage failed.');
            }
            $storedPaths[] = $storedPath;
            $receiving->receiptAttachments()->create([
                'original_name' => Str::limit(basename($upload->getClientOriginalName()), 255, ''),
                'stored_path' => $storedPath,
                'mime_type' => $upload->getMimeType(),
                'file_size' => $upload->getSize(),
                'file_sha256' => $receiptHashes[$index],
                'uploaded_by' => $request->user()->id,
            ]);
        }
    }

    private function cleanupReceiptFiles(array $paths): void
    {
        foreach ($paths as $path) {
            if (preg_match('~^receiving-receipts/\d+/[A-Za-z0-9]+\.(?:jpe?g|png|pdf)$~', $path)) {
                try {
                    if (! Storage::disk('local')->delete($path)) {
                        report(new \RuntimeException('Receiving receipt cleanup failed.'));
                    }
                } catch (Throwable $exception) {
                    report($exception);
                }
            }
        }
    }

    public function index(Request $request)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        $validated = $request->validate([
            'view' => ['nullable', Rule::in(['active', 'history'])],
            'status' => ['nullable', 'string', 'max:40'],
            'supplier' => ['nullable', 'string', 'max:255'],
            'search' => ['nullable', 'string', 'max:255'],
            'date' => ['nullable', Rule::in(['today', 'week', 'month'])],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $view = $validated['view'] ?? 'active';

        $query = Receiving::query()->with(['items', 'receiptAttachments', 'timeline', 'preparedBy', 'assignedQa', 'discrepancy', 'replacementForCase.inspectionItem.inspection.receiving:id,receiving_no']);
        $this->applyWorkflowView($query, $view);

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        if (! empty($validated['supplier'])) {
            $query->where('supplier', $validated['supplier']);
        }

        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($q) use ($search) {
                $q->where('receiving_no', 'like', "%{$search}%")
                    ->orWhere('purchase_order', 'like', "%{$search}%")
                    ->orWhere('supplier', 'like', "%{$search}%");
            });
        }

        if (! empty($validated['date'])) {
            if ($validated['date'] === 'today') {
                $query->whereDate('delivery_date', now()->toDateString());
            } else {
                [$from, $to] = $validated['date'] === 'week'
                    ? [now()->startOfWeek()->toDateString(), now()->endOfWeek()->toDateString()]
                    : [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()];
                $query->whereBetween('delivery_date', [$from, $to]);
            }
        }

        $summaryQuery = Receiving::query();
        $this->applyWorkflowView($summaryQuery, $view);
        $summary = [
            'total' => (clone $summaryQuery)->count(),
            'pending_qa' => (clone $summaryQuery)->where('status', 'Pending QA')->count(),
            'passed' => (clone $summaryQuery)->where('status', 'Passed')->count(),
            'rejected' => (clone $summaryQuery)->where('status', 'Rejected')->count(),
            'partial' => (clone $summaryQuery)->where('status', 'Partial')->count(),
        ];
        $suppliers = (clone $summaryQuery)->distinct()->orderBy('supplier')->pluck('supplier')->values();

        $paginator = $query
            ->orderByDesc($view === 'history' ? 'updated_at' : 'created_at')
            ->paginate($validated['per_page'] ?? 5)
            ->withQueryString();

        return response()->json([
            'data' => $paginator->getCollection()->map(fn (Receiving $receiving) => $this->present($receiving))->values(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'from' => $paginator->firstItem(),
                'to' => $paginator->lastItem(),
            ],
            'summary' => $summary,
            'suppliers' => $suppliers,
        ]);
    }

    private function applyWorkflowView(Builder $query, string $view): void
    {
        $applyUnresolvedRejections = fn (Builder $items) => $items
            ->where('rejected_quantity', '>', 0)
            ->where(function (Builder $cases) {
                $cases->whereDoesntHave('supplierRejectionCase')
                    ->orWhereHas('supplierRejectionCase', fn (Builder $case) => $case->where('status', '<>', 'RESOLVED'));
            });
        $openDiscrepancyStatuses = [
            ReceivingDiscrepancy::STATUS_REPORTED,
            ReceivingDiscrepancy::STATUS_CONTACTED,
            ReceivingDiscrepancy::STATUS_AWAITING_RESPONSE,
            ReceivingDiscrepancy::STATUS_AWAITING_BALANCE,
            ReceivingDiscrepancy::STATUS_UNDER_RESOLUTION,
        ];

        if ($view === 'history') {
            $query->whereHas('qaInspection', fn (Builder $inspection) => $inspection->whereNotNull('completed_at'))
                ->whereDoesntHave('items', fn (Builder $items) => $items
                    ->whereNull('stocked_in_at')
                    ->whereHas('qaInspectionItem', fn (Builder $item) => $item->where('accepted_quantity', '>', 0)))
                ->whereDoesntHave('qaInspection.items', $applyUnresolvedRejections)
                ->whereDoesntHave('discrepancy', fn (Builder $discrepancy) => $discrepancy->whereIn('status', $openDiscrepancyStatuses));

            return;
        }

        $query->where(function (Builder $active) use ($applyUnresolvedRejections, $openDiscrepancyStatuses) {
            $active->whereDoesntHave('qaInspection', fn (Builder $inspection) => $inspection->whereNotNull('completed_at'))
                ->orWhereHas('items', fn (Builder $items) => $items
                    ->whereNull('stocked_in_at')
                    ->whereHas('qaInspectionItem', fn (Builder $item) => $item->where('accepted_quantity', '>', 0)))
                ->orWhereHas('qaInspection.items', $applyUnresolvedRejections)
                ->orWhereHas('discrepancy', fn (Builder $discrepancy) => $discrepancy->whereIn('status', $openDiscrepancyStatuses));
        });
    }

    public function show(Request $request, $id)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        $receiving = Receiving::findOrFail($id);

        return response()->json($this->present($receiving));
    }

    private function generateReceivingNo(): string
    {
        return Receiving::nextReceivingNo();
    }

    public function store(Request $request, ReplenishmentLifecycle $replenishmentLifecycle)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        $validated = $request->validate([
            'purchase_order_id' => 'required|integer|exists:purchase_orders,id',
            'reference_no' => 'nullable|string|max:255',
            'delivery_date' => 'required|date',
            'items' => 'required|array|min:1',
            'items.*.purchase_order_item_id' => 'required|integer|distinct|exists:purchase_order_items,id',
            'items.*.delivered_quantity' => 'required|integer|min:0',
            ...$this->receiptValidationRules(),
        ], $this->receiptValidationMessages());

        $receiptHashes = ExactFileDuplicateGuard::hashes(
            $request->file('receipts', []),
            [],
            'receipts',
            'Duplicate file detected. This exact receipt has already been added.',
        );

        $storedPaths = [];
        try {
            $receiving = DB::transaction(function () use ($validated, $request, $receiptHashes, &$storedPaths, $replenishmentLifecycle) {
                $purchaseOrder = PurchaseOrder::query()->with('items')->lockForUpdate()->findOrFail($validated['purchase_order_id']);
                abort_unless(in_array($purchaseOrder->status, ['Approved', 'Sent to Supplier', 'Partially Received'], true), 422, 'This Purchase Order is not active for receiving.');

                $submitted = collect($validated['items'])->keyBy('purchase_order_item_id');
                abort_unless($submitted->keys()->sort()->values()->all() === $purchaseOrder->items->pluck('id')->sort()->values()->all(), 422, 'Receiving items must exactly match the selected Purchase Order.');
                abort_unless($submitted->contains(fn ($item) => (int) $item['delivered_quantity'] > 0), 422, 'At least one product must have a delivered quantity greater than zero.');

                $previouslyReceived = ReceivingItem::query()
                    // Replacement deliveries re-supply rejected goods and do not consume the PO balance.
                    ->whereHas('receiving', fn ($query) => $query->where('purchase_order_id', $purchaseOrder->id)->whereNull('replacement_for_rejection_case_id'))
                    // Authorized lines already consume the PO even while the separate excess is held.
                    ->where(fn ($query) => $query->whereDoesntHave('excessReviewItem')->orWhereHas('excessReviewItem.review', fn ($review) => $review->where('status', ExcessDeliveryReview::STATUS_APPROVED)))
                    ->selectRaw('product_name, SUM(delivered_quantity) as quantity')
                    ->groupBy('product_name')->pluck('quantity', 'product_name');

                foreach ($purchaseOrder->items as $poItem) {
                    $quantity = (int) $submitted[$poItem->id]['delivered_quantity'];
                    $remaining = max(0, $poItem->ordered_quantity - (int) ($previouslyReceived[$poItem->product_name] ?? 0));
                    abort_if($quantity > $remaining, 422, "Delivered quantity for {$poItem->product_name} exceeds the remaining Purchase Order quantity of {$remaining}.");
                }

                $receiving = Receiving::create([
                    'receiving_no' => $this->generateReceivingNo(),
                    'purchase_order_id' => $purchaseOrder->id,
                    'purchase_order' => $purchaseOrder->po_number,
                    'supplier' => $purchaseOrder->supplier_name,
                    'reference_no' => $validated['reference_no'] ?? null,
                    'delivery_date' => $validated['delivery_date'],
                    'status' => 'Pending QA',
                    'prepared_by_id' => $request->user()->id,
                ]);

                $this->storeReceiptAttachments($receiving, $request, $receiptHashes, $storedPaths);

                foreach ($purchaseOrder->items as $poItem) {
                    $itemData = $submitted[$poItem->id];
                    if ((int) $itemData['delivered_quantity'] === 0) {
                        continue;
                    }
                    $product = $poItem->product_id ? Product::findOrFail($poItem->product_id) : Product::query()->where('name', $poItem->product_name)->firstOrFail();

                    ReceivingItem::create([
                        'receiving_id' => $receiving->id,
                        'purchase_order_item_id' => $poItem->id,
                        'product_id' => $product->id,
                        'product_name' => $poItem->product_name,
                        'ordered_quantity' => $poItem->ordered_quantity,
                        'delivered_quantity' => $itemData['delivered_quantity'],
                        'unit' => $poItem->unit ?? $product->unit,
                        'inspection_status' => 'Pending QA',
                    ]);
                }

                $now = now();

                ReceivingTimeline::insert([
                    [
                        'receiving_id' => $receiving->id,
                        'status' => 'Receiving Created',
                        'performed_by' => $request->user()->name,
                        'occurred_at' => $now,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ],
                    [
                        'receiving_id' => $receiving->id,
                        'status' => 'Pending QA Inspection',
                        'performed_by' => 'System',
                        'occurred_at' => $now,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ],
                ]);

                $receivedNow = $purchaseOrder->items->every(function ($poItem) use ($previouslyReceived, $submitted) {
                    return (int) ($previouslyReceived[$poItem->product_name] ?? 0)
                        + (int) $submitted[$poItem->id]['delivered_quantity'] >= $poItem->ordered_quantity;
                });
                $expectedNow = $purchaseOrder->items->sum(fn ($poItem) => max(0, $poItem->ordered_quantity - (int) ($previouslyReceived[$poItem->product_name] ?? 0)));
                $deliveredNow = (int) $submitted->sum('delivered_quantity');
                $shortNow = max(0, $expectedNow - $deliveredNow);

                if ($shortNow > 0) {
                    ReceivingDiscrepancy::firstOrCreate(
                        ['receiving_id' => $receiving->id],
                        [
                            'purchase_order_id' => $purchaseOrder->id,
                            'supplier_id' => $purchaseOrder->supplier_id,
                            'discrepancy_type' => ReceivingDiscrepancy::TYPE_SHORT_DELIVERY,
                            'expected_quantity' => $expectedNow,
                            'delivered_quantity' => $deliveredNow,
                            'short_quantity' => $shortNow,
                            'status' => ReceivingDiscrepancy::STATUS_REPORTED,
                            'reported_by_id' => $request->user()->id,
                            'reported_at' => $now,
                        ]
                    );
                    ReceivingTimeline::create([
                        'receiving_id' => $receiving->id,
                        'status' => 'Short Delivery Reported',
                        'performed_by' => $request->user()->name,
                        'occurred_at' => $now,
                    ]);
                }

                $purchaseOrder->update(['status' => $receivedNow ? 'Completed' : 'Partially Received']);
                $replenishmentLifecycle->synchronize($purchaseOrder);
                if ($receivedNow) {
                    $resolvedCases = ReceivingDiscrepancy::query()
                        ->where('purchase_order_id', $purchaseOrder->id)
                        ->whereIn('status', [ReceivingDiscrepancy::STATUS_REPORTED, ReceivingDiscrepancy::STATUS_CONTACTED, ReceivingDiscrepancy::STATUS_AWAITING_RESPONSE, ReceivingDiscrepancy::STATUS_AWAITING_BALANCE, ReceivingDiscrepancy::STATUS_UNDER_RESOLUTION])
                        ->get();
                    foreach ($resolvedCases as $case) {
                        $case->update([
                            'status' => ReceivingDiscrepancy::STATUS_RESOLVED,
                            'resolution_notes' => 'Outstanding balance was received.',
                            'resolved_by_receiving_id' => $receiving->id,
                            'resolved_at' => $now,
                        ]);
                        AuditLogger::success('SHORT_DELIVERY_RESOLVED', AuditLogger::MODULE_RECEIVING, [
                            'resource' => $case,
                            'resource_label' => 'Discrepancy #'.$case->id,
                            'details' => "Outstanding balance received in {$receiving->receiving_no}",
                            'metadata' => ['purchase_order_id' => $purchaseOrder->id, 'receiving_id' => $receiving->id, 'short_quantity' => $case->short_quantity],
                        ]);
                    }
                }

                AuditLogger::success($shortNow > 0 ? 'SHORT_DELIVERY_DETECTED' : 'RECEIVING_CREATED', AuditLogger::MODULE_RECEIVING, [
                    'resource' => $receiving,
                    'resource_label' => $receiving->receiving_no,
                    'details' => $shortNow > 0 ? "Short delivery of {$shortNow} unit(s) reported" : "Created {$receiving->receiving_no}",
                    'metadata' => ['purchase_order_id' => $purchaseOrder->id, 'delivered_quantity' => $deliveredNow, 'short_quantity' => $shortNow],
                ]);
                AuditLogger::success('RECEIVING_RECEIPT_ATTACHED', AuditLogger::MODULE_RECEIVING, [
                    'resource' => $receiving,
                    'resource_label' => $receiving->receiving_no,
                    'details' => 'Supplier delivery receipt evidence attached',
                    'metadata' => ['receiving_id' => $receiving->id, 'attachment_count' => count($storedPaths)],
                ]);

                return $receiving;
            });
        } catch (Throwable $exception) {
            $this->cleanupReceiptFiles($storedPaths);
            throw $exception;
        }

        return response()->json($this->present($receiving), 201);
    }

    public function qaAssignees(Request $request)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        return response()->json(['data' => User::query()
            ->select(['users.id', 'users.name'])
            ->where('users.status', 'ACTIVE')
            ->whereHas('role', fn ($query) => $query->where('slug', 'QA_SUPERVISOR'))
            ->orderBy('users.name')
            ->get()]);
    }

    public function assignQa(Request $request, Receiving $receiving)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        $validated = $request->validate([
            'qa_user_id' => ['required', 'integer', 'exists:users,id'],
            'operation' => ['nullable', Rule::in(['assign', 'reassign', 'assign_excess', 'reassign_excess'])],
            'excess_review_id' => ['nullable', 'integer', 'exists:excess_delivery_reviews,id'],
        ]);
        $operation = $validated['operation'] ?? 'assign';
        if (in_array($operation, ['assign_excess', 'reassign_excess'], true) && empty($validated['excess_review_id'])) {
            throw ValidationException::withMessages(['excess_review_id' => ['The excess exception is required for excess QA assignment.']]);
        }
        $qa = User::query()->with('role')->find($validated['qa_user_id']);

        if (! $qa || $qa->status !== 'ACTIVE' || ! $qa->isQaSupervisor()) {
            return response()->json([
                'message' => 'The selected QA Supervisor is not active or is not eligible for assignment.',
                'errors' => ['qa_user_id' => ['The selected QA Supervisor is not active or is not eligible for assignment.']],
            ], 422);
        }

        if ($receiving->status === Receiving::STATUS_AWAITING_REPLACEMENT) {
            return response()->json(['message' => 'Confirm the replacement delivery before assigning QA.'], 422);
        }

        $previousQaId = null;
        $assignmentOutcome = 'assigned';
        $inspectionCycle = 1;
        $shouldNotify = true;
        $receiving = DB::transaction(function () use ($receiving, $qa, $request, $operation, $validated, &$previousQaId, &$assignmentOutcome, &$inspectionCycle, &$shouldNotify) {
            $excessReview = in_array($operation, ['assign_excess', 'reassign_excess'], true)
                ? ExcessDeliveryReview::query()->lockForUpdate()->findOrFail($validated['excess_review_id'])
                : null;
            if ($excessReview) {
                abort_unless($excessReview->receiving_id === $receiving->id, 422, 'The excess exception does not belong to this Receiving.');
                abort_unless($excessReview->submitted_by_id === $request->user()->id, 403, 'Only the responsible Plant Manager may assign this excess to QA.');
                abort_unless($excessReview->status === ExcessDeliveryReview::STATUS_APPROVED, 422, 'Only Admin-approved excess may be assigned to QA.');
            }
            $locked = Receiving::query()
                ->with(['items.excessReviewItem.review', 'qaInspection.items'])
                ->lockForUpdate()
                ->findOrFail($receiving->id);

            $previousQaId = $locked->assigned_qa_user_id;
            $inspection = $locked->qaInspection;

            if ($inspection && ! $inspection->completed_at) {
                $assignedItemIds = $inspection->items->pluck('receiving_item_id')->sort()->values();
                abort_if($assignedItemIds->isEmpty(), 422, 'This QA assignment has no quantity snapshot.');
                if ($excessReview) {
                    $snapshotItems = $locked->items->whereIn('id', $assignedItemIds);
                    abort_unless($snapshotItems->count() === $assignedItemIds->count(), 422, 'The active QA cycle snapshot is invalid.');
                    abort_unless($snapshotItems->every(fn (ReceivingItem $item) => $item->excessReviewItem?->excess_delivery_review_id === $excessReview->id), 422, 'A different QA cycle is already active for this Receiving.');
                }
                $inspectionCycle = (int) $inspection->cycle_number;
                if ((int) $inspection->inspected_by_id === (int) $qa->id) {
                    $assignmentOutcome = 'unchanged';
                    $shouldNotify = false;
                } else {
                    abort_if(
                        in_array($operation, ['assign', 'assign_excess'], true),
                        422,
                        'This QA cycle is already assigned. Use the reassignment action to select a different QA Supervisor.'
                    );
                    abort_if($inspection->started_at, 422, 'An inspection that has already started cannot be reassigned.');
                    $inspection->update(['inspected_by_id' => $qa->id]);
                    $assignmentOutcome = 'reassigned';
                }
            } else {
                abort_if(
                    in_array($operation, ['reassign', 'reassign_excess'], true),
                    422,
                    'There is no active QA cycle eligible for reassignment.'
                );
                $eligibleItems = $locked->items
                    ->filter(fn (ReceivingItem $item) => $item->inspection_status === 'Pending QA' && ! $item->stocked_in_at)
                    ->values();
                abort_if($eligibleItems->isEmpty(), 422, 'This receiving has no uninspected quantity eligible for QA.');

                if ($excessReview) {
                    abort_unless($eligibleItems->every(fn (ReceivingItem $item) => $item->excessReviewItem?->excess_delivery_review_id === $excessReview->id), 422, 'Only the approved excess quantity may enter this QA cycle.');
                }

                foreach ($eligibleItems as $item) {
                    if ($item->excessReviewItem) {
                        abort_unless(
                            $item->excessReviewItem->review?->status === ExcessDeliveryReview::STATUS_APPROVED,
                            422,
                            'Held excess requires valid Admin approval before QA assignment.'
                        );
                    }
                }

                $cycleNumber = (int) QaInspection::query()
                    ->where('receiving_id', $locked->id)
                    ->max('cycle_number') + 1;
                $inspection = $locked->qaInspections()->create([
                    'cycle_number' => max(1, $cycleNumber),
                    'status' => 'Pending',
                    'inspected_by_id' => $qa->id,
                ]);
                $inspectionCycle = (int) $inspection->cycle_number;
                $assignmentOutcome = $excessReview ? 'excess_cycle_created' : 'assigned';
                $inspection->items()->createMany($eligibleItems->map(fn (ReceivingItem $item) => [
                    'receiving_item_id' => $item->id,
                    'accepted_quantity' => 0,
                    'rejected_quantity' => 0,
                    'inspection_result' => 'Pending',
                ])->all());
            }

            $locked->update(['assigned_qa_user_id' => $qa->id]);

            return $locked->fresh(['items', 'qaInspection.items']);
        });

        if ($assignmentOutcome !== 'unchanged') {
            $timelineStatus = match ($assignmentOutcome) {
                'excess_cycle_created' => "Excess QA Cycle {$inspectionCycle} Assigned",
                'reassigned' => "QA Cycle {$inspectionCycle} Reassigned",
                default => 'QA Assigned',
            };
            ReceivingTimeline::create(['receiving_id' => $receiving->id, 'status' => $timelineStatus, 'performed_by' => $request->user()->name, 'occurred_at' => now()]);
        }

        if ($assignmentOutcome !== 'unchanged') {
            AuditLogger::success('QA_ASSIGNED', AuditLogger::MODULE_RECEIVING, [
                'resource' => $receiving,
                'resource_label' => $receiving->receiving_no,
                'details' => $assignmentOutcome === 'reassigned' ? "Reassigned QA cycle {$inspectionCycle} to {$qa->name}" : "Assigned QA cycle {$inspectionCycle} to {$qa->name}",
                'metadata' => [
                    'receiving_id' => $receiving->id,
                    'assigned_qa_user_id' => $qa->id,
                    'assigned_qa_name' => $qa->name,
                    'previous_assigned_qa_user_id' => $previousQaId,
                    'assignment_outcome' => $assignmentOutcome,
                    'cycle_number' => $inspectionCycle,
                ],
            ]);
        }

        if ($shouldNotify) {
            $notificationMessage = $inspectionCycle > 1
                ? "Receiving #{$receiving->receiving_no}, QA cycle {$inspectionCycle}, was assigned to you."
                : "Receiving #{$receiving->receiving_no} was assigned to you.";
            WorkflowNotificationSender::send($qa, new WorkflowNotification(
                $assignmentOutcome === 'excess_cycle_created' ? 'Excess QA Inspection Assigned' : 'QA Inspection Assigned',
                $notificationMessage,
                'info', $receiving->receiving_no, 'Quality Inspection',
            ));
        }

        return response()->json([
            ...$this->present($receiving->fresh()),
            'qa_assignment' => ['outcome' => $assignmentOutcome, 'cycle_number' => $inspectionCycle],
        ]);
    }

    public function confirmReplacementDelivery(Request $request, Receiving $receiving)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        $validated = $request->validate([
            'delivery_date' => 'required|date',
            'reference_no' => 'nullable|string|max:255',
            'items' => 'required|array|min:1',
            'items.*.receiving_item_id' => 'required|integer|distinct',
            'items.*.delivered_quantity' => 'required|integer|min:0',
            ...$this->receiptValidationRules(),
        ], $this->receiptValidationMessages());

        ExactFileDuplicateGuard::hashes(
            $request->file('receipts', []),
            [],
            'receipts',
            'Duplicate file detected. This exact receipt has already been added.',
        );

        $storedPaths = [];
        try {
            $receiving = DB::transaction(function () use ($validated, $request, $receiving, &$storedPaths) {
                $locked = Receiving::query()->with('items')->lockForUpdate()->findOrFail($receiving->id);
                abort_unless($locked->replacement_for_rejection_case_id !== null, 422, 'Only replacement receivings can be confirmed this way.');
                abort_unless($locked->status === Receiving::STATUS_AWAITING_REPLACEMENT, 422, 'This replacement delivery has already been confirmed.');
                if ($locked->receiptAttachments()->count() + count($request->file('receipts', [])) > 4) {
                    throw ValidationException::withMessages([
                        'receipts' => ['A receiving may contain no more than 4 supplier receipt files.'],
                    ]);
                }

                $submitted = collect($validated['items'])->keyBy('receiving_item_id');
                abort_unless($submitted->keys()->sort()->values()->all() === $locked->items->pluck('id')->sort()->values()->all(), 422, 'Delivered items must exactly match the expected replacement items.');
                abort_unless($submitted->contains(fn ($item) => (int) $item['delivered_quantity'] > 0), 422, 'At least one product must have a delivered quantity greater than zero.');

                foreach ($locked->items as $item) {
                    $quantity = (int) $submitted[$item->id]['delivered_quantity'];
                    abort_if($quantity > (int) $item->ordered_quantity, 422, "Delivered quantity for {$item->product_name} exceeds the expected replacement quantity of {$item->ordered_quantity}.");
                }
                foreach ($locked->items as $item) {
                    $item->update(['delivered_quantity' => (int) $submitted[$item->id]['delivered_quantity'], 'inspection_status' => 'Pending QA']);
                }

                $lockedReceiptHashes = ExactFileDuplicateGuard::hashes(
                    $request->file('receipts', []),
                    $locked->receiptAttachments()->whereNotNull('file_sha256')->pluck('file_sha256'),
                    'receipts',
                    'Duplicate file detected. This exact receipt has already been added.',
                );

                $this->storeReceiptAttachments($locked, $request, $lockedReceiptHashes, $storedPaths);

                $locked->update([
                    'status' => 'Pending QA',
                    'delivery_date' => $validated['delivery_date'],
                    'reference_no' => $validated['reference_no'] ?? $locked->reference_no,
                ]);
                $now = now();
                foreach (['Replacement Delivered' => $request->user()->name, 'Pending QA Inspection' => 'System'] as $status => $performedBy) {
                    ReceivingTimeline::create(['receiving_id' => $locked->id, 'status' => $status, 'performed_by' => $performedBy, 'occurred_at' => $now]);
                }

                AuditLogger::success('REPLACEMENT_DELIVERY_CONFIRMED', AuditLogger::MODULE_RECEIVING, [
                    'resource' => $locked,
                    'resource_label' => $locked->receiving_no,
                    'details' => "Confirmed replacement delivery for {$locked->receiving_no}",
                    'metadata' => [
                        'receiving_id' => $locked->id,
                        'rejection_case_id' => $locked->replacement_for_rejection_case_id,
                        'delivered_quantity' => (int) $submitted->sum('delivered_quantity'),
                    ],
                ]);
                AuditLogger::success('RECEIVING_RECEIPT_ATTACHED', AuditLogger::MODULE_RECEIVING, [
                    'resource' => $locked,
                    'resource_label' => $locked->receiving_no,
                    'details' => 'Supplier replacement delivery receipt evidence attached',
                    'metadata' => ['receiving_id' => $locked->id, 'attachment_count' => count($storedPaths)],
                ]);

                return $locked;
            });
        } catch (Throwable $exception) {
            $this->cleanupReceiptFiles($storedPaths);
            throw $exception;
        }

        return response()->json($this->present($receiving->fresh()));
    }

    public function receiptAttachment(
        Request $request,
        Receiving $receiving,
        ReceivingReceiptAttachment $receiptAttachment
    ): JsonResponse|StreamedResponse {
        abort_unless($request->user()?->isPlantManager() || $request->user()?->isAdmin(), 403, 'Receiving access is required.');
        abort_unless($receiptAttachment->receiving_id === $receiving->id, 404);

        if (! Storage::disk('local')->exists($receiptAttachment->stored_path)) {
            return response()->json(['message' => 'Supplier receipt not found.'], 404);
        }

        return Storage::disk('local')->response($receiptAttachment->stored_path, $receiptAttachment->original_name, [
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store',
            'Content-Type' => $receiptAttachment->mime_type,
            'Content-Disposition' => 'inline; filename="'.str_replace(['"', "\r", "\n"], '', $receiptAttachment->original_name).'"',
        ]);
    }
}
