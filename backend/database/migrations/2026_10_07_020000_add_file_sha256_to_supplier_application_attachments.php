<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('supplier_application_attachments', function (Blueprint $table) {
            $table->string('file_sha256', 64)->nullable()->after('file_size');
            $table->unique(
                ['supplier_application_id', 'file_sha256'],
                'supplier_application_attachment_hash_unique'
            );
        });
    }

    public function down(): void
    {
        Schema::table('supplier_application_attachments', function (Blueprint $table) {
            $table->dropUnique('supplier_application_attachment_hash_unique');
            $table->dropColumn('file_sha256');
        });
    }
};
