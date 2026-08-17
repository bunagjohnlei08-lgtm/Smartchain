<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('receiving_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('receiving_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('product_name');
            $table->unsignedInteger('delivered_quantity');
            $table->string('unit')->default('pcs');
            $table->string('inspection_status')->default('Pending QA');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('receiving_items');
    }
};
