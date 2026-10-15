<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Warehouse extends Model
{
    protected $fillable = ['name', 'code', 'branch_id', 'address', 'latitude', 'longitude', 'capacity', 'capacity_kg', 'capacity_pcs', 'capacity_l', 'status', 'show_on_public_website'];

    protected function casts(): array
    {
        return [
            'latitude' => 'decimal:7',
            'longitude' => 'decimal:7',
            'capacity' => 'integer',
            'capacity_kg' => 'integer',
            'capacity_pcs' => 'integer',
            'capacity_l' => 'integer',
            'capacity_unit_alert_levels' => 'array',
            'show_on_public_website' => 'boolean',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function inventories(): HasMany
    {
        return $this->hasMany(Inventory::class);
    }
}
