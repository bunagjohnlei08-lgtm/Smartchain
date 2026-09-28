<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Order extends Model
{
    public const STATUSES = [
        'NEW', 'ASSIGNED', 'PREPARING', 'READY_FOR_STOCK_OUT',
        'STOCK_OUT_IN_PROGRESS', 'STOCK_OUT_COMPLETED', 'FOR_PACKING', 'PACKING',
        'READY_FOR_SHIPMENT', 'FORWARDED_TO_LOGISTICS', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED',
    ];

    /** Orders still inside the Stock Out work queue. */
    public const STOCK_OUT_STATUSES = ['READY_FOR_STOCK_OUT', 'STOCK_OUT_IN_PROGRESS'];

    /** Stock Out is done; the order entered the Shipment queue but packing has not started. */
    public const FOR_PACKING_STATUS = 'FOR_PACKING';

    /** Plant Manager Shipment is packing the order. */
    public const PACKING_STATUS = 'PACKING';

    /** Packing is done; waiting for the Plant Manager to forward to Logistics. */
    public const SHIPMENT_STATUS = 'READY_FOR_SHIPMENT';

    /** Every status owned by Plant Manager Shipment, in workflow order. */
    public const SHIPMENT_QUEUE_STATUSES = [self::FOR_PACKING_STATUS, self::PACKING_STATUS, self::SHIPMENT_STATUS];

    /** Handed to Admin Logistics (DTRS). */
    public const LOGISTICS_STATUS = 'FORWARDED_TO_LOGISTICS';

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
    public function shipmentPacking(): HasOne { return $this->hasOne(ShipmentPacking::class); }
    public function assignee(): BelongsTo { return $this->belongsTo(User::class, 'assigned_to'); }
    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
}
