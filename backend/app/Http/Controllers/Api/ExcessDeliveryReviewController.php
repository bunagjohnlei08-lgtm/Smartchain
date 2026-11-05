<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ExcessDeliveryReview;
use App\Models\ExcessDeliveryDocument;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Receiving;
use App\Models\ReceivingDiscrepancy;
use App\Models\ReceivingItem;
use App\Models\ReceivingTimeline;
use App\Models\Warehouse;
use App\Models\User;
use App\Notifications\WorkflowNotification;
use App\Support\AuditLogger;
use App\Support\ExactFileDuplicateGuard;
use App\Support\ReplenishmentLifecycle;
use App\Support\WorkflowNotificationSender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Throwable;

class ExcessDeliveryReviewController extends Controller
{
    private const HELD_RECEIVING_STATUS = 'Pending Excess Review';
    private const DOCUMENT_TYPES = [
        'WRITTEN_SUPPLIER_CONFIRMATION', 'CORRECTED_DELIVERY_RECEIPT', 'SUPPLIER_AUTHORIZATION_TO_KEEP',
        'ADDITIONAL_QUANTITY_VERIFICATION', 'REVISED_INVOICE_OR_CREDIT', 'SUPPLIER_RETURN_AUTHORIZATION',
        'OTHER_SUPPORTING_DOCUMENT',
    ];
    private const REJECTION_REASONS = [
        'EXCESS_NOT_AUTHORIZED', 'SUPPLIER_REQUESTED_RETURN', 'INCORRECT_PRODUCT_OR_DELIVERY',
        'INSUFFICIENT_SUPPORTING_DOCUMENTS', 'QUANTITY_DISCREPANCY_UNRESOLVED', 'COMPANY_DECLINED_EXCESS',
    ];
    private const FINANCIAL_REVIEW_REASONS = [
        'ADDITIONAL_SUPPLIER_CHARGE', 'INVOICE_ADJUSTMENT_REQUIRED', 'CREDIT_NOTE_REQUIRED',
        'PRICE_OR_TAX_RECONCILIATION', 'OTHER_FINANCIAL_REVIEW',
    ];

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');
        $validated = $request->validate([
            'submission_key' => ['required', 'uuid'],
            'purchase_order_id' => ['required', 'integer', 'exists:purchase_orders,id'],
            'reference_no' => ['required', 'string', 'max:255'],
            'delivery_date' => ['required', 'date'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.purchase_order_item_id' => ['required', 'integer', 'distinct', 'exists:purchase_order_items,id'],
            'items.*.delivered_quantity' => ['required', 'integer', 'min:0'],
            'receipts' => ['required', 'array', 'min:1', 'max:4'],
            'receipts.*' => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'mimetypes:image/jpeg,image/png,application/pdf', 'extensions:jpg,jpeg,png,pdf', 'max:10240'],
        ]);

        if ($existing = ExcessDeliveryReview::query()->where('submission_key', $validated['submission_key'])->first()) {
            abort_unless($existing->submitted_by_id === $request->user()->id, 409, 'Submission key is already in use.');
            return response()->json($this->present($existing), 200);
        }

        $deliveryIdentity = hash('sha256', implode('|', [
            $validated['purchase_order_id'],
            mb_strtoupper(trim($validated['reference_no'])),
            $validated['delivery_date'],
        ]));
        abort_if(
            ExcessDeliveryReview::query()->where('delivery_identity', $deliveryIdentity)->exists(),
            422,
            'This Purchase Order delivery reference and date have already been submitted for excess review.'
        );

        $hashes = ExactFileDuplicateGuard::hashes($request->file('receipts', []), [], 'receipts', 'Duplicate file detected. This exact receipt has already been added.');
        $storedPaths = [];
        try {
            $review = DB::transaction(function () use ($validated, $request, $hashes, $deliveryIdentity, &$storedPaths) {
                $po = PurchaseOrder::query()->with(['items', 'replenishmentRequest'])->lockForUpdate()->findOrFail($validated['purchase_order_id']);
                abort_unless(in_array($po->status, [PurchaseOrder::STATUS_APPROVED, PurchaseOrder::STATUS_SENT_TO_SUPPLIER, PurchaseOrder::STATUS_PARTIALLY_RECEIVED], true), 422, 'This Purchase Order is not active for receiving.');
                $submitted = collect($validated['items'])->keyBy('purchase_order_item_id');
                abort_unless($submitted->keys()->sort()->values()->all() === $po->items->pluck('id')->sort()->values()->all(), 422, 'Receiving items must exactly match the selected Purchase Order.');
                abort_unless($submitted->contains(fn ($item) => (int) $item['delivered_quantity'] > 0), 422, 'At least one product must have a delivered quantity greater than zero.');

                $previous = $this->authorizedReceivedByPoItem($po->id);
                $snapshots = $po->items->map(function ($poItem) use ($submitted, $previous) {
                    $remaining = max(0, (int) $poItem->ordered_quantity - (int) ($previous[$poItem->id] ?? 0));
                    $actual = (int) $submitted[$poItem->id]['delivered_quantity'];
                    return compact('poItem', 'remaining', 'actual') + ['excess' => max(0, $actual - $remaining)];
                });
                abort_unless($snapshots->contains(fn ($line) => $line['excess'] > 0), 422, 'Use the normal Receiving flow when no delivered quantity exceeds the remaining Purchase Order balance.');

                $warehouse = $po->replenishmentRequest?->warehouse_id
                    ? Warehouse::query()->find($po->replenishmentRequest->warehouse_id)
                    : (Warehouse::query()->where('code', 'WH-MAIN')->first() ?? Warehouse::query()->orderBy('id')->first());
                abort_unless($warehouse, 422, 'No warehouse is configured to hold this delivery.');

                $receiving = Receiving::create([
                    'receiving_no' => Receiving::nextReceivingNo(), 'purchase_order_id' => $po->id,
                    'purchase_order' => $po->po_number, 'supplier' => $po->supplier_name,
                    'reference_no' => $validated['reference_no'] ?? null, 'delivery_date' => $validated['delivery_date'],
                    'status' => self::HELD_RECEIVING_STATUS, 'prepared_by_id' => $request->user()->id,
                ]);

                foreach ($request->file('receipts', []) as $index => $upload) {
                    $path = Storage::disk('local')->putFile("receiving-receipts/{$receiving->id}", $upload);
                    abort_unless($path, 500, 'Receiving receipt storage failed.');
                    $storedPaths[] = $path;
                    $receiving->receiptAttachments()->create(['uploaded_by' => $request->user()->id, 'original_name' => Str::limit(basename($upload->getClientOriginalName()), 255, ''), 'stored_path' => $path, 'mime_type' => $upload->getMimeType() ?: $upload->getClientMimeType(), 'file_size' => $upload->getSize(), 'file_sha256' => $hashes[$index]]);
                }

                $review = ExcessDeliveryReview::create([
                    'submission_key' => $validated['submission_key'], 'delivery_identity' => $deliveryIdentity,
                    'reference' => 'EX-'.now()->format('Ymd').'-'.str_pad((string) $receiving->id, 6, '0', STR_PAD_LEFT),
                    'receiving_id' => $receiving->id, 'purchase_order_id' => $po->id, 'supplier_id' => $po->supplier_id,
                    'warehouse_id' => $warehouse->id, 'submitted_by_id' => $request->user()->id,
                    'status' => ExcessDeliveryReview::STATUS_PENDING,
                    'financial_reconciliation_status' => 'PENDING_DECISION',
                ]);

                foreach ($snapshots as $line) {
                    $poItem = $line['poItem'];
                    $product = $poItem->product_id ? Product::findOrFail($poItem->product_id) : Product::query()->where('name', $poItem->product_name)->firstOrFail();
                    $authorized = min($line['actual'], $line['remaining']);
                    $authorizedItem = $authorized > 0 ? ReceivingItem::create(['receiving_id' => $receiving->id, 'purchase_order_item_id' => $poItem->id, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'product_name' => $poItem->product_name, 'ordered_quantity' => $line['remaining'], 'delivered_quantity' => $authorized, 'unit' => $poItem->unit ?? $product->unit, 'inspection_status' => 'Pending QA']) : null;
                    $heldItem = $line['excess'] > 0 ? ReceivingItem::create(['receiving_id' => $receiving->id, 'purchase_order_item_id' => $poItem->id, 'product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'product_name' => $poItem->product_name, 'ordered_quantity' => $line['excess'], 'delivered_quantity' => $line['excess'], 'unit' => $poItem->unit ?? $product->unit, 'inspection_status' => 'On Hold']) : null;
                    $review->items()->create(['receiving_item_id' => $heldItem?->id, 'authorized_receiving_item_id' => $authorizedItem?->id, 'purchase_order_item_id' => $poItem->id, 'product_id' => $product->id, 'po_remaining_quantity' => $line['remaining'], 'actual_delivered_quantity' => $line['actual'], 'authorized_quantity' => $authorized, 'excess_quantity' => $line['excess'], 'unit' => $poItem->unit ?? $product->unit]);
                }

                if ($review->items()->where('authorized_quantity', '>', 0)->exists()) {
                    $receiving->update(['status' => 'Pending QA']);
                    ReceivingTimeline::create(['receiving_id' => $receiving->id, 'status' => 'PO-Authorized Quantity Released for QA', 'performed_by' => $request->user()->name, 'occurred_at' => now()]);
                } else {
                    ReceivingTimeline::create(['receiving_id' => $receiving->id, 'status' => self::HELD_RECEIVING_STATUS, 'performed_by' => $request->user()->name, 'occurred_at' => now()]);
                }
                AuditLogger::success('EXCESS_DELIVERY_SUBMITTED', AuditLogger::MODULE_RECEIVING, ['resource' => $review, 'resource_label' => $review->reference, 'details' => 'Physical excess delivery recorded and held for Admin review.', 'metadata' => ['receiving_id' => $receiving->id, 'purchase_order_id' => $po->id, 'warehouse_id' => $warehouse->id, 'excess_quantity' => $review->items()->sum('excess_quantity')]]);
                return $review;
            });
        } catch (Throwable $e) {
            foreach ($storedPaths as $path) Storage::disk('local')->delete($path);
            throw $e;
        }

        return response()->json($this->present($review), 201);
    }

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403);
        $validated = $request->validate(['view' => ['nullable', Rule::in(['active', 'history'])]]);
        $view = $validated['view'] ?? 'active';
        $query = ExcessDeliveryReview::query()->with($this->relations());
        $view === 'history' ? $query->resolved() : $query->unresolved();
        $reviews = $query->orderByDesc('updated_at')->get();

        return response()->json([
            'data' => $reviews->map(fn (ExcessDeliveryReview $review) => $this->present($review))->values(),
            'meta' => ['view' => $view, 'total' => $reviews->count()],
        ]);
    }

    public function plantManagerIndex(Request $request): JsonResponse
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');
        $validated = $request->validate([
            'view' => ['nullable', Rule::in(['active', 'history'])],
            'status' => ['nullable', 'string', 'max:48'],
            'search' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $view = $validated['view'] ?? 'active';
        $query = ExcessDeliveryReview::query()
            ->with($this->relations())
            ->where('submitted_by_id', $request->user()->id);
        $view === 'history' ? $query->resolved() : $query->unresolved();

        if (! empty($validated['status'])) $query->where('status', $validated['status']);
        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($filtered) use ($search) {
                $filtered->where('reference', 'like', "%{$search}%")
                    ->orWhereHas('receiving', fn ($receiving) => $receiving->where('receiving_no', 'like', "%{$search}%"))
                    ->orWhereHas('purchaseOrder', fn ($order) => $order->where('po_number', 'like', "%{$search}%")->orWhere('supplier_name', 'like', "%{$search}%"))
                    ->orWhereHas('items.receivingItem', fn ($item) => $item->where('product_name', 'like', "%{$search}%"));
            });
        }

        $paginator = $query->orderByDesc('updated_at')->paginate($validated['per_page'] ?? 5)->withQueryString();
        return response()->json([
            'data' => $paginator->getCollection()->map(fn (ExcessDeliveryReview $review) => $this->present($review, false))->values(),
            'meta' => [
                'current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(), 'total' => $paginator->total(),
                'from' => $paginator->firstItem(), 'to' => $paginator->lastItem(),
            ],
        ]);
    }

    public function update(Request $request, ExcessDeliveryReview $excessDeliveryReview, ReplenishmentLifecycle $lifecycle): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403);
        $validated = $request->validate([
            'action' => ['required', Rule::in(['APPROVE', 'REJECT', 'REQUEST_DOCUMENTATION', 'FINANCIAL_HOLD'])],
            'cost_resolution' => ['nullable', Rule::requiredIf($request->input('action') === 'APPROVE'), Rule::in([ExcessDeliveryReview::COST_FREE, ExcessDeliveryReview::COST_CHARGEABLE])],
            'documentation_type' => ['nullable', Rule::requiredIf($request->input('action') === 'REQUEST_DOCUMENTATION'), Rule::in(self::DOCUMENT_TYPES)],
            'supplier_confirmation_reference' => ['nullable', 'string', 'max:255'],
            'supplier_evidence' => ['nullable', Rule::requiredIf(fn () => $request->input('action') === 'APPROVE' && ! $excessDeliveryReview->supplier_evidence_path), 'file', 'mimes:jpg,jpeg,png,pdf', 'mimetypes:image/jpeg,image/png,application/pdf', 'extensions:jpg,jpeg,png,pdf', 'max:10240'],
            'review_notes' => ['nullable', 'string', 'max:1000'],
            'rejection_reason' => ['nullable', Rule::requiredIf($request->input('action') === 'REJECT'), Rule::in(self::REJECTION_REASONS)],
            'financial_review_reason' => ['nullable', Rule::requiredIf($request->input('action') === 'FINANCIAL_HOLD'), Rule::in(self::FINANCIAL_REVIEW_REASONS)],
        ]);

        $newEvidencePath = null;
        if ($request->hasFile('supplier_evidence')) $newEvidencePath = Storage::disk('local')->putFile("excess-delivery-evidence/{$excessDeliveryReview->id}", $request->file('supplier_evidence'));
        try {
            $review = DB::transaction(function () use ($validated, $request, $excessDeliveryReview, $lifecycle, $newEvidencePath) {
                $review = ExcessDeliveryReview::query()->with(['items', 'receiving.items', 'purchaseOrder.items'])->lockForUpdate()->findOrFail($excessDeliveryReview->id);
                abort_unless(in_array($review->status, [ExcessDeliveryReview::STATUS_PENDING, ExcessDeliveryReview::STATUS_DOCUMENTATION_SUBMITTED, ExcessDeliveryReview::STATUS_FINANCIAL_HOLD], true), 422, 'This excess review is not awaiting an Admin decision.');
                $evidence = $request->file('supplier_evidence');
                if ($newEvidencePath) {
                    $review->fill(['supplier_evidence_path' => $newEvidencePath, 'supplier_evidence_name' => Str::limit(basename($evidence->getClientOriginalName()), 255, ''), 'supplier_evidence_mime' => $evidence->getMimeType() ?: $evidence->getClientMimeType(), 'supplier_evidence_sha256' => hash_file('sha256', $evidence->getRealPath())]);
                    $this->recordDocument($review, $evidence, $newEvidencePath, 'ADMIN_DECISION_EVIDENCE', 'WRITTEN_SUPPLIER_CONFIRMATION', $request->user()->id, $validated['supplier_confirmation_reference'] ?? null);
                }

                if ($validated['action'] === 'REQUEST_DOCUMENTATION') {
                    $review->fill(['status' => ExcessDeliveryReview::STATUS_DOCUMENTATION_REQUESTED, 'documentation_type' => $validated['documentation_type'], 'documentation_requested_by_id' => $request->user()->id, 'documentation_assigned_to_id' => $review->submitted_by_id, 'documentation_requested_at' => now(), 'documentation_submitted_at' => null, 'review_notes' => $validated['review_notes'] ?? null]);
                    $this->releaseAuthorizedForQa($review, $request->user()->name);
                    if ($review->submittedBy) WorkflowNotificationSender::send($review->submittedBy, new WorkflowNotification('Excess Delivery Documentation Requested', "Documentation is required for {$review->reference}.", 'warning', $review->reference, 'Receiving', ['excess_review_id' => $review->id, 'documentation_type' => $validated['documentation_type']]));
                } elseif ($validated['action'] === 'REJECT') {
                    $review->fill(['status' => ExcessDeliveryReview::STATUS_RETURN_REQUIRED, 'return_status' => 'RETURN_REQUIRED', 'rejection_reason' => $validated['rejection_reason'], 'reviewed_by_id' => $request->user()->id, 'reviewed_at' => now()]);
                    foreach ($review->items as $item) $item->update(['return_requested_quantity' => $item->excess_quantity]);
                    $this->releaseAuthorizedForQa($review, $request->user()->name);
                    ReceivingTimeline::create(['receiving_id' => $review->receiving_id, 'status' => 'Excess Return Required', 'performed_by' => $request->user()->name, 'occurred_at' => now()]);
                    if ($review->submittedBy) WorkflowNotificationSender::send($review->submittedBy, new WorkflowNotification('Excess Return Required', "Prepare the held excess for {$review->reference} for supplier return.", 'warning', $review->reference, 'Receiving', ['excess_review_id' => $review->id]));
                } else {
                    $costResolution = $validated['action'] === 'FINANCIAL_HOLD' ? ExcessDeliveryReview::COST_CHARGEABLE : $validated['cost_resolution'];
                    $review->fill(['cost_resolution' => $costResolution, 'supplier_confirmation_reference' => $validated['supplier_confirmation_reference'] ?? null, 'review_notes' => $validated['action'] === 'FINANCIAL_HOLD' ? $validated['financial_review_reason'] : ($validated['review_notes'] ?? null), 'reviewed_by_id' => $request->user()->id, 'reviewed_at' => now()]);
                    if ($validated['action'] === 'APPROVE') abort_unless($review->supplier_evidence_path || $newEvidencePath || $review->documents()->exists(), 422, 'Written supplier confirmation evidence is required.');
                    if ($costResolution === ExcessDeliveryReview::COST_CHARGEABLE) {
                        $review->fill(['status' => ExcessDeliveryReview::STATUS_FINANCIAL_HOLD, 'financial_reconciliation_status' => 'MANUAL_RECONCILIATION_REQUIRED']);
                        $this->releaseAuthorizedForQa($review, $request->user()->name);
                    } else {
                        $this->assertSnapshotsStillCurrent($review);
                        $review->fill(['status' => ExcessDeliveryReview::STATUS_APPROVED, 'financial_reconciliation_status' => 'NO_ADDITIONAL_CHARGE_DOCUMENTED']);
                        $review->receiving->items()->where('inspection_status', 'On Hold')->update(['inspection_status' => 'Pending QA']);
                        $review->receiving->update(['status' => 'Pending QA']);
                        ReceivingTimeline::create(['receiving_id' => $review->receiving_id, 'status' => 'Excess Approved for QA', 'performed_by' => $request->user()->name, 'occurred_at' => now()]);
                        $this->recordMixedShortage($review, $request->user()->id);
                        $hasShortage = $review->items->contains(
                            fn ($item) => $item->actual_delivered_quantity < $item->po_remaining_quantity
                        );
                        $review->purchaseOrder->update(['status' => $hasShortage
                            ? PurchaseOrder::STATUS_PARTIALLY_RECEIVED
                            : PurchaseOrder::STATUS_COMPLETED]);
                        $lifecycle->synchronize($review->purchaseOrder);
                    }
                }
                $review->save();
                AuditLogger::success('EXCESS_DELIVERY_'.$validated['action'], AuditLogger::MODULE_RECEIVING, ['resource' => $review, 'resource_label' => $review->reference, 'details' => 'Excess delivery review moved to '.$review->status, 'metadata' => ['receiving_id' => $review->receiving_id, 'purchase_order_id' => $review->purchase_order_id, 'previous_state' => $excessDeliveryReview->status, 'next_state' => $review->status]]);
                return $review;
            });
        } catch (Throwable $e) {
            if ($newEvidencePath) Storage::disk('local')->delete($newEvidencePath);
            throw $e;
        }
        return response()->json($this->present($review));
    }

    public function submitDocumentation(Request $request, ExcessDeliveryReview $excessDeliveryReview): JsonResponse
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');
        abort_unless($excessDeliveryReview->submitted_by_id === $request->user()->id, 403, 'Only the responsible Plant Manager may submit this documentation.');
        $validated = $request->validate([
            'document' => $this->documentRules(),
            'external_reference' => ['nullable', 'string', 'max:255'],
        ]);
        $upload = $request->file('document');
        $path = Storage::disk('local')->putFile("excess-delivery-documents/{$excessDeliveryReview->id}", $upload);
        abort_unless($path, 500, 'Documentation storage failed.');
        try {
            $review = DB::transaction(function () use ($excessDeliveryReview, $request, $validated, $upload, $path) {
                $review = ExcessDeliveryReview::query()->with(['documents', 'receiving'])->lockForUpdate()->findOrFail($excessDeliveryReview->id);
                abort_unless($review->status === ExcessDeliveryReview::STATUS_DOCUMENTATION_REQUESTED, 422, 'This review is not awaiting documentation.');
                $this->recordDocument($review, $upload, $path, 'DOCUMENTATION_RESPONSE', $review->documentation_type, $request->user()->id, $validated['external_reference'] ?? null);
                $review->update(['status' => ExcessDeliveryReview::STATUS_DOCUMENTATION_SUBMITTED, 'documentation_submitted_at' => now()]);
                ReceivingTimeline::create(['receiving_id' => $review->receiving_id, 'status' => 'Excess Documentation Submitted', 'performed_by' => $request->user()->name, 'occurred_at' => now()]);
                AuditLogger::success('EXCESS_DOCUMENTATION_SUBMITTED', AuditLogger::MODULE_RECEIVING, ['resource' => $review, 'resource_label' => $review->reference, 'metadata' => ['document_type' => $review->documentation_type, 'uploaded_by_id' => $request->user()->id]]);
                return $review;
            });
        } catch (Throwable $e) {
            Storage::disk('local')->delete($path);
            throw $e;
        }
        $admins = User::query()->where('status', 'ACTIVE')->whereHas('role', fn ($query) => $query->where('slug', 'ADMIN'))->get();
        WorkflowNotificationSender::send($admins, new WorkflowNotification('Excess Documentation Submitted', "Requested documentation for {$review->reference} is ready for review.", 'info', $review->reference, 'Receiving', ['excess_review_id' => $review->id]));
        return response()->json($this->present($review));
    }

    public function prepareReturn(Request $request, ExcessDeliveryReview $excessDeliveryReview): JsonResponse
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');
        abort_unless($excessDeliveryReview->submitted_by_id === $request->user()->id, 403, 'Only the responsible Plant Manager may prepare this return.');
        $review = DB::transaction(function () use ($excessDeliveryReview, $request) {
            $review = ExcessDeliveryReview::query()->with('receiving')->lockForUpdate()->findOrFail($excessDeliveryReview->id);
            abort_unless($review->status === ExcessDeliveryReview::STATUS_RETURN_REQUIRED, 422, 'This excess delivery is not awaiting return preparation.');
            $review->update(['status' => ExcessDeliveryReview::STATUS_RETURN_IN_PROGRESS, 'return_status' => 'RETURN_IN_PROGRESS', 'return_prepared_at' => now()]);
            ReceivingTimeline::create(['receiving_id' => $review->receiving_id, 'status' => 'Excess Return Prepared', 'performed_by' => $request->user()->name, 'occurred_at' => now()]);
            AuditLogger::success('EXCESS_RETURN_PREPARED', AuditLogger::MODULE_RECEIVING, ['resource' => $review, 'resource_label' => $review->reference]);
            return $review;
        });
        return response()->json($this->present($review));
    }

    public function completeReturn(Request $request, ExcessDeliveryReview $excessDeliveryReview): JsonResponse
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');
        abort_unless($excessDeliveryReview->submitted_by_id === $request->user()->id, 403, 'Only the responsible Plant Manager may complete this return.');
        $validated = $request->validate([
            'return_date' => ['required', 'date', 'before_or_equal:today'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.review_item_id' => ['required', 'integer', 'distinct'],
            'items.*.returned_quantity' => ['required', 'integer', 'min:0'],
            'document' => $this->documentRules(),
            'external_reference' => ['nullable', 'string', 'max:255'],
        ]);
        $upload = $request->file('document');
        $path = Storage::disk('local')->putFile("excess-delivery-returns/{$excessDeliveryReview->id}", $upload);
        abort_unless($path, 500, 'Return evidence storage failed.');
        try {
            $review = DB::transaction(function () use ($excessDeliveryReview, $request, $validated, $upload, $path) {
                $review = ExcessDeliveryReview::query()->with(['items.receivingItem', 'receiving'])->lockForUpdate()->findOrFail($excessDeliveryReview->id);
                abort_unless($review->status === ExcessDeliveryReview::STATUS_RETURN_IN_PROGRESS, 422, 'Prepare the return before recording the physical supplier handoff.');
                $submitted = collect($validated['items'])->keyBy('review_item_id');
                $returnItems = $review->items->where('return_requested_quantity', '>', 0);
                abort_unless($submitted->keys()->sort()->values()->all() === $returnItems->pluck('id')->sort()->values()->all(), 422, 'Returned quantities must cover every held excess line.');
                foreach ($returnItems as $item) {
                    $quantity = (int) $submitted[$item->id]['returned_quantity'];
                    abort_if($quantity < $item->returned_quantity, 422, 'Returned quantity cannot be reduced.');
                    abort_if($quantity > $item->return_requested_quantity, 422, 'Returned quantity cannot exceed the held excess quantity.');
                    $item->update(['returned_quantity' => $quantity]);
                }
                $this->recordDocument($review, $upload, $path, 'RETURN_EVIDENCE', 'SUPPLIER_RETURN_EVIDENCE', $request->user()->id, $validated['external_reference'] ?? null);
                $complete = $review->items()->whereColumn('returned_quantity', '<', 'return_requested_quantity')->doesntExist();
                $review->update(['status' => $complete ? ExcessDeliveryReview::STATUS_RETURNED : ExcessDeliveryReview::STATUS_RETURN_IN_PROGRESS, 'return_status' => $complete ? 'RETURNED_TO_SUPPLIER' : 'RETURN_IN_PROGRESS', 'return_date' => $validated['return_date'], 'return_completed_at' => $complete ? now() : null, 'return_completed_by_id' => $complete ? $request->user()->id : null]);
                if ($complete) foreach ($returnItems as $item) $item->receivingItem?->update(['inspection_status' => 'Returned to Supplier']);
                ReceivingTimeline::create(['receiving_id' => $review->receiving_id, 'status' => $complete ? 'Excess Returned to Supplier' : 'Excess Return Partially Recorded', 'performed_by' => $request->user()->name, 'occurred_at' => now()]);
                AuditLogger::success($complete ? 'EXCESS_RETURN_COMPLETED' : 'EXCESS_RETURN_UPDATED', AuditLogger::MODULE_RECEIVING, ['resource' => $review, 'resource_label' => $review->reference, 'metadata' => ['return_date' => $validated['return_date'], 'returned_quantity' => $returnItems->sum('returned_quantity')]]);
                return $review;
            });
        } catch (Throwable $e) {
            Storage::disk('local')->delete($path);
            throw $e;
        }
        return response()->json($this->present($review));
    }

    public function document(Request $request, ExcessDeliveryReview $excessDeliveryReview, ExcessDeliveryDocument $document)
    {
        $authorized = $request->user()?->isAdmin() || ($request->user()?->isPlantManager() && $excessDeliveryReview->submitted_by_id === $request->user()->id);
        abort_unless($authorized, 403);
        abort_unless($document->excess_delivery_review_id === $excessDeliveryReview->id, 404);
        abort_unless(Storage::disk('local')->exists($document->stored_path), 404);
        return Storage::disk('local')->response($document->stored_path, $document->original_name, ['X-Content-Type-Options' => 'nosniff', 'Cache-Control' => 'private, no-store', 'Content-Type' => $document->mime_type, 'Content-Disposition' => 'inline; filename="'.str_replace(['"', "\r", "\n"], '', $document->original_name).'"']);
    }

    public function evidence(Request $request, ExcessDeliveryReview $excessDeliveryReview)
    {
        abort_unless($request->user()?->isAdmin(), 403);
        abort_unless($excessDeliveryReview->supplier_evidence_path && Storage::disk('local')->exists($excessDeliveryReview->supplier_evidence_path), 404);
        return Storage::disk('local')->response($excessDeliveryReview->supplier_evidence_path, $excessDeliveryReview->supplier_evidence_name, [
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store',
            'Content-Type' => $excessDeliveryReview->supplier_evidence_mime,
            'Content-Disposition' => 'inline; filename="'.str_replace(['"', "\r", "\n"], '', $excessDeliveryReview->supplier_evidence_name).'"',
        ]);
    }

    private function authorizedReceivedByPoItem(int $poId, ?int $excludeReceivingId = null)
    {
        return ReceivingItem::query()->whereNotNull('purchase_order_item_id')
            ->when($excludeReceivingId, fn ($query) => $query->where('receiving_id', '<>', $excludeReceivingId))
            ->whereHas('receiving', fn ($query) => $query->where('purchase_order_id', $poId)->whereNull('replacement_for_rejection_case_id'))
            ->where(fn ($query) => $query->whereDoesntHave('excessReviewItem')->orWhereHas('excessReviewItem.review', fn ($review) => $review->where('status', ExcessDeliveryReview::STATUS_APPROVED)))
            ->selectRaw('purchase_order_item_id, SUM(delivered_quantity) as quantity')->groupBy('purchase_order_item_id')->pluck('quantity', 'purchase_order_item_id');
    }

    private function assertSnapshotsStillCurrent(ExcessDeliveryReview $review): void
    {
        $previous = $this->authorizedReceivedByPoItem($review->purchase_order_id, $review->receiving_id);
        foreach ($review->items as $item) {
            $ordered = (int) $item->purchaseOrderItem()->value('ordered_quantity');
            $remaining = max(0, $ordered - (int) ($previous[$item->purchase_order_item_id] ?? 0));
            abort_unless($remaining === $item->po_remaining_quantity, 422, 'The Purchase Order balance changed after this delivery was recorded. Review the exception again before approval.');
        }
    }

    private function recordMixedShortage(ExcessDeliveryReview $review, int $actorId): void
    {
        $short = $review->items->sum(fn ($item) => max(0, $item->po_remaining_quantity - $item->actual_delivered_quantity));
        if ($short <= 0) return;
        ReceivingDiscrepancy::firstOrCreate(['receiving_id' => $review->receiving_id], ['purchase_order_id' => $review->purchase_order_id, 'supplier_id' => $review->supplier_id, 'discrepancy_type' => ReceivingDiscrepancy::TYPE_SHORT_DELIVERY, 'expected_quantity' => $review->items->sum('po_remaining_quantity'), 'delivered_quantity' => $review->items->sum(fn ($item) => min($item->actual_delivered_quantity, $item->po_remaining_quantity)), 'short_quantity' => $short, 'status' => ReceivingDiscrepancy::STATUS_REPORTED, 'reported_by_id' => $actorId, 'reported_at' => now()]);
    }

    private function releaseAuthorizedForQa(ExcessDeliveryReview $review, string $actor): void
    {
        $hasAuthorized = $review->items->contains(fn ($item) => $item->authorized_quantity > 0);
        if ($hasAuthorized) {
            $review->receiving->update(['status' => 'Pending QA']);
            ReceivingTimeline::firstOrCreate(['receiving_id' => $review->receiving_id, 'status' => 'PO-Authorized Quantity Released for QA'], ['performed_by' => $actor, 'occurred_at' => now()]);
        }
        $this->recordMixedShortage($review, $review->reviewed_by_id ?? $review->submitted_by_id);
        $hasShortage = $review->items->contains(fn ($item) => $item->authorized_quantity < $item->po_remaining_quantity);
        $review->purchaseOrder->update(['status' => $hasShortage ? PurchaseOrder::STATUS_PARTIALLY_RECEIVED : PurchaseOrder::STATUS_COMPLETED]);
    }

    private function documentRules(): array
    {
        return ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'mimetypes:image/jpeg,image/png,application/pdf', 'extensions:jpg,jpeg,png,pdf', 'max:10240'];
    }

    private function recordDocument(ExcessDeliveryReview $review, $upload, string $path, string $purpose, string $documentType, int $uploaderId, ?string $externalReference): ExcessDeliveryDocument
    {
        return $review->documents()->create([
            'internal_reference' => 'EXDOC-'.str_pad((string) $review->id, 6, '0', STR_PAD_LEFT).'-'.strtoupper(Str::random(8)),
            'purpose' => $purpose,
            'document_type' => $documentType,
            'external_reference' => $externalReference,
            'original_name' => Str::limit(basename($upload->getClientOriginalName()), 255, ''),
            'stored_path' => $path,
            'mime_type' => $upload->getMimeType() ?: $upload->getClientMimeType(),
            'file_size' => $upload->getSize(),
            'file_sha256' => hash_file('sha256', $upload->getRealPath()),
            'uploaded_by_id' => $uploaderId,
        ]);
    }

    private function relations(): array { return ['items.receivingItem.qaInspectionItem.inspection', 'items.authorizedReceivingItem.qaInspectionItem.inspection', 'documents.uploadedBy:id,name', 'receiving.receiptAttachments', 'receiving.qaInspections.items', 'receiving.qaInspections.inspectedBy:id,name', 'purchaseOrder:id,po_number,supplier_name,status', 'supplier:id,name', 'warehouse:id,name,code', 'submittedBy:id,name', 'reviewedBy:id,name', 'documentationRequestedBy:id,name', 'documentationAssignedTo:id,name', 'returnCompletedBy:id,name']; }
    private function present(ExcessDeliveryReview $review, bool $includeAdminFields = true): array
    {
        $review->load($this->relations());
        $resolved = $review->isResolved();
        $excessItemIds = $review->items->pluck('receiving_item_id')->filter();
        $activeInspection = $review->receiving?->qaInspections
            ?->filter(fn ($inspection) => ! $inspection->completed_at && $inspection->items->pluck('receiving_item_id')->intersect($excessItemIds)->isNotEmpty())
            ->sortByDesc('cycle_number')->first();
        $qaEligibleQuantity = (int) $review->items->sum(fn ($item) =>
            $item->receivingItem?->inspection_status === 'Pending QA' && ! $item->receivingItem?->stocked_in_at
                ? $item->receivingItem->delivered_quantity : 0
        );
        $qaAcceptedAwaitingStock = (int) $review->items->sum(fn ($item) =>
            ! $item->receivingItem?->stocked_in_at
                ? (int) ($item->receivingItem?->qaInspectionItem?->accepted_quantity ?? 0) : 0
        );
        $canReassign = $review->status === ExcessDeliveryReview::STATUS_APPROVED
            && ! $resolved
            && $activeInspection
            && ! $activeInspection->started_at;
        $nextAction = match (true) {
            $resolved => 'Resolved',
            $review->status === ExcessDeliveryReview::STATUS_PENDING => 'Awaiting Admin review',
            $review->status === ExcessDeliveryReview::STATUS_DOCUMENTATION_REQUESTED => 'Submit requested documentation',
            $review->status === ExcessDeliveryReview::STATUS_DOCUMENTATION_SUBMITTED => 'Awaiting Admin re-review',
            $review->status === ExcessDeliveryReview::STATUS_FINANCIAL_HOLD => 'External Financial integration pending; manual reconciliation required',
            $review->status === ExcessDeliveryReview::STATUS_RETURN_REQUIRED => 'Prepare supplier return',
            $review->status === ExcessDeliveryReview::STATUS_RETURN_IN_PROGRESS => 'Record physical supplier return',
            $activeInspection => $activeInspection->started_at ? 'QA inspection in progress' : 'QA inspection assigned',
            $review->status === ExcessDeliveryReview::STATUS_APPROVED && $qaEligibleQuantity > 0 => 'Assign excess to QA',
            $review->status === ExcessDeliveryReview::STATUS_APPROVED && $review->items->contains(fn ($item) => ($item->receivingItem?->qaInspectionItem?->accepted_quantity ?? 0) > 0 && ! $item->receivingItem?->stocked_in_at) => 'Stock In QA-accepted excess',
            default => 'Resolve QA exception',
        };
        $data = [
            'id' => $review->id, 'reference' => $review->reference, 'status' => $review->status,
            'is_resolved' => $resolved, 'next_action' => $nextAction,
            'qa_assignment' => [
                'can_assign' => $review->status === ExcessDeliveryReview::STATUS_APPROVED && ! $resolved && $qaEligibleQuantity > 0 && ! $activeInspection,
                'can_reassign' => (bool) $canReassign,
                'state' => $activeInspection ? 'ASSIGNED_PENDING_QA' : ($qaAcceptedAwaitingStock > 0 ? 'AWAITING_STOCK_IN' : ($resolved ? 'RESOLVED' : 'NOT_ASSIGNED')),
                'cycle_number' => $activeInspection?->cycle_number,
                'next_cycle_number' => ((int) ($review->receiving?->qaInspections?->max('cycle_number') ?? 0)) + 1,
                'assigned_qa' => $activeInspection?->inspectedBy ? ['id' => $activeInspection->inspectedBy->id, 'name' => $activeInspection->inspectedBy->name] : null,
                'eligible_quantity' => $qaEligibleQuantity,
            ],
            'cost_resolution' => $review->cost_resolution, 'financial_reconciliation_status' => $review->financial_reconciliation_status,
            'financial_review_reason' => $review->status === ExcessDeliveryReview::STATUS_FINANCIAL_HOLD && in_array($review->review_notes, self::FINANCIAL_REVIEW_REASONS, true) ? $review->review_notes : null,
            'financial_handoff' => [
                'supported' => false,
                'transport_status' => 'NOT_SUBMITTED',
                'message' => 'No verified excess-reconciliation contract is configured. This case remains on manual Financial hold.',
            ],
            'supplier_confirmation_reference' => $review->supplier_confirmation_reference, 'review_notes' => $review->review_notes,
            'rejection_reason' => $review->rejection_reason, 'purchase_order' => $review->purchaseOrder?->po_number,
            'supplier' => $review->supplier?->name ?? $review->purchaseOrder?->supplier_name, 'warehouse' => $review->warehouse?->name,
            'receiving_id' => $review->receiving_id, 'receiving_no' => $review->receiving?->receiving_no,
            'delivery_date' => $review->receiving?->delivery_date?->toDateString(), 'submitted_by' => $review->submittedBy?->name,
            'reviewed_by' => $review->reviewedBy?->name, 'reviewed_at' => $review->reviewed_at?->toIso8601String(),
            'documentation_type' => $review->documentation_type,
            'documentation_requested_by' => $review->documentationRequestedBy?->name,
            'documentation_assigned_to' => $review->documentationAssignedTo?->name,
            'documentation_requested_at' => $review->documentation_requested_at?->toIso8601String(),
            'documentation_submitted_at' => $review->documentation_submitted_at?->toIso8601String(),
            'return_status' => $review->return_status, 'return_date' => $review->return_date?->toDateString(),
            'return_prepared_at' => $review->return_prepared_at?->toIso8601String(),
            'return_completed_at' => $review->return_completed_at?->toIso8601String(),
            'return_completed_by' => $review->returnCompletedBy?->name,
            'has_supplier_evidence' => (bool) $review->supplier_evidence_path,
            'evidence_url' => $review->supplier_evidence_path ? "/api/admin/excess-delivery-reviews/{$review->id}/evidence" : null,
            'documents' => $review->documents->map(fn ($document) => [
                'id' => $document->id, 'internal_reference' => $document->internal_reference,
                'purpose' => $document->purpose, 'document_type' => $document->document_type,
                'external_reference' => $document->external_reference, 'name' => $document->original_name,
                'mime_type' => $document->mime_type, 'file_size' => $document->file_size,
                'uploaded_by' => $document->uploadedBy?->name, 'created_at' => $document->created_at?->toIso8601String(),
                'url' => "/api/excess-delivery-reviews/{$review->id}/documents/{$document->id}",
            ])->values(),
            'receipts' => $review->receiving?->receiptAttachments->map(fn ($file) => ['id' => $file->id, 'name' => $file->original_name, 'url' => "/api/receivings/{$review->receiving_id}/receipts/{$file->id}"])->values(),
            'items' => $review->items->map(fn ($item) => [
                'id' => $item->id, 'product' => $item->receivingItem?->product_name ?? $item->authorizedReceivingItem?->product_name,
                'expected_quantity' => $item->po_remaining_quantity, 'delivered_quantity' => $item->actual_delivered_quantity,
                'authorized_quantity' => $item->authorized_quantity, 'excess_quantity' => $item->excess_quantity,
                'return_requested_quantity' => $item->return_requested_quantity, 'returned_quantity' => $item->returned_quantity,
                'unit' => $item->unit,
            ])->values(),
            'created_at' => $review->created_at?->toIso8601String(), 'updated_at' => $review->updated_at?->toIso8601String(),
        ];
        if (! $includeAdminFields) unset($data['supplier_confirmation_reference'], $data['review_notes'], $data['evidence_url']);
        return $data;
    }
}
