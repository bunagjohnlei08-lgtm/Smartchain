<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('supplier_applications', function (Blueprint $table) {
            $table->text('supplier_message')->nullable()->after('decision_reason');
        });

        Schema::create('supplier_application_accesses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_application_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('link_token_hash', 64)->unique();
            $table->timestamp('link_expires_at');
            $table->string('session_token_hash', 64)->nullable()->unique();
            $table->timestamp('session_expires_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamp('last_accessed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('supplier_application_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_application_id')->constrained()->cascadeOnDelete();
            $table->string('event_type', 60);
            $table->string('title', 160);
            $table->text('description')->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();
            $table->index(['supplier_application_id', 'occurred_at']);
        });

        Schema::create('supplier_application_meeting_slots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_application_id')->constrained()->cascadeOnDelete();
            $table->timestampTz('scheduled_at');
            $table->string('status', 20)->default('AVAILABLE');
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('selected_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->unique(['supplier_application_id', 'scheduled_at']);
            $table->index(['supplier_application_id', 'status', 'scheduled_at'], 'supplier_application_slots_lookup');
        });

        // Final database guard against concurrent requests reserving more than
        // one active slot for the same application.
        DB::statement("CREATE UNIQUE INDEX supplier_application_one_reserved_slot ON supplier_application_meeting_slots (supplier_application_id) WHERE status = 'RESERVED'");
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_application_meeting_slots');
        Schema::dropIfExists('supplier_application_events');
        Schema::dropIfExists('supplier_application_accesses');
        Schema::table('supplier_applications', function (Blueprint $table) {
            $table->dropColumn('supplier_message');
        });
    }
};
