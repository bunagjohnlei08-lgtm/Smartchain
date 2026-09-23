<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class PasswordResetOtpMail extends Mailable
{
    use Queueable;

    public function __construct(
        public readonly string $name,
        public readonly string $code,
        public readonly int $expiresInMinutes,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'SmartChain Password Reset Verification Code');
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.password-reset-otp');
    }
}
