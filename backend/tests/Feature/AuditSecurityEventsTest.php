<?php

namespace Tests\Feature;

use App\Mail\UserInvitationMail;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\LoginChallenge;
use App\Models\Role;
use App\Models\User;
use App\Models\UserInvitation;
use App\Models\Warehouse;
use App\Support\AuditLogger;
use App\Support\UserInvitations;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CompletesOtpLogin;
use Tests\TestCase;

/**
 * Canonical security audit events: OTP verification/expiry, invitation
 * sent/expired, account enable/disable, password change, and the read-only,
 * secret-free guarantees of the audit trail.
 */
class AuditSecurityEventsTest extends TestCase
{
    use CompletesOtpLogin, RefreshDatabase;

    private const PASSWORD = 'correct-password';

    private Role $adminRole;
    private Role $qaRole;
    private Role $plantManagerRole;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        $this->adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->qaRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $this->plantManagerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id, 'status' => 'Active']);
    }

    private function user(Role $role, array $attributes = []): User
    {
        return User::factory()->create(array_merge([
            'role_id' => $role->id,
            'status' => 'ACTIVE',
            'password' => self::PASSWORD,
            'employee_id' => 'EMP-'.fake()->unique()->numerify('####'),
        ], $attributes));
    }

    /** @return array{0: string, 1: string} challenge id and emailed code */
    private function startLogin(User $user): array
    {
        $challengeId = $this->postJson('/api/login', ['email' => $user->email, 'password' => self::PASSWORD])
            ->assertOk()->json('challenge_id');

        return [$challengeId, $this->lastLoginCode()];
    }

    private function verify(string $challengeId, string $code)
    {
        return $this->postJson('/api/login/verify-otp', ['challenge_id' => $challengeId, 'otp' => $code]);
    }

    private function assertNoAuditRowContains(string $needle): void
    {
        foreach (AuditLog::query()->get() as $log) {
            $this->assertStringNotContainsString($needle, json_encode($log->getAttributes()));
        }
    }

    // ---- Authentication ------------------------------------------------------

    public function test_verified_code_records_otp_verified_then_login(): void
    {
        $user = $this->user($this->qaRole);
        [$challengeId, $code] = $this->startLogin($user);

        $token = $this->verify($challengeId, $code)->assertOk()->json('token');

        $this->assertSame(
            ['LOGIN_OTP_SENT', 'LOGIN_OTP_VERIFIED', 'LOGIN'],
            AuditLog::query()->orderBy('id')->pluck('action')->all(),
        );
        $verified = AuditLog::query()->where('action', 'LOGIN_OTP_VERIFIED')->sole();
        $this->assertSame('SUCCESS', $verified->status);
        $this->assertSame('Authentication', $verified->module);
        $this->assertSame($user->id, $verified->actor_user_id);

        $sent = AuditLog::query()->where('action', 'LOGIN_OTP_SENT')->sole();
        $this->assertNull($sent->metadata);

        $hash = LoginChallenge::query()->sole()->otp_hash;
        foreach ([$code, $hash, $challengeId, $token, self::PASSWORD] as $secret) {
            $this->assertNoAuditRowContains($secret);
        }
    }

    public function test_wrong_code_is_otp_failed_and_not_verified(): void
    {
        $user = $this->user($this->qaRole);
        [$challengeId, $code] = $this->startLogin($user);

        $this->verify($challengeId, $code === '000000' ? '111111' : '000000')->assertUnprocessable();

        $failure = AuditLog::query()->where('action', 'LOGIN_OTP_FAILED')->sole();
        $this->assertSame('FAILED', $failure->status);
        $this->assertSame('Invalid login verification code', $failure->details);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'LOGIN_OTP_VERIFIED']);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'LOGIN']);
    }

    public function test_expired_code_is_recorded_as_otp_expired_not_failed(): void
    {
        $user = $this->user($this->qaRole);
        [$challengeId, $code] = $this->startLogin($user);

        $this->travel(6)->minutes();
        $this->verify($challengeId, $code)->assertUnprocessable()->assertJsonPath('reason', 'expired');

        $expired = AuditLog::query()->where('action', 'LOGIN_OTP_EXPIRED')->sole();
        $this->assertSame('EXPIRED', $expired->status);
        $this->assertSame('Authentication', $expired->module);
        $this->assertSame('Login verification code expired', $expired->details);
        $this->assertSame($user->id, $expired->actor_user_id);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'LOGIN_OTP_FAILED']);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'LOGIN_OTP_VERIFIED']);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'LOGIN']);

        $hash = LoginChallenge::query()->sole()->otp_hash;
        foreach ([$code, $hash, $challengeId, self::PASSWORD] as $secret) {
            $this->assertNoAuditRowContains($secret);
        }
    }

    public function test_rate_limited_login_is_recorded_as_blocked(): void
    {
        $user = $this->user($this->qaRole);
        foreach (range(1, 5) as $ignored) {
            $this->postJson('/api/login', ['email' => $user->email, 'password' => 'Wr0ng-Secret!'])->assertUnauthorized();
        }

        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'Wr0ng-Secret!'])->assertTooManyRequests();

        $blocked = AuditLog::query()->where('status', 'BLOCKED')->sole();
        $this->assertSame('LOGIN_FAILED', $blocked->action);
        $this->assertSame('RATE_LIMITED', $blocked->metadata['reason']);
        $this->assertSame(5, AuditLog::query()->where('action', 'LOGIN_FAILED')->where('status', 'FAILED')->count());
        $this->assertNoAuditRowContains('Wr0ng-Secret!');

        RateLimiter::clear('login-account:'.hash('sha256', $user->email));
    }

    // ---- Invitations ---------------------------------------------------------

    public function test_expired_invitation_is_recorded_once_when_actually_presented(): void
    {
        $admin = $this->user($this->adminRole);
        $userId = $this->actingAs($admin)->postJson('/api/users', [
            'name' => 'Invited Person',
            'email' => 'invitee@example.com',
            'employee_id' => 'EMP-5001',
            'role_id' => $this->qaRole->id,
        ])->assertCreated()->json('id');

        $mail = Mail::sent(UserInvitationMail::class)->last();
        parse_str((string) parse_url($mail->activationUrl, PHP_URL_QUERY), $query);
        $token = $query['token'];

        // Merely passing the expiry time records nothing.
        $this->travel(49)->hours();
        $this->assertDatabaseMissing('audit_logs', ['action' => 'INVITATION_EXPIRED']);

        $this->postJson('/api/invitations/validate', ['token' => $token])->assertUnprocessable();
        $this->postJson('/api/invitations/validate', ['token' => $token])->assertUnprocessable();
        $this->postJson('/api/invitations/accept', [
            'token' => $token, 'password' => 'Activate123', 'password_confirmation' => 'Activate123',
        ])->assertUnprocessable();

        $invitation = UserInvitation::query()->where('user_id', $userId)->sole();
        $expired = AuditLog::query()->where('action', 'INVITATION_EXPIRED')->sole();
        $this->assertSame('EXPIRED', $expired->status);
        $this->assertSame('User Management', $expired->module);
        $this->assertSame('UserInvitation', $expired->resource_type);
        $this->assertSame((string) $invitation->id, $expired->resource_id);
        $this->assertSame('EMP-5001', $expired->resource_label);
        $this->assertSame('PENDING', User::findOrFail($userId)->status);

        foreach ([$token, UserInvitations::hashToken($token), 'Activate123'] as $secret) {
            $this->assertNoAuditRowContains($secret);
        }
    }

    public function test_revoked_or_unknown_invitation_tokens_are_not_recorded_as_expired(): void
    {
        $this->postJson('/api/invitations/validate', ['token' => bin2hex(random_bytes(32))])->assertUnprocessable();

        $pending = $this->user($this->qaRole, ['status' => 'PENDING', 'password' => null]);
        [$invitation, $token] = UserInvitations::issue($pending, null);
        $invitation->forceFill(['revoked_at' => now()])->save();
        $this->travel(49)->hours();

        $this->postJson('/api/invitations/validate', ['token' => $token])->assertUnprocessable();

        $this->assertDatabaseMissing('audit_logs', ['action' => 'INVITATION_EXPIRED']);
    }

    // ---- Account status and RBAC -------------------------------------------

    public function test_status_change_through_user_update_records_disable_and_enable(): void
    {
        $admin = $this->user($this->adminRole);
        $target = $this->user($this->qaRole, ['employee_id' => 'EMP-0100']);

        $this->actingAs($admin)->putJson("/api/users/{$target->id}", ['status' => 'SUSPENDED'])->assertOk();
        $this->actingAs($admin)->putJson("/api/users/{$target->id}", ['status' => 'ACTIVE'])->assertOk();

        $this->assertSame(
            ['ACCOUNT_DISABLED', 'ACCOUNT_ENABLED'],
            AuditLog::query()->orderBy('id')->pluck('action')->all(),
        );
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'ACCOUNT_DISABLED', 'status' => 'SUCCESS', 'resource_label' => 'EMP-0100',
            'details' => 'Changed status from ACTIVE to SUSPENDED', 'actor_user_id' => $admin->id,
        ]);
    }

    public function test_admin_approval_is_account_enabled_not_invitation_activation(): void
    {
        $admin = $this->user($this->adminRole);
        $pending = $this->user($this->qaRole, ['status' => 'PENDING']);

        $this->actingAs($admin)->postJson("/api/users/{$pending->id}/approve")->assertOk();

        $this->assertDatabaseHas('audit_logs', ['action' => 'ACCOUNT_ENABLED', 'details' => 'Changed status from PENDING to ACTIVE']);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'ACCOUNT_ACTIVATED']);
    }

    public function test_role_change_is_recorded_only_after_a_successful_update(): void
    {
        $admin = $this->user($this->adminRole);
        $target = $this->user($this->qaRole);

        $this->actingAs($admin)->putJson("/api/users/{$target->id}", [
            'role_id' => $this->plantManagerRole->id,
            'email' => 'not-an-email',
        ])->assertUnprocessable();
        $this->assertDatabaseMissing('audit_logs', ['action' => 'ROLE_CHANGED']);

        $this->actingAs($admin)->putJson("/api/users/{$target->id}", ['role_id' => $this->plantManagerRole->id])->assertOk();
        $this->assertSame(1, AuditLog::query()->where('action', 'ROLE_CHANGED')->where('status', 'SUCCESS')->count());
    }

    // ---- Password change -----------------------------------------------------

    public function test_own_password_change_is_recorded_without_credentials(): void
    {
        $user = $this->user($this->qaRole, ['employee_id' => 'EMP-0200']);
        Sanctum::actingAs($user);

        $this->putJson('/api/profile/password', [
            'current_password' => 'wrong-password',
            'password' => 'New-Passw0rd',
            'password_confirmation' => 'New-Passw0rd',
        ])->assertUnprocessable();
        $this->putJson('/api/profile/password', [
            'current_password' => self::PASSWORD,
            'password' => 'New-Passw0rd',
            'password_confirmation' => 'Mismatch-1',
        ])->assertUnprocessable();
        $this->assertDatabaseMissing('audit_logs', ['action' => 'PASSWORD_CHANGED']);

        $this->putJson('/api/profile/password', [
            'current_password' => self::PASSWORD,
            'password' => 'New-Passw0rd',
            'password_confirmation' => 'New-Passw0rd',
        ])->assertOk();

        $log = AuditLog::query()->where('action', 'PASSWORD_CHANGED')->sole();
        $this->assertSame('SUCCESS', $log->status);
        $this->assertSame('Authentication', $log->module);
        $this->assertSame('Password changed', $log->details);
        $this->assertSame($user->id, $log->actor_user_id);
        $this->assertSame('EMP-0200', $log->resource_label);

        foreach ([self::PASSWORD, 'New-Passw0rd', 'Mismatch-1', $user->fresh()->password] as $secret) {
            $this->assertNoAuditRowContains($secret);
        }
    }

    // ---- Read-only API and response safety -----------------------------------

    public function test_non_admin_cannot_read_audit_logs(): void
    {
        $this->actingAs($this->user($this->qaRole))->getJson('/api/admin/audit-logs')->assertForbidden();
        $this->actingAs($this->user($this->plantManagerRole))->getJson('/api/admin/audit-logs/options')->assertForbidden();
    }

    public function test_audit_logs_have_no_write_routes_even_for_admins(): void
    {
        $admin = $this->user($this->adminRole);
        AuditLogger::success('LOGIN', AuditLogger::MODULE_AUTH, ['actor' => $admin]);
        $log = AuditLog::query()->sole();
        $payload = ['action' => 'TAMPERED', 'module' => 'Authentication', 'status' => 'SUCCESS'];

        $this->actingAs($admin)->postJson('/api/admin/audit-logs', $payload)->assertStatus(405);
        foreach (['putJson', 'patchJson', 'deleteJson'] as $method) {
            $this->actingAs($admin)->{$method}('/api/admin/audit-logs', $payload)->assertStatus(405);
            $this->assertContains(
                $this->actingAs($admin)->{$method}("/api/admin/audit-logs/{$log->id}", $payload)->status(),
                [404, 405],
            );
        }

        $this->assertSame(1, AuditLog::query()->count());
        $this->assertDatabaseHas('audit_logs', ['id' => $log->id, 'action' => 'LOGIN']);
    }

    public function test_status_filter_accepts_new_statuses_and_rejects_unknown(): void
    {
        $admin = $this->user($this->adminRole);
        AuditLogger::log('LOGIN_OTP_EXPIRED', AuditLogger::MODULE_AUTH, ['status' => AuditLog::STATUS_EXPIRED]);
        AuditLogger::log('LOGIN_FAILED', AuditLogger::MODULE_AUTH, ['status' => AuditLog::STATUS_BLOCKED]);

        $this->actingAs($admin)->getJson('/api/admin/audit-logs?status=EXPIRED')
            ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.action', 'LOGIN_OTP_EXPIRED');
        $this->actingAs($admin)->getJson('/api/admin/audit-logs?status=BLOCKED')
            ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.action', 'LOGIN_FAILED');
        $this->actingAs($admin)->getJson('/api/admin/audit-logs?status=BOGUS')
            ->assertUnprocessable()->assertJsonValidationErrors('status');
    }

    public function test_sensitive_keys_are_scrubbed_on_write_and_on_read(): void
    {
        $admin = $this->user($this->adminRole);
        $keys = [
            'password', 'password_confirmation', 'secret', 'token', 'api_key', 'otp', 'otp_code',
            'access_token', 'refresh_token', 'authorization', 'cookie', 'session', 'signature', 'remember',
        ];
        $metadata = ['reason' => 'kept'];
        foreach ($keys as $key) {
            $metadata[$key] = "leak-{$key}";
        }

        AuditLogger::success('USER_UPDATED', AuditLogger::MODULE_USERS, ['metadata' => $metadata]);
        $this->assertSame(['reason' => 'kept'], AuditLog::query()->sole()->metadata);

        // A row that bypassed the logger is still sanitised in the API response.
        AuditLog::query()->insert([
            'action' => 'LEGACY', 'module' => 'Authentication', 'status' => 'SUCCESS',
            'metadata' => json_encode(['ok' => 1, 'nested' => ['Authorization' => 'Bearer leak-raw', 'otp_code' => '123456']]),
            'created_at' => now(),
        ]);

        $response = $this->actingAs($admin)->getJson('/api/admin/audit-logs?action=LEGACY')->assertOk();
        $response->assertJsonPath('data.0.metadata', ['ok' => 1, 'nested' => []]);

        $body = $this->actingAs($admin)->getJson('/api/admin/audit-logs')->getContent();
        foreach ($keys as $key) {
            $this->assertStringNotContainsString("leak-{$key}", $body);
        }
        $this->assertStringNotContainsString('leak-raw', $body);
        $this->assertStringNotContainsString('123456', $body);
    }
}
