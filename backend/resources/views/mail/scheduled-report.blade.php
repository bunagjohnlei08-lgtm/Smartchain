<x-mail::message>
Hello {{ $recipientName }},

Your scheduled SmartChain report **{{ $reportName }}** is attached ({{ number_format($rowCount) }} {{ $rowCount === 1 ? 'record' : 'records' }}).

File: {{ $filename }}

This schedule can be paused or removed from Admin → Reports & Exports.

SmartChain
</x-mail::message>
