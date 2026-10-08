<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

class Supplier extends Model
{
    public const STATUS_ACTIVE = 'ACTIVE';
    public const STATUS_ON_HOLD = 'ON_HOLD';
    public const STATUS_INACTIVE = 'INACTIVE';
    public const STATUS_PENDING_REMOVAL = 'PENDING_REMOVAL';
    public const STATUS_ARCHIVED = 'ARCHIVED';
    public const RECOVERY_DAYS = 30;
    public const BUSINESS_TIMEZONE = 'Asia/Manila';

    protected $fillable = [
        'supplier_code', 'name', 'contact_person', 'email', 'phone',
        'address', 'business_type', 'supply_category', 'products_services',
        'status', 'payment_terms', 'notes', 'removal_requested_at',
        'removal_requested_by_id', 'archived_at',
    ];

    protected function casts(): array
    {
        return [
            'removal_requested_at' => 'datetime',
            'archived_at' => 'datetime',
        ];
    }

    public function aliases(): HasMany
    {
        return $this->hasMany(SupplierAlias::class)->orderBy('alias');
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class)->withPivot('is_primary')->withTimestamps();
    }

    public function purchaseOrders(): HasMany
    {
        return $this->hasMany(PurchaseOrder::class);
    }

    public function removalRequestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'removal_requested_by_id');
    }

    public function recoveryDeadline(): ?Carbon
    {
        return $this->removal_requested_at
            ? $this->removal_requested_at->copy()->setTimezone(self::BUSINESS_TIMEZONE)->addDays(self::RECOVERY_DAYS)
            : null;
    }

    public function canBeRestored(): bool
    {
        $deadline = $this->recoveryDeadline();

        return $this->status === self::STATUS_PENDING_REMOVAL
            && $deadline !== null
            && now(self::BUSINESS_TIMEZONE)->lt($deadline);
    }
}
