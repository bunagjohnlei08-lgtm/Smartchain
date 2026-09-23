<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
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
        $warehouse = $this->warehouse($this->branch, 'MAIN');
        $manager = $this->user($this->plantManagerRole, ['warehouse_id' => $warehouse->id]);
        $target = $this->user($this->qaSupervisorRole, ['warehouse_id' => $warehouse->id]);

        $this->actingAs($manager)->putJson("/api/users/{$target->id}", [
            'name' => 'Updated User Name',
        ])->assertOk()->assertJsonPath('name', 'Updated User Name');
    }

    public function test_plant_manager_can_keep_user_in_same_branch_and_warehouse(): void
    {
        $warehouse = $this->warehouse($this->branch, 'MAIN');
        $manager = $this->user($this->plantManagerRole, ['warehouse_id' => $warehouse->id]);
        $target = $this->user($this->qaSupervisorRole, ['warehouse_id' => $warehouse->id]);

        $this->actingAs($manager)->putJson("/api/users/{$target->id}", [
            'name' => 'Updated In Scope',
            'branch_id' => $this->branch->id,
            'warehouse_id' => $warehouse->id,
        ])->assertOk()->assertJsonPath('name', 'Updated In Scope');
    }

    public function test_plant_manager_cannot_move_user_to_foreign_branch_or_warehouse(): void
    {
        $ownWarehouse = $this->warehouse($this->branch, 'OWN');
        $otherLocalWarehouse = $this->warehouse($this->branch, 'OTHER-LOCAL');
        $otherBranch = Branch::create(['name' => 'Other Branch', 'code' => 'OTHER']);
        $foreignWarehouse = $this->warehouse($otherBranch, 'FOREIGN');
        $manager = $this->user($this->plantManagerRole, ['warehouse_id' => $ownWarehouse->id]);
        $target = $this->user($this->qaSupervisorRole, [
            'warehouse_id' => $ownWarehouse->id,
            'name' => 'Original Name',
        ]);
        $original = $target->only(['branch_id', 'warehouse_id', 'role_id', 'name']);

        $this->actingAs($manager)->putJson("/api/users/{$target->id}", [
            'name' => 'Should Not Persist',
            'branch_id' => $otherBranch->id,
            'warehouse_id' => $foreignWarehouse->id,
        ])->assertForbidden();
        $this->assertSame($original, $target->fresh()->only(array_keys($original)));

        $this->actingAs($manager)->putJson("/api/users/{$target->id}", [
            'name' => 'Should Not Persist Either',
            'warehouse_id' => $otherLocalWarehouse->id,
        ])->assertForbidden();
        $this->assertSame($original, $target->fresh()->only(array_keys($original)));
    }

    public function test_plant_manager_cannot_submit_warehouse_inconsistent_with_allowed_branch(): void
    {
        $ownWarehouse = $this->warehouse($this->branch, 'OWN');
        $otherBranch = Branch::create(['name' => 'Other Branch', 'code' => 'OTHER']);
        $foreignWarehouse = $this->warehouse($otherBranch, 'FOREIGN');
        $manager = $this->user($this->plantManagerRole, ['warehouse_id' => $ownWarehouse->id]);
        $target = $this->user($this->qaSupervisorRole, ['warehouse_id' => $ownWarehouse->id]);

        $this->actingAs($manager)->putJson("/api/users/{$target->id}", [
            'branch_id' => $this->branch->id,
            'warehouse_id' => $foreignWarehouse->id,
        ])->assertForbidden();

        $this->assertSame($this->branch->id, $target->fresh()->branch_id);
        $this->assertSame($ownWarehouse->id, $target->fresh()->warehouse_id);
    }

    public function test_plant_manager_cannot_clear_user_scope(): void
    {
        $warehouse = $this->warehouse($this->branch, 'OWN');
        $manager = $this->user($this->plantManagerRole, ['warehouse_id' => $warehouse->id]);
        $target = $this->user($this->qaSupervisorRole, ['warehouse_id' => $warehouse->id]);

        $this->actingAs($manager)->putJson("/api/users/{$target->id}", [
            'branch_id' => null,
            'warehouse_id' => null,
        ])->assertForbidden();

        $this->assertSame($this->branch->id, $target->fresh()->branch_id);
        $this->assertSame($warehouse->id, $target->fresh()->warehouse_id);
    }

    public function test_admin_can_move_user_cross_scope_when_branch_and_warehouse_match(): void
    {
        $admin = $this->user($this->adminRole);
        $target = $this->user($this->qaSupervisorRole);
        $otherBranch = Branch::create(['name' => 'Other Branch', 'code' => 'OTHER']);
        $foreignWarehouse = $this->warehouse($otherBranch, 'FOREIGN');

        $this->actingAs($admin)->putJson("/api/users/{$target->id}", [
            'branch_id' => $otherBranch->id,
            'warehouse_id' => $foreignWarehouse->id,
        ])->assertOk();

        $this->assertDatabaseHas('users', [
            'id' => $target->id,
            'branch_id' => $otherBranch->id,
            'warehouse_id' => $foreignWarehouse->id,
        ]);
    }

    public function test_qa_supervisor_still_cannot_update_users(): void
    {
        $qaSupervisor = $this->user($this->qaSupervisorRole);
        $target = $this->user($this->plantManagerRole);

        $this->actingAs($qaSupervisor)->putJson("/api/users/{$target->id}", [
            'name' => 'Unauthorized Change',
        ])->assertForbidden();

        $this->assertNotSame('Unauthorized Change', $target->fresh()->name);
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

    private function warehouse(Branch $branch, string $code): Warehouse
    {
        return Warehouse::create([
            'name' => $code.' Warehouse',
            'code' => 'WH-'.$code,
            'branch_id' => $branch->id,
        ]);
    }
}
