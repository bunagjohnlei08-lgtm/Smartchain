<?php

namespace App\Http\Middleware;

use App\Models\PersonalAccessToken;
use App\Models\User;
use App\Support\AuditLogger;
use App\Support\IdleSession;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceIdleSessionTimeout
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $token = $user?->currentAccessToken();

        if ($user instanceof User && $token instanceof PersonalAccessToken && $token->exists && $token->getKey() !== null) {
            $timeoutMinutes = IdleSession::timeoutMinutes($user);

            if (IdleSession::expiresAt($user, $token)->lte(now())) {
                AuditLogger::log('SESSION_IDLE_TIMEOUT', AuditLogger::MODULE_AUTH, [
                    'actor' => $user,
                    'resource' => $user,
                    'resource_label' => $user->employee_id ?: $user->email,
                    'status' => \App\Models\AuditLog::STATUS_EXPIRED,
                    'details' => 'Session expired due to inactivity',
                    'metadata' => [
                        'role' => $user->role?->slug,
                        'timeout_minutes' => $timeoutMinutes,
                    ],
                ]);

                // Revoke only the bearer token that authenticated this request.
                $token->delete();

                return response()->json([
                    'message' => 'Your session expired due to inactivity.',
                    'code' => IdleSession::EXPIRED_CODE,
                ], 401);
            }
        }

        return $next($request);
    }
}
