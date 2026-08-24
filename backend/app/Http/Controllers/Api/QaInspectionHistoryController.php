<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\QaInspection;
use App\Models\QaInspectionItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class QaInspectionHistoryController extends Controller
{
    private const FINAL_STATUSES = ['Passed', 'Rejected', 'Partial'];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user || (! $user->isAdmin() && ! $user->isQaSupervisor())) {
            return response()->json(['message' => 'Unauthorized QA access.'], 403);
        }

        $inspections = QaInspection::query()
            ->with([
                'receiving',
                'items.receivingItem',
                'inspectedBy',
                'submittedBy',
            ])
            ->whereNotNull('completed_at')
            ->whereIn('status', self::FINAL_STATUSES)
            ->orderByDesc('completed_at')
            ->orderByDesc('id')
            ->get();

        $history = $inspections->flatMap(function (QaInspection $inspection) {
            $receiving = $inspection->receiving;

            if (! $receiving) {
                return [];
            }

            return $inspection->items->map(function (QaInspectionItem $item) use ($inspection, $receiving) {
                $receivingItem = $item->receivingItem;

                return [
                    'id' => $item->id,
                    'receiving_id' => $receiving->id,
                    'receiving_no' => $receiving->receiving_no,
                    'supplier' => $receiving->supplier,
                    'product' => $receivingItem?->product_name,
                    'delivered_qty' => $receivingItem?->delivered_quantity,
                    'accepted_qty' => $item->accepted_quantity,
                    'rejected_qty' => $item->rejected_quantity,
                    'unit' => $receivingItem?->unit,
                    'inspection_result' => $item->inspection_result,
                    'remarks' => $item->remarks,
                    'inspected_by' => $inspection->inspectedBy?->name,
                    'submitted_by' => $inspection->submittedBy?->name,
                    'completed_at' => $inspection->completed_at,
                ];
            });
        })->values();

        return response()->json(['data' => $history]);
    }
}
