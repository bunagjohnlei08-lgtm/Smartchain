<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('replenishment_requests', function (Blueprint $table) {
            $table->string('source', 32)->default('MANUAL')->after('requested_qty');
            $table->json('recommendation_snapshot')->nullable()->after('source');
        });
    }

    public function down(): void
    {
        Schema::table('replenishment_requests', fn (Blueprint $table) => $table->dropColumn(['source', 'recommendation_snapshot']));
    }
};
