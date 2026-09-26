<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Supplier extends Model
{
    protected $fillable = [
        'supplier_code', 'name', 'contact_person', 'email', 'phone',
        'address', 'status', 'payment_terms', 'notes',
    ];

    public function aliases(): HasMany
    {
        return $this->hasMany(SupplierAlias::class)->orderBy('alias');
    }
}
