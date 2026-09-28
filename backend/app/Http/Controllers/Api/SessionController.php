<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PersonalAccessToken;
use App\Models\User;
use App\Support\IdleSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SessionController extends Controller
{
    public function status(Request $request): JsonResponse
    {
        return $this->response($request);
    }

    public function activity(Request $request): JsonResponse
    {
        $user = $request->user();
        $token = $user?->currentAccessToken();

        abort_unless($user instanceof User && $token instanceof PersonalAccessToken && $token->exists && $token->getKey() !== null, 401);

        $token->forceFill(['last_activity_at' => now()])->save();

        return $this->response($request, $token->fresh());
    }

    private function response(Request $request, ?PersonalAccessToken $token = null): JsonResponse
    {
        $user = $request->user();
        $token ??= $user?->currentAccessToken();

        abort_unless($user instanceof User && $token instanceof PersonalAccessToken && $token->exists && $token->getKey() !== null, 401);

        $lastActivityAt = IdleSession::lastActivityAt($token);

        return response()->json([
            'timeout_minutes' => IdleSession::timeoutMinutes($user),
            'warning_minutes' => IdleSession::warningMinutes(),
            'last_activity_at' => $lastActivityAt->toIso8601String(),
            'expires_at' => IdleSession::expiresAt($user, $token)->toIso8601String(),
            // Lets the client measure expires_at against the server clock instead of its own.
            'server_time' => now()->toIso8601String(),
        ]);
    }
}
