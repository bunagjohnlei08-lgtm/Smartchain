<?php

namespace App\Models;

use App\Observers\InventoryObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[ObservedBy([InventoryObserver::class])]
class Inventory extends Model
{
    protected $fillable = [
        'barcode',
        'product_id',
        'warehouse_id',
        'available_stock',
        'reserved_stock',
        'backload',
        'returned_stock',
        'status',
        'pending_receiving',
        'catalog_setup_at',
    ];

    protected function casts(): array
    {
        return [
            'available_stock' => 'integer',
            'reserved_stock' => 'integer',
            'backload' => 'integer',
            'returned_stock' => 'integer',
            'pending_receiving' => 'boolean',
            'catalog_setup_at' => 'datetime',
            'has_stock_history' => 'boolean',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }
}
