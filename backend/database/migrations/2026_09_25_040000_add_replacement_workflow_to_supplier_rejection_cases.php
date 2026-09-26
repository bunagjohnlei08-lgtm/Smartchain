<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('supplier_rejection_cases', function (Blueprint $table) {
            $table->string('resolution_type', 30)->nullable()->after('resolution_notes');
            $table->timestamp('routed_to_receiving_at')->nullable()->after('resolution_type');
            $table->foreignId('routed_by_id')->nullable()->after('routed_to_receiving_at')->constrained('users')->nullOnDelete();
        });

        // The unique link makes replacement creation idempotent per rejection case;
        // the original receiving is reachable through the case's QA inspection.
        Schema::table('receivings', function (Blueprint $table) {
            $table->foreignId('replacement_for_rejection_case_id')->nullable()->unique()->after('purchase_order_id')
                ->constrained('supplier_rejection_cases')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('receivings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('replacement_for_rejection_case_id');
        });
        Schema::table('supplier_rejection_cases', function (Blueprint $table) {
            $table->dropConstrainedForeignId('routed_by_id');
            $table->dropColumn(['resolution_type', 'routed_to_receiving_at']);
        });
    }
};
