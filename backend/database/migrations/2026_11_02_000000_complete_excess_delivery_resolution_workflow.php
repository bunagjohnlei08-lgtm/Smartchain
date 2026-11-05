<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('excess_delivery_reviews', function (Blueprint $table) {
            $table->string('documentation_type', 64)->nullable()->index();
            $table->foreignId('documentation_requested_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('documentation_assigned_to_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('documentation_requested_at')->nullable();
            $table->timestamp('documentation_submitted_at')->nullable();
            $table->string('return_status', 32)->nullable()->index();
            $table->timestamp('return_prepared_at')->nullable();
            $table->date('return_date')->nullable();
            $table->timestamp('return_completed_at')->nullable();
            $table->foreignId('return_completed_by_id')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::table('excess_delivery_review_items', function (Blueprint $table) {
            $table->foreignId('authorized_receiving_item_id')->nullable()->after('receiving_item_id')->constrained('receiving_items')->restrictOnDelete();
            $table->unsignedInteger('authorized_quantity')->default(0);
            $table->unsignedInteger('return_requested_quantity')->default(0);
            $table->unsignedInteger('returned_quantity')->default(0);
        });

        Schema::create('excess_delivery_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('excess_delivery_review_id')->constrained()->cascadeOnDelete();
            $table->string('internal_reference', 40)->unique();
            $table->string('purpose', 32)->index();
            $table->string('document_type', 64);
            $table->string('external_reference')->nullable();
            $table->string('original_name');
            $table->string('stored_path');
            $table->string('mime_type', 100);
            $table->unsignedBigInteger('file_size');
            $table->string('file_sha256', 64);
            $table->foreignId('uploaded_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['excess_delivery_review_id', 'created_at'], 'excess_documents_review_created_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('excess_delivery_documents');
        Schema::table('excess_delivery_review_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('authorized_receiving_item_id');
            $table->dropColumn(['authorized_quantity', 'return_requested_quantity', 'returned_quantity']);
        });
        Schema::table('excess_delivery_reviews', function (Blueprint $table) {
            $table->dropConstrainedForeignId('documentation_requested_by_id');
            $table->dropConstrainedForeignId('documentation_assigned_to_id');
            $table->dropConstrainedForeignId('return_completed_by_id');
            $table->dropColumn([
                'documentation_type', 'documentation_requested_at', 'documentation_submitted_at',
                'return_status', 'return_prepared_at', 'return_date', 'return_completed_at',
            ]);
        });
    }
};
