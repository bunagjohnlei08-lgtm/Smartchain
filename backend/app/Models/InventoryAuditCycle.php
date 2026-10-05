<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryAuditCycle extends Model
{
    public const STATUS_ACTIVE = 'ACTIVE';
    public const STATUS_COMPLETED = 'COMPLETED';

    protected $fillable = ['reference', 'name', 'scheduled_for', 'status', 'due_notified_at', 'started_at', 'completed_at'];

    protected function casts(): array
    {
        return [
            'scheduled_for' => 'date',
            'due_notified_at' => 'datetime',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(InventoryAuditItem::class);
    }
}
