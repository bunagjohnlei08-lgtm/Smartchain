<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supplier_application_offerings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_application_id')->constrained()->cascadeOnDelete();
            $table->string('type', 10);
            $table->string('name', 150);
            $table->string('normalized_name', 150)->index();
            $table->string('category', 150)->nullable();
            $table->string('description', 1000)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            // Set only by an Admin catalog mapping; NULL on an approved
            // application's PRODUCT offering means "pending catalog mapping".
            $table->foreignId('mapped_product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->timestamp('mapped_at')->nullable();
            $table->foreignId('mapped_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // Structured offerings become authoritative; the legacy free-text field
        // remains as optional "Additional capabilities". Existing rows keep their text.
        DB::statement('ALTER TABLE supplier_applications ALTER COLUMN products_services DROP NOT NULL');
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_application_offerings');

        if (DB::table('supplier_applications')->whereNull('products_services')->exists()) {
            throw new RuntimeException('Cannot restore NOT NULL on supplier_applications.products_services while NULL values exist.');
        }
        DB::statement('ALTER TABLE supplier_applications ALTER COLUMN products_services SET NOT NULL');
    }
};
