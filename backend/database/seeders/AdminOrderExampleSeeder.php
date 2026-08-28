<?php

namespace Database\Seeders;

use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class AdminOrderExampleSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::query()
            ->where('status', 'ACTIVE')
            ->whereHas('role', fn ($query) => $query->where('slug', 'ADMIN'))
            ->orderBy('id')
            ->first();

        $products = Product::query()->orderBy('id')->limit(3)->get();

        if (!$admin) {
            throw new RuntimeException('An active Admin is required to seed example orders.');
        }

        if ($products->count() < 3) {
            throw new RuntimeException('At least three existing products are required to seed example orders.');
        }

        $records = [
            [
                'order_no' => 'SO-2026-0009',
                'reference_no' => 'TEST-0009',
                'customer_name' => 'Pacific Hardware Trading',
                'customer_address' => '125 MacArthur Highway, San Fernando, Pampanga',
                'customer_contact' => '+63 917 245 1009',
                'order_date' => '2026-08-20 09:15:00',
                'required_delivery_date' => '2026-08-29 17:00:00',
                'status' => 'NEW',
                'items' => [
                    ['product' => 0, 'quantity' => 12, 'unit_price' => 425.00],
                ],
            ],
            [
                'order_no' => 'SO-2026-0010',
                'reference_no' => 'TEST-0010',
                'customer_name' => 'MetroBuild Supplies',
                'customer_address' => '48 EDSA, Mandaluyong City, Metro Manila',
                'customer_contact' => '+63 918 310 2010',
                'order_date' => '2026-08-21 10:30:00',
                'required_delivery_date' => '2026-08-30 17:00:00',
                'status' => 'NEW',
                'items' => [
                    ['product' => 1, 'quantity' => 3, 'unit_price' => 11250.00],
                    ['product' => 2, 'quantity' => 4, 'unit_price' => 16200.00],
                ],
            ],
            [
                'order_no' => 'SO-2026-0011',
                'reference_no' => 'TEST-0011',
                'customer_name' => 'Prime Industrial Solutions',
                'customer_address' => 'Lot 7, Laguna Technopark, Binan, Laguna',
                'customer_contact' => '+63 919 455 3011',
                'order_date' => '2026-08-22 08:45:00',
                'required_delivery_date' => '2026-09-01 17:00:00',
                'status' => 'NEW',
                'items' => [
                    ['product' => 0, 'quantity' => 20, 'unit_price' => 410.00],
                    ['product' => 1, 'quantity' => 2, 'unit_price' => 11000.00],
                    ['product' => 2, 'quantity' => 5, 'unit_price' => 16000.00],
                ],
            ],
            [
                'order_no' => 'SO-2026-0012',
                'reference_no' => 'TEST-0012',
                'customer_name' => 'Northstar Manufacturing',
                'customer_address' => '88 Magsaysay Drive, Olongapo City, Zambales',
                'customer_contact' => '+63 920 580 4012',
                'order_date' => '2026-08-23 13:20:00',
                'required_delivery_date' => '2026-09-03 17:00:00',
                'status' => 'NEW',
                'items' => [
                    ['product' => 1, 'quantity' => 1, 'unit_price' => 11400.00],
                    ['product' => 2, 'quantity' => 6, 'unit_price' => 15850.00],
                ],
            ],
            [
                'order_no' => 'SO-2026-0013',
                'reference_no' => 'TEST-0013',
                'customer_name' => 'Golden State Construction Supply',
                'customer_address' => '210 Diversion Road, Batangas City, Batangas',
                'customer_contact' => '+63 921 625 5013',
                'order_date' => '2026-08-24 15:10:00',
                'required_delivery_date' => '2026-09-05 17:00:00',
                'status' => 'NEW',
                'items' => [
                    ['product' => 0, 'quantity' => 30, 'unit_price' => 395.00],
                ],
            ],
        ];

        foreach ($records as $record) {
            DB::transaction(function () use ($record, $products, $admin) {
                if (Order::query()->where('order_no', $record['order_no'])->exists()) {
                    return;
                }

                $items = collect($record['items'])->map(function (array $item) use ($products) {
                    $product = $products[$item['product']];
                    $subtotal = round($item['quantity'] * $item['unit_price'], 2);

                    return [
                        'product_id' => $product->id,
                        'product_name' => $product->name,
                        'quantity' => $item['quantity'],
                        'unit' => $product->unit ?: 'pcs',
                        'unit_price' => $item['unit_price'],
                        'subtotal' => $subtotal,
                    ];
                });

                $order = Order::create([
                    'order_no' => $record['order_no'],
                    'reference_no' => $record['reference_no'],
                    'customer_name' => $record['customer_name'],
                    'customer_address' => $record['customer_address'],
                    'customer_contact' => $record['customer_contact'],
                    'order_date' => $record['order_date'],
                    'required_delivery_date' => $record['required_delivery_date'],
                    'total_amount' => $items->sum('subtotal'),
                    'status' => $record['status'],
                    'assigned_to' => null,
                    'assigned_at' => null,
                    'created_by' => $admin->id,
                ]);

                $order->items()->createMany($items->all());
                $order->histories()->create([
                    'previous_status' => null,
                    'new_status' => $record['status'],
                    'action' => 'EXAMPLE_ORDER_SEEDED',
                    'performed_by' => $admin->id,
                ]);
            });
        }
    }
}
