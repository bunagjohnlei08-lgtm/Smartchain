<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoginRateLimitTest extends TestCase
{
    use RefreshDatabase;

    private function userWithRole(string $slug, string $email): User
    {
        $role = Role::firstOrCreate(
            ['slug' => $slug],
            ['name' => str_replace('_', ' ', $slug)]
        );

        return User::factory()->create([
            'email' => $email,
            'password' => 'correct-password',
            'role_id' => $role->id,
            'status' => 'ACTIVE',
        ]);
    }

    public function test_valid_credentials_preserve_all_supported_role_logins(): void
    {
        foreach (['ADMIN', 'PLANT_MANAGER', 'QA_SUPERVISOR'] as $index => $role) {
            $user = $this->userWithRole($role, "valid-role-{$index}@example.com");

            $this->postJson('/api/login', [
                'email' => strtoupper($user->email),
                'password' => 'correct-password',
            ])->assertOk()
                ->assertJsonPath('message', 'Login successful')
                ->assertJsonPath('user.role.slug', $role)
                ->assertJsonStructure(['token']);
        }
    }

    public function test_invalid_credentials_below_threshold_keep_generic_response(): void
    {
        $user = $this->userWithRole('ADMIN', 'below-threshold@example.com');

        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->postJson('/api/login', [
                'email' => $user->email,
                'password' => 'wrong-password',
            ])->assertUnauthorized()->assertExactJson([
                'message' => 'The provided credentials are incorrect.',
                'errors' => [
                    'email' => ['The provided credentials are incorrect.'],
                ],
            ]);
        }
    }

    public function test_repeated_invalid_credentials_receive_too_many_requests(): void
    {
        $user = $this->userWithRole('ADMIN', 'limited@example.com');

        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->postJson('/api/login', [
                'email' => $user->email,
                'password' => 'wrong-password',
            ])->assertUnauthorized();
        }

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ])->assertTooManyRequests()
            ->assertJsonPath('message', 'Too many login attempts. Please try again later.')
            ->assertJsonMissingPath('errors.email');
    }

    public function test_successful_login_clears_failed_attempt_counter(): void
    {
        $user = $this->userWithRole('ADMIN', 'reset@example.com');

        for ($attempt = 1; $attempt <= 4; $attempt++) {
            $this->postJson('/api/login', [
                'email' => $user->email,
                'password' => 'wrong-password',
            ])->assertUnauthorized();
        }

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'correct-password',
        ])->assertOk();

        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->postJson('/api/login', [
                'email' => $user->email,
                'password' => 'wrong-password',
            ])->assertUnauthorized();
        }

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ])->assertTooManyRequests();
    }

    public function test_account_limit_cannot_be_bypassed_by_changing_ip_and_other_accounts_are_independent(): void
    {
        $first = $this->userWithRole('ADMIN', 'first-key@example.com');
        $second = $this->userWithRole('ADMIN', 'second-key@example.com');

        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.10'])
                ->postJson('/api/login', [
                    'email' => $first->email,
                    'password' => 'wrong-password',
                ])->assertUnauthorized();
        }

        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.10'])
            ->postJson('/api/login', [
                'email' => $second->email,
                'password' => 'correct-password',
            ])->assertOk();

        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.11'])
            ->postJson('/api/login', [
                'email' => $first->email,
                'password' => 'correct-password',
            ])->assertTooManyRequests();
    }

    public function test_invalid_login_does_not_disclose_account_existence(): void
    {
        $user = $this->userWithRole('ADMIN', 'existing@example.com');
        $payload = ['password' => 'wrong-password'];

        $existingResponse = $this->postJson('/api/login', $payload + ['email' => $user->email]);
        $unknownResponse = $this->postJson('/api/login', $payload + ['email' => 'unknown@example.com']);

        $existingResponse->assertUnauthorized();
        $unknownResponse->assertUnauthorized();
        $this->assertSame($existingResponse->json(), $unknownResponse->json());
    }
}
