<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\QaInspection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
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
        ]);
        $trendDays = (int) ($validated['days'] ?? 30);
        $trendStart = now()->startOfDay()->subDays($trendDays - 1);
        $trendEnd = now()->addDay()->startOfDay();

        $inspections = QaInspection::query()
            ->with(['receiving', 'items.receivingItem'])
            ->whereNotNull('completed_at')
            ->whereIn('status', self::FINAL_STATUSES)
            ->orderBy('completed_at')
            ->get();

        $completed = $inspections->count();
        $passed = $inspections->where('status', 'Passed')->count();
        $rejected = $inspections->where('status', 'Rejected')->count();
        $comparisonTotal = $passed + $rejected;
        $percentage = fn (int $count): float => $comparisonTotal > 0 ? round(($count / $comparisonTotal) * 100, 1) : 0.0;

        $trendByDate = DB::table('qa_inspections')
            ->join('qa_inspection_items', 'qa_inspection_items.qa_inspection_id', '=', 'qa_inspections.id')
            ->whereNotNull('completed_at')
            ->where('qa_inspections.completed_at', '>=', $trendStart)
            ->where('qa_inspections.completed_at', '<', $trendEnd)
            ->whereIn('qa_inspections.status', self::FINAL_STATUSES)
            ->selectRaw('DATE(qa_inspections.completed_at) AS inspection_date')
            ->selectRaw('COALESCE(SUM(qa_inspection_items.accepted_quantity), 0) AS passed')
            ->selectRaw('COALESCE(SUM(qa_inspection_items.rejected_quantity), 0) AS rejected')
            ->groupByRaw('DATE(qa_inspections.completed_at)')
            ->orderByRaw('DATE(qa_inspections.completed_at)')
            ->get()
            ->keyBy('inspection_date');

        $trend = collect(range(0, $trendDays - 1))->map(function (int $offset) use ($trendStart, $trendByDate) {
            $date = $trendStart->copy()->addDays($offset)->toDateString();
            $daily = $trendByDate->get($date);

            return [
                'date' => $date,
                'passed' => (int) ($daily->passed ?? 0),
                'rejected' => (int) ($daily->rejected ?? 0),
            ];
        });

        $inspectionItems = $inspections->flatMap(fn (QaInspection $inspection) => $inspection->items);
        $rejectedQuantity = (int) $inspectionItems->sum('rejected_quantity');
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

        return response()->json([
            'data' => [
                'summary' => [
                    'completed_inspections' => $completed,
                    'passed_count' => $passed,
                    'passed_rate' => $percentage($passed),
                    'rejected_count' => $rejected,
                    'rejected_rate' => $percentage($rejected),
                    'rejected_quantity' => $rejectedQuantity,
                ],
                'trend' => $trend,
                'distribution' => [
                    ['name' => 'Passed', 'count' => $passed, 'percentage' => $percentage($passed)],
                    ['name' => 'Rejected', 'count' => $rejected, 'percentage' => $percentage($rejected)],
                ],
                'top_rejected_products' => $topRejectedProducts,
                'supplier_quality' => $supplierQuality,
            ],
        ]);
    }
}
