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

class QaInspectionHistoryTest extends TestCase
{
    use RefreshDatabase;

    private function qaUser(): User
    {
        $role = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);

        return User::factory()->create(['role_id' => $role->id]);
    }

    private function inspection(User $qa, string $receivingNo, string $status, ?string $completedAt): QaInspection
    {
        $product = Product::create([
            'name' => "Product {$receivingNo}",
            'unit' => 'pcs',
            'cost_price' => 100,
        ]);
        $receiving = Receiving::create([
            'receiving_no' => $receivingNo,
            'purchase_order' => 'PO-1',
            'supplier' => 'Test Supplier',
            'delivery_date' => now()->toDateString(),
            'status' => $status,
        ]);
        $receivingItem = ReceivingItem::create([
            'receiving_id' => $receiving->id,
            'product_id' => $product->id,
            'product_name' => $product->name,
            'delivered_quantity' => 5,
            'unit' => 'pcs',
            'inspection_status' => $status,
        ]);
        $inspection = QaInspection::create([
            'receiving_id' => $receiving->id,
            'status' => $status,
            'started_at' => now()->subHour(),
            'completed_at' => $completedAt,
            'inspected_by_id' => $qa->id,
            'submitted_by_id' => $completedAt ? $qa->id : null,
        ]);
        QaInspectionItem::create([
            'qa_inspection_id' => $inspection->id,
            'receiving_item_id' => $receivingItem->id,
            'accepted_quantity' => $status === 'Partial' ? 3 : 5,
            'rejected_quantity' => $status === 'Partial' ? 2 : 0,
            'inspection_result' => $status === 'In Progress' ? 'Pending' : $status,
            'remarks' => 'Existing QA remarks.',
        ]);

        return $inspection;
    }

    public function test_history_returns_only_completed_inspections_newest_first(): void
    {
        $qa = $this->qaUser();
        $this->inspection($qa, 'RCV-OLD', 'Passed', now()->subDay()->toDateTimeString());
        $this->inspection($qa, 'RCV-NEW', 'Partial', now()->toDateTimeString());
        $this->inspection($qa, 'RCV-DRAFT', 'In Progress', null);

        $response = $this->actingAs($qa)->getJson('/api/qa/inspection-history');

        $response->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.receiving_no', 'RCV-NEW')
            ->assertJsonPath('data.0.inspection_result', 'Partial')
            ->assertJsonPath('data.0.accepted_qty', 3)
            ->assertJsonPath('data.0.rejected_qty', 2)
            ->assertJsonPath('data.0.remarks', 'Existing QA remarks.')
            ->assertJsonPath('data.1.receiving_no', 'RCV-OLD');
    }

    public function test_non_qa_user_cannot_read_inspection_history(): void
    {
        $this->actingAs(User::factory()->create())
            ->getJson('/api/qa/inspection-history')
            ->assertForbidden();
    }
}
