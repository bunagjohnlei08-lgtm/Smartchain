<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Inventory;
use App\Models\InventoryAuditItem;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class InventoryQualityAuditTest extends TestCase
{
    use RefreshDatabase;

    private User $qa;
    private User $admin;
    private Inventory $inventory;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-02-10 09:00:00');
        Storage::fake('local');
        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $qaRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $branch = Branch::create(['name' => 'Main', 'code' => 'MAIN']);
        $warehouse = Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id]);
        $this->admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        $this->qa = User::factory()->create(['role_id' => $qaRole->id, 'status' => 'ACTIVE', 'branch_id' => $branch->id, 'warehouse_id' => $warehouse->id]);
        $product = Product::create(['name' => 'TOMAHAWK EC', 'category' => 'Crop Protection', 'brand' => 'Archon', 'unit' => 'pcs', 'cost_price' => 100]);
        $this->inventory = Inventory::create(['barcode' => 'TOMAHAWK-001', 'product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'available_stock' => 100, 'reserved_stock' => 0, 'backload' => 0, 'status' => 'Available']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_due_cycle_and_notification_are_created_only_once(): void
    {
        $this->artisan('inventory-audits:process-schedule')->assertSuccessful();
        $this->artisan('inventory-audits:process-schedule')->assertSuccessful();
        $this->assertDatabaseCount('inventory_audit_cycles', 1);
        $this->assertSame(1, $this->qa->notifications()->where('data', 'like', '%Inventory Quality Audit Due%')->count());
    }

    public function test_pass_saves_history_without_changing_inventory(): void
    {
        $this->actingAs($this->qa)->postJson("/api/qa/inventory-audits/{$this->inventory->id}", ['result' => 'PASSED'])
            ->assertCreated()->assertJsonPath('data.status', 'PASSED');
        $this->assertDatabaseHas('inventories', ['id' => $this->inventory->id, 'available_stock' => 100, 'backload' => 0]);
        $this->assertDatabaseHas('inventory_audit_items', ['inventory_id' => $this->inventory->id, 'audited_quantity' => 100, 'failed_quantity' => 0, 'status' => 'PASSED']);
        $this->actingAs($this->admin)->getJson('/api/admin/inventory-audits')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.status', 'PASSED');
    }

    public function test_failed_audit_requires_one_to_five_valid_images(): void
    {
        $payload = ['result' => 'FAILED', 'failed_quantity' => 5, 'failure_reason' => 'Damaged Packaging / Container', 'remarks' => 'Five containers are damaged.'];
        $this->actingAs($this->qa)->postJson("/api/qa/inventory-audits/{$this->inventory->id}", $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('evidence');

        $six = collect(range(1, 6))->map(fn ($number) => UploadedFile::fake()->image("damage-{$number}.jpg"))->all();
        $this->actingAs($this->qa)->post("/api/qa/inventory-audits/{$this->inventory->id}", [...$payload, 'evidence' => $six], ['Accept' => 'application/json'])
            ->assertUnprocessable()->assertJsonValidationErrors('evidence');
        $this->assertDatabaseCount('inventory_audit_items', 0);
    }

    public function test_predefined_failure_reason_allows_blank_remarks(): void
    {
        $this->actingAs($this->qa)->post("/api/qa/inventory-audits/{$this->inventory->id}", [
            'result' => 'FAILED',
            'failed_quantity' => 1,
            'failure_reason' => 'Damaged Packaging / Container',
            'evidence' => [UploadedFile::fake()->image('damage.jpg')],
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.failure_reason', 'Damaged Packaging / Container')
            ->assertJsonPath('data.qa_remarks', null);

        $this->assertDatabaseHas('inventory_audit_items', [
            'inventory_id' => $this->inventory->id,
            'failure_reason' => 'Damaged Packaging / Container',
            'qa_remarks' => null,
        ]);
    }

    public function test_predefined_failure_reason_saves_optional_remarks(): void
    {
        $this->actingAs($this->qa)->post("/api/qa/inventory-audits/{$this->inventory->id}", [
            'result' => 'FAILED',
            'failed_quantity' => 1,
            'failure_reason' => 'Leakage / Spillage',
            'remarks' => 'Leakage observed near the cap.',
            'evidence' => [UploadedFile::fake()->image('leakage.jpg')],
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.failure_reason', 'Leakage / Spillage')
            ->assertJsonPath('data.qa_remarks', 'Leakage observed near the cap.');
    }

    public function test_failed_audit_rejects_missing_or_unrecognized_failure_reason(): void
    {
        $base = [
            'result' => 'FAILED',
            'failed_quantity' => 1,
        ];

        $this->actingAs($this->qa)->post("/api/qa/inventory-audits/{$this->inventory->id}", [
            ...$base,
            'evidence' => [UploadedFile::fake()->image('missing-reason.jpg')],
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('failure_reason');

        $this->actingAs($this->qa)->post("/api/qa/inventory-audits/{$this->inventory->id}", [
            ...$base,
            'failure_reason' => 'Short Quantity',
            'evidence' => [UploadedFile::fake()->image('invalid-reason.jpg')],
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('failure_reason');

        $this->assertDatabaseCount('inventory_audit_items', 0);
    }

    public function test_other_failure_reason_requires_and_saves_remarks(): void
    {
        $payload = [
            'result' => 'FAILED',
            'failed_quantity' => 1,
            'failure_reason' => 'Other',
        ];

        $this->actingAs($this->qa)->post("/api/qa/inventory-audits/{$this->inventory->id}", [
            ...$payload,
            'evidence' => [UploadedFile::fake()->image('other-without-remarks.jpg')],
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('remarks');

        $this->actingAs($this->qa)->post("/api/qa/inventory-audits/{$this->inventory->id}", [
            ...$payload,
            'remarks' => 'Strong chemical odor detected during inspection.',
            'evidence' => [UploadedFile::fake()->image('other-with-remarks.jpg')],
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.failure_reason', 'Other')
            ->assertJsonPath('data.qa_remarks', 'Strong chemical odor detected during inspection.');
    }

    public function test_failed_quantity_is_held_then_approved_into_existing_backload_once(): void
    {
        $response = $this->actingAs($this->qa)->post("/api/qa/inventory-audits/{$this->inventory->id}", [
            'result' => 'FAILED', 'failed_quantity' => 5, 'failure_reason' => 'Damaged Packaging / Container',
            'remarks' => 'Five containers are damaged.', 'evidence' => [UploadedFile::fake()->image('damage.jpg')],
        ], ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('data.status', 'PENDING_ADMIN_APPROVAL');
        $itemId = $response->json('data.id');
        $this->assertDatabaseHas('inventories', ['id' => $this->inventory->id, 'available_stock' => 95, 'backload' => 0]);
        $this->assertSame(1, $this->admin->notifications()->where('data', 'like', '%Inventory Audit Approval Required%')->count());

        $this->actingAs($this->qa)->postJson("/api/admin/inventory-audits/{$itemId}/approve")->assertForbidden();
        $this->actingAs($this->admin)->postJson("/api/admin/inventory-audits/{$itemId}/approve", ['remarks' => 'Confirmed'])
            ->assertOk()->assertJsonPath('data.status', 'APPROVED_FOR_BACKLOAD');
        $this->assertDatabaseHas('inventories', ['id' => $this->inventory->id, 'available_stock' => 95, 'backload' => 5]);
        $this->actingAs($this->admin)->postJson("/api/admin/inventory-audits/{$itemId}/approve")
            ->assertUnprocessable();
        $this->assertDatabaseHas('inventories', ['id' => $this->inventory->id, 'available_stock' => 95, 'backload' => 5]);
    }

    public function test_return_preserves_hold_and_passed_reinspection_restores_available_stock(): void
    {
        $response = $this->actingAs($this->qa)->post("/api/qa/inventory-audits/{$this->inventory->id}", [
            'result' => 'FAILED', 'failed_quantity' => 5, 'failure_reason' => 'Does Not Meet Quality Standard',
            'remarks' => 'Needs review.', 'evidence' => [UploadedFile::fake()->image('damage.png')],
        ], ['Accept' => 'application/json'])->assertCreated();
        $itemId = $response->json('data.id');
        $this->actingAs($this->admin)->postJson("/api/admin/inventory-audits/{$itemId}/return", ['remarks' => 'Verify packaging again.'])
            ->assertOk()->assertJsonPath('data.status', 'RETURNED_FOR_REINSPECTION');
        $this->assertDatabaseHas('inventories', ['id' => $this->inventory->id, 'available_stock' => 95, 'backload' => 0]);

        $this->actingAs($this->qa)->postJson("/api/qa/inventory-audits/{$this->inventory->id}", ['result' => 'PASSED'])
            ->assertCreated()->assertJsonPath('data.attempt_number', 2);
        $this->assertDatabaseHas('inventories', ['id' => $this->inventory->id, 'available_stock' => 100, 'backload' => 0]);
        $this->assertDatabaseCount('inventory_audit_items', 2);
        $this->assertDatabaseHas('inventory_audit_items', ['id' => $itemId, 'status' => InventoryAuditItem::STATUS_RETURNED, 'admin_remarks' => 'Verify packaging again.']);
    }

    public function test_admin_can_change_configured_months(): void
    {
        $this->actingAs($this->admin)->putJson('/api/admin/inventory-audits/schedule/months', ['months' => [1, 5, 10]])
            ->assertOk()->assertExactJson(['months' => [1, 5, 10]]);
        $this->assertDatabaseHas('inventory_audit_settings', ['id' => 1, 'audit_months' => json_encode([1, 5, 10])]);
    }

    public function test_new_scheduled_month_creates_a_new_cycle_without_deleting_history(): void
    {
        $this->actingAs($this->qa)->postJson("/api/qa/inventory-audits/{$this->inventory->id}", ['result' => 'PASSED'])->assertCreated();
        Carbon::setTestNow('2026-06-03 09:00:00');

        $this->actingAs($this->qa)->getJson('/api/qa/inventory-audits')
            ->assertOk()->assertJsonPath('cycle.name', 'June 2026 Audit')
            ->assertJsonPath('data.0.latest_audit', null);

        $this->assertDatabaseCount('inventory_audit_cycles', 2);
        $this->assertDatabaseHas('inventory_audit_cycles', ['reference' => 'IQA-2026-02', 'status' => 'COMPLETED']);
        $this->assertDatabaseHas('inventory_audit_items', ['inventory_id' => $this->inventory->id, 'status' => 'PASSED']);
    }
}
