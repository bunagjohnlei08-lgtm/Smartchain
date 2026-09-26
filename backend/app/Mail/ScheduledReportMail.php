<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** A scheduled Admin report delivered to an active Admin account. */
class ScheduledReportMail extends Mailable
{
    use Queueable;

    public function __construct(
        public readonly string $recipientName,
        public readonly string $reportName,
        public readonly int $rowCount,
        public readonly string $filename,
        private readonly string $mime,
        private readonly string $filePath,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'SmartChain Scheduled Report: '.$this->reportName);
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.scheduled-report');
    }

    /** @return array<int, Attachment> */
    public function attachments(): array
    {
        $contents = (string) file_get_contents($this->filePath);

        return [Attachment::fromData(fn () => $contents, $this->filename)->withMime($this->mime)];
    }
}
