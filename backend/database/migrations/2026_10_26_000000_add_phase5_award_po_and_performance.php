<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->foreignId('supplier_award_id')->nullable()->after('replenishment_request_id')->constrained()->restrictOnDelete();
            $table->string('conversion_key', 120)->nullable()->unique();
            $table->char('currency', 3)->default('PHP');
            $table->boolean('tax_included')->default(false);
            $table->boolean('freight_included')->default(false);
            $table->text('commercial_terms')->nullable();
            $table->string('agreement_reference')->nullable();
        });
        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->foreignId('supplier_award_line_id')->nullable()->unique()->constrained()->restrictOnDelete();
            $table->foreignId('replenishment_request_id')->nullable()->constrained()->restrictOnDelete();
        });
        Schema::create('purchase_order_acknowledgments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('supplier_id')->constrained()->restrictOnDelete();
            $table->foreignId('acted_by')->constrained('users')->restrictOnDelete();
            $table->string('action', 32)->index();
            $table->text('remarks')->nullable();
            $table->string('idempotency_key', 80);
            $table->timestampTz('acted_at');
            $table->timestamps();
            $table->unique(['purchase_order_id', 'idempotency_key'], 'po_ack_idempotency_unique');
        });
        Schema::create('supplier_performance_snapshots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained()->cascadeOnDelete();
            $table->string('policy_version', 64);
            $table->date('period_from')->nullable();
            $table->date('period_to');
            $table->json('metrics');
            $table->json('counts');
            $table->string('eligibility_status', 32);
            $table->decimal('overall_score', 7, 2)->nullable();
            $table->string('recognition_tier', 80)->nullable();
            $table->foreignId('calculated_by')->constrained('users')->restrictOnDelete();
            $table->timestampTz('calculated_at');
            $table->text('override_reason')->nullable();
            $table->timestamps();
            $table->index(['supplier_id', 'calculated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_performance_snapshots');
        Schema::dropIfExists('purchase_order_acknowledgments');
        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('supplier_award_line_id');
            $table->dropConstrainedForeignId('replenishment_request_id');
        });
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('supplier_award_id');
            $table->dropColumn(['conversion_key','currency','tax_included','freight_included','commercial_terms','agreement_reference']);
        });
    }
};
