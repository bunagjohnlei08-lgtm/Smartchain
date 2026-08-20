<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    public const STATUSES = [
        'NEW', 'ASSIGNED', 'PREPARING', 'READY_FOR_STOCK_OUT',
        'STOCK_OUT_IN_PROGRESS', 'STOCK_OUT_COMPLETED', 'READY_FOR_SHIPMENT',
        'IN_TRANSIT', 'DELIVERED', 'CANCELLED',
    ];

    protected $fillable = [
        'order_no', 'reference_no', 'customer_name', 'customer_address',
        'customer_contact', 'order_date', 'required_delivery_date',
        'total_amount', 'status', 'assigned_to', 'assigned_at', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'order_date' => 'datetime',
            'required_delivery_date' => 'datetime',
            'assigned_at' => 'datetime',
            'total_amount' => 'decimal:2',
        ];
    }

    public function items(): HasMany { return $this->hasMany(OrderItem::class); }
    public function histories(): HasMany { return $this->hasMany(OrderStatusHistory::class); }
    public function stockOutTransactions(): HasMany { return $this->hasMany(StockOutTransaction::class); }
    public function assignee(): BelongsTo { return $this->belongsTo(User::class, 'assigned_to'); }
    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
}
