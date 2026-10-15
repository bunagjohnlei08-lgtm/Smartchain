<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Production Material Pick List</title>
<style>
@page { size:A4; margin:22mm 14mm 20mm; } body { font-family:DejaVu Sans,Arial,sans-serif; font-size:10px; color:#172033; }
h1 {font-size:18px;margin:3px 0 8px;} h2 {font-size:12px;margin:0 0 4px;} p {line-height:1.5;} .meta {width:100%;border-collapse:collapse;margin:14px 0;} .meta td {padding:5px;vertical-align:top;width:50%;}
.items {width:100%;border-collapse:collapse;table-layout:fixed;} .items thead {display:table-header-group;} .items th,.items td {border:1px solid #ccd2da;padding:7px 4px;vertical-align:top;overflow-wrap:anywhere;word-wrap:break-word;} .items th {background:#f1f4f7;text-align:left;} .items tr {page-break-inside:avoid;} .number {text-align:right;} .muted {color:#516070;} .note {border:1px solid #ccd2da;padding:10px;margin:14px 0;} .lines {margin-top:18px;line-height:2.8;}
@media print {body{margin:0;}.print-controls{display:none;} @page { @bottom-right {content:'Page ' counter(page) ' of ' counter(pages);font-family:Arial,sans-serif;font-size:8px;color:#516070;} } }
</style></head><body>
<h2>Archon Nell Incorporated</h2><h1>Production Material Pick List</h1>
<p><strong>{{ $batch->status === 'CANCELLED' ? 'CANCELLED — reference only' : (($batch->issued_at || $batch->materials->contains(fn ($material) => $material->issued_quantity > 0)) ? 'ISSUED — reprint / recorded quantities' : 'PLANNED — material preparation only') }}</strong></p>
<table class="meta"><tr><td><strong>Batch:</strong> {{ $batch->batch_number }}<br><strong>Finished product:</strong> {{ $batch->product_name }}<br><strong>Target:</strong> {{ $batch->target_quantity }} {{ $batch->unit }}</td><td><strong>Warehouse:</strong> {{ $batch->warehouse->name }}<br><strong>Created:</strong> {{ $batch->created_at->toIso8601String() }}<br><strong>Generated:</strong> {{ $generatedAt }}<br><strong>Prepared by:</strong> {{ $preparedBy ?? 'Not recorded' }}</td></tr></table>
<table class="items"><thead><tr><th style="width:27%">Raw Material / Inventory Code</th><th style="width:13%">Storage / Bin</th><th style="width:12%">Required</th><th style="width:10%">Issued</th><th style="width:13%">Remaining to Pick</th><th style="width:7%">Unit</th><th style="width:10%">Actual Picked</th></tr></thead><tbody>
@foreach($batch->materials as $material)
<tr><td>{{ $material->product_name }}<br><span class="muted">{{ $inventories->get($material->product_id)?->barcode ?? 'Code not recorded' }}</span></td><td>Not recorded</td><td class="number">{{ $material->required_quantity_exact }}</td><td class="number">{{ $material->issued_quantity }}</td><td class="number">{{ $material->required_quantity === null ? 'Exact demand unresolved' : max(0, $material->required_quantity - $material->issued_quantity) }}</td><td>{{ $material->unit }}</td><td>&nbsp;</td></tr>
@endforeach
</tbody></table>
<div class="note"><strong>Preparation notes:</strong> This document does not issue materials or change inventory. Material deduction requires the separate confirmed Issue Materials action. Reprints show recorded issuance and remaining requirements; they are not another release. Unsupported fractional demand requires review, not rounding. Returned/disposed materials remain recorded in batch history.</div>
<div class="lines">Actual picked / discrepancy notes: _______________________________________________<br>Picked by / acknowledgment: ___________________________________________________<br>Issuer / acknowledgment and time: _______________________________________________</div>
</body></html>
