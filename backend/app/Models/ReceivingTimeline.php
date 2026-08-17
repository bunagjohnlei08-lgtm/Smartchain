<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReceivingTimeline extends Model
{
    protected $fillable = [
        'receiving_id',
        'status',
        'performed_by',
        'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'occurred_at' => 'datetime',
        ];
    }

    public function receiving(): BelongsTo
    {
        return $this->belongsTo(Receiving::class);
    }
}
