<!doctype html><html><head><meta charset="utf-8"><title>{{ $meta['title'] }}</title><style>
@page{margin:14mm 12mm}body{font-family:'DejaVu Sans',sans-serif;color:#172033;font-size:8px}h1{font-size:15px;margin:0;color:#0f172a}.header{border-bottom:2px solid #0891b2;padding-bottom:8px;margin-bottom:10px}.muted{color:#64748b}.filters{margin:4px 0 0}table{width:100%;border-collapse:collapse}th{background:#f1f5f9;color:#334155;text-align:left;font-size:7.5px;text-transform:uppercase;padding:4px;border:1px solid #cbd5e1}td{padding:3px 4px;border:1px solid #e2e8f0;vertical-align:top;overflow-wrap:anywhere}tr:nth-child(even) td{background:#f8fafc}.num{text-align:right}.empty{padding:16px;text-align:center;color:#64748b}.footer{margin-top:10px;color:#64748b;font-size:7px}
.receipt-page{page-break-before:always;page-break-inside:avoid}.receipt-grid{table-layout:fixed;border-collapse:separate;border-spacing:4mm 3mm}.receipt-grid td{width:50%;padding:3mm;background:#fff!important;border:1px solid #cbd5e1;text-align:center}.receipt-caption{height:16mm;text-align:left;white-space:pre-line;word-wrap:break-word;font-size:8px;line-height:1.3}.receipt-image{width:100%;text-align:center}.receipt-image img{width:auto;height:auto}.receipt-register{table-layout:fixed}.receipt-register td{word-wrap:break-word}
</style></head><body>
<div class="header">
<h1>{{ $meta['title'] }}</h1>
<div class="muted">{{ $meta['category'] }} · Generated {{ $meta['generated_at'] }}</div>
<div class="filters muted">Filters: {{ count($meta['filters']) ? implode(' · ', $meta['filters']) : 'None' }}</div>
</div>
<table><thead><tr>@foreach($columns as $column)<th>{{ $column[0] }}</th>@endforeach</tr></thead><tbody>
@php($count = 0)
@foreach($rows as $row)@php($count++)
<tr>@foreach(array_values($row) as $index => $value)<td class="{{ in_array($columns[$index][1], ['number', 'percent'], true) ? 'num' : '' }}">{{ $value }}</td>@endforeach</tr>
@endforeach
@if($count === 0)<tr><td class="empty" colspan="{{ count($columns) }}">No records match the selected filters.</td></tr>@endif
</tbody></table>
<div class="footer">SmartChain Reports · {{ $count }} {{ $count === 1 ? 'record' : 'records' }}</div>
@if(!empty($meta['receipts']))
@php($receipts = $meta['receipts']())
@if(count($receipts))<h2 style="page-break-before:always">Supplier Delivery Receipt Evidence</h2>
<p>Original PDF receipts and full-resolution files are available through Export with Attachments (ZIP).</p>
@foreach(collect($receipts)->groupBy('receiving_no') as $receivingNo => $documents)
@php($record = $documents->first())
<h3>{{ $receivingNo }} · {{ $record['kind'] }}</h3>
<p>PO {{ $record['purchase_order'] }} · {{ $record['supplier'] }} · {{ $record['product'] }} · Delivery {{ $record['delivery_date'] }}</p>
<table class="receipt-register"><thead><tr><th style="width:15%">Reference</th><th style="width:45%">Original filename</th><th>Type / size / availability</th></tr></thead><tbody>
@foreach($documents as $receipt)
<tr><td>{{ $receipt['reference'] }}</td><td>{{ wordwrap($receipt['filename'], 55, ' ', true) }}</td><td>{{ $receipt['mime'] }} · {{ $receipt['size'] }} bytes<br>{{ !$receipt['available'] ? 'Missing or failed safe file validation' : ($receipt['image'] ? 'Preview follows' : 'Original available in authorized viewer / ZIP') }}</td></tr>
@endforeach
</tbody></table>
@endforeach
@foreach(collect($receipts)->groupBy('receiving_no') as $receivingNo => $documents)
@php($images = $documents->filter(fn ($document) => !empty($document['image']))->values())
@foreach($images->chunk(4) as $gallery)
@php($single = $images->count() === 1)
@php($landscape = count($columns) > 6)
@php($imageHeight = $single ? ($landscape ? 125 : 205) : ($landscape ? 49 : 88))
@php($imageWidth = $single ? ($landscape ? 255 : 165) : ($landscape ? 119 : 76))
<div class="receipt-page">
<h2>{{ $receivingNo }} · Receipt previews {{ $loop->iteration }} / {{ (int) ceil($images->count() / 4) }}</h2>
<p class="muted">References match the documentary register. Full-resolution originals are available in the authorized viewer / ZIP.</p>
<table class="receipt-grid"><tbody>
@foreach($gallery->values()->chunk($single ? 1 : 2) as $pair)
<tr>
@foreach($pair as $receipt)
@php($dimensions = getimagesizefromstring(base64_decode(explode(',', $receipt['image'], 2)[1])))
@php($scale = min($imageWidth / $dimensions[0], $imageHeight / $dimensions[1]))
<td style="width:{{ $single ? '100%' : '50%' }}">
<div class="receipt-caption"><strong>{{ $receipt['reference'] }}</strong><br>{{ wordwrap(\Illuminate\Support\Str::limit($receipt['filename'], 95), 38, "\n", true) }}</div>
<div class="receipt-image"><img src="{{ $receipt['image'] }}" style="width:{{ $dimensions[0] * $scale }}mm;height:{{ $dimensions[1] * $scale }}mm" alt="{{ $receipt['reference'] }}"></div>
</td>
@endforeach
@if(!$single && $pair->count() === 1)<td style="border:0"></td>@endif
</tr>
@endforeach
</tbody></table>
</div>
@endforeach
@endforeach
@endif
@endif
</body></html>
