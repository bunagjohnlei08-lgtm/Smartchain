<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->foreignId('replenishment_request_id')->nullable()->unique()
                ->after('id')->constrained('replenishment_requests')->restrictOnDelete();
            $table->date('expected_delivery_date')->after('delivery_details');
        });
    }

    public function down(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('replenishment_request_id');
            $table->dropColumn('expected_delivery_date');
        });
    }
};
