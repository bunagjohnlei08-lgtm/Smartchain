<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ExcessDeliveryReviewItem extends Model
{
    protected $fillable = ['excess_delivery_review_id', 'receiving_item_id', 'authorized_receiving_item_id', 'purchase_order_item_id', 'product_id', 'po_remaining_quantity', 'actual_delivered_quantity', 'authorized_quantity', 'excess_quantity', 'return_requested_quantity', 'returned_quantity', 'unit'];
    protected function casts(): array { return ['po_remaining_quantity' => 'integer', 'actual_delivered_quantity' => 'integer', 'authorized_quantity' => 'integer', 'excess_quantity' => 'integer', 'return_requested_quantity' => 'integer', 'returned_quantity' => 'integer']; }
    public function review(): BelongsTo { return $this->belongsTo(ExcessDeliveryReview::class, 'excess_delivery_review_id'); }
    public function receivingItem(): BelongsTo { return $this->belongsTo(ReceivingItem::class); }
    public function authorizedReceivingItem(): BelongsTo { return $this->belongsTo(ReceivingItem::class, 'authorized_receiving_item_id'); }
    public function purchaseOrderItem(): BelongsTo { return $this->belongsTo(PurchaseOrderItem::class); }
}
