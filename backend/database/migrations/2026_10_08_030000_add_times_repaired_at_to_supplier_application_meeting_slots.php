<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Marks slots corrected by supplier-meetings:repair-pre-fix-times so a rerun never shifts them twice. */
    public function up(): void
    {
        Schema::table('supplier_application_meeting_slots', function (Blueprint $table) {
            $table->timestamp('times_repaired_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('supplier_application_meeting_slots', function (Blueprint $table) {
            $table->dropColumn('times_repaired_at');
        });
    }
};
