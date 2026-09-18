<?php

/*
|--------------------------------------------------------------------------
| Cross-Origin Resource Sharing (CORS) Configuration
|--------------------------------------------------------------------------
|
| The SPA authenticates with Sanctum personal access tokens sent in the
| Authorization header, so no cookies cross the origin boundary and
| credentialed CORS is not required. Deployed frontend origins are supplied
| through environment variables (Railway Variables in production) so that no
| deployment URL is hardcoded in source.
|
| CORS_ALLOWED_ORIGINS - comma separated list of allowed origins.
| FRONTEND_URL         - single-origin shorthand, used when the list is unset.
|
| To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
|
*/

$localOrigins = [
    'http://localhost:4173',
    'http://localhost:4173',
    'http://localhost:4173',
    'http://localhost:4173',
];

$configuredOrigins = array_values(array_filter(array_map(
    static fn(string $origin): string => rtrim(trim($origin), '/'),
    explode(',', (string) env('CORS_ALLOWED_ORIGINS', (string) env('FRONTEND_URL', '')))
)));

// The Vite dev server origins are only trusted outside of deployed
// environments; production relies solely on the configured origins.
$allowedOrigins = in_array(env('APP_ENV', 'production'), ['local', 'testing'], true)
    ? array_values(array_unique(array_merge($localOrigins, $configuredOrigins)))
    : $configuredOrigins;

return [

    'paths' => ['api/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $allowedOrigins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Accept', 'Authorization', 'Content-Type', 'X-Requested-With'],

    'exposed_headers' => ['Retry-After'],

    'max_age' => 600,

    'supports_credentials' => false,

];
