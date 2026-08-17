<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('receivings', function (Blueprint $table) {
            $table->id();
            $table->string('receiving_no')->unique();
            $table->string('purchase_order');
            $table->string('supplier');
            $table->string('reference_no')->nullable();
            $table->date('delivery_date');
            $table->string('status')->default('Pending QA');
            $table->foreignId('prepared_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('receivings');
    }
};
