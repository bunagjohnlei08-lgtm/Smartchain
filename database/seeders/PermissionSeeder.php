<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Permission;
use App\Models\Role;

class PermissionSeeder extends Seeder
{
    public function run(): void
    {
        $permissions = [
            ['name' => 'View Users', 'slug' => 'users.view'],
            ['name' => 'Create Users', 'slug' => 'users.create'],
            ['name' => 'Update Users', 'slug' => 'users.update'],
            ['name' => 'Approve Users', 'slug' => 'users.approve'],
            ['name' => 'Suspend Users', 'slug' => 'users.suspend'],
            ['name' => 'Activate Users', 'slug' => 'users.activate'],
        ];

        foreach ($permissions as $perm) {
            Permission::firstOrCreate(['slug' => $perm['slug']], $perm);
        }

        $admin = Role::where('slug', 'ADMIN')->first();
        $plantManager = Role::where('slug', 'PLANT_MANAGER')->first();
        $qaSupervisor = Role::where('slug', 'QA_SUPERVISOR')->first();

        if ($admin) {
            $admin->permissions()->sync(Permission::all()->pluck('id'));
        }

        if ($plantManager) {
            $plantManager->permissions()->sync(
                Permission::whereIn('slug', [
                    'users.view', 'users.create', 'users.update', 'users.approve', 'users.suspend', 'users.activate'
                ])->get()->pluck('id')
            );
        }

        if ($qaSupervisor) {
            $qaSupervisor->permissions()->sync(
                Permission::where('slug', 'users.view')->get()->pluck('id')
            );
        }
    }
}
