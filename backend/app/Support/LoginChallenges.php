<?php

namespace App\Support;

use App\Mail\LoginOtpMail;
use App\Models\LoginChallenge;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;

/**
 * Issues and delivers the emailed second-step login codes.
 *
 * - Codes are 6 digits from random_int(); only a Hash::make() digest is stored.
 * - A challenge accepts a code only after its email was delivered
 *   (last_sent_at is set), so a failed send never leaves a live code behind.
 * - The plaintext code is returned to the caller only so it can be mailed;
 *   it is never logged, audited or returned from an API response.
 */
class LoginChallenges
{
    public static function generateCode(): string
    {
        return str_pad((string) random_int(0, 999_999), 6, '0', STR_PAD_LEFT);
    }

    /**
     * Start a new challenge for a password-verified ACTIVE user. Any earlier
     * unfinished challenge for the same user is revoked.
     *
     * @return array{0: LoginChallenge, 1: string} the challenge and its plaintext code
     */
    public static function issue(User $user, Request $request): array
    {
        return DB::transaction(function () use ($user, $request) {
            $now = now();

            LoginChallenge::query()
                ->where('user_id', $user->id)
                ->outstanding()
                ->update(['revoked_at' => $now, 'updated_at' => $now]);

            $code = self::generateCode();

            $challenge = LoginChallenge::create([
                'user_id' => $user->id,
                'challenge_id' => (string) Str::uuid(),
                'otp_hash' => Hash::make($code),
                'expires_at' => $now->copy()->addMinutes(self::expirationMinutes()),
                'max_attempts' => self::maxAttempts(),
                'ip_address' => $request->ip(),
                'user_agent' => Str::limit((string) $request->userAgent(), 250, '') ?: null,
            ]);

            return [$challenge, $code];
        });
    }

    /**
     * Replace the challenge's code with a fresh one. The old code stops
     * working immediately; the failed-attempt count is kept. Caller must hold
     * a row lock on the challenge inside a transaction.
     */
    public static function rotate(LoginChallenge $challenge): string
    {
        $code = self::generateCode();

        $challenge->forceFill([
            'otp_hash' => Hash::make($code),
            'expires_at' => now()->addMinutes(self::expirationMinutes()),
            'resend_count' => $challenge->resend_count + 1,
            // Not usable again until this code's email is delivered.
            'last_sent_at' => null,
        ])->save();

        return $code;
    }

    /**
     * Email the code, then mark it deliverable. On failure the challenge is
     * revoked so the user has to start over. Must run outside a transaction.
     */
    public static function deliver(LoginChallenge $challenge, User $user, string $code): bool
    {
        try {
            Mail::to($user->email)->send(new LoginOtpMail(
                name: $user->name,
                code: $code,
                expiresInMinutes: self::expirationMinutes(),
            ));
        } catch (Throwable $exception) {
            // Transport errors carry no message body, so the code is not logged.
            report($exception);
            $challenge->forceFill(['revoked_at' => now()])->save();

            return false;
        }

        $challenge->forceFill(['last_sent_at' => now()])->save();

        return true;
    }

    /** Seconds until another code may be sent for this challenge (0 = now). */
    public static function resendAvailableIn(LoginChallenge $challenge): int
    {
        $since = $challenge->last_sent_at ?? $challenge->updated_at;
        $availableAt = $since->getTimestamp() + self::resendCooldownSeconds();

        return max(0, $availableAt - now()->getTimestamp());
    }

    public static function expirationMinutes(): int
    {
        return max(1, (int) config('login_otp.expiration_minutes', 5));
    }

    public static function maxAttempts(): int
    {
        return max(1, (int) config('login_otp.max_attempts', 5));
    }

    public static function resendCooldownSeconds(): int
    {
        return max(0, (int) config('login_otp.resend_cooldown_seconds', 60));
    }

    public static function maxResends(): int
    {
        return max(0, (int) config('login_otp.max_resends', 5));
    }

    public static function maxChallengesPerWindow(): int
    {
        return max(1, (int) config('login_otp.max_challenges_per_window', 5));
    }
}
