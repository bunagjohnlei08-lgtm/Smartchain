<?php

namespace App\Support;

use App\Models\Supplier;
use App\Models\SupplierRejectionCase;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class SupplierRejectionPdf
{
    public function render(SupplierRejectionCase $case, Supplier $supplier): string
    {
        $case->loadMissing('inspectionItem.inspection.attachments', 'inspectionItem.inspection.receiving.purchaseOrder', 'inspectionItem.receivingItem');
        $options = new Options();
        $options->setIsRemoteEnabled(false);
        $options->setIsPhpEnabled(false);
        $options->setDefaultFont('DejaVu Sans');
        $dompdf = new Dompdf($options);
        $evidence = $this->evidenceFor($case);
        $dompdf->loadHtml(view('pdf.supplier-rejection', compact('case', 'supplier', 'evidence'))->render());
        $dompdf->setPaper('A4');
        $dompdf->render();
        return (string) $dompdf->output();
    }

    public function evidenceFor(SupplierRejectionCase $case): array
    {
        $case->loadMissing('inspectionItem.inspection.attachments');

        return $case->inspectionItem->inspection->attachments->map(function ($attachment): array {
            $entry = [
                'original_name' => $attachment->original_name,
                'file_size' => $attachment->file_size,
                'kind' => $attachment->mime_type === 'application/pdf' ? 'pdf' : 'unavailable',
                'data_uri' => null,
            ];

            if (! in_array($attachment->mime_type, ['image/jpeg', 'image/png'], true)) {
                return $entry;
            }

            $disk = Storage::disk('local');
            if (! $disk->exists($attachment->stored_path)) {
                Log::warning('QA evidence file unavailable while generating supplier rejection report.', [
                    'attachment_id' => $attachment->id,
                    'qa_inspection_id' => $attachment->qa_inspection_id,
                ]);
                return $entry;
            }

            try {
                $bytes = $disk->get($attachment->stored_path);
                $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
                if (! in_array($mime, ['image/jpeg', 'image/png'], true)) {
                    Log::warning('QA evidence content type was not an embeddable image.', ['attachment_id' => $attachment->id]);
                    return $entry;
                }
                $entry['kind'] = 'image';
                $entry['data_uri'] = 'data:'.$mime.';base64,'.base64_encode($bytes);
            } catch (\Throwable $exception) {
                report($exception);
                Log::warning('QA evidence could not be read for supplier rejection report.', ['attachment_id' => $attachment->id]);
            }

            return $entry;
        })->all();
    }

    public static function filename(SupplierRejectionCase $case): string
    {
        return sprintf('rejection-case-%06d.pdf', $case->id);
    }
}
