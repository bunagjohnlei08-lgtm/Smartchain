<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE supplier_application_attachments DROP CONSTRAINT IF EXISTS supplier_application_attachment_type_unique');
            DB::statement('CREATE INDEX IF NOT EXISTS supplier_application_attachment_type_index ON supplier_application_attachments (supplier_application_id, attachment_type)');
        }
    }

    public function down(): void
    {
        // Do not restore the former unique constraint: applications created
        // after this migration can legitimately have several files per type.
    }
};
