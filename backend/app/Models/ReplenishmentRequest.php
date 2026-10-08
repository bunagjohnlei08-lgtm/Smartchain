<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ReplenishmentRequest extends Model
{
    /** Replenishment request lifecycle: Plant Manager -> Admin Procurement -> Purchase Order. */
    public const STATUS_DRAFT = 'draft';
    public const STATUS_PENDING = 'pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_FOR_PURCHASE_ORDER = 'for_purchase_order';
    public const STATUS_PO_CREATED = 'po_created';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_CANCELLED = 'cancelled';

    public const STATUSES = [
        self::STATUS_DRAFT,
        self::STATUS_PENDING,
        self::STATUS_APPROVED,
        self::STATUS_REJECTED,
        self::STATUS_FOR_PURCHASE_ORDER,
        self::STATUS_PO_CREATED,
        self::STATUS_COMPLETED,
        self::STATUS_CANCELLED,
    ];

    /** Requests that still require action in the Plant Manager procurement queue. */
    /** Statuses that block a new cycle for the same product and warehouse. */
    public const ACTIVE_STATUSES = [
        self::STATUS_DRAFT,
        self::STATUS_PENDING,
        // `approved` is retained as a legacy waiting-for-PO state.
        self::STATUS_APPROVED,
        self::STATUS_FOR_PURCHASE_ORDER,
        self::STATUS_PO_CREATED,
    ];

    /** Requests still awaiting an action from the Plant Manager. */
    public const PLANT_MANAGER_ACTIVE_STATUSES = [
        self::STATUS_DRAFT,
        self::STATUS_PENDING,
    ];
    public const OPEN_STATUSES = self::ACTIVE_STATUSES;

    /** Approved requests that are still waiting for a Purchase Order. */
    public const AWAITING_PURCHASE_ORDER_STATUSES = [
        self::STATUS_APPROVED,
        self::STATUS_FOR_PURCHASE_ORDER,
    ];

    public const TERMINAL_STATUSES = [
        self::STATUS_COMPLETED,
        self::STATUS_REJECTED,
        self::STATUS_CANCELLED,
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

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereIn('status', self::ACTIVE_STATUSES);
    }

    public function scopeAwaitingPurchaseOrder(Builder $query): Builder
    {
        return $query->whereIn('status', self::AWAITING_PURCHASE_ORDER_STATUSES)
            ->whereDoesntHave('purchaseOrder');
    }

    /** Approved and not yet consumed by a Purchase Order. */
    public function isAvailableForPurchaseOrder(): bool
    {
        return in_array($this->status, self::AWAITING_PURCHASE_ORDER_STATUSES, true)
            && ! $this->purchaseOrder()->exists();
    }

    /** Present legacy approved rows using the current lifecycle terminology. */
    public function lifecycleStatus(): string
    {
        return $this->status === self::STATUS_APPROVED
            ? self::STATUS_FOR_PURCHASE_ORDER
            : $this->status;
    }
}
