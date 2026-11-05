<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\ExcessDeliveryReview;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use App\Notifications\WorkflowNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\TestCase;

class ExcessDeliveryReviewTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $manager;
    private User $qaSupervisor;
    private PurchaseOrder $order;
    private int $itemId;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->admin = $this->user('ADMIN');
        $this->manager = $this->user('PLANT_MANAGER');
        $this->qaSupervisor = $this->user('QA_SUPERVISOR');
        $branch = Branch::create(['name' => 'Main', 'code' => 'MAIN']);
        Warehouse::create([
            'name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id,
            'capacity' => 1000, 'capacity_powder' => 1000, 'capacity_liquid' => 0,
            'capacity_solid' => 0, 'capacity_returned' => 0,
        ]);
        $product = Product::create(['name' => 'TRI-MOR', 'unit' => 'SACK', 'cost_price' => 100]);
        $this->order = PurchaseOrder::create(['po_number' => 'PO-EXCESS-1', 'supplier_name' => 'Supplier', 'delivery_details' => 'Main', 'expected_delivery_date' => '2026-11-10', 'total_amount' => 1000, 'status' => PurchaseOrder::STATUS_APPROVED, 'approved_by' => $this->admin->id]);
        $this->itemId = $this->order->items()->create(['product_id' => $product->id, 'product_name' => $product->name, 'ordered_quantity' => 10, 'unit' => 'SACK', 'unit_price' => 100, 'total_price' => 1000])->id;
    }

    private function user(string $slug): User
    {
        $role = Role::firstOrCreate(['slug' => $slug], ['name' => $slug]);
        return User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
    }

    private function payload(?string $key = null, string $reference = 'DR-11'): array
    {
        return ['submission_key' => $key ?? (string) Str::uuid(), 'purchase_order_id' => $this->order->id, 'reference_no' => $reference, 'delivery_date' => '2026-11-01', 'items' => [['purchase_order_item_id' => $this->itemId, 'delivered_quantity' => 11]], 'receipts' => [UploadedFile::fake()->createWithContent('receipt.pdf', "%PDF-1.4\n%%EOF\n")]];
    }

    public function test_excess_is_recorded_on_hold_without_po_or_inventory_effect(): void
    {
        $response = $this->actingAs($this->manager)->post('/api/receivings/excess-reviews', $this->payload(), ['Accept' => 'application/json'])->assertCreated()
            ->assertJsonPath('status', ExcessDeliveryReview::STATUS_PENDING)->assertJsonPath('items.0.expected_quantity', 10)
            ->assertJsonPath('items.0.delivered_quantity', 11)->assertJsonPath('items.0.excess_quantity', 1)->assertJsonPath('items.0.unit', 'SACK');
        $this->assertDatabaseHas('receivings', ['id' => $response->json('receiving_id'), 'status' => 'Pending QA']);
        $this->assertDatabaseHas('receiving_items', ['receiving_id' => $response->json('receiving_id'), 'delivered_quantity' => 10, 'inspection_status' => 'Pending QA']);
        $this->assertDatabaseHas('receiving_items', ['receiving_id' => $response->json('receiving_id'), 'delivered_quantity' => 1, 'inspection_status' => 'On Hold']);
        $this->assertDatabaseHas('purchase_orders', ['id' => $this->order->id, 'status' => PurchaseOrder::STATUS_APPROVED]);
        $this->assertDatabaseCount('inventories', 0);
        $this->actingAs($this->manager)->patchJson("/api/receivings/{$response->json('receiving_id')}/assign-qa", ['qa_user_id' => $this->qaSupervisor->id])->assertOk();
        $this->actingAs($this->qaSupervisor)->getJson('/api/qa/inspections')->assertOk()
            ->assertJsonPath('data.0.id', $response->json('receiving_id'))
            ->assertJsonPath('data.0.items', 10);
    }

    public function test_submission_key_is_idempotent_and_normal_route_remains_protected(): void
    {
        $key = (string) Str::uuid();
        $first = $this->actingAs($this->manager)->post('/api/receivings/excess-reviews', $this->payload($key), ['Accept' => 'application/json'])->assertCreated();
        $second = $this->post('/api/receivings/excess-reviews', $this->payload($key), ['Accept' => 'application/json'])->assertOk();
        $this->assertSame($first->json('id'), $second->json('id'));
        $this->assertDatabaseCount('excess_delivery_reviews', 1);
        $this->post('/api/receivings/excess-reviews', $this->payload(), ['Accept' => 'application/json'])->assertUnprocessable();
        $this->post('/api/receivings', array_diff_key($this->payload(), ['submission_key' => true]), ['Accept' => 'application/json'])->assertUnprocessable();
    }

    public function test_authorized_quantity_already_released_from_pending_excess_consumes_po_balance(): void
    {
        $this->actingAs($this->manager)->post('/api/receivings/excess-reviews', $this->payload(), ['Accept'=>'application/json'])->assertCreated();
        $normal = $this->payload(reference: 'SECOND-DELIVERY');
        unset($normal['submission_key']);
        $normal['items'][0]['delivered_quantity'] = 1;
        $this->post('/api/receivings', $normal, ['Accept'=>'application/json'])->assertUnprocessable();
        $this->assertDatabaseCount('receivings', 1);
        $this->assertDatabaseCount('inventories', 0);
    }

    public function test_only_admin_can_review_and_written_evidence_is_required(): void
    {
        $this->actingAs($this->admin)
            ->post('/api/receivings/excess-reviews', $this->payload(), ['Accept' => 'application/json'])
            ->assertForbidden();
        $reviewId = $this->actingAs($this->manager)->post('/api/receivings/excess-reviews', $this->payload(), ['Accept' => 'application/json'])->json('id');
        $this->postJson("/api/admin/excess-delivery-reviews/{$reviewId}", ['action' => 'APPROVE', 'cost_resolution' => ExcessDeliveryReview::COST_FREE, 'supplier_confirmation_reference' => 'EMAIL-1'])->assertForbidden();
        $this->actingAs($this->admin)->postJson("/api/admin/excess-delivery-reviews/{$reviewId}", ['action' => 'APPROVE', 'cost_resolution' => ExcessDeliveryReview::COST_FREE, 'supplier_confirmation_reference' => 'EMAIL-1'])->assertUnprocessable();

        $this->actingAs($this->admin)->post(
            "/api/admin/excess-delivery-reviews/{$reviewId}",
            [
                'action' => 'APPROVE',
                'cost_resolution' => ExcessDeliveryReview::COST_FREE,
                'supplier_confirmation_reference' => 'EMAIL-1',
                'supplier_evidence' => UploadedFile::fake()->createWithContent('supplier.txt', 'not approved evidence'),
            ],
            ['Accept' => 'application/json'],
        )->assertUnprocessable()->assertJsonValidationErrors('supplier_evidence');
    }

    public function test_free_excess_approval_routes_the_actual_delivery_to_qa(): void
    {
        $reviewId = $this->actingAs($this->manager)->post('/api/receivings/excess-reviews', $this->payload(), ['Accept' => 'application/json'])->json('id');
        $response = $this->actingAs($this->admin)->post("/api/admin/excess-delivery-reviews/{$reviewId}", ['action' => 'APPROVE', 'cost_resolution' => ExcessDeliveryReview::COST_FREE, 'supplier_confirmation_reference' => 'EMAIL-APPROVED', 'supplier_evidence' => UploadedFile::fake()->createWithContent('supplier.pdf', "%PDF-1.4\n%%EOF\n")], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('status', ExcessDeliveryReview::STATUS_APPROVED);
        $this->assertDatabaseHas('receivings', ['id' => $response->json('receiving_id'), 'status' => 'Pending QA']);
        $this->assertSame(11, ReceivingItem::query()->where('receiving_id', $response->json('receiving_id'))->where('inspection_status', 'Pending QA')->sum('delivered_quantity'));
        $this->assertDatabaseHas('purchase_orders', ['id' => $this->order->id, 'status' => PurchaseOrder::STATUS_COMPLETED]);
        $this->assertDatabaseCount('inventories', 0);
        $this->actingAs($this->manager)->get("/api/admin/excess-delivery-reviews/{$reviewId}/evidence")->assertForbidden();
        $this->actingAs($this->admin)->get("/api/admin/excess-delivery-reviews/{$reviewId}/evidence")->assertOk();
    }

    public function test_only_approved_and_qa_accepted_excess_can_be_stocked_once(): void
    {
        $created = $this->actingAs($this->manager)
            ->post('/api/receivings/excess-reviews', $this->payload(), ['Accept' => 'application/json'])
            ->assertCreated();
        $receivingId = $created->json('receiving_id');

        $this->postJson("/api/stock-in/receivings/{$receivingId}/stock-in")
            ->assertUnprocessable();
        $this->assertDatabaseCount('inventories', 0);

        $approved = $this->actingAs($this->admin)->post(
            "/api/admin/excess-delivery-reviews/{$created->json('id')}",
            [
                'action' => 'APPROVE',
                'cost_resolution' => ExcessDeliveryReview::COST_FREE,
                'supplier_confirmation_reference' => 'EMAIL-STOCK-IN',
                'supplier_evidence' => UploadedFile::fake()->createWithContent('supplier.pdf', "%PDF-1.4\n%%EOF\n"),
            ],
            ['Accept' => 'application/json'],
        )->assertOk();

        $receivingItems = ReceivingItem::query()->where('receiving_id', $receivingId)->get();
        $this->assertCount(2, $receivingItems);

        $this->actingAs($this->manager)
            ->patchJson("/api/receivings/{$receivingId}/assign-qa", ['qa_user_id' => $this->qaSupervisor->id])
            ->assertOk();

        $this->actingAs($this->qaSupervisor)->post(
            "/api/qa/inspections/{$receivingId}",
            [
                'attachment' => UploadedFile::fake()->createWithContent('qa-proof.pdf', "%PDF-1.4\n%%EOF\n"),
                'items' => $receivingItems->map(fn (ReceivingItem $item) => [
                    'receiving_item_id' => $item->id,
                    'accepted_quantity' => $item->delivered_quantity,
                    'rejected_quantity' => 0,
                    'inspection_result' => 'Passed',
                    'remarks' => 'Approved physical excess accepted.',
                ])->all(),
            ],
            ['Accept' => 'application/json'],
        )->assertOk();

        $this->actingAs($this->manager)
            ->postJson("/api/stock-in/receivings/{$receivingId}/stock-in")
            ->assertOk();
        $this->assertSame(11, Inventory::query()->sum('available_stock'));

        $this->postJson("/api/stock-in/receivings/{$receivingId}/stock-in")
            ->assertUnprocessable();
        $this->assertSame(11, Inventory::query()->sum('available_stock'));
    }

    public function test_authorized_and_later_approved_excess_are_processed_in_separate_idempotent_cycles(): void
    {
        $created = $this->actingAs($this->manager)
            ->post('/api/receivings/excess-reviews', $this->payload(), ['Accept' => 'application/json'])
            ->assertCreated();
        $receivingId = $created->json('receiving_id');
        $reviewId = $created->json('id');
        $authorizedItem = ReceivingItem::query()->where('receiving_id', $receivingId)->where('delivered_quantity', 10)->sole();
        $heldItem = ReceivingItem::query()->where('receiving_id', $receivingId)->where('delivered_quantity', 1)->sole();

        $this->actingAs($this->manager)->patchJson("/api/receivings/{$receivingId}/assign-qa", ['qa_user_id' => $this->qaSupervisor->id])->assertOk();
        $this->assertDatabaseHas('qa_inspections', ['receiving_id' => $receivingId, 'cycle_number' => 1]);
        $this->assertDatabaseHas('qa_inspection_items', ['receiving_item_id' => $authorizedItem->id]);
        $this->assertDatabaseMissing('qa_inspection_items', ['receiving_item_id' => $heldItem->id]);
        $this->actingAs($this->qaSupervisor)->getJson("/api/qa/inspections/{$receivingId}")
            ->assertOk()->assertJsonCount(1, 'products')
            ->assertJsonPath('quantity_context.original_physical_delivery', 11)
            ->assertJsonPath('quantity_context.current_inspection', 10)
            ->assertJsonPath('quantity_context.held_excess', 1);
        $this->actingAs($this->qaSupervisor)->postJson("/api/qa/inspections/{$receivingId}", ['items' => [[
            'receiving_item_id' => $authorizedItem->id, 'accepted_quantity' => 10,
            'rejected_quantity' => 0, 'inspection_result' => 'Passed', 'remarks' => 'Authorized partition accepted.',
        ]]])->assertOk();
        $this->actingAs($this->manager)->postJson("/api/stock-in/receivings/{$receivingId}/stock-in")->assertOk();
        $this->assertSame(10, Inventory::query()->sum('available_stock'));
        $this->actingAs($this->manager)->getJson('/api/excess-delivery-reviews?view=active')
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $reviewId)
            ->assertJsonPath('data.0.receiving_id', $receivingId)
            ->assertJsonPath('data.0.is_resolved', false)
            ->assertJsonPath('data.0.next_action', 'Awaiting Admin review');
        $this->actingAs($this->manager)->getJson('/api/excess-delivery-reviews?view=history')
            ->assertOk()->assertJsonCount(0, 'data');
        $this->assertDatabaseCount('receivings', 1);

        $this->actingAs($this->manager)->patchJson("/api/receivings/{$receivingId}/assign-qa", ['qa_user_id' => $this->qaSupervisor->id])->assertUnprocessable();
        $this->actingAs($this->manager)->postJson("/api/stock-in/receivings/{$receivingId}/stock-in")->assertUnprocessable();
        $this->assertSame(10, Inventory::query()->sum('available_stock'));

        $this->actingAs($this->admin)->post("/api/admin/excess-delivery-reviews/{$reviewId}", [
            'action' => 'APPROVE', 'cost_resolution' => ExcessDeliveryReview::COST_FREE,
            'supplier_confirmation_reference' => 'EMAIL-LATE-APPROVAL',
            'supplier_evidence' => UploadedFile::fake()->createWithContent('supplier.pdf', "%PDF-1.4\n%%EOF\n"),
        ], ['Accept' => 'application/json'])->assertOk();

        $this->actingAs($this->manager)->getJson('/api/excess-delivery-reviews?view=active')
            ->assertOk()
            ->assertJsonPath('data.0.qa_assignment.can_assign', true)
            ->assertJsonPath('data.0.qa_assignment.state', 'NOT_ASSIGNED')
            ->assertJsonPath('data.0.qa_assignment.next_cycle_number', 2)
            ->assertJsonPath('data.0.qa_assignment.eligible_quantity', 1);

        Notification::fake();
        $secondAssignment = [
            'qa_user_id' => $this->qaSupervisor->id,
            'operation' => 'assign_excess',
            'excess_review_id' => $reviewId,
        ];
        $this->actingAs($this->manager)->patchJson("/api/receivings/{$receivingId}/assign-qa", $secondAssignment)
            ->assertOk()
            ->assertJsonPath('qa_assignment.outcome', 'excess_cycle_created')
            ->assertJsonPath('qa_assignment.cycle_number', 2);
        $this->assertDatabaseHas('qa_inspections', ['receiving_id' => $receivingId, 'cycle_number' => 2]);
        $this->actingAs($this->manager)->getJson('/api/excess-delivery-reviews?view=active')
            ->assertOk()
            ->assertJsonPath('data.0.qa_assignment.can_assign', false)
            ->assertJsonPath('data.0.qa_assignment.can_reassign', true)
            ->assertJsonPath('data.0.qa_assignment.state', 'ASSIGNED_PENDING_QA')
            ->assertJsonPath('data.0.qa_assignment.cycle_number', 2);
        $this->assertDatabaseHas('qa_inspections', ['receiving_id' => $receivingId, 'cycle_number' => 1, 'status' => 'Passed']);
        $auditCountBeforeRetry = DB::table('audit_logs')->where('action', 'QA_ASSIGNED')->count();
        $this->actingAs($this->manager)->patchJson("/api/receivings/{$receivingId}/assign-qa", $secondAssignment)
            ->assertOk()
            ->assertJsonPath('qa_assignment.outcome', 'unchanged')
            ->assertJsonPath('qa_assignment.cycle_number', 2);
        $this->assertSame($auditCountBeforeRetry, DB::table('audit_logs')->where('action', 'QA_ASSIGNED')->count());
        $this->assertSame(2, \App\Models\QaInspection::query()->where('receiving_id', $receivingId)->count());
        Notification::assertSentToTimes($this->qaSupervisor, WorkflowNotification::class, 1);
        $otherQa = $this->user('QA_SUPERVISOR');
        $this->actingAs($this->manager)->patchJson("/api/receivings/{$receivingId}/assign-qa", [
            'qa_user_id' => $otherQa->id, 'operation' => 'assign_excess', 'excess_review_id' => $reviewId,
        ])->assertUnprocessable();
        $this->actingAs($this->manager)->patchJson("/api/receivings/{$receivingId}/assign-qa", [
            'qa_user_id' => $otherQa->id, 'operation' => 'reassign_excess', 'excess_review_id' => $reviewId,
        ])->assertOk()
            ->assertJsonPath('qa_assignment.outcome', 'reassigned')
            ->assertJsonPath('qa_assignment.cycle_number', 2);
        $this->assertDatabaseHas('qa_inspections', ['receiving_id' => $receivingId, 'cycle_number' => 1, 'inspected_by_id' => $this->qaSupervisor->id, 'status' => 'Passed']);
        $this->assertDatabaseHas('qa_inspections', ['receiving_id' => $receivingId, 'cycle_number' => 2, 'inspected_by_id' => $otherQa->id, 'status' => 'Pending']);
        $this->actingAs($this->qaSupervisor)->getJson("/api/qa/inspections/{$receivingId}")->assertNotFound();
        $this->actingAs($otherQa)->getJson("/api/qa/inspections/{$receivingId}")
            ->assertOk()->assertJsonCount(1, 'products')
            ->assertJsonPath('products.0.receiving_item_id', $heldItem->id)
            ->assertJsonPath('quantity_context.current_inspection', 1)
            ->assertJsonPath('quantity_context.previously_inspected', 10)
            ->assertJsonPath('quantity_context.previously_stocked_in', 10);
        $this->actingAs($otherQa)->postJson("/api/qa/inspections/{$receivingId}", ['items' => [[
            'receiving_item_id' => $heldItem->id, 'accepted_quantity' => 1,
            'rejected_quantity' => 0, 'inspection_result' => 'Passed', 'remarks' => 'Approved excess accepted.',
        ]]])->assertOk();
        $this->actingAs($this->manager)->getJson('/api/excess-delivery-reviews?view=active')
            ->assertOk()
            ->assertJsonPath('data.0.qa_assignment.can_assign', false)
            ->assertJsonPath('data.0.qa_assignment.state', 'AWAITING_STOCK_IN');
        $this->actingAs($this->manager)->postJson("/api/stock-in/receivings/{$receivingId}/stock-in")->assertOk();
        $this->assertSame(11, Inventory::query()->sum('available_stock'));
        $this->actingAs($this->manager)->getJson('/api/excess-delivery-reviews?view=active')
            ->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($this->manager)->getJson('/api/excess-delivery-reviews?view=history')
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $reviewId)
            ->assertJsonPath('data.0.is_resolved', true)
            ->assertJsonPath('data.0.next_action', 'Resolved');
        $this->actingAs($this->admin)->getJson('/api/admin/excess-delivery-reviews')
            ->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('meta.total', 0);
        $this->actingAs($this->admin)->getJson('/api/admin/excess-delivery-reviews?view=history')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $reviewId);

        $this->actingAs($this->manager)->patchJson("/api/receivings/{$receivingId}/assign-qa", ['qa_user_id' => $this->qaSupervisor->id])->assertUnprocessable();
        $this->actingAs($this->manager)->postJson("/api/stock-in/receivings/{$receivingId}/stock-in")->assertUnprocessable();
        $this->assertSame(11, Inventory::query()->sum('available_stock'));
        $this->assertDatabaseCount('qa_inspections', 2);
    }

    public function test_plant_manager_excess_list_is_owned_paginated_and_does_not_expose_admin_notes(): void
    {
        $created = $this->actingAs($this->manager)
            ->post('/api/receivings/excess-reviews', $this->payload(), ['Accept' => 'application/json'])
            ->assertCreated();
        $otherManager = $this->user('PLANT_MANAGER');

        $this->actingAs($otherManager)->getJson('/api/excess-delivery-reviews?view=active')
            ->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($otherManager)->patchJson("/api/receivings/{$created->json('receiving_id')}/assign-qa", [
            'qa_user_id' => $this->qaSupervisor->id,
            'operation' => 'assign_excess',
            'excess_review_id' => $created->json('id'),
        ])->assertForbidden();
        $this->actingAs($this->admin)->getJson('/api/excess-delivery-reviews?view=active')->assertForbidden();
        $this->actingAs($this->manager)->getJson('/api/excess-delivery-reviews?view=active&search='.$created->json('reference'))
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.total', 1)
            ->assertJsonMissingPath('data.0.review_notes')
            ->assertJsonMissingPath('data.0.supplier_confirmation_reference')
            ->assertJsonMissingPath('data.0.evidence_url');
    }

    public function test_chargeable_excess_stays_on_manual_financial_hold_and_rejection_requires_reason(): void
    {
        $reviewId = $this->actingAs($this->manager)->post('/api/receivings/excess-reviews', $this->payload(), ['Accept' => 'application/json'])->json('id');
        $this->actingAs($this->admin)->post("/api/admin/excess-delivery-reviews/{$reviewId}", ['action' => 'APPROVE', 'cost_resolution' => ExcessDeliveryReview::COST_CHARGEABLE, 'supplier_confirmation_reference' => 'INVOICE-1', 'supplier_evidence' => UploadedFile::fake()->createWithContent('invoice.pdf', "%PDF-1.4\n%%EOF\n")], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('status', ExcessDeliveryReview::STATUS_FINANCIAL_HOLD)->assertJsonPath('financial_reconciliation_status', 'MANUAL_RECONCILIATION_REQUIRED');
        $this->assertDatabaseHas('receivings', ['purchase_order_id' => $this->order->id, 'status' => 'Pending QA']);
        $this->assertDatabaseCount('inventories', 0);
        $heldReceivingId = ExcessDeliveryReview::findOrFail($reviewId)->receiving_id;
        $this->actingAs($this->manager)->patchJson("/api/receivings/{$heldReceivingId}/assign-qa", [
            'qa_user_id' => $this->qaSupervisor->id,
            'operation' => 'assign_excess',
            'excess_review_id' => $reviewId,
        ])->assertUnprocessable();
        $this->actingAs($this->manager)->postJson("/api/stock-in/receivings/{$heldReceivingId}/stock-in")->assertUnprocessable();
        $this->assertDatabaseCount('inventories', 0);

        $this->actingAs($this->admin)->postJson("/api/admin/excess-delivery-reviews/{$reviewId}", [
            'action' => 'FINANCIAL_HOLD',
        ])->assertUnprocessable()->assertJsonValidationErrors('financial_review_reason');
        $this->actingAs($this->admin)->postJson("/api/admin/excess-delivery-reviews/{$reviewId}", [
            'action' => 'FINANCIAL_HOLD',
            'financial_review_reason' => 'UNSUPPORTED_REASON',
        ])->assertUnprocessable()->assertJsonValidationErrors('financial_review_reason');
        $this->actingAs($this->admin)->postJson("/api/admin/excess-delivery-reviews/{$reviewId}", [
            'action' => 'FINANCIAL_HOLD',
            'financial_review_reason' => 'INVOICE_ADJUSTMENT_REQUIRED',
        ])->assertOk()
            ->assertJsonPath('financial_review_reason', 'INVOICE_ADJUSTMENT_REQUIRED')
            ->assertJsonPath('financial_handoff.supported', false)
            ->assertJsonPath('financial_handoff.transport_status', 'NOT_SUBMITTED');
        $this->assertDatabaseHas('excess_delivery_reviews', [
            'id' => $reviewId,
            'status' => ExcessDeliveryReview::STATUS_FINANCIAL_HOLD,
            'review_notes' => 'INVOICE_ADJUSTMENT_REQUIRED',
        ]);

        $this->actingAs($this->admin)->postJson("/api/admin/excess-delivery-reviews/{$reviewId}", ['action' => 'REJECT'])->assertUnprocessable();
        $this->postJson("/api/admin/excess-delivery-reviews/{$reviewId}", ['action' => 'REJECT', 'rejection_reason' => 'EXCESS_NOT_AUTHORIZED'])->assertOk()->assertJsonPath('status', ExcessDeliveryReview::STATUS_RETURN_REQUIRED);
    }

    public function test_documentation_request_is_assigned_submitted_versioned_and_returned_to_admin_review(): void
    {
        Notification::fake();
        $reviewId = $this->actingAs($this->manager)->post('/api/receivings/excess-reviews', $this->payload(), ['Accept' => 'application/json'])->json('id');

        $this->actingAs($this->admin)->postJson("/api/admin/excess-delivery-reviews/{$reviewId}", [
            'action' => 'REQUEST_DOCUMENTATION',
            'documentation_type' => 'CORRECTED_DELIVERY_RECEIPT',
        ])->assertOk()->assertJsonPath('status', ExcessDeliveryReview::STATUS_DOCUMENTATION_REQUESTED)
            ->assertJsonPath('documentation_assigned_to', $this->manager->name);
        $documentationReceivingId = ExcessDeliveryReview::findOrFail($reviewId)->receiving_id;
        $this->actingAs($this->manager)->patchJson("/api/receivings/{$documentationReceivingId}/assign-qa", [
            'qa_user_id' => $this->qaSupervisor->id,
            'operation' => 'assign_excess',
            'excess_review_id' => $reviewId,
        ])->assertUnprocessable();
        Notification::assertSentTo($this->manager, WorkflowNotification::class);

        $otherManager = $this->user('PLANT_MANAGER');
        $this->actingAs($otherManager)->post("/api/excess-delivery-reviews/{$reviewId}/documentation", [
            'document' => UploadedFile::fake()->createWithContent('other.pdf', "%PDF-1.4\n%%EOF\n"),
        ], ['Accept' => 'application/json'])->assertForbidden();

        $this->actingAs($this->manager)->post("/api/excess-delivery-reviews/{$reviewId}/documentation", [
            'external_reference' => 'SUP-DR-22',
            'document' => UploadedFile::fake()->createWithContent('corrected.pdf', "%PDF-1.4\n%%EOF\n"),
        ], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('status', ExcessDeliveryReview::STATUS_DOCUMENTATION_SUBMITTED)
            ->assertJsonPath('documents.0.external_reference', 'SUP-DR-22');
        $this->assertDatabaseCount('excess_delivery_documents', 1);
        Notification::assertSentTo($this->admin, WorkflowNotification::class);

        $this->actingAs($this->admin)->postJson("/api/admin/excess-delivery-reviews/{$reviewId}", [
            'action' => 'REQUEST_DOCUMENTATION',
            'documentation_type' => 'SUPPLIER_RETURN_AUTHORIZATION',
        ])->assertOk();
        $this->actingAs($this->manager)->post("/api/excess-delivery-reviews/{$reviewId}/documentation", [
            'document' => UploadedFile::fake()->createWithContent('authorization.pdf', "%PDF-1.4\n%%EOF\nsecond"),
        ], ['Accept' => 'application/json'])->assertOk()->assertJsonCount(2, 'documents');
        $this->assertDatabaseCount('excess_delivery_documents', 2);
    }

    public function test_rejected_excess_returns_separately_while_authorized_quantity_completes_qa_and_stock_in(): void
    {
        $created = $this->actingAs($this->manager)->post('/api/receivings/excess-reviews', $this->payload(), ['Accept' => 'application/json'])->assertCreated();
        $reviewId = $created->json('id');
        $receivingId = $created->json('receiving_id');

        $rejected = $this->actingAs($this->admin)->postJson("/api/admin/excess-delivery-reviews/{$reviewId}", [
            'action' => 'REJECT', 'rejection_reason' => 'EXCESS_NOT_AUTHORIZED',
        ])->assertOk()->assertJsonPath('status', ExcessDeliveryReview::STATUS_RETURN_REQUIRED);
        $reviewItemId = $rejected->json('items.0.id');
        $this->actingAs($this->manager)->patchJson("/api/receivings/{$receivingId}/assign-qa", [
            'qa_user_id' => $this->qaSupervisor->id,
            'operation' => 'assign_excess',
            'excess_review_id' => $reviewId,
        ])->assertUnprocessable();
        $this->assertDatabaseHas('receiving_items', ['receiving_id' => $receivingId, 'delivered_quantity' => 10, 'inspection_status' => 'Pending QA']);
        $this->assertDatabaseHas('receiving_items', ['receiving_id' => $receivingId, 'delivered_quantity' => 1, 'inspection_status' => 'On Hold']);

        $this->actingAs($this->manager)->post("/api/excess-delivery-reviews/{$reviewId}/return/complete", [
            'return_date' => '2026-11-01',
            'items' => [['review_item_id' => $reviewItemId, 'returned_quantity' => 1]],
            'document' => UploadedFile::fake()->createWithContent('premature.pdf', "%PDF-1.4\n%%EOF\npremature"),
        ], ['Accept' => 'application/json'])->assertUnprocessable();

        $authorizedItem = ReceivingItem::query()->where('receiving_id', $receivingId)->where('inspection_status', 'Pending QA')->sole();
        $this->actingAs($this->manager)->patchJson("/api/receivings/{$receivingId}/assign-qa", ['qa_user_id' => $this->qaSupervisor->id])->assertOk();
        $this->actingAs($this->qaSupervisor)->post("/api/qa/inspections/{$receivingId}", [
            'items' => [[
                'receiving_item_id' => $authorizedItem->id, 'accepted_quantity' => 10,
                'rejected_quantity' => 0, 'inspection_result' => 'Passed', 'remarks' => 'Authorized quantity accepted.',
            ]],
        ], ['Accept' => 'application/json'])->assertOk()->assertJsonCount(1, 'products');
        $this->actingAs($this->manager)->postJson("/api/stock-in/receivings/{$receivingId}/stock-in")->assertOk();
        $this->assertSame(10, Inventory::query()->sum('available_stock'));

        $this->postJson("/api/excess-delivery-reviews/{$reviewId}/return/prepare")->assertOk()
            ->assertJsonPath('status', ExcessDeliveryReview::STATUS_RETURN_IN_PROGRESS);
        $this->post("/api/excess-delivery-reviews/{$reviewId}/return/complete", [
            'return_date' => '2026-11-01',
            'items' => [['review_item_id' => $reviewItemId, 'returned_quantity' => 2]],
            'document' => UploadedFile::fake()->createWithContent('return.pdf', "%PDF-1.4\n%%EOF\n"),
        ], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->post("/api/excess-delivery-reviews/{$reviewId}/return/complete", [
            'return_date' => '2026-11-01',
            'items' => [['review_item_id' => $reviewItemId, 'returned_quantity' => 1]],
            'external_reference' => 'SUP-RETURN-1',
            'document' => UploadedFile::fake()->createWithContent('return.pdf', "%PDF-1.4\n%%EOF\nvalid"),
        ], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('status', ExcessDeliveryReview::STATUS_RETURNED)
            ->assertJsonPath('items.0.returned_quantity', 1);
        $this->assertSame(10, Inventory::query()->sum('available_stock'));
        $this->assertDatabaseHas('receiving_items', ['receiving_id' => $receivingId, 'delivered_quantity' => 1, 'inspection_status' => 'Returned to Supplier']);
        $this->post("/api/excess-delivery-reviews/{$reviewId}/return/complete", [
            'return_date' => '2026-11-01',
            'items' => [['review_item_id' => $reviewItemId, 'returned_quantity' => 1]],
            'document' => UploadedFile::fake()->createWithContent('duplicate.pdf', "%PDF-1.4\n%%EOF\nduplicate"),
        ], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->assertSame(10, Inventory::query()->sum('available_stock'));
    }

    public function test_a_different_authorized_supervisor_can_receive_the_new_excess_cycle_directly(): void
    {
        $created = $this->actingAs($this->manager)
            ->post('/api/receivings/excess-reviews', $this->payload(), ['Accept' => 'application/json'])
            ->assertCreated();
        $receivingId = $created->json('receiving_id');
        $reviewId = $created->json('id');
        $authorizedItem = ReceivingItem::query()->where('receiving_id', $receivingId)->where('delivered_quantity', 10)->sole();
        $excessItem = ReceivingItem::query()->where('receiving_id', $receivingId)->where('delivered_quantity', 1)->sole();

        $this->actingAs($this->manager)->patchJson("/api/receivings/{$receivingId}/assign-qa", [
            'qa_user_id' => $this->qaSupervisor->id,
        ])->assertOk();
        $this->actingAs($this->qaSupervisor)->postJson("/api/qa/inspections/{$receivingId}", ['items' => [[
            'receiving_item_id' => $authorizedItem->id,
            'accepted_quantity' => 10,
            'rejected_quantity' => 0,
            'inspection_result' => 'Passed',
        ]]])->assertOk();

        $this->actingAs($this->admin)->post("/api/admin/excess-delivery-reviews/{$reviewId}", [
            'action' => 'APPROVE',
            'cost_resolution' => ExcessDeliveryReview::COST_FREE,
            'supplier_confirmation_reference' => 'EMAIL-DIFFERENT-QA',
            'supplier_evidence' => UploadedFile::fake()->createWithContent('supplier.pdf', "%PDF-1.4\n%%EOF\n"),
        ], ['Accept' => 'application/json'])->assertOk();

        $differentQa = $this->user('QA_SUPERVISOR');
        $this->actingAs($this->manager)->patchJson("/api/receivings/{$receivingId}/assign-qa", [
            'qa_user_id' => $differentQa->id,
            'operation' => 'assign_excess',
            'excess_review_id' => $reviewId,
        ])->assertOk()
            ->assertJsonPath('qa_assignment.outcome', 'excess_cycle_created')
            ->assertJsonPath('qa_assignment.cycle_number', 2);

        $this->assertDatabaseHas('qa_inspections', [
            'receiving_id' => $receivingId,
            'cycle_number' => 1,
            'inspected_by_id' => $this->qaSupervisor->id,
            'status' => 'Passed',
        ]);
        $this->assertDatabaseHas('qa_inspections', [
            'receiving_id' => $receivingId,
            'cycle_number' => 2,
            'inspected_by_id' => $differentQa->id,
            'status' => 'Pending',
        ]);
        $this->actingAs($differentQa)->getJson("/api/qa/inspections/{$receivingId}")
            ->assertOk()
            ->assertJsonCount(1, 'products')
            ->assertJsonPath('products.0.receiving_item_id', $excessItem->id)
            ->assertJsonPath('quantity_context.current_inspection', 1);
    }
}
