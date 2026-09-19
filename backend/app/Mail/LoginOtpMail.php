<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Login verification code. Sent synchronously (not queued): the plaintext
 * code must never be persisted, and a queued job payload would store it in
 * the jobs table.
 */
class LoginOtpMail extends Mailable
{
    use Queueable;

    public function __construct(
        public readonly string $name,
        public readonly string $code,
        public readonly int $expiresInMinutes,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'SmartChain login verification code',
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.login-otp',
        );
    }
}
