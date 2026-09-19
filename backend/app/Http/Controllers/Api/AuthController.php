<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    private const MAX_LOGIN_ATTEMPTS = 5;
    private const LOGIN_DECAY_SECONDS = 60;

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

            $this->auditFailedLogin($email, 'RATE_LIMITED', 'Login blocked after too many attempts');

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

        $token = $user->createToken('api-token')->plainTextToken;

        AuditLogger::success('LOGIN', AuditLogger::MODULE_AUTH, [
            'actor' => $user,
            'resource' => $user,
            'resource_label' => $user->employee_id ?: $user->email,
            'details' => 'Successful login',
        ]);

        return response()->json([
            'message' => 'Login successful',
            'token' => $token,
            'user' => [
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
            ],
        ]);
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
    private function auditFailedLogin(string $email, string $reason, string $details, ?User $user = null): void
    {
        AuditLogger::failure('LOGIN_FAILED', AuditLogger::MODULE_AUTH, [
            'actor' => $user,
            'actor_identifier' => $email,
            'resource' => $user,
            'resource_type' => 'User',
            'resource_label' => $user?->employee_id ?: $email,
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
