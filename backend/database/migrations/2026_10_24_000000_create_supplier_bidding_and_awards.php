<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('supplier_quotations', function (Blueprint $table) {
            $table->id(); $table->string('quotation_number', 48)->unique();
            $table->foreignId('rfq_id')->constrained()->restrictOnDelete();
            $table->foreignId('supplier_id')->constrained()->restrictOnDelete();
            $table->foreignId('submitted_by')->constrained('users')->restrictOnDelete();
            $table->string('currency', 3); $table->string('status', 24)->default('SUBMITTED')->index();
            $table->string('idempotency_key', 80); $table->unsignedInteger('rfq_version');
            $table->boolean('tax_included')->default(false); $table->boolean('freight_included')->default(false);
            $table->text('commercial_terms')->nullable(); $table->timestampTz('submitted_at'); $table->timestamps();
            $table->unique(['supplier_id','rfq_id']); $table->unique(['supplier_id','idempotency_key']);
        });
        Schema::create('supplier_bid_lines', function (Blueprint $table) {
            $table->id(); $table->foreignId('supplier_quotation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rfq_line_id')->constrained()->restrictOnDelete();
            $table->string('status', 24)->default('SUBMITTED')->index(); $table->unsignedInteger('current_revision_number')->default(1);
            $table->timestamps(); $table->unique(['supplier_quotation_id','rfq_line_id']); $table->index(['rfq_line_id','status']);
        });
        Schema::create('supplier_bid_revisions', function (Blueprint $table) {
            $table->id(); $table->foreignId('supplier_bid_line_id')->constrained()->cascadeOnDelete();
            $table->foreignId('previous_revision_id')->nullable()->constrained('supplier_bid_revisions')->restrictOnDelete();
            $table->unsignedInteger('revision_number'); $table->unsignedInteger('rfq_version');
            $table->decimal('unit_price',14,2); $table->unsignedInteger('offered_quantity'); $table->unsignedInteger('lead_time_days');
            $table->date('delivery_available_on'); $table->text('remarks')->nullable();
            $table->string('status',24)->default('ACTIVE')->index(); $table->foreignId('submitted_by')->constrained('users')->restrictOnDelete();
            $table->timestampTz('submitted_at'); $table->timestamps();
            $table->unique(['supplier_bid_line_id','revision_number']); $table->index(['supplier_bid_line_id','status']);
        });
        Schema::create('bid_evaluations', function (Blueprint $table) {
            $table->id(); $table->foreignId('supplier_bid_line_id')->constrained()->cascadeOnDelete();
            $table->foreignId('supplier_bid_revision_id')->constrained()->restrictOnDelete();
            $table->boolean('mandatory_passed'); $table->json('mandatory_results')->nullable(); $table->json('criterion_scores')->nullable();
            $table->decimal('weighted_score',7,4)->nullable(); $table->text('qualification_reason')->nullable();
            $table->foreignId('evaluated_by')->constrained('users')->restrictOnDelete(); $table->timestampTz('evaluated_at'); $table->timestamps();
            $table->unique('supplier_bid_line_id');
        });
        Schema::create('supplier_awards', function (Blueprint $table) {
            $table->id(); $table->string('award_number',48)->unique(); $table->foreignId('rfq_id')->constrained()->restrictOnDelete();
            $table->string('outcome',24); $table->string('status',24)->default('APPROVED')->index(); $table->text('justification');
            $table->string('idempotency_key',80)->unique(); $table->foreignId('approved_by')->constrained('users')->restrictOnDelete();
            $table->timestampTz('approved_at'); $table->timestamps(); $table->unique('rfq_id');
        });
        Schema::create('supplier_award_lines', function (Blueprint $table) {
            $table->id(); $table->foreignId('supplier_award_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rfq_line_id')->constrained()->restrictOnDelete(); $table->foreignId('supplier_id')->constrained()->restrictOnDelete();
            $table->foreignId('supplier_bid_revision_id')->constrained()->restrictOnDelete(); $table->unsignedInteger('awarded_quantity');
            $table->decimal('awarded_unit_price',14,2); $table->json('evaluation_snapshot')->nullable(); $table->timestamps();
            $table->unique(['supplier_award_id','rfq_line_id','supplier_id'],'award_line_supplier_unique'); $table->index('rfq_line_id');
        });
    }
    public function down(): void { Schema::dropIfExists('supplier_award_lines');Schema::dropIfExists('supplier_awards');Schema::dropIfExists('bid_evaluations');Schema::dropIfExists('supplier_bid_revisions');Schema::dropIfExists('supplier_bid_lines');Schema::dropIfExists('supplier_quotations'); }
};
