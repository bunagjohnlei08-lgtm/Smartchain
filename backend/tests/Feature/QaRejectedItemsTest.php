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

class QaRejectedItemsTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_returns_only_rejected_quantities_from_completed_inspections(): void
    {
        $role = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $qa = User::factory()->create(['role_id' => $role->id]);
        $product = Product::create(['name' => 'Inspected Product', 'unit' => 'pcs', 'cost_price' => 100]);
        $receiving = Receiving::create([
            'receiving_no' => 'RCV-REJECTED',
            'purchase_order' => 'PO-1',
            'supplier' => 'Existing Supplier',
            'delivery_date' => now()->toDateString(),
            'status' => 'Partial',
        ]);
        $receivingItem = ReceivingItem::create([
            'receiving_id' => $receiving->id,
            'product_id' => $product->id,
            'product_name' => $product->name,
            'delivered_quantity' => 5,
            'unit' => 'pcs',
            'inspection_status' => 'Partial',
        ]);
        $inspection = QaInspection::create([
            'receiving_id' => $receiving->id,
            'status' => 'Partial',
            'started_at' => now()->subHour(),
            'completed_at' => now(),
            'inspected_by_id' => $qa->id,
            'submitted_by_id' => $qa->id,
        ]);
        QaInspectionItem::create([
            'qa_inspection_id' => $inspection->id,
            'receiving_item_id' => $receivingItem->id,
            'accepted_quantity' => 3,
            'rejected_quantity' => 2,
            'inspection_result' => 'Partial',
            'remarks' => 'Two units failed inspection.',
        ]);

        $response = $this->actingAs($qa)->getJson('/api/qa/rejected-items');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.receiving_no', 'RCV-REJECTED')
            ->assertJsonPath('data.0.supplier', 'Existing Supplier')
            ->assertJsonPath('data.0.product', 'Inspected Product')
            ->assertJsonPath('data.0.rejected_qty', 2)
            ->assertJsonPath('data.0.reason', 'Two units failed inspection.')
            ->assertJsonMissingPath('data.0.barcode');
    }

    public function test_non_qa_user_cannot_read_rejected_items(): void
    {
        $this->actingAs(User::factory()->create())
            ->getJson('/api/qa/rejected-items')
            ->assertForbidden();
    }
}
