<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('item_classification', 30)->default('FINISHED_PRODUCT')->index();
        });
        DB::statement("ALTER TABLE products ADD CONSTRAINT product_classification_valid CHECK (item_classification IN ('RAW_MATERIAL', 'FINISHED_PRODUCT'))");
        // The legacy catalog tracked quantities in pieces; retain any explicitly saved unit.
        DB::table('products')->whereNull('unit')->orWhere('unit', '')->update(['unit' => 'PCS']);
        Schema::table('inventories', function (Blueprint $table) {
            $table->timestamp('catalog_setup_at')->nullable();
            $table->boolean('has_stock_history')->default(false);
        });
        Schema::table('purchase_order_items', function (Blueprint $table) {
            // New POs retain identity and unit snapshots even if the catalog name changes.
            // Historical POs are left untouched and continue their existing name fallback.
            $table->foreignId('product_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('unit')->nullable();
            $table->string('item_classification', 30)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('purchase_order_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('product_id');
            $table->dropColumn(['unit', 'item_classification']);
        });
        Schema::table('inventories', fn (Blueprint $table) => $table->dropColumn(['catalog_setup_at', 'has_stock_history']));
        DB::statement('ALTER TABLE products DROP CONSTRAINT IF EXISTS product_classification_valid');
        Schema::table('products', fn (Blueprint $table) => $table->dropColumn('item_classification'));
    }
};
