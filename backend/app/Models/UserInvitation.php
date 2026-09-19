<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Single-use account activation invitation. Only the SHA-256 hash of the
 * emailed token is stored. State columns (consumed_at, revoked_at) are
 * written explicitly by App\Support\UserInvitations, never mass-assigned.
 */
class UserInvitation extends Model
{
    protected $fillable = [
        'user_id',
        'token_hash',
        'expires_at',
        'invited_by',
    ];

    protected $hidden = [
        'token_hash',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'consumed_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function inviter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }

    /** Invitations that have been neither consumed nor revoked (expiry aside). */
    public function scopeOutstanding(Builder $query): Builder
    {
        return $query->whereNull('consumed_at')->whereNull('revoked_at');
    }

    public function isUsable(): bool
    {
        return $this->consumed_at === null
            && $this->revoked_at === null
            && $this->expires_at->isFuture();
    }
}
