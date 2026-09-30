<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\QaInspection;
use App\Models\QaInspectionItem;
use App\Models\Receiving;
use App\Models\ReceivingDiscrepancy;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\SupplierRejectionCase;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReceivingQueueTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $manager;
    private Product $product;
    private int $sequence = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->user('ADMIN');
        $this->manager = $this->user('PLANT_MANAGER');
        $this->product = Product::create(['name' => 'Queue Product', 'unit' => 'pcs', 'cost_price' => 10]);
    }

    private function user(string $slug): User
    {
        $role = Role::firstOrCreate(['slug' => $slug], ['name' => str_replace('_', ' ', $slug)]);

        return User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
    }

    private function receiving(int $accepted = 0, int $rejected = 0, bool $qaComplete = false, bool $stocked = false): array
    {
        $this->sequence++;
        $delivered = max(1, $accepted + $rejected);
        $status = ! $qaComplete ? 'Pending QA' : ($rejected === 0 ? 'Passed' : ($accepted > 0 ? 'Partial' : 'Rejected'));
        $receiving = Receiving::create([
            'receiving_no' => sprintf('RCV-Q-%05d', $this->sequence),
            'purchase_order' => 'PO-QUEUE',
            'supplier' => 'Queue Supplier',
            'delivery_date' => now()->toDateString(),
            'status' => $status,
            'prepared_by_id' => $this->manager->id,
        ]);
        $item = ReceivingItem::create([
            'receiving_id' => $receiving->id,
            'product_id' => $this->product->id,
            'product_name' => $this->product->name,
            'ordered_quantity' => $delivered,
            'delivered_quantity' => $delivered,
            'unit' => 'pcs',
            'inspection_status' => $status,
            'stocked_in_at' => $stocked ? now() : null,
        ]);
        $inspection = QaInspection::create([
            'receiving_id' => $receiving->id,
            'status' => $status,
            'started_at' => now(),
            'completed_at' => $qaComplete ? now() : null,
        ]);
        $inspectionItem = QaInspectionItem::create([
            'qa_inspection_id' => $inspection->id,
            'receiving_item_id' => $item->id,
            'accepted_quantity' => $accepted,
            'rejected_quantity' => $rejected,
            'inspection_result' => $status,
        ]);

        return [$receiving, $inspectionItem];
    }

    private function purchaseOrder(string $number, string $status): PurchaseOrder
    {
        return PurchaseOrder::create([
            'po_number' => $number,
            'supplier_name' => 'Queue Supplier',
            'delivery_details' => 'Warehouse',
            'expected_delivery_date' => now(),
            'total_amount' => 100,
            'status' => $status,
            'approved_by' => $this->admin->id,
        ]);
    }

    private function ids(string $view): array
    {
        return collect($this->actingAs($this->manager)->getJson("/api/receivings?view={$view}&per_page=100")
            ->assertOk()->json('data'))->pluck('id')->all();
    }

    public function test_pending_qa_and_accepted_not_stocked_in_are_active(): void
    {
        [$pending] = $this->receiving();
        [$passed] = $this->receiving(10, 0, true, false);

        $this->assertEqualsCanonicalizing([$pending->id, $passed->id], $this->ids('active'));
        $this->assertSame([], $this->ids('history'));
    }

    public function test_finalized_fully_stocked_receiving_is_history(): void
    {
        [$receiving] = $this->receiving(10, 0, true, true);

        $this->assertNotContains($receiving->id, $this->ids('active'));
        $this->assertContains($receiving->id, $this->ids('history'));
    }

    public function test_open_short_delivery_is_active_and_closed_shortage_is_history(): void
    {
        $order = $this->purchaseOrder('PO-SHORT', 'Partially Received');
        $statuses = [
            ReceivingDiscrepancy::STATUS_REPORTED,
            ReceivingDiscrepancy::STATUS_CONTACTED,
            ReceivingDiscrepancy::STATUS_AWAITING_RESPONSE,
            ReceivingDiscrepancy::STATUS_UNDER_RESOLUTION,
            ReceivingDiscrepancy::STATUS_AWAITING_BALANCE,
            ReceivingDiscrepancy::STATUS_CLOSED_SHORTAGE,
            ReceivingDiscrepancy::STATUS_RESOLVED,
        ];
        $receivings = collect($statuses)->map(function (string $status) use ($order) {
            [$receiving] = $this->receiving(5, 0, true, true);
            $receiving->update(['purchase_order_id' => $order->id]);
            ReceivingDiscrepancy::create([
                'purchase_order_id' => $order->id, 'receiving_id' => $receiving->id,
                'discrepancy_type' => ReceivingDiscrepancy::TYPE_SHORT_DELIVERY,
                'expected_quantity' => 10, 'delivered_quantity' => 5, 'short_quantity' => 5,
                'status' => $status, 'reported_at' => now(),
            ]);

            return $receiving;
        })->values();

        $activeIds = $this->ids('active');
        $historyIds = $this->ids('history');
        foreach ($receivings->take(5) as $receiving) {
            $this->assertContains($receiving->id, $activeIds);
            $this->assertNotContains($receiving->id, $historyIds);
        }
        foreach ($receivings->slice(5) as $receiving) {
            $this->assertNotContains($receiving->id, $activeIds);
            $this->assertContains($receiving->id, $historyIds);
        }
    }

    public function test_rejection_stays_active_until_its_case_is_resolved(): void
    {
        [$open, $openItem] = $this->receiving(0, 5, true, false);
        [$closed, $closedItem] = $this->receiving(0, 5, true, false);
        SupplierRejectionCase::create(['qa_inspection_item_id' => $openItem->id, 'status' => 'REPLACEMENT_PENDING']);
        SupplierRejectionCase::create(['qa_inspection_item_id' => $closedItem->id, 'status' => 'RESOLVED', 'resolved_at' => now()]);

        $this->assertContains($open->id, $this->ids('active'));
        $this->assertContains($closed->id, $this->ids('history'));
    }

    public function test_fully_resolved_replacement_is_classified_independently_as_history(): void
    {
        [, $originalItem] = $this->receiving(0, 5, true, false);
        $case = SupplierRejectionCase::create(['qa_inspection_item_id' => $originalItem->id, 'status' => 'RESOLVED', 'resolved_at' => now()]);
        [$replacement] = $this->receiving(5, 0, true, true);
        $replacement->update(['replacement_for_rejection_case_id' => $case->id]);

        $this->assertContains($replacement->id, $this->ids('history'));
    }

    public function test_multiple_receivings_are_classified_independently_and_totals_are_view_scoped(): void
    {
        $activeIds = collect(range(1, 6))->map(fn () => $this->receiving()[0]->id)->all();
        $historyIds = collect(range(1, 2))->map(fn () => $this->receiving(5, 0, true, true)[0]->id)->all();
        $order = $this->purchaseOrder('PO-MULTI', 'Completed');
        Receiving::query()->whereIn('id', [$activeIds[0], $historyIds[0]])->update(['purchase_order_id' => $order->id]);

        $active = $this->actingAs($this->manager)->getJson('/api/receivings?view=active&per_page=5')->assertOk();
        $active->assertJsonPath('meta.total', 6)->assertJsonCount(5, 'data');
        $history = $this->getJson('/api/receivings?view=history&per_page=5')->assertOk();
        $history->assertJsonPath('meta.total', 2)->assertJsonCount(2, 'data');
        $this->assertEmpty(array_intersect($activeIds, $historyIds));
    }

    public function test_non_plant_manager_cannot_retrieve_either_queue(): void
    {
        $qa = $this->user('QA_SUPERVISOR');

        $this->actingAs($qa)->getJson('/api/receivings?view=active')->assertForbidden();
        $this->actingAs($qa)->getJson('/api/receivings?view=history')->assertForbidden();
    }

    public function test_receiving_reports_still_include_history_records(): void
    {
        [$history, $originalInspectionItem] = $this->receiving(5, 0, true, true);
        $purchaseOrder = $this->purchaseOrder('PO-REPORT', 'Closed with Shortage');
        $history->update(['purchase_order_id' => $purchaseOrder->id]);
        $history->items()->update(['ordered_quantity' => 10]);
        ReceivingDiscrepancy::create([
            'purchase_order_id' => $purchaseOrder->id,
            'receiving_id' => $history->id,
            'discrepancy_type' => ReceivingDiscrepancy::TYPE_SHORT_DELIVERY,
            'expected_quantity' => 10,
            'delivered_quantity' => 5,
            'short_quantity' => 5,
            'status' => ReceivingDiscrepancy::STATUS_CLOSED_SHORTAGE,
            'reported_at' => now(),
        ]);
        $case = SupplierRejectionCase::create([
            'qa_inspection_item_id' => $originalInspectionItem->id,
            'status' => 'RESOLVED',
            'resolved_at' => now(),
        ]);
        [$replacement] = $this->receiving(5, 0, true, true);
        $replacement->update(['replacement_for_rejection_case_id' => $case->id]);

        $rows = collect($this->actingAs($this->manager)
            ->getJson('/api/plant-manager/reports/generate?type=receiving&format=preview')
            ->assertOk()->json('report.rows'))->keyBy('receiving_no');

        $this->assertSame(5, $rows[$history->receiving_no]['delivered_quantity']);
        $this->assertSame(5, $rows[$history->receiving_no]['accepted_quantity']);
        $this->assertSame(0, $rows[$history->receiving_no]['rejected_quantity']);
        $this->assertSame(5, $rows[$history->receiving_no]['short_quantity']);
        $this->assertSame(ReceivingDiscrepancy::STATUS_CLOSED_SHORTAGE, $rows[$history->receiving_no]['discrepancy_status']);
        $this->assertSame('Original', $rows[$history->receiving_no]['receiving_type']);
        $this->assertSame('Replacement', $rows[$replacement->receiving_no]['receiving_type']);
        $this->assertSame($history->receiving_no, $rows[$replacement->receiving_no]['replaces_receiving']);
        $this->assertCount(2, $rows);
    }
}
