<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseOrderItem extends Model
{
    protected $fillable = ['product_id', 'product_name', 'unit', 'item_classification', 'ordered_quantity', 'unit_price', 'total_price'];

    public function product(): BelongsTo { return $this->belongsTo(Product::class); }

    protected function casts(): array
    {
        return ['unit_price' => 'decimal:2', 'total_price' => 'decimal:2'];
    }

    public function purchaseOrder(): BelongsTo { return $this->belongsTo(PurchaseOrder::class); }
}
