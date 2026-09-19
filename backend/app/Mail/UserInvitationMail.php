<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Support\Carbon;

/**
 * Account activation invitation. Sent synchronously (not queued): the
 * plaintext token must never be persisted, and a queued job payload would
 * store it in the jobs table.
 */
class UserInvitationMail extends Mailable
{
    use Queueable;

    public function __construct(
        public readonly string $name,
        public readonly string $activationUrl,
        public readonly Carbon $expiresAt,
        public readonly int $expiresInHours,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Activate your SmartChain account',
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.user-invitation',
        );
    }
}
