<?php

namespace Tests\Feature;

use App\Mail\LoginOtpMail;
use App\Models\AuditLog;
use App\Models\LoginChallenge;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\Concerns\CompletesOtpLogin;
use Tests\TestCase;

class LoginOtpTest extends TestCase
{
    use CompletesOtpLogin, RefreshDatabase;

    private const PASSWORD = 'correct-password';

    private Role $role;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        $this->role = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
    }

    private function user(array $attributes = []): User
    {
        return User::factory()->create(array_merge([
            'password' => self::PASSWORD,
            'role_id' => $this->role->id,
            'status' => 'ACTIVE',
        ], $attributes));
    }

    /** @return array{0: string, 1: string} challenge id and emailed code */
    private function startLogin(User $user): array
    {
        $challengeId = $this->postJson('/api/login', ['email' => $user->email, 'password' => self::PASSWORD])
            ->assertOk()
            ->json('challenge_id');

        return [$challengeId, $this->lastLoginCode()];
    }

    private function verify(string $challengeId, string $code)
    {
        return $this->postJson('/api/login/verify-otp', ['challenge_id' => $challengeId, 'otp' => $code]);
    }

    private function wrongCode(string $code): string
    {
        return $code === '000000' ? '111111' : '000000';
    }

    private function assertNoAuditRowContains(string $needle): void
    {
        foreach (AuditLog::query()->get() as $log) {
            $this->assertStringNotContainsString($needle, json_encode($log->getAttributes()));
        }
    }

    public function test_correct_password_returns_challenge_and_no_token(): void
    {
        $user = $this->user();

        $response = $this->postJson('/api/login', ['email' => $user->email, 'password' => self::PASSWORD])
            ->assertOk()
            ->assertJsonPath('requires_otp', true)
            ->assertJsonPath('expires_in', 300)
            ->assertJsonMissingPath('token')
            ->assertJsonMissingPath('user')
            ->assertJsonMissingPath('otp');

        $this->assertTrue(Str::isUuid($response->json('challenge_id')));
        $this->assertSame(0, $user->tokens()->count());
        $this->assertDatabaseCount('personal_access_tokens', 0);

        $challenge = LoginChallenge::query()->sole();
        $this->assertNotSame((string) $challenge->id, $response->json('challenge_id'));
        $this->assertStringNotContainsString($this->lastLoginCode(), $response->getContent());
        $this->assertStringNotContainsString($challenge->otp_hash, $response->getContent());
    }

    public function test_code_is_emailed_as_six_digits_and_only_its_hash_is_stored(): void
    {
        $user = $this->user();
        $this->startLogin($user);

        Mail::assertSent(LoginOtpMail::class, fn (LoginOtpMail $mail) => $mail->hasTo($user->email));
        $mail = Mail::sent(LoginOtpMail::class)->sole();
        $this->assertMatchesRegularExpression('/^[0-9]{6}$/', $mail->code);

        $html = $mail->render();
        $this->assertStringContainsString($mail->code, $html);
        $this->assertStringNotContainsString(self::PASSWORD, $html);
        $this->assertSame('SmartChain login verification code', $mail->envelope()->subject);

        $challenge = LoginChallenge::query()->sole();
        $this->assertNotSame($mail->code, $challenge->otp_hash);
        $this->assertTrue(Hash::check($mail->code, $challenge->otp_hash));
        $this->assertNotNull($challenge->last_sent_at);
        $this->assertSame(5, $challenge->max_attempts);
        foreach ($challenge->getAttributes() as $value) {
            $this->assertNotSame($mail->code, (string) $value);
        }
    }

    public function test_wrong_password_and_non_active_accounts_create_no_challenge(): void
    {
        $active = $this->user();
        $this->postJson('/api/login', ['email' => $active->email, 'password' => 'wrong-password'])->assertUnauthorized();

        foreach (['PENDING', 'SUSPENDED', 'DISABLED'] as $status) {
            $user = $this->user(['status' => $status]);
            $this->postJson('/api/login', ['email' => $user->email, 'password' => self::PASSWORD])
                ->assertForbidden()
                ->assertJsonMissingPath('challenge_id');
        }

        $this->assertDatabaseCount('login_challenges', 0);
        Mail::assertNotSent(LoginOtpMail::class);
    }

    public function test_email_failure_does_not_authenticate_and_leaves_no_usable_challenge(): void
    {
        $user = $this->user();
        Mail::shouldReceive('to')->andThrow(new RuntimeException('SMTP connection refused to smtp.example'));

        $response = $this->postJson('/api/login', ['email' => $user->email, 'password' => self::PASSWORD])
            ->assertStatus(503)
            ->assertJsonMissingPath('challenge_id')
            ->assertJsonMissingPath('token');

        $this->assertStringNotContainsString('SMTP', $response->getContent());
        $this->assertSame(0, $user->tokens()->count());

        $challenge = LoginChallenge::query()->sole();
        $this->assertNotNull($challenge->revoked_at);
        $this->assertNull($challenge->last_sent_at);
        $this->assertFalse($challenge->acceptsCode());
        $this->assertDatabaseHas('audit_logs', ['action' => 'LOGIN_OTP_FAILED', 'actor_user_id' => $user->id]);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'LOGIN']);
    }

    public function test_correct_code_issues_token_and_consumes_challenge(): void
    {
        $user = $this->user();
        [$challengeId, $code] = $this->startLogin($user);

        $token = $this->verify($challengeId, $code)
            ->assertOk()
            ->assertJsonPath('message', 'Login successful')
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonPath('user.role.slug', 'PLANT_MANAGER')
            ->json('token');

        $this->assertNotEmpty($token);
        $this->assertSame(1, $user->tokens()->count());

        $challenge = LoginChallenge::query()->sole();
        $this->assertNotNull($challenge->consumed_at);
        $this->assertNotNull($challenge->verified_at);

        $this->withToken($token)->getJson('/api/profile')->assertOk();
    }

    public function test_challenge_cannot_be_replayed(): void
    {
        $user = $this->user();
        [$challengeId, $code] = $this->startLogin($user);

        $this->verify($challengeId, $code)->assertOk();
        $this->verify($challengeId, $code)
            ->assertUnprocessable()
            ->assertJsonPath('reason', 'challenge_invalid')
            ->assertJsonMissingPath('token');

        $this->assertSame(1, $user->tokens()->count());
    }

    public function test_wrong_codes_increment_attempts_and_exhaustion_revokes_challenge(): void
    {
        $user = $this->user();
        [$challengeId, $code] = $this->startLogin($user);

        for ($attempt = 1; $attempt <= 4; $attempt++) {
            $this->verify($challengeId, $this->wrongCode($code))
                ->assertUnprocessable()
                ->assertExactJson(['message' => 'The verification code is incorrect.', 'reason' => 'invalid_code']);
            $this->assertSame($attempt, LoginChallenge::query()->sole()->attempt_count);
        }

        $this->verify($challengeId, $this->wrongCode($code))
            ->assertUnprocessable()
            ->assertJsonPath('reason', 'attempts_exhausted');

        $challenge = LoginChallenge::query()->sole();
        $this->assertSame(5, $challenge->attempt_count);
        $this->assertNotNull($challenge->revoked_at);

        // Past the per-minute throttle, the correct code is still refused.
        $this->travel(61)->seconds();
        $this->verify($challengeId, $code)->assertUnprocessable()->assertJsonPath('reason', 'challenge_invalid');
        $this->assertSame(5, LoginChallenge::query()->sole()->attempt_count);
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_expired_code_is_rejected(): void
    {
        $user = $this->user();
        [$challengeId, $code] = $this->startLogin($user);

        $this->travel(6)->minutes();

        $this->verify($challengeId, $code)
            ->assertUnprocessable()
            ->assertJsonPath('reason', 'expired')
            ->assertJsonMissingPath('token');
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_invalid_challenge_ids_and_malformed_codes_are_rejected_safely(): void
    {
        $this->verify((string) Str::uuid(), '123456')
            ->assertUnprocessable()
            ->assertExactJson([
                'message' => 'This verification session is no longer valid. Please sign in again.',
                'reason' => 'challenge_invalid',
            ]);

        $this->verify('1', '123456')->assertUnprocessable()->assertJsonValidationErrors('challenge_id');

        $user = $this->user();
        [$challengeId] = $this->startLogin($user);
        foreach (['12345', '1234567', 'abcdef', '12 456'] as $bad) {
            $this->verify($challengeId, $bad)->assertUnprocessable()->assertJsonValidationErrors('otp');
        }
        $this->travel(61)->seconds(); // clear the per-challenge throttle
        $this->verify($challengeId, '')->assertJsonValidationErrors('otp');
        $this->postJson('/api/login/verify-otp', ['challenge_id' => $challengeId, 'otp' => 123456])
            ->assertJsonValidationErrors('otp');

        // Malformed input never counts as an attempt.
        $this->assertSame(0, LoginChallenge::query()->sole()->attempt_count);
    }

    public function test_user_suspended_during_challenge_cannot_verify(): void
    {
        $user = $this->user();
        [$challengeId, $code] = $this->startLogin($user);

        $user->forceFill(['status' => 'SUSPENDED'])->save();

        $this->verify($challengeId, $code)
            ->assertUnprocessable()
            ->assertJsonPath('reason', 'challenge_invalid')
            ->assertJsonMissingPath('token');

        $this->assertSame(0, $user->tokens()->count());
        $this->assertNotNull(LoginChallenge::query()->sole()->revoked_at);

        // Reactivating does not revive the challenge.
        $user->forceFill(['status' => 'ACTIVE'])->save();
        $this->verify($challengeId, $code)->assertUnprocessable();
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_new_login_revokes_previous_unfinished_challenge(): void
    {
        $user = $this->user();
        [$firstId, $firstCode] = $this->startLogin($user);
        [$secondId, $secondCode] = $this->startLogin($user);

        $this->assertNotSame($firstId, $secondId);
        $this->verify($firstId, $firstCode)->assertUnprocessable()->assertJsonPath('reason', 'challenge_invalid');
        $this->verify($secondId, $secondCode)->assertOk();
    }

    public function test_resend_respects_cooldown_and_rotates_the_code(): void
    {
        $user = $this->user();
        [$challengeId, $oldCode] = $this->startLogin($user);
        $oldHash = LoginChallenge::query()->sole()->otp_hash;

        $this->postJson('/api/login/resend-otp', ['challenge_id' => $challengeId])
            ->assertTooManyRequests()
            ->assertJsonPath('reason', 'cooldown')
            ->assertHeader('Retry-After');
        Mail::assertSentCount(1);

        $this->travel(61)->seconds();

        $this->postJson('/api/login/resend-otp', ['challenge_id' => $challengeId])
            ->assertOk()
            ->assertJsonPath('expires_in', 300)
            ->assertJsonMissingPath('otp');
        Mail::assertSentCount(2);

        $newCode = $this->lastLoginCode();
        $challenge = LoginChallenge::query()->sole();
        $this->assertNotSame($oldHash, $challenge->otp_hash);
        $this->assertSame(1, $challenge->resend_count);
        $this->assertTrue($challenge->expires_at->isFuture());

        if ($newCode !== $oldCode) {
            $this->verify($challengeId, $oldCode)->assertUnprocessable()->assertJsonPath('reason', 'invalid_code');
        }
        $this->verify($challengeId, $newCode)->assertOk()->assertJsonStructure(['token']);
    }

    public function test_resend_revives_an_expired_code_but_not_a_consumed_challenge(): void
    {
        $user = $this->user();
        [$challengeId] = $this->startLogin($user);

        $this->travel(6)->minutes();
        $this->postJson('/api/login/resend-otp', ['challenge_id' => $challengeId])->assertOk();
        $this->verify($challengeId, $this->lastLoginCode())->assertOk();

        $this->travel(61)->seconds();
        $this->postJson('/api/login/resend-otp', ['challenge_id' => $challengeId])
            ->assertUnprocessable()
            ->assertJsonPath('reason', 'challenge_invalid');
    }

    public function test_resend_does_not_reset_failed_attempts(): void
    {
        $user = $this->user();
        [$challengeId, $code] = $this->startLogin($user);

        for ($attempt = 1; $attempt <= 4; $attempt++) {
            $this->verify($challengeId, $this->wrongCode($code))->assertUnprocessable();
        }

        $this->travel(61)->seconds();
        $this->postJson('/api/login/resend-otp', ['challenge_id' => $challengeId])->assertOk();
        $newCode = $this->lastLoginCode();
        $this->assertSame(4, LoginChallenge::query()->sole()->attempt_count);

        $this->verify($challengeId, $this->wrongCode($newCode))->assertJsonPath('reason', 'attempts_exhausted');
        $this->verify($challengeId, $newCode)->assertUnprocessable()->assertJsonPath('reason', 'challenge_invalid');
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_resend_limit_per_challenge(): void
    {
        config(['login_otp.max_resends' => 2]);
        $user = $this->user();
        [$challengeId] = $this->startLogin($user);

        for ($resend = 1; $resend <= 2; $resend++) {
            $this->travel(61)->seconds();
            $this->postJson('/api/login/resend-otp', ['challenge_id' => $challengeId])->assertOk();
        }

        $this->travel(61)->seconds();
        $this->postJson('/api/login/resend-otp', ['challenge_id' => $challengeId])
            ->assertTooManyRequests()
            ->assertJsonPath('reason', 'resend_limit');
        Mail::assertSentCount(3);
    }

    public function test_resend_for_suspended_user_or_unknown_challenge_is_refused(): void
    {
        $this->postJson('/api/login/resend-otp', ['challenge_id' => (string) Str::uuid()])
            ->assertUnprocessable()->assertJsonPath('reason', 'challenge_invalid');

        $user = $this->user();
        [$challengeId] = $this->startLogin($user);
        $user->forceFill(['status' => 'SUSPENDED'])->save();

        $this->travel(61)->seconds();
        $this->postJson('/api/login/resend-otp', ['challenge_id' => $challengeId])
            ->assertUnprocessable()->assertJsonPath('reason', 'challenge_invalid');
        Mail::assertSentCount(1);
    }

    public function test_resend_email_failure_invalidates_challenge(): void
    {
        $user = $this->user();
        [$challengeId, $code] = $this->startLogin($user);

        $this->travel(61)->seconds();
        Mail::shouldReceive('to')->andThrow(new RuntimeException('SMTP down'));

        $this->postJson('/api/login/resend-otp', ['challenge_id' => $challengeId])
            ->assertStatus(503)->assertJsonPath('reason', 'delivery_failed');

        $this->verify($challengeId, $code)->assertUnprocessable()->assertJsonPath('reason', 'challenge_invalid');
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_challenge_start_is_limited_per_account(): void
    {
        $user = $this->user();

        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->startLogin($user);
        }

        $this->postJson('/api/login', ['email' => $user->email, 'password' => self::PASSWORD])
            ->assertTooManyRequests()
            ->assertJsonMissingPath('challenge_id');
        Mail::assertSentCount(5);
    }

    public function test_verify_endpoint_is_rate_limited_per_ip(): void
    {
        for ($attempt = 1; $attempt <= 10; $attempt++) {
            $this->verify((string) Str::uuid(), '123456')->assertUnprocessable();
        }

        $this->verify((string) Str::uuid(), '123456')->assertTooManyRequests();
    }

    public function test_verify_endpoint_is_rate_limited_per_challenge_across_ips(): void
    {
        $user = $this->user();
        [$challengeId, $code] = $this->startLogin($user);
        config(['login_otp.max_attempts' => 50]);
        LoginChallenge::query()->update(['max_attempts' => 50]);

        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->withServerVariables(['REMOTE_ADDR' => "192.0.2.{$attempt}"]);
            $this->verify($challengeId, $this->wrongCode($code))->assertUnprocessable();
        }

        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.99']);
        $this->verify($challengeId, $code)->assertTooManyRequests();
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_resend_endpoint_is_rate_limited_per_ip(): void
    {
        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->postJson('/api/login/resend-otp', ['challenge_id' => (string) Str::uuid()])->assertUnprocessable();
        }

        $this->postJson('/api/login/resend-otp', ['challenge_id' => (string) Str::uuid()])->assertTooManyRequests();
    }

    public function test_login_success_is_audited_only_after_code_verification_without_secrets(): void
    {
        $user = $this->user();
        [$challengeId, $code] = $this->startLogin($user);

        $this->assertDatabaseHas('audit_logs', ['action' => 'LOGIN_OTP_SENT', 'actor_user_id' => $user->id]);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'LOGIN']);

        $this->verify($challengeId, $this->wrongCode($code))->assertUnprocessable();
        $failure = AuditLog::query()->where('action', 'LOGIN_OTP_FAILED')->sole();
        $this->assertSame('INVALID_CODE', $failure->metadata['reason']);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'LOGIN']);

        $token = $this->verify($challengeId, $code)->assertOk()->json('token');

        $this->assertSame(1, AuditLog::query()->where('action', 'LOGIN')->where('status', 'SUCCESS')->count());

        $hash = LoginChallenge::query()->sole()->otp_hash;
        $this->assertNoAuditRowContains($code);
        $this->assertNoAuditRowContains($hash);
        $this->assertNoAuditRowContains($token);
        $this->assertNoAuditRowContains(self::PASSWORD);
        $this->assertNoAuditRowContains($challengeId);
    }
}
