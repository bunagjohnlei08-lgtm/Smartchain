<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qa_inspection_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('qa_inspection_id')->constrained()->cascadeOnDelete();
            $table->foreignId('receiving_item_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('accepted_quantity')->default(0);
            $table->unsignedInteger('rejected_quantity')->default(0);
            $table->string('inspection_result')->default('Pending');
            $table->text('remarks')->nullable();
            $table->timestamps();

            $table->unique(['qa_inspection_id', 'receiving_item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qa_inspection_items');
    }
};
