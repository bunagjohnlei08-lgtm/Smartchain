<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeliverySubmissionAttempt extends Model
{
    protected $fillable = [
        'delivery_request_id', 'attempt_number', 'correlation_id', 'result',
        'http_status', 'error_code', 'safe_message', 'started_at', 'completed_at',
    ];

    protected function casts(): array { return ['started_at' => 'datetime', 'completed_at' => 'datetime']; }
    public function deliveryRequest(): BelongsTo { return $this->belongsTo(DeliveryRequest::class); }
}
