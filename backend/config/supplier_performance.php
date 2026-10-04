<?php

$nullableNumber = static function (string $key): ?float {
    $value = env($key);

    return $value === null || $value === '' ? null : (float) $value;
};

$tiers = json_decode((string) env('SUPPLIER_PERFORMANCE_RECOGNITION_TIERS', '[]'), true);

return [
    // Intentionally unconfigured by default. Governance owners must approve and
    // set the minimum history, weights, and optional tiers before scores appear.
    'minimum_eligible_deliveries' => $nullableNumber('SUPPLIER_PERFORMANCE_MIN_DELIVERIES'),
    'weights' => [
        'on_time_delivery' => $nullableNumber('SUPPLIER_PERFORMANCE_WEIGHT_ON_TIME'),
        'fulfillment' => $nullableNumber('SUPPLIER_PERFORMANCE_WEIGHT_FULFILLMENT'),
        'qa_acceptance' => $nullableNumber('SUPPLIER_PERFORMANCE_WEIGHT_QA_ACCEPTANCE'),
        'discrepancy_free' => $nullableNumber('SUPPLIER_PERFORMANCE_WEIGHT_DISCREPANCY_FREE'),
    ],
    // JSON array example shape: [{"label":"Approved tier name","min_score":90}]
    'recognition_tiers' => is_array($tiers) ? $tiers : [],
];
