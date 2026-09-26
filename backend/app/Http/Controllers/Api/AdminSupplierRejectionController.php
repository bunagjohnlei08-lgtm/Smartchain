<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\SupplierRejectionMail;
use App\Models\Supplier;
use App\Models\SupplierRejectionCase;
use App\Support\SupplierRejectionPdf;
use App\Support\SupplierRejectionWorkflow;
use App\Support\AuditLogger;
use App\Support\PurchaseOrderSupplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;
use Throwable;

class AdminSupplierRejectionController extends Controller
{
    private const WITH_GRAPH = [
        'inspectionItem.receivingItem',
        'inspectionItem.inspection.attachments',
        'inspectionItem.inspection.inspectedBy:id,name',
        'inspectionItem.inspection.receiving.purchaseOrder',
        'sentBy:id,name', 'resolvedBy:id,name', 'routedBy:id,name',
        'replacementReceiving.qaInspection', 'replacementReceiving.items',
        'inspectionItem.inspection.receiving.replacementForCase',
    ];

    public function index(Request $request, SupplierRejectionWorkflow $workflow): JsonResponse
    {
        $this->authorizeAdmin($request);
        $workflow->syncCompleted();
        $validated = $request->validate([
            'search' => 'nullable|string|max:100',
            'status' => ['nullable', Rule::in(['PENDING_REVIEW', 'SENT', 'FAILED', 'REPLACEMENT_PENDING', 'RESOLVED'])],
        ]);
        $search = trim((string) ($validated['search'] ?? ''));

        $cases = SupplierRejectionCase::query()->with(self::WITH_GRAPH)
            ->when($validated['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('id', ctype_digit($search) ? (int) $search : 0)
                        ->orWhereHas('inspectionItem.receivingItem', fn ($q) => $q->where('product_name', 'ilike', "%{$search}%"))
                        ->orWhereHas('inspectionItem.inspection.receiving', fn ($q) => $q->where('receiving_no', 'ilike', "%{$search}%"))
                        ->orWhereHas('inspectionItem.inspection.receiving.purchaseOrder', fn ($q) => $q->where('po_number', 'ilike', "%{$search}%")->orWhere('supplier_name', 'ilike', "%{$search}%"));
                });
            })
            ->latest('id')->get();

        return response()->json(['data' => $cases->map(fn ($case) => $this->present($case))->values()]);
    }

    public function show(Request $request, SupplierRejectionCase $supplierRejectionCase): JsonResponse
    {
        $this->authorizeAdmin($request);
        AuditLogger::success('REJECTED_ITEM_REVIEWED', AuditLogger::MODULE_REJECTED_ITEMS, $this->auditContext($supplierRejectionCase));
        return response()->json(['data' => $this->present($supplierRejectionCase->load(self::WITH_GRAPH))]);
    }

    public function send(Request $request, SupplierRejectionCase $supplierRejectionCase, SupplierRejectionPdf $pdf): JsonResponse
    {
        $this->authorizeAdmin($request);
        abort_if($supplierRejectionCase->status === 'RESOLVED', 422, 'Resolved cases cannot be sent.');
        abort_if($supplierRejectionCase->status === 'REPLACEMENT_PENDING', 422, 'Cases routed to Receiving cannot be resent.');
        $supplierRejectionCase->load(self::WITH_GRAPH);
        [$supplier, $error] = $this->resolveSupplier($supplierRejectionCase);
        abort_if($error !== null, 422, $error);

        $email = trim((string) $supplier->email);
        abort_if($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false, 422, 'Supplier email is unavailable.');
        try {
            $document = $pdf->render($supplierRejectionCase, $supplier);
        } catch (Throwable $exception) {
            report($exception);
            abort(500, 'The rejection report PDF could not be generated.');
        }

        DB::transaction(function () use ($supplierRejectionCase) {
            $locked = SupplierRejectionCase::query()->lockForUpdate()->findOrFail($supplierRejectionCase->id);
            abort_if($locked->status === 'RESOLVED', 422, 'Resolved cases cannot be sent.');
            abort_if($locked->status === 'REPLACEMENT_PENDING', 422, 'Cases routed to Receiving cannot be resent.');
            abort_if($locked->status === 'SENDING', 429, 'This report is already being sent.');
            abort_if($locked->sent_at?->greaterThan(now()->subSeconds(60)), 429, 'This report was just sent. Please wait one minute before resending.');
            $locked->update([
                'status' => 'SENDING', 'send_attempts' => $locked->send_attempts + 1,
                'last_send_attempt_at' => now(), 'last_error' => null, 'last_error_at' => null,
            ]);
        });

        $item = $supplierRejectionCase->inspectionItem;
        $receiving = $item->inspection->receiving;
        try {
            Mail::to($email, $supplier->name)->send(new SupplierRejectionMail(
                supplierName: $supplier->name,
                caseReference: $this->reference($supplierRejectionCase),
                poNumber: $receiving->purchaseOrder->po_number,
                receivingNumber: $receiving->receiving_no,
                inspectionDate: $item->inspection->completed_at?->format('M d, Y g:i A') ?? 'Unavailable',
                productName: $item->receivingItem->product_name,
                deliveredQuantity: $item->receivingItem->delivered_quantity,
                rejectedQuantity: $item->rejected_quantity,
                unit: (string) ($item->receivingItem->unit ?? ''),
                qaResult: $item->inspection_result,
                reason: $item->remarks ?: 'No additional remarks were recorded.',
                pdfFilename: SupplierRejectionPdf::filename($supplierRejectionCase),
                pdf: $document,
            ));
        } catch (Throwable $exception) {
            report($exception);
            $supplierRejectionCase->update([
                'status' => 'FAILED', 'last_error_at' => now(),
                'last_error' => 'Delivery was not accepted by the configured email provider.',
            ]);
            AuditLogger::failure('REJECTION_REPORT_SEND_FAILED', AuditLogger::MODULE_REJECTED_ITEMS, $this->auditContext($supplierRejectionCase, $supplier));
            return response()->json(['message' => 'The rejection report could not be emailed. You can retry this case.'], 502);
        }

        $action = $supplierRejectionCase->sent_at ? 'REJECTION_REPORT_RESENT' : 'REJECTION_REPORT_SENT';
        $supplierRejectionCase->update(['status' => 'SENT', 'sent_at' => now(), 'sent_by_id' => $request->user()->id]);
        AuditLogger::success($action, AuditLogger::MODULE_REJECTED_ITEMS, $this->auditContext($supplierRejectionCase, $supplier));
        return response()->json([
            'message' => 'Rejection report sent to the original supplier.',
            'data' => $this->present($supplierRejectionCase->fresh()->load(self::WITH_GRAPH)),
        ]);
    }

    public function resolve(Request $request, SupplierRejectionCase $supplierRejectionCase, SupplierRejectionWorkflow $workflow): JsonResponse
    {
        $this->authorizeAdmin($request);
        $validated = $request->validate([
            'resolution_type' => ['required', Rule::in(['REPLACEMENT', 'NO_REPLACEMENT'])],
            'resolution_notes' => 'nullable|required_if:resolution_type,NO_REPLACEMENT|string|min:3|max:2000',
        ]);
        $notes = isset($validated['resolution_notes']) ? trim($validated['resolution_notes']) : null;

        if ($validated['resolution_type'] === 'REPLACEMENT') {
            [$replacement, $created] = $workflow->routeToReceiving($supplierRejectionCase, $request->user(), $notes);
            $message = $created
                ? "Replacement receiving {$replacement->receiving_no} was created for the Plant Manager."
                : "Replacement receiving {$replacement->receiving_no} already exists for this case.";
        } else {
            $workflow->close($supplierRejectionCase, $request->user(), (string) $notes);
            $message = 'Rejected item case closed without replacement.';
        }

        return response()->json(['message' => $message, 'data' => $this->present($supplierRejectionCase->fresh()->load(self::WITH_GRAPH))]);
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Admin access is required.');
    }

    private function resolveSupplier(SupplierRejectionCase $case): array
    {
        $po = $case->inspectionItem?->inspection?->receiving?->purchaseOrder;
        if (! $po) return [null, 'The QA inspection is not linked to its original Purchase Order.'];
        $supplier = app(PurchaseOrderSupplier::class)->resolve($po);
        if (! $supplier) return [null, 'Original Purchase Order supplier could not be resolved to a registered Supplier. Update the Supplier aliases or Purchase Order supplier information in Supplier Management / Purchase Orders.'];
        return [$supplier, null];
    }

    private function present(SupplierRejectionCase $case): array
    {
        $item = $case->inspectionItem;
        $inspection = $item->inspection;
        $receiving = $inspection->receiving;
        $po = $receiving->purchaseOrder;
        [$supplier, $supplierError] = $this->resolveSupplier($case);
        $sendBlockReason = $supplierError;
        if (! $sendBlockReason && (! $supplier || ! filter_var(trim((string) $supplier->email), FILTER_VALIDATE_EMAIL))) {
            $sendBlockReason = 'Supplier email is unavailable.';
        }
        if ($case->status === 'RESOLVED') $sendBlockReason = 'Resolved cases cannot be sent.';
        if ($case->status === 'REPLACEMENT_PENDING') $sendBlockReason = 'Cases routed to Receiving cannot be resent.';
        if ($case->status === 'SENDING') $sendBlockReason = 'This report is already being sent.';
        $resendAvailableAt = $case->sent_at?->copy()->addSeconds(60);
        if (! $sendBlockReason && $resendAvailableAt?->isFuture()) {
            $sendBlockReason = 'This report was just sent. Please wait one minute before resending.';
        }
        $workflow = app(SupplierRejectionWorkflow::class);
        $replacementBlockReason = $case->status === 'REPLACEMENT_PENDING'
            ? 'A replacement receiving already exists for this case.'
            : $workflow->resolutionBlockReason($case, 'REPLACEMENT');
        $closeBlockReason = $workflow->resolutionBlockReason($case, 'NO_REPLACEMENT');
        $replacement = $case->replacementReceiving;
        $sourceCase = $receiving->replacementForCase;
        return [
            'id' => $case->id, 'reference' => $this->reference($case), 'status' => $case->status,
            'product' => $item->receivingItem->product_name, 'unit' => $item->receivingItem->unit,
            'delivered_quantity' => $item->receivingItem->delivered_quantity,
            'accepted_quantity' => $item->accepted_quantity,
            'rejected_quantity' => $item->rejected_quantity, 'reason' => $item->remarks,
            'inspection_result' => $item->inspection_result, 'inspection_date' => $inspection->completed_at,
            'inspected_by' => $inspection->inspectedBy?->name,
            'receiving' => [
                'id' => $receiving->id, 'number' => $receiving->receiving_no, 'delivery_date' => $receiving->delivery_date, 'reference_number' => $receiving->reference_no,
                'replacement_for_reference' => $sourceCase ? $this->reference($sourceCase) : null,
            ],
            'purchase_order' => $po ? ['id' => $po->id, 'number' => $po->po_number] : null,
            'original_supplier_name' => $po?->supplier_name ?? $receiving->supplier,
            'registered_supplier' => $supplier ? ['name' => $supplier->name, 'code' => $supplier->supplier_code, 'email' => $supplier->email] : null,
            'supplier' => $supplier ? ['id' => $supplier->id, 'code' => $supplier->supplier_code, 'name' => $supplier->name, 'email' => $supplier->email] : ['id' => null, 'code' => null, 'name' => $po?->supplier_name ?? $receiving->supplier, 'email' => null],
            'supplier_error' => $supplierError,
            'can_send' => $sendBlockReason === null,
            'send_block_reason' => $sendBlockReason,
            'resend_available_at' => $resendAvailableAt,
            'attachments' => $inspection->attachments->map(fn ($attachment) => [
                'id' => $attachment->id, 'original_name' => $attachment->original_name,
                'mime_type' => $attachment->mime_type, 'file_size' => $attachment->file_size,
                'view_url' => "/qa/inspections/{$receiving->id}/attachments/{$attachment->id}",
            ])->values(),
            'send_attempts' => $case->send_attempts, 'sent_at' => $case->sent_at,
            'sent_by' => $case->sentBy?->name, 'last_error_at' => $case->last_error_at,
            'last_error' => $case->last_error, 'resolved_at' => $case->resolved_at,
            'resolved_by' => $case->resolvedBy?->name, 'resolution_notes' => $case->resolution_notes,
            'resolution_type' => $case->resolution_type,
            'routed_to_receiving_at' => $case->routed_to_receiving_at, 'routed_by' => $case->routedBy?->name,
            'replacement_receiving' => $replacement ? [
                'id' => $replacement->id, 'number' => $replacement->receiving_no, 'status' => $replacement->status,
                'expected_quantity' => (int) $replacement->items->sum('ordered_quantity'),
                'qa_completed' => $replacement->qaInspection?->completed_at !== null,
            ] : null,
            'can_route_to_receiving' => $replacementBlockReason === null,
            'can_close' => $closeBlockReason === null,
            'can_resolve' => $replacementBlockReason === null || $closeBlockReason === null,
            'resolve_block_reason' => $replacementBlockReason !== null && $closeBlockReason !== null ? $closeBlockReason : null,
        ];
    }

    private function reference(SupplierRejectionCase $case): string
    {
        return SupplierRejectionWorkflow::reference($case);
    }

    private function auditContext(SupplierRejectionCase $case, ?Supplier $supplier = null): array
    {
        $case->loadMissing('inspectionItem.inspection.receiving');
        $inspection = $case->inspectionItem->inspection;
        $receiving = $inspection->receiving;
        return [
            'resource' => $case, 'resource_label' => $this->reference($case),
            'details' => "Supplier rejection workflow action for {$receiving->receiving_no}",
            'metadata' => [
                'case_id' => $case->id, 'qa_inspection_id' => $inspection->id,
                'receiving_id' => $receiving->id, 'receiving_no' => $receiving->receiving_no,
                'supplier_id' => $supplier?->id, 'workflow_status' => $case->status,
            ],
        ];
    }
}
