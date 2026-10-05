<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_audit_settings', function (Blueprint $table) {
            $table->id();
            $table->json('audit_months');
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('inventory_audit_cycles', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique();
            $table->string('name');
            $table->date('scheduled_for')->unique();
            $table->string('status')->default('ACTIVE');
            $table->timestamp('due_notified_at')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'scheduled_for']);
        });

        Schema::create('inventory_audit_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_audit_cycle_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inventory_id')->constrained()->restrictOnDelete();
            $table->foreignId('qa_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('previous_item_id')->nullable()->constrained('inventory_audit_items')->nullOnDelete();
            $table->string('audit_reference')->unique();
            $table->unsignedInteger('attempt_number')->default(1);
            $table->unsignedInteger('audited_quantity');
            $table->unsignedInteger('failed_quantity')->default(0);
            $table->string('result');
            $table->string('status');
            $table->string('failure_reason')->nullable();
            $table->text('qa_remarks')->nullable();
            $table->timestamp('submitted_at');
            $table->foreignId('admin_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('admin_remarks')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->unique(['inventory_audit_cycle_id', 'inventory_id', 'attempt_number'], 'inventory_audit_attempt_unique');
            $table->index(['status', 'submitted_at']);
        });

        Schema::create('inventory_audit_evidence', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_audit_item_id')->constrained()->cascadeOnDelete();
            $table->string('original_name');
            $table->string('stored_path')->unique();
            $table->string('mime_type', 100);
            $table->unsignedBigInteger('file_size');
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_audit_evidence');
        Schema::dropIfExists('inventory_audit_items');
        Schema::dropIfExists('inventory_audit_cycles');
        Schema::dropIfExists('inventory_audit_settings');
    }
};
