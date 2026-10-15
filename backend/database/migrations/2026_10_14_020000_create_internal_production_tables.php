<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('boms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->unique()->constrained()->restrictOnDelete();
            $table->unsignedInteger('output_quantity');
            $table->foreignId('updated_by_id')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });
        Schema::create('bom_materials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bom_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->decimal('required_quantity', 16, 6);
            $table->unique(['bom_id', 'product_id']);
            $table->timestamps();
        });
        Schema::create('production_batches', function (Blueprint $table) {
            $table->id();
            $table->string('batch_number')->unique();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->foreignId('bom_id')->constrained()->restrictOnDelete();
            $table->string('product_name');
            $table->string('unit', 50);
            $table->unsignedInteger('target_quantity');
            $table->unsignedInteger('bom_output_quantity');
            $table->string('status', 30)->default('PLANNED')->index();
            $table->foreignId('created_by_id')->constrained('users')->restrictOnDelete();
            $table->timestamp('issued_at')->nullable();
            $table->unsignedInteger('actual_quantity')->nullable();
            $table->timestamp('output_recorded_at')->nullable();
            $table->foreignId('assigned_qa_user_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->unsignedInteger('passed_quantity')->nullable();
            $table->unsignedInteger('failed_quantity')->nullable();
            $table->text('qa_notes')->nullable();
            $table->timestamp('qa_completed_at')->nullable();
            $table->timestamp('stocked_in_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->text('cancellation_reason')->nullable();
            $table->timestamps();
            $table->index(['warehouse_id', 'status']);
        });
        Schema::create('production_batch_materials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('production_batch_id')->constrained()->restrictOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->string('product_name');
            $table->string('unit', 50);
            $table->decimal('bom_quantity', 16, 6);
            $table->unsignedInteger('required_quantity')->nullable();
            $table->string('required_quantity_exact', 80);
            $table->string('blocking_reason')->nullable();
            $table->unsignedInteger('issued_quantity')->default(0);
            $table->string('disposition', 30)->nullable();
            $table->timestamps();
            $table->unique(['production_batch_id', 'product_id']);
        });
        Schema::create('production_material_issues', function (Blueprint $table) {
            $table->id();
            $table->foreignId('production_batch_material_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('inventory_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('quantity');
            $table->foreignId('issued_by_id')->constrained('users')->restrictOnDelete();
            $table->timestamp('issued_at');
        });
        Schema::create('production_non_conformances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('production_batch_id')->unique()->constrained()->restrictOnDelete();
            $table->unsignedInteger('quantity');
            $table->string('disposition', 20)->default('HOLD');
            $table->text('notes');
            $table->foreignId('handled_by_id')->constrained('users')->restrictOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });
        Schema::create('production_batch_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('production_batch_id')->constrained()->restrictOnDelete();
            $table->string('action', 60);
            $table->foreignId('performed_by_id')->constrained('users')->restrictOnDelete();
            $table->text('notes')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('occurred_at');
        });
        DB::statement('ALTER TABLE boms ADD CONSTRAINT bom_output_positive CHECK (output_quantity BETWEEN 1 AND 1000000)');
        DB::statement('ALTER TABLE bom_materials ADD CONSTRAINT bom_material_positive CHECK (required_quantity > 0 AND required_quantity <= 1000000)');
        DB::statement("ALTER TABLE production_batches ADD CONSTRAINT production_quantities_valid CHECK (
            target_quantity BETWEEN 1 AND 1000000 AND bom_output_quantity BETWEEN 1 AND 1000000 AND (actual_quantity IS NULL OR actual_quantity BETWEEN 1 AND 1000000)
            AND (passed_quantity IS NULL OR passed_quantity >= 0) AND (failed_quantity IS NULL OR failed_quantity >= 0)
            AND ((passed_quantity IS NULL AND failed_quantity IS NULL) OR
                (actual_quantity IS NOT NULL AND passed_quantity IS NOT NULL AND failed_quantity IS NOT NULL
                    AND passed_quantity::bigint + failed_quantity::bigint = actual_quantity::bigint)))");
    }

    public function down(): void
    {
        foreach (['production_batch_events', 'production_non_conformances', 'production_material_issues', 'production_batch_materials', 'production_batches', 'bom_materials', 'boms'] as $table) Schema::dropIfExists($table);
    }
};
