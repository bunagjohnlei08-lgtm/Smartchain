<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_no')->unique();
            $table->string('reference_no')->nullable()->index();
            $table->string('customer_name')->index();
            $table->text('customer_address')->nullable();
            $table->string('customer_contact')->nullable();
            $table->dateTime('order_date');
            $table->dateTime('required_delivery_date');
            $table->decimal('total_amount', 14, 2)->default(0);
            $table->string('status', 32)->default('NEW')->index();
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('assigned_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
