<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\ReceivingDiscrepancy;
use App\Support\AuditLogger;
use App\Support\ReplenishmentLifecycle;
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
            ->with(['purchaseOrder:id,po_number,supplier_name,status', 'receiving:id,receiving_no,delivery_date', 'reportedBy:id,name', 'contactedBy:id,name', 'respondedBy:id,name', 'resolvedBy:id,name', 'resolvedByReceiving:id,receiving_no,delivery_date'])
            ->latest('reported_at')
            ->get();

        return response()->json(['data' => $cases]);
    }

    public function update(Request $request, ReceivingDiscrepancy $receivingDiscrepancy, ReplenishmentLifecycle $replenishmentLifecycle): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403);

        $validated = $request->validate([
            'action' => ['required', Rule::in(['CONTACT_SUPPLIER', 'RECORD_RESPONSE', 'CLOSE_SHORTAGE'])],
            'contact_method' => ['nullable', Rule::requiredIf($request->input('action') === 'CONTACT_SUPPLIER'), Rule::in(['PHONE', 'EMAIL', 'OTHER'])],
            'contact_note' => ['nullable', 'string', 'max:2000'],
            'supplier_response_code' => ['nullable', Rule::requiredIf($request->input('action') === 'RECORD_RESPONSE'), Rule::in([
                ReceivingDiscrepancy::RESPONSE_WILL_FULFILL,
                ReceivingDiscrepancy::RESPONSE_WILL_NOT_FULFILL,
                ReceivingDiscrepancy::RESPONSE_OTHER,
            ])],
            'response_notes' => ['nullable', 'string', 'max:2000', Rule::requiredIf(fn () => $request->input('action') === 'RECORD_RESPONSE' && in_array($request->input('supplier_response_code'), [ReceivingDiscrepancy::RESPONSE_WILL_NOT_FULFILL, ReceivingDiscrepancy::RESPONSE_OTHER], true))],
            'expected_balance_delivery_date' => ['nullable', 'date', 'after_or_equal:today', Rule::prohibitedIf(fn () => $request->input('action') === 'RECORD_RESPONSE' && $request->input('supplier_response_code') !== ReceivingDiscrepancy::RESPONSE_WILL_FULFILL)],
            'resolution_notes' => ['nullable', 'string', 'max:2000', Rule::requiredIf($request->input('action') === 'CLOSE_SHORTAGE')],
        ]);

        $case = DB::transaction(function () use ($validated, $request, $receivingDiscrepancy, $replenishmentLifecycle) {
            $case = ReceivingDiscrepancy::query()->lockForUpdate()->findOrFail($receivingDiscrepancy->id);
            abort_if(in_array($case->status, [ReceivingDiscrepancy::STATUS_RESOLVED, ReceivingDiscrepancy::STATUS_CLOSED_SHORTAGE], true), 422, 'This discrepancy is already closed.');

            if ($validated['action'] === 'CONTACT_SUPPLIER') {
                abort_unless(in_array($case->status, [ReceivingDiscrepancy::STATUS_REPORTED, ReceivingDiscrepancy::STATUS_CONTACTED, ReceivingDiscrepancy::STATUS_AWAITING_RESPONSE], true), 422, 'A supplier response has already been recorded.');
            }

            $attributes = match ($validated['action']) {
                'CONTACT_SUPPLIER' => [
                    'status' => ReceivingDiscrepancy::STATUS_AWAITING_RESPONSE,
                    'contact_method' => $validated['contact_method'],
                    'contact_note' => $validated['contact_note'] ?? null,
                    'contacted_by_id' => $request->user()->id,
                    'contacted_at' => now(),
                ],
                'RECORD_RESPONSE' => [
                    'status' => $validated['supplier_response_code'] === ReceivingDiscrepancy::RESPONSE_WILL_FULFILL
                        ? ReceivingDiscrepancy::STATUS_AWAITING_BALANCE
                        : ReceivingDiscrepancy::STATUS_UNDER_RESOLUTION,
                    'supplier_response_code' => $validated['supplier_response_code'],
                    'supplier_response' => $validated['response_notes'] ?? null,
                    'response_notes' => $validated['response_notes'] ?? null,
                    'expected_balance_delivery_date' => $validated['expected_balance_delivery_date'] ?? null,
                    'responded_by_id' => $request->user()->id,
                    'responded_at' => now(),
                ],
                'CLOSE_SHORTAGE' => [
                    'status' => ReceivingDiscrepancy::STATUS_CLOSED_SHORTAGE,
                    'resolution_notes' => $validated['resolution_notes'],
                    'resolved_by_id' => $request->user()->id,
                    'resolved_at' => now(),
                ],
            };

            if ($validated['action'] === 'RECORD_RESPONSE') {
                abort_unless(in_array($case->status, [ReceivingDiscrepancy::STATUS_CONTACTED, ReceivingDiscrepancy::STATUS_AWAITING_RESPONSE, ReceivingDiscrepancy::STATUS_UNDER_RESOLUTION, ReceivingDiscrepancy::STATUS_AWAITING_BALANCE], true), 422, 'Contact the supplier before recording a response.');
            }
            if ($validated['action'] === 'CLOSE_SHORTAGE') {
                abort_unless($case->supplier_response_code === ReceivingDiscrepancy::RESPONSE_WILL_NOT_FULFILL, 422, 'Record that the supplier will not fulfill the balance before closing the case.');
            }

            $case->update($attributes);
            $purchaseOrder = PurchaseOrder::query()->lockForUpdate()->findOrFail($case->purchase_order_id);
            if ($validated['action'] === 'CLOSE_SHORTAGE') {
                $purchaseOrder->update(['status' => PurchaseOrder::STATUS_CLOSED_WITH_SHORTAGE]);
            } elseif ($purchaseOrder->status !== PurchaseOrder::STATUS_COMPLETED) {
                $purchaseOrder->update(['status' => PurchaseOrder::STATUS_PARTIALLY_RECEIVED]);
            }
            $replenishmentLifecycle->synchronize($purchaseOrder);

            $auditAction = match ($validated['action']) {
                'CONTACT_SUPPLIER' => 'SUPPLIER_CONTACTED',
                'RECORD_RESPONSE' => 'SUPPLIER_RESPONSE_RECORDED',
                'CLOSE_SHORTAGE' => 'SHORTAGE_CASE_CLOSED',
            };
            AuditLogger::success($auditAction, AuditLogger::MODULE_PURCHASE_ORDERS, [
                'resource' => $case,
                'resource_label' => 'Discrepancy #'.$case->id,
                'details' => 'Updated short-delivery discrepancy status to '.$case->status,
                'metadata' => [
                    'purchase_order_id' => $case->purchase_order_id,
                    'receiving_id' => $case->receiving_id,
                    'short_quantity' => $case->short_quantity,
                    'contact_method' => $case->contact_method,
                    'supplier_response_code' => $case->supplier_response_code,
                    'expected_balance_delivery_date' => $case->expected_balance_delivery_date?->toDateString(),
                ],
            ]);
            if ($validated['action'] === 'RECORD_RESPONSE' && $case->supplier_response_code === ReceivingDiscrepancy::RESPONSE_WILL_FULFILL) {
                AuditLogger::success('BALANCE_DELIVERY_EXPECTED', AuditLogger::MODULE_PURCHASE_ORDERS, [
                    'resource' => $case,
                    'resource_label' => 'Discrepancy #'.$case->id,
                    'details' => 'Supplier will fulfill the outstanding balance.',
                    'metadata' => [
                        'purchase_order_id' => $case->purchase_order_id,
                        'receiving_id' => $case->receiving_id,
                        'short_quantity' => $case->short_quantity,
                        'expected_balance_delivery_date' => $case->expected_balance_delivery_date?->toDateString(),
                    ],
                ]);
            }

            return $case;
        });

        return response()->json($case->fresh(['purchaseOrder:id,po_number,status', 'receiving:id,receiving_no', 'reportedBy:id,name', 'contactedBy:id,name', 'respondedBy:id,name', 'resolvedBy:id,name', 'resolvedByReceiving:id,receiving_no,delivery_date']));
    }
}
