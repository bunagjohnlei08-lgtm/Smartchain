<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('replenishment_requests', function (Blueprint $table) {
            $table->id();
            $table->string('request_no')->unique();

            // Request payload as submitted by the Plant Manager.
            $table->foreignId('requested_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->unsignedInteger('requested_qty');
            $table->string('priority', 16)->default('Medium')->index();
            $table->string('status', 32)->default('Draft')->index();
            $table->dateTime('submitted_at')->nullable()->index();

            // Admin Procurement decision.
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('reviewed_at')->nullable();
            $table->text('admin_decision')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('replenishment_requests');
    }
};
