<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('receivings', function (Blueprint $table) {
            $table->foreignId('assigned_qa_user_id')
                ->nullable()
                ->after('prepared_by_id')
                ->constrained('users')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('receivings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('assigned_qa_user_id');
        });
    }
};
