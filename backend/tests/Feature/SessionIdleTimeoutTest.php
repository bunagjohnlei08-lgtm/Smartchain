<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\PersonalAccessToken;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
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

    public function test_admin_receives_five_minute_timeout(): void
    {
        [$headers] = $this->tokenSession($this->user('ADMIN'));
        $this->asToken($headers)->getJson('/api/session/status')->assertOk()
            ->assertJsonPath('timeout_minutes', 5)->assertJsonPath('warning_minutes', 1);
    }

    public function test_plant_manager_receives_five_minute_timeout(): void
    {
        [$headers] = $this->tokenSession($this->user('PLANT_MANAGER'));
        $this->asToken($headers)->getJson('/api/session/status')->assertOk()->assertJsonPath('timeout_minutes', 5);
    }

    public function test_qa_supervisor_receives_five_minute_timeout(): void
    {
        [$headers] = $this->tokenSession($this->user('QA_SUPERVISOR'));
        $this->asToken($headers)->getJson('/api/session/status')->assertOk()->assertJsonPath('timeout_minutes', 5);
    }

    public function test_admin_token_is_valid_before_five_minutes(): void
    {
        [$headers] = $this->tokenSession($this->user('ADMIN'), 4);
        $this->asToken($headers)->getJson('/api/profile')->assertOk();
    }

    public function test_admin_token_is_rejected_and_revoked_at_five_minutes(): void
    {
        $user = $this->user('ADMIN');
        [$headers, $token] = $this->tokenSession($user, 5);

        $this->asToken($headers)->getJson('/api/profile')->assertUnauthorized()
            ->assertExactJson(['message' => 'Your session expired due to inactivity.', 'code' => 'SESSION_IDLE_TIMEOUT'])
            ->assertHeaderMissing('Location');
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $token->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'SESSION_IDLE_TIMEOUT', 'actor_user_id' => $user->id]);
    }

    public function test_plant_manager_token_is_rejected_at_five_minutes(): void
    {
        [$headers] = $this->tokenSession($this->user('PLANT_MANAGER'), 5);
        $this->asToken($headers)->getJson('/api/profile')->assertUnauthorized()->assertJsonPath('code', 'SESSION_IDLE_TIMEOUT');
    }

    public function test_qa_token_is_valid_before_and_rejected_at_five_minutes(): void
    {
        $user = $this->user('QA_SUPERVISOR');
        [$valid] = $this->tokenSession($user, 4);
        [$expired] = $this->tokenSession($user, 5);
        $this->asToken($valid)->getJson('/api/profile')->assertOk();
        $this->asToken($expired)->getJson('/api/profile')->assertUnauthorized()->assertJsonPath('code', 'SESSION_IDLE_TIMEOUT');
    }

    public function test_expiring_current_token_preserves_another_session(): void
    {
        $user = $this->user('ADMIN');
        [$expired, $expiredToken] = $this->tokenSession($user, 5);
        [$valid, $validToken] = $this->tokenSession($user, 1);

        $this->asToken($expired)->getJson('/api/profile')->assertUnauthorized();
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $expiredToken->id]);
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $validToken->id]);
        $this->asToken($valid)->getJson('/api/profile')->assertOk();
    }

    public function test_activity_refreshes_only_current_token_and_ignores_client_timeout_values(): void
    {
        $user = $this->user('ADMIN');
        [$headers, $current] = $this->tokenSession($user, 4);
        [, $other] = $this->tokenSession($user, 4);
        $otherBefore = $other->last_activity_at;

        $this->asToken($headers)->postJson('/api/session/activity', [
            'token_id' => $other->id,
            'timeout_minutes' => 9999,
            'role' => 'QA_SUPERVISOR',
        ])->assertOk()->assertJsonPath('timeout_minutes', 5);

        $this->assertTrue($current->fresh()->last_activity_at->greaterThan($current->last_activity_at));
        $this->assertTrue($other->fresh()->last_activity_at->eq($otherBefore));
    }

    public function test_concurrent_role_sessions_track_activity_independently(): void
    {
        [$adminHeaders, $adminToken] = $this->tokenSession($this->user('ADMIN'), 4);
        [$pmHeaders, $pmToken] = $this->tokenSession($this->user('PLANT_MANAGER'), 4);
        [$qaHeaders, $qaToken] = $this->tokenSession($this->user('QA_SUPERVISOR'), 4);
        $pmBefore = $pmToken->last_activity_at;
        $qaBefore = $qaToken->last_activity_at;

        $this->asToken($adminHeaders)->postJson('/api/session/activity')->assertOk()->assertJsonPath('timeout_minutes', 5);
        $this->assertTrue($adminToken->fresh()->last_activity_at->greaterThan($adminToken->last_activity_at));
        $this->assertTrue($pmToken->fresh()->last_activity_at->eq($pmBefore));
        $this->assertTrue($qaToken->fresh()->last_activity_at->eq($qaBefore));

        $adminAfter = $adminToken->fresh()->last_activity_at;
        $this->asToken($pmHeaders)->postJson('/api/session/activity')->assertOk()->assertJsonPath('timeout_minutes', 5);
        $this->assertTrue($pmToken->fresh()->last_activity_at->greaterThan($pmBefore));
        $this->assertTrue($adminToken->fresh()->last_activity_at->eq($adminAfter));
        $this->assertTrue($qaToken->fresh()->last_activity_at->eq($qaBefore));

        // Admin and Plant Manager keep working; only the idle QA session expires.
        $this->travel(1)->minutes();
        $this->asToken($adminHeaders)->getJson('/api/profile')->assertOk();
        $this->asToken($pmHeaders)->getJson('/api/profile')->assertOk();
        $this->asToken($qaHeaders)->getJson('/api/profile')->assertUnauthorized()->assertJsonPath('code', 'SESSION_IDLE_TIMEOUT');

        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $qaToken->id]);
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $adminToken->id]);
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $pmToken->id]);
    }

    public function test_qa_activity_refreshes_only_qa_token(): void
    {
        [$qaHeaders, $qaToken] = $this->tokenSession($this->user('QA_SUPERVISOR'), 4);
        [, $pmToken] = $this->tokenSession($this->user('PLANT_MANAGER'), 4);
        $pmBefore = $pmToken->last_activity_at;

        $this->asToken($qaHeaders)->postJson('/api/session/activity')->assertOk()->assertJsonPath('timeout_minutes', 5);

        $this->assertTrue($qaToken->fresh()->last_activity_at->greaterThan($qaToken->last_activity_at));
        $this->assertTrue($pmToken->fresh()->last_activity_at->eq($pmBefore));
    }

    public function test_idle_admin_expiry_does_not_end_active_plant_manager_or_qa_sessions(): void
    {
        [$adminHeaders, $adminToken] = $this->tokenSession($this->user('ADMIN'), 5);
        [$pmHeaders, $pmToken] = $this->tokenSession($this->user('PLANT_MANAGER'), 1);
        [$qaHeaders, $qaToken] = $this->tokenSession($this->user('QA_SUPERVISOR'), 1);

        $this->asToken($adminHeaders)->getJson('/api/session/status')->assertUnauthorized()->assertJsonPath('code', 'SESSION_IDLE_TIMEOUT');

        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $adminToken->id]);
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $pmToken->id]);
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $qaToken->id]);
        $this->asToken($pmHeaders)->getJson('/api/profile')->assertOk();
        $this->asToken($qaHeaders)->getJson('/api/profile')->assertOk();
    }

    public function test_active_session_does_not_time_out_with_repeated_activity(): void
    {
        [$pmHeaders, $pmToken] = $this->tokenSession($this->user('PLANT_MANAGER'));
        [$qaHeaders, $qaToken] = $this->tokenSession($this->user('QA_SUPERVISOR'));

        // Interleaved human activity keeps both sessions alive well past five
        // minutes from login because each activity call resets its own deadline.
        foreach (range(1, 3) as $step) {
            $this->travel(4)->minutes();
            $this->asToken($pmHeaders)->postJson('/api/session/activity')->assertOk();
            $this->asToken($qaHeaders)->postJson('/api/session/activity')->assertOk();
            $this->asToken($pmHeaders)->postJson('/api/session/activity')->assertOk();
        }

        $this->asToken($pmHeaders)->getJson('/api/profile')->assertOk();
        $this->asToken($qaHeaders)->getJson('/api/profile')->assertOk();
        $this->assertTrue($pmToken->fresh()->last_activity_at->greaterThan(now()->subMinute()));
        $this->assertTrue($qaToken->fresh()->last_activity_at->greaterThan(now()->subMinute()));

        // The next five-minute window begins at the latest explicit activity.
        $this->travel(4)->minutes();
        $this->asToken($pmHeaders)->getJson('/api/profile')->assertOk();
        $this->asToken($qaHeaders)->getJson('/api/profile')->assertOk();
        $this->travel(1)->minutes();
        $this->asToken($pmHeaders)->getJson('/api/profile')->assertUnauthorized()
            ->assertJsonPath('code', 'SESSION_IDLE_TIMEOUT');
        $this->asToken($qaHeaders)->getJson('/api/profile')->assertUnauthorized()
            ->assertJsonPath('code', 'SESSION_IDLE_TIMEOUT');
    }

    public function test_status_reports_the_current_token_only(): void
    {
        $user = $this->user('PLANT_MANAGER');
        [$recentHeaders, $recent] = $this->tokenSession($user, 2);
        [$olderHeaders, $older] = $this->tokenSession($user, 4);
        $recent = $recent->fresh();
        $older = $older->fresh();

        $recentStatus = $this->asToken($recentHeaders)->getJson('/api/session/status')->assertOk()->json();
        $olderStatus = $this->asToken($olderHeaders)->getJson('/api/session/status')->assertOk()->json();

        $this->assertTrue(Carbon::parse($recentStatus['last_activity_at'])->eq($recent->last_activity_at));
        $this->assertTrue(Carbon::parse($recentStatus['expires_at'])->eq($recent->last_activity_at->copy()->addMinutes(5)));
        $this->assertTrue(Carbon::parse($olderStatus['last_activity_at'])->eq($older->last_activity_at));
        $this->assertTrue(Carbon::parse($olderStatus['expires_at'])->eq($older->last_activity_at->copy()->addMinutes(5)));
        $this->assertNotNull($recentStatus['server_time'] ?? null);

        // Reading status is not activity.
        $this->assertTrue($recent->fresh()->last_activity_at->eq($recent->last_activity_at));
    }

    public function test_transient_acting_as_token_is_not_idle_processed(): void
    {
        Sanctum::actingAs($this->user('ADMIN'));

        $this->getJson('/api/profile')->assertOk();
    }

    public function test_background_protected_request_does_not_update_human_activity(): void
    {
        [$headers, $token] = $this->tokenSession($this->user('PLANT_MANAGER'), 4);
        $before = $token->last_activity_at;

        $this->asToken($headers)->getJson('/api/profile')->assertOk();

        $this->assertTrue($token->fresh()->last_activity_at->eq($before));
        $this->assertNotNull($token->fresh()->last_used_at);

        $this->travel(1)->minutes();
        $this->asToken($headers)->getJson('/api/profile')->assertUnauthorized()
            ->assertJsonPath('code', 'SESSION_IDLE_TIMEOUT');
    }

    public function test_guest_cannot_call_session_endpoints(): void
    {
        $this->getJson('/api/session/status')->assertUnauthorized();
        $this->postJson('/api/session/activity')->assertUnauthorized();
    }

    public function test_inactive_account_is_blocked_before_idle_processing(): void
    {
        $user = $this->user('PLANT_MANAGER', ['status' => 'SUSPENDED']);
        [$headers] = $this->tokenSession($user, 5);
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
