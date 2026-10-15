<?php
namespace Tests\Feature;

use App\Models\Product;
use App\Models\ReceivingItem;
use App\Models\ReplenishmentRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Schema;
use Tests\Support\ProductionFixture;

class SharedClassifiedSupplyTest extends ProductionFixture
{
    public function test_raw_and_production_capable_finished_products_share_the_supplier_lifecycle(): void
    {
        $raw = $this->product(Product::RAW_MATERIAL, 'L');
        $finished = $this->product(Product::FINISHED_PRODUCT, 'KG');
        $this->bom($finished, [['product_id' => $raw->id, 'required_quantity' => '1']]);
        foreach ([$raw, $finished] as $product) {
            $requestId = $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests', [
                'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'requested_qty' => 6, 'status' => 'draft',
            ])->assertCreated()->json('id');
            $this->postJson("/api/plant-manager/procurement/requests/{$requestId}/submit")->assertOk();
            $this->actingAs($this->admin)->postJson("/api/admin/procurement/requests/{$requestId}/approve")->assertOk();
            $this->getJson("/api/admin/procurement/requests/{$requestId}")->assertOk()
                ->assertJsonPath('unit', $product->unit)->assertJsonPath('item_classification', $product->item_classification);
            $this->assertDatabaseHas('replenishment_requests', ['id' => $requestId, 'status' => 'for_purchase_order']);
            $po = $this->postJson('/api/purchase-orders', [
                'supplier_id' => $this->supplier->id, 'delivery_details' => 'Isolated fixture warehouse',
                'expected_delivery_date' => now()->toDateString(), 'replenishment_request_id' => $requestId,
                'items' => [['product_name' => $product->name, 'ordered_quantity' => 6, 'unit_price' => 1]],
            ])->assertCreated()->json();
            $this->assertDatabaseHas('purchase_order_items', ['purchase_order_id' => $po['id'], 'product_id' => $product->id,
                'unit' => $product->unit, 'item_classification' => $product->item_classification]);
            $receiving = $this->actingAs($this->manager)->post('/api/receivings', [
                'purchase_order_id' => $po['id'], 'delivery_date' => now()->toDateString(),
                'items' => [['purchase_order_item_id' => $po['items'][0]['id'], 'delivered_quantity' => 6]],
                'receipts' => [UploadedFile::fake()->createWithContent('receipt.pdf', "%PDF-1.4\n".uniqid())],
            ], ['Accept' => 'application/json'])->assertCreated()->json();
            $this->assertDatabaseHas('replenishment_requests', ['id' => $requestId, 'status' => ReplenishmentRequest::STATUS_COMPLETED]);
            $this->assertSame(0, $product->inventories()->first()->available_stock);
            $this->patchJson("/api/receivings/{$receiving['id']}/assign-qa", ['qa_user_id' => $this->qa->id])->assertOk();
            $item = ReceivingItem::where('receiving_id', $receiving['id'])->firstOrFail();
            $this->assertSame($product->unit, $item->unit);
            $this->actingAs($this->qa)->postJson("/api/qa/inspections/{$receiving['id']}", ['items' => [[
                'receiving_item_id' => $item->id, 'accepted_quantity' => 6, 'rejected_quantity' => 0,
                'inspection_result' => 'Passed', 'remarks' => 'Manual supplier QA fixture',
            ]]])->assertSuccessful();
            $this->assertSame(0, $product->inventories()->first()->available_stock);
            $this->actingAs($this->manager)->postJson("/api/stock-in/receivings/{$receiving['id']}/stock-in")->assertOk();
            $this->assertSame(6, $product->inventories()->first()->available_stock);
        }
        $this->assertDatabaseCount('production_batches', 0);
        $this->assertFalse(Schema::hasColumn('products', 'supply_method'));
        $this->assertNotContains('for_production', ReplenishmentRequest::STATUSES);
    }
}
