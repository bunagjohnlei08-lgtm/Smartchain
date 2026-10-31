<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinancialObligationAttempt extends Model
{
    protected $fillable = [
        'financial_obligation_id', 'attempt_number', 'result', 'http_status',
        'error_code', 'safe_message', 'started_at', 'completed_at',
    ];

    protected function casts(): array
    {
        return ['started_at' => 'datetime', 'completed_at' => 'datetime'];
    }

    public function obligation(): BelongsTo
    {
        return $this->belongsTo(FinancialObligation::class, 'financial_obligation_id');
    }
}
