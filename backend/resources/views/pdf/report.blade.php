<!doctype html><html><head><meta charset="utf-8"><title>{{ $meta['title'] }}</title><style>
@page{margin:14mm 12mm}body{font-family:'DejaVu Sans',sans-serif;color:#172033;font-size:8px}h1{font-size:15px;margin:0;color:#0f172a}.header{border-bottom:2px solid #0891b2;padding-bottom:8px;margin-bottom:10px}.muted{color:#64748b}.filters{margin:4px 0 0}table{width:100%;border-collapse:collapse}th{background:#f1f5f9;color:#334155;text-align:left;font-size:7.5px;text-transform:uppercase;padding:4px;border:1px solid #cbd5e1}td{padding:3px 4px;border:1px solid #e2e8f0;vertical-align:top;overflow-wrap:anywhere}tr:nth-child(even) td{background:#f8fafc}.num{text-align:right}.empty{padding:16px;text-align:center;color:#64748b}.footer{margin-top:10px;color:#64748b;font-size:7px}
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
</body></html>
