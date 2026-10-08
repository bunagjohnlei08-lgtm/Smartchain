<?php

namespace App\Models;

use App\Support\BusinessTime;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierApplicationMeetingSlot extends Model
{
    public const AVAILABLE = 'AVAILABLE';

    public const RESERVED = 'RESERVED';

    public const COMPLETED = 'COMPLETED';

    public const CANCELLED = 'CANCELLED';

    public const STATUSES = [self::AVAILABLE, self::RESERVED, self::COMPLETED, self::CANCELLED];

    /** Internal meeting evaluation. An assessment is a record only, never a final decision. */
    public const ASSESSMENTS = ['RECOMMEND_APPROVAL', 'NEEDS_FURTHER_REVIEW', 'RECOMMEND_REJECTION'];

    public const EVALUATION_CHECKLIST = [
        'requirements_discussed', 'product_capability_verified',
        'delivery_capability_verified', 'compliance_requirements_discussed',
    ];

    /** Persist with an explicit offset; see BusinessTime::DB_DATE_FORMAT. */
    protected $dateFormat = BusinessTime::DB_DATE_FORMAT;

    protected $fillable = [
        'supplier_application_id', 'scheduled_at', 'starts_at', 'ends_at', 'status', 'created_by_id',
        'selected_at', 'completed_at', 'completed_by_id', 'evaluation_notes', 'evaluation',
    ];

    protected function casts(): array
    {
        return [
            'scheduled_at' => 'datetime',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'selected_at' => 'datetime',
            'completed_at' => 'datetime',
            'times_repaired_at' => 'datetime',
            'evaluation' => 'array',
        ];
    }

    public function application(): BelongsTo
    {
        return $this->belongsTo(SupplierApplication::class, 'supplier_application_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function completedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'completed_by_id');
    }
}
