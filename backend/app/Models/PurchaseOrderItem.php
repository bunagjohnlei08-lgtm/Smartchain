<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseOrderItem extends Model
{
    protected $fillable = ['product_id', 'product_name', 'unit', 'item_classification', 'ordered_quantity', 'unit_price', 'total_price', 'supplier_award_line_id', 'replenishment_request_id'];

    public function product(): BelongsTo { return $this->belongsTo(Product::class); }

    protected function casts(): array
    {
        return ['unit_price' => 'decimal:2', 'total_price' => 'decimal:2'];
    }

    public function purchaseOrder(): BelongsTo { return $this->belongsTo(PurchaseOrder::class); }
    public function awardLine(): BelongsTo { return $this->belongsTo(SupplierAwardLine::class, 'supplier_award_line_id'); }
    public function replenishmentRequest(): BelongsTo { return $this->belongsTo(ReplenishmentRequest::class); }
}
