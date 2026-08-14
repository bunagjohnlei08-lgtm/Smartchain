<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    protected $fillable = ['name', 'category', 'brand', 'unit', 'cost_price'];

    protected function casts(): array
    {
        return [
            'cost_price' => 'decimal:2',
        ];
    }

    public function inventories(): HasMany
    {
        return $this->hasMany(Inventory::class);
    }
}
