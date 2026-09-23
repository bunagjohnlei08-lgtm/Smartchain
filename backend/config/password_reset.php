<?php

return [
    'otp_expiration_minutes' => (int) env('PASSWORD_RESET_OTP_EXPIRATION_MINUTES', 5),
    'otp_max_attempts' => (int) env('PASSWORD_RESET_OTP_MAX_ATTEMPTS', 5),
    'resend_cooldown_seconds' => (int) env('PASSWORD_RESET_RESEND_COOLDOWN_SECONDS', 60),
    'max_resends' => (int) env('PASSWORD_RESET_MAX_RESENDS', 5),
    'grant_expiration_minutes' => (int) env('PASSWORD_RESET_GRANT_EXPIRATION_MINUTES', 10),
];
