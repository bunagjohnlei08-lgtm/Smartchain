<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ReceivingReceiptAttachment;
use App\Reports\ReceivingReportEvidence;
use App\Services\ReportAccessAuthorization;
use Illuminate\Http\Request;

class ReceivingReportEvidenceController extends Controller
{
    public function show(Request $request, string $number, ReceivingReportEvidence $evidence)
    {
        $record = $evidence->query($request->user())->where('receiving_no', $number)->firstOrFail();
        $rows = $evidence->register([$number], $request->user());
        $ids = $record->receiptAttachments()->pluck('id')->values();
        foreach ($rows as $index => &$row) {
            unset($row['image']);
            $row['id'] = $ids[$index];
        }
        return response()->json(['receiving_no'=>$number, 'purchase_order'=>$record->purchase_order, 'supplier'=>$record->supplier,
            'delivery_date'=>$record->delivery_date?->toDateString(), 'files'=>$rows])->header('Cache-Control','private, no-store');
    }

    public function file(Request $request, string $number, ReceivingReceiptAttachment $attachment, ReceivingReportEvidence $evidence, ReportAccessAuthorization $authorizations)
    {
        $record = $evidence->query($request->user())->where('receiving_no', $number)->firstOrFail();
        abort_unless($attachment->receiving_id === $record->id, 404);
        $action = $request->boolean('download') ? 'DOWNLOAD' : 'PREVIEW';
        $authorizations->consume($request, 'receiving-receipt:'.$attachment->id, $attachment->mime_type === 'application/pdf' ? 'PDF' : 'IMAGE', $action);
        $bytes = $evidence->bytes($attachment);
        abort_if($bytes === null, 404, 'Receipt unavailable.');
        $extension = ['image/jpeg'=>'jpg','image/png'=>'png','application/pdf'=>'pdf'][$attachment->mime_type];
        return response($bytes)->withHeaders(['Content-Type'=>$attachment->mime_type, 'X-Content-Type-Options'=>'nosniff',
            'Cache-Control'=>'private, no-store', 'Content-Disposition'=>($action === 'DOWNLOAD' ? 'attachment' : 'inline').'; filename="RECEIPT-'.$attachment->id.'.'.$extension.'"']);
    }
}
