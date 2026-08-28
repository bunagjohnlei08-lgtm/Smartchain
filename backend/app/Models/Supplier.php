<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Supplier extends Model
{
    protected $fillable = [
        'supplier_code', 'name', 'contact_person', 'email', 'phone',
        'address', 'status', 'payment_terms', 'notes',
    ];
}
