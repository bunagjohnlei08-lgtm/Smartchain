<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockOutTransaction extends Model
{
    protected $fillable = [
        'reference_no', 'idempotency_key', 'order_id', 'order_item_id',
        'inventory_id', 'product_id', 'warehouse_id', 'barcode',
        'quantity', 'unit', 'performed_by',
    ];

    protected function casts(): array
    {
        return ['quantity' => 'integer'];
    }

    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function orderItem(): BelongsTo { return $this->belongsTo(OrderItem::class); }
    public function inventory(): BelongsTo { return $this->belongsTo(Inventory::class); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function warehouse(): BelongsTo { return $this->belongsTo(Warehouse::class); }
    public function performer(): BelongsTo { return $this->belongsTo(User::class, 'performed_by'); }
}
