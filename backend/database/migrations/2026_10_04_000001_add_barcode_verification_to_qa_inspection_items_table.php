<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('qa_inspection_items', function (Blueprint $table) {
            $table->string('verified_barcode')->nullable()->after('remarks');
            $table->timestamp('barcode_verified_at')->nullable()->after('verified_barcode');
            $table->foreignId('barcode_verified_by_id')->nullable()->after('barcode_verified_at')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('qa_inspection_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('barcode_verified_by_id');
            $table->dropColumn(['verified_barcode', 'barcode_verified_at']);
        });
    }
};
