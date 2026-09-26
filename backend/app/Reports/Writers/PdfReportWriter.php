<?php

namespace App\Reports\Writers;

use App\Reports\ReportDefinition;
use Dompdf\Dompdf;
use Dompdf\Options;
use RuntimeException;

/** Tabular report PDF rendered with the project's existing dompdf setup. */
class PdfReportWriter implements ReportWriter
{
    /** dompdf renders in memory; larger reports must use CSV or Excel. */
    public const MAX_ROWS = 1000;

    public function write(ReportDefinition $definition, iterable $rows, array $meta): string
    {
        $options = new Options();
        $options->setIsRemoteEnabled(false);
        $options->setIsPhpEnabled(false);
        $options->setDefaultFont('DejaVu Sans');

        $dompdf = new Dompdf($options);
        $dompdf->loadHtml(view('pdf.report', [
            'meta' => $meta,
            'columns' => array_values($definition->columns),
            'rows' => $rows,
        ])->render());
        $dompdf->setPaper('A4', count($definition->columns) > 6 ? 'landscape' : 'portrait');
        $dompdf->render();

        $path = tempnam(sys_get_temp_dir(), 'report-pdf-');
        if ($path === false || file_put_contents($path, (string) $dompdf->output()) === false) {
            throw new RuntimeException('Unable to create the PDF export.');
        }

        return $path;
    }

    public function extension(): string { return 'pdf'; }

    public function mimeType(): string { return 'application/pdf'; }
}
