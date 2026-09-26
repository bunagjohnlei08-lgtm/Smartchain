<?php

namespace App\Support;

use App\Models\User;
use Carbon\CarbonInterface;
use Laravel\Sanctum\PersonalAccessToken;

class IdleSession
{
    public const EXPIRED_CODE = 'SESSION_IDLE_TIMEOUT';

    public static function timeoutMinutes(User $user): int
    {
        $user->loadMissing('role');
        $timeouts = config('session_idle.timeouts', []);

        return max(1, (int) ($timeouts[$user->role?->slug] ?? config('session_idle.default_timeout_minutes', 20)));
    }

    public static function warningMinutes(): int
    {
        return max(1, (int) config('session_idle.warning_minutes', 2));
    }

    public static function lastActivityAt(PersonalAccessToken $token): CarbonInterface
    {
        return $token->last_activity_at ?? $token->created_at;
    }

    public static function expiresAt(User $user, PersonalAccessToken $token): CarbonInterface
    {
        return self::lastActivityAt($token)->copy()->addMinutes(self::timeoutMinutes($user));
    }
}
