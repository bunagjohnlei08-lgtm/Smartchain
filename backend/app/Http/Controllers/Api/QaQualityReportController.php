<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\QaInspection;
use App\Models\QaInspectionAttachment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class QaQualityReportController extends Controller
{
    private const FINAL_STATUSES = ['Passed', 'Rejected', 'Partial'];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user || (! $user->isAdmin() && ! $user->isQaSupervisor())) {
            return response()->json(['message' => 'Unauthorized QA access.'], 403);
        }

        $validated = $request->validate([
            'days' => ['sometimes', 'integer', Rule::in(range(14, 30))],
            'from_date' => ['nullable', 'date_format:Y-m-d'],
            'to_date' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from_date'],
        ]);
        $fromDate = filled($validated['from_date'] ?? null)
            ? Carbon::createFromFormat('Y-m-d', $validated['from_date'])->startOfDay()
            : null;
        $toDate = filled($validated['to_date'] ?? null)
            ? Carbon::createFromFormat('Y-m-d', $validated['to_date'])->addDay()->startOfDay()
            : null;
        $hasCustomRange = $fromDate !== null || $toDate !== null;
        $trendDays = (int) ($validated['days'] ?? 30);
        $trendStart = now()->startOfDay()->subDays($trendDays - 1);
        $trendEnd = now()->addDay()->startOfDay();

        $inspections = QaInspection::query()
            ->with(['receiving', 'items.receivingItem', 'attachments'])
            ->whereNotNull('completed_at')
            ->whereIn('status', self::FINAL_STATUSES)
            ->when($fromDate, fn ($query) => $query->where('completed_at', '>=', $fromDate))
            ->when($toDate, fn ($query) => $query->where('completed_at', '<', $toDate))
            ->when($user->isQaSupervisor(), fn ($query) => $query->whereHas(
                'receiving',
                fn ($receiving) => $receiving->where('assigned_qa_user_id', $user->id)
            ))
            ->orderByDesc('completed_at')
            ->orderByDesc('id')
            ->get();

        $completed = $inspections->count();
        $passed = $inspections->where('status', 'Passed')->count();
        $rejected = $inspections->where('status', 'Rejected')->count();
        $inspectionItems = $inspections->flatMap(fn (QaInspection $inspection) => $inspection->items);
        $passedUnits = (int) $inspectionItems->sum('accepted_quantity');
        $rejectedUnits = (int) $inspectionItems->sum('rejected_quantity');
        $totalInspectedUnits = $passedUnits + $rejectedUnits;
        $percentage = fn (int $quantity): float => $totalInspectedUnits > 0
            ? round(($quantity / $totalInspectedUnits) * 100, 1)
            : 0.0;

        $trendByDate = DB::table('qa_inspections')
            ->join('receivings', 'receivings.id', '=', 'qa_inspections.receiving_id')
            ->join('qa_inspection_items', 'qa_inspection_items.qa_inspection_id', '=', 'qa_inspections.id')
            ->whereNotNull('completed_at')
            ->when($hasCustomRange && $fromDate, fn ($query) => $query->where('qa_inspections.completed_at', '>=', $fromDate))
            ->when($hasCustomRange && $toDate, fn ($query) => $query->where('qa_inspections.completed_at', '<', $toDate))
            ->when(! $hasCustomRange, fn ($query) => $query
                ->where('qa_inspections.completed_at', '>=', $trendStart)
                ->where('qa_inspections.completed_at', '<', $trendEnd))
            ->whereIn('qa_inspections.status', self::FINAL_STATUSES)
            ->when($user->isQaSupervisor(), fn ($query) => $query->where('receivings.assigned_qa_user_id', $user->id))
            ->selectRaw('DATE(qa_inspections.completed_at) AS inspection_date')
            ->selectRaw('COALESCE(SUM(qa_inspection_items.accepted_quantity), 0) AS passed')
            ->selectRaw('COALESCE(SUM(qa_inspection_items.rejected_quantity), 0) AS rejected')
            ->groupByRaw('DATE(qa_inspections.completed_at)')
            ->orderByRaw('DATE(qa_inspections.completed_at)')
            ->get()
            ->keyBy('inspection_date');

        $trend = $hasCustomRange
            ? $trendByDate->values()->map(fn ($daily) => [
                'date' => $daily->inspection_date,
                'passed' => (int) $daily->passed,
                'rejected' => (int) $daily->rejected,
            ])
            : collect(range(0, $trendDays - 1))->map(function (int $offset) use ($trendStart, $trendByDate) {
                $date = $trendStart->copy()->addDays($offset)->toDateString();
                $daily = $trendByDate->get($date);

                return [
                    'date' => $date,
                    'passed' => (int) ($daily->passed ?? 0),
                    'rejected' => (int) ($daily->rejected ?? 0),
                ];
            });

        $topRejectedProducts = $inspectionItems
            ->filter(fn ($item) => $item->rejected_quantity > 0 && $item->receivingItem?->product_name)
            ->groupBy(fn ($item) => $item->receivingItem->product_name)
            ->map(fn (Collection $items, string $product) => [
                'product' => $product,
                'quantity' => (int) $items->sum('rejected_quantity'),
            ])
            ->sortByDesc('quantity')
            ->values()
            ->take(10);

        $supplierQuality = $inspections
            ->filter(fn (QaInspection $inspection) => filled($inspection->receiving?->supplier))
            ->groupBy(fn (QaInspection $inspection) => $inspection->receiving->supplier)
            ->map(function (Collection $supplierInspections, string $supplier) {
                $items = $supplierInspections->flatMap(fn (QaInspection $inspection) => $inspection->items);
                $accepted = (int) $items->sum('accepted_quantity');
                $rejected = (int) $items->sum('rejected_quantity');
                $inspected = $accepted + $rejected;

                return [
                    'name' => $supplier,
                    'inspections' => $supplierInspections->count(),
                    'accepted_quantity' => $accepted,
                    'rejected_quantity' => $rejected,
                    'pass_rate' => $inspected > 0 ? round(($accepted / $inspected) * 100, 1) : 0.0,
                ];
            })
            ->sortByDesc('pass_rate')
            ->values();

        $productionInspections = DB::table('production_batches as pb')
            ->leftJoin('users as inspector', 'inspector.id', '=', 'pb.assigned_qa_user_id')
            ->leftJoin('production_non_conformances as nc', 'nc.production_batch_id', '=', 'pb.id')
            ->whereNotNull('pb.qa_completed_at')
            ->when($fromDate, fn ($query) => $query->where('pb.qa_completed_at', '>=', $fromDate))
            ->when($toDate, fn ($query) => $query->where('pb.qa_completed_at', '<', $toDate))
            ->when($user->isQaSupervisor(), fn ($query) => $query->where('pb.assigned_qa_user_id', $user->id))
            ->orderByDesc('pb.qa_completed_at')->orderByDesc('pb.id')
            ->get(['pb.id as inspection_id', 'pb.batch_number', 'pb.product_name as product', 'inspector.name as inspector',
                'pb.qa_completed_at as inspection_date', 'pb.status', 'pb.actual_quantity as inspected_quantity',
                'pb.passed_quantity as accepted_quantity', 'pb.failed_quantity as rejected_quantity', 'pb.qa_notes as findings',
                'nc.disposition', 'nc.notes as non_conformance_reason'])->map(fn ($row) => (array) $row)->values();

        $inventoryAudits = DB::table('inventory_audit_items as ai')
            ->join('inventories as i', 'i.id', '=', 'ai.inventory_id')->join('products as p', 'p.id', '=', 'i.product_id')
            ->join('warehouses as w', 'w.id', '=', 'i.warehouse_id')->leftJoin('users as qa', 'qa.id', '=', 'ai.qa_user_id')
            ->when($user->isQaSupervisor(), fn ($query) => $query->where('ai.qa_user_id', $user->id))
            ->when($fromDate, fn ($query) => $query->where('ai.submitted_at', '>=', $fromDate))
            ->when($toDate, fn ($query) => $query->where('ai.submitted_at', '<', $toDate))
            ->orderByDesc('ai.submitted_at')->orderByDesc('ai.id')
            ->get(['ai.audit_reference', 'w.name as warehouse', 'p.name as product', 'qa.name as submitted_by', 'ai.submitted_at as audit_date',
                'ai.status', 'ai.audited_quantity', 'ai.failed_quantity', 'ai.result as qa_outcome', 'ai.failure_reason', 'ai.qa_remarks',
                DB::raw("CASE WHEN ai.status = 'APPROVED_FOR_BACKLOAD' THEN 'Approved for backload' WHEN ai.status = 'RETURNED_FOR_REINSPECTION' THEN 'Reinspection required' ELSE NULL END as resolution")])
            ->map(fn ($row) => (array) $row)->values();

        $pendingReceiving = DB::table('receivings as r')->leftJoin('users as qa', 'qa.id', '=', 'r.assigned_qa_user_id')
            ->where('r.status', 'Pending QA')->where('r.assigned_qa_user_id', $user->id)
            ->whereNotExists(fn ($query) => $query->selectRaw('1')->from('qa_inspections as qi')->whereColumn('qi.receiving_id', 'r.id')->whereNotNull('qi.completed_at'))
            ->get(['r.receiving_no as record_id', DB::raw("'Receiving QA' as category"), DB::raw('NULL::text as product_or_batch'), 'r.delivery_date as waiting_since', 'r.status', 'qa.name as assigned_inspector']);
        $pendingProduction = DB::table('production_batches as pb')->leftJoin('users as qa', 'qa.id', '=', 'pb.assigned_qa_user_id')
            ->where('pb.status', 'PENDING_QA')->where('pb.assigned_qa_user_id', $user->id)
            ->get(['pb.batch_number as record_id', DB::raw("'Production QA' as category"), 'pb.product_name as product_or_batch', 'pb.output_recorded_at as waiting_since', 'pb.status', 'qa.name as assigned_inspector']);
        $pendingAudits = DB::table('inventory_audit_items as ai')->leftJoin('users as qa', 'qa.id', '=', 'ai.qa_user_id')
            ->where('ai.qa_user_id', $user->id)->where('ai.status', 'RETURNED_FOR_REINSPECTION')
            ->get(['ai.audit_reference as record_id', DB::raw("'Inventory Audit' as category"), DB::raw('NULL::text as product_or_batch'), 'ai.reviewed_at as waiting_since', 'ai.status', 'qa.name as assigned_inspector']);
        $pendingWorkload = $pendingReceiving->concat($pendingProduction)->concat($pendingAudits)->map(fn ($row) => (array) $row)->values();

        return response()->json([
            'data' => [
                'report_period' => [
                    'from_date' => $fromDate?->toDateString(),
                    'to_date' => $toDate?->copy()->subDay()->toDateString(),
                    'label' => $this->periodLabel($fromDate, $toDate),
                    'is_custom' => $hasCustomRange,
                ],
                'summary' => [
                    'completed_inspections' => $completed,
                    'passed_count' => $passed,
                    'passed_rate' => $percentage($passedUnits),
                    'rejected_count' => $rejected,
                    'rejected_rate' => $percentage($rejectedUnits),
                    'passed_units' => $passedUnits,
                    'rejected_units' => $rejectedUnits,
                    'total_inspected_units' => $totalInspectedUnits,
                    'passed_percentage' => $percentage($passedUnits),
                    'rejected_percentage' => $percentage($rejectedUnits),
                    'rejected_quantity' => $rejectedUnits,
                ],
                'trend' => $trend,
                'distribution' => [
                    ['name' => 'Passed', 'count' => $passedUnits, 'percentage' => $percentage($passedUnits)],
                    ['name' => 'Rejected', 'count' => $rejectedUnits, 'percentage' => $percentage($rejectedUnits)],
                ],
                'top_rejected_products' => $topRejectedProducts,
                'supplier_quality' => $supplierQuality,
                'inspection_evidence' => $inspections->map(function (QaInspection $inspection) {
                    $receiving = $inspection->receiving;

                    return [
                        'inspection_id' => $inspection->id,
                        'receiving_id' => $receiving?->id,
                        'receiving_no' => $receiving?->receiving_no,
                        'supplier' => $receiving?->supplier,
                        'status' => $inspection->status,
                        'completed_at' => $inspection->completed_at,
                        'attachments' => $inspection->attachments->map(fn (QaInspectionAttachment $attachment) => [
                            'id' => $attachment->id,
                            'original_name' => $attachment->original_name,
                            'mime_type' => $attachment->mime_type,
                            'file_size' => $attachment->file_size,
                            'view_url' => "/qa/inspections/{$receiving?->id}/attachments/{$attachment->id}",
                            'created_at' => $attachment->created_at,
                        ])->values(),
                    ];
                })->values(),
                'production_inspections' => $productionInspections,
                'inventory_audits' => $inventoryAudits,
                'pending_workload' => $pendingWorkload,
                'operational_summary' => [
                    'production_inspections' => $productionInspections->count(),
                    'production_accepted_quantity' => (int) $productionInspections->sum('accepted_quantity'),
                    'production_rejected_quantity' => (int) $productionInspections->sum('rejected_quantity'),
                    'inventory_audits' => $inventoryAudits->count(),
                    'pending_workload' => $pendingWorkload->count(),
                ],
            ],
        ]);
    }

    private function periodLabel(?Carbon $fromDate, ?Carbon $exclusiveToDate): string
    {
        $toDate = $exclusiveToDate?->copy()->subDay();

        if ($fromDate && $toDate) {
            return $fromDate->format('F j, Y').' – '.$toDate->format('F j, Y');
        }

        if ($fromDate) {
            return 'From '.$fromDate->format('F j, Y');
        }

        if ($toDate) {
            return 'Through '.$toDate->format('F j, Y');
        }

        return 'All completed inspections';
    }
}
