<?php

namespace Database\Seeders;

use App\Models\Product;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\ReceivingTimeline;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

class ReceivingSeeder extends Seeder
{
    public function run(): void
    {
        $plantManagerRole = Role::where('slug', 'PLANT_MANAGER')->first();
        $preparedBy = $plantManagerRole
            ? User::where('role_id', $plantManagerRole->id)->first()
            : null;

        $records = [
            [
                'receiving_no' => 'RCV-00015',
                'purchase_order' => 'PO-2026-001',
                'supplier' => 'ABC Industrial',
                'reference_no' => 'DEL-98765',
                'delivery_date' => '2026-08-10',
                'status' => 'Pending QA',
                'created_at' => '2026-08-10 09:30:00',
                'items' => [
                    ['product' => 'Stainless Steel Pipe 2in', 'quantity' => 30, 'unit' => 'pcs', 'inspection_status' => 'Pending QA'],
                    ['product' => 'Industrial Valve DN50', 'quantity' => 10, 'unit' => 'pcs', 'inspection_status' => 'Pending QA'],
                ],
            ],
            [
                'receiving_no' => 'RCV-00016',
                'purchase_order' => 'PO-2026-002',
                'supplier' => 'Metro Supplies',
                'reference_no' => 'DEL-98766',
                'delivery_date' => '2026-08-11',
                'status' => 'Passed',
                'created_at' => '2026-08-11 09:30:00',
                'items' => [
                    ['product' => 'Stainless Steel Pipe 2in', 'quantity' => 30, 'unit' => 'pcs', 'inspection_status' => 'Passed'],
                    ['product' => 'Industrial Valve DN50', 'quantity' => 10, 'unit' => 'pcs', 'inspection_status' => 'Passed'],
                ],
            ],
            [
                'receiving_no' => 'RCV-00017',
                'purchase_order' => 'PO-2026-003',
                'supplier' => 'Northwind Trading',
                'reference_no' => 'DEL-98767',
                'delivery_date' => '2026-08-12',
                'status' => 'Rejected',
                'created_at' => '2026-08-12 09:30:00',
                'items' => [
                    ['product' => 'Organic Green Tea', 'quantity' => 20, 'unit' => 'box', 'inspection_status' => 'Rejected'],
                ],
            ],
            [
                'receiving_no' => 'RCV-00018',
                'purchase_order' => 'PO-2026-004',
                'supplier' => 'Prime Components',
                'reference_no' => 'DEL-98768',
                'delivery_date' => '2026-08-13',
                'status' => 'Partial',
                'created_at' => '2026-08-13 09:30:00',
                'items' => [
                    ['product' => 'Wireless Keyboard', 'quantity' => 6, 'unit' => 'pcs', 'inspection_status' => 'Partial'],
                ],
            ],
            [
                'receiving_no' => 'RCV-00019',
                'purchase_order' => 'PO-2026-005',
                'supplier' => 'ABC Industrial',
                'reference_no' => 'DEL-98769',
                'delivery_date' => '2026-08-14',
                'status' => 'Pending QA',
                'created_at' => '2026-08-14 09:30:00',
                'items' => [
                    ['product' => 'Powder Repair', 'quantity' => 50, 'unit' => 'pcs', 'inspection_status' => 'Pending QA'],
                ],
            ],
        ];

        foreach ($records as $record) {
            $receiving = Receiving::firstOrCreate(
                ['receiving_no' => $record['receiving_no']],
                [
                    'purchase_order' => $record['purchase_order'],
                    'supplier' => $record['supplier'],
                    'reference_no' => $record['reference_no'],
                    'delivery_date' => $record['delivery_date'],
                    'status' => $record['status'],
                    'prepared_by_id' => $preparedBy?->id,
                    'created_at' => $record['created_at'],
                    'updated_at' => $record['created_at'],
                ]
            );

            if ($receiving->wasRecentlyCreated) {
                foreach ($record['items'] as $itemData) {
                    $product = Product::firstOrCreate(
                        ['name' => $itemData['product']],
                        ['unit' => $itemData['unit']]
                    );

                    ReceivingItem::create([
                        'receiving_id' => $receiving->id,
                        'product_id' => $product->id,
                        'product_name' => $product->name,
                        'delivered_quantity' => $itemData['quantity'],
                        'unit' => $itemData['unit'],
                        'inspection_status' => $itemData['inspection_status'],
                    ]);
                }

                ReceivingTimeline::insert([
                    [
                        'receiving_id' => $receiving->id,
                        'status' => 'Receiving Created',
                        'performed_by' => $preparedBy?->name ?? 'Plant Manager',
                        'occurred_at' => $record['created_at'],
                        'created_at' => $record['created_at'],
                        'updated_at' => $record['created_at'],
                    ],
                    [
                        'receiving_id' => $receiving->id,
                        'status' => 'Pending QA Inspection',
                        'performed_by' => 'System',
                        'occurred_at' => $record['created_at'],
                        'created_at' => $record['created_at'],
                        'updated_at' => $record['created_at'],
                    ],
                ]);
            }
        }
    }
}
