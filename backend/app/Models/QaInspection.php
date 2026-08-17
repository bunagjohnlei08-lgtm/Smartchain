<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class QaInspection extends Model
{
    protected $fillable = [
        'receiving_id',
        'status',
        'started_at',
        'completed_at',
        'inspected_by_id',
        'submitted_by_id',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function receiving(): BelongsTo
    {
        return $this->belongsTo(Receiving::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(QaInspectionItem::class);
    }

    public function inspectedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'inspected_by_id');
    }

    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by_id');
    }
}
