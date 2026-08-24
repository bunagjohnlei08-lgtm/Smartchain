<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\QaInspectionItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class QaRejectedItemsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user || (! $user->isAdmin() && ! $user->isQaSupervisor())) {
            return response()->json(['message' => 'Unauthorized QA access.'], 403);
        }

        $items = QaInspectionItem::query()
            ->with([
                'inspection.receiving',
                'inspection.inspectedBy',
                'inspection.submittedBy',
                'receivingItem',
            ])
            ->where('rejected_quantity', '>', 0)
            ->whereHas('inspection', fn ($inspection) => $inspection->whereNotNull('completed_at'))
            ->get()
            ->sortByDesc(fn (QaInspectionItem $item) => $item->inspection?->completed_at?->getTimestamp() ?? 0)
            ->values()
            ->map(function (QaInspectionItem $item) {
                $inspection = $item->inspection;
                $receiving = $inspection?->receiving;
                $receivingItem = $item->receivingItem;

                return [
                    'id' => $item->id,
                    'receiving_no' => $receiving?->receiving_no,
                    'supplier' => $receiving?->supplier,
                    'product' => $receivingItem?->product_name,
                    'delivered_qty' => $receivingItem?->delivered_quantity,
                    'rejected_qty' => $item->rejected_quantity,
                    'unit' => $receivingItem?->unit,
                    'reason' => $item->remarks,
                    'inspection_result' => $item->inspection_result,
                    'inspected_by' => $inspection?->inspectedBy?->name,
                    'submitted_by' => $inspection?->submittedBy?->name,
                    'inspection_date' => $inspection?->completed_at,
                ];
            });

        return response()->json(['data' => $items]);
    }
}
