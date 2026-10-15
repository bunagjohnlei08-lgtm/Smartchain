<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('boms', fn (Blueprint $table) => $table->unsignedInteger('minimum_processing_minutes')->default(30));
        Schema::table('production_batches', function (Blueprint $table) {
            // NULL identifies legacy snapshots; do not fabricate historic start/deadline values.
            $table->unsignedInteger('minimum_processing_minutes')->nullable();
            $table->timestamp('production_started_at')->nullable();
            $table->timestamp('output_available_at')->nullable();
        });
        DB::statement('ALTER TABLE boms ADD CONSTRAINT bom_processing_time_positive CHECK (minimum_processing_minutes BETWEEN 1 AND 2147483647)');
        DB::statement('ALTER TABLE production_batches ADD CONSTRAINT batch_processing_time_positive CHECK (minimum_processing_minutes IS NULL OR minimum_processing_minutes BETWEEN 1 AND 2147483647)');
    }
    public function down(): void
    {
        DB::statement('ALTER TABLE production_batches DROP CONSTRAINT IF EXISTS batch_processing_time_positive');
        Schema::table('production_batches', fn (Blueprint $table) => $table->dropColumn(['minimum_processing_minutes', 'production_started_at', 'output_available_at']));
        DB::statement('ALTER TABLE boms DROP CONSTRAINT IF EXISTS bom_processing_time_positive');
        Schema::table('boms', fn (Blueprint $table) => $table->dropColumn('minimum_processing_minutes'));
    }
};
