<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->string('bank_name')->nullable();
            $table->text('bank_account')->nullable();
        });

        Schema::create('financial_obligations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_order_id')->constrained()->restrictOnDelete();
            $table->foreignId('receiving_id')->unique()->constrained()->restrictOnDelete();
            $table->uuid('local_reference')->unique();
            $table->string('external_reference_id')->unique();
            $table->string('state', 40)->index();
            $table->decimal('amount', 14, 2);
            $table->string('payload_sha256', 64);
            $table->string('bill_number')->nullable()->unique();
            $table->string('transaction_code')->nullable()->unique();
            $table->string('financial_status')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('acknowledged_at')->nullable();
            $table->string('last_error_code')->nullable();
            $table->text('last_error_message')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('financial_obligation_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('financial_obligation_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('attempt_number');
            $table->string('result', 40);
            $table->unsignedSmallInteger('http_status')->nullable();
            $table->string('error_code')->nullable();
            $table->text('safe_message')->nullable();
            $table->timestamp('started_at');
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->unique(['financial_obligation_id', 'attempt_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('financial_obligation_attempts');
        Schema::dropIfExists('financial_obligations');
        Schema::table('suppliers', function (Blueprint $table) {
            $table->dropColumn(['bank_name', 'bank_account']);
        });
    }
};
