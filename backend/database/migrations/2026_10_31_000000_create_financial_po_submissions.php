<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('financial_po_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_order_id')->unique()->constrained()->restrictOnDelete();
            $table->uuid('message_id')->unique();
            $table->string('state', 40)->default('PENDING')->index();
            $table->string('payload_version', 20)->default('1.0');
            $table->char('payload_sha256', 64);
            $table->json('payload_snapshot');
            $table->string('financial_reference', 255)->nullable()->index();
            $table->string('partner_acknowledgment', 80)->nullable();
            $table->unsignedSmallInteger('retry_count')->default(0);
            $table->timestampTz('next_attempt_at')->nullable();
            $table->timestampTz('submitted_at')->nullable();
            $table->timestampTz('acknowledged_at')->nullable();
            $table->string('last_error_code', 80)->nullable();
            $table->string('last_error_message', 500)->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('financial_po_submission_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('financial_po_submission_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('attempt_number');
            $table->uuid('correlation_id')->unique();
            $table->string('result', 40)->default('STARTED');
            $table->unsignedSmallInteger('http_status')->nullable();
            $table->string('error_code', 80)->nullable();
            $table->string('safe_message', 500)->nullable();
            $table->timestampTz('started_at');
            $table->timestampTz('completed_at')->nullable();
            $table->timestamps();
            $table->unique(['financial_po_submission_id', 'attempt_number'], 'financial_po_attempt_number_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('financial_po_submission_attempts');
        Schema::dropIfExists('financial_po_submissions');
    }
};
