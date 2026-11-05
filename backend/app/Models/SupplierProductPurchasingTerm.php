<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierProductPurchasingTerm extends Model
{
    public const STATUS_ACTIVE = 'ACTIVE';
    public const STATUS_INACTIVE = 'INACTIVE';
    public const STATUSES = [self::STATUS_ACTIVE, self::STATUS_INACTIVE];
    public const CALENDAR_DAYS = 'CALENDAR_DAYS';
    public const BUSINESS_DAYS = 'BUSINESS_DAYS';
    public const LEAD_TIME_BASES = [self::CALENDAR_DAYS, self::BUSINESS_DAYS];
    public const START_PO_APPROVAL = 'PO_APPROVAL';
    public const START_EVENTS = [self::START_PO_APPROVAL];

    protected $fillable = [
        'supplier_id', 'product_id', 'unit', 'agreed_unit_price', 'currency',
        'delivery_lead_time_days', 'lead_time_basis', 'lead_time_start_event',
        'minimum_order_quantity', 'order_multiple', 'maximum_order_quantity',
        'effective_from', 'effective_until', 'status', 'agreement_reference',
        'verified_by', 'verified_at',
    ];

    protected function casts(): array
    {
        return [
            'agreed_unit_price' => 'decimal:2', 'delivery_lead_time_days' => 'integer',
            'minimum_order_quantity' => 'integer', 'order_multiple' => 'integer',
            'maximum_order_quantity' => 'integer', 'effective_from' => 'date',
            'effective_until' => 'date', 'verified_at' => 'datetime',
        ];
    }

    public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function verifier(): BelongsTo { return $this->belongsTo(User::class, 'verified_by'); }

    public function scopeEffective(Builder $query, $date = null): Builder
    {
        $date ??= today();
        return $query->where('status', self::STATUS_ACTIVE)
            ->whereDate('effective_from', '<=', $date)
            ->where(fn (Builder $nested) => $nested->whereNull('effective_until')->orWhereDate('effective_until', '>=', $date));
    }
}
