<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierApplicationEvent extends Model
{
    public const SUBMITTED = 'APPLICATION_SUBMITTED';

    public const UNDER_REVIEW = 'UNDER_REVIEW';

    public const RETURNED_FOR_REVISION = 'RETURNED_FOR_REVISION';

    public const CORRECTIONS_SUBMITTED = 'CORRECTIONS_SUBMITTED';

    public const QUALIFIED_FOR_MEETING = 'QUALIFIED_FOR_MEETING';

    public const APPROVED = 'APPROVED';

    public const REJECTED = 'REJECTED';

    public const SLOTS_AVAILABLE = 'MEETING_SLOTS_AVAILABLE';

    public const ALTERNATIVE_SCHEDULE_REQUESTED = 'ALTERNATIVE_SCHEDULE_REQUESTED';

    public const MEETING_SELECTED = 'MEETING_SELECTED';

    public const MEETING_COMPLETED = 'MEETING_COMPLETED';

    public const PROCESS_COMPLETED = 'APPLICATION_PROCESS_COMPLETED';

    protected $fillable = [
        'supplier_application_id', 'event_type', 'title', 'description', 'occurred_at',
    ];

    protected function casts(): array
    {
        return ['occurred_at' => 'datetime'];
    }

    public function application(): BelongsTo
    {
        return $this->belongsTo(SupplierApplication::class, 'supplier_application_id');
    }
}
