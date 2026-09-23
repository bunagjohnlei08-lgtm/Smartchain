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
            $table->string('capacity_alert_level', 10)->default('NORMAL')->after('capacity');
        });

        DB::table('warehouses')->orderBy('id')->each(function ($warehouse): void {
            $utilized = (int) DB::table('inventories')->where('warehouse_id', $warehouse->id)
                ->sum(DB::raw('available_stock + reserved_stock'));
            $level = ($warehouse->capacity === null || (int) $warehouse->capacity <= 0)
                ? 'NORMAL'
                : ($utilized >= (int) $warehouse->capacity ? 'FULL'
                    : ($utilized / (int) $warehouse->capacity * 100 >= 95 ? 'WARNING' : 'NORMAL'));
            DB::table('warehouses')->where('id', $warehouse->id)->update(['capacity_alert_level' => $level]);
        });
    }

    public function down(): void
    {
        Schema::table('warehouses', fn (Blueprint $table) => $table->dropColumn('capacity_alert_level'));
    }
};
