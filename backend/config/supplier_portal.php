<?php

return [
    'frontend_url' => rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/'),
    'link_expiration_days' => max(1, (int) env('SUPPLIER_PORTAL_LINK_EXPIRATION_DAYS', 30)),
    'session_expiration_minutes' => max(5, (int) env('SUPPLIER_PORTAL_SESSION_EXPIRATION_MINUTES', 60)),
];
