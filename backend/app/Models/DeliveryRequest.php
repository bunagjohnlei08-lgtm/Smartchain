<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DeliveryRequest extends Model
{
    public const ACTIVE_STATES = ['READY', 'QUEUED', 'SENDING', 'RETRY_PENDING', 'RECONCILIATION_REQUIRED', 'ACCEPTED', 'IN_TRANSIT', 'DELIVERED'];

    protected $fillable = [
        'request_uuid', 'order_id', 'shipment_packing_id', 'logistics_partner_id',
        'payload_snapshot', 'state', 'partner_request_id', 'retry_count',
        'next_attempt_at', 'submitted_at', 'accepted_at', 'latest_event_at',
        'last_error_code', 'last_error_message',
    ];

    protected function casts(): array
    {
        return [
            'payload_snapshot' => 'array',
            'next_attempt_at' => 'datetime', 'submitted_at' => 'datetime',
            'accepted_at' => 'datetime', 'latest_event_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function packing(): BelongsTo { return $this->belongsTo(ShipmentPacking::class, 'shipment_packing_id'); }
    public function partner(): BelongsTo { return $this->belongsTo(LogisticsPartner::class, 'logistics_partner_id'); }
    public function attempts(): HasMany { return $this->hasMany(DeliverySubmissionAttempt::class); }
    public function statusEvents(): HasMany { return $this->hasMany(DeliveryStatusEvent::class); }
}
