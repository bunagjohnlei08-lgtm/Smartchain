<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('receiving_discrepancies', function (Blueprint $table) {
            $table->string('contact_method', 20)->nullable()->after('reported_at');
            $table->text('contact_note')->nullable()->after('contact_method');
            $table->foreignId('contacted_by_id')->nullable()->after('contact_note')->constrained('users')->nullOnDelete();
            $table->timestamp('contacted_at')->nullable()->after('contacted_by_id');
            $table->string('supplier_response_code', 32)->nullable()->after('supplier_response');
            $table->text('response_notes')->nullable()->after('supplier_response_code');
            $table->date('expected_balance_delivery_date')->nullable()->after('response_notes');
            $table->foreignId('responded_by_id')->nullable()->after('expected_balance_delivery_date')->constrained('users')->nullOnDelete();
            $table->timestamp('responded_at')->nullable()->after('responded_by_id');
            $table->foreignId('resolved_by_receiving_id')->nullable()->after('resolved_by_id')->constrained('receivings')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('receiving_discrepancies', function (Blueprint $table) {
            $table->dropConstrainedForeignId('resolved_by_receiving_id');
            $table->dropConstrainedForeignId('responded_by_id');
            $table->dropConstrainedForeignId('contacted_by_id');
            $table->dropColumn([
                'contact_method', 'contact_note', 'contacted_at', 'supplier_response_code',
                'response_notes', 'expected_balance_delivery_date', 'responded_at',
            ]);
        });
    }
};
