<?php
namespace App\Reports\Writers;

use App\Reports\ReportDefinition;
use RuntimeException;
use ZipArchive;

class ReceiptZipReportWriter implements ReportWriter
{
    public function write(ReportDefinition $definition, iterable $rows, array $meta): string
    {
        $pdf = app(PdfReportWriter::class)->write($definition, $rows, $meta);
        $path = tempnam(sys_get_temp_dir(), 'receipts-zip-');
        $zip = new ZipArchive();
        $manifest = fopen('php://temp', 'w+');
        try {
            if (!$path || $zip->open($path, ZipArchive::OVERWRITE) !== true) throw new RuntimeException('Unable to create documentary export.');
            $zip->addFile($pdf, 'Receiving-Report.pdf');
            fputcsv($manifest, ['Receiving Number','Document Reference','Original Filename','Archive File','Status'], ',', '"', '');
            foreach (($meta['receipts'])() as $receipt) {
                $extension = ['image/jpeg'=>'jpg','image/png'=>'png','application/pdf'=>'pdf'][$receipt['mime']] ?? 'bin';
                $number = preg_replace('/[^A-Za-z0-9_-]/', '_', $receipt['receiving_no']);
                $name = $number.'/'.$receipt['reference'].'.'.$extension;
                if ($receipt['bytes'] !== null) $zip->addFromString($name, $receipt['bytes']);
                $values = [$receipt['receiving_no'], $receipt['reference'], $receipt['filename'], $receipt['bytes'] !== null ? $name : '', $receipt['available'] ? 'Included' : 'Missing or invalid'];
                fputcsv($manifest, array_map(fn ($value) => preg_match('/^[=+@\-\t\r]/', $value) ? "'".$value : $value, $values), ',', '"', '');
            }
            rewind($manifest); $zip->addFromString('Receipt-Manifest.csv', stream_get_contents($manifest));
            if (!$zip->close()) throw new RuntimeException('Unable to finish documentary export.');
        } catch (\Throwable $error) { if ($path) @unlink($path); throw $error; }
        finally { fclose($manifest); @unlink($pdf); }
        return $path;
    }
    public function extension(): string { return 'zip'; }
    public function mimeType(): string { return 'application/zip'; }
}
