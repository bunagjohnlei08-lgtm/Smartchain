<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('qa_inspection_attachments', function (Blueprint $table) {
            $table->string('file_sha256', 64)->nullable()->after('file_size');
            $table->unique(
                ['qa_inspection_id', 'file_sha256'],
                'qa_inspection_attachment_hash_unique'
            );
        });

        Schema::table('receiving_receipt_attachments', function (Blueprint $table) {
            $table->string('file_sha256', 64)->nullable()->after('file_size');
            $table->unique(
                ['receiving_id', 'file_sha256'],
                'receiving_receipt_attachment_hash_unique'
            );
        });
    }

    public function down(): void
    {
        Schema::table('receiving_receipt_attachments', function (Blueprint $table) {
            $table->dropUnique('receiving_receipt_attachment_hash_unique');
            $table->dropColumn('file_sha256');
        });

        Schema::table('qa_inspection_attachments', function (Blueprint $table) {
            $table->dropUnique('qa_inspection_attachment_hash_unique');
            $table->dropColumn('file_sha256');
        });
    }
};
