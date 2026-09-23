<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\LoginChallenge;
use App\Models\PasswordResetChallenge;
use App\Models\Role;
use App\Models\User;
use App\Models\UserInvitation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class UserArchiveTest extends TestCase
{
    use RefreshDatabase;

    private Role $adminRole;
    private Role $userRole;

    protected function setUp(): void
    {
        parent::setUp();

        $this->adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->userRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
    }

    private function user(Role $role, array $attributes = []): User
    {
        return User::factory()->create(array_merge([
            'role_id' => $role->id,
            'status' => 'ACTIVE',
        ], $attributes));
    }

    public function test_admin_archives_user_preserves_row_and_revokes_all_live_access(): void
    {
        $admin = $this->user($this->adminRole);
        $target = $this->user($this->userRole, ['employee_id' => 'EMP-900']);
        $target->createToken('live-token');

        $login = LoginChallenge::create([
            'user_id' => $target->id,
            'challenge_id' => (string) Str::uuid(),
            'otp_hash' => Hash::make('123456'),
            'expires_at' => now()->addMinutes(10),
            'max_attempts' => 5,
        ]);
        $reset = PasswordResetChallenge::create([
            'user_id' => $target->id,
            'flow_id' => (string) Str::uuid(),
            'otp_hash' => Hash::make('654321'),
            'otp_expires_at' => now()->addMinutes(10),
            'max_attempts' => 5,
        ]);
        $invitation = UserInvitation::create([
            'user_id' => $target->id,
            'token_hash' => hash('sha256', 'archive-invitation'),
            'expires_at' => now()->addDay(),
            'invited_by' => $admin->id,
        ]);
        DB::table('sessions')->insert([
            'id' => 'archive-session',
            'user_id' => $target->id,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'test',
            'payload' => '',
            'last_activity' => now()->timestamp,
        ]);

        $this->actingAs($admin)->deleteJson("/api/users/{$target->id}")
            ->assertOk()
            ->assertJsonPath('message', 'User account deleted successfully.');

        $this->assertDatabaseHas('users', ['id' => $target->id, 'status' => 'ARCHIVED']);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $target->id]);
        $this->assertDatabaseMissing('sessions', ['user_id' => $target->id]);
        $this->assertNotNull($login->fresh()->revoked_at);
        $this->assertNotNull($reset->fresh()->revoked_at);
        $this->assertNotNull($invitation->fresh()->revoked_at);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'USER_ARCHIVED',
            'actor_user_id' => $admin->id,
            'resource_id' => (string) $target->id,
            'resource_label' => 'EMP-900',
        ]);
    }

    public function test_non_admin_and_guest_cannot_archive_users(): void
    {
        $admin = $this->user($this->adminRole);
        $ordinary = $this->user($this->userRole);
        $target = $this->user($this->userRole);

        $this->actingAs($ordinary)->deleteJson("/api/users/{$target->id}")->assertForbidden();
        $this->app['auth']->forgetGuards();
        $this->deleteJson("/api/users/{$target->id}")->assertUnauthorized();
        $this->assertSame('ACTIVE', $target->fresh()->status);
        $this->assertSame('ACTIVE', $admin->fresh()->status);
    }

    public function test_admin_cannot_archive_self_or_last_active_admin(): void
    {
        $admin = $this->user($this->adminRole);
        $otherAdmin = $this->user($this->adminRole);

        $this->actingAs($admin)->deleteJson("/api/users/{$admin->id}")
            ->assertUnprocessable()
            ->assertJsonPath('message', 'You cannot archive your own account.');

        // Simulate a stale authenticated principal whose database account was
        // disabled after authentication. The database invariant still wins.
        $this->actingAs($otherAdmin);
        DB::table('users')->where('id', $otherAdmin->id)->update(['status' => 'SUSPENDED']);
        $this->deleteJson("/api/users/{$admin->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('user');

        $this->assertSame('ACTIVE', $admin->fresh()->status);
    }

    public function test_admin_can_archive_another_admin_when_an_active_admin_remains(): void
    {
        $actor = $this->user($this->adminRole);
        $target = $this->user($this->adminRole);

        $this->actingAs($actor)->deleteJson("/api/users/{$target->id}")->assertOk();

        $this->assertSame('ARCHIVED', $target->fresh()->status);
        $this->assertSame('ACTIVE', $actor->fresh()->status);
    }

    public function test_archived_users_are_hidden_cannot_login_and_cannot_be_archived_twice(): void
    {
        $admin = $this->user($this->adminRole);
        $target = $this->user($this->userRole, [
            'email' => 'archived@example.test',
            'password' => Hash::make('ValidPassword123'),
        ]);

        $this->actingAs($admin)->deleteJson("/api/users/{$target->id}")->assertOk();
        $this->actingAs($admin)->deleteJson("/api/users/{$target->id}")->assertConflict();
        $this->actingAs($admin)->postJson("/api/users/{$target->id}/activate")->assertForbidden();
        $this->actingAs($admin)->putJson("/api/users/{$target->id}", ['status' => 'ACTIVE'])->assertForbidden();
        $this->actingAs($admin)->getJson('/api/users')->assertOk()->assertJsonMissing(['id' => $target->id]);

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/login', [
            'email' => 'archived@example.test',
            'password' => 'ValidPassword123',
        ])->assertForbidden();
    }

    public function test_password_reset_and_archive_actions_are_visible_and_filterable_to_admin(): void
    {
        $admin = $this->user($this->adminRole);
        foreach (['PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_OTP_SENT', 'PASSWORD_RESET_OTP_FAILED', 'PASSWORD_RESET_COMPLETED', 'USER_ARCHIVED'] as $action) {
            AuditLog::create([
                'actor_user_id' => $admin->id,
                'actor_name' => $admin->name,
                'action' => $action,
                'module' => $action === 'USER_ARCHIVED' ? 'User Management' : 'Authentication',
                'status' => 'SUCCESS',
            ]);
        }

        $options = $this->actingAs($admin)->getJson('/api/admin/audit-logs/options')->assertOk();
        foreach (['PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_OTP_SENT', 'PASSWORD_RESET_OTP_FAILED', 'PASSWORD_RESET_COMPLETED', 'USER_ARCHIVED'] as $action) {
            $this->assertContains($action, $options->json('actions'));
            $this->actingAs($admin)->getJson('/api/admin/audit-logs?action='.$action)
                ->assertOk()
                ->assertJsonCount(1, 'data')
                ->assertJsonPath('data.0.action', $action);
        }
    }
}
