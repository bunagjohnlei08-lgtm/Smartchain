<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SupplierApplication extends Model
{
    public const STATUS_PENDING = 'PENDING';

    public const STATUS_UNDER_REVIEW = 'UNDER_REVIEW';

    public const STATUS_APPROVED = 'APPROVED';

    public const STATUS_REJECTED = 'REJECTED';

    public const STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_UNDER_REVIEW,
        self::STATUS_APPROVED,
        self::STATUS_REJECTED,
    ];

    public const ACTIVE_STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_UNDER_REVIEW,
    ];

    protected $fillable = [
        'application_number', 'company_name', 'normalized_company_name', 'address',
        'contact_person', 'email', 'normalized_email', 'phone', 'business_type',
        'supply_category', 'products_services', 'status', 'submitted_at',
        'reviewed_at', 'reviewed_by_id', 'decision_reason', 'approved_supplier_id',
    ];

    protected $hidden = ['normalized_company_name', 'normalized_email'];

    protected function casts(): array
    {
        return ['submitted_at' => 'datetime', 'reviewed_at' => 'datetime'];
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by_id');
    }

    public function approvedSupplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'approved_supplier_id');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(SupplierApplicationAttachment::class);
    }
}
