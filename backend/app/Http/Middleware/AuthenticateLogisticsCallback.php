<?php

namespace App\Http\Middleware;

use App\Models\LogisticsPartner;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateLogisticsCallback
{
    public function handle(Request $request, Closure $next): Response
    {
        $code = trim((string) $request->header('X-SmartChain-Partner'));
        $timestamp = trim((string) $request->header('X-SmartChain-Timestamp'));
        $signature = strtolower(trim((string) $request->header('X-SmartChain-Signature')));
        if ($code === '' || ! preg_match('/^[A-Z0-9_-]{2,50}$/', $code) || ! ctype_digit($timestamp) || ! preg_match('/^[a-f0-9]{64}$/', $signature)) {
            return response()->json(['acknowledged' => false, 'error' => ['code' => 'INVALID_AUTHENTICATION', 'message' => 'Valid callback authentication headers are required.']], 401);
        }
        if (abs(now()->timestamp - (int) $timestamp) > (int) config('logistics.callback_clock_skew_seconds', 300)) {
            return response()->json(['acknowledged' => false, 'error' => ['code' => 'STALE_SIGNATURE', 'message' => 'The callback authentication timestamp is outside the allowed clock skew.']], 401);
        }
        $partner = LogisticsPartner::query()->where('code', $code)->where('enabled', true)->first();
        if (! $partner || ! filled($partner->callback_secret)) {
            return response()->json(['acknowledged' => false, 'error' => ['code' => 'INVALID_AUTHENTICATION', 'message' => 'Callback authentication failed.']], 401);
        }
        $expected = hash_hmac('sha256', $timestamp.'.'.$request->getContent(), $partner->callback_secret);
        if (! hash_equals($expected, $signature)) {
            return response()->json(['acknowledged' => false, 'error' => ['code' => 'INVALID_SIGNATURE', 'message' => 'Callback signature verification failed.']], 401);
        }
        $request->attributes->set('logistics_partner', $partner);
        return $next($request);
    }
}
