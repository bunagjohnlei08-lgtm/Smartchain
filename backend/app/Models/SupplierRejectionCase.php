<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class SupplierRejectionCase extends Model
{
    protected $fillable = [
        'qa_inspection_item_id', 'status', 'send_attempts', 'last_send_attempt_at',
        'last_error_at', 'last_error', 'sent_at', 'sent_by_id', 'resolved_at',
        'resolved_by_id', 'resolution_notes', 'resolution_type', 'routed_to_receiving_at', 'routed_by_id',
    ];

    protected function casts(): array
    {
        return [
            'send_attempts' => 'integer', 'last_send_attempt_at' => 'datetime',
            'last_error_at' => 'datetime', 'sent_at' => 'datetime', 'resolved_at' => 'datetime',
            'routed_to_receiving_at' => 'datetime',
        ];
    }

    public function inspectionItem(): BelongsTo { return $this->belongsTo(QaInspectionItem::class, 'qa_inspection_item_id'); }
    public function sentBy(): BelongsTo { return $this->belongsTo(User::class, 'sent_by_id'); }
    public function resolvedBy(): BelongsTo { return $this->belongsTo(User::class, 'resolved_by_id'); }
    public function routedBy(): BelongsTo { return $this->belongsTo(User::class, 'routed_by_id'); }
    public function replacementReceiving(): HasOne { return $this->hasOne(Receiving::class, 'replacement_for_rejection_case_id'); }
}
