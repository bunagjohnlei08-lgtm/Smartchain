<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\ReplenishmentRequest;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use App\Notifications\WorkflowNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class PlantManagerProcurementFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private Product $product;

    private Warehouse $warehouse;

    protected function setUp(): void
    {
        parent::setUp();
        $role = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $this->warehouse = Warehouse::create([
            'name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id,
        ]);
        $this->manager = User::factory()->create([
            'role_id' => $role->id, 'warehouse_id' => $this->warehouse->id, 'status' => 'ACTIVE',
        ]);
        $this->product = Product::create(['name' => 'TOMAHAWK EC', 'category' => 'WOOD PRESERVATIVE PRODUCTS']);
    }

    public function test_candidate_detection_is_automatic_and_does_not_create_a_request(): void
    {
        Inventory::create([
            'barcode' => 'INV-AUTO-CANDIDATE',
            'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'available_stock' => 0,
            'backload' => 15,
        ]);

        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/options')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('warehouse.id', $this->warehouse->id)
            ->assertJsonPath('warehouse.name', 'Main Warehouse')
            ->assertJsonPath('data.0.currentStock', 0)
            ->assertJsonPath('data.0.priority', 'Critical')
            ->assertJsonPath('data.0.recommendedReorderQty', 15)
            ->assertJsonPath('data.0.requestStatus', 'not_submitted')
            ->assertJsonPath('data.0.canRequest', true);

        $this->assertDatabaseCount('replenishment_requests', 0);
    }

    public function test_product_without_inventory_cannot_be_manually_requested(): void
    {
        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'requested_qty' => 15,
        ])->assertUnprocessable()->assertJsonValidationErrors('product_id');

        $this->assertDatabaseCount('replenishment_requests', 0);
    }

    public function test_invalid_product_is_rejected(): void
    {
        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => 999999, 'warehouse_id' => $this->warehouse->id,
            'requested_qty' => 15, 'priority' => 'Medium',
        ])->assertUnprocessable()->assertJsonValidationErrors('product_id');
        $this->assertDatabaseCount('replenishment_requests', 0);
    }

    public function test_invalid_warehouse_is_rejected(): void
    {
        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => $this->product->id, 'warehouse_id' => 999999,
            'requested_qty' => 15, 'priority' => 'Medium',
        ])->assertUnprocessable()->assertJsonValidationErrors('warehouse_id');
        $this->assertDatabaseCount('replenishment_requests', 0);
    }

    public function test_foreign_existing_warehouse_is_forbidden_and_creates_no_request(): void
    {
        $otherBranch = Branch::create(['name' => 'Other Branch', 'code' => 'OTHER']);
        $otherWarehouse = Warehouse::create([
            'name' => 'Other Warehouse', 'code' => 'WH-OTHER', 'branch_id' => $otherBranch->id,
        ]);

        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => $this->product->id, 'warehouse_id' => $otherWarehouse->id,
            'requested_qty' => 15, 'priority' => 'Medium',
        ])->assertForbidden();

        $this->assertDatabaseCount('replenishment_requests', 0);
    }

    public function test_manager_without_assigned_warehouse_is_forbidden(): void
    {
        $this->manager->update(['warehouse_id' => null]);

        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => $this->product->id, 'warehouse_id' => $this->warehouse->id,
            'requested_qty' => 15, 'priority' => 'Medium',
        ])->assertForbidden();

        $this->assertDatabaseCount('replenishment_requests', 0);
    }

    public function test_qa_supervisor_and_guest_cannot_create_procurement_requests(): void
    {
        $qaRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $qa = User::factory()->create([
            'role_id' => $qaRole->id, 'warehouse_id' => $this->warehouse->id, 'status' => 'ACTIVE',
        ]);
        $payload = [
            'product_id' => $this->product->id, 'warehouse_id' => $this->warehouse->id,
            'requested_qty' => 15, 'priority' => 'Medium',
        ];

        $this->actingAs($qa)->postJson('/api/plant-manager/procurement/requests', $payload)->assertForbidden();
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/plant-manager/procurement/requests', $payload)->assertUnauthorized();
        $this->assertDatabaseCount('replenishment_requests', 0);
    }

    public function test_quantity_must_be_greater_than_zero(): void
    {
        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => $this->product->id, 'warehouse_id' => $this->warehouse->id,
            'requested_qty' => 0, 'priority' => 'Medium',
        ])->assertUnprocessable()->assertJsonValidationErrors('requested_qty');
        $this->assertDatabaseCount('replenishment_requests', 0);
    }

    public function test_candidate_boundaries_include_only_medium_high_and_critical_stock(): void
    {
        $expected = [
            0 => 'Critical', 10 => 'Critical', 11 => 'High', 20 => 'High',
            21 => 'Medium', 30 => 'Medium',
        ];

        foreach ($expected + [31 => 'Low'] as $stock => $priority) {
            $product = Product::create(['name' => "Boundary {$stock}"]);
            Inventory::create([
                'barcode' => "INV-BOUNDARY-{$stock}", 'product_id' => $product->id,
                'warehouse_id' => $this->warehouse->id, 'available_stock' => $stock,
            ]);
        }

        $candidates = collect($this->actingAs($this->manager)
            ->getJson('/api/plant-manager/procurement/options')
            ->assertOk()
            ->assertJsonCount(6, 'data')
            ->json('data'));

        foreach ($expected as $stock => $priority) {
            $candidate = $candidates->firstWhere('currentStock', $stock);
            $this->assertNotNull($candidate, "Stock boundary {$stock} was not detected.");
            $this->assertSame($priority, $candidate['priority']);
        }

        $this->assertNull($candidates->firstWhere('currentStock', 31));
        $this->assertDatabaseCount('replenishment_requests', 0);
    }

    public function test_client_priority_is_ignored_and_selected_warehouse_stock_is_authoritative(): void
    {
        Inventory::create([
            'barcode' => 'INV-MAIN', 'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id, 'available_stock' => 3,
        ]);
        $otherBranch = Branch::create(['name' => 'Other Branch', 'code' => 'OTHER']);
        $otherWarehouse = Warehouse::create(['name' => 'Other Warehouse', 'code' => 'WH-OTHER', 'branch_id' => $otherBranch->id]);
        Inventory::create([
            'barcode' => 'INV-OTHER', 'product_id' => $this->product->id,
            'warehouse_id' => $otherWarehouse->id, 'available_stock' => 100,
        ]);

        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'requested_qty' => 100,
            'priority' => 'Low',
        ])->assertCreated()->assertJsonPath('priority', 'Critical');
    }

    public function test_submitting_a_draft_recalculates_priority_from_latest_stock(): void
    {
        $inventory = Inventory::create([
            'barcode' => 'INV-DRAFT', 'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id, 'available_stock' => 15,
        ]);
        $draft = $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'requested_qty' => 25,
            'status' => 'draft',
        ])->assertCreated()->assertJsonPath('priority', 'High');

        $inventory->update(['available_stock' => 8]);

        $this->postJson('/api/plant-manager/procurement/requests/'.$draft->json('id').'/submit')
            ->assertOk()->assertJsonPath('priority', 'Critical')->assertJsonPath('status', 'pending');
    }

    public function test_manager_cannot_submit_an_owned_draft_from_an_unassigned_warehouse(): void
    {
        $otherBranch = Branch::create(['name' => 'Other Branch', 'code' => 'OTHER']);
        $otherWarehouse = Warehouse::create([
            'name' => 'Other Warehouse', 'code' => 'WH-OTHER', 'branch_id' => $otherBranch->id,
        ]);
        Inventory::create([
            'barcode' => 'INV-OTHER-DRAFT', 'product_id' => $this->product->id,
            'warehouse_id' => $otherWarehouse->id, 'available_stock' => 8,
        ]);
        $draft = ReplenishmentRequest::create([
            'request_no' => 'RR-OTHER-WAREHOUSE',
            'requested_by' => $this->manager->id,
            'warehouse_id' => $otherWarehouse->id,
            'product_id' => $this->product->id,
            'requested_qty' => 25,
            'priority' => 'Critical',
            'status' => ReplenishmentRequest::STATUS_DRAFT,
        ]);

        $this->actingAs($this->manager)
            ->postJson("/api/plant-manager/procurement/requests/{$draft->id}/submit")
            ->assertForbidden();

        $this->assertDatabaseHas('replenishment_requests', [
            'id' => $draft->id,
            'status' => ReplenishmentRequest::STATUS_DRAFT,
            'submitted_at' => null,
        ]);
    }

    public function test_live_candidate_priority_does_not_rewrite_historical_request_priority(): void
    {
        $inventory = Inventory::create([
            'barcode' => 'INV-HISTORICAL-PRIORITY', 'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id, 'available_stock' => 5,
        ]);
        $request = $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'requested_qty' => 25,
        ])->assertCreated()->assertJsonPath('priority', 'Critical');

        $inventory->update(['available_stock' => 25]);

        $this->getJson('/api/plant-manager/procurement/options')
            ->assertOk()
            ->assertJsonPath('data.0.priority', 'Medium')
            ->assertJsonPath('data.0.request.priority', 'Critical');
        $this->assertDatabaseHas('replenishment_requests', [
            'id' => $request->json('id'),
            'priority' => 'Critical',
        ]);
    }

    public function test_active_request_blocks_duplicate_for_same_product_and_warehouse(): void
    {
        Inventory::create([
            'barcode' => 'INV-DUPLICATE', 'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id, 'available_stock' => 12,
        ]);
        $payload = [
            'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'requested_qty' => 25,
        ];

        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests', $payload)
            ->assertCreated();
        $this->postJson('/api/plant-manager/procurement/requests', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('product_id');

        $this->assertDatabaseCount('replenishment_requests', 1);
    }

    public function test_completed_history_does_not_block_a_new_replenishment_cycle(): void
    {
        Inventory::create([
            'barcode' => 'INV-COMPLETED-CYCLE', 'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id, 'available_stock' => 5,
        ]);
        ReplenishmentRequest::create([
            'request_no' => 'RR-COMPLETED-CYCLE',
            'requested_by' => $this->manager->id,
            'warehouse_id' => $this->warehouse->id,
            'product_id' => $this->product->id,
            'requested_qty' => 25,
            'priority' => 'Critical',
            'status' => ReplenishmentRequest::STATUS_COMPLETED,
            'submitted_at' => now()->subDay(),
        ]);

        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/options')
            ->assertOk()
            ->assertJsonPath('data.0.priority', 'Critical')
            ->assertJsonPath('data.0.requestStatus', 'not_submitted')
            ->assertJsonPath('data.0.canRequest', true)
            ->assertJsonPath('data.0.request', null);

        $this->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'requested_qty' => 30,
        ])->assertCreated()->assertJsonPath('status', ReplenishmentRequest::STATUS_PENDING);

        $this->assertDatabaseCount('replenishment_requests', 2);
    }

    public function test_pending_and_for_purchase_order_requests_remain_active_candidate_blockers(): void
    {
        Inventory::create([
            'barcode' => 'INV-ACTIVE-CYCLE', 'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id, 'available_stock' => 9,
        ]);
        $active = ReplenishmentRequest::create([
            'request_no' => 'RR-ACTIVE-CYCLE',
            'requested_by' => $this->manager->id,
            'warehouse_id' => $this->warehouse->id,
            'product_id' => $this->product->id,
            'requested_qty' => 25,
            'priority' => 'Critical',
            'status' => ReplenishmentRequest::STATUS_PENDING,
            'submitted_at' => now(),
        ]);

        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/options')
            ->assertOk()
            ->assertJsonPath('data.0.requestStatus', ReplenishmentRequest::STATUS_PENDING)
            ->assertJsonPath('data.0.canRequest', false);

        $active->update(['status' => ReplenishmentRequest::STATUS_FOR_PURCHASE_ORDER]);
        $this->getJson('/api/plant-manager/procurement/options')
            ->assertOk()
            ->assertJsonPath('data.0.requestStatus', ReplenishmentRequest::STATUS_FOR_PURCHASE_ORDER)
            ->assertJsonPath('data.0.canRequest', false);
    }

    public function test_rejected_history_is_not_an_active_candidate_blocker(): void
    {
        Inventory::create([
            'barcode' => 'INV-REJECTED-CYCLE', 'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id, 'available_stock' => 18,
        ]);
        ReplenishmentRequest::create([
            'request_no' => 'RR-REJECTED-CYCLE',
            'requested_by' => $this->manager->id,
            'warehouse_id' => $this->warehouse->id,
            'product_id' => $this->product->id,
            'requested_qty' => 25,
            'priority' => 'High',
            'status' => ReplenishmentRequest::STATUS_REJECTED,
            'submitted_at' => now(),
        ]);

        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/options')
            ->assertOk()
            ->assertJsonPath('data.0.requestStatus', 'not_submitted')
            ->assertJsonPath('data.0.canRequest', true);
    }

    public function test_options_are_scoped_to_the_managers_assigned_warehouse(): void
    {
        $otherBranch = Branch::create(['name' => 'Other Branch', 'code' => 'OTHER']);
        $otherWarehouse = Warehouse::create([
            'name' => 'Other Warehouse', 'code' => 'WH-OTHER', 'branch_id' => $otherBranch->id,
        ]);
        Inventory::create([
            'barcode' => 'INV-OWN', 'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id, 'available_stock' => 20,
        ]);
        $otherProduct = Product::create(['name' => 'Other warehouse product']);
        Inventory::create([
            'barcode' => 'INV-FOREIGN', 'product_id' => $otherProduct->id,
            'warehouse_id' => $otherWarehouse->id, 'available_stock' => 0,
        ]);

        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/options')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.productId', $this->product->id)
            ->assertJsonMissing(['productId' => $otherProduct->id]);
    }

    public function test_bulk_submission_is_atomic_and_notifies_admins_for_each_request(): void
    {
        Notification::fake();
        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        Inventory::create([
            'barcode' => 'INV-BULK-1', 'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id, 'available_stock' => 10,
        ]);
        $secondProduct = Product::create(['name' => 'Second candidate']);
        Inventory::create([
            'barcode' => 'INV-BULK-2', 'product_id' => $secondProduct->id,
            'warehouse_id' => $this->warehouse->id, 'available_stock' => 21,
        ]);

        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests/bulk', [
            'items' => [
                ['product_id' => $this->product->id, 'requested_qty' => 30],
                ['product_id' => $secondProduct->id, 'requested_qty' => 40],
            ],
        ])->assertCreated()->assertJsonCount(2, 'data');

        $this->assertDatabaseCount('replenishment_requests', 2);
        $this->assertDatabaseCount('audit_logs', 2);
        $this->assertDatabaseHas('audit_logs', ['action' => 'PROCUREMENT_REQUEST_SUBMITTED']);
        Notification::assertSentToTimes($admin, WorkflowNotification::class, 2);
    }

    public function test_bulk_submission_rolls_back_all_items_when_one_is_ineligible(): void
    {
        Inventory::create([
            'barcode' => 'INV-BULK-VALID', 'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id, 'available_stock' => 10,
        ]);
        $lowProduct = Product::create(['name' => 'Low-priority stock']);
        Inventory::create([
            'barcode' => 'INV-BULK-LOW', 'product_id' => $lowProduct->id,
            'warehouse_id' => $this->warehouse->id, 'available_stock' => 31,
        ]);

        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests/bulk', [
            'items' => [
                ['product_id' => $this->product->id, 'requested_qty' => 30],
                ['product_id' => $lowProduct->id, 'requested_qty' => 40],
            ],
        ])->assertUnprocessable()->assertJsonValidationErrors('product_id');

        $this->assertDatabaseCount('replenishment_requests', 0);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    // TEST 11-14: the Plant Manager's requested quantity is required, whole, positive, bounded, and kept as entered.
    public function test_requested_quantity_must_be_a_positive_whole_number_and_is_persisted(): void
    {
        Inventory::create(['barcode' => 'INV-QTY', 'product_id' => $this->product->id, 'warehouse_id' => $this->warehouse->id, 'available_stock' => 0]);
        $url = '/api/plant-manager/procurement/requests';
        $base = ['product_id' => $this->product->id, 'warehouse_id' => $this->warehouse->id];

        foreach ([null, '', 0, -5, 10.5, '10.5', 'ten', 1000001] as $invalid) {
            $this->actingAs($this->manager)->postJson($url, [...$base, 'requested_qty' => $invalid])
                ->assertUnprocessable()->assertJsonValidationErrors('requested_qty');
        }
        $this->postJson("{$url}/bulk", ['items' => [['product_id' => $this->product->id, 'requested_qty' => 0]]])
            ->assertUnprocessable()->assertJsonValidationErrors('items.0.requested_qty');
        $this->assertDatabaseCount('replenishment_requests', 0);

        $this->postJson($url, [...$base, 'requested_qty' => 50])->assertCreated()
            ->assertJsonPath('requested_qty', 50)->assertJsonPath('status', 'pending');
        $this->assertDatabaseHas('replenishment_requests', ['product_id' => $this->product->id, 'requested_qty' => 50, 'status' => 'pending']);
    }
}
