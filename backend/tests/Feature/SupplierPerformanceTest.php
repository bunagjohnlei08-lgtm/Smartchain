<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\QaInspection;
use App\Models\Receiving;
use App\Models\ReceivingDiscrepancy;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierRejectionCase;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SupplierPerformanceTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();
        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
        $this->supplier = Supplier::create(['supplier_code' => 'SUP-PERF', 'name' => 'Performance Supply', 'status' => 'ACTIVE']);
    }

    public function test_metrics_use_only_eligible_operational_records_and_configured_scoring(): void
    {
        config([
            'supplier_performance.minimum_eligible_deliveries' => 2,
            'supplier_performance.weights' => ['on_time_delivery' => 25, 'fulfillment' => 25, 'qa_acceptance' => 25, 'discrepancy_free' => 25],
            'supplier_performance.recognition_tiers' => [['label' => 'Preferred', 'min_score' => 70]],
        ]);
        $product = Product::create(['name' => 'PERFORMANCE ITEM', 'unit' => 'pcs', 'cost_price' => 10]);
        $po = PurchaseOrder::create(['po_number' => 'PO-PERF-1', 'supplier_id' => $this->supplier->id, 'supplier_name' => $this->supplier->name, 'delivery_details' => 'Warehouse', 'expected_delivery_date' => '2026-09-10', 'total_amount' => 100, 'status' => PurchaseOrder::STATUS_COMPLETED, 'approved_by' => $this->admin->id]);
        $poItem = $po->items()->create(['product_name' => $product->name, 'ordered_quantity' => 10, 'unit_price' => 10, 'total_price' => 100]);

        $first = $this->receiving($po, $poItem->id, $product->id, 'RCV-PERF-1', '2026-09-09', 8);
        $second = $this->receiving($po, $poItem->id, $product->id, 'RCV-PERF-2', '2026-09-12', 2);
        $firstQaItem = $this->qa($first, 7, 1);
        $this->qa($second, 2, 0);
        $rejectionCase = SupplierRejectionCase::create(['qa_inspection_item_id' => $firstQaItem->id, 'status' => 'PENDING_REVIEW']);
        $replacement = $this->receiving($po, $poItem->id, $product->id, 'RCV-PERF-REPLACEMENT', '2026-09-08', 5);
        $replacement->update(['replacement_for_rejection_case_id' => $rejectionCase->id]);
        $this->qa($replacement, 5, 0);
        ReceivingDiscrepancy::create(['purchase_order_id' => $po->id, 'receiving_id' => $first->id, 'supplier_id' => $this->supplier->id, 'discrepancy_type' => ReceivingDiscrepancy::TYPE_SHORT_DELIVERY, 'expected_quantity' => 10, 'delivered_quantity' => 8, 'short_quantity' => 2, 'status' => ReceivingDiscrepancy::STATUS_REPORTED, 'reported_by_id' => $this->admin->id, 'reported_at' => now()]);

        $response = $this->actingAs($this->admin)->getJson('/api/admin/supplier-performance')->assertOk();
        $row = collect($response->json('data'))->firstWhere('supplier.id', $this->supplier->id);

        $this->assertSame(50.0, (float) $row['metrics']['on_time_delivery']);
        $this->assertSame(100.0, (float) $row['metrics']['fulfillment']);
        $this->assertSame(90.0, (float) $row['metrics']['qa_acceptance']);
        $this->assertSame(50.0, (float) $row['metrics']['discrepancy_rate']);
        $this->assertSame(72.5, (float) $row['overall_score']);
        $this->assertSame('Preferred', $row['recognition']);
        $this->assertTrue($row['is_top_supplier']);
        $this->assertSame(2, $row['counts']['open_supplier_issues']);
    }

    public function test_no_history_returns_null_metrics_and_no_misleading_score(): void
    {
        config(['supplier_performance.minimum_eligible_deliveries' => 3, 'supplier_performance.weights' => ['on_time_delivery' => 25, 'fulfillment' => 25, 'qa_acceptance' => 25, 'discrepancy_free' => 25]]);

        $response = $this->actingAs($this->admin)->getJson('/api/admin/supplier-performance')->assertOk();
        $row = $response->json('data.0');
        $this->assertNull($row['metrics']['on_time_delivery']);
        $this->assertNull($row['overall_score']);
        $this->assertSame('INSUFFICIENT_DATA', $row['eligibility_status']);
        $this->assertFalse($row['is_top_supplier']);
    }

    public function test_unconfigured_rules_show_metrics_but_not_score_or_recognition(): void
    {
        config(['supplier_performance.minimum_eligible_deliveries' => null, 'supplier_performance.weights' => ['on_time_delivery' => null, 'fulfillment' => null, 'qa_acceptance' => null, 'discrepancy_free' => null], 'supplier_performance.recognition_tiers' => []]);
        $response = $this->actingAs($this->admin)->getJson('/api/admin/supplier-performance')->assertOk();
        $response->assertJsonPath('data.0.eligibility_status', 'SCORING_NOT_CONFIGURED')
            ->assertJsonPath('data.0.overall_score', null)
            ->assertJsonPath('data.0.recognition', null)
            ->assertJsonPath('data.0.scoring_message', 'Performance scoring rules not yet configured. Individual operational metrics remain available.');
    }

    public function test_non_admin_and_guest_cannot_access_performance(): void
    {
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $manager = User::factory()->create(['role_id' => $managerRole->id, 'status' => 'ACTIVE']);
        $this->getJson('/api/admin/supplier-performance')->assertUnauthorized();
        $this->actingAs($manager)->getJson('/api/admin/supplier-performance')->assertForbidden();
    }

    private function receiving(PurchaseOrder $po, int $poItemId, int $productId, string $number, string $date, int $quantity): Receiving
    {
        $receiving = Receiving::create(['receiving_no' => $number, 'purchase_order_id' => $po->id, 'purchase_order' => $po->po_number, 'supplier' => $po->supplier_name, 'delivery_date' => $date, 'status' => 'Completed', 'prepared_by_id' => $this->admin->id]);
        $receiving->items()->create(['purchase_order_item_id' => $poItemId, 'product_id' => $productId, 'product_name' => 'PERFORMANCE ITEM', 'ordered_quantity' => 10, 'delivered_quantity' => $quantity, 'unit' => 'pcs', 'inspection_status' => 'Accepted']);

        return $receiving;
    }

    private function qa(Receiving $receiving, int $accepted, int $rejected)
    {
        $inspection = QaInspection::create(['receiving_id' => $receiving->id, 'status' => 'Completed', 'completed_at' => now(), 'inspected_by_id' => $this->admin->id, 'submitted_by_id' => $this->admin->id]);

        return $inspection->items()->create(['receiving_item_id' => $receiving->items()->firstOrFail()->id, 'accepted_quantity' => $accepted, 'rejected_quantity' => $rejected, 'inspection_result' => $rejected ? 'Partial' : 'Accepted']);
    }
}
