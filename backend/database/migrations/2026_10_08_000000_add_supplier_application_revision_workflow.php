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
            $table->json('revision_reason_codes')->nullable()->after('supplier_message');
            $table->json('decision_reason_codes')->nullable()->after('revision_reason_codes');
            $table->text('alternative_schedule_message')->nullable()->after('decision_reason_codes');
            $table->timestampTz('alternative_schedule_requested_at')->nullable()->after('alternative_schedule_message');
        });

        Schema::table('supplier_application_attachments', function (Blueprint $table) {
            $table->boolean('is_current')->default(true)->after('file_sha256');
            $table->timestampTz('replaced_at')->nullable()->after('is_current');
            $table->index(
                ['supplier_application_id', 'attachment_type', 'is_current'],
                'supplier_application_current_attachment_index',
            );
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS supplier_applications_one_active_email');
            DB::statement("CREATE UNIQUE INDEX supplier_applications_one_active_email ON supplier_applications (normalized_email) WHERE status IN ('PENDING', 'UNDER_REVIEW', 'NEEDS_REVISION', 'QUALIFIED_FOR_MEETING', 'MEETING_SCHEDULED', 'MEETING_COMPLETED')");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS supplier_applications_one_active_email');
            DB::statement("CREATE UNIQUE INDEX supplier_applications_one_active_email ON supplier_applications (normalized_email) WHERE status IN ('PENDING', 'UNDER_REVIEW', 'QUALIFIED_FOR_MEETING', 'MEETING_SCHEDULED', 'MEETING_COMPLETED')");
        }

        Schema::table('supplier_application_attachments', function (Blueprint $table) {
            $table->dropIndex('supplier_application_current_attachment_index');
            $table->dropColumn(['is_current', 'replaced_at']);
        });

        Schema::table('supplier_applications', function (Blueprint $table) {
            $table->dropColumn([
                'revision_reason_codes',
                'decision_reason_codes',
                'alternative_schedule_message',
                'alternative_schedule_requested_at',
            ]);
        });
    }
};
