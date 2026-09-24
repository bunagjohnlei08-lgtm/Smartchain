<?php

namespace App\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use ZipArchive;

class QaRejectedItemsWorkbook
{
    private const EMU_PER_PIXEL = 9525;

    public function create(Collection $items): string
    {
        if (! class_exists(ZipArchive::class)) {
            throw new RuntimeException('The ZIP extension is required to create Excel exports.');
        }

        $path = tempnam(sys_get_temp_dir(), 'qa-rejected-');
        if ($path === false) {
            throw new RuntimeException('Unable to create the Excel export.');
        }

        $zip = new ZipArchive();
        if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            @unlink($path);
            throw new RuntimeException('Unable to create the Excel export.');
        }

        [$sheetXml, $drawingXml, $drawingRelationships, $media] = $this->worksheet($items);
        $hasImages = count($media) > 0;

        $zip->addFromString('[Content_Types].xml', $this->contentTypes($hasImages));
        $zip->addFromString('_rels/.rels', $this->packageRelationships());
        $zip->addFromString('xl/workbook.xml', $this->workbook());
        $zip->addFromString('xl/_rels/workbook.xml.rels', $this->workbookRelationships());
        $zip->addFromString('xl/styles.xml', $this->styles());
        $zip->addFromString('xl/worksheets/sheet1.xml', $sheetXml);

        if ($hasImages) {
            $zip->addFromString('xl/worksheets/_rels/sheet1.xml.rels', $this->sheetRelationships());
            $zip->addFromString('xl/drawings/drawing1.xml', $drawingXml);
            $zip->addFromString('xl/drawings/_rels/drawing1.xml.rels', $drawingRelationships);
            foreach ($media as $file => $contents) {
                $zip->addFromString("xl/media/{$file}", $contents);
            }
        }

        $zip->close();

        return $path;
    }

    private function worksheet(Collection $items): array
    {
        $headers = ['Receiving No.', 'Inspection Date', 'Supplier', 'Product', 'Delivered Qty', 'Rejected Qty', 'Unit', 'Reason', 'Result', 'Inspector', 'Evidence Count', 'Evidence 1', 'Evidence 2', 'Evidence 3', 'Evidence 4', 'Evidence 5'];
        $rows = ['<row r="1" ht="24" customHeight="1">'.collect($headers)->map(fn ($value, $index) => $this->cell($this->column($index + 1).'1', $value, 1))->implode('').'</row>'];
        $anchors = [];
        $relationships = [];
        $media = [];
        $imageNumber = 0;

        foreach ($items->values() as $index => $item) {
            $rowNumber = $index + 2;
            $inspection = $item->inspection;
            $receiving = $inspection?->receiving;
            $receivingItem = $item->receivingItem;
            $attachments = $inspection?->attachments?->take(5)->values() ?? collect();
            $values = [
                $receiving?->receiving_no ?? '',
                $inspection?->completed_at?->format('Y-m-d H:i:s') ?? '',
                $receiving?->supplier ?? '',
                $receivingItem?->product_name ?? '',
                (int) ($receivingItem?->delivered_quantity ?? 0),
                (int) $item->rejected_quantity,
                $receivingItem?->unit ?? '',
                $item->remarks ?? '',
                $item->inspection_result ?? '',
                $inspection?->submittedBy?->name ?? $inspection?->inspectedBy?->name ?? '',
                $attachments->count(),
            ];

            foreach ($attachments as $attachmentIndex => $attachment) {
                $label = $attachment->mime_type === 'application/pdf'
                    ? "[PDF] {$attachment->original_name}"
                    : $attachment->original_name;
                $values[] = $label;

                if (! in_array($attachment->mime_type, ['image/jpeg', 'image/png'], true)
                    || ! Storage::disk('local')->exists($attachment->stored_path)) {
                    continue;
                }

                $contents = Storage::disk('local')->get($attachment->stored_path);
                $size = @getimagesizefromstring($contents);
                if ($size === false) {
                    continue;
                }

                $imageNumber++;
                $extension = $attachment->mime_type === 'image/png' ? 'png' : 'jpg';
                $file = "evidence-{$imageNumber}.{$extension}";
                $media[$file] = $contents;
                $relationships[] = '<Relationship Id="rId'.$imageNumber.'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/'.$file.'"/>';
                [$width, $height] = $this->thumbnailSize((int) $size[0], (int) $size[1]);
                $anchors[] = $this->imageAnchor($imageNumber, $attachmentIndex + 11, $rowNumber - 1, $width, $height, $attachment->original_name);
            }

            while (count($values) < count($headers)) {
                $values[] = '';
            }

            $cells = collect($values)->map(fn ($value, $cellIndex) => $this->cell(
                $this->column($cellIndex + 1).$rowNumber,
                $value,
                $cellIndex >= 11 ? 2 : 0,
                is_int($value) || is_float($value)
            ))->implode('');
            $rows[] = '<row r="'.$rowNumber.'" ht="72" customHeight="1">'.$cells.'</row>';
        }

        $columns = '<cols><col min="1" max="1" width="16" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/><col min="3" max="4" width="24" customWidth="1"/><col min="5" max="6" width="14" customWidth="1"/><col min="7" max="7" width="10" customWidth="1"/><col min="8" max="8" width="30" customWidth="1"/><col min="9" max="10" width="18" customWidth="1"/><col min="11" max="11" width="15" customWidth="1"/><col min="12" max="16" width="20" customWidth="1"/></cols>';
        $drawing = count($media) > 0 ? '<drawing r:id="rId1"/>' : '';
        $sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'.$columns.'<sheetData>'.implode('', $rows).'</sheetData>'.$drawing.'</worksheet>';
        $drawingXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'.implode('', $anchors).'</xdr:wsDr>';
        $drawingRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'.implode('', $relationships).'</Relationships>';

        return [$sheet, $drawingXml, $drawingRels, $media];
    }

    private function cell(string $reference, string|int|float $value, int $style = 0, bool $numeric = false): string
    {
        if ($numeric) {
            return '<c r="'.$reference.'" s="'.$style.'"><v>'.$value.'</v></c>';
        }

        return '<c r="'.$reference.'" s="'.$style.'" t="inlineStr"><is><t xml:space="preserve">'.$this->xml((string) $value).'</t></is></c>';
    }

    private function imageAnchor(int $id, int $column, int $row, int $width, int $height, string $name): string
    {
        return '<xdr:oneCellAnchor><xdr:from><xdr:col>'.$column.'</xdr:col><xdr:colOff>9525</xdr:colOff><xdr:row>'.$row.'</xdr:row><xdr:rowOff>9525</xdr:rowOff></xdr:from><xdr:ext cx="'.($width * self::EMU_PER_PIXEL).'" cy="'.($height * self::EMU_PER_PIXEL).'"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="'.$id.'" name="'.$this->xml($name).'"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId'.$id.'"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'.($width * self::EMU_PER_PIXEL).'" cy="'.($height * self::EMU_PER_PIXEL).'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>';
    }

    private function thumbnailSize(int $width, int $height): array
    {
        $scale = min(120 / max($width, 1), 64 / max($height, 1), 1);

        return [max(1, (int) round($width * $scale)), max(1, (int) round($height * $scale))];
    }

    private function column(int $number): string
    {
        $result = '';
        while ($number > 0) {
            $number--;
            $result = chr(65 + ($number % 26)).$result;
            $number = intdiv($number, 26);
        }

        return $result;
    }

    private function xml(string $value): string
    {
        return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    private function contentTypes(bool $hasImages): string
    {
        $drawing = $hasImages ? '<Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : '';

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'.$drawing.'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
    }

    private function packageRelationships(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    }

    private function workbook(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Rejected Items" sheetId="1" r:id="rId1"/></sheets></workbook>';
    }

    private function workbookRelationships(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    }

    private function sheetRelationships(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>';
    }

    private function styles(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="bottom" wrapText="1"/></xf></cellXfs></styleSheet>';
    }
}
