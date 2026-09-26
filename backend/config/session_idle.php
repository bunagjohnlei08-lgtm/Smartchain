<?php

return [
    'timeouts' => [
        'ADMIN' => 20,
        'PLANT_MANAGER' => 30,
        'QA_SUPERVISOR' => 30,
    ],

    // Unknown authenticated roles receive the shortest timeout rather than
    // silently bypassing idle enforcement.
    'default_timeout_minutes' => 20,
    'warning_minutes' => 2,
];
