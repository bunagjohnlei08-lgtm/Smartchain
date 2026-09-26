<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Lightweight generation history for Admin Reports. Only metadata is kept:
     * report content is never stored, and files are generated on demand.
     */
    public function up(): void
    {
        Schema::create('report_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('report_key', 64);
            $table->string('format', 10);
            $table->string('frequency', 10);
            $table->string('run_time', 5);
            $table->unsignedTinyInteger('day_of_week')->nullable();
            $table->unsignedTinyInteger('day_of_month')->nullable();
            $table->string('date_window', 20)->default('ALL');
            $table->json('filters')->nullable();
            // Delivery is restricted to an active Admin account; no free-form addresses.
            $table->foreignId('recipient_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 10)->default('ACTIVE')->index();
            $table->timestamp('next_run_at')->nullable()->index();
            $table->timestamp('last_run_at')->nullable();
            $table->string('last_status', 10)->nullable();
            $table->string('last_error', 255)->nullable();
            $table->timestamps();
        });

        Schema::create('report_exports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('report_schedule_id')->nullable()->constrained('report_schedules')->nullOnDelete();
            $table->string('action', 10);
            $table->string('source', 12)->default('STANDARD');
            $table->string('report_key', 64)->index();
            $table->string('report_name', 150);
            $table->string('category', 64);
            $table->string('format', 10)->nullable();
            $table->json('filters')->nullable();
            $table->string('status', 10)->index();
            $table->unsignedInteger('row_count')->nullable();
            $table->string('file_name', 200)->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->string('error_message', 255)->nullable();
            $table->timestamp('generated_at')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_exports');
        Schema::dropIfExists('report_schedules');
    }
};
