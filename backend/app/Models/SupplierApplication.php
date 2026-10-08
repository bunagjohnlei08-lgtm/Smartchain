<?php

namespace App\Models;

use App\Support\BusinessTime;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class SupplierApplication extends Model
{
    public const STATUS_PENDING = 'PENDING';

    public const STATUS_UNDER_REVIEW = 'UNDER_REVIEW';

    public const STATUS_NEEDS_REVISION = 'NEEDS_REVISION';

    public const STATUS_QUALIFIED_FOR_MEETING = 'QUALIFIED_FOR_MEETING';

    public const STATUS_MEETING_SCHEDULED = 'MEETING_SCHEDULED';

    public const STATUS_MEETING_COMPLETED = 'MEETING_COMPLETED';

    public const STATUS_APPROVED = 'APPROVED';

    public const STATUS_REJECTED = 'REJECTED';

    public const STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_UNDER_REVIEW,
        self::STATUS_NEEDS_REVISION,
        self::STATUS_QUALIFIED_FOR_MEETING,
        self::STATUS_MEETING_SCHEDULED,
        self::STATUS_MEETING_COMPLETED,
        self::STATUS_APPROVED,
        self::STATUS_REJECTED,
    ];

    public const ACTIVE_STATUSES = [
        self::STATUS_PENDING,
        self::STATUS_UNDER_REVIEW,
        self::STATUS_NEEDS_REVISION,
        self::STATUS_QUALIFIED_FOR_MEETING,
        self::STATUS_MEETING_SCHEDULED,
        self::STATUS_MEETING_COMPLETED,
    ];

    /** Persist with an explicit offset; see BusinessTime::DB_DATE_FORMAT. */
    protected $dateFormat = BusinessTime::DB_DATE_FORMAT;

    protected $fillable = [
        'application_number', 'company_name', 'owner_name', 'normalized_company_name', 'address',
        'contact_person', 'email', 'normalized_email', 'phone', 'business_type',
        'supply_category', 'products_services', 'status', 'submitted_at',
        'reviewed_at', 'reviewed_by_id', 'decision_reason', 'approved_supplier_id',
        'supplier_message', 'qualified_at', 'qualified_by_id', 'decided_at', 'decided_by_id',
        'revision_reason_codes', 'decision_reason_codes', 'alternative_schedule_message',
        'alternative_schedule_requested_at',
    ];

    protected $hidden = ['normalized_company_name', 'normalized_email'];

    protected function casts(): array
    {
        return [
            'submitted_at' => 'datetime', 'reviewed_at' => 'datetime',
            'qualified_at' => 'datetime', 'decided_at' => 'datetime',
            'revision_reason_codes' => 'array', 'decision_reason_codes' => 'array',
            'alternative_schedule_requested_at' => 'datetime',
        ];
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by_id');
    }

    public function approvedSupplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'approved_supplier_id');
    }

    public function qualifiedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'qualified_by_id');
    }

    public function decidedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by_id');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(SupplierApplicationAttachment::class);
    }

    public function offerings(): HasMany
    {
        return $this->hasMany(SupplierApplicationOffering::class)->orderBy('sort_order')->orderBy('id');
    }

    public function portalAccess(): HasOne
    {
        return $this->hasOne(SupplierApplicationAccess::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(SupplierApplicationEvent::class)->orderBy('occurred_at')->orderBy('id');
    }

    public function meetingSlots(): HasMany
    {
        return $this->hasMany(SupplierApplicationMeetingSlot::class)->orderBy('starts_at')->orderBy('scheduled_at');
    }
}
