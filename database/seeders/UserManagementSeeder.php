<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
use App\Models\Role;
use App\Models\Department;
use App\Models\Branch;
use App\Models\Warehouse;

class UserManagementSeeder extends Seeder
{
    public function run(): void
    {
        $adminRole = Role::firstOrCreate(
            ['slug' => 'ADMIN'],
            ['name' => 'Full System Administrator', 'description' => 'Full system access']
        );

        $plantManagerRole = Role::firstOrCreate(
            ['slug' => 'PLANT_MANAGER'],
            ['name' => 'Plant Manager', 'description' => 'Manages plant operations']
        );

        $qaSupervisorRole = Role::firstOrCreate(
            ['slug' => 'QA_SUPERVISOR'],
            ['name' => 'QA Supervisor', 'description' => 'Quality assurance oversight']
        );

        $purchasingDept = Department::firstOrCreate(
            ['code' => 'PUR'],
            ['name' => 'Purchasing']
        );

        $warehouseDept = Department::firstOrCreate(
            ['code' => 'WH'],
            ['name' => 'Warehouse']
        );

        $qaDept = Department::firstOrCreate(
            ['code' => 'QA'],
            ['name' => 'Quality Assurance']
        );

        $branch = Branch::firstOrCreate(
            ['code' => 'BR-PAMP'],
            ['name' => 'Pampanga Branch']
        );

        $warehouse = Warehouse::firstOrCreate(
            ['code' => 'WH-PAMP', 'branch_id' => $branch->id],
            ['name' => 'Pampanga Warehouse']
        );

        User::firstOrCreate(
            ['employee_id' => 'EMP-001'],
            [
                'name' => 'Admin User',
                'email' => 'admin@gmail.com',
                'password' => Hash::make('admin123'),
                'role_id' => $adminRole->id,
                'department_id' => $purchasingDept->id,
                'branch_id' => $branch->id,
                'warehouse_id' => $warehouse->id,
                'status' => 'ACTIVE',
            ]
        );

        User::firstOrCreate(
            ['employee_id' => 'EMP-002'],
            [
                'name' => 'Maria Santos',
                'email' => 'maria.santos@smartchain.com',
                'password' => Hash::make('password123'),
                'role_id' => $plantManagerRole->id,
                'department_id' => $warehouseDept->id,
                'branch_id' => $branch->id,
                'warehouse_id' => $warehouse->id,
                'status' => 'ACTIVE',
            ]
        );

        User::firstOrCreate(
            ['employee_id' => 'EMP-005'],
            [
                'name' => 'QA Lead',
                'email' => 'qa.lead@smartchain.com',
                'password' => Hash::make('password123'),
                'role_id' => $qaSupervisorRole->id,
                'department_id' => $qaDept->id,
                'branch_id' => $branch->id,
                'warehouse_id' => $warehouse->id,
                'status' => 'ACTIVE',
            ]
        );
    }
}
