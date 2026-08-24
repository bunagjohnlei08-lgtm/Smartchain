<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\QaInspection;
use App\Models\QaInspectionItem;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QaQualityReportTest extends TestCase
{
    use RefreshDatabase;

    private function completedInspection(User $qa, string $number, string $supplier, string $status, int $accepted, int $rejected, string $completedAt): void
    {
        $product = Product::firstOrCreate(['name' => 'Report Product'], ['unit' => 'pcs', 'cost_price' => 100]);
        $receiving = Receiving::create(['receiving_no' => $number, 'purchase_order' => 'PO-1', 'supplier' => $supplier, 'delivery_date' => now()->toDateString(), 'status' => $status]);
        $receivingItem = ReceivingItem::create(['receiving_id' => $receiving->id, 'product_id' => $product->id, 'product_name' => $product->name, 'delivered_quantity' => $accepted + $rejected, 'unit' => 'pcs', 'inspection_status' => $status]);
        $inspection = QaInspection::create(['receiving_id' => $receiving->id, 'status' => $status, 'started_at' => now()->subHour(), 'completed_at' => $completedAt, 'inspected_by_id' => $qa->id, 'submitted_by_id' => $qa->id]);
        QaInspectionItem::create(['qa_inspection_id' => $inspection->id, 'receiving_item_id' => $receivingItem->id, 'accepted_quantity' => $accepted, 'rejected_quantity' => $rejected, 'inspection_result' => $status]);
    }

    public function test_report_aggregates_completed_inspection_data(): void
    {
        $role = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $qa = User::factory()->create(['role_id' => $role->id]);
        $this->completedInspection($qa, 'RCV-PASS', 'Supplier A', 'Passed', 10, 0, '2026-08-23 10:00:00');
        $this->completedInspection($qa, 'RCV-PARTIAL', 'Supplier A', 'Partial', 3, 2, '2026-08-24 10:00:00');
        $this->completedInspection($qa, 'RCV-REJECT', 'Supplier B', 'Rejected', 0, 5, '2026-08-24 11:00:00');

        $response = $this->actingAs($qa)->getJson('/api/qa/quality-reports');

        $response->assertOk()
            ->assertJsonPath('data.summary.completed_inspections', 3)
            ->assertJsonPath('data.summary.passed_count', 1)
            ->assertJsonPath('data.summary.passed_rate', 50)
            ->assertJsonPath('data.summary.rejected_count', 1)
            ->assertJsonPath('data.summary.rejected_rate', 50)
            ->assertJsonPath('data.summary.rejected_quantity', 7)
            ->assertJsonCount(2, 'data.distribution')
            ->assertJsonPath('data.top_rejected_products.0.product', 'Report Product')
            ->assertJsonPath('data.top_rejected_products.0.quantity', 7)
            ->assertJsonPath('data.supplier_quality.0.name', 'Supplier A')
            ->assertJsonPath('data.supplier_quality.0.pass_rate', 86.7);
    }
}
