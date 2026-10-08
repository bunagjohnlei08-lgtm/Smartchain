<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierApplicationAccess extends Model
{
    protected $fillable = [
        'supplier_application_id', 'link_token_hash', 'link_expires_at', 'link_consumed_at',
        'session_token_hash', 'session_expires_at', 'revoked_at', 'last_accessed_at',
    ];

    protected $hidden = ['link_token_hash', 'session_token_hash'];

    protected function casts(): array
    {
        return [
            'link_expires_at' => 'datetime',
            'link_consumed_at' => 'datetime',
            'session_expires_at' => 'datetime',
            'revoked_at' => 'datetime',
            'last_accessed_at' => 'datetime',
        ];
    }

    public function application(): BelongsTo
    {
        return $this->belongsTo(SupplierApplication::class, 'supplier_application_id');
    }
}
