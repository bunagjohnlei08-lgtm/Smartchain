<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FinancialObligation;
use App\Models\PurchaseOrder;
use App\Models\Receiving;
use App\Services\Financial\FinancialObligationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FinancialObligationController extends Controller
{
    public function store(Request $request, PurchaseOrder $purchaseOrder, Receiving $receiving, FinancialObligationService $service): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Admin access is required.');
        $validated = $request->validate(['external_reference_id' => ['required', 'string', 'max:100', 'regex:/^[A-Za-z0-9._:-]+$/']]);
        $obligation = $service->sendBillableObligationToFinance($purchaseOrder, $receiving, $validated['external_reference_id'], $request->user());

        return response()->json([
            'message' => $obligation->state === FinancialObligation::BILL_CREATED
                ? 'Financial created the AP bill; payment remains unpaid.'
                : ($obligation->last_error_message ?: 'Financial obligation status is unchanged.'),
            'financial_obligation' => [
                'state' => $obligation->state,
                'external_reference_id' => $obligation->external_reference_id,
                'amount' => $obligation->amount,
                'bill_number' => $obligation->bill_number,
                'transaction_code' => $obligation->transaction_code,
                'financial_status' => $obligation->financial_status,
                'submitted_at' => $obligation->submitted_at?->toIso8601String(),
                'acknowledged_at' => $obligation->acknowledged_at?->toIso8601String(),
                'last_error_code' => $obligation->last_error_code,
                'last_error_message' => $obligation->last_error_message,
            ],
        ], $obligation->state === FinancialObligation::BILL_CREATED ? 200 : 202);
    }
}
