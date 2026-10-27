<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureSupplierAccount
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        abort_unless($user?->isSupplier() && $user->supplier_id, 403, 'Supplier account access is required.');
        // Supplier-account access remains available for renewal/completion. RFQ
        // visibility and every bid write re-check effective accreditation.
        abort_unless($user->supplier?->status === 'ACTIVE', 403, 'The supplier account is not active.');

        return $next($request);
    }
}
