<?php

namespace App\Http\Middleware;

use App\Models\SupplierApplicationAccess;
use App\Support\SupplierPortalAccess;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateSupplierPortal
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = (string) $request->header('X-Supplier-Portal-Session');
        $access = $token === '' ? null : SupplierApplicationAccess::query()
            ->with('application')
            ->where('session_token_hash', SupplierPortalAccess::hash($token))
            ->first();

        if (! $access || $access->revoked_at || ! $access->session_expires_at || $access->session_expires_at->isPast()) {
            return response()->json(['message' => 'Your temporary supplier portal session has expired.'], 401);
        }

        $access->forceFill(['last_accessed_at' => now()])->save();
        $request->attributes->set('supplier_portal_access', $access);

        return $next($request);
    }
}
