<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShipmentPacking extends Model
{
    protected $fillable = [
        'order_id', 'package_id', 'number_of_boxes', 'estimated_weight_kg',
        'is_fragile', 'packing_notes', 'correct_product', 'correct_quantity',
        'package_condition', 'items_complete', 'packed_by_id', 'packed_at',
    ];

    protected function casts(): array
    {
        return [
            'estimated_weight_kg' => 'decimal:2',
            'is_fragile' => 'boolean',
            'correct_product' => 'boolean',
            'correct_quantity' => 'boolean',
            'package_condition' => 'boolean',
            'items_complete' => 'boolean',
            'packed_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function packedBy(): BelongsTo { return $this->belongsTo(User::class, 'packed_by_id'); }
}
