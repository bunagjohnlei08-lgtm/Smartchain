<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Second login step: a password-verified user must submit the emailed
 * 6-digit code before a Sanctum token is issued. Only a hash of the code is
 * stored. State columns are written explicitly by App\Support\LoginChallenges,
 * never mass-assigned.
 */
class LoginChallenge extends Model
{
    protected $fillable = [
        'user_id',
        'challenge_id',
        'otp_hash',
        'expires_at',
        'max_attempts',
        'ip_address',
        'user_agent',
    ];

    protected $hidden = [
        'otp_hash',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'last_sent_at' => 'datetime',
            'verified_at' => 'datetime',
            'consumed_at' => 'datetime',
            'revoked_at' => 'datetime',
            'attempt_count' => 'integer',
            'max_attempts' => 'integer',
            'resend_count' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Challenges that have been neither consumed nor revoked (expiry aside). */
    public function scopeOutstanding(Builder $query): Builder
    {
        return $query->whereNull('consumed_at')->whereNull('revoked_at');
    }

    /** Open for a resend: not finished, not revoked, attempts left. */
    public function isOpen(): bool
    {
        return $this->consumed_at === null
            && $this->revoked_at === null
            && $this->attempt_count < $this->max_attempts;
    }

    /** Open, and the current code was delivered and has not expired. */
    public function acceptsCode(): bool
    {
        return $this->isOpen()
            && $this->last_sent_at !== null
            && $this->expires_at->isFuture();
    }
}
