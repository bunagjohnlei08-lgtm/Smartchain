<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('supplier_application_accesses', function (Blueprint $table) {
            $table->timestamp('link_consumed_at')->nullable()->after('link_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('supplier_application_accesses', function (Blueprint $table) {
            $table->dropColumn('link_consumed_at');
        });
    }
};
