<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ReceivingItem extends Model
{
    protected $fillable = [
        'receiving_id',
        'product_id',
        'warehouse_id',
        'product_name',
        'ordered_quantity',
        'delivered_quantity',
        'unit',
        'inspection_status',
        'stocked_in_at',
    ];

    protected function casts(): array
    {
        return [
            'delivered_quantity' => 'integer',
            'ordered_quantity' => 'integer',
            'stocked_in_at' => 'datetime',
        ];
    }

    public function receiving(): BelongsTo
    {
        return $this->belongsTo(Receiving::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function qaInspectionItem(): HasOne
    {
        return $this->hasOne(QaInspectionItem::class);
    }
}
