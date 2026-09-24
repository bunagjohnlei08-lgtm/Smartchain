<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\QaInspectionAttachment;
use App\Models\QaInspectionItem;
use App\Services\QaRejectedItemsWorkbook;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class QaRejectedItemsController extends Controller
{
    public function export(Request $request, QaRejectedItemsWorkbook $workbook): JsonResponse|BinaryFileResponse
    {
        $user = $request->user();

        if (! $user || (! $user->isAdmin() && ! $user->isQaSupervisor())) {
            return response()->json(['message' => 'Unauthorized QA access.'], 403);
        }

        $validated = $request->validate([
            'ids' => ['sometimes', 'string', 'max:4000', 'regex:/^\d+(,\d+)*$/'],
        ]);
        $ids = isset($validated['ids'])
            ? collect(explode(',', $validated['ids']))->map(fn (string $id) => (int) $id)->unique()->values()
            : collect();

        $items = QaInspectionItem::query()
            ->with([
                'inspection.receiving',
                'inspection.inspectedBy',
                'inspection.submittedBy',
                'inspection.attachments',
                'receivingItem',
            ])
            ->where('rejected_quantity', '>', 0)
            ->whereHas('inspection', fn ($inspection) => $inspection->whereNotNull('completed_at'))
            ->when($user->isQaSupervisor(), fn ($query) => $query->whereHas(
                'inspection.receiving',
                fn ($receiving) => $receiving->where('assigned_qa_user_id', $user->id)
            ))
            ->when($ids->isNotEmpty(), fn ($query) => $query->whereIn('id', $ids))
            ->get()
            ->sortByDesc(fn (QaInspectionItem $item) => $item->inspection?->completed_at?->getTimestamp() ?? 0)
            ->values();

        $path = $workbook->create($items);
        $filename = 'qa-rejected-items-'.now()->toDateString().'.xlsx';

        return response()->download($path, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ])->deleteFileAfterSend(true);
    }

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
                'inspection.attachments',
                'receivingItem',
            ])
            ->where('rejected_quantity', '>', 0)
            ->whereHas('inspection', fn ($inspection) => $inspection->whereNotNull('completed_at'))
            ->when($user->isQaSupervisor(), fn ($query) => $query->whereHas(
                'inspection.receiving',
                fn ($receiving) => $receiving->where('assigned_qa_user_id', $user->id)
            ))
            ->get()
            ->sortByDesc(fn (QaInspectionItem $item) => $item->inspection?->completed_at?->getTimestamp() ?? 0)
            ->values()
            ->map(function (QaInspectionItem $item) {
                $inspection = $item->inspection;
                $receiving = $inspection?->receiving;
                $receivingItem = $item->receivingItem;

                return [
                    'id' => $item->id,
                    'receiving_id' => $receiving?->id,
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
                    'attachments' => $inspection?->attachments?->map(
                        fn (QaInspectionAttachment $attachment) => [
                            'id' => $attachment->id,
                            'original_name' => $attachment->original_name,
                            'mime_type' => $attachment->mime_type,
                            'file_size' => $attachment->file_size,
                            'view_url' => "/qa/inspections/{$receiving?->id}/attachments/{$attachment->id}",
                            'created_at' => $attachment->created_at,
                        ]
                    )->values() ?? [],
                ];
            });

        return response()->json(['data' => $items]);
    }
}
