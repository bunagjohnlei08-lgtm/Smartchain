<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * A Purchase Order emailed to its supplier, with the same PDF that
 * "Download PO (PDF)" produces attached. Sent synchronously so the caller
 * only records the send once Brevo has accepted it.
 */
class PurchaseOrderMail extends Mailable
{
    use Queueable;

    public const COMPANY_NAME = 'Archon Nell Incorporated';

    public function __construct(
        public readonly string $supplierName,
        public readonly string $poNumber,
        public readonly string $pdfFilename,
        // Private: kept out of the template's view data.
        private readonly string $pdf,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'SmartChain Purchase Order '.$this->poNumber,
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.purchase-order',
            with: ['companyName' => self::COMPANY_NAME],
        );
    }

    /** @return array<int, Attachment> */
    public function attachments(): array
    {
        return [
            Attachment::fromData(fn () => $this->pdf, $this->pdfFilename)->withMime('application/pdf'),
        ];
    }
}
