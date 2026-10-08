<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\PurchaseOrder;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Notifications\WorkflowNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class SupplierRemovalLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
        Notification::fake();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_admin_removes_active_supplier_without_deleting_history(): void
    {
        Carbon::setTestNow('2026-10-07 00:00:00 UTC');
        $supplier = $this->supplier();
        $order = $this->purchaseOrder($supplier);

        $this->actingAs($this->admin)->deleteJson("/api/suppliers/{$supplier->id}")
            ->assertOk()
            ->assertJsonPath('data.status', Supplier::STATUS_PENDING_REMOVAL)
            ->assertJsonPath('data.open_purchase_orders_count', 1)
            ->assertJsonPath('data.restore_allowed', true);

        $supplier->refresh();
        $this->assertNotNull($supplier->removal_requested_at);
        $this->assertSame($this->admin->id, $supplier->removal_requested_by_id);
        $this->assertSame($supplier->id, $order->fresh()->supplier_id);
        $this->assertSame($supplier->name, $order->fresh()->supplier?->name);
        $this->assertDatabaseHas('audit_logs', ['action' => 'SUPPLIER_REMOVAL_REQUESTED', 'resource_id' => (string) $supplier->id]);
        Notification::assertSentTo($this->admin, WorkflowNotification::class, fn ($notification) => $notification->type === 'SUPPLIER_REMOVAL_REQUESTED');
    }

    public function test_recently_removed_supplier_can_be_restored_within_thirty_days(): void
    {
        Carbon::setTestNow('2026-10-07 00:00:00 UTC');
        $supplier = $this->supplier();
        $this->actingAs($this->admin)->deleteJson("/api/suppliers/{$supplier->id}")->assertOk();

        Carbon::setTestNow('2026-10-22 00:00:00 UTC');
        $this->actingAs($this->admin)->postJson("/api/suppliers/{$supplier->id}/restore")
            ->assertOk()
            ->assertJsonPath('data.status', Supplier::STATUS_ACTIVE)
            ->assertJsonPath('data.removal_requested_at', null);

        $this->assertNull($supplier->fresh()->removal_requested_by_id);
        $this->assertDatabaseHas('audit_logs', ['action' => 'SUPPLIER_RESTORED', 'resource_id' => (string) $supplier->id]);
    }

    public function test_expired_restore_is_rejected_and_archives_supplier(): void
    {
        Carbon::setTestNow('2026-10-07 00:00:00 UTC');
        $supplier = $this->supplier();
        $this->actingAs($this->admin)->deleteJson("/api/suppliers/{$supplier->id}")->assertOk();

        Carbon::setTestNow('2026-11-06 00:00:00 UTC');
        $this->actingAs($this->admin)->postJson("/api/suppliers/{$supplier->id}/restore")
            ->assertStatus(422)
            ->assertJsonPath('data.status', Supplier::STATUS_ARCHIVED);

        $this->assertNotNull($supplier->fresh()->archived_at);
        $this->assertDatabaseHas('audit_logs', ['action' => 'SUPPLIER_ARCHIVED', 'resource_id' => (string) $supplier->id]);
    }

    public function test_scheduler_archives_expired_removals_without_hard_deleting_supplier(): void
    {
        Carbon::setTestNow('2026-10-07 00:00:00 UTC');
        $supplier = $this->supplier();
        $order = $this->purchaseOrder($supplier);
        $this->actingAs($this->admin)->deleteJson("/api/suppliers/{$supplier->id}")->assertOk();

        Carbon::setTestNow('2026-11-07 00:00:00 UTC');
        $this->artisan('suppliers:archive-expired-removals')->assertSuccessful();

        $this->assertSame(Supplier::STATUS_ARCHIVED, $supplier->fresh()->status);
        $this->assertSame($supplier->id, $order->fresh()->supplier_id);
        $this->assertDatabaseHas('suppliers', ['id' => $supplier->id]);
    }

    public function test_removed_and_archived_suppliers_cannot_be_used_for_new_purchase_orders(): void
    {
        $supplier = $this->supplier();
        $this->actingAs($this->admin)->deleteJson("/api/suppliers/{$supplier->id}")->assertOk();

        $payload = [
            'supplier_id' => $supplier->id,
            'delivery_details' => 'Main Warehouse',
            'expected_delivery_date' => now()->addDay()->toDateString(),
            'items' => [['product_name' => 'Unavailable Product', 'ordered_quantity' => 1, 'unit_price' => 1]],
        ];
        $this->actingAs($this->admin)->postJson('/api/purchase-orders', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('supplier_id');

        $supplier->update(['status' => Supplier::STATUS_ARCHIVED, 'archived_at' => now()]);
        $this->actingAs($this->admin)->postJson('/api/purchase-orders', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('supplier_id');
    }

    public function test_non_admin_cannot_remove_or_restore_supplier(): void
    {
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $manager = User::factory()->create(['role_id' => $managerRole->id, 'status' => 'ACTIVE']);
        $supplier = $this->supplier();

        $this->actingAs($manager)->deleteJson("/api/suppliers/{$supplier->id}")->assertForbidden();
        $supplier->update(['status' => Supplier::STATUS_PENDING_REMOVAL, 'removal_requested_at' => now()]);
        $this->actingAs($manager)->postJson("/api/suppliers/{$supplier->id}/restore")->assertForbidden();
    }

    public function test_duplicate_remove_is_idempotent(): void
    {
        $supplier = $this->supplier();
        $this->actingAs($this->admin)->deleteJson("/api/suppliers/{$supplier->id}")->assertOk();
        $firstTimestamp = $supplier->fresh()->removal_requested_at;

        $this->actingAs($this->admin)->deleteJson("/api/suppliers/{$supplier->id}")
            ->assertOk()->assertJsonPath('data.status', Supplier::STATUS_PENDING_REMOVAL);

        $this->assertTrue($firstTimestamp->equalTo($supplier->fresh()->removal_requested_at));
        $this->assertSame(1, AuditLog::query()->where('action', 'SUPPLIER_REMOVAL_REQUESTED')->count());
    }

    private function supplier(): Supplier
    {
        return Supplier::create([
            'supplier_code' => 'SUP-LIFECYCLE',
            'name' => 'Novaplaza',
            'email' => 'orders@novaplaza.test',
            'status' => Supplier::STATUS_ACTIVE,
        ]);
    }

    private function purchaseOrder(Supplier $supplier): PurchaseOrder
    {
        return PurchaseOrder::create([
            'po_number' => 'PO-LIFECYCLE-1',
            'supplier_id' => $supplier->id,
            'supplier_name' => $supplier->name,
            'delivery_details' => 'Main Warehouse',
            'expected_delivery_date' => '2026-10-20',
            'total_amount' => 100,
            'status' => PurchaseOrder::STATUS_APPROVED,
            'approved_by' => $this->admin->id,
        ]);
    }
}
