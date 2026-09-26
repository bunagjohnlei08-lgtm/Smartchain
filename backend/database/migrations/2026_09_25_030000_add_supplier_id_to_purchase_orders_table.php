<?php

use App\Support\PurchaseOrderSupplier;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->foreignId('supplier_id')->nullable()->after('replenishment_request_id')
                ->constrained('suppliers')->nullOnDelete();
        });

        app(PurchaseOrderSupplier::class)->backfillMissingSupplierIds();
    }

    public function down(): void
    {
        Schema::table('purchase_orders', fn (Blueprint $table) => $table->dropConstrainedForeignId('supplier_id'));
    }
};
