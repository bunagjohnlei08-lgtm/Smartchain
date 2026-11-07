<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('customer_returns', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 48)->unique();
            $table->uuid('submission_key')->unique();
            $table->char('request_hash', 64);
            $table->foreignId('order_id')->constrained()->restrictOnDelete();
            $table->foreignId('order_item_id')->constrained()->restrictOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->foreignId('inventory_id')->constrained('inventories')->restrictOnDelete();
            $table->string('unit', 20);
            $table->string('reason', 40);
            $table->string('status', 32)->default('REQUESTED')->index();
            $table->string('verification_status', 40);
            $table->unsignedInteger('requested_quantity');
            $table->unsignedInteger('reserved_quantity');
            foreach (['received_quantity','passed_quantity','failed_quantity','restocked_quantity','disposed_quantity'] as $column) $table->unsignedInteger($column)->default(0);
            $table->string('restock_status', 24)->default('NOT_ELIGIBLE');
            $table->string('disposal_status', 24)->default('NOT_REQUIRED');
            $table->foreignId('requested_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignId('received_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignId('qa_user_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('received_at')->nullable();
            $table->timestamp('inspected_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->string('condition', 32)->nullable();
            $table->text('verification_reference')->nullable();
            $table->text('receipt_shortage_reason')->nullable();
            $table->text('qa_findings')->nullable();
            $table->text('suitability_reference')->nullable();
            $table->timestamps();
            $table->index(['order_item_id','warehouse_id','status']);
        });
        DB::statement('ALTER TABLE customer_returns ADD CONSTRAINT customer_returns_quantities CHECK (requested_quantity > 0 AND reserved_quantity >= 0 AND received_quantity >= 0 AND received_quantity <= requested_quantity AND passed_quantity >= 0 AND failed_quantity >= 0 AND passed_quantity + failed_quantity <= received_quantity AND restocked_quantity >= 0 AND restocked_quantity <= passed_quantity AND disposed_quantity >= 0 AND disposed_quantity <= failed_quantity)');
        Schema::create('customer_return_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_return_id')->constrained()->restrictOnDelete();
            $table->string('action', 32);
            $table->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $table->json('details');
            $table->timestamp('created_at');
            $table->unique(['customer_return_id','action']);
        });
        Schema::create('customer_return_evidence', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_return_id')->constrained()->restrictOnDelete();
            $table->foreignId('uploaded_by')->constrained('users')->restrictOnDelete();
            $table->string('stage', 32);
            $table->string('original_name');
            $table->string('stored_path');
            $table->string('mime_type', 100);
            $table->unsignedInteger('file_size');
            $table->char('sha256', 64);
            $table->timestamp('created_at');
            $table->unique(['customer_return_id','stage','sha256']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_return_evidence');
        Schema::dropIfExists('customer_return_events');
        Schema::dropIfExists('customer_returns');
    }
};
