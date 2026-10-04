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
        'status',
        'pending_receiving',
    ];

    protected function casts(): array
    {
        return [
            'available_stock' => 'integer',
            'reserved_stock' => 'integer',
            'backload' => 'integer',
            'pending_receiving' => 'boolean',
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
