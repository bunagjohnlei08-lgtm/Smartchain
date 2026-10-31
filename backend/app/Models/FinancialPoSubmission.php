<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FinancialPoSubmission extends Model
{
    public const PENDING = 'PENDING';

    public const SUBMITTING = 'SUBMITTING';

    public const ACKNOWLEDGED = 'ACKNOWLEDGED';

    public const RETRY_PENDING = 'RETRY_PENDING';

    public const RECONCILIATION_REQUIRED = 'RECONCILIATION_REQUIRED';

    public const FAILED = 'FAILED';

    protected $fillable = [
        'purchase_order_id', 'message_id', 'state', 'payload_version', 'payload_sha256',
        'payload_snapshot', 'financial_reference', 'partner_acknowledgment', 'retry_count',
        'next_attempt_at', 'submitted_at', 'acknowledged_at', 'last_error_code',
        'last_error_message', 'created_by',
    ];

    protected $hidden = ['payload_snapshot'];

    protected function casts(): array
    {
        return [
            'payload_snapshot' => 'array', 'next_attempt_at' => 'datetime',
            'submitted_at' => 'datetime', 'acknowledged_at' => 'datetime',
        ];
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function attempts(): HasMany
    {
        return $this->hasMany(FinancialPoSubmissionAttempt::class);
    }
}
