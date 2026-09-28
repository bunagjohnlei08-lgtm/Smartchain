<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shipment_packings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('package_id', 32)->nullable()->unique();
            $table->unsignedInteger('number_of_boxes')->nullable();
            $table->decimal('estimated_weight_kg', 10, 2)->nullable();
            $table->boolean('is_fragile')->default(false);
            $table->text('packing_notes')->nullable();
            $table->boolean('correct_product')->default(false);
            $table->boolean('correct_quantity')->default(false);
            $table->boolean('package_condition')->default(false);
            $table->boolean('items_complete')->default(false);
            $table->foreignId('packed_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('packed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shipment_packings');
    }
};
