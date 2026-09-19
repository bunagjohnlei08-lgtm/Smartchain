<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Invited accounts have no password until the invitee sets one.
        // Existing rows and their password hashes are left untouched.
        Schema::table('users', function (Blueprint $table) {
            $table->string('password')->nullable()->change();
            $table->timestamp('invited_at')->nullable();
            $table->timestamp('activated_at')->nullable();
        });
    }

    public function down(): void
    {
        if (DB::table('users')->whereNull('password')->exists()) {
            throw new RuntimeException('Cannot make users.password required while accounts without a password exist.');
        }

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['invited_at', 'activated_at']);
            $table->string('password')->nullable(false)->change();
        });
    }
};
