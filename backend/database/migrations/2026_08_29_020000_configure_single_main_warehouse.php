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
            $table->text('address')->nullable()->after('code');
            $table->decimal('latitude', 10, 7)->nullable()->after('address');
            $table->decimal('longitude', 10, 7)->nullable()->after('latitude');
            $table->unsignedBigInteger('capacity')->nullable()->after('longitude');
            $table->string('status', 20)->default('Inactive')->after('capacity')->index();
        });

        $main = DB::table('warehouses')->where('code', 'WH-MAIN')->first()
            ?? DB::table('warehouses')->where('name', 'Main Warehouse')->first()
            ?? DB::table('warehouses')->orderBy('id')->first();
        if (! $main) return;

        DB::table('warehouses')->where('id', '<>', $main->id)->where('code', 'WH-MAIN')
            ->orderBy('id')->get()->each(function ($warehouse): void {
                DB::table('warehouses')->where('id', $warehouse->id)
                    ->update(['code' => 'WH-LEGACY-'.$warehouse->id]);
            });
        DB::table('warehouses')->where('id', $main->id)->update([
            'name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'status' => 'Active',
            'address' => 'G/F, Brgy. New Marikina Subd., 29 Flamingo, Marikina, 1800 Metro Manila',
            'latitude' => 14.6305374, 'longitude' => 121.1010625, 'updated_at' => now(),
        ]);

        $duplicateIds = DB::table('warehouses')->where('id', '<>', $main->id)->pluck('id');
        foreach (['inventories', 'users', 'receiving_items', 'replenishment_requests', 'stock_out_transactions'] as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'warehouse_id')) {
                DB::table($table)->whereIn('warehouse_id', $duplicateIds)->update(['warehouse_id' => $main->id]);
            }
        }
        DB::table('warehouses')->whereIn('id', $duplicateIds)->update(['status' => 'Inactive']);
    }

    public function down(): void
    {
        Schema::table('warehouses', function (Blueprint $table) {
            $table->dropColumn(['address', 'latitude', 'longitude', 'capacity', 'status']);
        });
    }
};
