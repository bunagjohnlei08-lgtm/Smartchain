<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_orders', function (Blueprint $table) {
            $table->id();
            $table->string('po_number')->unique();
            $table->string('supplier_name');
            $table->text('delivery_details');
            $table->decimal('total_amount', 14, 2);
            $table->string('status', 32)->default('Approved')->index();
            $table->foreignId('approved_by')->constrained('users')->restrictOnDelete();
            $table->longText('signature_data')->nullable();
            $table->timestamps();
        });

        Schema::create('purchase_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_order_id')->constrained()->cascadeOnDelete();
            $table->string('product_name');
            $table->unsignedInteger('ordered_quantity');
            $table->decimal('unit_price', 14, 2);
            $table->decimal('total_price', 14, 2);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_order_items');
        Schema::dropIfExists('purchase_orders');
    }
};
