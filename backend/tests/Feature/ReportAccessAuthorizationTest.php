<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ReportAccessAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role = 'ADMIN'): User
    {
        $roleModel = Role::firstOrCreate(['slug' => $role], ['name' => $role]);

        return User::factory()->create(['role_id' => $roleModel->id, 'status' => 'ACTIVE', 'password' => 'correct-password']);
    }

    private function confirm(User $user, array $overrides = [])
    {
        return $this->actingAs($user)->postJson('/api/report-access/confirm', [
            'password' => 'correct-password',
            'resource' => 'admin:inventory-summary',
            'format' => 'PDF',
            'action' => 'EXPORT',
            ...$overrides,
        ]);
    }

    private function consume(User $user, string $authorization, array $overrides = [])
    {
        return $this->actingAs($user)->withHeader('X-Report-Authorization', $authorization)
            ->postJson('/api/report-access/consume', [
                'resource' => 'admin:inventory-summary',
                'format' => 'PDF',
                'action' => 'EXPORT',
                ...$overrides,
            ]);
    }

    public function test_correct_password_issues_a_short_lived_single_use_authorization(): void
    {
        $user = $this->user();
        $confirmation = $this->confirm($user)->assertOk()->assertJsonPath('expires_in', 120);
        $authorization = $confirmation->json('authorization');

        $this->consume($user, $authorization)->assertOk();
        $this->consume($user, $authorization)->assertForbidden();
    }

    public function test_qa_correct_password_authorizes_the_combined_quality_report_action(): void
    {
        $qa = $this->user('QA_SUPERVISOR');
        $authorization = $this->confirm($qa, [
            'resource' => 'qa:quality-report', 'format' => 'CSV', 'action' => 'EXPORT',
        ])->assertOk()->json('authorization');

        $this->consume($qa, $authorization, [
            'resource' => 'qa:quality-report', 'format' => 'CSV', 'action' => 'EXPORT',
        ])->assertOk();
    }

    public function test_incorrect_password_is_rejected_without_returning_an_authorization(): void
    {
        $this->confirm($this->user(), ['password' => 'wrong-password'])
            ->assertUnprocessable()->assertJsonValidationErrors('password')->assertJsonMissingPath('authorization');
    }

    public function test_real_report_endpoints_fail_closed_without_password_confirmation(): void
    {
        $admin = $this->user();
        $manager = $this->user('PLANT_MANAGER');

        $this->actingAs($admin)->postJson('/api/admin/reports/export', [
            'report_key' => 'inventory.summary', 'format' => 'CSV',
        ])->assertForbidden();
        $this->actingAs($manager)->getJson('/api/plant-manager/reports/generate?type=inventory&format=preview')
            ->assertForbidden();
        $this->actingAs($admin)->postJson('/api/report-access/consume', [
            'resource' => 'qa:quality-report', 'format' => 'PDF', 'action' => 'EXPORT',
        ])->assertForbidden();
    }

    public function test_deleted_sanctum_token_cannot_consume_an_existing_authorization(): void
    {
        $user = $this->user();
        $plainTextToken = $user->createToken('report-security-test')->plainTextToken;
        $authorization = $this->withToken($plainTextToken)->postJson('/api/report-access/confirm', [
            'password' => 'correct-password', 'resource' => 'admin:inventory-summary',
            'format' => 'PDF', 'action' => 'EXPORT',
        ])->assertOk()->json('authorization');

        $user->tokens()->delete();
        $this->app['auth']->forgetGuards();

        $this->withToken($plainTextToken)->withHeader('X-Report-Authorization', $authorization)
            ->postJson('/api/report-access/consume', [
                'resource' => 'admin:inventory-summary', 'format' => 'PDF', 'action' => 'EXPORT',
            ])->assertUnauthorized();
    }

    public function test_authorization_is_bound_to_user_resource_format_action_and_password_hash(): void
    {
        $user = $this->user();
        $other = $this->user('QA_SUPERVISOR');

        $token = $this->confirm($user)->json('authorization');
        $this->consume($other, $token)->assertForbidden();

        $token = $this->confirm($user)->json('authorization');
        $this->consume($user, $token, ['resource' => 'admin:other-report'])->assertForbidden();

        $token = $this->confirm($user)->json('authorization');
        $this->consume($user, $token, ['format' => 'CSV'])->assertForbidden();

        $token = $this->confirm($user)->json('authorization');
        $this->consume($user, $token, ['action' => 'PRINT'])->assertForbidden();

        $token = $this->confirm($user)->json('authorization');
        $user->forceFill(['password' => Hash::make('new-password')])->save();
        $this->consume($user->fresh(), $token)->assertForbidden();
    }

    public function test_authorization_expires_and_confirmation_is_rate_limited(): void
    {
        $user = $this->user();
        $token = $this->confirm($user)->json('authorization');
        $this->travel(121)->seconds();
        $this->consume($user, $token)->assertForbidden();

        $limitedUser = $this->user('PLANT_MANAGER');
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->confirm($limitedUser, ['password' => 'wrong'])->assertUnprocessable();
        }
        $this->confirm($limitedUser, ['password' => 'wrong'])->assertTooManyRequests();
    }
}
