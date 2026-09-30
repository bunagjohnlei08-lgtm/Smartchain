<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ReplenishmentRequest extends Model
{
    /** Replenishment request lifecycle: Plant Manager -> Admin Procurement -> Purchase Order. */
    public const STATUS_DRAFT = 'draft';
    public const STATUS_PENDING = 'pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_PO_CREATED = 'for_purchase_order';

    public const STATUSES = [
        self::STATUS_DRAFT,
        self::STATUS_PENDING,
        self::STATUS_APPROVED,
        self::STATUS_REJECTED,
        self::STATUS_PO_CREATED,
    ];

    /** Requests that still require action in the Plant Manager procurement queue. */
    public const PLANT_MANAGER_ACTIVE_STATUSES = [
        self::STATUS_DRAFT,
        self::STATUS_PENDING,
    ];

    public const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

    protected $fillable = [
        'request_no', 'requested_by', 'warehouse_id', 'product_id', 'requested_qty',
        'priority', 'status', 'submitted_at', 'reviewed_by', 'reviewed_at',
        'admin_decision',
    ];

    protected function casts(): array
    {
        return [
            'submitted_at' => 'datetime',
            'reviewed_at' => 'datetime',
            'requested_qty' => 'integer',
        ];
    }

    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function warehouse(): BelongsTo { return $this->belongsTo(Warehouse::class); }
    public function requester(): BelongsTo { return $this->belongsTo(User::class, 'requested_by'); }
    public function reviewer(): BelongsTo { return $this->belongsTo(User::class, 'reviewed_by'); }
    public function purchaseOrder(): HasOne { return $this->hasOne(PurchaseOrder::class); }

    /** Approved and not yet consumed by a Purchase Order. */
    public function isAvailableForPurchaseOrder(): bool
    {
        return $this->status === self::STATUS_APPROVED;
    }
}
