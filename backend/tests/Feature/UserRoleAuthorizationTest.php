<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserRoleAuthorizationTest extends TestCase
{
    use RefreshDatabase;

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

        $updateUsers = Permission::create(['name' => 'Update Users', 'slug' => 'users.update']);
        $this->plantManagerRole->permissions()->attach($updateUsers);
    }

    private function user(Role $role, array $attributes = []): User
    {
        return User::factory()->create(array_merge([
            'role_id' => $role->id,
            'branch_id' => $this->branch->id,
            'status' => 'ACTIVE',
        ], $attributes));
    }

    public function test_admin_can_assign_admin_role_to_a_permitted_user(): void
    {
        $admin = $this->user($this->adminRole);
        $target = $this->user($this->qaSupervisorRole);

        $this->actingAs($admin)->putJson("/api/users/{$target->id}", [
            'role_id' => $this->adminRole->id,
        ])->assertOk()->assertJsonPath('role.slug', 'ADMIN');

        $this->assertDatabaseHas('users', [
            'id' => $target->id,
            'role_id' => $this->adminRole->id,
        ]);
    }

    public function test_plant_manager_can_update_normal_fields_for_same_branch_user(): void
    {
        $manager = $this->user($this->plantManagerRole);
        $target = $this->user($this->qaSupervisorRole);

        $this->actingAs($manager)->putJson("/api/users/{$target->id}", [
            'name' => 'Updated User Name',
        ])->assertOk()->assertJsonPath('name', 'Updated User Name');
    }

    public function test_plant_manager_cannot_assign_admin_role(): void
    {
        $manager = $this->user($this->plantManagerRole);
        $target = $this->user($this->qaSupervisorRole);

        $this->actingAs($manager)->putJson("/api/users/{$target->id}", [
            'role_id' => $this->adminRole->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('role_id');

        $this->assertDatabaseHas('users', [
            'id' => $target->id,
            'role_id' => $this->qaSupervisorRole->id,
        ]);
    }

    public function test_plant_manager_cannot_promote_self_to_admin(): void
    {
        $manager = $this->user($this->plantManagerRole);

        $this->actingAs($manager)->putJson("/api/users/{$manager->id}", [
            'role_id' => $this->adminRole->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('role_id');

        $this->assertDatabaseHas('users', [
            'id' => $manager->id,
            'role_id' => $this->plantManagerRole->id,
        ]);
    }

    public function test_qa_supervisor_cannot_assign_admin_role(): void
    {
        $qaSupervisor = $this->user($this->qaSupervisorRole);
        $target = $this->user($this->plantManagerRole);

        $this->actingAs($qaSupervisor)->putJson("/api/users/{$target->id}", [
            'role_id' => $this->adminRole->id,
        ])->assertForbidden();
    }

    public function test_plant_manager_cannot_modify_an_admin_account(): void
    {
        $manager = $this->user($this->plantManagerRole);
        $admin = $this->user($this->adminRole);

        $this->actingAs($manager)->putJson("/api/users/{$admin->id}", [
            'name' => 'Changed by Plant Manager',
        ])->assertForbidden();

        $this->assertNotSame('Changed by Plant Manager', $admin->fresh()->name);
    }
}
