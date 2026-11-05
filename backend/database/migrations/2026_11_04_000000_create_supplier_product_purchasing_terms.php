<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supplier_product_purchasing_terms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained()->restrictOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->string('unit', 20);
            $table->decimal('agreed_unit_price', 14, 2);
            $table->char('currency', 3)->default('PHP');
            $table->unsignedInteger('delivery_lead_time_days');
            $table->string('lead_time_basis', 20);
            $table->string('lead_time_start_event', 32);
            $table->unsignedInteger('minimum_order_quantity')->nullable();
            $table->unsignedInteger('order_multiple')->nullable();
            $table->unsignedInteger('maximum_order_quantity')->nullable();
            $table->date('effective_from');
            $table->date('effective_until')->nullable();
            $table->string('status', 20)->index();
            $table->string('agreement_reference', 255)->nullable();
            $table->foreignId('verified_by')->constrained('users')->restrictOnDelete();
            $table->timestampTz('verified_at');
            $table->timestamps();
            $table->index(['supplier_id', 'product_id', 'status'], 'purchasing_terms_lookup');
        });

        DB::statement("ALTER TABLE supplier_product_purchasing_terms ADD CONSTRAINT purchasing_terms_price_nonnegative CHECK (agreed_unit_price >= 0)");
        DB::statement("ALTER TABLE supplier_product_purchasing_terms ADD CONSTRAINT purchasing_terms_date_order CHECK (effective_until IS NULL OR effective_until >= effective_from)");
        DB::statement("ALTER TABLE supplier_product_purchasing_terms ADD CONSTRAINT purchasing_terms_quantity_order CHECK (maximum_order_quantity IS NULL OR minimum_order_quantity IS NULL OR maximum_order_quantity >= minimum_order_quantity)");

        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->foreignId('supplier_product_purchasing_term_id')->nullable()->after('supplier_award_line_id')
                ->constrained('supplier_product_purchasing_terms')->restrictOnDelete();
            $table->string('price_source', 32)->nullable();
            $table->string('agreement_reference', 255)->nullable();
            $table->unsignedInteger('delivery_lead_time_days')->nullable();
            $table->string('lead_time_basis', 20)->nullable();
            $table->string('lead_time_start_event', 32)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('supplier_product_purchasing_term_id');
            $table->dropColumn(['price_source', 'agreement_reference', 'delivery_lead_time_days', 'lead_time_basis', 'lead_time_start_event']);
        });
        Schema::dropIfExists('supplier_product_purchasing_terms');
    }
};
