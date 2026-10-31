<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ReportAccessAuthorization;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ReportAccessController extends Controller
{
    public function confirm(Request $request, ReportAccessAuthorization $authorizations): JsonResponse
    {
        $user = $request->user();
        abort_unless($user?->isAdmin() || $user?->isPlantManager() || $user?->isQaSupervisor(), 403);
        $validated = $request->validate([
            'password' => ['required', 'string', 'max:1024'],
            'resource' => ['required', 'string', 'max:160'],
            'format' => ['required', 'string', 'max:16'],
            'action' => ['required', Rule::in(['DOWNLOAD', 'EXPORT', 'PREVIEW', 'PRINT'])],
        ]);
        $rateKeys = ['report-access:user:'.$user->id, 'report-access:ip:'.$request->ip()];
        abort_if(collect($rateKeys)->contains(fn (string $key) => RateLimiter::tooManyAttempts($key, 5)), 429, 'Too many incorrect password attempts. Please try again later.');

        if (! filled($user->password) || ! Hash::check($validated['password'], $user->password)) {
            foreach ($rateKeys as $key) RateLimiter::hit($key, 300);
            AuditLogger::failure('REPORT_ACCESS_VERIFICATION_FAILED', AuditLogger::MODULE_REPORTS, [
                'actor' => $user, 'resource_type' => 'Report', 'resource_label' => $validated['resource'],
                'metadata' => ['format' => strtoupper($validated['format']), 'action' => $validated['action']],
            ]);
            throw ValidationException::withMessages(['password' => ['The password is incorrect.']]);
        }
        foreach ($rateKeys as $key) RateLimiter::clear($key);

        $result = $authorizations->issue($request, $validated['resource'], $validated['format'], $validated['action']);
        AuditLogger::success('REPORT_ACCESS_VERIFICATION_SUCCEEDED', AuditLogger::MODULE_REPORTS, [
            'actor' => $user, 'resource_type' => 'Report', 'resource_label' => $validated['resource'],
            'metadata' => ['format' => strtoupper($validated['format']), 'action' => $validated['action']],
        ]);

        return response()->json($result);
    }

    public function consume(Request $request, ReportAccessAuthorization $authorizations): JsonResponse
    {
        $validated = $request->validate([
            'resource' => ['required', 'string', 'max:160'],
            'format' => ['required', 'string', 'max:16'],
            'action' => ['required', Rule::in(['DOWNLOAD', 'EXPORT', 'PREVIEW', 'PRINT'])],
        ]);
        $authorizations->consume($request, $validated['resource'], $validated['format'], $validated['action']);

        return response()->json(['message' => 'Report action authorized.']);
    }
}
