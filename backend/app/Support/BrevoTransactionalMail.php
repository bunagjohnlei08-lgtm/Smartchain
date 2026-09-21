<?php

namespace App\Support;

use App\Exceptions\BrevoDeliveryException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Sends transactional email through the Brevo HTTPS API.
 *
 * Railway's lower plans block outbound SMTP (port 587), so delivery goes over
 * HTTPS instead. Message bodies are rendered by the existing Mailables/Blade
 * templates and handed to this class as HTML; nothing here knows what an OTP
 * or an invitation token is.
 *
 * Nothing that identifies a secret is ever logged: not the API key, not the
 * HTML body (which carries the OTP or the activation link), not the request
 * headers. Failures log the HTTP status and Brevo's own error code/message
 * only, and raise BrevoDeliveryException so callers never report a send that
 * Brevo rejected as successful.
 */
class BrevoTransactionalMail
{
    public const ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

    /** Keep a login request from hanging if Brevo becomes unreachable. */
    private const TIMEOUT_SECONDS = 10;

    private const CONNECT_TIMEOUT_SECONDS = 5;

    /** True when the API key and sender address are configured. */
    public static function isConfigured(): bool
    {
        return filled(config('services.brevo.api_key')) && filled(self::senderEmail());
    }

    public static function senderEmail(): ?string
    {
        return config('services.brevo.sender_email') ?: config('mail.from.address');
    }

    public static function senderName(): ?string
    {
        return config('services.brevo.sender_name') ?: config('mail.from.name');
    }

    /**
     * Deliver one message. Returns Brevo's messageId (empty string when the
     * response omits it).
     *
     * Address lists are arrays of ['email' => string, 'name' => ?string].
     *
     * @param  list<array{email: string, name?: string|null}>  $to
     * @param  list<array{email: string, name?: string|null}>  $cc
     * @param  list<array{email: string, name?: string|null}>  $bcc
     * @param  array{email: string, name?: string|null}|null  $replyTo
     * @param  array{email: string, name?: string|null}|null  $sender
     * @param  list<array{name: string, content: string}>  $attachments  base64 content
     *
     * @throws BrevoDeliveryException when the message was not accepted
     */
    public function send(
        array $to,
        string $subject,
        string $htmlContent,
        ?string $textContent = null,
        array $cc = [],
        array $bcc = [],
        ?array $replyTo = null,
        ?array $sender = null,
        array $attachments = [],
    ): string {
        $apiKey = (string) config('services.brevo.api_key');

        if ($apiKey === '') {
            $this->fail('Brevo API key is not configured.', ['recipients' => count($to)]);
        }

        $sender ??= array_filter([
            'email' => self::senderEmail(),
            'name' => self::senderName(),
        ], fn ($value) => filled($value));

        if (blank($sender['email'] ?? null)) {
            $this->fail('Brevo sender email is not configured.', ['recipients' => count($to)]);
        }

        if ($to === []) {
            $this->fail('Brevo message has no recipients.', []);
        }

        $payload = array_filter([
            'sender' => $sender,
            'to' => $to,
            'cc' => $cc ?: null,
            'bcc' => $bcc ?: null,
            'replyTo' => $replyTo ?: null,
            'subject' => $subject,
            'htmlContent' => $htmlContent,
            'textContent' => $textContent ?: null,
            'attachment' => $attachments ?: null,
        ], fn ($value) => $value !== null);

        try {
            $response = Http::withHeaders([
                'api-key' => $apiKey,
                'accept' => 'application/json',
            ])
                ->timeout(self::TIMEOUT_SECONDS)
                ->connectTimeout(self::CONNECT_TIMEOUT_SECONDS)
                ->asJson()
                ->post(self::ENDPOINT, $payload);
        } catch (Throwable $exception) {
            // Rethrown without chaining: the original exception's stack frames
            // carry the request arguments, including the api-key header.
            $this->fail('Brevo API request failed: '.class_basename($exception), [
                'reason' => Str::limit($exception->getMessage(), 200, ''),
            ]);
        }

        if (! $response->successful()) {
            $this->fail('Brevo rejected the message.', [
                'status' => $response->status(),
                'brevo_code' => $this->errorField($response, 'code'),
                'brevo_message' => $this->errorField($response, 'message'),
            ]);
        }

        return (string) ($response->json('messageId') ?? '');
    }

    /**
     * Log a scrubbed diagnostic and abort. The context never contains the API
     * key, the message body or any recipient-visible secret.
     *
     * @param  array<string, mixed>  $context
     *
     * @throws BrevoDeliveryException
     */
    private function fail(string $message, array $context): never
    {
        Log::error('Brevo transactional email not delivered: '.$message, $context + [
            'endpoint' => self::ENDPOINT,
        ]);

        throw new BrevoDeliveryException($message);
    }

    /** Pull one field out of a Brevo error body, truncated and never trusted. */
    private function errorField(Response $response, string $key): ?string
    {
        $value = $response->json($key);

        return is_scalar($value) ? Str::limit((string) $value, 200, '') : null;
    }
}
