<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\ReceivingDiscrepancy;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ReceivingDiscrepancyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403);

        $cases = ReceivingDiscrepancy::query()
            ->with(['purchaseOrder:id,po_number,supplier_name,status', 'receiving:id,receiving_no,delivery_date', 'reportedBy:id,name', 'resolvedBy:id,name'])
            ->latest('reported_at')
            ->get();

        return response()->json(['data' => $cases]);
    }

    public function update(Request $request, ReceivingDiscrepancy $receivingDiscrepancy): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403);

        $validated = $request->validate([
            'action' => ['required', Rule::in(['CONTACT_SUPPLIER', 'AWAIT_BALANCE', 'CLOSE_SHORTAGE'])],
            'supplier_response' => ['nullable', 'string', 'max:2000', Rule::requiredIf($request->input('action') === 'AWAIT_BALANCE')],
            'resolution_notes' => ['nullable', 'string', 'max:2000', Rule::requiredIf($request->input('action') === 'CLOSE_SHORTAGE')],
        ]);

        $case = DB::transaction(function () use ($validated, $request, $receivingDiscrepancy) {
            $case = ReceivingDiscrepancy::query()->lockForUpdate()->findOrFail($receivingDiscrepancy->id);
            abort_if(in_array($case->status, [ReceivingDiscrepancy::STATUS_RESOLVED, ReceivingDiscrepancy::STATUS_CLOSED_SHORTAGE], true), 422, 'This discrepancy is already closed.');

            $attributes = match ($validated['action']) {
                'CONTACT_SUPPLIER' => [
                    'status' => ReceivingDiscrepancy::STATUS_CONTACTED,
                    'supplier_response' => $validated['supplier_response'] ?? $case->supplier_response,
                ],
                'AWAIT_BALANCE' => [
                    'status' => ReceivingDiscrepancy::STATUS_AWAITING_BALANCE,
                    'supplier_response' => $validated['supplier_response'],
                ],
                'CLOSE_SHORTAGE' => [
                    'status' => ReceivingDiscrepancy::STATUS_CLOSED_SHORTAGE,
                    'resolution_notes' => $validated['resolution_notes'],
                    'resolved_by_id' => $request->user()->id,
                    'resolved_at' => now(),
                ],
            };

            $case->update($attributes);
            if ($validated['action'] === 'CLOSE_SHORTAGE') {
                PurchaseOrder::query()->whereKey($case->purchase_order_id)->update(['status' => 'Closed with Shortage']);
            } else {
                PurchaseOrder::query()->whereKey($case->purchase_order_id)->where('status', '!=', 'Completed')->update(['status' => 'Partially Received']);
            }

            AuditLogger::success('SHORT_DELIVERY_'.$validated['action'], AuditLogger::MODULE_PURCHASE_ORDERS, [
                'resource' => $case,
                'resource_label' => 'Discrepancy #'.$case->id,
                'details' => 'Updated short-delivery discrepancy status to '.$case->status,
                'metadata' => ['purchase_order_id' => $case->purchase_order_id, 'receiving_id' => $case->receiving_id, 'short_quantity' => $case->short_quantity],
            ]);

            return $case;
        });

        return response()->json($case->fresh(['purchaseOrder:id,po_number,status', 'receiving:id,receiving_no']));
    }
}
