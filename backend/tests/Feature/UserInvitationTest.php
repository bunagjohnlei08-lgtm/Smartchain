<?php

namespace Tests\Feature;

use App\Mail\UserInvitationMail;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Models\UserInvitation;
use App\Models\Warehouse;
use App\Support\UserInvitations;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use RuntimeException;
use Tests\Concerns\CompletesOtpLogin;
use Tests\TestCase;

class UserInvitationTest extends TestCase
{
    use CompletesOtpLogin, RefreshDatabase;

    private const PASSWORD = 'Activate123';

    private Role $adminRole;
    private Role $plantManagerRole;
    private Role $qaRole;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->plantManagerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $this->qaRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id, 'status' => 'Active']);

        $this->admin = $this->user($this->adminRole);
        Mail::fake();
    }

    private function user(Role $role, array $attributes = []): User
    {
        return User::factory()->create(array_merge([
            'role_id' => $role->id,
            'status' => 'ACTIVE',
            'employee_id' => 'EMP-'.fake()->unique()->numerify('####'),
        ], $attributes));
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Invited Person',
            'email' => 'invitee@example.com',
            'role_id' => $this->qaRole->id,
        ], $overrides);
    }

    /** Plaintext token of the most recent invitation email sent to $email. */
    private function sentToken(string $email): string
    {
        $mail = Mail::sent(UserInvitationMail::class, fn (UserInvitationMail $mail) => $mail->hasTo($email))->last();
        $this->assertNotNull($mail, 'No invitation email was sent.');
        parse_str((string) parse_url($mail->activationUrl, PHP_URL_QUERY), $query);

        return $query['token'];
    }

    /** @return array{0: User, 1: string} */
    private function invite(array $overrides = []): array
    {
        $response = $this->actingAs($this->admin)->postJson('/api/users', $this->payload($overrides))->assertCreated();
        $user = User::findOrFail($response->json('id'));

        return [$user, $this->sentToken($user->email)];
    }

    private function accept(string $token, string $password = self::PASSWORD, ?string $confirmation = null)
    {
        return $this->postJson('/api/invitations/accept', [
            'token' => $token,
            'password' => $password,
            'password_confirmation' => $confirmation ?? $password,
        ]);
    }

    private function assertNoAuditRowContains(string $needle): void
    {
        foreach (AuditLog::query()->get() as $log) {
            $this->assertStringNotContainsString($needle, json_encode($log->getAttributes()));
        }
    }

    // ---- Admin creation ---------------------------------------------------

    public function test_admin_creates_pending_user_without_password_and_invitation_is_emailed(): void
    {
        $response = $this->actingAs($this->admin)->postJson('/api/users', $this->payload())
            ->assertCreated()
            ->assertJsonPath('status', 'PENDING')
            ->assertJsonPath('invitation.sent', true)
            ->assertJsonPath('message', 'User created. An activation invitation has been sent to their email.')
            ->assertJsonMissingPath('password')
            ->assertJsonMissingPath('token');

        $user = User::findOrFail($response->json('id'));
        $this->assertSame('PENDING', $user->status);
        $this->assertNull($user->password);
        $this->assertNotNull($user->invited_at);
        $this->assertNull($user->activated_at);
        $this->assertNull($user->email_verified_at);

        $invitation = UserInvitation::query()->where('user_id', $user->id)->sole();
        $this->assertSame($this->admin->id, $invitation->invited_by);
        $this->assertNull($invitation->consumed_at);
        $this->assertNull($invitation->revoked_at);
        $this->assertEqualsWithDelta(now()->addHours(48)->timestamp, $invitation->expires_at->timestamp, 5);

        Mail::assertSent(UserInvitationMail::class, 1);
        $token = $this->sentToken('invitee@example.com');
        $this->assertSame(64, strlen($token));
        $this->assertStringNotContainsString($token, $response->getContent());

        // Only the hash is stored.
        $this->assertSame(hash('sha256', $token), $invitation->token_hash);
        $this->assertDatabaseMissing('user_invitations', ['token_hash' => $token]);

        $this->assertDatabaseHas('audit_logs', ['action' => 'USER_CREATED', 'actor_user_id' => $this->admin->id]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'INVITATION_SENT',
            'module' => 'User Management',
            'status' => 'SUCCESS',
            'actor_user_id' => $this->admin->id,
            'details' => 'Account invitation sent; expires in 48 hours',
        ]);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'USER_INVITED']);
    }

    public function test_invitation_email_contains_activation_link_and_no_password(): void
    {
        config(['invitations.frontend_url' => 'https://app.example.test']);
        [, $token] = $this->invite();

        $mail = Mail::sent(UserInvitationMail::class)->last();
        $this->assertSame('https://app.example.test/activate-account?token='.$token, $mail->activationUrl);

        $html = $mail->render();
        $this->assertStringContainsString('SmartChain', $html);
        $this->assertStringContainsString('Invited Person', $html);
        $this->assertStringContainsString('expires in 48 hours', $html);
        $this->assertStringContainsString('create your own password', $html);
        $this->assertStringContainsString('safely ignore', $html);
    }

    public function test_admin_cannot_supply_password_or_force_status_during_creation(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', $this->payload(['password' => 'admin-chosen-1']))
            ->assertUnprocessable()->assertJsonValidationErrors('password');

        $this->actingAs($this->admin)->postJson('/api/users', $this->payload(['status' => 'ACTIVE']))
            ->assertUnprocessable()->assertJsonValidationErrors('status');

        $this->actingAs($this->admin)->postJson('/api/users', $this->payload([
            'activated_at' => now()->toIso8601String(),
            'email_verified_at' => now()->toIso8601String(),
            'invited_at' => now()->toIso8601String(),
        ]))->assertUnprocessable()->assertJsonValidationErrors(['activated_at', 'email_verified_at', 'invited_at']);

        $this->assertDatabaseMissing('users', ['email' => 'invitee@example.com']);
        Mail::assertNothingSent();
    }

    public function test_unknown_privileged_fields_are_not_mass_assigned_on_create(): void
    {
        [$user] = $this->invite(['token_hash' => str_repeat('a', 64), 'consumed_at' => now()->toIso8601String(), 'id' => 999999]);

        $this->assertNotSame(999999, $user->id);
        $this->assertDatabaseMissing('user_invitations', ['token_hash' => str_repeat('a', 64)]);
        $this->assertNull(UserInvitation::query()->where('user_id', $user->id)->sole()->consumed_at);
    }

    // ---- Employee ID generation ---------------------------------------------

    public function test_employee_id_is_generated_from_primary_key_when_not_supplied(): void
    {
        $response = $this->actingAs($this->admin)->postJson('/api/users', $this->payload())
            ->assertCreated()
            ->assertJsonPath('name', 'Invited Person')
            ->assertJsonPath('email', 'invitee@example.com')
            ->assertJsonPath('role_id', $this->qaRole->id)
            ->assertJsonPath('department_id', null)
            ->assertJsonPath('branch_id', null)
            ->assertJsonPath('status', 'PENDING');

        $user = User::findOrFail($response->json('id'));
        $expected = 'EMP-'.str_pad((string) $user->id, 3, '0', STR_PAD_LEFT);
        $this->assertSame($expected, $user->employee_id);
        $response->assertJsonPath('employee_id', $expected);
        $this->assertSame($expected, AuditLog::query()->where('action', 'USER_CREATED')->sole()->resource_label);
    }

    public function test_primary_key_remains_numeric_users_id(): void
    {
        [$user] = $this->invite();

        $this->assertSame('id', $user->getKeyName());
        $this->assertTrue($user->getIncrementing());
        $this->assertIsInt($user->getKey());
        $this->assertNotSame($user->employee_id, (string) $user->getKey());
    }

    public function test_generated_employee_ids_are_unique(): void
    {
        [$first] = $this->invite(['email' => 'first@example.com']);
        [$second] = $this->invite(['email' => 'second@example.com']);

        $this->assertNotSame($first->employee_id, $second->employee_id);
        $this->assertSame(1, User::query()->where('employee_id', $first->employee_id)->count());
        $this->assertSame(1, User::query()->where('employee_id', $second->employee_id)->count());
    }

    public function test_client_cannot_supply_employee_id(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', $this->payload(['employee_id' => 'EMP-CHOSEN']))
            ->assertUnprocessable()->assertJsonValidationErrors('employee_id');

        $this->assertDatabaseMissing('users', ['email' => 'invitee@example.com']);
        $this->assertDatabaseMissing('users', ['employee_id' => 'EMP-CHOSEN']);
        Mail::assertNothingSent();
    }

    public function test_existing_employee_ids_are_preserved(): void
    {
        $legacy = $this->user($this->qaRole, ['employee_id' => 'EMP-007']);

        $this->invite();

        $this->assertSame('EMP-007', $legacy->fresh()->employee_id);
    }

    public function test_generated_employee_id_skips_value_already_held_by_legacy_record(): void
    {
        // A hand-typed legacy ID that equals the next account's derived value.
        $legacy = $this->user($this->qaRole);
        $derived = 'EMP-'.str_pad((string) ($legacy->id + 1), 3, '0', STR_PAD_LEFT);
        $legacy->forceFill(['employee_id' => $derived])->save();

        [$user] = $this->invite();

        $this->assertSame($legacy->id + 1, $user->id);
        $this->assertSame($derived.'-2', $user->employee_id);
        $this->assertSame($derived, $legacy->fresh()->employee_id);
    }

    public function test_non_admins_and_guests_cannot_create_accounts(): void
    {
        $permission = Permission::create(['name' => 'Create Users', 'slug' => 'users.create']);
        $this->plantManagerRole->permissions()->attach($permission);
        $plantManager = $this->user($this->plantManagerRole);
        $qa = $this->user($this->qaRole);

        $this->actingAs($plantManager)->postJson('/api/users', $this->payload())->assertForbidden();
        $this->actingAs($qa)->postJson('/api/users', $this->payload())->assertForbidden();

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/users', $this->payload())->assertUnauthorized();

        $this->assertDatabaseMissing('users', ['email' => 'invitee@example.com']);
        $this->assertDatabaseCount('user_invitations', 0);
        Mail::assertNothingSent();
    }

    public function test_no_public_registration_route_exists(): void
    {
        $this->postJson('/api/register', $this->payload(['password' => self::PASSWORD]))->assertNotFound();
    }

    public function test_mail_failure_keeps_pending_account_and_reports_safely(): void
    {
        Mail::shouldReceive('to')->andThrow(new RuntimeException('SMTP connection refused'));

        $response = $this->actingAs($this->admin)->postJson('/api/users', $this->payload())
            ->assertCreated()
            ->assertJsonPath('invitation.sent', false)
            ->assertJsonPath('message', 'User created, but the invitation email could not be sent. Use Resend Invitation to try again.');
        $this->assertStringNotContainsString('SMTP', $response->getContent());

        $user = User::findOrFail($response->json('id'));
        $this->assertSame('PENDING', $user->status);
        $this->assertNull($user->password);
        $this->assertDatabaseCount('user_invitations', 1);
        $this->assertDatabaseHas('audit_logs', ['action' => 'INVITATION_SENT', 'status' => 'FAILED']);

        // A retry of the same create does not duplicate the account.
        $this->actingAs($this->admin)->postJson('/api/users', $this->payload())
            ->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->assertSame(1, User::query()->where('email', 'invitee@example.com')->count());
    }

    // ---- Validation endpoint -----------------------------------------------

    public function test_valid_invitation_can_be_validated_with_minimal_details(): void
    {
        [, $token] = $this->invite();

        $response = $this->postJson('/api/invitations/validate', ['token' => $token])
            ->assertOk()
            ->assertJsonPath('valid', true)
            ->assertJsonPath('name', 'Invited Person')
            ->assertJsonPath('email', 'invitee@example.com');

        $this->assertSame(['valid', 'name', 'email', 'expires_at'], array_keys($response->json()));
    }

    public function test_random_invalid_token_is_rejected_safely(): void
    {
        $this->invite();

        $this->postJson('/api/invitations/validate', ['token' => bin2hex(random_bytes(32))])
            ->assertUnprocessable()
            ->assertJsonPath('valid', false)
            ->assertJsonMissingPath('email');

        $this->postJson('/api/invitations/validate', [])->assertUnprocessable()->assertJsonValidationErrors('token');
        $this->accept(bin2hex(random_bytes(32)))->assertUnprocessable()->assertJsonPath('valid', false);
    }

    public function test_expired_token_is_rejected(): void
    {
        [$user, $token] = $this->invite();

        $this->travel(49)->hours();

        $this->postJson('/api/invitations/validate', ['token' => $token])->assertUnprocessable();
        $this->accept($token)->assertUnprocessable();
        $this->assertSame('PENDING', $user->fresh()->status);
    }

    public function test_revoked_token_is_rejected(): void
    {
        [$user, $token] = $this->invite();
        UserInvitation::query()->where('user_id', $user->id)->update(['revoked_at' => now()]);

        $this->postJson('/api/invitations/validate', ['token' => $token])->assertUnprocessable();
        $this->accept($token)->assertUnprocessable();
        $this->assertNull($user->fresh()->password);
    }

    public function test_invitation_for_non_pending_user_cannot_be_used(): void
    {
        [$user, $token] = $this->invite();
        // e.g. an ACTIVE or SUSPENDED account must never be re-credentialed by a link.
        $user->forceFill(['status' => 'ACTIVE', 'password' => 'Existing123'])->save();

        $this->postJson('/api/invitations/validate', ['token' => $token])->assertUnprocessable();
        $this->accept($token)->assertUnprocessable();
        $this->assertTrue(Hash::check('Existing123', $user->fresh()->password));
    }

    // ---- Acceptance ----------------------------------------------------------

    public function test_password_confirmation_and_policy_are_enforced(): void
    {
        [$user, $token] = $this->invite();

        $this->accept($token, self::PASSWORD, 'Different123')->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->accept($token, 'short1')->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->accept($token, 'lettersonly')->assertUnprocessable()->assertJsonValidationErrors('password');

        $this->assertSame('PENDING', $user->fresh()->status);
        $this->assertNull($user->fresh()->password);
    }

    public function test_valid_acceptance_activates_account_without_issuing_token(): void
    {
        [$user, $token] = $this->invite();

        $response = $this->accept($token)
            ->assertOk()
            ->assertJsonPath('message', 'Your account has been activated. You can now sign in.')
            ->assertJsonMissingPath('token');
        $this->assertSame(['message'], array_keys($response->json()));

        $user->refresh();
        $this->assertSame('ACTIVE', $user->status);
        $this->assertNotNull($user->password);
        $this->assertNotSame(self::PASSWORD, $user->password);
        $this->assertTrue(Hash::check(self::PASSWORD, $user->password));
        $this->assertNotNull($user->activated_at);
        $this->assertNotNull($user->email_verified_at);
        $this->assertNotNull(UserInvitation::query()->where('user_id', $user->id)->sole()->consumed_at);

        // No Sanctum token is created by activation.
        $this->assertSame(0, $user->tokens()->count());
        $this->assertDatabaseCount('personal_access_tokens', 0);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'ACCOUNT_ACTIVATED',
            'module' => 'Authentication',
            'actor_user_id' => $user->id,
        ]);

        // Normal two-step login (password, then emailed code) now works.
        $this->loginWithOtp($user->email, self::PASSWORD)
            ->assertOk()->assertJsonStructure(['token']);
    }

    public function test_pending_invited_user_cannot_log_in_before_activation(): void
    {
        [$user] = $this->invite();

        $this->postJson('/api/login', ['email' => $user->email, 'password' => ''])->assertUnprocessable();
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'anything123'])->assertUnauthorized();
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_same_token_cannot_be_reused(): void
    {
        [$user, $token] = $this->invite();

        $this->accept($token)->assertOk();
        $hash = $user->fresh()->password;

        $this->postJson('/api/invitations/validate', ['token' => $token])->assertUnprocessable();
        $this->accept($token, 'Replayed456')->assertUnprocessable();

        $this->assertSame($hash, $user->fresh()->password);
        $this->assertSame(1, AuditLog::query()->where('action', 'ACCOUNT_ACTIVATED')->count());
    }

    public function test_activation_revokes_stray_tokens_of_pending_account(): void
    {
        [$user, $token] = $this->invite();
        $user->createToken('stray');

        $this->accept($token)->assertOk();

        $this->assertSame(0, $user->tokens()->count());
    }

    // ---- Resend --------------------------------------------------------------

    public function test_resend_revokes_old_invitation_and_old_token_stops_working(): void
    {
        [$user, $oldToken] = $this->invite();
        $oldInvitation = UserInvitation::query()->where('user_id', $user->id)->sole();

        $this->travel(5)->minutes();
        $this->actingAs($this->admin)->postJson("/api/users/{$user->id}/resend-invitation")
            ->assertOk()->assertJsonPath('sent', true)->assertJsonMissingPath('token');

        $newToken = $this->sentToken($user->email);
        $this->assertNotSame($oldToken, $newToken);
        $this->assertNotNull($oldInvitation->fresh()->revoked_at);
        $this->assertSame(2, UserInvitation::query()->where('user_id', $user->id)->count());
        $this->assertSame(1, UserInvitation::query()->where('user_id', $user->id)->outstanding()->count());
        $this->assertTrue($user->fresh()->invited_at->greaterThan($user->invited_at));

        $this->postJson('/api/invitations/validate', ['token' => $oldToken])->assertUnprocessable();
        $this->accept($oldToken)->assertUnprocessable();

        $this->accept($newToken)->assertOk();
        $this->assertSame('ACTIVE', $user->fresh()->status);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'INVITATION_RESENT',
            'status' => 'SUCCESS',
            'details' => 'Account invitation resent; expires in 48 hours',
        ]);
    }

    public function test_resend_for_active_user_is_rejected(): void
    {
        $active = $this->user($this->qaRole);

        $this->actingAs($this->admin)->postJson("/api/users/{$active->id}/resend-invitation")->assertUnprocessable();

        $this->assertDatabaseCount('user_invitations', 0);
        Mail::assertNothingSent();
    }

    public function test_non_admin_cannot_resend(): void
    {
        [$user] = $this->invite();
        foreach (['users.update', 'users.create', 'users.approve'] as $slug) {
            $this->plantManagerRole->permissions()->attach(Permission::create(['name' => $slug, 'slug' => $slug]));
        }
        $plantManager = $this->user($this->plantManagerRole);

        $this->actingAs($plantManager)->postJson("/api/users/{$user->id}/resend-invitation")->assertForbidden();
        $this->app['auth']->forgetGuards();
        $this->postJson("/api/users/{$user->id}/resend-invitation")->assertUnauthorized();

        $this->assertSame(1, UserInvitation::query()->where('user_id', $user->id)->count());
    }

    public function test_resend_has_per_account_cooldown(): void
    {
        [$user] = $this->invite();

        $this->actingAs($this->admin)->postJson("/api/users/{$user->id}/resend-invitation")->assertOk();
        $this->actingAs($this->admin)->postJson("/api/users/{$user->id}/resend-invitation")
            ->assertStatus(429)->assertHeader('Retry-After');

        $this->assertSame(2, UserInvitation::query()->where('user_id', $user->id)->count());
    }

    // ---- Admin status bypass ---------------------------------------------------

    public function test_admin_cannot_activate_invited_account_without_the_link(): void
    {
        [$user] = $this->invite();

        $this->actingAs($this->admin)->postJson("/api/users/{$user->id}/approve")->assertUnprocessable();
        $this->actingAs($this->admin)->postJson("/api/users/{$user->id}/activate")->assertUnprocessable();
        $this->actingAs($this->admin)->putJson("/api/users/{$user->id}", ['status' => 'ACTIVE'])
            ->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->actingAs($this->admin)->putJson("/api/users/{$user->id}", ['password' => 'AdminSet123'])
            ->assertUnprocessable();

        // Injected activation fields on a generic update are ignored.
        $this->actingAs($this->admin)->putJson("/api/users/{$user->id}", [
            'name' => 'Renamed Invitee',
            'activated_at' => now()->toIso8601String(),
            'email_verified_at' => now()->toIso8601String(),
        ])->assertOk();

        $user->refresh();
        $this->assertSame('Renamed Invitee', $user->name);
        $this->assertSame('PENDING', $user->status);
        $this->assertNull($user->password);
        $this->assertNull($user->activated_at);
        $this->assertNull($user->email_verified_at);
    }

    // ---- Rate limiting and audit hygiene ----------------------------------------

    public function test_public_invitation_endpoints_are_rate_limited(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/invitations/validate', ['token' => bin2hex(random_bytes(32))])->assertUnprocessable();
        }

        $this->postJson('/api/invitations/validate', ['token' => bin2hex(random_bytes(32))])->assertStatus(429);
        $this->accept(bin2hex(random_bytes(32)))->assertStatus(429);
    }

    public function test_audit_log_never_contains_password_or_token(): void
    {
        [$user, $firstToken] = $this->invite();
        $this->travel(2)->minutes();
        $this->actingAs($this->admin)->postJson("/api/users/{$user->id}/resend-invitation")->assertOk();
        $token = $this->sentToken($user->email);
        $this->accept($token)->assertOk();

        foreach ([$firstToken, $token, UserInvitations::hashToken($firstToken), UserInvitations::hashToken($token), self::PASSWORD, $user->fresh()->password] as $secret) {
            $this->assertNoAuditRowContains($secret);
        }
        $this->assertSame(
            ['USER_CREATED', 'INVITATION_SENT', 'INVITATION_RESENT', 'ACCOUNT_ACTIVATED'],
            AuditLog::query()->orderBy('id')->pluck('action')->all(),
        );
    }
}
