<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supplier_rejection_cases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('qa_inspection_item_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('status', 30)->default('PENDING_REVIEW')->index();
            $table->unsignedInteger('send_attempts')->default(0);
            $table->timestamp('last_send_attempt_at')->nullable();
            $table->timestamp('last_error_at')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->foreignId('sent_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('resolved_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('resolution_notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_rejection_cases');
    }
};
