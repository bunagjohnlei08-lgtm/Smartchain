<?php

/*
|--------------------------------------------------------------------------
| Cross-Origin Resource Sharing (CORS) Configuration
|--------------------------------------------------------------------------
|
| The SPA authenticates with Sanctum personal access tokens sent in the
| Authorization header, so no cookies cross the origin boundary and
| credentialed CORS is not required. Deployed frontend origins are supplied
| through environment variables (Railway Variables in production) and merged
| with the canonical production origin below, so the deployed SPA keeps
| working even if a deployment variable is missing or mistyped.
|
| CORS_ALLOWED_ORIGINS - comma separated list of allowed origins.
| FRONTEND_URL         - single-origin shorthand, used when the list is unset.
|
| To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
|
*/

// Canonical deployed frontend. Not a secret, and treated as a floor rather
// than the only source: CORS_ALLOWED_ORIGINS still adds further origins.
$productionOrigins = [
    'https://smartchain.archonnellincorporated.com',
];

$localOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:4173',
];

$configuredOrigins = array_values(array_filter(array_map(
    static fn(string $origin): string => rtrim(trim($origin), '/'),
    explode(',', (string) env('CORS_ALLOWED_ORIGINS', (string) env('FRONTEND_URL', '')))
)));

// The Vite dev server origins are only trusted outside of deployed
// environments; production relies on the configured plus canonical origins.
$allowedOrigins = array_values(array_unique(
    in_array(env('APP_ENV', 'production'), ['local', 'testing'], true)
        ? array_merge($productionOrigins, $localOrigins, $configuredOrigins)
        : array_merge($productionOrigins, $configuredOrigins)
));

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
