<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('receiving_receipt_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('receiving_id')->constrained()->cascadeOnDelete();
            $table->string('original_name');
            $table->string('stored_path')->unique();
            $table->string('mime_type', 100);
            $table->unsignedBigInteger('file_size');
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['receiving_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('receiving_receipt_attachments');
    }
};
