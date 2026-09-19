<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Server-side enforcement that only ACTIVE accounts may use an authenticated
 * session. Runs after auth:sanctum, so a token issued while the account was
 * ACTIVE stops working the moment the account leaves that state.
 */
class EnsureAccountIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->status !== 'ACTIVE') {
            $token = $user->currentAccessToken();

            if ($token instanceof PersonalAccessToken) {
                $token->delete();
            }

            return response()->json([
                'message' => 'Your account is not active.',
            ], 401);
        }

        return $next($request);
    }
}
