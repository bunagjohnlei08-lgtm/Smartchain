<?php

namespace Tests\Feature;

use App\Mail\LoginOtpMail;
use App\Mail\PasswordResetOtpMail;
use App\Models\AuditLog;
use App\Models\LoginChallenge;
use App\Models\PasswordResetChallenge;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    private const OLD_PASSWORD = 'OldPassword123';
    private const NEW_PASSWORD = 'NewPassword@456';
    private const GENERIC = 'If an account exists, a verification code has been sent to the registered email.';

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
            'email' => 'reset@example.test',
            'password' => self::OLD_PASSWORD,
            'status' => 'ACTIVE',
            'role_id' => $this->role->id,
        ], $attributes));
    }

    /** @return array{0: string, 1: string} */
    private function requestReset(User $user): array
    {
        $flow = $this->postJson('/api/forgot-password', ['email' => strtoupper($user->email)])
            ->assertOk()->assertJsonPath('message', self::GENERIC)->json('flow_id');
        $mail = Mail::sent(PasswordResetOtpMail::class)->last();
        $this->assertNotNull($mail);
        return [$flow, $mail->code];
    }

    private function grant(string $flow, string $code): string
    {
        return $this->postJson('/api/forgot-password/verify', ['flow_id' => $flow, 'otp' => $code])
            ->assertOk()->assertJsonMissingPath('token')->json('reset_token');
    }

    private function reset(string $grant, string $password = self::NEW_PASSWORD, ?string $confirmation = null)
    {
        return $this->postJson('/api/forgot-password/reset', [
            'reset_token' => $grant,
            'password' => $password,
            'password_confirmation' => $confirmation ?? $password,
        ]);
    }

    private function assertNoAuditContains(string $secret): void
    {
        foreach (AuditLog::all() as $log) {
            $this->assertStringNotContainsString($secret, json_encode($log->getAttributes()));
        }
    }

    public function test_request_is_enumeration_safe_and_only_eligible_accounts_receive_mail(): void
    {
        $active = $this->user();
        $existing = $this->postJson('/api/forgot-password', ['email' => $active->email])->assertOk();
        $missing = $this->postJson('/api/forgot-password', ['email' => 'missing@example.test'])->assertOk();
        $pending = $this->user(['email' => 'pending@example.test', 'status' => 'PENDING', 'password' => null]);
        $ineligible = $this->postJson('/api/forgot-password', ['email' => $pending->email])->assertOk();

        foreach ([$existing, $missing, $ineligible] as $response) {
            $response->assertJsonPath('message', self::GENERIC)->assertJsonStructure(['flow_id', 'expires_in', 'resend_available_in']);
            $this->assertTrue(Str::isUuid($response->json('flow_id')));
        }
        Mail::assertSent(PasswordResetOtpMail::class, 1);
        $this->assertDatabaseCount('password_reset_challenges', 1);
    }

    public function test_request_is_rate_limited_by_ip_and_email_context(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/forgot-password', ['email' => "missing{$i}@example.test"])->assertOk();
        }
        $this->postJson('/api/forgot-password', ['email' => 'another@example.test'])->assertTooManyRequests();
    }

    public function test_otp_is_six_digits_emailed_and_only_hash_is_stored(): void
    {
        $user = $this->user();
        [, $code] = $this->requestReset($user);
        $challenge = PasswordResetChallenge::sole();

        $this->assertMatchesRegularExpression('/^[0-9]{6}$/', $code);
        $this->assertNotSame($code, $challenge->otp_hash);
        $this->assertTrue(Hash::check($code, $challenge->otp_hash));
        $this->assertNotNull($challenge->last_sent_at);
        $this->assertSame('SmartChain Password Reset Verification Code', Mail::sent(PasswordResetOtpMail::class)->last()->envelope()->subject);
        foreach ($challenge->getAttributes() as $value) $this->assertNotSame($code, (string) $value);
    }

    public function test_wrong_otp_increments_attempts_and_exhaustion_blocks_correct_code(): void
    {
        [$flow, $code] = $this->requestReset($this->user());
        $wrong = $code === '000000' ? '111111' : '000000';
        for ($attempt = 1; $attempt <= 4; $attempt++) {
            $this->postJson('/api/forgot-password/verify', ['flow_id' => $flow, 'otp' => $wrong])
                ->assertUnprocessable()->assertJsonPath('reason', 'invalid_code');
            $this->assertSame($attempt, PasswordResetChallenge::sole()->attempt_count);
        }
        $this->postJson('/api/forgot-password/verify', ['flow_id' => $flow, 'otp' => $wrong])
            ->assertUnprocessable()->assertJsonPath('reason', 'attempts_exhausted');
        $this->travel(61)->seconds();
        $this->postJson('/api/forgot-password/verify', ['flow_id' => $flow, 'otp' => $code])
            ->assertUnprocessable()->assertJsonPath('reason', 'challenge_invalid');
    }

    public function test_expired_or_already_verified_otp_cannot_be_used(): void
    {
        [$flow, $code] = $this->requestReset($this->user());
        $this->travel(6)->minutes();
        $this->postJson('/api/forgot-password/verify', ['flow_id' => $flow, 'otp' => $code])
            ->assertUnprocessable()->assertJsonPath('reason', 'expired');

        $this->travelBack();
        PasswordResetChallenge::query()->delete();
        [$flow, $code] = $this->requestReset(User::sole());
        $this->grant($flow, $code);
        $this->postJson('/api/forgot-password/verify', ['flow_id' => $flow, 'otp' => $code])
            ->assertUnprocessable()->assertJsonPath('reason', 'challenge_invalid');
    }

    public function test_resend_enforces_cooldown_rotates_code_and_has_a_limit(): void
    {
        config(['password_reset.max_resends' => 2]);
        [$flow, $oldCode] = $this->requestReset($this->user());
        $this->postJson('/api/forgot-password/resend', ['flow_id' => $flow])
            ->assertTooManyRequests()->assertJsonPath('reason', 'cooldown');

        for ($i = 1; $i <= 2; $i++) {
            $this->travel(61)->seconds();
            $this->postJson('/api/forgot-password/resend', ['flow_id' => $flow])->assertOk();
        }
        $newCode = Mail::sent(PasswordResetOtpMail::class)->last()->code;
        if ($newCode !== $oldCode) {
            $this->postJson('/api/forgot-password/verify', ['flow_id' => $flow, 'otp' => $oldCode])
                ->assertUnprocessable()->assertJsonPath('reason', 'invalid_code');
        }
        $this->travel(61)->seconds();
        $this->postJson('/api/forgot-password/resend', ['flow_id' => $flow])
            ->assertTooManyRequests()->assertJsonPath('reason', 'resend_limit');
    }

    public function test_successful_verification_creates_high_entropy_hash_only_single_purpose_grant(): void
    {
        $user = $this->user();
        [$flow, $code] = $this->requestReset($user);
        $grant = $this->grant($flow, $code);
        $challenge = PasswordResetChallenge::sole();

        $this->assertSame(64, strlen($grant));
        $this->assertSame(hash('sha256', $grant), $challenge->reset_token_hash);
        $this->assertNotSame($grant, $challenge->reset_token_hash);
        $this->assertTrue($challenge->reset_token_expires_at->isFuture());
        $this->withToken($grant)->getJson('/api/profile')->assertUnauthorized();
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_expired_or_unverified_grant_cannot_reset_password(): void
    {
        $user = $this->user();
        $this->reset(str_repeat('a', 64))->assertUnprocessable()->assertJsonPath('reason', 'reset_token_invalid');
        [$flow, $code] = $this->requestReset($user);
        $grant = $this->grant($flow, $code);
        $this->travel(11)->minutes();
        $this->reset($grant)->assertUnprocessable()->assertJsonPath('reason', 'reset_token_invalid');
        $this->assertTrue(Hash::check(self::OLD_PASSWORD, $user->fresh()->password));
    }

    public function test_valid_reset_changes_password_revokes_tokens_and_login_challenges_and_cannot_replay(): void
    {
        $user = $this->user();
        $oldToken = $user->createToken('existing')->plainTextToken;
        LoginChallenge::create([
            'user_id' => $user->id, 'challenge_id' => (string) Str::uuid(), 'otp_hash' => Hash::make('123456'),
            'expires_at' => now()->addMinutes(5), 'max_attempts' => 5,
        ]);
        [$flow, $code] = $this->requestReset($user);
        $grant = $this->grant($flow, $code);

        $this->reset($grant)->assertOk()->assertExactJson(['message' => 'Password reset successfully.']);
        $this->assertFalse(Hash::check(self::OLD_PASSWORD, $user->fresh()->password));
        $this->assertTrue(Hash::check(self::NEW_PASSWORD, $user->fresh()->password));
        $this->withToken($oldToken)->getJson('/api/profile')->assertUnauthorized();
        $this->assertNotNull(LoginChallenge::sole()->revoked_at);
        $this->assertNotNull(PasswordResetChallenge::sole()->used_at);
        $this->assertNull(PasswordResetChallenge::sole()->reset_token_hash);
        $this->reset($grant)->assertUnprocessable()->assertJsonPath('reason', 'reset_token_invalid');
    }

    public function test_confirmation_and_shared_password_policy_are_enforced(): void
    {
        [$flow, $code] = $this->requestReset($this->user());
        $grant = $this->grant($flow, $code);
        $this->reset($grant, 'short1')->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->reset($grant, 'lettersonly')->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->reset($grant, 'Smartchain@Password')->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->reset($grant, 'Smartchain2026')->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->reset($grant, self::NEW_PASSWORD, 'Different@789')->assertUnprocessable()->assertJsonValidationErrors('password');
    }

    public function test_delivery_failure_leaves_no_usable_challenge_and_public_response_stays_generic(): void
    {
        $user = $this->user();
        Mail::shouldReceive('to')->andThrow(new RuntimeException('transport unavailable'));
        $response = $this->postJson('/api/forgot-password', ['email' => $user->email])
            ->assertOk()->assertJsonPath('message', self::GENERIC);
        $challenge = PasswordResetChallenge::sole();
        $this->assertNotNull($challenge->revoked_at);
        $this->assertNull($challenge->last_sent_at);
        $this->postJson('/api/forgot-password/verify', ['flow_id' => $response->json('flow_id'), 'otp' => '123456'])
            ->assertUnprocessable()->assertJsonPath('reason', 'challenge_invalid');
    }

    public function test_secrets_are_not_returned_or_audited_and_normal_login_still_requires_otp(): void
    {
        $user = $this->user();
        [$flow, $code] = $this->requestReset($user);
        $grant = $this->grant($flow, $code);
        $this->reset($grant)->assertOk()->assertJsonMissingPath('password')->assertJsonMissingPath('reset_token');

        $this->assertNoAuditContains($code);
        $this->assertNoAuditContains($grant);
        $this->assertNoAuditContains(self::NEW_PASSWORD);
        $this->assertDatabaseHas('audit_logs', ['action' => 'PASSWORD_RESET_COMPLETED', 'actor_user_id' => $user->id]);

        $this->postJson('/api/login', ['email' => $user->email, 'password' => self::OLD_PASSWORD])->assertUnauthorized();
        $this->postJson('/api/login', ['email' => $user->email, 'password' => self::NEW_PASSWORD])
            ->assertOk()->assertJsonPath('requires_otp', true)->assertJsonMissingPath('token');
        Mail::assertSent(LoginOtpMail::class);
    }
}
