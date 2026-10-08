<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\QaInspection;
use App\Models\QaInspectionItem;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\ReplenishmentRequest;
use App\Models\Role;
use App\Models\SupplierRejectionCase;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ReplenishmentFulfillmentStageTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private User $admin;
    private Warehouse $warehouse;
    private Product $product;
    private int $sequence = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $this->warehouse = Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id, 'status' => 'Active']);
        $this->manager = User::factory()->create(['role_id' => $managerRole->id, 'warehouse_id' => $this->warehouse->id, 'status' => 'ACTIVE']);
        $this->admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        $this->product = Product::create(['name' => 'MegaAdd CI']);
        Inventory::create(['barcode' => 'STAGE-1', 'product_id' => $this->product->id, 'warehouse_id' => $this->warehouse->id, 'available_stock' => 0]);
    }

    private function cycle(string $requestStatus, string $poStatus): array
    {
        $this->sequence++;
        $request = ReplenishmentRequest::create([
            'request_no' => "RR-STAGE-{$this->sequence}", 'requested_by' => $this->manager->id, 'warehouse_id' => $this->warehouse->id,
            'product_id' => $this->product->id, 'requested_qty' => 100, 'priority' => 'Critical',
            'status' => $requestStatus, 'submitted_at' => now(), 'reviewed_at' => now(),
        ]);
        $po = PurchaseOrder::create([
            'po_number' => "PO-STAGE-{$this->sequence}", 'replenishment_request_id' => $request->id, 'supplier_name' => 'Novaplaza',
            'delivery_details' => 'Main Warehouse', 'expected_delivery_date' => now()->toDateString(),
            'total_amount' => 1000, 'status' => $poStatus, 'approved_by' => $this->admin->id,
        ]);

        return [$request, $po];
    }

    private function receiving(PurchaseOrder $po, string $status, ?SupplierRejectionCase $replacementFor = null): Receiving
    {
        $this->sequence++;

        return Receiving::create([
            'receiving_no' => 'RCV-'.str_pad((string) $this->sequence, 5, '0', STR_PAD_LEFT), 'purchase_order_id' => $po->id,
            'purchase_order' => $po->po_number, 'supplier' => 'Novaplaza', 'delivery_date' => now()->toDateString(),
            'status' => $status, 'replacement_for_rejection_case_id' => $replacementFor?->id,
        ]);
    }

    private function inspected(Receiving $receiving, int $accepted, int $rejected, string $result): QaInspectionItem
    {
        $item = ReceivingItem::create([
            'receiving_id' => $receiving->id, 'product_id' => $this->product->id, 'product_name' => $this->product->name,
            'ordered_quantity' => 100, 'delivered_quantity' => $accepted + $rejected, 'inspection_status' => $result,
        ]);
        $inspection = QaInspection::create(['receiving_id' => $receiving->id, 'status' => $result, 'started_at' => now(), 'completed_at' => now()]);

        return QaInspectionItem::create([
            'qa_inspection_id' => $inspection->id, 'receiving_item_id' => $item->id,
            'accepted_quantity' => $accepted, 'rejected_quantity' => $rejected, 'inspection_result' => $result,
        ]);
    }

    private function candidates(): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/options')->assertOk();
    }

    private function snapshot(): array
    {
        return collect(['replenishment_requests', 'purchase_orders', 'receivings', 'receiving_items', 'qa_inspections', 'qa_inspection_items', 'supplier_rejection_cases', 'audit_logs'])
            ->mapWithKeys(fn (string $table) => [$table => DB::table($table)->orderBy('id')->get()->map(fn ($row) => (array) $row)->all()])
            ->all();
    }

    // TEST 17
    public function test_po_created_request_with_receiving_pending_qa_shows_pending_qa_stage(): void
    {
        [, $po] = $this->cycle(ReplenishmentRequest::STATUS_PO_CREATED, PurchaseOrder::STATUS_PARTIALLY_RECEIVED);
        $this->receiving($po, 'Pending QA');

        $response = $this->candidates()
            ->assertJsonPath('data.0.requestStatus', 'po_created')
            ->assertJsonPath('data.0.request.status', 'po_created')
            ->assertJsonPath('data.0.request.current_fulfillment_stage', 'pending_qa')
            ->assertJsonPath('data.0.request.current_fulfillment_stage_label', 'Pending QA')
            ->assertJsonPath('data.0.request.fulfillment.purchase_order.number', $po->po_number)
            ->assertJsonPath('data.0.request.fulfillment.receiving.status', 'Pending QA');
        $timeline = collect($response->json('data.0.request.timeline'))->pluck('state', 'key');
        $this->assertSame('done', $timeline['delivery_received']);
        $this->assertSame('current', $timeline['pending_qa']);
        $this->assertSame('upcoming', $timeline['ready_for_stock_in']);
    }

    public function test_po_without_receiving_shows_po_created_or_sent_and_approved_without_po_shows_for_purchase_order(): void
    {
        [, $po] = $this->cycle(ReplenishmentRequest::STATUS_PO_CREATED, PurchaseOrder::STATUS_APPROVED);
        $this->candidates()->assertJsonPath('data.0.request.current_fulfillment_stage', 'po_created');
        $po->update(['status' => PurchaseOrder::STATUS_SENT_TO_SUPPLIER]);
        $this->candidates()->assertJsonPath('data.0.request.current_fulfillment_stage', 'sent_to_supplier');

        $po->delete();
        ReplenishmentRequest::query()->update(['status' => ReplenishmentRequest::STATUS_FOR_PURCHASE_ORDER]);
        $this->candidates()->assertJsonPath('data.0.request.current_fulfillment_stage', 'for_purchase_order');
    }

    // TEST 18
    public function test_existing_rejected_item_is_read_as_qa_rejected_without_mutation(): void
    {
        [, $po] = $this->cycle(ReplenishmentRequest::STATUS_PO_CREATED, PurchaseOrder::STATUS_PARTIALLY_RECEIVED);
        $receiving = $this->receiving($po, 'Rejected');
        $item = $this->inspected($receiving, 0, 100, 'Rejected');
        SupplierRejectionCase::create(['qa_inspection_item_id' => $item->id, 'status' => 'SENT', 'sent_at' => now()]);
        $before = $this->snapshot();

        $response = $this->candidates()->assertJsonPath('data.0.request.current_fulfillment_stage', 'qa_rejected')
            ->assertJsonPath('data.0.request.fulfillment.replacement.case_status', 'SENT');
        $timeline = collect($response->json('data.0.request.timeline'))->pluck('state', 'key');
        $this->assertSame('failed', $timeline['qa_rejected']);
        $this->assertSame('current', $timeline['supplier_replacement']);

        $this->assertSame($before, $this->snapshot());
    }

    // TEST 19
    public function test_pending_replacement_is_read_as_awaiting_supplier_replacement_without_creating_records(): void
    {
        [, $po] = $this->cycle(ReplenishmentRequest::STATUS_PO_CREATED, PurchaseOrder::STATUS_PARTIALLY_RECEIVED);
        $original = $this->receiving($po, 'Partial');
        $item = $this->inspected($original, 50, 50, 'Partial');
        ReceivingItem::query()->update(['stocked_in_at' => now()]);
        $case = SupplierRejectionCase::create(['qa_inspection_item_id' => $item->id, 'status' => 'REPLACEMENT_PENDING', 'resolution_type' => 'REPLACEMENT']);
        $this->receiving($po, Receiving::STATUS_AWAITING_REPLACEMENT, $case);
        $before = $this->snapshot();

        $this->candidates()->assertJsonPath('data.0.request.current_fulfillment_stage', 'awaiting_supplier_replacement')
            ->assertJsonPath('data.0.request.current_fulfillment_stage_label', 'Awaiting Supplier Replacement')
            ->assertJsonPath('data.0.request.fulfillment.replacement.receiving_status', 'Awaiting Replacement');
        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/requests?scope=history')->assertOk()
            ->assertJsonPath('data.0.current_fulfillment_stage', 'awaiting_supplier_replacement');

        $this->assertSame($before, $this->snapshot());

        Receiving::query()->where('status', Receiving::STATUS_AWAITING_REPLACEMENT)->update(['status' => 'Pending QA']);
        $this->candidates()->assertJsonPath('data.0.request.current_fulfillment_stage', 'replacement_receiving');
    }

    public function test_accepted_unstocked_delivery_is_ready_for_stock_in_then_completed(): void
    {
        [$request, $po] = $this->cycle(ReplenishmentRequest::STATUS_COMPLETED, PurchaseOrder::STATUS_COMPLETED);
        $this->inspected($this->receiving($po, 'Passed'), 100, 0, 'Passed');

        $history = fn () => $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/requests?scope=history')->assertOk();
        $history()->assertJsonPath('data.0.status', 'completed')
            ->assertJsonPath('data.0.current_fulfillment_stage', 'ready_for_stock_in');

        ReceivingItem::query()->update(['stocked_in_at' => now()]);
        $timeline = collect($history()->assertJsonPath('data.0.current_fulfillment_stage', 'completed')->json('data.0.timeline'));
        $this->assertTrue($timeline->every(fn (array $step) => $step['state'] === 'done'));
        $this->assertSame(ReplenishmentRequest::STATUS_COMPLETED, $request->fresh()->status);
    }

    // TEST 20
    public function test_completed_cycle_does_not_block_a_new_cycle_for_zero_stock(): void
    {
        [, $po] = $this->cycle(ReplenishmentRequest::STATUS_COMPLETED, PurchaseOrder::STATUS_COMPLETED);
        $this->inspected($this->receiving($po, 'Passed'), 100, 0, 'Passed');
        ReceivingItem::query()->update(['stocked_in_at' => now()]);

        $this->candidates()->assertJsonPath('data.0.requestStatus', 'not_submitted')
            ->assertJsonPath('data.0.canRequest', true)->assertJsonPath('data.0.request', null);
        $this->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => $this->product->id, 'warehouse_id' => $this->warehouse->id, 'requested_qty' => 50,
        ])->assertCreated()->assertJsonPath('status', 'pending')
            ->assertJsonPath('current_fulfillment_stage', 'pending_admin_approval');
    }
}
