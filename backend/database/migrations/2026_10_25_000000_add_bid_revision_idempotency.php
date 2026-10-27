<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('supplier_bid_revisions', function (Blueprint $table) {
            $table->string('idempotency_key', 80)->nullable()->after('submitted_at');
            $table->char('request_fingerprint', 64)->nullable()->after('idempotency_key');
            $table->unique(['supplier_bid_line_id', 'idempotency_key'], 'bid_revision_idempotency_unique');
        });
    }

    public function down(): void
    {
        Schema::table('supplier_bid_revisions', function (Blueprint $table) {
            $table->dropUnique('bid_revision_idempotency_unique');
            $table->dropColumn(['idempotency_key', 'request_fingerprint']);
        });
    }
};
