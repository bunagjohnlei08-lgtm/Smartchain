<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_profile_requires_authentication(): void
    {
        $this->getJson('/api/profile')->assertUnauthorized();
    }

    public function test_authenticated_user_can_view_own_profile(): void
    {
        $user = User::factory()->create(['employee_id' => 'EMP-100']);
        Sanctum::actingAs($user);

        $this->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('id', $user->id)
            ->assertJsonPath('employee_id', 'EMP-100')
            ->assertJsonPath('profile_photo_url', null)
            ->assertJsonMissingPath('password');
    }

    public function test_profile_photo_requires_authentication(): void
    {
        $this->post('/api/profile/photo', [
            'photo' => UploadedFile::fake()->image('avatar.jpg'),
        ], ['Accept' => 'application/json'])->assertUnauthorized();

        $this->deleteJson('/api/profile/photo')->assertUnauthorized();
    }

    public function test_user_can_upload_supported_profile_photo_types(): void
    {
        Storage::fake('public');

        foreach (['jpg', 'png', 'webp'] as $extension) {
            $user = User::factory()->create();
            Sanctum::actingAs($user);

            $response = $this->post('/api/profile/photo', [
                'photo' => UploadedFile::fake()->image('avatar.'.$extension),
            ])->assertOk()->assertJsonPath('id', $user->id);

            $path = $user->fresh()->profile_photo_path;
            $this->assertNotNull($path);
            $this->assertStringStartsWith('profile-photos/', $path);
            $response->assertJsonPath('profile_photo_url', Storage::disk('public')->url($path));
            Storage::disk('public')->assertExists($path);
        }
    }

    public static function profileRoles(): array
    {
        return [
            'admin' => ['ADMIN'],
            'plant manager' => ['PLANT_MANAGER'],
            'QA' => ['QA_SUPERVISOR'],
        ];
    }

    #[DataProvider('profileRoles')]
    public function test_photo_persists_across_fresh_requests_and_login_for_each_role(string $slug): void
    {
        Storage::fake('public', ['url' => 'http://localhost:8000/storage']);
        $role = Role::create(['name' => $slug, 'slug' => $slug]);
        $user = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
        $credentials = ['email' => $user->email, 'password' => 'password'];
        $this->assertNull($user->fresh()->profile_photo_path);

        $login = $this->postJson('/api/login', $credentials)->assertOk();
        $this->withToken($login->json('token'));
        $upload = $this->post('/api/profile/photo', [
            'photo' => UploadedFile::fake()->image('avatar.jpg'),
        ])->assertOk()->assertJsonPath('id', $user->id);

        $path = $user->fresh()->profile_photo_path;
        $this->assertNotNull($path);
        $this->assertStringStartsWith('profile-photos/', $path);
        $this->assertDatabaseHas('users', ['id' => $user->id, 'profile_photo_path' => $path]);
        Storage::disk('public')->assertExists($path);
        $url = 'http://localhost:8000/storage/'.$path;
        $upload->assertJsonPath('profile_photo_url', $url);

        // Resolve the authenticated user again, as a browser reload would.
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/profile')->assertOk()->assertJsonPath('profile_photo_url', $url);
        $this->postJson('/api/logout')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => '']);
        $login = $this->postJson('/api/login', $credentials)
            ->assertOk()->assertJsonPath('user.profile_photo_url', $url);
        $this->withToken($login->json('token'));
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/profile')->assertOk()->assertJsonPath('profile_photo_url', $url);

        $this->deleteJson('/api/profile/photo')->assertOk()->assertJsonPath('profile_photo_url', null);
        $this->assertNull($user->fresh()->profile_photo_path);
        Storage::disk('public')->assertMissing($path);
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/profile')->assertOk()->assertJsonPath('profile_photo_url', null);
    }

    public function test_profile_photo_validation_rejects_invalid_and_oversized_files(): void
    {
        Storage::fake('public');
        Sanctum::actingAs(User::factory()->create());

        $this->post('/api/profile/photo', [
            'photo' => UploadedFile::fake()->create('payload.txt', 10, 'text/plain'),
        ])->assertUnprocessable()->assertJsonValidationErrors('photo');

        $this->post('/api/profile/photo', [
            'photo' => UploadedFile::fake()->create('large.jpg', 2049, 'image/jpeg'),
        ])->assertUnprocessable()->assertJsonValidationErrors('photo');
    }

    public function test_replacing_and_removing_profile_photo_manages_files_safely(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->post('/api/profile/photo', [
            'photo' => UploadedFile::fake()->image('first.jpg'),
        ])->assertOk();
        $oldPath = $user->fresh()->profile_photo_path;

        $this->post('/api/profile/photo', [
            'photo' => UploadedFile::fake()->image('replacement.png'),
        ])->assertOk();
        $newPath = $user->fresh()->profile_photo_path;

        $this->assertNotSame($oldPath, $newPath);
        Storage::disk('public')->assertMissing($oldPath);
        Storage::disk('public')->assertExists($newPath);

        $this->deleteJson('/api/profile/photo')
            ->assertOk()
            ->assertJsonPath('profile_photo_url', null);

        $this->assertNull($user->fresh()->profile_photo_path);
        Storage::disk('public')->assertMissing($newPath);
    }

    public function test_photo_endpoint_cannot_target_another_user(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();
        $other = User::factory()->create();
        Sanctum::actingAs($user);

        $this->post('/api/profile/photo', [
            'photo' => UploadedFile::fake()->image('avatar.jpg'),
            'user_id' => $other->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('user_id');

        $this->assertNull($other->fresh()->profile_photo_path);
    }

    public function test_user_can_update_only_name_and_email(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->putJson('/api/profile', [
            'name' => 'Updated Name',
            'email' => 'updated@example.com',
        ])->assertOk()
            ->assertJsonPath('name', 'Updated Name')
            ->assertJsonPath('email', 'updated@example.com');

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'name' => 'Updated Name',
            'email' => 'updated@example.com',
        ]);
    }

    public function test_duplicate_email_is_rejected(): void
    {
        $other = User::factory()->create();
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->putJson('/api/profile', [
            'name' => $user->name,
            'email' => $other->email,
        ])->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_protected_fields_are_rejected(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $protected = ['user_id', 'employee_id', 'role_id', 'department_id', 'branch_id', 'warehouse_id', 'status', 'permissions', 'password'];

        foreach ($protected as $field) {
            $this->putJson('/api/profile', [
                'name' => $user->name,
                'email' => $user->email,
                $field => $field === 'permissions' ? ['users.update'] : '1',
            ])->assertUnprocessable()->assertJsonValidationErrors($field);
        }
    }

    public function test_password_change_validates_current_password_and_confirmation(): void
    {
        $user = User::factory()->create(['password' => 'old-password']);
        Sanctum::actingAs($user);

        $this->putJson('/api/profile/password', [
            'current_password' => 'wrong-password',
            'password' => 'new-password',
            'password_confirmation' => 'new-password',
        ])->assertUnprocessable()->assertJsonValidationErrors('current_password');

        $this->putJson('/api/profile/password', [
            'current_password' => 'old-password',
            'password' => 'new-password',
            'password_confirmation' => 'different-password',
        ])->assertUnprocessable()->assertJsonValidationErrors('password');

        $this->putJson('/api/profile/password', [
            'current_password' => 'old-password',
            'password' => 'new-password',
            'password_confirmation' => 'new-password',
        ])->assertOk();

        $this->assertTrue(Hash::check('new-password', $user->fresh()->password));
    }

    public function test_password_change_preserves_existing_token(): void
    {
        $user = User::factory()->create(['password' => 'old-password']);
        $token = $user->createToken('profile-test')->plainTextToken;
        $headers = ['Authorization' => 'Bearer '.$token];

        $this->withHeaders($headers)->putJson('/api/profile/password', [
            'current_password' => 'old-password',
            'password' => 'new-password',
            'password_confirmation' => 'new-password',
        ])->assertOk();

        $this->withHeaders($headers)->getJson('/api/profile')->assertOk();
    }
}
