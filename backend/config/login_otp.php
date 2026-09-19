<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Login Email OTP
    |--------------------------------------------------------------------------
    |
    | After a correct password, ACTIVE users receive a 6-digit code by email
    | and must submit it before a Sanctum token is issued. Only a hash of each
    | code is stored; the plaintext exists only in the email.
    |
    */

    'expiration_minutes' => (int) env('LOGIN_OTP_EXPIRATION_MINUTES', 5),

    // Wrong codes allowed per challenge before it is revoked. Resending a
    // code does not reset this count.
    'max_attempts' => (int) env('LOGIN_OTP_MAX_ATTEMPTS', 5),

    // Minimum wait between two codes for the same challenge.
    'resend_cooldown_seconds' => (int) env('LOGIN_OTP_RESEND_COOLDOWN_SECONDS', 60),

    // Resends allowed per challenge; after that the user must sign in again.
    'max_resends' => (int) env('LOGIN_OTP_MAX_RESENDS', 5),

    // Challenges (code emails) one account may start per 15-minute window.
    'max_challenges_per_window' => (int) env('LOGIN_OTP_MAX_CHALLENGES_PER_WINDOW', 5),

];
