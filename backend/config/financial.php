<?php

return [
    'enabled' => (bool) env('FINANCIAL_INTEGRATION_ENABLED', false),
    'contract_confirmed' => (bool) env('FINANCIAL_CONTRACT_CONFIRMED', false),
    'base_url' => env('FINANCIAL_BASE_URL'),
    'api_key' => env('FINANCIAL_API_KEY'),
    'request_path' => env('FINANCIAL_REQUEST_PATH', '/purchase-orders'),
    'disbursement_enabled' => (bool) env('FINANCIAL_DISBURSEMENT_ENABLED', false),
    'disbursement_request_path' => env('FINANCIAL_DISBURSEMENT_REQUEST_PATH', '/request-disbursement'),
    'disbursement_timeout_seconds' => (int) env('FINANCIAL_DISBURSEMENT_TIMEOUT_SECONDS', 60),
    'connect_timeout_seconds' => (int) env('FINANCIAL_CONNECT_TIMEOUT_SECONDS', 3),
    'request_timeout_seconds' => (int) env('FINANCIAL_REQUEST_TIMEOUT_SECONDS', 10),
];
