<?php

namespace Tests\Concerns;

use App\Mail\LoginOtpMail;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Testing\Fakes\MailFake;
use Illuminate\Testing\TestResponse;

/**
 * Runs the full two-step login (password, then emailed code) and returns the
 * verify-otp response, which carries the token and user.
 */
trait CompletesOtpLogin
{
    protected function loginWithOtp(string $email, string $password): TestResponse
    {
        if (! Mail::getFacadeRoot() instanceof MailFake) {
            Mail::fake();
        }

        $challengeId = $this->postJson('/api/login', ['email' => $email, 'password' => $password])
            ->assertOk()
            ->assertJsonPath('requires_otp', true)
            ->json('challenge_id');

        return $this->postJson('/api/login/verify-otp', [
            'challenge_id' => $challengeId,
            'otp' => $this->lastLoginCode(),
        ]);
    }

    protected function lastLoginCode(): string
    {
        return Mail::sent(LoginOtpMail::class)->last()->code;
    }
}
