<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    /** Stock quantities are tracked in pieces. */
    public const DEFAULT_UNIT = 'PCS';

    protected $fillable = [
        'name', 'category', 'brand', 'unit', 'cost_price', 'selling_price', 'reorder_level',
    ];

    protected function casts(): array
    {
        return [
            'cost_price' => 'decimal:2',
            'selling_price' => 'decimal:2',
            'reorder_level' => 'integer',
        ];
    }

    public function inventories(): HasMany
    {
        return $this->hasMany(Inventory::class);
    }

    public function suppliers(): BelongsToMany
    {
        return $this->belongsToMany(Supplier::class)->withPivot('is_primary')->withTimestamps();
    }

    /** The mapped primary supplier, only while it is ACTIVE. Requires `suppliers` loaded. */
    public function activePrimarySupplier(): ?Supplier
    {
        return $this->suppliers->first(fn (Supplier $supplier) => $supplier->pivot->is_primary
            && $supplier->status === Supplier::STATUS_ACTIVE);
    }
}
