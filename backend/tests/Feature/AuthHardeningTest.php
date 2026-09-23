<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\CompletesOtpLogin;
use Tests\TestCase;

class AuthHardeningTest extends TestCase
{
    use CompletesOtpLogin, RefreshDatabase;

    private Role $adminRole;
    private Role $plantManagerRole;
    private Role $qaSupervisorRole;
    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();

        $this->adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->plantManagerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $this->qaSupervisorRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $this->branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
    }

    private function user(Role $role, array $attributes = []): User
    {
        return User::factory()->create(array_merge([
            'password' => 'correct-password',
            'role_id' => $role->id,
            'branch_id' => $this->branch->id,
            'status' => 'ACTIVE',
        ], $attributes));
    }

    private function bearer(User $user): array
    {
        return ['Authorization' => 'Bearer '.$user->createToken('test')->plainTextToken];
    }

    /** Each call resolves the token afresh instead of reusing a cached guard user. */
    private function asToken(array $headers): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders($headers);
    }

    private function login(User $user)
    {
        return $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'correct-password',
        ]);
    }

    public function test_active_user_with_correct_password_can_log_in(): void
    {
        $user = $this->user($this->plantManagerRole);

        $this->loginWithOtp($user->email, 'correct-password')->assertOk()
            ->assertJsonPath('message', 'Login successful')
            ->assertJsonStructure(['token', 'user' => ['id', 'role']]);
    }

    public function test_pending_user_login_is_rejected(): void
    {
        $user = $this->user($this->plantManagerRole, ['status' => 'PENDING']);

        $this->login($user)->assertForbidden()->assertJsonMissingPath('token');
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_suspended_user_login_is_rejected(): void
    {
        $user = $this->user($this->plantManagerRole, ['status' => 'SUSPENDED']);

        $this->login($user)->assertForbidden()->assertJsonMissingPath('token');
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_unexpected_status_login_is_rejected(): void
    {
        $user = $this->user($this->plantManagerRole, ['status' => 'DISABLED']);

        $this->login($user)->assertForbidden()
            ->assertExactJson(['message' => 'Your account is not active.']);
        $this->assertSame(0, $user->tokens()->count());
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'LOGIN_FAILED',
            'status' => 'FAILED',
            'actor_user_id' => $user->id,
        ]);
        $this->assertSame(
            'ACCOUNT_INACTIVE',
            AuditLog::query()->where('action', 'LOGIN_FAILED')->sole()->metadata['reason'] ?? null
        );
    }

    public function test_active_user_can_access_protected_api(): void
    {
        $user = $this->user($this->qaSupervisorRole);

        $this->asToken($this->bearer($user))->getJson('/api/profile')->assertOk();
    }

    public function test_login_route_is_not_behind_status_middleware(): void
    {
        $this->postJson('/api/login', [
            'email' => 'nobody@example.com',
            'password' => 'wrong',
        ])->assertUnauthorized();
    }

    public function test_token_stops_working_and_is_revoked_once_account_is_not_active(): void
    {
        $user = $this->user($this->plantManagerRole);
        $headers = $this->bearer($user);

        $user->forceFill(['status' => 'SUSPENDED'])->save();

        $this->asToken($headers)->getJson('/api/profile')
            ->assertUnauthorized()
            ->assertJsonPath('message', 'Your account is not active.');
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_status_change_to_non_active_via_update_revokes_tokens(): void
    {
        $admin = $this->user($this->adminRole);
        $target = $this->user($this->plantManagerRole);
        $targetHeaders = $this->bearer($target);

        $this->asToken($this->bearer($admin))
            ->putJson("/api/users/{$target->id}", ['status' => 'SUSPENDED'])
            ->assertOk();

        $this->assertSame(0, $target->tokens()->count());
        $this->asToken($targetHeaders)->getJson('/api/profile')->assertUnauthorized();
    }

    public function test_unrelated_profile_field_update_keeps_tokens(): void
    {
        $admin = $this->user($this->adminRole);
        $target = $this->user($this->plantManagerRole);
        $targetHeaders = $this->bearer($target);

        $this->asToken($this->bearer($admin))
            ->putJson("/api/users/{$target->id}", ['name' => 'Renamed User', 'status' => 'ACTIVE'])
            ->assertOk();

        $this->assertSame(1, $target->tokens()->count());
        $this->asToken($targetHeaders)->getJson('/api/profile')->assertOk();
    }

    public function test_role_change_revokes_tokens(): void
    {
        $admin = $this->user($this->adminRole);
        $target = $this->user($this->plantManagerRole);
        $targetHeaders = $this->bearer($target);

        $this->asToken($this->bearer($admin))
            ->putJson("/api/users/{$target->id}", ['role_id' => $this->qaSupervisorRole->id])
            ->assertOk()
            ->assertJsonPath('role.slug', 'QA_SUPERVISOR');

        $this->assertSame(0, $target->tokens()->count());
        $this->asToken($targetHeaders)->getJson('/api/profile')->assertUnauthorized();
        $this->assertDatabaseHas('audit_logs', ['action' => 'ROLE_CHANGED']);
    }

    public function test_admin_password_change_revokes_tokens(): void
    {
        $admin = $this->user($this->adminRole);
        $target = $this->user($this->plantManagerRole);
        $targetHeaders = $this->bearer($target);

        $this->asToken($this->bearer($admin))
            ->putJson("/api/users/{$target->id}", ['password' => 'BrandNewPassword123'])
            ->assertOk();

        $this->assertSame(0, $target->tokens()->count());
        $this->asToken($targetHeaders)->getJson('/api/profile')->assertUnauthorized();
    }

    public function test_own_password_change_revokes_other_sessions_and_keeps_current(): void
    {
        $user = $this->user($this->qaSupervisorRole);
        $currentHeaders = $this->bearer($user);
        $otherHeaders = $this->bearer($user);

        $this->asToken($currentHeaders)->putJson('/api/profile/password', [
            'current_password' => 'correct-password',
            'password' => 'NewPassword123',
            'password_confirmation' => 'NewPassword123',
        ])->assertOk();

        $this->assertSame(1, $user->tokens()->count());
        $this->asToken($currentHeaders)->getJson('/api/profile')->assertOk();
        $this->asToken($otherHeaders)->getJson('/api/profile')->assertUnauthorized();
    }

    public function test_permissions_through_role_uses_role_id_not_user_id(): void
    {
        $view = Permission::create(['name' => 'View Users', 'slug' => 'users.view']);
        $manage = Permission::create(['name' => 'Manage Users', 'slug' => 'users.manage']);
        $this->qaSupervisorRole->permissions()->attach($view);
        $this->adminRole->permissions()->attach($manage);

        // Make the user's id equal the ADMIN role's id so the old user-id join
        // would have returned the ADMIN permissions instead.
        $user = $this->user($this->qaSupervisorRole, ['id' => $this->adminRole->id]);
        $this->assertSame($this->adminRole->id, $user->id);

        $slugs = $user->fresh()->permissionsThroughRole()->pluck('slug')->all();

        $this->assertSame(['users.view'], $slugs);
        $this->assertSame(['users.view'], $user->fresh()->permissions->pluck('slug')->all());
    }

    public function test_sanctum_token_expiration_is_configured(): void
    {
        $this->assertSame(480, (int) config('sanctum.expiration'));
    }
}
