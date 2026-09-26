<?php

namespace App\Reports\Writers;

use App\Reports\ReportDefinition;
use RuntimeException;

class CsvReportWriter implements ReportWriter
{
    public function write(ReportDefinition $definition, iterable $rows, array $meta): string
    {
        $path = tempnam(sys_get_temp_dir(), 'report-csv-');
        $handle = $path === false ? false : fopen($path, 'wb');
        if ($handle === false) throw new RuntimeException('Unable to create the CSV export.');

        // UTF-8 BOM so spreadsheet applications detect the encoding.
        fwrite($handle, "\xEF\xBB\xBF");
        fputcsv($handle, array_map(fn (array $column) => $column[0], array_values($definition->columns)), escape: '');
        foreach ($rows as $row) {
            fputcsv($handle, array_map(fn ($value) => self::neutralize($value), array_values($row)), escape: '');
        }
        fclose($handle);

        return $path;
    }

    /** Prevent spreadsheet formula injection from text values. */
    public static function neutralize(mixed $value): mixed
    {
        return is_string($value) && preg_match('/^[=+\-@\t\r]/', $value) ? "'".$value : $value;
    }

    public function extension(): string { return 'csv'; }

    public function mimeType(): string { return 'text/csv; charset=UTF-8'; }
}
