<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supplier_application_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_application_id')->constrained()->cascadeOnDelete();
            $table->string('attachment_type', 40);
            $table->string('original_name');
            $table->string('stored_path')->unique();
            $table->string('mime_type', 100);
            $table->unsignedBigInteger('file_size');
            $table->timestamps();

            $table->index(['supplier_application_id', 'attachment_type'], 'supplier_application_attachment_type_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_application_attachments');
    }
};
