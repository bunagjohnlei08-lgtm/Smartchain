<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FinancialPoSubmission;
use App\Models\PurchaseOrder;
use App\Services\Financial\FinancialPoSubmissionService;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FinancialPurchaseOrderController extends Controller
{
    public function store(Request $request, PurchaseOrder $purchaseOrder, FinancialPoSubmissionService $service): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Admin access is required.');

        $submission = $service->submit($purchaseOrder, $request->user());
        $success = $submission->state === FinancialPoSubmission::ACKNOWLEDGED;
        ($success ? [AuditLogger::class, 'success'] : [AuditLogger::class, 'failure'])(
            'PURCHASE_ORDER_FINANCIAL_SUBMISSION',
            AuditLogger::MODULE_PURCHASE_ORDERS,
            [
                'actor' => $request->user(), 'resource' => $purchaseOrder,
                'resource_label' => $purchaseOrder->po_number,
                'details' => $success ? 'Financial acknowledged the Purchase Order submission.' : $submission->last_error_message,
                'metadata' => ['message_id' => $submission->message_id, 'state' => $submission->state, 'financial_reference' => $submission->financial_reference],
            ],
        );

        return response()->json([
            'message' => $success ? 'Financial acknowledged the Purchase Order.' : ($submission->last_error_message ?: 'Financial submission status was updated.'),
            'financial_integration' => $this->present($submission),
        ], $success ? 200 : 202);
    }

    private function present(FinancialPoSubmission $submission): array
    {
        return [
            'enabled' => (bool) config('financial.enabled'),
            'contract_confirmed' => (bool) config('financial.contract_confirmed'),
            'state' => $submission->state,
            'message_id' => $submission->message_id,
            'financial_reference' => $submission->financial_reference,
            'partner_acknowledgment' => $submission->partner_acknowledgment,
            'submitted_at' => $submission->submitted_at?->toIso8601String(),
            'acknowledged_at' => $submission->acknowledged_at?->toIso8601String(),
            'last_error_code' => $submission->last_error_code,
            'last_error_message' => $submission->last_error_message,
        ];
    }
}
