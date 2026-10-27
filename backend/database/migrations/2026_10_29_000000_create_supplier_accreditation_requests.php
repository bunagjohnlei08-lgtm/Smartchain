<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supplier_accreditation_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained()->cascadeOnDelete();
            $table->foreignId('submitted_by_id')->constrained('users')->restrictOnDelete();
            $table->string('request_type', 32)->index();
            $table->string('status', 32)->default('PENDING')->index();
            $table->json('requested_categories')->nullable();
            $table->text('supplier_reason')->nullable();
            $table->text('admin_reason')->nullable();
            $table->date('proposed_expires_on')->nullable();
            $table->json('previous_state')->nullable();
            $table->json('approved_state')->nullable();
            $table->foreignId('reviewed_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('submitted_at');
            $table->timestampTz('reviewed_at')->nullable();
            $table->unsignedInteger('lock_version')->default(1);
            $table->timestampsTz();
            $table->index(['supplier_id', 'status']);
        });

        Schema::create('supplier_accreditation_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_accreditation_request_id')->constrained()->cascadeOnDelete();
            $table->string('document_type', 32)->index();
            $table->string('original_name');
            $table->string('stored_path');
            $table->string('mime_type', 100);
            $table->unsignedBigInteger('file_size');
            $table->char('file_sha256', 64);
            $table->string('verification_status', 32)->default('PENDING_VERIFICATION')->index();
            $table->date('valid_from')->nullable();
            $table->date('expires_on')->nullable();
            $table->text('verification_reason')->nullable();
            $table->foreignId('verified_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('verified_at')->nullable();
            $table->timestampsTz();
        });

        Schema::create('supplier_accreditation_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_accreditation_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('event_type', 40)->index();
            $table->text('message');
            $table->json('metadata')->nullable();
            $table->timestampTz('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_accreditation_events');
        Schema::dropIfExists('supplier_accreditation_documents');
        Schema::dropIfExists('supplier_accreditation_requests');
    }
};
