<?php

namespace App\Mail\Transport;

use App\Support\BrevoTransactionalMail;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\AbstractTransport;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;
use Symfony\Component\Mime\MessageConverter;

/**
 * Laravel mail transport backed by the Brevo HTTPS API.
 *
 * Registered as the "brevo" driver in AppServiceProvider, so existing
 * Mail::to(...)->send(new SomeMailable(...)) call sites, Blade templates,
 * subjects and Mail::fake() in tests all keep working unchanged while the
 * bytes leave over HTTPS instead of SMTP.
 */
class BrevoApiTransport extends AbstractTransport
{
    public function __construct(private readonly BrevoTransactionalMail $brevo)
    {
        parent::__construct();
    }

    protected function doSend(SentMessage $message): void
    {
        $email = MessageConverter::toEmail($message->getOriginalMessage());

        $messageId = $this->brevo->send(
            to: $this->addresses($email->getTo()),
            subject: (string) $email->getSubject(),
            htmlContent: $this->body($email->getHtmlBody()) ?? $this->body($email->getTextBody()) ?? '',
            textContent: $this->body($email->getTextBody()),
            cc: $this->addresses($email->getCc()),
            bcc: $this->addresses($email->getBcc()),
            replyTo: $this->addresses($email->getReplyTo())[0] ?? null,
            sender: $this->sender($email),
        );

        if ($messageId !== '') {
            $message->setMessageId($messageId);
        }
    }

    public function __toString(): string
    {
        return 'brevo+api://api.brevo.com';
    }

    /**
     * Brevo's configured sender wins: it must be a sender Brevo has verified,
     * and a mismatched From is rejected. Fall back to the message's own From.
     *
     * @return array{email: string, name?: string}|null
     */
    private function sender(Email $email): ?array
    {
        if (filled(BrevoTransactionalMail::senderEmail())) {
            return null; // The service fills in the configured sender.
        }

        return $this->addresses($email->getFrom())[0] ?? null;
    }

    /**
     * @param  array<int, Address>  $addresses
     * @return list<array{email: string, name?: string}>
     */
    private function addresses(array $addresses): array
    {
        return array_values(array_map(
            fn (Address $address) => array_filter(
                ['email' => $address->getAddress(), 'name' => $address->getName()],
                fn (string $value) => $value !== '',
            ),
            $addresses,
        ));
    }

    /** Email bodies may be a string, a stream, or absent. */
    private function body(mixed $body): ?string
    {
        if (is_resource($body)) {
            $body = stream_get_contents($body, offset: 0);
        }

        return ($body === null || $body === false || $body === '') ? null : (string) $body;
    }
}
