<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('receiving_items', function (Blueprint $table) {
            $table->foreignId('purchase_order_item_id')->nullable()->after('receiving_id')
                ->constrained('purchase_order_items')->restrictOnDelete();
        });

        Schema::create('receiving_discrepancies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_order_id')->constrained()->restrictOnDelete();
            $table->foreignId('receiving_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->string('discrepancy_type', 32)->default('SHORT_DELIVERY');
            $table->unsignedInteger('expected_quantity');
            $table->unsignedInteger('delivered_quantity');
            $table->unsignedInteger('short_quantity');
            $table->string('status', 40)->default('REPORTED')->index();
            $table->foreignId('reported_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reported_at');
            $table->text('supplier_response')->nullable();
            $table->text('resolution_notes')->nullable();
            $table->foreignId('resolved_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('receiving_discrepancies');
        Schema::table('receiving_items', fn (Blueprint $table) => $table->dropConstrainedForeignId('purchase_order_item_id'));
    }
};
