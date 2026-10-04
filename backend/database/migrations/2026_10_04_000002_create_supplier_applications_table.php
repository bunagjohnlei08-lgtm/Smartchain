<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->string('business_type', 100)->nullable()->after('address');
            $table->string('supply_category', 150)->nullable()->after('business_type');
            $table->text('products_services')->nullable()->after('supply_category');
        });

        Schema::create('supplier_applications', function (Blueprint $table) {
            $table->id();
            $table->string('application_number', 40)->unique();
            $table->string('company_name');
            $table->string('normalized_company_name')->index();
            $table->text('address');
            $table->string('contact_person');
            $table->string('email');
            $table->string('normalized_email')->index();
            $table->string('phone', 30);
            $table->string('business_type', 100);
            $table->string('supply_category', 150);
            $table->text('products_services');
            $table->string('status', 24)->default('PENDING')->index();
            $table->timestamp('submitted_at');
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('reviewed_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('decision_reason')->nullable();
            $table->foreignId('approved_supplier_id')->nullable()->unique()->constrained('suppliers')->nullOnDelete();
            $table->timestamps();
        });

        // PostgreSQL partial uniqueness keeps terminal APPROVED/REJECTED rows
        // for history while guaranteeing one active application per email,
        // including when two public requests arrive concurrently.
        DB::statement("CREATE UNIQUE INDEX supplier_applications_one_active_email ON supplier_applications (normalized_email) WHERE status IN ('PENDING', 'UNDER_REVIEW')");
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_applications');
        Schema::table('suppliers', function (Blueprint $table) {
            $table->dropColumn(['business_type', 'supply_category', 'products_services']);
        });
    }
};
