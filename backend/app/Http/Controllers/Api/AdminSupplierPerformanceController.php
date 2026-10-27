<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\Supplier;
use App\Models\SupplierPerformanceSnapshot;
use App\Support\AuditLogger;
use App\Services\SupplierPerformanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

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
                'performanceSnapshots',
            ])
            ->orderBy('name')->get();

        return response()->json([
            'data' => collect($service->summarize($suppliers))->map(function(array $row)use($suppliers){$supplier=$suppliers->firstWhere('id',$row['supplier']['id']);$row['snapshot_history']=$supplier?->performanceSnapshots->take(20)->values()??collect();return $row;})->values(),
            'configuration' => [
                'policy_active' => config('supplier_performance.policy_active'),
                'policy_version' => config('supplier_performance.policy_version'),
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

    public function snapshot(Request $request, Supplier $supplier, SupplierPerformanceService $service): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        abort_unless(config('supplier_performance.policy_active') === true, 503, 'The supplier recognition policy is still an inactive draft.');
        $data=$request->validate(['override_reason'=>['nullable','string','min:10','max:2000']]);
        $summary=$service->summarizeSupplier($supplier);
        $firstOrderAt=$supplier->purchaseOrders()->where('status','!=',PurchaseOrder::STATUS_CANCELLED)->min('created_at');
        $snapshot=SupplierPerformanceSnapshot::create(['supplier_id'=>$supplier->id,'policy_version'=>config('supplier_performance.policy_version'),'period_from'=>$firstOrderAt?Carbon::parse($firstOrderAt)->toDateString():null,'period_to'=>today(),'metrics'=>$summary['metrics'],'counts'=>$summary['counts'],'eligibility_status'=>$summary['eligibility_status'],'overall_score'=>$summary['overall_score'],'recognition_tier'=>$summary['recognition'],'calculated_by'=>$request->user()->id,'calculated_at'=>now(),'override_reason'=>$data['override_reason']??null]);
        AuditLogger::success('SUPPLIER_PERFORMANCE_SNAPSHOT_CREATED',AuditLogger::MODULE_SUPPLIERS,['actor'=>$request->user(),'resource'=>$supplier,'resource_label'=>$supplier->supplier_code,'metadata'=>['snapshot_id'=>$snapshot->id,'policy_version'=>$snapshot->policy_version,'tier'=>$snapshot->recognition_tier]]);
        return response()->json(['data'=>$snapshot],201);
    }
}
