<?php

namespace Tests\Feature;

use App\Exceptions\BrevoDeliveryException;
use App\Mail\LoginOtpMail;
use App\Mail\UserInvitationMail;
use App\Support\BrevoTransactionalMail;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * The Brevo HTTPS transport. These tests never touch the database: they cover
 * the delivery mechanism only, while the OTP and invitation behaviour around
 * it stays covered by LoginOtpTest and UserInvitationTest.
 */
class BrevoTransactionalMailTest extends TestCase
{
    private const FAKE_KEY = 'test-brevo-key-not-a-real-secret';

    private const OTP = '482913';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'mail.default' => 'brevo',
            'services.brevo.api_key' => self::FAKE_KEY,
            'services.brevo.sender_email' => 'no-reply@smartchain.test',
            'services.brevo.sender_name' => 'SmartChain',
        ]);
        Mail::purge('brevo');
    }

    private function otpMail(): LoginOtpMail
    {
        return new LoginOtpMail(name: 'Dana Cruz', code: self::OTP, expiresInMinutes: 5);
    }

    public function test_otp_email_is_posted_to_the_brevo_api_with_the_rendered_template(): void
    {
        Http::fake([BrevoTransactionalMail::ENDPOINT => Http::response(['messageId' => '<abc@brevo>'], 201)]);

        Mail::to('dana@example.test')->send($this->otpMail());

        Http::assertSent(function (Request $request) {
            $body = $request->data();

            $this->assertSame(BrevoTransactionalMail::ENDPOINT, $request->url());
            $this->assertSame('POST', $request->method());
            $this->assertSame(self::FAKE_KEY, $request->header('api-key')[0]);

            $this->assertSame('no-reply@smartchain.test', $body['sender']['email']);
            $this->assertSame('SmartChain', $body['sender']['name']);
            $this->assertSame([['email' => 'dana@example.test']], $body['to']);
            $this->assertSame('SmartChain login verification code', $body['subject']);

            // The existing Blade template is reused, not a second copy.
            $this->assertStringContainsString(self::OTP, $body['htmlContent']);
            $this->assertStringContainsString('SmartChain sign-in verification', $body['htmlContent']);
            $this->assertStringContainsString('expires in 5 minutes', $body['htmlContent']);

            return true;
        });
    }

    public function test_invitation_email_keeps_its_subject_and_activation_link(): void
    {
        Http::fake([BrevoTransactionalMail::ENDPOINT => Http::response(['messageId' => '<def@brevo>'], 201)]);

        Mail::to('invitee@example.test')->send(new UserInvitationMail(
            name: 'Dana Cruz',
            activationUrl: 'https://app.smartchain.test/activate-account?token=opaque-token',
            expiresAt: Carbon::parse('2026-01-02 03:04:05'),
            expiresInHours: 48,
        ));

        Http::assertSent(function (Request $request) {
            $body = $request->data();

            $this->assertSame('Activate your SmartChain account', $body['subject']);
            $this->assertStringContainsString('activate-account?token=opaque-token', $body['htmlContent']);
            $this->assertStringContainsString('Welcome to SmartChain', $body['htmlContent']);

            return true;
        });
    }

    public function test_a_rejected_message_fails_loudly_without_leaking_the_api_key_or_the_code(): void
    {
        Http::fake([BrevoTransactionalMail::ENDPOINT => Http::response(
            ['code' => 'invalid_parameter', 'message' => 'sender is not valid'],
            400,
        )]);
        $log = Log::spy();

        try {
            Mail::to('dana@example.test')->send($this->otpMail());
            $this->fail('A rejected Brevo response must not be reported as delivered.');
        } catch (\Throwable $exception) {
            $this->assertNoSecrets((string) $exception);
        }

        $log->shouldHaveReceived('error')->withArgs(function (string $message, array $context) {
            $flat = $message.' '.json_encode($context);

            $this->assertNoSecrets($flat);
            $this->assertSame(400, $context['status']);
            $this->assertSame('invalid_parameter', $context['brevo_code']);

            return true;
        });
    }

    public function test_an_unreachable_brevo_fails_without_leaking_the_api_key(): void
    {
        Http::fake(fn () => throw new ConnectionException(
            'cURL error 28: Operation timed out',
        ));

        try {
            Mail::to('dana@example.test')->send($this->otpMail());
            $this->fail('An unreachable Brevo must not be reported as delivered.');
        } catch (\Throwable $exception) {
            $this->assertNoSecrets((string) $exception);
        }
    }

    /**
     * Stack traces truncate string arguments to 15 characters, so a partial
     * key would still be a leak; check the prefix too.
     */
    private function assertNoSecrets(string $haystack): void
    {
        $this->assertStringNotContainsString(self::FAKE_KEY, $haystack);
        $this->assertStringNotContainsString(substr(self::FAKE_KEY, 0, 15), $haystack);
        $this->assertStringNotContainsString(self::OTP, $haystack);
    }

    public function test_a_missing_api_key_is_refused_before_any_request_is_made(): void
    {
        config(['services.brevo.api_key' => null]);
        Http::fake();

        $this->expectException(BrevoDeliveryException::class);

        try {
            app(BrevoTransactionalMail::class)->send(
                to: [['email' => 'dana@example.test']],
                subject: 'SmartChain login verification code',
                htmlContent: '<p>'.self::OTP.'</p>',
            );
        } finally {
            Http::assertNothingSent();
        }
    }

    public function test_configuration_reports_whether_brevo_can_send(): void
    {
        $this->assertTrue(BrevoTransactionalMail::isConfigured());

        config(['services.brevo.api_key' => '']);
        $this->assertFalse(BrevoTransactionalMail::isConfigured());
    }
}
