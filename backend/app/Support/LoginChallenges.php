<?php

namespace App\Support;

use App\Mail\LoginOtpMail;
use App\Models\LoginChallenge;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Issues and delivers the emailed second-step login codes.
 *
 * - Codes are 6 digits from random_int(); only a Hash::make() digest is stored.
 * - A challenge accepts a code only after its email was submitted
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
            // Not usable again until this code's email is submitted.
            'last_sent_at' => null,
        ])->save();

        return $code;
    }

    /**
     * Submit synchronously, then enable only this exact code generation.
     * A failed initial send is revoked; a failed resend stays open for retry,
     * with both old and unsent codes unusable. Resend callers hold a row lock.
     */
    public static function deliver(LoginChallenge $challenge, User $user, string $code): bool
    {
        $current = $challenge->fresh();
        if (! $current || ! $current->isOpen() || ! $current->expires_at->isFuture()
            || $current->user_id !== $user->id || $current->otp_hash !== $challenge->otp_hash) {
            return false;
        }
        try {
            // Log/array (including failover to log) cannot deliver login codes
            // and may expose their plaintext. Mail::fake remains usable in tests.
            if (! app()->environment('testing') && ! self::usesLiveTransport((string) config('mail.default'))) {
                throw new \RuntimeException('Login mail transport is not a delivery transport.');
            }
            $sent = Mail::to($user->email)->send(new LoginOtpMail(
                name: $user->name,
                code: $code,
                expiresInMinutes: self::expirationMinutes(),
            ));
            if ($sent === null && ! app()->environment('testing')) {
                throw new \RuntimeException('Login mail submission was cancelled.');
            }
        } catch (Throwable $exception) {
            // Arbitrary transport exceptions can contain headers or message
            // content. Never report their raw message, arguments or trace.
            Log::warning('Login verification email submission failed', [
                'mailer' => config('mail.default'),
                'exception_type' => class_basename($exception),
            ]);
            LoginChallenge::query()->whereKey($challenge->id)
                ->where('otp_hash', $challenge->otp_hash)
                ->whereNull('revoked_at')->whereNull('consumed_at')
                ->update(['revoked_at' => (int) $challenge->resend_count === 0 ? now() : null]);

            return false;
        }

        $updated = LoginChallenge::query()->whereKey($challenge->id)
            ->where('otp_hash', $challenge->otp_hash)
            ->whereNull('revoked_at')->whereNull('consumed_at')
            ->where('expires_at', '>', now())
            ->update(['last_sent_at' => now()]);
        $challenge->refresh();

        return $updated === 1;
    }

    private static function usesLiveTransport(string $mailer, array $visited = []): bool
    {
        if (in_array($mailer, $visited, true)) return false;
        $config = config('mail.mailers.'.$mailer, []);
        $transport = $config['transport'] ?? null;
        if (in_array($transport, ['failover', 'roundrobin'], true)) {
            $children = $config['mailers'] ?? [];
            return $children !== [] && collect($children)->every(fn ($child) => self::usesLiveTransport($child, [...$visited, $mailer]));
        }
        return is_string($transport) && ! in_array($transport, ['log', 'array'], true);
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
