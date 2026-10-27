<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->foreignId('created_by')->nullable()->after('status')->constrained('users')->restrictOnDelete();
            $table->foreignId('approved_by')->nullable()->change();
        });
    }
    public function down(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('created_by');
        });

        // Intentionally keep approved_by nullable. Reintroducing NOT NULL would
        // invalidate legitimate pending orders or require a fabricated approver.
    }
};
