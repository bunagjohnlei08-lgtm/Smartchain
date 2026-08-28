<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseOrderItem extends Model
{
    protected $fillable = ['product_name', 'ordered_quantity', 'unit_price', 'total_price'];

    protected function casts(): array
    {
        return ['unit_price' => 'decimal:2', 'total_price' => 'decimal:2'];
    }

    public function purchaseOrder(): BelongsTo { return $this->belongsTo(PurchaseOrder::class); }
}
