<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PasswordResetChallenge extends Model
{
    protected $fillable = [
        'user_id', 'flow_id', 'otp_hash', 'otp_expires_at', 'max_attempts',
        'ip_address', 'user_agent',
    ];

    protected $hidden = ['otp_hash', 'reset_token_hash'];

    protected function casts(): array
    {
        return [
            'otp_expires_at' => 'datetime',
            'last_sent_at' => 'datetime',
            'verified_at' => 'datetime',
            'reset_token_expires_at' => 'datetime',
            'used_at' => 'datetime',
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

    public function scopeOutstanding(Builder $query): Builder
    {
        return $query->whereNull('used_at')->whereNull('revoked_at');
    }

    public function acceptsOtp(): bool
    {
        return $this->used_at === null
            && $this->revoked_at === null
            && $this->verified_at === null
            && $this->last_sent_at !== null
            && $this->attempt_count < $this->max_attempts
            && $this->otp_expires_at->isFuture();
    }
}
