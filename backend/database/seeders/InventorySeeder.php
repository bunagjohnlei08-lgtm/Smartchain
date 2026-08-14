<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;

class InventorySeeder extends Seeder
{
    public function run(): void
    {
        $branch = Branch::firstOrCreate(
            ['code' => 'BR-PAMP'],
            ['name' => 'Pampanga Branch']
        );

        $warehouses = [
            'Main Warehouse' => 'WH-MAIN',
            'Central Depot' => 'WH-CENTRAL',
            'Northgate' => 'WH-NORTH',
            'Eastside' => 'WH-EAST',
            'Southpark' => 'WH-SOUTH',
        ];

        $warehouseModels = [];
        foreach ($warehouses as $name => $code) {
            $warehouseModels[$name] = Warehouse::firstOrCreate(
                ['code' => $code],
                ['name' => $name, 'branch_id' => $branch->id]
            );
        }

        $records = [
            [
                'barcode' => '100002',
                'product' => 'Powder Repair',
                'category' => 'Health & Beauty',
                'brand' => "Nature's Best",
                'unit' => 'pcs',
                'cost_price' => 350,
                'warehouse' => 'Main Warehouse',
                'available_stock' => 50,
                'reserved_stock' => 10,
                'backload' => 5,
                'status' => 'Available',
                'pending_receiving' => false,
            ],
            [
                'barcode' => '8806091234567',
                'product' => 'IPAD AIR',
                'category' => 'Electronics',
                'brand' => 'Apple',
                'unit' => 'pcs',
                'cost_price' => 10000,
                'warehouse' => 'Central Depot',
                'available_stock' => 2,
                'reserved_stock' => 0,
                'backload' => 0,
                'status' => 'Low Stock',
                'pending_receiving' => false,
            ],
            [
                'barcode' => '8806092345678',
                'product' => 'Sony WH-1000XM5',
                'category' => 'Electronics',
                'brand' => 'Sony',
                'unit' => 'pcs',
                'cost_price' => 15000,
                'warehouse' => 'Central Depot',
                'available_stock' => 95,
                'reserved_stock' => 4,
                'backload' => 0,
                'status' => 'Available',
                'pending_receiving' => false,
            ],
            [
                'barcode' => '8806093456789',
                'product' => 'Organic Green Tea',
                'category' => 'Beverages',
                'brand' => "Nature's Best",
                'unit' => 'box',
                'cost_price' => 250,
                'warehouse' => 'Northgate',
                'available_stock' => 39,
                'reserved_stock' => 5,
                'backload' => 1,
                'status' => 'Available',
                'pending_receiving' => false,
            ],
            [
                'barcode' => '8806094567890',
                'product' => 'Stainless Steel Bottle',
                'category' => 'Kitchenware',
                'brand' => 'EcoLife',
                'unit' => 'pcs',
                'cost_price' => 450,
                'warehouse' => 'Eastside',
                'available_stock' => 0,
                'reserved_stock' => 0,
                'backload' => 2,
                'status' => 'Out of Stock',
                'pending_receiving' => false,
            ],
            [
                'barcode' => '8806095678901',
                'product' => 'Macbook Pro M3',
                'category' => 'Electronics',
                'brand' => 'Apple',
                'unit' => 'pcs',
                'cost_price' => 150000,
                'warehouse' => 'Southpark',
                'available_stock' => 3,
                'reserved_stock' => 2,
                'backload' => 0,
                'status' => 'Low Stock',
                'pending_receiving' => false,
            ],
            [
                'barcode' => '8806096789012',
                'product' => 'Ergonomic Chair',
                'category' => 'Furniture',
                'brand' => 'FlexiSeat',
                'unit' => 'pcs',
                'cost_price' => 12000,
                'warehouse' => 'Central Depot',
                'available_stock' => 12,
                'reserved_stock' => 3,
                'backload' => 0,
                'status' => 'Available',
                'pending_receiving' => false,
            ],
            [
                'barcode' => '8806097890123',
                'product' => 'Wireless Keyboard',
                'category' => 'Electronics',
                'brand' => 'Logitech',
                'unit' => 'pcs',
                'cost_price' => 2500,
                'warehouse' => 'Central Depot',
                'available_stock' => 0,
                'reserved_stock' => 0,
                'backload' => 0,
                'status' => 'Out of Stock',
                'pending_receiving' => true,
            ],
        ];

        foreach ($records as $record) {
            $product = Product::firstOrCreate(
                ['name' => $record['product']],
                [
                    'category' => $record['category'],
                    'brand' => $record['brand'],
                    'unit' => $record['unit'],
                    'cost_price' => $record['cost_price'],
                ]
            );

            Inventory::firstOrCreate(
                ['barcode' => $record['barcode']],
                [
                    'product_id' => $product->id,
                    'warehouse_id' => $warehouseModels[$record['warehouse']]->id,
                    'available_stock' => $record['available_stock'],
                    'reserved_stock' => $record['reserved_stock'],
                    'backload' => $record['backload'],
                    'status' => $record['status'],
                    'pending_receiving' => $record['pending_receiving'],
                ]
            );
        }
    }
}
