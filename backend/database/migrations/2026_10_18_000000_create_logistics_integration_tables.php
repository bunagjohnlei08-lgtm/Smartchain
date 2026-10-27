<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('logistics_partners', function (Blueprint $table) {
            $table->id();
            $table->string('code', 50)->unique();
            $table->string('name');
            $table->boolean('enabled')->default(false)->index();
            $table->string('base_url', 2048)->nullable();
            $table->string('request_path', 255)->default('/api/v1/delivery-requests');
            $table->string('auth_scheme', 20)->default('bearer');
            $table->text('outbound_token')->nullable();
            $table->text('callback_secret')->nullable();
            $table->boolean('supports_idempotency')->default(false);
            $table->timestamps();
        });

        Schema::create('logistics_item_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('logistics_partner_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->string('partner_item_reference', 100);
            $table->timestamps();
            $table->unique(['logistics_partner_id', 'product_id'], 'logistics_item_partner_product_unique');
        });

        Schema::create('delivery_requests', function (Blueprint $table) {
            $table->id();
            $table->uuid('request_uuid')->unique();
            $table->foreignId('order_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('shipment_packing_id')->nullable()->constrained('shipment_packings')->nullOnDelete();
            $table->foreignId('logistics_partner_id')->constrained()->restrictOnDelete();
            $table->json('payload_snapshot');
            $table->string('state', 40)->default('READY')->index();
            $table->string('partner_request_id', 100)->nullable()->index();
            $table->unsignedSmallInteger('retry_count')->default(0);
            $table->timestampTz('next_attempt_at')->nullable();
            $table->timestampTz('submitted_at')->nullable();
            $table->timestampTz('accepted_at')->nullable();
            $table->timestampTz('latest_event_at')->nullable();
            $table->string('last_error_code', 80)->nullable();
            $table->string('last_error_message', 500)->nullable();
            $table->timestamps();
        });

        Schema::create('delivery_submission_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('delivery_request_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('attempt_number');
            $table->uuid('correlation_id')->unique();
            $table->string('result', 40)->default('STARTED');
            $table->unsignedSmallInteger('http_status')->nullable();
            $table->string('error_code', 80)->nullable();
            $table->string('safe_message', 500)->nullable();
            $table->timestampTz('started_at');
            $table->timestampTz('completed_at')->nullable();
            $table->timestamps();
            $table->unique(['delivery_request_id', 'attempt_number'], 'delivery_attempt_number_unique');
        });

        Schema::create('delivery_status_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('delivery_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('logistics_partner_id')->constrained()->restrictOnDelete();
            $table->string('event_id', 100);
            $table->char('payload_sha256', 64);
            $table->string('partner_status', 30);
            $table->timestampTz('occurred_at');
            $table->string('processing_result', 40);
            $table->string('note', 1000)->nullable();
            $table->string('proof_reference', 255)->nullable();
            $table->timestampTz('received_at');
            $table->timestamps();
            $table->unique(['logistics_partner_id', 'event_id'], 'delivery_partner_event_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('delivery_status_events');
        Schema::dropIfExists('delivery_submission_attempts');
        Schema::dropIfExists('delivery_requests');
        Schema::dropIfExists('logistics_item_mappings');
        Schema::dropIfExists('logistics_partners');
    }
};
