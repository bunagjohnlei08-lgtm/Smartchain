<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LogisticsPartner extends Model
{
    protected $fillable = [
        'code', 'name', 'enabled', 'base_url', 'request_path', 'auth_scheme',
        'outbound_token', 'callback_secret', 'supports_idempotency',
    ];

    protected $hidden = ['outbound_token', 'callback_secret'];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'supports_idempotency' => 'boolean',
            'outbound_token' => 'encrypted',
            'callback_secret' => 'encrypted',
        ];
    }

    public function deliveryRequests(): HasMany { return $this->hasMany(DeliveryRequest::class); }
    public function itemMappings(): HasMany { return $this->hasMany(LogisticsItemMapping::class); }
}
