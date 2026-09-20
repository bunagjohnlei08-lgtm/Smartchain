<?php

namespace Tests\Feature;

use Tests\TestCase;

class CorsTest extends TestCase
{
    private const PRODUCTION_ORIGIN = 'https://smartchain.archonnellincorporated.com';

    /**
     * The browser sends a preflight before the cross-origin POST /api/login,
     * so the OPTIONS response is what actually unblocks the login request.
     */
    public function test_preflight_from_the_production_frontend_is_allowed(): void
    {
        $response = $this->call('OPTIONS', '/api/login', [], [], [], [
            'HTTP_ORIGIN' => self::PRODUCTION_ORIGIN,
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
            'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'content-type',
        ]);

        $response->assertNoContent();
        $response->assertHeader('Access-Control-Allow-Origin', self::PRODUCTION_ORIGIN);
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function loginEndpointProvider(): array
    {
        return [
            'login' => ['/api/login'],
            'verify otp' => ['/api/login/verify-otp'],
            'resend otp' => ['/api/login/resend-otp'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('loginEndpointProvider')]
    public function test_login_endpoints_echo_the_production_origin(string $uri): void
    {
        $response = $this->postJson($uri, [], ['Origin' => self::PRODUCTION_ORIGIN]);

        $response->assertHeader('Access-Control-Allow-Origin', self::PRODUCTION_ORIGIN);
    }

    public function test_authenticated_api_routes_are_covered_by_cors(): void
    {
        // Unauthenticated on purpose: the 401 still has to carry the CORS
        // header, otherwise the browser hides the real status from the SPA.
        $response = $this->getJson('/api/profile', ['Origin' => self::PRODUCTION_ORIGIN]);

        $response->assertUnauthorized();
        $response->assertHeader('Access-Control-Allow-Origin', self::PRODUCTION_ORIGIN);
    }

    public function test_an_unknown_origin_is_not_allowed(): void
    {
        $response = $this->postJson('/api/login', [], ['Origin' => 'https://evil.example.com']);

        $this->assertFalse($response->headers->has('Access-Control-Allow-Origin'));
    }

    public function test_the_vite_dev_server_origin_is_still_allowed_outside_production(): void
    {
        $response = $this->postJson('/api/login', [], ['Origin' => 'http://localhost:5173']);

        $response->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
    }

    public function test_no_wildcard_origin_is_configured(): void
    {
        $this->assertNotContains('*', config('cors.allowed_origins'));
        $this->assertSame([], config('cors.allowed_origins_patterns'));
        $this->assertFalse(config('cors.supports_credentials'));
    }
}
