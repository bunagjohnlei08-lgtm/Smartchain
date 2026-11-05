<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('qa_inspections', function (Blueprint $table) {
            $table->dropUnique(['receiving_id']);
            $table->unsignedInteger('cycle_number')->default(1)->after('receiving_id');
            $table->unique(['receiving_id', 'cycle_number'], 'qa_inspections_receiving_cycle_unique');
        });
    }

    public function down(): void
    {
        Schema::table('qa_inspections', function (Blueprint $table) {
            $table->dropUnique('qa_inspections_receiving_cycle_unique');
            $table->dropColumn('cycle_number');
            $table->unique('receiving_id');
        });
    }
};
