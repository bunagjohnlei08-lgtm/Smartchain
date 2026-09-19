<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Account Invitations
    |--------------------------------------------------------------------------
    |
    | Admin-created accounts start PENDING and are activated by the invitee
    | through a single-use link. Only a SHA-256 hash of each link token is
    | stored; the plaintext token exists only in the invitation email.
    |
    */

    'expiration_hours' => (int) env('INVITATION_EXPIRATION_HOURS', 48),

    // Minimum wait between two invitation emails to the same account.
    'resend_cooldown_seconds' => (int) env('INVITATION_RESEND_COOLDOWN_SECONDS', 60),

    // Base URL of the frontend that hosts the /activate-account page.
    'frontend_url' => rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/'),

];
