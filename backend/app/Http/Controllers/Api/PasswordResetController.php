<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LoginChallenge;
use App\Models\PasswordResetChallenge;
use App\Models\User;
use App\Support\AuditLogger;
use App\Support\PasswordPolicy;
use App\Support\PasswordResetChallenges;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class PasswordResetController extends Controller
{
    private const GENERIC_MESSAGE = 'If an account exists, a verification code has been sent to the registered email.';

    public function requestCode(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'string', 'email', 'max:255'],
        ]);
        $email = Str::lower(trim($validated['email']));
        $flowId = (string) Str::uuid();
        $user = User::query()->where('email', $email)->first();

        if ($user && $user->status === 'ACTIVE' && filled($user->password)) {
            [$challenge, $code] = PasswordResetChallenges::issue($user, $request, $flowId);

            AuditLogger::success('PASSWORD_RESET_REQUESTED', AuditLogger::MODULE_AUTH, [
                'actor' => $user,
                'resource' => $user,
                'resource_label' => $user->employee_id ?: $user->email,
                'details' => 'Password reset requested',
            ]);

            if (PasswordResetChallenges::deliver($challenge, $user, $code)) {
                AuditLogger::success('PASSWORD_RESET_OTP_SENT', AuditLogger::MODULE_AUTH, [
                    'actor' => $user,
                    'resource' => $user,
                    'resource_label' => $user->employee_id ?: $user->email,
                    'details' => 'Password reset verification code emailed',
                ]);
            } else {
                AuditLogger::failure('PASSWORD_RESET_OTP_FAILED', AuditLogger::MODULE_AUTH, [
                    'actor' => $user,
                    'resource' => $user,
                    'resource_label' => $user->employee_id ?: $user->email,
                    'details' => 'Password reset verification code delivery failed',
                    'metadata' => ['reason' => 'DELIVERY_FAILED'],
                ]);
            }
        }

        return response()->json([
            'message' => self::GENERIC_MESSAGE,
            'flow_id' => $flowId,
            'expires_in' => PasswordResetChallenges::otpExpirationMinutes() * 60,
            'resend_available_in' => PasswordResetChallenges::resendCooldownSeconds(),
        ]);
    }

    public function resend(Request $request): JsonResponse
    {
        $validated = $request->validate(['flow_id' => ['required', 'string', 'uuid']]);

        [$outcome, $challenge, $user, $code, $retryAfter] = DB::transaction(function () use ($validated) {
            $challenge = PasswordResetChallenge::query()->where('flow_id', $validated['flow_id'])->lockForUpdate()->first();
            if (! $challenge || $challenge->used_at || $challenge->revoked_at || $challenge->verified_at) {
                return ['INVALID', null, null, null, null];
            }

            $user = User::query()->whereKey($challenge->user_id)->lockForUpdate()->first();
            if (! $user || $user->status !== 'ACTIVE' || blank($user->password)) {
                $challenge->forceFill(['revoked_at' => now()])->save();
                return ['INVALID', null, null, null, null];
            }
            if ($challenge->resend_count >= PasswordResetChallenges::maxResends()) {
                return ['LIMIT', null, null, null, null];
            }
            $wait = PasswordResetChallenges::resendAvailableIn($challenge);
            if ($wait > 0) {
                return ['COOLDOWN', null, null, null, $wait];
            }

            return ['SEND', $challenge, $user, PasswordResetChallenges::rotate($challenge), null];
        });

        if ($outcome === 'INVALID') return $this->flowError('This password reset session is no longer valid.', 'challenge_invalid');
        if ($outcome === 'LIMIT') return $this->flowError('No more codes can be sent. Start a new password reset.', 'resend_limit', 429);
        if ($outcome === 'COOLDOWN') {
            return response()->json(['message' => 'Please wait before requesting another code.', 'reason' => 'cooldown', 'retry_after' => $retryAfter], 429)
                ->header('Retry-After', (string) $retryAfter);
        }
        if (! PasswordResetChallenges::deliver($challenge, $user, $code)) {
            return $this->flowError('We could not send a new code. Start a new password reset.', 'delivery_failed', 503);
        }

        AuditLogger::success('PASSWORD_RESET_OTP_SENT', AuditLogger::MODULE_AUTH, [
            'actor' => $user,
            'resource' => $user,
            'resource_label' => $user->employee_id ?: $user->email,
            'details' => 'Password reset verification code resent',
            'metadata' => ['resend' => true, 'resend_count' => $challenge->resend_count],
        ]);

        return response()->json([
            'message' => 'A new verification code has been sent.',
            'expires_in' => PasswordResetChallenges::otpExpirationMinutes() * 60,
            'resend_available_in' => PasswordResetChallenges::resendCooldownSeconds(),
        ]);
    }

    public function verify(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'flow_id' => ['required', 'string', 'uuid'],
            'otp' => ['required', 'string', 'regex:/^[0-9]{6}$/'],
        ]);

        [$outcome, $user, $grant] = DB::transaction(function () use ($validated) {
            $challenge = PasswordResetChallenge::query()->where('flow_id', $validated['flow_id'])->lockForUpdate()->first();
            if (! $challenge || $challenge->used_at || $challenge->revoked_at || $challenge->verified_at || $challenge->last_sent_at === null) {
                return ['INVALID', null, null];
            }
            $user = User::query()->whereKey($challenge->user_id)->lockForUpdate()->first();
            if (! $user || $user->status !== 'ACTIVE' || blank($user->password)) {
                $challenge->forceFill(['revoked_at' => now()])->save();
                return ['INVALID', $user, null];
            }
            if (! $challenge->otp_expires_at->isFuture()) return ['EXPIRED', $user, null];
            if ($challenge->attempt_count >= $challenge->max_attempts) return ['EXHAUSTED', $user, null];
            if (! Hash::check($validated['otp'], $challenge->otp_hash)) {
                $attempts = $challenge->attempt_count + 1;
                $exhausted = $attempts >= $challenge->max_attempts;
                $challenge->forceFill(['attempt_count' => $attempts, 'revoked_at' => $exhausted ? now() : null])->save();
                return [$exhausted ? 'EXHAUSTED' : 'WRONG', $user, null];
            }

            $grant = bin2hex(random_bytes(32));
            $challenge->forceFill([
                'verified_at' => now(),
                'reset_token_hash' => hash('sha256', $grant),
                'reset_token_expires_at' => now()->addMinutes(PasswordResetChallenges::grantExpirationMinutes()),
            ])->save();
            return ['VERIFIED', $user, $grant];
        });

        if ($outcome !== 'VERIFIED') {
            if ($user) {
                AuditLogger::failure('PASSWORD_RESET_OTP_FAILED', AuditLogger::MODULE_AUTH, [
                    'actor' => $user,
                    'resource' => $user,
                    'resource_label' => $user->employee_id ?: $user->email,
                    'details' => 'Password reset verification code rejected',
                    'metadata' => ['reason' => $outcome],
                ]);
            }
            return match ($outcome) {
                'EXPIRED' => $this->flowError('Verification code has expired. Request a new code.', 'expired'),
                'EXHAUSTED' => $this->flowError('Too many verification attempts. Request a new code.', 'attempts_exhausted'),
                'WRONG' => $this->flowError('Invalid verification code.', 'invalid_code'),
                default => $this->flowError('This password reset session is no longer valid.', 'challenge_invalid'),
            };
        }

        return response()->json([
            'message' => 'Verification successful.',
            'reset_token' => $grant,
            'expires_in' => PasswordResetChallenges::grantExpirationMinutes() * 60,
        ]);
    }

    public function reset(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'reset_token' => ['required', 'string', 'size:64'],
            'password' => PasswordPolicy::rules(),
        ]);
        $tokenHash = hash('sha256', $validated['reset_token']);

        $user = DB::transaction(function () use ($validated, $tokenHash) {
            $challenge = PasswordResetChallenge::query()->where('reset_token_hash', $tokenHash)->lockForUpdate()->first();
            if (! $challenge || $challenge->used_at || $challenge->revoked_at || ! $challenge->verified_at
                || ! $challenge->reset_token_expires_at?->isFuture()) return null;

            $user = User::query()->whereKey($challenge->user_id)->lockForUpdate()->first();
            if (! $user || $user->status !== 'ACTIVE' || blank($user->password)) {
                $challenge->forceFill(['revoked_at' => now()])->save();
                return null;
            }

            $now = now();
            $user->forceFill(['password' => $validated['password']])->save();
            $challenge->forceFill(['used_at' => $now, 'reset_token_hash' => null])->save();
            PasswordResetChallenge::query()->where('user_id', $user->id)->whereKeyNot($challenge->id)->outstanding()
                ->update(['revoked_at' => $now, 'updated_at' => $now]);
            LoginChallenge::query()->where('user_id', $user->id)->outstanding()
                ->update(['revoked_at' => $now, 'updated_at' => $now]);
            $user->tokens()->delete();

            AuditLogger::success('PASSWORD_RESET_COMPLETED', AuditLogger::MODULE_AUTH, [
                'actor' => $user,
                'resource' => $user,
                'resource_label' => $user->employee_id ?: $user->email,
                'details' => 'Password reset completed',
                'metadata' => ['method' => 'email_otp'],
            ]);
            return $user;
        });

        if (! $user) return $this->flowError('This password reset authorization is invalid or has expired.', 'reset_token_invalid');

        return response()->json(['message' => 'Password reset successfully.']);
    }

    private function flowError(string $message, string $reason, int $status = 422): JsonResponse
    {
        return response()->json(['message' => $message, 'reason' => $reason], $status);
    }
}
