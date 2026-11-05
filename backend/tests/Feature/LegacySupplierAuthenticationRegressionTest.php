<?php

namespace Tests\Feature;

use App\Mail\LoginOtpMail;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class LegacySupplierAuthenticationRegressionTest extends TestCase
{
    use RefreshDatabase;

    public static function roles(): array
    {
        return [
            'Admin' => ['ADMIN'],
            'Plant Manager' => ['PLANT_MANAGER'],
            'QA' => ['QA_SUPERVISOR'],
            'Existing Supplier' => ['SUPPLIER'],
        ];
    }

    #[DataProvider('roles')]
    public function test_role_login_resend_session_refresh_protected_access_and_logout(string $slug): void
    {
        Mail::fake();
        $role = Role::firstOrCreate(['slug' => $slug], ['name' => $slug]);
        $supplier = $slug === 'SUPPLIER' ? Supplier::create([
            'supplier_code' => 'SUP-AUTH', 'name' => 'Existing supplier',
            'status' => 'ACTIVE', 'accreditation_status' => 'INACTIVE',
        ]) : null;
        $user = User::factory()->create([
            'role_id' => $role->id, 'supplier_id' => $supplier?->id,
            'status' => 'ACTIVE', 'password' => 'Existing@123',
        ]);
        $this->getJson('/api/session/status')->assertUnauthorized();
        $challenge = $this->postJson('/api/login', ['email' => $user->email, 'password' => 'Existing@123'])
            ->assertOk()->assertJsonPath('requires_otp', true)->assertJsonMissingPath('token')->json('challenge_id');
        $oldCode = Mail::sent(LoginOtpMail::class)->last()->code;
        $this->travel(61)->seconds();
        $this->postJson('/api/login/resend-otp', ['challenge_id' => $challenge])->assertOk();
        $newCode = Mail::sent(LoginOtpMail::class)->last()->code;
        $this->assertNotSame($oldCode, $newCode);
        $token = $this->postJson('/api/login/verify-otp', ['challenge_id' => $challenge, 'otp' => $newCode])
            ->assertOk()->assertJsonPath('user.role.slug', $slug)->json('token');
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/session/status')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/session/activity')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/profile')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/supplier-account/profile')->assertStatus($supplier ? 200 : 403);
        if ($slug !== 'ADMIN') {
            $this->app['auth']->forgetGuards();
            $this->getJson('/api/suppliers')->assertForbidden();
        }
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/logout')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/session/status')->assertUnauthorized();
        $this->assertSame(0, $user->tokens()->count());
    }
}
