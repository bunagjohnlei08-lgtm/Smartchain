<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\PersonalAccessToken;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\CompletesOtpLogin;
use Tests\TestCase;

class SessionIdleTimeoutTest extends TestCase
{
    use CompletesOtpLogin, RefreshDatabase;

    private array $roles = [];
    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['ADMIN' => 'Admin', 'PLANT_MANAGER' => 'Plant Manager', 'QA_SUPERVISOR' => 'QA Supervisor'] as $slug => $name) {
            $this->roles[$slug] = Role::create(compact('name', 'slug'));
        }
        $this->branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
    }

    private function user(string $role, array $attributes = []): User
    {
        return User::factory()->create(array_merge([
            'password' => 'correct-password',
            'role_id' => $this->roles[$role]->id,
            'branch_id' => $this->branch->id,
            'status' => 'ACTIVE',
        ], $attributes));
    }

    /** @return array{0: array<string, string>, 1: PersonalAccessToken} */
    private function tokenSession(User $user, ?int $idleMinutes = null): array
    {
        $newToken = $user->createToken('test');
        /** @var PersonalAccessToken $token */
        $token = $newToken->accessToken;
        $token->forceFill(['last_activity_at' => now()->subMinutes($idleMinutes ?? 0)])->save();

        return [['Authorization' => 'Bearer '.$newToken->plainTextToken], $token];
    }

    private function asToken(array $headers): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders($headers);
    }

    public function test_admin_receives_twenty_minute_timeout(): void
    {
        [$headers] = $this->tokenSession($this->user('ADMIN'));
        $this->asToken($headers)->getJson('/api/session/status')->assertOk()
            ->assertJsonPath('timeout_minutes', 20)->assertJsonPath('warning_minutes', 2);
    }

    public function test_plant_manager_receives_thirty_minute_timeout(): void
    {
        [$headers] = $this->tokenSession($this->user('PLANT_MANAGER'));
        $this->asToken($headers)->getJson('/api/session/status')->assertOk()->assertJsonPath('timeout_minutes', 30);
    }

    public function test_qa_supervisor_receives_thirty_minute_timeout(): void
    {
        [$headers] = $this->tokenSession($this->user('QA_SUPERVISOR'));
        $this->asToken($headers)->getJson('/api/session/status')->assertOk()->assertJsonPath('timeout_minutes', 30);
    }

    public function test_admin_token_is_valid_before_twenty_minutes(): void
    {
        [$headers] = $this->tokenSession($this->user('ADMIN'), 19);
        $this->asToken($headers)->getJson('/api/profile')->assertOk();
    }

    public function test_admin_token_is_rejected_and_revoked_after_twenty_minutes(): void
    {
        $user = $this->user('ADMIN');
        [$headers, $token] = $this->tokenSession($user, 21);

        $this->asToken($headers)->getJson('/api/profile')->assertUnauthorized()
            ->assertExactJson(['message' => 'Your session expired due to inactivity.', 'code' => 'SESSION_IDLE_TIMEOUT'])
            ->assertHeaderMissing('Location');
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $token->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'SESSION_IDLE_TIMEOUT', 'actor_user_id' => $user->id]);
    }

    public function test_plant_manager_token_is_valid_before_thirty_minutes(): void
    {
        [$headers] = $this->tokenSession($this->user('PLANT_MANAGER'), 29);
        $this->asToken($headers)->getJson('/api/profile')->assertOk();
    }

    public function test_plant_manager_token_is_rejected_after_thirty_minutes(): void
    {
        [$headers] = $this->tokenSession($this->user('PLANT_MANAGER'), 31);
        $this->asToken($headers)->getJson('/api/profile')->assertUnauthorized()->assertJsonPath('code', 'SESSION_IDLE_TIMEOUT');
    }

    public function test_qa_token_is_valid_before_and_rejected_after_thirty_minutes(): void
    {
        $user = $this->user('QA_SUPERVISOR');
        [$valid] = $this->tokenSession($user, 29);
        [$expired] = $this->tokenSession($user, 31);
        $this->asToken($valid)->getJson('/api/profile')->assertOk();
        $this->asToken($expired)->getJson('/api/profile')->assertUnauthorized()->assertJsonPath('code', 'SESSION_IDLE_TIMEOUT');
    }

    public function test_expiring_current_token_preserves_another_session(): void
    {
        $user = $this->user('ADMIN');
        [$expired, $expiredToken] = $this->tokenSession($user, 21);
        [$valid, $validToken] = $this->tokenSession($user, 1);

        $this->asToken($expired)->getJson('/api/profile')->assertUnauthorized();
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $expiredToken->id]);
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $validToken->id]);
        $this->asToken($valid)->getJson('/api/profile')->assertOk();
    }

    public function test_activity_refreshes_only_current_token_and_ignores_client_timeout_values(): void
    {
        $user = $this->user('ADMIN');
        [$headers, $current] = $this->tokenSession($user, 10);
        [, $other] = $this->tokenSession($user, 10);
        $otherBefore = $other->last_activity_at;

        $this->asToken($headers)->postJson('/api/session/activity', [
            'token_id' => $other->id,
            'timeout_minutes' => 9999,
            'role' => 'QA_SUPERVISOR',
        ])->assertOk()->assertJsonPath('timeout_minutes', 20);

        $this->assertTrue($current->fresh()->last_activity_at->greaterThan($current->last_activity_at));
        $this->assertTrue($other->fresh()->last_activity_at->eq($otherBefore));
    }

    public function test_background_protected_request_does_not_update_human_activity(): void
    {
        [$headers, $token] = $this->tokenSession($this->user('PLANT_MANAGER'), 5);
        $before = $token->last_activity_at;

        $this->asToken($headers)->getJson('/api/profile')->assertOk();

        $this->assertTrue($token->fresh()->last_activity_at->eq($before));
        $this->assertNotNull($token->fresh()->last_used_at);
    }

    public function test_guest_cannot_call_session_endpoints(): void
    {
        $this->getJson('/api/session/status')->assertUnauthorized();
        $this->postJson('/api/session/activity')->assertUnauthorized();
    }

    public function test_inactive_account_is_blocked_before_idle_processing(): void
    {
        $user = $this->user('PLANT_MANAGER', ['status' => 'SUSPENDED']);
        [$headers] = $this->tokenSession($user, 31);
        $this->asToken($headers)->getJson('/api/session/status')->assertUnauthorized()
            ->assertJsonPath('message', 'Your account is not active.')
            ->assertJsonMissingPath('code');
    }

    public function test_sanctum_absolute_expiration_remains_authoritative(): void
    {
        config(['sanctum.expiration' => 480]);
        [$headers, $token] = $this->tokenSession($this->user('ADMIN'));
        $token->forceFill([
            'created_at' => now()->subMinutes(481),
            'last_activity_at' => now(),
        ])->save();

        $this->asToken($headers)->getJson('/api/profile')->assertUnauthorized()
            ->assertJsonMissingPath('code');
    }

    public function test_otp_login_initializes_activity_and_logout_revokes_current_token(): void
    {
        $user = $this->user('PLANT_MANAGER');
        $plainTextToken = $this->loginWithOtp($user->email, 'correct-password')->assertOk()->json('token');
        $token = PersonalAccessToken::query()->sole();

        $this->assertNotNull($token->last_activity_at);
        $this->withToken($plainTextToken)->postJson('/api/logout')->assertOk();
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $token->id]);
    }
}
