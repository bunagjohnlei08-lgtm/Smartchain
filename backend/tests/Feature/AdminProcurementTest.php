<?php

namespace Tests\Feature;

use App\Models\ReplenishmentRequest;
use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use App\Notifications\WorkflowNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AdminProcurementTest extends TestCase
{
    use RefreshDatabase;

    private User $requester;
    private Product $product;
    private Warehouse $warehouse;

    protected function setUp(): void
    {
        parent::setUp();
        $this->requester = $this->userWithRole('PLANT_MANAGER');
        $this->requester->update(['name' => 'M. Santos']);
        $this->product = Product::create(['name' => 'Nitrile Gloves (Box 100)']);
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $this->warehouse = Warehouse::create([
            'name' => 'Main Warehouse',
            'code' => 'MAIN-WH',
            'branch_id' => $branch->id,
        ]);
        $this->requester->update([
            'branch_id' => $branch->id,
            'warehouse_id' => $this->warehouse->id,
        ]);
        Inventory::create([
            'barcode' => 'INV-PROCUREMENT-TEST',
            'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'available_stock' => 5,
        ]);
    }

    private function userWithRole(string $slug): User
    {
        $role = Role::firstOrCreate(['slug' => $slug], ['name' => str_replace('_', ' ', $slug)]);
        return User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
    }

    private function replenishmentRequest(array $overrides = []): ReplenishmentRequest
    {
        return ReplenishmentRequest::create(array_merge([
            'request_no' => 'RR-1001',
            'requested_by' => $this->requester->id,
            'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'requested_qty' => 60,
            'priority' => 'Critical',
            'status' => ReplenishmentRequest::STATUS_PENDING,
            'submitted_at' => '2026-08-27 09:00:00',
        ], $overrides));
    }

    public function test_admin_sees_the_requests_submitted_by_the_plant_manager(): void
    {
        $this->replenishmentRequest();

        $response = $this->actingAs($this->userWithRole('ADMIN'))->getJson('/api/admin/procurement/requests');

        $response->assertOk()->assertJsonPath('data.0.request_no', 'RR-1001')
            ->assertJsonPath('data.0.product_name', 'Nitrile Gloves (Box 100)')
            ->assertJsonPath('data.0.warehouse_name', 'Main Warehouse')
            ->assertJsonPath('data.0.requested_qty', 60)
            ->assertJsonPath('data.0.priority', 'Critical')
            ->assertJsonPath('data.0.status', ReplenishmentRequest::STATUS_PENDING)
            ->assertJsonPath('data.0.requested_by', 'M. Santos')
            ->assertJsonPath('data.0.submitted_date', '2026-08-27');
    }

    public function test_admin_default_queue_contains_only_requests_with_remaining_procurement_action(): void
    {
        $admin = $this->userWithRole('ADMIN');
        $pending = $this->replenishmentRequest(['request_no' => 'RR-PENDING']);
        $approved = $this->replenishmentRequest([
            'request_no' => 'RR-APPROVED',
            'status' => ReplenishmentRequest::STATUS_APPROVED,
        ]);
        $rejected = $this->replenishmentRequest([
            'request_no' => 'RR-REJECTED',
            'status' => ReplenishmentRequest::STATUS_REJECTED,
        ]);
        $handedOff = $this->replenishmentRequest([
            'request_no' => 'RR-HANDED-OFF',
            'status' => ReplenishmentRequest::STATUS_PO_CREATED,
        ]);

        PurchaseOrder::create([
            'po_number' => 'PO-QUEUE-1001',
            'replenishment_request_id' => $handedOff->id,
            'supplier_name' => 'Queue Test Supplier',
            'delivery_details' => 'Main Warehouse',
            'expected_delivery_date' => '2026-10-15',
            'total_amount' => 100,
            'status' => PurchaseOrder::STATUS_APPROVED,
            'approved_by' => $admin->id,
        ]);

        $response = $this->actingAs($admin)
            ->getJson('/api/admin/procurement/requests?per_page=1')
            ->assertOk()
            ->assertJsonPath('total', 2)
            ->assertJsonPath('per_page', 1)
            ->assertJsonCount(1, 'data');

        $visibleIds = collect([1, 2])
            ->flatMap(fn (int $page) => $this->actingAs($admin)
                ->getJson("/api/admin/procurement/requests?per_page=1&page={$page}")
                ->assertOk()
                ->json('data'))
            ->pluck('id')
            ->all();

        $this->assertEqualsCanonicalizing([$pending->id, $approved->id], $visibleIds);

        foreach ([$rejected, $handedOff] as $finishedRequest) {
            $this->assertDatabaseHas('replenishment_requests', [
                'id' => $finishedRequest->id,
                'status' => $finishedRequest->status,
            ]);
        }
        $this->assertDatabaseHas('purchase_orders', [
            'replenishment_request_id' => $handedOff->id,
            'po_number' => 'PO-QUEUE-1001',
        ]);

        $historicalRows = collect($this->actingAs($admin)
            ->getJson('/api/admin/reports/preview?report_key=procurement.replenishment&per_page=100')
            ->assertOk()
            ->json('rows'))
            ->pluck('request_no')
            ->all();

        $this->assertContains($rejected->request_no, $historicalRows);
        $this->assertContains($handedOff->request_no, $historicalRows);
    }

    public function test_actual_purchase_order_linkage_removes_an_approved_request_from_the_operational_queue(): void
    {
        $admin = $this->userWithRole('ADMIN');
        $approved = $this->replenishmentRequest([
            'request_no' => 'RR-LINKED',
            'status' => ReplenishmentRequest::STATUS_APPROVED,
        ]);

        PurchaseOrder::create([
            'po_number' => 'PO-QUEUE-1002',
            'replenishment_request_id' => $approved->id,
            'supplier_name' => 'Linked Test Supplier',
            'delivery_details' => 'Main Warehouse',
            'expected_delivery_date' => '2026-10-16',
            'total_amount' => 200,
            'status' => PurchaseOrder::STATUS_APPROVED,
            'approved_by' => $admin->id,
        ]);

        $this->actingAs($admin)
            ->getJson('/api/admin/procurement/requests')
            ->assertOk()
            ->assertJsonPath('total', 0)
            ->assertJsonCount(0, 'data');

        $this->assertDatabaseHas('replenishment_requests', ['id' => $approved->id]);
        $this->assertDatabaseHas('purchase_orders', ['replenishment_request_id' => $approved->id]);
    }

    public function test_rejected_request_cannot_generate_a_purchase_order(): void
    {
        $admin = $this->userWithRole('ADMIN');
        $supplier = Supplier::create([
            'supplier_code' => 'SUP-REJECTED',
            'name' => 'Rejected Request Supplier',
            'email' => 'orders@example.test',
            'status' => 'ACTIVE',
        ]);
        $rejected = $this->replenishmentRequest([
            'request_no' => 'RR-REJECTED-PO',
            'status' => ReplenishmentRequest::STATUS_REJECTED,
        ]);

        $this->actingAs($admin)->postJson('/api/purchase-orders', [
            'supplier_id' => $supplier->id,
            'replenishment_request_id' => $rejected->id,
            'delivery_details' => 'Main Warehouse',
            'expected_delivery_date' => now()->addDay()->toDateString(),
            'items' => [[
                'product_name' => $this->product->name,
                'ordered_quantity' => 60,
                'unit_price' => 100,
            ]],
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'Only approved replenishment requests can generate a Purchase Order.');

        $this->assertDatabaseMissing('purchase_orders', [
            'replenishment_request_id' => $rejected->id,
        ]);
        $this->assertDatabaseHas('replenishment_requests', [
            'id' => $rejected->id,
            'status' => ReplenishmentRequest::STATUS_REJECTED,
        ]);
    }

    public function test_search_and_status_filters_are_applied_within_the_operational_dataset_before_pagination(): void
    {
        $admin = $this->userWithRole('ADMIN');
        $pending = $this->replenishmentRequest(['request_no' => 'RR-SEARCH-PENDING']);
        $approved = $this->replenishmentRequest([
            'request_no' => 'RR-SEARCH-APPROVED',
            'status' => ReplenishmentRequest::STATUS_APPROVED,
        ]);
        $this->replenishmentRequest([
            'request_no' => 'RR-SEARCH-REJECTED',
            'status' => ReplenishmentRequest::STATUS_REJECTED,
        ]);

        $this->actingAs($admin)
            ->getJson('/api/admin/procurement/requests?search=SEARCH&status=approved&per_page=1')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.id', $approved->id);

        $this->actingAs($admin)
            ->getJson('/api/admin/procurement/requests?search=SEARCH&status=pending&per_page=1')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.id', $pending->id);

        $this->actingAs($admin)
            ->getJson('/api/admin/procurement/requests?search=SEARCH&status=rejected')
            ->assertOk()
            ->assertJsonPath('total', 0)
            ->assertJsonCount(0, 'data');
    }

    public function test_approving_keeps_the_request_number_and_persists_the_decision(): void
    {
        Notification::fake();
        $unrelatedManager = $this->userWithRole('PLANT_MANAGER');
        $replenishmentRequest = $this->replenishmentRequest();

        $response = $this->actingAs($this->userWithRole('ADMIN'))
            ->postJson("/api/admin/procurement/requests/{$replenishmentRequest->id}/approve");

        $response->assertOk()
            ->assertJsonPath('request_no', 'RR-1001')
            ->assertJsonPath('status', ReplenishmentRequest::STATUS_FOR_PURCHASE_ORDER)
            ->assertJsonPath('available_for_purchase_order', true);

        $this->assertDatabaseHas('replenishment_requests', [
            'request_no' => 'RR-1001',
            'status' => ReplenishmentRequest::STATUS_FOR_PURCHASE_ORDER,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'PROCUREMENT_APPROVED',
            'resource_id' => (string) $replenishmentRequest->id,
        ]);
        Notification::assertSentTo($this->requester, WorkflowNotification::class, fn ($notification) =>
            $notification->title === 'Request Approved'
            && $notification->message === 'Your request #RR-1001 has been Approved.'
            && $notification->type === 'success'
            && $notification->referenceId === 'RR-1001');
        Notification::assertNotSentTo($unrelatedManager, WorkflowNotification::class);
    }

    public function test_declining_rejects_the_request_but_keeps_it_in_history(): void
    {
        Notification::fake();
        $unrelatedManager = $this->userWithRole('PLANT_MANAGER');
        $replenishmentRequest = $this->replenishmentRequest();

        $this->actingAs($this->userWithRole('ADMIN'))
            ->postJson("/api/admin/procurement/requests/{$replenishmentRequest->id}/decline", ['remarks' => 'Insufficient budget'])
            ->assertOk()
            ->assertJsonPath('status', ReplenishmentRequest::STATUS_REJECTED)
            ->assertJsonPath('admin_decision', 'Insufficient budget');

        $this->assertDatabaseHas('replenishment_requests', ['request_no' => 'RR-1001', 'status' => ReplenishmentRequest::STATUS_REJECTED]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'PROCUREMENT_DECLINED',
            'resource_id' => (string) $replenishmentRequest->id,
        ]);
        Notification::assertSentTo($this->requester, WorkflowNotification::class, fn ($notification) =>
            $notification->title === 'Request Rejected'
            && $notification->message === 'Your request #RR-1001 has been Rejected.'
            && $notification->type === 'warning'
            && $notification->referenceId === 'RR-1001');
        Notification::assertNotSentTo($unrelatedManager, WorkflowNotification::class);
    }

    public function test_an_already_decided_request_cannot_be_reviewed_again(): void
    {
        $replenishmentRequest = $this->replenishmentRequest(['status' => ReplenishmentRequest::STATUS_APPROVED]);

        $this->actingAs($this->userWithRole('ADMIN'))
            ->postJson("/api/admin/procurement/requests/{$replenishmentRequest->id}/approve")
            ->assertStatus(422);
    }

    public function test_for_purchase_order_request_transitions_to_po_created_when_po_is_created(): void
    {
        $admin = $this->userWithRole('ADMIN');
        $supplier = Supplier::create([
            'supplier_code' => 'SUP-APPROVED',
            'name' => 'Approved Request Supplier',
            'email' => 'approved@example.test',
            'status' => 'ACTIVE',
        ]);
        $approved = $this->replenishmentRequest([
            'request_no' => 'RR-APPROVED-PO',
            'status' => ReplenishmentRequest::STATUS_FOR_PURCHASE_ORDER,
        ]);

        $response = $this->actingAs($admin)->postJson('/api/purchase-orders', [
            'supplier_id' => $supplier->id,
            'replenishment_request_id' => $approved->id,
            'delivery_details' => 'Main Warehouse',
            'expected_delivery_date' => now()->addDay()->toDateString(),
            'items' => [[
                'product_name' => $this->product->name,
                'ordered_quantity' => 60,
                'unit_price' => 100,
            ]],
        ])->assertCreated();

        $this->assertDatabaseHas('purchase_orders', [
            'id' => $response->json('id'),
            'replenishment_request_id' => $approved->id,
        ]);
        $this->assertDatabaseHas('replenishment_requests', [
            'id' => $approved->id,
            'status' => ReplenishmentRequest::STATUS_PO_CREATED,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'PURCHASE_ORDER_GENERATED',
            'resource_id' => (string) $response->json('id'),
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'REPLENISHMENT_PURCHASE_ORDER_CREATED',
            'resource_id' => (string) $approved->id,
        ]);

        $this->actingAs($admin)->postJson('/api/purchase-orders', [
            'supplier_id' => $supplier->id,
            'replenishment_request_id' => $approved->id,
            'delivery_details' => 'Main Warehouse',
            'expected_delivery_date' => now()->addDay()->toDateString(),
            'items' => [[
                'product_name' => $this->product->name,
                'ordered_quantity' => 60,
                'unit_price' => 100,
            ]],
        ])->assertUnprocessable()->assertJsonValidationErrors('replenishment_request_id');

        $this->assertDatabaseCount('purchase_orders', 1);
        $this->actingAs($admin)->getJson('/api/admin/procurement/requests')
            ->assertOk()
            ->assertJsonMissing(['id' => $approved->id]);
    }

    public function test_summary_counts_come_from_the_request_records(): void
    {
        $this->replenishmentRequest();
        $this->replenishmentRequest(['request_no' => 'RR-1002', 'status' => ReplenishmentRequest::STATUS_APPROVED]);
        $this->replenishmentRequest(['request_no' => 'RR-1003', 'status' => ReplenishmentRequest::STATUS_PO_CREATED]);
        $this->replenishmentRequest(['request_no' => 'RR-1004', 'status' => ReplenishmentRequest::STATUS_REJECTED]);
        $this->replenishmentRequest(['request_no' => 'RR-1005', 'status' => ReplenishmentRequest::STATUS_PO_CREATED]);

        $this->actingAs($this->userWithRole('ADMIN'))->getJson('/api/admin/procurement/summary')
            ->assertOk()
            ->assertJson([
                'total_requests' => 5,
                'pending_approval' => 1,
                'approved' => 1,
                'rejected' => 1,
                'po_created' => 2,
                'for_purchase_order' => 1,
            ]);
    }

    public function test_summary_excludes_linked_historical_request_from_for_purchase_order_count(): void
    {
        $admin = $this->userWithRole('ADMIN');
        $stale = $this->replenishmentRequest([
            'request_no' => 'RR-HISTORICAL-LINKED',
            'status' => ReplenishmentRequest::STATUS_FOR_PURCHASE_ORDER,
        ]);
        PurchaseOrder::create([
            'po_number' => 'PO-HISTORICAL-LINKED',
            'replenishment_request_id' => $stale->id,
            'supplier_name' => 'Historical Supplier',
            'delivery_details' => 'Main Warehouse',
            'expected_delivery_date' => now()->addDay()->toDateString(),
            'total_amount' => 100,
            'status' => PurchaseOrder::STATUS_COMPLETED,
            'approved_by' => $admin->id,
        ]);

        $this->actingAs($admin)->getJson('/api/admin/procurement/summary')
            ->assertOk()
            ->assertJsonPath('for_purchase_order', 0)
            ->assertJsonPath('approved', 0);
    }

    public function test_drafts_are_excluded_from_admin_results_and_summary(): void
    {
        $this->replenishmentRequest(['status' => ReplenishmentRequest::STATUS_DRAFT, 'submitted_at' => null]);

        $this->actingAs($this->userWithRole('ADMIN'))
            ->getJson('/api/admin/procurement/requests')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($this->userWithRole('ADMIN'))
            ->getJson('/api/admin/procurement/summary')
            ->assertOk()
            ->assertJsonPath('total_requests', 0)
            ->assertJsonPath('draft', 0);
    }

    public function test_plant_manager_and_admin_use_the_same_request_record(): void
    {
        $replenishmentRequest = $this->replenishmentRequest(['submitted_at' => now()]);

        $this->actingAs($this->requester)
            ->getJson('/api/plant-manager/procurement/requests')
            ->assertOk()
            ->assertJsonPath('data.0.id', $replenishmentRequest->id)
            ->assertJsonPath('data.0.status', ReplenishmentRequest::STATUS_PENDING);

        $this->actingAs($this->requester)
            ->getJson('/api/admin/procurement/requests')
            ->assertForbidden();
        $this->actingAs($this->requester)
            ->postJson("/api/admin/procurement/requests/{$replenishmentRequest->id}/approve")
            ->assertForbidden();

        $this->actingAs($this->userWithRole('ADMIN'))
            ->postJson("/api/admin/procurement/requests/{$replenishmentRequest->id}/approve")
            ->assertOk();

        $this->actingAs($this->requester)
            ->getJson('/api/plant-manager/procurement/requests')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($this->requester)
            ->getJson('/api/plant-manager/procurement/requests?scope=history')
            ->assertOk()
            ->assertJsonPath('data.0.id', $replenishmentRequest->id)
            ->assertJsonPath('data.0.status', ReplenishmentRequest::STATUS_FOR_PURCHASE_ORDER);
    }

    public function test_plant_manager_default_queue_contains_only_active_requests(): void
    {
        $draft = $this->replenishmentRequest([
            'request_no' => 'RR-DRAFT',
            'status' => ReplenishmentRequest::STATUS_DRAFT,
            'submitted_at' => null,
        ]);
        $pending = $this->replenishmentRequest(['request_no' => 'RR-PENDING', 'submitted_at' => now()]);
        $approved = $this->replenishmentRequest([
            'request_no' => 'RR-APPROVED',
            'status' => ReplenishmentRequest::STATUS_APPROVED,
            'submitted_at' => now(),
        ]);
        $rejected = $this->replenishmentRequest([
            'request_no' => 'RR-REJECTED',
            'status' => ReplenishmentRequest::STATUS_REJECTED,
            'submitted_at' => now(),
        ]);
        $poCreated = $this->replenishmentRequest([
            'request_no' => 'RR-PO-CREATED',
            'status' => ReplenishmentRequest::STATUS_PO_CREATED,
            'submitted_at' => now(),
        ]);

        $queue = $this->actingAs($this->requester)
            ->getJson('/api/plant-manager/procurement/requests')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->json('data');

        $this->assertEqualsCanonicalizing([$draft->id, $pending->id], array_column($queue, 'id'));
        $this->assertTrue($approved->fresh()->isAvailableForPurchaseOrder());

        foreach ([$approved, $rejected, $poCreated] as $terminalRequest) {
            $this->assertDatabaseHas('replenishment_requests', [
                'id' => $terminalRequest->id,
                'status' => $terminalRequest->status,
            ]);
        }

        $history = $this->actingAs($this->requester)
            ->getJson('/api/plant-manager/procurement/requests?scope=history')
            ->assertOk()
            ->assertJsonCount(4, 'data')
            ->json('data');

        $this->assertEqualsCanonicalizing(
            [$pending->id, $approved->id, $rejected->id, $poCreated->id],
            array_column($history, 'id'),
        );
    }

    public function test_plant_manager_recent_activity_returns_the_five_latest_submitted_requests(): void
    {
        $this->travelTo(Carbon::parse('2026-09-30 04:00:00'));

        try {
            $now = $this->replenishmentRequest([
                'request_no' => 'RR-NOW',
                'submitted_at' => now(),
            ]);
            $oneHourAgo = $this->replenishmentRequest([
                'request_no' => 'RR-1-HOUR',
                'submitted_at' => now()->subHour(),
            ]);
            $twentyThreeHoursAgo = $this->replenishmentRequest([
                'request_no' => 'RR-23-HOURS',
                'submitted_at' => now()->subHours(23),
            ]);
            $exactlyTwentyFourHoursAgo = $this->replenishmentRequest([
                'request_no' => 'RR-24-HOURS',
                'submitted_at' => now()->subDay(),
            ]);
            $olderRequest = $this->replenishmentRequest([
                'request_no' => 'RR-OLDER',
                'submitted_at' => now()->subHours(25),
            ]);
            $oldestRequest = $this->replenishmentRequest([
                'request_no' => 'RR-OLDEST',
                'submitted_at' => now()->subDays(2),
            ]);

            $history = $this->actingAs($this->requester)
                ->getJson('/api/plant-manager/procurement/requests?scope=history')
                ->assertOk()
                ->assertJsonCount(5, 'data')
                ->json('data');

            $this->assertSame(
                [$now->id, $oneHourAgo->id, $twentyThreeHoursAgo->id, $exactlyTwentyFourHoursAgo->id, $olderRequest->id],
                array_column($history, 'id'),
            );
            $this->assertNotContains($oldestRequest->id, array_column($history, 'id'));
            $this->assertDatabaseHas('replenishment_requests', ['id' => $oldestRequest->id]);

            $activeIds = collect($this->actingAs($this->requester)
                ->getJson('/api/plant-manager/procurement/requests')
                ->assertOk()
                ->json('data'))
                ->pluck('id')
                ->all();
            $this->assertContains($olderRequest->id, $activeIds);

            $admin = $this->userWithRole('ADMIN');
            $adminIds = collect($this->actingAs($admin)
                ->getJson('/api/admin/procurement/requests?per_page=100')
                ->assertOk()
                ->json('data'))
                ->pluck('id')
                ->all();
            $this->assertContains($olderRequest->id, $adminIds);

            $reportRequestNumbers = collect($this->actingAs($admin)
                ->getJson('/api/admin/reports/preview?report_key=procurement.replenishment&per_page=100')
                ->assertOk()
                ->json('rows'))
                ->pluck('request_no')
                ->all();
            $this->assertContains($olderRequest->request_no, $reportRequestNumbers);
        } finally {
            $this->travelBack();
        }
    }

    public function test_submitted_plant_manager_request_appears_in_admin_procurement(): void
    {
        $created = $this->actingAs($this->requester)
            ->postJson('/api/plant-manager/procurement/requests', [
                'product_id' => $this->product->id,
                'warehouse_id' => $this->warehouse->id,
                'requested_qty' => 60,
                'priority' => 'Critical',
                'status' => ReplenishmentRequest::STATUS_PENDING,
            ])
            ->assertCreated()
            ->assertJsonPath('requested_by', 'M. Santos')
            ->assertJsonPath('product_name', 'Nitrile Gloves (Box 100)')
            ->assertJsonPath('warehouse_name', 'Main Warehouse')
            ->assertJsonPath('status', ReplenishmentRequest::STATUS_PENDING)
            ->json();

        $this->actingAs($this->userWithRole('ADMIN'))
            ->getJson('/api/admin/procurement/requests')
            ->assertOk()
            ->assertJsonPath('data.0.id', $created['id'])
            ->assertJsonPath('data.0.requested_qty', 60);
    }
}
