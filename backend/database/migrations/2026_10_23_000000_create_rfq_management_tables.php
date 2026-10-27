<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('replenishment_requests', function (Blueprint $table) {
            $table->string('sourcing_method', 32)->nullable()->index();
            $table->foreignId('sourcing_selected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('sourcing_selected_at')->nullable();
        });

        Schema::create('rfqs', function (Blueprint $table) {
            $table->id();
            $table->string('rfq_number', 40)->unique();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('status', 32)->default('DRAFT')->index();
            $table->timestampTz('opens_at');
            $table->timestampTz('closes_at')->index();
            $table->date('required_delivery_date');
            $table->text('delivery_destination');
            $table->boolean('partial_offers_allowed')->default(false);
            $table->boolean('split_awards_allowed')->default(false);
            $table->decimal('minimum_decrement', 14, 2)->default(0);
            $table->char('currency', 3)->default('PHP');
            $table->boolean('show_reference_price')->default(false);
            $table->boolean('show_lowest_bid')->default(false);
            $table->json('eligibility_criteria')->nullable();
            $table->json('mandatory_compliance')->nullable();
            $table->json('evaluation_criteria')->nullable();
            $table->text('procurement_remarks')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('approved_at')->nullable();
            $table->foreignId('published_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('published_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('cancelled_at')->nullable();
            $table->text('cancellation_reason')->nullable();
            $table->timestamps();
        });

        Schema::create('rfq_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('rfq_id')->constrained()->cascadeOnDelete();
            $table->foreignId('replenishment_request_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->string('product_name');
            $table->string('category')->nullable()->index();
            $table->string('unit', 16);
            $table->unsignedInteger('required_quantity');
            $table->text('public_specification');
            $table->decimal('reference_unit_price', 14, 2)->nullable();
            $table->boolean('publish_reference_price')->default(false);
            $table->string('public_image_path')->nullable();
            $table->timestamps();
            $table->unique(['rfq_id', 'product_id']);
        });

        Schema::create('rfq_amendments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('rfq_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('version');
            $table->text('reason');
            $table->json('changes');
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->unique(['rfq_id', 'version']);
        });

        Schema::create('supplier_bidding_interests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rfq_line_id')->constrained()->cascadeOnDelete();
            $table->foreignId('selected_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['supplier_id', 'rfq_line_id']);
        });

        Schema::create('supplier_application_bidding_interests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_application_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rfq_line_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['supplier_application_id', 'rfq_line_id'], 'supplier_application_interest_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_application_bidding_interests');
        Schema::dropIfExists('supplier_bidding_interests');
        Schema::dropIfExists('rfq_amendments');
        Schema::dropIfExists('rfq_lines');
        Schema::dropIfExists('rfqs');
        Schema::table('replenishment_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('sourcing_selected_by');
            $table->dropColumn(['sourcing_method', 'sourcing_selected_at']);
        });
    }
};
