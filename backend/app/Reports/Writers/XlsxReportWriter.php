<?php

namespace App\Reports\Writers;

use App\Reports\ReportDefinition;
use RuntimeException;
use ZipArchive;

/**
 * Minimal Office Open XML workbook (one sheet, inline strings), written with
 * the ZipArchive extension already used by the QA rejected-items export. The
 * sheet XML is streamed to disk so large reports do not sit in memory.
 */
class XlsxReportWriter implements ReportWriter
{
    public function write(ReportDefinition $definition, iterable $rows, array $meta): string
    {
        if (! class_exists(ZipArchive::class)) {
            throw new RuntimeException('The ZIP extension is required to create Excel exports.');
        }

        $sheetPath = tempnam(sys_get_temp_dir(), 'report-sheet-');
        $path = tempnam(sys_get_temp_dir(), 'report-xlsx-');
        $sheet = $sheetPath === false ? false : fopen($sheetPath, 'wb');
        if ($sheet === false || $path === false) throw new RuntimeException('Unable to create the Excel export.');

        try {
            $columns = array_values($definition->columns);
            fwrite($sheet, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                .'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                .'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
                .'<cols>'.collect($columns)->map(fn ($column, $index) => sprintf('<col min="%1$d" max="%1$d" width="%2$d" customWidth="1"/>', $index + 1, max(12, min(40, mb_strlen($column[0]) + 6))))->implode('').'</cols>'
                .'<sheetData>');
            fwrite($sheet, $this->row(1, array_map(fn ($column) => $column[0], $columns), 1));
            $rowNumber = 1;
            foreach ($rows as $row) {
                fwrite($sheet, $this->row(++$rowNumber, array_values($row)));
            }
            fwrite($sheet, '</sheetData></worksheet>');
            fclose($sheet);

            $zip = new ZipArchive();
            if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
                throw new RuntimeException('Unable to create the Excel export.');
            }
            $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
            $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
            $zip->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="'.$this->escape(mb_substr(preg_replace('/[\\\\\/?*\[\]:]/', ' ', $meta['title']), 0, 31)).'" sheetId="1" r:id="rId1"/></sheets></workbook>');
            $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
            $zip->addFromString('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>');
            $zip->addFile($sheetPath, 'xl/worksheets/sheet1.xml');
            if (! $zip->close()) throw new RuntimeException('Unable to create the Excel export.');
        } catch (\Throwable $exception) {
            @unlink($path);
            throw $exception;
        } finally {
            if (is_resource($sheet)) fclose($sheet);
            @unlink($sheetPath);
        }

        return $path;
    }

    private function row(int $number, array $values, int $style = 0): string
    {
        $cells = '';
        foreach ($values as $index => $value) {
            $ref = $this->column($index + 1).$number;
            $styleAttr = $style ? " s=\"{$style}\"" : '';
            if ($value === null || $value === '') {
                continue;
            }
            $cells .= is_int($value) || is_float($value)
                ? "<c r=\"{$ref}\"{$styleAttr}><v>{$value}</v></c>"
                : "<c r=\"{$ref}\" t=\"inlineStr\"{$styleAttr}><is><t xml:space=\"preserve\">".$this->escape((string) $value).'</t></is></c>';
        }

        return "<row r=\"{$number}\">{$cells}</row>";
    }

    private function column(int $index): string
    {
        $name = '';
        for (; $index > 0; $index = intdiv($index - 1, 26)) {
            $name = chr(65 + ($index - 1) % 26).$name;
        }

        return $name;
    }

    private function escape(string $value): string
    {
        $clean = preg_replace('/[^\x{9}\x{A}\x{D}\x{20}-\x{D7FF}\x{E000}-\x{FFFD}]/u', '', $value) ?? '';

        return htmlspecialchars($clean, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    public function extension(): string { return 'xlsx'; }

    public function mimeType(): string { return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; }
}
