<?php

return [
    // Phase 6 must verify PostgreSQL concurrency and financial invariants before activation.
    'award_to_po_enabled' => filter_var(env('PROCUREMENT_AWARD_TO_PO_ENABLED', false), FILTER_VALIDATE_BOOL),
    'rfq_image_max_kb' => (int) env('RFQ_IMAGE_MAX_KB', 5120),
];
