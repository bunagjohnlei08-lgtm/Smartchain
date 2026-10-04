<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\Supplier;
use App\Services\SupplierPerformanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminSupplierPerformanceController extends Controller
{
    public function index(Request $request, SupplierPerformanceService $service): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $request->validate(['search' => ['nullable', 'string', 'max:255']]);

        $suppliers = Supplier::query()
            ->when($request->string('search')->trim()->value(), function ($query, string $search) {
                $term = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $search).'%';
                $query->where(fn ($nested) => $nested->where('supplier_code', 'ilike', $term)->orWhere('name', 'ilike', $term));
            })
            ->with([
                'purchaseOrders' => fn ($query) => $query->where('status', '!=', PurchaseOrder::STATUS_CANCELLED),
                'purchaseOrders.items',
                'purchaseOrders.receivings' => fn ($query) => $query->whereNull('replacement_for_rejection_case_id'),
                'purchaseOrders.receivings.items',
                'purchaseOrders.receivings.discrepancy',
                'purchaseOrders.receivings.qaInspection.items.supplierRejectionCase',
            ])
            ->orderBy('name')->get();

        return response()->json([
            'data' => $service->summarize($suppliers),
            'configuration' => [
                'minimum_eligible_deliveries' => config('supplier_performance.minimum_eligible_deliveries'),
                'weights' => config('supplier_performance.weights'),
                'recognition_tiers' => config('supplier_performance.recognition_tiers'),
            ],
            'definitions' => [
                'eligible_history' => 'Completed or closed-with-shortage POs linked by supplier_id; cancelled POs and replacement receivings are excluded.',
                'on_time_delivery' => 'Normal receiving events delivered on or before their PO expected delivery date; events with missing dates are excluded.',
                'fulfillment' => 'Legitimate normal received quantity divided by ordered quantity across eligible POs.',
                'qa_acceptance' => 'Accepted quantity divided by accepted plus rejected quantity from completed physical QA inspections.',
                'discrepancy_rate' => 'Normal receiving events with a persisted supplier short-delivery discrepancy divided by eligible delivery events; each receiving counts once.',
            ],
        ]);
    }
}
