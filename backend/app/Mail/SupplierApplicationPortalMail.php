<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class SupplierApplicationPortalMail extends Mailable
{
    use Queueable;

    public function __construct(
        public readonly string $subjectLine,
        public readonly string $heading,
        public readonly string $recipientName,
        public readonly string $applicationReference,
        public readonly string $messageText,
        public readonly ?string $actionUrl = null,
        public readonly ?string $meetingDate = null,
        /** @var list<string> Pre-formatted Asia/Manila option ranges. */
        public readonly array $meetingOptions = [],
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->subjectLine);
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.supplier-application-portal');
    }
}
