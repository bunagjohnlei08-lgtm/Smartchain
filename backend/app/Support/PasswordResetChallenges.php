<?php

namespace App\Support;

use App\Mail\PasswordResetOtpMail;
use App\Models\PasswordResetChallenge;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;

final class PasswordResetChallenges
{
    public static function generateCode(): string
    {
        return str_pad((string) random_int(0, 999_999), 6, '0', STR_PAD_LEFT);
    }

    /** @return array{0: PasswordResetChallenge, 1: string} */
    public static function issue(User $user, Request $request, string $flowId): array
    {
        return DB::transaction(function () use ($user, $request, $flowId) {
            $now = now();
            PasswordResetChallenge::query()->where('user_id', $user->id)->outstanding()
                ->update(['revoked_at' => $now, 'updated_at' => $now]);

            $code = self::generateCode();
            $challenge = PasswordResetChallenge::create([
                'user_id' => $user->id,
                'flow_id' => $flowId,
                'otp_hash' => Hash::make($code),
                'otp_expires_at' => $now->copy()->addMinutes(self::otpExpirationMinutes()),
                'max_attempts' => self::maxAttempts(),
                'ip_address' => $request->ip(),
                'user_agent' => Str::limit((string) $request->userAgent(), 250, '') ?: null,
            ]);

            return [$challenge, $code];
        });
    }

    public static function rotate(PasswordResetChallenge $challenge): string
    {
        $code = self::generateCode();
        $challenge->forceFill([
            'otp_hash' => Hash::make($code),
            'otp_expires_at' => now()->addMinutes(self::otpExpirationMinutes()),
            'attempt_count' => 0,
            'resend_count' => $challenge->resend_count + 1,
            'last_sent_at' => null,
        ])->save();

        return $code;
    }

    public static function deliver(PasswordResetChallenge $challenge, User $user, string $code): bool
    {
        try {
            Mail::to($user->email)->send(new PasswordResetOtpMail(
                name: $user->name,
                code: $code,
                expiresInMinutes: self::otpExpirationMinutes(),
            ));
        } catch (Throwable $exception) {
            report($exception);
            $challenge->forceFill(['revoked_at' => now()])->save();
            return false;
        }

        $challenge->forceFill(['last_sent_at' => now()])->save();
        return true;
    }

    public static function resendAvailableIn(PasswordResetChallenge $challenge): int
    {
        $since = $challenge->last_sent_at ?? $challenge->updated_at;
        return max(0, $since->getTimestamp() + self::resendCooldownSeconds() - now()->getTimestamp());
    }

    public static function otpExpirationMinutes(): int { return max(1, (int) config('password_reset.otp_expiration_minutes', 5)); }
    public static function maxAttempts(): int { return max(1, (int) config('password_reset.otp_max_attempts', 5)); }
    public static function resendCooldownSeconds(): int { return max(0, (int) config('password_reset.resend_cooldown_seconds', 60)); }
    public static function maxResends(): int { return max(0, (int) config('password_reset.max_resends', 5)); }
    public static function grantExpirationMinutes(): int { return max(1, (int) config('password_reset.grant_expiration_minutes', 10)); }
}
