<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('warehouses', function (Blueprint $table) {
            $table->integer('capacity_powder')->nullable();
            $table->integer('capacity_liquid')->nullable();
            $table->integer('capacity_solid')->nullable();
            $table->integer('capacity_returned')->nullable();
        });

        DB::statement('ALTER TABLE warehouses ADD CONSTRAINT warehouse_storage_area_allocations_valid CHECK (
            (capacity_powder IS NULL AND capacity_liquid IS NULL AND capacity_solid IS NULL AND capacity_returned IS NULL)
            OR (capacity IS NOT NULL AND capacity_powder IS NOT NULL AND capacity_liquid IS NOT NULL
                AND capacity_solid IS NOT NULL AND capacity_returned IS NOT NULL
                AND capacity_powder >= 0 AND capacity_liquid >= 0 AND capacity_solid >= 0 AND capacity_returned >= 0
                AND capacity::bigint = capacity_powder::bigint + capacity_liquid::bigint + capacity_solid::bigint + capacity_returned::bigint)
        )');

        Schema::table('inventories', function (Blueprint $table) {
            $table->integer('returned_stock')->default(0);
        });
        DB::statement('ALTER TABLE inventories ADD CONSTRAINT inventories_returned_stock_nonnegative CHECK (returned_stock >= 0)');

        Schema::create('inventory_return_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('inventory_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->foreignId('performed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('direction', 20);
            $table->string('source_bucket', 20);
            $table->string('unit', 50);
            $table->unsignedInteger('quantity');
            $table->string('source_type', 80)->nullable();
            $table->string('source_reference', 255)->nullable();
            $table->string('idempotency_key', 120)->nullable()->unique();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_return_movements');
        DB::statement('ALTER TABLE inventories DROP CONSTRAINT IF EXISTS inventories_returned_stock_nonnegative');
        Schema::table('inventories', fn (Blueprint $table) => $table->dropColumn('returned_stock'));
        DB::statement('ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS warehouse_storage_area_allocations_valid');
        Schema::table('warehouses', fn (Blueprint $table) => $table->dropColumn([
            'capacity_powder', 'capacity_liquid', 'capacity_solid', 'capacity_returned',
        ]));
    }
};
