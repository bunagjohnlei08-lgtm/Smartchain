<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('excess_delivery_reviews', function (Blueprint $table) {
            $table->id();
            $table->uuid('submission_key')->unique();
            $table->string('delivery_identity', 64)->unique();
            $table->string('reference', 32)->unique();
            $table->foreignId('receiving_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('purchase_order_id')->constrained()->restrictOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->foreignId('submitted_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 48)->default('PENDING_REVIEW')->index();
            $table->string('cost_resolution', 32)->nullable();
            $table->string('financial_reconciliation_status', 40)->default('PENDING_DECISION');
            $table->string('supplier_confirmation_reference')->nullable();
            $table->string('supplier_evidence_path')->nullable();
            $table->string('supplier_evidence_name')->nullable();
            $table->string('supplier_evidence_mime', 100)->nullable();
            $table->string('supplier_evidence_sha256', 64)->nullable();
            $table->text('review_notes')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->foreignId('reviewed_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('excess_delivery_review_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('excess_delivery_review_id')->constrained()->cascadeOnDelete();
            $table->foreignId('receiving_item_id')->nullable()->unique()->constrained()->restrictOnDelete();
            $table->foreignId('purchase_order_item_id')->constrained()->restrictOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('po_remaining_quantity');
            $table->unsignedInteger('actual_delivered_quantity');
            $table->unsignedInteger('excess_quantity');
            $table->string('unit', 20);
            $table->timestamps();
            $table->unique(['excess_delivery_review_id', 'purchase_order_item_id'], 'excess_review_po_item_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('excess_delivery_review_items');
        Schema::dropIfExists('excess_delivery_reviews');
    }
};
