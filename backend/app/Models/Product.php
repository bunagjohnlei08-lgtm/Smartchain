<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    public const RAW_MATERIAL = 'RAW_MATERIAL';
    public const FINISHED_PRODUCT = 'FINISHED_PRODUCT';
    public const CLASSIFICATIONS = [self::RAW_MATERIAL, self::FINISHED_PRODUCT];
    /** Existing quantity columns count whole units of the chosen stock unit. */
    public const DEFAULT_UNIT = 'PCS';

    protected $attributes = ['item_classification' => self::FINISHED_PRODUCT, 'unit' => self::DEFAULT_UNIT];

    protected $fillable = [
        'name', 'category', 'brand', 'unit', 'cost_price', 'selling_price', 'reorder_level', 'item_classification',
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
