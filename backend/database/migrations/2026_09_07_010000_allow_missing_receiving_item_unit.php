<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE receiving_items ALTER COLUMN unit DROP NOT NULL, ALTER COLUMN unit DROP DEFAULT');
    }

    public function down(): void
    {
        if (DB::table('receiving_items')->whereNull('unit')->exists()) {
            throw new RuntimeException('Cannot restore required receiving item units while NULL values exist.');
        }

        DB::statement("ALTER TABLE receiving_items ALTER COLUMN unit SET NOT NULL, ALTER COLUMN unit SET DEFAULT 'pcs'");
    }
};
