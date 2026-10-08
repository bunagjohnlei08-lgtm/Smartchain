<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('warehouses', function (Blueprint $table) {
            $table->boolean('show_on_public_website')
                ->default(false)
                ->index()
                ->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('warehouses', function (Blueprint $table) {
            $table->dropIndex(['show_on_public_website']);
            $table->dropColumn('show_on_public_website');
        });
    }
};
