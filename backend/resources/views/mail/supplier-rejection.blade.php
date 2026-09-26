<x-mail::message>
Hello {{ $supplierName }},

During quality inspection of the referenced delivery, the following quantity was recorded as rejected. Please review the attached rejection report.

- Case: {{ $caseReference }}
- Receiving: {{ $receivingNumber }}
- Purchase order: {{ $poNumber }}
- Inspection date: {{ $inspectionDate }}
- Product: {{ $productName }}
- Delivered quantity: {{ number_format($deliveredQuantity) }} {{ $unit }}
- Rejected quantity: {{ number_format($rejectedQuantity) }} {{ $unit }}
- QA result: {{ $qaResult }}
- QA notes: {{ $reason }}

Please review the attached rejection report and contact Archon Nell Incorporated to coordinate the return or corrective action.

Thank you,<br>
Archon Nell Incorporated<br>
SmartChain Quality Assurance
</x-mail::message>
