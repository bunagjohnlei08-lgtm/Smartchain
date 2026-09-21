<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Support\AuditLogger;
use App\Support\LoginChallenges;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    private const MAX_LOGIN_ATTEMPTS = 5;
    private const LOGIN_DECAY_SECONDS = 60;
    private const CHALLENGE_WINDOW_SECONDS = 900;

    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $email = Str::lower(trim((string) $request->input('email')));
        $rateLimitKeys = $this->loginRateLimitKeys($email, $request->ip());

        if (collect($rateLimitKeys)->contains(
            fn (string $key) => RateLimiter::tooManyAttempts($key, self::MAX_LOGIN_ATTEMPTS)
        )) {
            $retryAfter = collect($rateLimitKeys)
                ->map(fn (string $key) => RateLimiter::availableIn($key))
                ->max();

            $this->auditFailedLogin($email, 'RATE_LIMITED', 'Login blocked after too many attempts', null, AuditLog::STATUS_BLOCKED);

            return response()->json([
                'message' => 'Too many login attempts. Please try again later.',
                'retry_after' => $retryAfter,
            ], 429)->header('Retry-After', (string) $retryAfter);
        }

        $user = User::where('email', $email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            foreach ($rateLimitKeys as $key) {
                RateLimiter::hit($key, self::LOGIN_DECAY_SECONDS);
            }

            $this->auditFailedLogin($email, 'INVALID_CREDENTIALS', 'Invalid email or password', $user);

            return response()->json([
                'message' => 'The provided credentials are incorrect.',
                'errors' => [
                    'email' => ['The provided credentials are incorrect.'],
                ],
            ], 401);
        }

        foreach ($rateLimitKeys as $key) {
            RateLimiter::clear($key);
        }

        // Allow-list: only ACTIVE accounts may authenticate. Any other status,
        // including unexpected values, is refused.
        if ($user->status !== 'ACTIVE') {
            [$reason, $details, $message] = match ($user->status) {
                'PENDING' => ['ACCOUNT_PENDING', 'Login refused: account pending approval', 'Your account is pending approval.'],
                'SUSPENDED' => ['ACCOUNT_SUSPENDED', 'Login refused: account suspended', 'Your account has been suspended.'],
                default => ['ACCOUNT_INACTIVE', 'Login refused: account not active', 'Your account is not active.'],
            };

            $this->auditFailedLogin($email, $reason, $details, $user);

            return response()->json(['message' => $message], 403);
        }

        // A correct password alone does not sign the user in: a code is
        // emailed and no token is issued until it is verified.
        $issueKey = 'login-otp-issue:'.$user->id;
        if (RateLimiter::tooManyAttempts($issueKey, LoginChallenges::maxChallengesPerWindow())) {
            $retryAfter = RateLimiter::availableIn($issueKey);
            $this->auditFailedLogin($email, 'CODE_REQUEST_LIMITED', 'Login blocked: too many verification codes requested', $user, AuditLog::STATUS_BLOCKED);

            return response()->json([
                'message' => 'Too many verification codes requested. Please try again later.',
                'retry_after' => $retryAfter,
            ], 429)->header('Retry-After', (string) $retryAfter);
        }
        RateLimiter::hit($issueKey, self::CHALLENGE_WINDOW_SECONDS);

        [$challenge, $code] = LoginChallenges::issue($user, $request);

        if (! LoginChallenges::deliver($challenge, $user, $code)) {
            $this->auditCodeFailure($user, 'DELIVERY_FAILED', 'Verification code email could not be sent');

            return response()->json([
                'message' => 'We could not send your verification code. Please try again later.',
            ], 503);
        }

        AuditLogger::success('LOGIN_OTP_SENT', AuditLogger::MODULE_AUTH, [
            'actor' => $user,
            'resource' => $user,
            'resource_label' => $user->employee_id ?: $user->email,
            'details' => 'Password verified; login verification code emailed',
        ]);

        return response()->json([
            'message' => 'A verification code has been sent to your email.',
            'requires_otp' => true,
            'challenge_id' => $challenge->challenge_id,
            'expires_in' => LoginChallenges::expirationMinutes() * 60,
            'resend_available_in' => LoginChallenges::resendCooldownSeconds(),
        ]);
    }

    /**
     * Second login step. Public but throttled; the challenge row is locked so
     * a code can be redeemed exactly once, even by concurrent requests.
     */
    public function verifyOtp(Request $request)
    {
        $data = $request->validate([
            'challenge_id' => ['required', 'string', 'uuid'],
            'otp' => ['required', 'string', 'regex:/^[0-9]{6}$/'],
        ]);

        [$outcome, $user, $token] = DB::transaction(function () use ($data) {
            $challenge = LoginChallenge::query()
                ->where('challenge_id', $data['challenge_id'])
                ->lockForUpdate()
                ->first();

            if (! $challenge || ! $challenge->isOpen() || $challenge->last_sent_at === null) {
                return ['CHALLENGE_INVALID', null, null];
            }

            $user = User::query()->whereKey($challenge->user_id)->lockForUpdate()->first();

            if (! $user || $user->status !== 'ACTIVE') {
                $challenge->forceFill(['revoked_at' => now()])->save();

                return ['ACCOUNT_NOT_ACTIVE', $user, null];
            }

            if (! $challenge->expires_at->isFuture()) {
                return ['EXPIRED', $user, null];
            }

            if (! Hash::check($data['otp'], $challenge->otp_hash)) {
                $attempts = $challenge->attempt_count + 1;
                $exhausted = $attempts >= $challenge->max_attempts;

                $challenge->forceFill([
                    'attempt_count' => $attempts,
                    'revoked_at' => $exhausted ? now() : null,
                ])->save();

                return [$exhausted ? 'ATTEMPTS_EXHAUSTED' : 'INVALID_CODE', $user, null];
            }

            $now = now();
            $challenge->forceFill(['verified_at' => $now, 'consumed_at' => $now])->save();

            return ['VERIFIED', $user, $user->createToken('api-token')->plainTextToken];
        });

        if ($outcome !== 'VERIFIED') {
            if ($user && $outcome === 'EXPIRED') {
                AuditLogger::log('LOGIN_OTP_EXPIRED', AuditLogger::MODULE_AUTH, [
                    'status' => AuditLog::STATUS_EXPIRED,
                    'actor' => $user,
                    'actor_identifier' => $user->email,
                    'resource' => $user,
                    'resource_label' => $user->employee_id ?: $user->email,
                    'details' => 'Login verification code expired',
                ]);
            } elseif ($user) {
                $this->auditCodeFailure($user, $outcome, match ($outcome) {
                    'ACCOUNT_NOT_ACTIVE' => 'Login refused at code verification: account not active',
                    'ATTEMPTS_EXHAUSTED' => 'Incorrect verification code; attempts exhausted',
                    default => 'Invalid login verification code',
                });
            }

            [$reason, $message] = match ($outcome) {
                'EXPIRED' => ['expired', 'This verification code has expired. Request a new code.'],
                'INVALID_CODE' => ['invalid_code', 'The verification code is incorrect.'],
                'ATTEMPTS_EXHAUSTED' => ['attempts_exhausted', 'Too many incorrect codes. Please sign in again.'],
                default => ['challenge_invalid', 'This verification session is no longer valid. Please sign in again.'],
            };

            return response()->json(['message' => $message, 'reason' => $reason], 422);
        }

        // Two distinct events: the code check, then session issuance.
        AuditLogger::success('LOGIN_OTP_VERIFIED', AuditLogger::MODULE_AUTH, [
            'actor' => $user,
            'resource' => $user,
            'resource_label' => $user->employee_id ?: $user->email,
            'details' => 'Login verification code verified',
        ]);

        AuditLogger::success('LOGIN', AuditLogger::MODULE_AUTH, [
            'actor' => $user,
            'resource' => $user,
            'resource_label' => $user->employee_id ?: $user->email,
            'details' => 'Successful login (password and email verification code)',
        ]);

        return response()->json([
            'message' => 'Login successful',
            'token' => $token,
            'user' => $this->userPayload($user),
        ]);
    }

    /**
     * Email a fresh code for an open challenge. The previous code stops
     * working at once; failed attempts are not reset.
     */
    public function resendOtp(Request $request)
    {
        $data = $request->validate([
            'challenge_id' => ['required', 'string', 'uuid'],
        ]);

        [$outcome, $challenge, $user, $code, $retryAfter] = DB::transaction(function () use ($data) {
            $challenge = LoginChallenge::query()
                ->where('challenge_id', $data['challenge_id'])
                ->lockForUpdate()
                ->first();

            if (! $challenge || ! $challenge->isOpen()) {
                return ['CHALLENGE_INVALID', null, null, null, null];
            }

            $user = User::query()->whereKey($challenge->user_id)->lockForUpdate()->first();

            if (! $user || $user->status !== 'ACTIVE') {
                $challenge->forceFill(['revoked_at' => now()])->save();

                return ['CHALLENGE_INVALID', null, null, null, null];
            }

            if ($challenge->resend_count >= LoginChallenges::maxResends()) {
                return ['RESEND_LIMIT', null, null, null, null];
            }

            $wait = LoginChallenges::resendAvailableIn($challenge);
            if ($wait > 0) {
                return ['COOLDOWN', null, null, null, $wait];
            }

            return ['SEND', $challenge, $user, LoginChallenges::rotate($challenge), null];
        });

        if ($outcome === 'CHALLENGE_INVALID') {
            return response()->json([
                'message' => 'This verification session is no longer valid. Please sign in again.',
                'reason' => 'challenge_invalid',
            ], 422);
        }

        if ($outcome === 'RESEND_LIMIT') {
            return response()->json([
                'message' => 'No more codes can be sent for this sign-in. Please sign in again.',
                'reason' => 'resend_limit',
            ], 429);
        }

        if ($outcome === 'COOLDOWN') {
            return response()->json([
                'message' => 'Please wait before requesting another code.',
                'reason' => 'cooldown',
                'retry_after' => $retryAfter,
            ], 429)->header('Retry-After', (string) $retryAfter);
        }

        if (! LoginChallenges::deliver($challenge, $user, $code)) {
            $this->auditCodeFailure($user, 'DELIVERY_FAILED', 'Verification code email could not be resent');

            return response()->json([
                'message' => 'We could not send a new verification code. Please sign in again.',
                'reason' => 'delivery_failed',
            ], 503);
        }

        AuditLogger::success('LOGIN_OTP_SENT', AuditLogger::MODULE_AUTH, [
            'actor' => $user,
            'resource' => $user,
            'resource_label' => $user->employee_id ?: $user->email,
            'details' => 'Login verification code resent',
            'metadata' => ['resend' => true, 'resend_count' => $challenge->resend_count],
        ]);

        return response()->json([
            'message' => 'A new verification code has been sent to your email.',
            'expires_in' => LoginChallenges::expirationMinutes() * 60,
            'resend_available_in' => LoginChallenges::resendCooldownSeconds(),
        ]);
    }

    private function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'employee_id' => $user->employee_id,
            'name' => $user->name,
            'email' => $user->email,
            'status' => $user->status,
            'profile_photo_url' => $user->profile_photo_path
                ? Storage::disk('public')->url($user->profile_photo_path)
                : null,
            'role' => $user->role ? [
                'name' => $user->role->name,
                'slug' => $user->role->slug,
            ] : null,
            'department' => $user->department ? [
                'id' => $user->department->id,
                'name' => $user->department->name,
                'code' => $user->department->code,
            ] : null,
            'branch' => $user->branch ? [
                'id' => $user->branch->id,
                'name' => $user->branch->name,
                'code' => $user->branch->code,
            ] : null,
            'warehouse' => $user->warehouse ? [
                'id' => $user->warehouse->id,
                'name' => $user->warehouse->name,
                'code' => $user->warehouse->code,
            ] : null,
        ];
    }

    public function logout(Request $request)
    {
        $user = $request->user();

        // Record while the token is still valid so the actor is known.
        AuditLogger::success('LOGOUT', AuditLogger::MODULE_AUTH, [
            'actor' => $user,
            'resource' => $user,
            'resource_label' => $user->employee_id ?: $user->email,
            'details' => 'Logged out',
        ]);

        $user->currentAccessToken()->delete();

        return response()->json([
            'message' => 'Logged out successfully',
        ]);
    }

    /**
     * Failed attempts record the typed email and a reason category only -
     * the submitted password is never passed to the audit log.
     */
    private function auditFailedLogin(
        string $email,
        string $reason,
        string $details,
        ?User $user = null,
        string $status = AuditLog::STATUS_FAILED,
    ): void {
        AuditLogger::log('LOGIN_FAILED', AuditLogger::MODULE_AUTH, [
            'status' => $status,
            'actor' => $user,
            'actor_identifier' => $email,
            'resource' => $user,
            'resource_type' => 'User',
            'resource_label' => $user?->employee_id ?: $email,
            'details' => $details,
            'metadata' => ['reason' => $reason],
        ]);
    }

    /**
     * Second-step failures record a reason category only - never the
     * submitted code, its hash, or the challenge identifier.
     */
    private function auditCodeFailure(User $user, string $reason, string $details): void
    {
        AuditLogger::failure('LOGIN_OTP_FAILED', AuditLogger::MODULE_AUTH, [
            'actor' => $user,
            'actor_identifier' => $user->email,
            'resource' => $user,
            'resource_label' => $user->employee_id ?: $user->email,
            'details' => $details,
            'metadata' => ['reason' => $reason],
        ]);
    }

    private function loginRateLimitKeys(string $email, ?string $ip): array
    {
        return [
            'login-account:'.hash('sha256', $email),
            'login-client:'.hash('sha256', $email.'|'.($ip ?? 'unknown')),
        ];
    }
}
