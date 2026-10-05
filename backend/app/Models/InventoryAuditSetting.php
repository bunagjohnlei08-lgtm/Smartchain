<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryAuditSetting extends Model
{
    protected $fillable = ['id', 'audit_months', 'updated_by'];

    protected function casts(): array
    {
        return ['audit_months' => 'array'];
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
