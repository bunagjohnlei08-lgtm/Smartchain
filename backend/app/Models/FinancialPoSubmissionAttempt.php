<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinancialPoSubmissionAttempt extends Model
{
    protected $fillable = [
        'financial_po_submission_id', 'attempt_number', 'correlation_id', 'result',
        'http_status', 'error_code', 'safe_message', 'started_at', 'completed_at',
    ];

    protected function casts(): array
    {
        return ['started_at' => 'datetime', 'completed_at' => 'datetime'];
    }

    public function submission(): BelongsTo
    {
        return $this->belongsTo(FinancialPoSubmission::class, 'financial_po_submission_id');
    }
}
