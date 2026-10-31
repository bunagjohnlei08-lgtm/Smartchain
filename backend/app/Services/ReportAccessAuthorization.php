<?php

namespace App\Services;

use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ReportAccessAuthorization
{
    public const TTL_SECONDS = 120;

    public function issue(Request $request, string $resource, string $format, string $action): array
    {
        $secret = Str::random(64);
        Cache::put($this->cacheKey($secret), [
            'user_id' => $request->user()->getKey(),
            'access_token_id' => $this->accessTokenId($request),
            'password_fingerprint' => hash('sha256', (string) $request->user()->password),
            'resource' => $resource,
            'format' => strtoupper($format),
            'action' => strtoupper($action),
        ], self::TTL_SECONDS);

        return ['authorization' => $secret, 'expires_in' => self::TTL_SECONDS];
    }

    public function consume(Request $request, string $resource, string $format, string $action): void
    {
        $secret = (string) $request->header('X-Report-Authorization');
        $payload = $secret === '' ? null : Cache::pull($this->cacheKey($secret));
        $valid = is_array($payload)
            && hash_equals((string) $payload['user_id'], (string) $request->user()->getKey())
            && hash_equals((string) $payload['access_token_id'], $this->accessTokenId($request))
            && hash_equals((string) $payload['password_fingerprint'], hash('sha256', (string) $request->user()->password))
            && hash_equals((string) $payload['resource'], $resource)
            && hash_equals((string) $payload['format'], strtoupper($format))
            && hash_equals((string) $payload['action'], strtoupper($action));

        if (! $valid) {
            AuditLogger::failure('REPORT_ACCESS_DENIED', AuditLogger::MODULE_REPORTS, [
                'actor' => $request->user(),
                'resource_type' => 'Report',
                'resource_label' => $resource,
                'metadata' => ['format' => strtoupper($format), 'action' => strtoupper($action)],
            ]);
            throw new HttpException(403, 'Password confirmation is missing, expired, already used, or does not match this report action.');
        }

        AuditLogger::success('REPORT_ACCESS_AUTHORIZATION_CONSUMED', AuditLogger::MODULE_REPORTS, [
            'actor' => $request->user(),
            'resource_type' => 'Report',
            'resource_label' => $resource,
            'metadata' => ['format' => strtoupper($format), 'action' => strtoupper($action)],
        ]);
    }

    private function accessTokenId(Request $request): string
    {
        $token = $request->user()?->currentAccessToken();

        return $token && method_exists($token, 'getKey') ? (string) $token->getKey() : 'session-guard';
    }

    private function cacheKey(string $secret): string
    {
        return 'report-access:'.hash('sha256', $secret);
    }
}
