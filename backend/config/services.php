<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    // Transactional email transport. Railway's lower plans block outbound SMTP,
    // so login OTP and invitation email go out over the Brevo HTTPS API
    // (MAIL_MAILER=brevo). Values come from the environment only.
    'brevo' => [
        'api_key' => env('BREVO_API_KEY'),
        'sender_email' => env('BREVO_SENDER_EMAIL'),
        'sender_name' => env('BREVO_SENDER_NAME', 'SmartChain'),
    ],

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'google_maps' => [
        // Google Maps place for the Main Warehouse (Archon Nell Incorporated). The feature id
        // is the "0x…:0x…" value from the place's Share > Embed a map link.
        'main_warehouse_place' => [
            'name' => env('GOOGLE_MAPS_MAIN_WAREHOUSE_PLACE_NAME', 'Archon Nell Incorporated'),
            'feature_id' => env('GOOGLE_MAPS_MAIN_WAREHOUSE_PLACE_FEATURE_ID', '0x3397b9485ea55b87:0x2e093784a1e3763b'),
        ],
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
