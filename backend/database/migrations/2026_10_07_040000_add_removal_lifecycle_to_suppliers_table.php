<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->timestamp('removal_requested_at')->nullable()->index()->after('status');
            $table->foreignId('removal_requested_by_id')->nullable()->after('removal_requested_at')
                ->constrained('users')->nullOnDelete();
            $table->timestamp('archived_at')->nullable()->after('removal_requested_by_id');
        });
    }

    public function down(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->dropConstrainedForeignId('removal_requested_by_id');
            $table->dropIndex(['removal_requested_at']);
            $table->dropColumn(['removal_requested_at', 'archived_at']);
        });
    }
};
