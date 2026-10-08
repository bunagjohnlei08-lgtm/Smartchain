<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('supplier_applications', function (Blueprint $table) {
            $table->timestampTz('qualified_at')->nullable();
            $table->foreignId('qualified_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('decided_at')->nullable();
            $table->foreignId('decided_by_id')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::table('supplier_application_meeting_slots', function (Blueprint $table) {
            $table->timestampTz('starts_at')->nullable();
            $table->timestampTz('ends_at')->nullable();
            $table->foreignId('completed_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('evaluation_notes')->nullable();
        });

        DB::table('supplier_application_meeting_slots')->orderBy('id')->each(function ($slot): void {
            $start = \Illuminate\Support\Carbon::parse($slot->scheduled_at);
            DB::table('supplier_application_meeting_slots')->where('id', $slot->id)->update([
                'starts_at' => $start,
                'ends_at' => $start->copy()->addHour(),
            ]);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS supplier_applications_one_active_email');
            DB::statement("CREATE UNIQUE INDEX supplier_applications_one_active_email ON supplier_applications (normalized_email) WHERE status IN ('PENDING', 'UNDER_REVIEW', 'QUALIFIED_FOR_MEETING', 'MEETING_SCHEDULED', 'MEETING_COMPLETED')");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS supplier_applications_one_active_email');
            DB::statement("CREATE UNIQUE INDEX supplier_applications_one_active_email ON supplier_applications (normalized_email) WHERE status IN ('PENDING', 'UNDER_REVIEW')");
        }

        Schema::table('supplier_application_meeting_slots', function (Blueprint $table) {
            $table->dropConstrainedForeignId('completed_by_id');
            $table->dropColumn(['starts_at', 'ends_at', 'evaluation_notes']);
        });
        Schema::table('supplier_applications', function (Blueprint $table) {
            $table->dropConstrainedForeignId('qualified_by_id');
            $table->dropConstrainedForeignId('decided_by_id');
            $table->dropColumn(['qualified_at', 'decided_at']);
        });
    }
};
