<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\QaInspection;
use App\Models\QaInspectionAttachment;
use App\Models\QaInspectionItem;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\ReceivingReceiptAttachment;
use App\Models\ReceivingTimeline;
use App\Notifications\WorkflowNotification;
use App\Support\ExactFileDuplicateGuard;
use App\Support\WorkflowNotificationSender;
use App\Support\SupplierRejectionWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
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

    private function authorizeQaWrite(Request $request): ?JsonResponse
    {
        if (! $request->user()?->isQaSupervisor()) {
            return response()->json(['message' => 'Only QA Supervisors can save QA inspections and notes.'], 403);
        }

        return null;
    }

    private function scopeForUser($query, Request $request)
    {
        if ($request->user()?->isQaSupervisor()) {
            $query->where('assigned_qa_user_id', $request->user()->id);
        }

        return $query;
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
            'category' => $item->product?->category,
            'brand' => $item->product?->brand,
            // The PO quantity and the physical delivery are distinct facts. Legacy
            // rows fall back to the immutable snapshot already stored on the item.
            'ordered_qty' => $item->purchaseOrderItem?->ordered_quantity ?? $item->ordered_quantity ?? $item->delivered_quantity,
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
            'items.purchaseOrderItem',
            'items.product',
            'preparedBy',
            'receiptAttachments.uploadedBy',
            'timeline',
            'qaInspection.items',
            'qaInspection.attachments',
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
            'receiving_receipts' => $receiving->receiptAttachments->map(
                fn (ReceivingReceiptAttachment $attachment) => $this->presentReceivingReceipt($attachment, $receiving)
            )->values(),
            'inspection' => [
                // Kept temporarily for old clients without exposing a storage path.
                'attachment_path' => $receiving->qaInspection?->attachments?->first()?->id
                    ? 'attachment-'.($receiving->qaInspection?->attachments?->first()?->id)
                    : null,
                'attachments' => $receiving->qaInspection?->attachments?->map(
                    fn (QaInspectionAttachment $attachment) => $this->presentAttachment($attachment, $receiving->id)
                )->values() ?? [],
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
            'attachments' => 'nullable|array|max:5',
            'attachments.*' => [
                'file', 'mimes:jpeg,jpg,png,pdf',
                'mimetypes:image/jpeg,image/png,application/pdf',
                'extensions:jpeg,jpg,png,pdf', 'max:5120',
            ],
            // Accept the former field during the compatibility window.
            'attachment' => [
                'nullable', 'file', 'mimes:jpeg,jpg,png,pdf',
                'mimetypes:image/jpeg,image/png,application/pdf',
                'extensions:jpeg,jpg,png,pdf', 'max:5120',
            ],
            'remove_attachment_ids' => 'nullable|array',
            'remove_attachment_ids.*' => 'integer|distinct',
        ], [
            'attachments.max' => 'An inspection may contain no more than 5 attachments.',
            'attachments.*.file' => 'Each attachment must be a JPG, PNG, or PDF file.',
            'attachments.*.mimes' => 'Each attachment must be a JPG, PNG, or PDF file.',
            'attachments.*.mimetypes' => 'Each attachment must be a JPG, PNG, or PDF file.',
            'attachments.*.extensions' => 'Each attachment must be a JPG, PNG, or PDF file.',
            'attachments.*.max' => 'Each attachment must not exceed 5 MB.',
            'attachments.*.uploaded' => 'An attachment could not be uploaded. Use JPG, PNG, or PDF files up to 5 MB each.',
            'attachment.file' => 'Attachment must be a JPG, PNG, or PDF file.',
            'attachment.mimes' => 'Attachment must be a JPG, PNG, or PDF file.',
            'attachment.mimetypes' => 'Attachment must be a JPG, PNG, or PDF file.',
            'attachment.extensions' => 'Attachment must be a JPG, PNG, or PDF file.',
            'attachment.max' => 'Attachment must not exceed 5 MB.',
        ]);
    }

    private function presentAttachment(QaInspectionAttachment $attachment, int $receivingId): array
    {
        return [
            'id' => $attachment->id,
            'original_name' => $attachment->original_name,
            'mime_type' => $attachment->mime_type,
            'file_size' => $attachment->file_size,
            'view_url' => "/qa/inspections/{$receivingId}/attachments/{$attachment->id}",
            'created_at' => $attachment->created_at,
        ];
    }

    private function presentReceivingReceipt(ReceivingReceiptAttachment $attachment, Receiving $receiving): array
    {
        return [
            'id' => $attachment->id,
            'original_name' => $attachment->original_name,
            'mime_type' => $attachment->mime_type,
            'file_size' => $attachment->file_size,
            'view_url' => "/qa/inspections/{$receiving->id}/receipts/{$attachment->id}",
            'created_at' => $attachment->created_at,
            'uploaded_by' => $attachment->uploadedBy?->name,
            'receiving_no' => $receiving->receiving_no,
        ];
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

    private function resolveItemResult(array $item, int $deliveredQuantity): string
    {
        $total = $item['accepted_quantity'] + $item['rejected_quantity'];

        if ($total !== $deliveredQuantity) {
            return 'Pending';
        }

        if ($item['accepted_quantity'] === $deliveredQuantity && $item['rejected_quantity'] === 0) {
            return 'Passed';
        }

        if ($item['accepted_quantity'] === 0 && $item['rejected_quantity'] === $deliveredQuantity) {
            return 'Rejected';
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
        if ($response = $this->authorizeQaWrite($request)) {
            return $response;
        }

        $validated = $this->validatePayload($request);
        $shouldSubmit = $request->boolean('submit', true);
        $user = $request->user();
        $storedPaths = [];
        $pathsToDelete = [];

        try {
            $receiving = DB::transaction(function () use ($request, $validated, $receivingId, $user, $shouldSubmit, &$storedPaths, &$pathsToDelete) {
                $receiving = $this->scopeForUser(Receiving::query(), $request)
                    ->with(['items.product', 'qaInspection.items', 'qaInspection.attachments'])
                    ->lockForUpdate()
                    ->find($receivingId);

                if (! $receiving) {
                    abort(404, 'Receiving not found.');
                }

                if ($receiving->items->isEmpty()) {
                    abort(422, 'Receiving has no products.');
                }

                if ($receiving->status === Receiving::STATUS_AWAITING_REPLACEMENT) {
                    abort(422, 'The replacement delivery has not been confirmed in Receiving yet.');
                }

                if ($receiving->qaInspection?->completed_at) {
                    abort(422, 'This inspection has already been submitted and can no longer be changed.');
                }

                $expectedItemIds = $receiving->items->pluck('id')->sort()->values();
                $submittedItems = collect($validated['items']);
                $submittedIds = $submittedItems->pluck('receiving_item_id')->sort()->values();

                if (! $submittedIds->values()->all() || $submittedIds->count() !== $expectedItemIds->count() || $submittedIds->diff($expectedItemIds)->isNotEmpty()) {
                    abort(422, 'QA inspection items must match the products on this receiving.');
                }

                $submittedItems = $submittedItems->map(function (array $itemPayload) use ($receiving, $shouldSubmit) {
                    $receivingItem = $receiving->items->firstWhere('id', $itemPayload['receiving_item_id']);
                    $itemPayload['accepted_quantity'] = (int) $itemPayload['accepted_quantity'];
                    $itemPayload['rejected_quantity'] = (int) $itemPayload['rejected_quantity'];
                    $total = $itemPayload['accepted_quantity'] + $itemPayload['rejected_quantity'];

                    if ($total > $receivingItem->delivered_quantity) {
                        abort(422, 'Accepted and rejected quantities cannot exceed delivered quantity.');
                    }

                    if ($shouldSubmit && $total !== $receivingItem->delivered_quantity) {
                        abort(422, 'Accepted and rejected quantities must equal delivered quantity before submission.');
                    }

                    $itemPayload['inspection_result'] = $this->resolveItemResult(
                        $itemPayload,
                        $receivingItem->delivered_quantity
                    );

                    return $itemPayload;
                });

                $inspection = QaInspection::firstOrCreate(
                    ['receiving_id' => $receiving->id],
                    [
                        'status' => 'In Progress',
                        'started_at' => now(),
                        'inspected_by_id' => $user->id,
                    ]
                );

                $inspection->load('attachments');
                $removeIds = collect($validated['remove_attachment_ids'] ?? [])->map(fn ($id) => (int) $id);
                $attachmentsToRemove = $inspection->attachments->whereIn('id', $removeIds);
                if ($attachmentsToRemove->count() !== $removeIds->count()) {
                    abort(422, 'One or more attachments do not belong to this inspection.');
                }

                $uploads = collect($request->file('attachments', []));
                if ($request->hasFile('attachment')) {
                    $uploads->push($request->file('attachment'));
                }
                $remainingCount = $inspection->attachments->count() - $attachmentsToRemove->count();
                if ($remainingCount + $uploads->count() > 5) {
                    throw ValidationException::withMessages([
                        'attachments' => ['An inspection may contain no more than 5 attachments.'],
                    ]);
                }
                if ($shouldSubmit && $submittedItems->sum('rejected_quantity') > 0 && $remainingCount + $uploads->count() < 1) {
                    throw ValidationException::withMessages([
                        'attachments' => ['Proof of rejection is required. Please upload at least one attachment.'],
                    ]);
                }

                $remainingHashes = $inspection->attachments
                    ->whereNotIn('id', $removeIds)
                    ->pluck('file_sha256');
                $uploadHashes = ExactFileDuplicateGuard::hashes(
                    $uploads,
                    $remainingHashes,
                    'attachments',
                    'Duplicate file detected. This exact file has already been added.',
                );

                foreach ($attachmentsToRemove as $attachment) {
                    $pathsToDelete[] = $attachment->stored_path;
                    $attachment->delete();
                }

                foreach ($uploads as $index => $upload) {
                    $storedPath = Storage::disk('local')->putFile('qa-attachments', $upload);
                    if (! $storedPath) {
                        throw new \RuntimeException('QA attachment storage failed.');
                    }
                    $storedPaths[] = $storedPath;
                    $inspection->attachments()->create([
                        'original_name' => Str::limit(basename($upload->getClientOriginalName()), 255, ''),
                        'stored_path' => $storedPath,
                        'mime_type' => $upload->getMimeType(),
                        'file_size' => $upload->getSize(),
                        'file_sha256' => $uploadHashes[$index],
                        'uploaded_by' => $user->id,
                    ]);
                }

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
                    $this->ensureTimelineEvent($receiving, 'QA '.$overallStatus, $user->name);

                    if ($submittedItems->sum('accepted_quantity') > 0) {
                        $this->ensureTimelineEvent($receiving, 'Ready for Stock In', 'System');
                    }
                } else {
                    $inspection->update([
                        'status' => 'In Progress',
                        'completed_at' => null,
                        'submitted_by_id' => null,
                    ]);
                }

                return $receiving->fresh([
                    'items.product',
                    'preparedBy',
                    'timeline',
                    'qaInspection.items',
                    'qaInspection.attachments',
                    'qaInspection.inspectedBy',
                    'qaInspection.submittedBy',
                ]);
            });
        } catch (Throwable $e) {
            foreach ($storedPaths as $storedPath) {
                $this->deleteAttachmentFile($storedPath);
            }
            if ($e instanceof ValidationException) {
                throw $e;
            }
            // abort() keeps the HTTP status on the exception, not in getCode().
            $status = $e instanceof HttpExceptionInterface ? $e->getStatusCode() : null;
            if (in_array($status, [404, 422], true)) {
                return response()->json(['message' => $e->getMessage()], $status);
            }

            report($e);

            return response()->json(['message' => 'Failed to save QA inspection.'], 500);
        }

        foreach ($pathsToDelete as $pathToDelete) {
            $this->deleteAttachmentFile($pathToDelete);
        }

        if ($shouldSubmit) {
            app(SupplierRejectionWorkflow::class)->syncInspection($receiving->qaInspection, true);
            app(SupplierRejectionWorkflow::class)->completeReplacement($receiving->qaInspection);
            $result = $receiving->status;
            $type = match ($result) {
                'Passed' => 'success',
                'Rejected' => 'error',
                default => 'warning',
            };
            $notification = fn () => new WorkflowNotification(
                'QA Inspection Completed',
                "Receiving #{$receiving->receiving_no} was marked as {$result}.",
                $type,
                $receiving->receiving_no,
                'Quality Inspection',
            );
            $plantManager = $receiving->preparedBy;
            if ($plantManager?->status === 'ACTIVE' && $plantManager->isPlantManager()) {
                WorkflowNotificationSender::send($plantManager, $notification());
            }
        }

        return response()->json($this->presentDetail($receiving));
    }

    private function deleteAttachmentFile(string $path): void
    {
        // Only generated QA attachment paths may be cleaned up.
        if (! preg_match('~^qa-attachments/[A-Za-z0-9]+\.(?:jpe?g|png|pdf)$~', $path)) {
            return;
        }
        try {
            if (! Storage::disk('local')->delete($path)) {
                report(new \RuntimeException('QA attachment cleanup failed.'));
            }
        } catch (Throwable $e) {
            report($e);
        }
    }

    private function authorizedAttachment(Request $request, int $receivingId, ?int $attachmentId = null): ?QaInspectionAttachment
    {
        $inspection = QaInspection::query()
            ->with('attachments')
            ->where('receiving_id', $receivingId)
            ->when($request->user()?->isQaSupervisor(), fn ($query) => $query->whereHas(
                'receiving',
                fn ($receiving) => $receiving->where('assigned_qa_user_id', $request->user()->id)
            ))
            ->first();

        if (! $inspection) {
            return null;
        }

        return $attachmentId
            ? $inspection->attachments->firstWhere('id', $attachmentId)
            : $inspection->attachments->first();
    }

    public function attachment(Request $request, int $receivingId, ?int $attachmentId = null): JsonResponse|StreamedResponse
    {
        if ($response = $this->authorizeQa($request)) {
            return $response;
        }

        $attachment = $this->authorizedAttachment($request, $receivingId, $attachmentId);
        if (! $attachment || ! Storage::disk('local')->exists($attachment->stored_path)) {
            return response()->json(['message' => 'Attachment not found.'], 404);
        }

        return Storage::disk('local')->response($attachment->stored_path, $attachment->original_name, [
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store',
            'Content-Type' => $attachment->mime_type,
            'Content-Disposition' => 'inline; filename="'.str_replace(['"', "\r", "\n"], '', $attachment->original_name).'"',
        ]);
    }

    public function destroyAttachment(Request $request, int $receivingId, int $attachmentId): JsonResponse
    {
        if ($response = $this->authorizeQaWrite($request)) {
            return $response;
        }

        $attachment = $this->authorizedAttachment($request, $receivingId, $attachmentId);
        if (! $attachment) {
            return response()->json(['message' => 'Attachment not found.'], 404);
        }
        if ($attachment->inspection->completed_at) {
            return response()->json(['message' => 'Completed inspection evidence cannot be removed.'], 422);
        }
        $path = $attachment->stored_path;
        $attachment->delete();
        $this->deleteAttachmentFile($path);

        return response()->json(['message' => 'Attachment removed.']);
    }

    public function receivingReceipt(Request $request, int $receivingId, int $receiptAttachmentId): JsonResponse|StreamedResponse
    {
        if ($response = $this->authorizeQa($request)) {
            return $response;
        }

        $receiving = $this->scopeForUser(Receiving::query(), $request)->find($receivingId);
        $attachment = $receiving?->receiptAttachments()->find($receiptAttachmentId);

        if (! $attachment || ! Storage::disk('local')->exists($attachment->stored_path)) {
            return response()->json(['message' => 'Supplier receipt not found.'], 404);
        }

        return Storage::disk('local')->response($attachment->stored_path, $attachment->original_name, [
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store',
            'Content-Type' => $attachment->mime_type,
            'Content-Disposition' => 'inline; filename="'.str_replace(['"', "\r", "\n"], '', $attachment->original_name).'"',
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        if ($response = $this->authorizeQa($request)) {
            return $response;
        }

        $query = $this->scopeForUser(Receiving::query(), $request)
            ->with(['items', 'preparedBy', 'qaInspection'])
            ->where('status', 'Pending QA')
            ->where(function ($builder) {
                $builder->whereDoesntHave('qaInspection')
                    ->orWhereHas('qaInspection', fn ($inspection) => $inspection->whereNull('completed_at'));
            });

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

        $receiving = $this->scopeForUser(Receiving::with([
            'items.product',
            'preparedBy',
            'timeline',
            'qaInspection.items',
            'qaInspection.attachments',
            'qaInspection.inspectedBy',
            'qaInspection.submittedBy',
        ]), $request)->find($receivingId);

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
