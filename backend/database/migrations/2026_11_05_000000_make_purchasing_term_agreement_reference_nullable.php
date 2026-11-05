<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('supplier_product_purchasing_terms', function (Blueprint $table) {
            $table->string('agreement_reference', 255)->nullable()->change();
        });
    }

    public function down(): void
    {
        // Forward-only: restoring NOT NULL could destroy or invalidate legitimate null references.
    }
};
