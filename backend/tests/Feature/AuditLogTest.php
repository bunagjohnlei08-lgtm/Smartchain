<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use App\Support\AuditLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use LogicException;
use Tests\Concerns\CompletesOtpLogin;
use Tests\TestCase;

class AuditLogTest extends TestCase
{
    use CompletesOtpLogin, RefreshDatabase;

    private Role $adminRole;
    private Role $plantManagerRole;
    private Role $qaRole;

    protected function setUp(): void
    {
        parent::setUp();

        $this->adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->plantManagerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $this->qaRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
    }

    private function user(Role $role, array $attributes = []): User
    {
        return User::factory()->create(array_merge([
            'role_id' => $role->id,
            'status' => 'ACTIVE',
            'employee_id' => 'EMP-'.fake()->unique()->numerify('####'),
        ], $attributes));
    }

    private function assertNoAuditRowContains(string $needle): void
    {
        foreach (AuditLog::query()->get() as $log) {
            $this->assertStringNotContainsString($needle, json_encode($log->getAttributes()));
        }
    }

    public function test_successful_login_and_logout_are_audited(): void
    {
        $user = $this->user($this->qaRole, ['email' => 'qa@example.com', 'password' => 'correct-password']);

        $token = $this->loginWithOtp('qa@example.com', 'correct-password')
            ->assertOk()->json('token');

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'LOGIN', 'module' => 'Authentication', 'status' => 'SUCCESS', 'actor_user_id' => $user->id,
        ]);

        $this->withToken($token)->postJson('/api/logout')->assertOk();

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'LOGOUT', 'status' => 'SUCCESS', 'actor_user_id' => $user->id,
        ]);
        $this->assertNoAuditRowContains($token);
        $this->assertNoAuditRowContains('correct-password');
    }

    public function test_failed_login_is_audited_without_the_password(): void
    {
        $this->user($this->qaRole, ['email' => 'qa@example.com', 'password' => 'correct-password']);

        $this->postJson('/api/login', ['email' => 'qa@example.com', 'password' => 'Wr0ng-Secret!'])
            ->assertStatus(401);

        $log = AuditLog::query()->where('action', 'LOGIN_FAILED')->sole();
        $this->assertSame('FAILED', $log->status);
        $this->assertSame('qa@example.com', $log->actor_identifier);
        $this->assertSame('INVALID_CREDENTIALS', $log->metadata['reason']);
        $this->assertNoAuditRowContains('Wr0ng-Secret!');
    }

    public function test_suspended_account_login_is_audited_as_failed(): void
    {
        $user = $this->user($this->qaRole, ['email' => 'off@example.com', 'password' => 'correct-password', 'status' => 'SUSPENDED']);

        $this->postJson('/api/login', ['email' => 'off@example.com', 'password' => 'correct-password'])
            ->assertForbidden();

        $log = AuditLog::query()->where('action', 'LOGIN_FAILED')->sole();
        $this->assertSame($user->id, $log->actor_user_id);
        $this->assertSame('ACCOUNT_SUSPENDED', $log->metadata['reason']);
    }

    public function test_user_can_be_created_without_department_or_branch_and_defaults_to_main_warehouse(): void
    {
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $main = Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id, 'status' => 'Active']);
        $admin = $this->user($this->adminRole);

        Mail::fake();

        // Accounts are invited: no admin-set password and no client-chosen status.
        $response = $this->actingAs($admin)->postJson('/api/users', [
            'name' => 'New Supervisor',
            'email' => 'new@example.com',
            'role_id' => $this->qaRole->id,
        ])->assertCreated();

        $response->assertJsonPath('department_id', null)
            ->assertJsonPath('branch_id', null)
            ->assertJsonPath('warehouse_id', $main->id);

        $log = AuditLog::query()->where('action', 'USER_CREATED')->sole();
        $this->assertSame($admin->id, $log->actor_user_id);
        $this->assertSame($response->json('employee_id'), $log->resource_label);
        $this->assertSame('PENDING', $log->metadata['status']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'INVITATION_SENT', 'actor_user_id' => $admin->id]);
    }

    public function test_user_update_role_change_and_status_changes_are_audited(): void
    {
        $admin = $this->user($this->adminRole);
        $target = $this->user($this->qaRole, ['employee_id' => 'EMP-0007']);

        $this->actingAs($admin)->putJson("/api/users/{$target->id}", [
            'name' => 'Renamed User',
            'role_id' => $this->plantManagerRole->id,
            'password' => 'brand-new-secret',
        ])->assertOk();

        $updated = AuditLog::query()->where('action', 'USER_UPDATED')->sole();
        $this->assertStringContainsString('Changed name from', $updated->details);
        $this->assertStringNotContainsString('password', strtolower($updated->details));
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'PASSWORD_CHANGED', 'module' => 'User Management', 'status' => 'SUCCESS',
            'details' => 'Password changed', 'resource_label' => 'EMP-0007', 'actor_user_id' => $admin->id,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'ROLE_CHANGED',
            'details' => 'Changed role from QA_SUPERVISOR to PLANT_MANAGER',
        ]);

        $this->actingAs($admin)->postJson("/api/users/{$target->id}/suspend")->assertOk();
        $this->actingAs($admin)->postJson("/api/users/{$target->id}/activate")->assertOk();

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'ACCOUNT_DISABLED', 'details' => 'Changed status from ACTIVE to SUSPENDED', 'resource_label' => 'EMP-0007',
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'ACCOUNT_ENABLED', 'details' => 'Changed status from SUSPENDED to ACTIVE',
        ]);
        $this->assertNoAuditRowContains('brand-new-secret');
    }

    public function test_only_admins_can_read_audit_logs(): void
    {
        $manager = $this->user($this->plantManagerRole);
        $manager->role->permissions()->attach(Permission::create(['name' => 'View Users', 'slug' => 'users.view']));

        $this->getJson('/api/admin/audit-logs')->assertUnauthorized();
        $this->actingAs($manager)->getJson('/api/admin/audit-logs')->assertForbidden();
        $this->actingAs($manager)->getJson('/api/admin/audit-logs/options')->assertForbidden();
        $this->actingAs($this->user($this->qaRole))->getJson('/api/admin/audit-logs')->assertForbidden();
        $this->actingAs($this->user($this->adminRole))->getJson('/api/admin/audit-logs')->assertOk();
    }

    public function test_audit_logs_are_paginated_newest_first_and_filterable(): void
    {
        $admin = $this->user($this->adminRole);

        foreach (range(1, 24) as $index) {
            AuditLogger::success('USER_UPDATED', AuditLogger::MODULE_USERS, [
                'actor' => $admin, 'resource_label' => "EMP-{$index}",
            ]);
        }
        AuditLogger::failure('LOGIN_FAILED', AuditLogger::MODULE_AUTH, ['actor_identifier' => 'x@example.com']);
        AuditLog::query()->where('resource_label', 'EMP-1')->toBase()->update(['created_at' => now()->subDay()]);

        $page = $this->actingAs($admin)->getJson('/api/admin/audit-logs')->assertOk();
        $page->assertJsonPath('total', 25)->assertJsonPath('per_page', 20)->assertJsonPath('last_page', 2)
            ->assertJsonCount(20, 'data');

        $second = $this->actingAs($admin)->getJson('/api/admin/audit-logs?page=2')->assertOk();
        $second->assertJsonCount(5, 'data')->assertJsonPath('data.4.resource_label', 'EMP-1');

        $this->actingAs($admin)->getJson('/api/admin/audit-logs?status=FAILED')
            ->assertJsonPath('total', 1)->assertJsonPath('data.0.action', 'LOGIN_FAILED');
        $this->actingAs($admin)->getJson('/api/admin/audit-logs?module=Authentication')->assertJsonPath('total', 1);
        $this->actingAs($admin)->getJson('/api/admin/audit-logs?search=EMP-2')->assertJsonPath('total', 6);
    }

    public function test_audit_logs_cannot_be_modified_or_deleted(): void
    {
        AuditLogger::success('LOGIN', AuditLogger::MODULE_AUTH);
        $log = AuditLog::query()->sole();

        try {
            $log->update(['action' => 'TAMPERED']);
            $this->fail('Audit log update was not blocked.');
        } catch (LogicException) {
        }

        try {
            $log->delete();
            $this->fail('Audit log delete was not blocked.');
        } catch (LogicException) {
        }

        $this->assertDatabaseHas('audit_logs', ['id' => $log->id, 'action' => 'LOGIN']);
    }

    public function test_success_entries_are_discarded_when_the_transaction_rolls_back(): void
    {
        try {
            DB::transaction(function () {
                AuditLogger::success('ORDER_STATUS_CHANGED', AuditLogger::MODULE_ORDERS);
                throw new \RuntimeException('rollback');
            });
        } catch (\RuntimeException) {
        }

        $this->assertDatabaseMissing('audit_logs', ['action' => 'ORDER_STATUS_CHANGED']);
    }

    public function test_sensitive_metadata_keys_are_scrubbed(): void
    {
        AuditLogger::success('USER_UPDATED', AuditLogger::MODULE_USERS, [
            'metadata' => [
                'role' => 'QA_SUPERVISOR',
                'password' => 'leak-1',
                'api_token' => 'leak-2',
                'nested' => ['Authorization' => 'Bearer leak-3', 'ok' => 'kept'],
            ],
        ]);

        $log = AuditLog::query()->sole();
        $this->assertSame(['role' => 'QA_SUPERVISOR', 'nested' => ['ok' => 'kept']], $log->metadata);
    }
}
