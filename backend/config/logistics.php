<?php

return [
    'source_system' => env('LOGISTICS_SOURCE_SYSTEM', 'SMARTCHAIN'),
    'public_base_url' => env('LOGISTICS_PUBLIC_BASE_URL'),
    'callback_path' => '/api/integrations/logistics/v1/status-events',
    'callback_clock_skew_seconds' => (int) env('LOGISTICS_CALLBACK_CLOCK_SKEW_SECONDS', 300),
    'connect_timeout_seconds' => (int) env('LOGISTICS_CONNECT_TIMEOUT_SECONDS', 3),
    'request_timeout_seconds' => (int) env('LOGISTICS_REQUEST_TIMEOUT_SECONDS', 10),
];
