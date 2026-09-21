<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Set once, on the first fully verified login (password + emailed code).
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('first_login_at')->nullable();
        });

        // Accounts that have already signed in must not be greeted as new:
        // backfill from their earliest successful LOGIN audit event.
        DB::table('users')
            ->whereExists(function ($query) {
                $query->selectRaw('1')
                    ->from('audit_logs')
                    ->whereColumn('audit_logs.actor_user_id', 'users.id')
                    ->where('audit_logs.action', 'LOGIN')
                    ->where('audit_logs.status', 'SUCCESS');
            })
            ->update([
                'first_login_at' => DB::raw(
                    "(SELECT MIN(audit_logs.created_at) FROM audit_logs"
                    ." WHERE audit_logs.actor_user_id = users.id"
                    ." AND audit_logs.action = 'LOGIN' AND audit_logs.status = 'SUCCESS')"
                ),
            ]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('first_login_at');
        });
    }
};
