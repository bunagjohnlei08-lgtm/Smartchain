<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('roles')->updateOrInsert(
            ['slug' => 'SUPPLIER'],
            ['name' => 'Supplier', 'description' => 'Accredited supplier portal access', 'updated_at' => now(), 'created_at' => now()],
        );

        Schema::table('supplier_application_attachments', function (Blueprint $table) {
            $table->string('verification_status', 24)->default('PENDING_VERIFICATION')->index();
            $table->foreignId('verified_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestampTz('verified_at')->nullable();
            $table->date('valid_from')->nullable();
            $table->date('expires_on')->nullable()->index();
            $table->text('verification_reason')->nullable();
            $table->foreignId('replaces_attachment_id')->nullable()->constrained('supplier_application_attachments')->nullOnDelete();
        });

        Schema::table('suppliers', function (Blueprint $table) {
            $table->string('accreditation_status', 32)->default('ACTIVE')->index();
            $table->timestampTz('accredited_at')->nullable();
            $table->date('accreditation_expires_on')->nullable()->index();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('supplier_id')->nullable()->unique()->constrained('suppliers')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropConstrainedForeignId('supplier_id'));
        Schema::table('suppliers', fn (Blueprint $table) => $table->dropColumn(['accreditation_status', 'accredited_at', 'accreditation_expires_on']));
        Schema::table('supplier_application_attachments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('replaces_attachment_id');
            $table->dropConstrainedForeignId('verified_by_id');
            $table->dropColumn(['verification_status', 'verified_at', 'valid_from', 'expires_on', 'verification_reason']);
        });
    }
};
