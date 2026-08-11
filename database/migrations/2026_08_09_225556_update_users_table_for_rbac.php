<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('employee_id')->unique()->nullable()->after('id');
            $table->foreignId('role_id')->nullable()->after('employee_id');
            $table->foreignId('department_id')->nullable()->after('role_id');
            $table->foreignId('branch_id')->nullable()->after('department_id');
            $table->foreignId('warehouse_id')->nullable()->after('branch_id');
            $table->string('status')->default('PENDING')->after('warehouse_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['warehouse_id']);
            $table->dropForeign(['branch_id']);
            $table->dropForeign(['department_id']);
            $table->dropForeign(['role_id']);
            $table->dropColumn(['employee_id', 'role_id', 'department_id', 'branch_id', 'warehouse_id', 'status']);
        });
    }
};
