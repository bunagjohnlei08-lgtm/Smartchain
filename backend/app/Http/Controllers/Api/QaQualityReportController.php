<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\QaInspection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class QaQualityReportController extends Controller
{
    private const FINAL_STATUSES = ['Passed', 'Rejected', 'Partial'];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user || (! $user->isAdmin() && ! $user->isQaSupervisor())) {
            return response()->json(['message' => 'Unauthorized QA access.'], 403);
        }

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

        $trend = $inspections
            ->groupBy(fn (QaInspection $inspection) => $inspection->completed_at->toDateString())
            ->map(fn (Collection $daily, string $date) => [
                'date' => $date,
                'passed' => $daily->where('status', 'Passed')->count(),
                'rejected' => $daily->where('status', 'Rejected')->count(),
            ])
            ->values();

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
