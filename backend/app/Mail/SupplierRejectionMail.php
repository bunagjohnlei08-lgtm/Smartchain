<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class SupplierRejectionMail extends Mailable
{
    use Queueable;

    public function __construct(
        public readonly string $supplierName,
        public readonly string $caseReference,
        public readonly string $poNumber,
        public readonly string $receivingNumber,
        public readonly string $inspectionDate,
        public readonly string $productName,
        public readonly int $deliveredQuantity,
        public readonly int $rejectedQuantity,
        public readonly string $unit,
        public readonly string $qaResult,
        public readonly string $reason,
        public readonly string $pdfFilename,
        private readonly string $pdf,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "SmartChain Rejected Item Notice – {$this->receivingNumber} / {$this->poNumber}");
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.supplier-rejection');
    }

    public function attachments(): array
    {
        return [Attachment::fromData(fn () => $this->pdf, $this->pdfFilename)->withMime('application/pdf')];
    }
}
