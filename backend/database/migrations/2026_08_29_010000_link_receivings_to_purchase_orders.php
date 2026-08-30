<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('receivings', function (Blueprint $table) {
            $table->foreignId('purchase_order_id')->nullable()->after('id')->constrained()->restrictOnDelete();
        });
        Schema::table('receiving_items', function (Blueprint $table) {
            $table->unsignedInteger('ordered_quantity')->nullable()->after('product_name');
        });
    }

    public function down(): void
    {
        Schema::table('receiving_items', fn (Blueprint $table) => $table->dropColumn('ordered_quantity'));
        Schema::table('receivings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('purchase_order_id');
        });
    }
};
