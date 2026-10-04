<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Receiving;
use App\Models\ReceivingDiscrepancy;
use App\Models\ReceivingItem;
use App\Models\ReceivingReceiptAttachment;
use App\Models\ReceivingTimeline;
use App\Models\User;
use App\Notifications\WorkflowNotification;
use App\Support\AuditLogger;
use App\Support\WorkflowNotificationSender;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class ReceivingController extends Controller
{
    private function present(Receiving $receiving): array
    {
        $receiving->loadMissing(['items', 'receiptAttachments', 'timeline', 'preparedBy', 'assignedQa', 'discrepancy', 'replacementForCase.inspectionItem.inspection.receiving:id,receiving_no']);

        $items = $receiving->items;
        $productSummary = match (true) {
            $items->isEmpty() => '—',
            $items->count() === 1 => $items->first()->product_name,
            default => $items->first()->product_name.' +'.($items->count() - 1).' more',
        };

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
            'items' => $items->map(fn (ReceivingItem $item) => [
                'id' => $item->id,
                'product_id' => $item->product_id,
                'product_name' => $item->product_name,
                'ordered_quantity' => $item->ordered_quantity,
                'delivered_quantity' => $item->delivered_quantity,
                'unit' => $item->unit,
                'inspection_status' => $item->inspection_status,
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
            'receipts' => 'required|array|min:1|max:3',
            'receipts.*' => [
                'file', 'mimes:jpeg,jpg,png,pdf',
                'mimetypes:image/jpeg,image/png,application/pdf',
                'extensions:jpeg,jpg,png,pdf', 'max:5120',
            ],
        ];
    }

    private function receiptValidationMessages(): array
    {
        return [
            'receipts.required' => 'At least one supplier delivery receipt is required.',
            'receipts.min' => 'At least one supplier delivery receipt is required.',
            'receipts.max' => 'A receiving may contain no more than 3 supplier receipt files.',
            'receipts.*.file' => 'Each supplier receipt must be a JPG, PNG, or PDF file.',
            'receipts.*.mimes' => 'Each supplier receipt must be a JPG, PNG, or PDF file.',
            'receipts.*.mimetypes' => 'Each supplier receipt must be a JPG, PNG, or PDF file.',
            'receipts.*.extensions' => 'Each supplier receipt must be a JPG, PNG, or PDF file.',
            'receipts.*.max' => 'Each supplier receipt must not exceed 5 MB.',
            'receipts.*.uploaded' => 'A supplier receipt could not be uploaded. Use JPG, PNG, or PDF files up to 5 MB each.',
        ];
    }

    private function storeReceiptAttachments(Receiving $receiving, Request $request, array &$storedPaths): void
    {
        foreach ($request->file('receipts', []) as $upload) {
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

    public function store(Request $request)
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

        $storedPaths = [];
        try {
            $receiving = DB::transaction(function () use ($validated, $request, &$storedPaths) {
                $purchaseOrder = PurchaseOrder::query()->with('items')->lockForUpdate()->findOrFail($validated['purchase_order_id']);
                abort_unless(in_array($purchaseOrder->status, ['Approved', 'Sent to Supplier', 'Partially Received'], true), 422, 'This Purchase Order is not active for receiving.');

                $submitted = collect($validated['items'])->keyBy('purchase_order_item_id');
                abort_unless($submitted->keys()->sort()->values()->all() === $purchaseOrder->items->pluck('id')->sort()->values()->all(), 422, 'Receiving items must exactly match the selected Purchase Order.');
                abort_unless($submitted->contains(fn ($item) => (int) $item['delivered_quantity'] > 0), 422, 'At least one product must have a delivered quantity greater than zero.');

                $previouslyReceived = ReceivingItem::query()
                    // Replacement deliveries re-supply rejected goods and do not consume the PO balance.
                    ->whereHas('receiving', fn ($query) => $query->where('purchase_order_id', $purchaseOrder->id)->whereNull('replacement_for_rejection_case_id'))
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

                $this->storeReceiptAttachments($receiving, $request, $storedPaths);

                foreach ($purchaseOrder->items as $poItem) {
                    $itemData = $submitted[$poItem->id];
                    if ((int) $itemData['delivered_quantity'] === 0) {
                        continue;
                    }
                    $product = Product::query()->where('name', $poItem->product_name)->firstOrFail();

                    ReceivingItem::create([
                        'receiving_id' => $receiving->id,
                        'purchase_order_item_id' => $poItem->id,
                        'product_id' => $product->id,
                        'product_name' => $product->name,
                        'ordered_quantity' => $poItem->ordered_quantity,
                        'delivered_quantity' => $itemData['delivered_quantity'],
                        'unit' => $product->unit,
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

        $validated = $request->validate(['qa_user_id' => ['required', 'integer', 'exists:users,id']]);
        $qa = User::query()->with('role')->find($validated['qa_user_id']);

        if (! $qa || $qa->status !== 'ACTIVE' || ! $qa->isQaSupervisor()) {
            return response()->json([
                'message' => 'The selected QA Supervisor is not active or is not eligible for assignment.',
                'errors' => ['qa_user_id' => ['The selected QA Supervisor is not active or is not eligible for assignment.']],
            ], 422);
        }

        if ($receiving->qaInspection?->completed_at) {
            return response()->json(['message' => 'A completed inspection cannot be reassigned.'], 422);
        }

        if ($receiving->status === Receiving::STATUS_AWAITING_REPLACEMENT) {
            return response()->json(['message' => 'Confirm the replacement delivery before assigning QA.'], 422);
        }

        $previousQaId = $receiving->assigned_qa_user_id;
        $receiving->update(['assigned_qa_user_id' => $qa->id]);

        ReceivingTimeline::create([
            'receiving_id' => $receiving->id,
            'status' => $previousQaId ? 'QA Reassigned' : 'QA Assigned',
            'performed_by' => $request->user()->name,
            'occurred_at' => now(),
        ]);

        AuditLogger::success('QA_ASSIGNED', AuditLogger::MODULE_RECEIVING, [
            'resource' => $receiving,
            'resource_label' => $receiving->receiving_no,
            'details' => $previousQaId ? "Reassigned QA Supervisor to {$qa->name}" : "Assigned QA Supervisor {$qa->name}",
            'metadata' => [
                'receiving_id' => $receiving->id,
                'assigned_qa_user_id' => $qa->id,
                'assigned_qa_name' => $qa->name,
                'previous_assigned_qa_user_id' => $previousQaId,
            ],
        ]);

        WorkflowNotificationSender::send($qa, new WorkflowNotification(
            'QA Inspection Assigned',
            "Receiving #{$receiving->receiving_no} was assigned to you.",
            'info',
            $receiving->receiving_no,
            'Quality Inspection',
        ));

        return response()->json($this->present($receiving->fresh()));
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

        $storedPaths = [];
        try {
            $receiving = DB::transaction(function () use ($validated, $request, $receiving, &$storedPaths) {
                $locked = Receiving::query()->with('items')->lockForUpdate()->findOrFail($receiving->id);
                abort_unless($locked->replacement_for_rejection_case_id !== null, 422, 'Only replacement receivings can be confirmed this way.');
                abort_unless($locked->status === Receiving::STATUS_AWAITING_REPLACEMENT, 422, 'This replacement delivery has already been confirmed.');

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

                $this->storeReceiptAttachments($locked, $request, $storedPaths);

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
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');
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
