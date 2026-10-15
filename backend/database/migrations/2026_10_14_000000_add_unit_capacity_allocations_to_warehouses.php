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
            // NULL means allocations have not been explicitly configured.
            $table->integer('capacity_kg')->nullable();
            $table->integer('capacity_pcs')->nullable();
            $table->integer('capacity_l')->nullable();
            $table->json('capacity_unit_alert_levels')->nullable();
        });
        DB::statement('ALTER TABLE warehouses ADD CONSTRAINT warehouse_capacity_allocations_valid CHECK (
            (capacity_kg IS NULL AND capacity_pcs IS NULL AND capacity_l IS NULL)
            OR (capacity IS NOT NULL AND capacity_kg IS NOT NULL AND capacity_pcs IS NOT NULL AND capacity_l IS NOT NULL
                AND capacity_kg >= 0 AND capacity_pcs >= 0 AND capacity_l >= 0
                AND capacity::bigint = capacity_kg::bigint + capacity_pcs::bigint + capacity_l::bigint)
        )');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS warehouse_capacity_allocations_valid');
        Schema::table('warehouses', fn (Blueprint $table) => $table->dropColumn([
            'capacity_kg', 'capacity_pcs', 'capacity_l', 'capacity_unit_alert_levels',
        ]));
    }
};
