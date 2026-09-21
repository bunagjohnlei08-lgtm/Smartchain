<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>{{ $order->po_number }}</title>
<style>
    @page { margin: 20mm; }
    body { font-family: 'DejaVu Sans', sans-serif; color: #111827; font-size: 12px; }
    .header { width: 100%; border-bottom: 2px solid #0891b2; padding-bottom: 12px; }
    .header td { vertical-align: top; }
    h1 { margin: 0; font-size: 24px; }
    .status { text-align: right; font-weight: bold; }
    .meta { width: 100%; margin: 20px 0; }
    .meta td { width: 50%; padding: 6px 0; vertical-align: top; }
    .label { color: #64748b; font-size: 10px; text-transform: uppercase; }
    .items { width: 100%; border-collapse: collapse; margin-top: 16px; }
    .items th, .items td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
    .items th { background: #f1f5f9; }
    .items .number { text-align: right; }
    .total { text-align: right; font-size: 16px; font-weight: bold; margin-top: 16px; }
    .signature { margin-top: 50px; width: 260px; border-top: 1px solid #111827; padding-top: 8px; }
</style>
</head>
<body>
    <table class="header">
        <tr>
            <td><h1>Purchase Order</h1><p>{{ $order->po_number }}</p></td>
            <td class="status">{{ $order->status }}</td>
        </tr>
    </table>

    <table class="meta">
        <tr>
            <td><div class="label">Supplier</div>{{ $order->supplier_name }}</td>
            <td><div class="label">Created Date</div>{{ $order->created_at?->toDateString() }}</td>
        </tr>
        <tr>
            <td><div class="label">Expected Delivery</div>{{ $order->expected_delivery_date?->toDateString() }}</td>
            <td><div class="label">Delivery Details</div>{{ $order->delivery_details }}</td>
        </tr>
    </table>

    <table class="items">
        <thead>
            <tr><th>Product</th><th class="number">Qty</th><th class="number">Unit Price</th><th class="number">Amount</th></tr>
        </thead>
        <tbody>
            @foreach ($order->items as $item)
                <tr>
                    <td>{{ $item->product_name }}</td>
                    <td class="number">{{ number_format($item->ordered_quantity) }}</td>
                    <td class="number">₱{{ number_format((float) $item->unit_price, 2) }}</td>
                    <td class="number">₱{{ number_format((float) $item->total_price, 2) }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <div class="total">Total Amount: ₱{{ number_format((float) $order->total_amount, 2) }}</div>

    <div class="signature">
        Approved by: {{ $order->approver?->name ?: 'Electronic approval' }}<br>
        {{ $order->signature_data ? 'Signature recorded' : 'Electronically approved' }}
    </div>
</body>
</html>
