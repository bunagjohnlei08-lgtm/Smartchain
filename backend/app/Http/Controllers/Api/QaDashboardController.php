<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\QaInspection;
use App\Models\QaInspectionItem;
use App\Models\Receiving;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class QaDashboardController extends Controller
{
    private const FINAL_STATUSES = ['Passed', 'Rejected', 'Partial'];

    public function index(Request $request): JsonResponse
    {
        if (! $request->user()?->isQaSupervisor()) {
            return response()->json(['message' => 'QA Supervisor access is required.'], 403);
        }

        $completed = QaInspection::query()
            ->whereNotNull('completed_at')
            ->whereIn('status', self::FINAL_STATUSES);

        $completedCount = (clone $completed)->count();
        $passedCount = (clone $completed)->where('status', 'Passed')->count();

        $quantities = QaInspectionItem::query()
            ->whereHas('inspection', fn ($query) => $query
                ->whereNotNull('completed_at')
                ->whereIn('status', self::FINAL_STATUSES))
            ->selectRaw('COALESCE(SUM(accepted_quantity), 0) AS accepted_total')
            ->selectRaw('COALESCE(SUM(rejected_quantity), 0) AS rejected_total')
            ->first();

        $pendingQuery = Receiving::query()
            ->where('status', 'Pending QA')
            ->where(function ($query) {
                $query->whereDoesntHave('qaInspection')
                    ->orWhereHas('qaInspection', fn ($inspection) => $inspection->whereNull('completed_at'));
            });

        $recentActivities = (clone $completed)
            ->with(['receiving.items', 'submittedBy', 'inspectedBy'])
            ->orderByDesc('completed_at')
            ->orderByDesc('id')
            ->limit(8)
            ->get()
            ->map(function (QaInspection $inspection) {
                $receiving = $inspection->receiving;
                $products = $receiving?->items->pluck('product_name')->filter()->values() ?? collect();
                $productSummary = match (true) {
                    $products->isEmpty() => null,
                    $products->count() === 1 => $products->first(),
                    default => $products->first().' +'.($products->count() - 1).' more',
                };

                return [
                    'id' => $inspection->id,
                    'user' => $inspection->submittedBy?->name ?? $inspection->inspectedBy?->name,
                    'status' => $inspection->status,
                    'receiving_no' => $receiving?->receiving_no,
                    'product' => $productSummary,
                    'completed_at' => $inspection->completed_at,
                ];
            });

        $inspectionQueue = (clone $pendingQuery)
            ->with(['items', 'qaInspection'])
            ->orderBy('delivery_date')
            ->orderBy('id')
            ->limit(10)
            ->get()
            ->map(function (Receiving $receiving) {
                $products = $receiving->items->pluck('product_name')->filter()->values();
                $productSummary = match (true) {
                    $products->isEmpty() => null,
                    $products->count() === 1 => $products->first(),
                    default => $products->first().' +'.($products->count() - 1).' more',
                };

                return [
                    'id' => $receiving->id,
                    'receiving_no' => $receiving->receiving_no,
                    'purchase_order' => $receiving->purchase_order,
                    'supplier' => $receiving->supplier,
                    'product' => $productSummary,
                    'quantity' => $receiving->items->sum('delivered_quantity'),
                    'delivery_date' => $receiving->delivery_date?->toDateString(),
                    'status' => $receiving->qaInspection ? 'In Progress' : 'Pending',
                ];
            });

        return response()->json([
            'todays_inspections' => (clone $completed)->whereDate('completed_at', today())->count(),
            'pending_inspection' => (clone $pendingQuery)->count(),
            'approved_products' => (int) ($quantities?->accepted_total ?? 0),
            'rejected_products' => (int) ($quantities?->rejected_total ?? 0),
            'inspection_rate' => $completedCount > 0 ? round(($passedCount / $completedCount) * 100, 1) : 0,
            'recent_activities' => $recentActivities,
            'inspection_queue' => $inspectionQueue,
        ]);
    }
}
