<?php

namespace App\Services\Logistics;

use App\Models\LogisticsPartner;
use App\Models\Order;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class DeliveryPayloadBuilder
{
    public function build(Order $order, LogisticsPartner $partner, string $requestUuid): array
    {
        $order->loadMissing([
            'items.product:id,name,unit', 'items.stockOutTransactions:id,order_item_id,quantity',
            'assignee.warehouse:id,name,code,address', 'shipmentPacking:id,order_id,package_id,number_of_boxes,estimated_weight_kg,is_fragile',
        ]);

        $errors = [];
        if ($order->status !== Order::LOGISTICS_STATUS) $errors['status'][] = 'Only orders forwarded to Logistics can be sent.';
        if (! $partner->enabled) $errors['partner'][] = 'The selected logistics partner is disabled.';
        if (! $this->validHttpsEndpoint($partner)) $errors['partner'][] = 'The selected partner needs a valid HTTPS base URL and request path.';
        if (! filled($partner->outbound_token)) $errors['partner'][] = 'The selected partner has no outbound credential configured.';
        if (! filled($partner->callback_secret)) $errors['partner'][] = 'The selected partner has no callback signing secret configured.';
        if (! $partner->supports_idempotency) $errors['partner'][] = 'The selected partner must confirm idempotent delivery-request handling before automatic submission.';

        $warehouse = $order->assignee?->warehouse;
        if (! $warehouse) $errors['pickup'][] = 'The assigned Plant Manager has no warehouse.';
        if (! filled($warehouse?->address)) $errors['pickup'][] = 'The pickup warehouse has no address.';
        if (! filled($order->customer_name)) $errors['recipient'][] = 'The recipient name is required.';
        if (! filled($order->customer_address)) $errors['recipient'][] = 'The recipient address is required.';

        $publicBase = rtrim((string) config('logistics.public_base_url'), '/');
        if (! Str::startsWith($publicBase, 'https://') || str_contains($publicBase, '<CURRENT-NGROK-HOST>')) {
            $errors['callback'][] = 'LOGISTICS_PUBLIC_BASE_URL must be set to the current public HTTPS backend URL.';
        }

        $mappings = $partner->itemMappings()->whereIn('product_id', $order->items->pluck('product_id')->filter())->get()->keyBy('product_id');
        $items = [];
        foreach ($order->items as $index => $item) {
            $mapping = $item->product_id ? $mappings->get($item->product_id) : null;
            $released = (float) $item->stockOutTransactions->sum('quantity');
            $ordered = (float) $item->quantity;
            if (! $item->product_id || ! $item->product) $errors["items.{$index}.product_id"][] = 'A valid SmartChain Product ID is required.';
            if ($released <= 0 || abs($released - $ordered) > 0.0005) $errors["items.{$index}.quantity"][] = 'The fully released stock-out quantity is required.';
            if (! filled($item->unit)) $errors["items.{$index}.unit"][] = 'The item unit is required.';
            $payloadItem = [
                'product_id' => (string) $item->product_id,
                'product_name' => $item->product?->name ?? $item->product_name,
                'quantity' => $released,
                'unit' => strtoupper(trim((string) $item->unit)),
            ];
            if ($mapping) $payloadItem['partner_item_reference'] = $mapping->partner_item_reference;
            $items[] = $payloadItem;
        }
        if ($order->items->isEmpty()) $errors['items'][] = 'At least one item is required.';
        if ($errors) throw ValidationException::withMessages($errors);

        $payload = [
            'schema_version' => '1.0',
            'source_system' => config('logistics.source_system', 'SMARTCHAIN'),
            'delivery_request_id' => $requestUuid,
            'order_reference' => $order->order_no,
            'shipment_reference' => $order->shipmentPacking?->package_id ?? $order->order_no,
            'partner_code' => $partner->code,
            'pickup' => [
                'location_code' => $warehouse->code,
                'name' => $warehouse->name,
                'address' => $warehouse->address,
            ],
            'recipient' => array_filter([
                'name' => $order->customer_name,
                'address' => $order->customer_address,
                'contact' => $order->customer_contact,
            ], fn ($value) => filled($value)),
            'required_delivery_at' => $order->required_delivery_date->toAtomString(),
            'items' => $items,
            'callback' => ['url' => $publicBase.config('logistics.callback_path')],
        ];
        if ($order->reference_no) $payload['upstream_order_reference'] = $order->reference_no;
        if ($order->shipmentPacking) {
            $payload['packages'] = [
                'count' => $order->shipmentPacking->number_of_boxes,
                'estimated_weight_kg' => (float) $order->shipmentPacking->estimated_weight_kg,
                'fragile' => (bool) $order->shipmentPacking->is_fragile,
            ];
        }

        return $payload;
    }

    private function validHttpsEndpoint(LogisticsPartner $partner): bool
    {
        if (! filled($partner->base_url) || ! filled($partner->request_path)) return false;
        $parts = parse_url($partner->base_url);
        return ($parts['scheme'] ?? null) === 'https' && filled($parts['host'] ?? null)
            && Str::startsWith($partner->request_path, '/') && ! str_contains($partner->request_path, '..');
    }
}
