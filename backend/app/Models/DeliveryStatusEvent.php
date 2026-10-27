<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeliveryStatusEvent extends Model
{
    protected $fillable = [
        'delivery_request_id', 'logistics_partner_id', 'event_id', 'payload_sha256',
        'partner_status', 'occurred_at', 'processing_result', 'note',
        'proof_reference', 'received_at',
    ];

    protected function casts(): array { return ['occurred_at' => 'datetime', 'received_at' => 'datetime']; }
    public function deliveryRequest(): BelongsTo { return $this->belongsTo(DeliveryRequest::class); }
    public function partner(): BelongsTo { return $this->belongsTo(LogisticsPartner::class, 'logistics_partner_id'); }
}
