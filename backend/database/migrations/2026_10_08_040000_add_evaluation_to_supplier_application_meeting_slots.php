<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Structured internal meeting evaluation; free-text notes stay in evaluation_notes. */
    public function up(): void
    {
        Schema::table('supplier_application_meeting_slots', function (Blueprint $table) {
            $table->json('evaluation')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('supplier_application_meeting_slots', function (Blueprint $table) {
            $table->dropColumn('evaluation');
        });
    }
};
