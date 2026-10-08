<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_supplier', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('supplier_id')->constrained()->cascadeOnDelete();
            $table->boolean('is_primary')->default(false);
            $table->timestamps();
            $table->unique(['product_id', 'supplier_id']);
        });
        DB::statement('CREATE UNIQUE INDEX product_supplier_one_primary ON product_supplier (product_id) WHERE is_primary');

        // Never merge or delete inventory rows to satisfy the constraint.
        $duplicates = DB::table('inventories')->select('product_id', 'warehouse_id')
            ->groupBy('product_id', 'warehouse_id')->havingRaw('COUNT(*) > 1')->count();
        if ($duplicates > 0) {
            throw new RuntimeException("Found {$duplicates} duplicate product/warehouse inventory groups. Resolve them manually before migrating.");
        }
        Schema::table('inventories', function (Blueprint $table) {
            $table->unique(['product_id', 'warehouse_id'], 'inventories_product_warehouse_unique');
        });
    }

    public function down(): void
    {
        Schema::table('inventories', function (Blueprint $table) {
            $table->dropUnique('inventories_product_warehouse_unique');
        });
        Schema::dropIfExists('product_supplier');
    }
};
