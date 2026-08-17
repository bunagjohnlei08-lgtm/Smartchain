<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockInTest extends TestCase
{
    use RefreshDatabase;

    private function makeReceiving(array $itemStates): Receiving
    {
        $receiving = Receiving::create([
            'receiving_no' => 'RCV-'.uniqid(),
            'purchase_order' => 'PO-1',
            'supplier' => 'Test Supplier',
            'reference_no' => 'REF-1',
            'delivery_date' => now()->toDateString(),
            'status' => 'Passed',
        ]);

        foreach ($itemStates as $state) {
            $product = Product::create([
                'name' => $state['product'],
                'unit' => 'pcs',
                'cost_price' => 100,
            ]);

            ReceivingItem::create([
                'receiving_id' => $receiving->id,
                'product_id' => $product->id,
                'product_name' => $product->name,
                'delivered_quantity' => $state['qty'],
                'unit' => 'pcs',
                'inspection_status' => $state['inspection_status'],
            ]);
        }

        return $receiving;
    }

    public function test_index_returns_200_and_no_received_at_error(): void
    {
        $user = User::factory()->create();
        $this->makeReceiving([
            ['product' => 'Widget A', 'qty' => 10, 'inspection_status' => 'Passed'],
            ['product' => 'Widget B', 'qty' => 5, 'inspection_status' => 'Pending QA'],
        ]);

        $response = $this->actingAs($user)->getJson('/api/stock-in/receivings');

        $response->assertOk();
        $response->assertJsonPath('data.0.items_count', 2);
        $response->assertJsonPath('data.0.eligible_items_count', 1);
        $response->assertJsonPath('data.0.stock_in_status', 'Ready for Stock In');
    }

    public function test_perform_stock_in_updates_inventory_and_marks_items(): void
    {
        $user = User::factory()->create();
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'BR-MAIN']);
        Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id]);

        $receiving = $this->makeReceiving([
            ['product' => 'Widget A', 'qty' => 10, 'inspection_status' => 'Passed'],
            ['product' => 'Widget B', 'qty' => 5, 'inspection_status' => 'Rejected'],
        ]);

        $response = $this->actingAs($user)->postJson("/api/stock-in/receivings/{$receiving->id}/stock-in");

        $response->assertOk();
        $response->assertJsonPath('stock_in_status', 'Completed');
        $response->assertJsonPath('eligible_items_count', 0);

        $passedItem = $receiving->items()->where('product_name', 'Widget A')->first();
        $this->assertNotNull($passedItem->stocked_in_at);

        $this->assertDatabaseHas('inventories', [
            'product_id' => $passedItem->product_id,
            'available_stock' => 10,
        ]);

        $rejectedItem = $receiving->items()->where('product_name', 'Widget B')->first();
        $this->assertNull($rejectedItem->stocked_in_at);

        // Calling again must not double-stock the already-completed item.
        $second = $this->actingAs($user)->postJson("/api/stock-in/receivings/{$receiving->id}/stock-in");
        $second->assertStatus(422);

        $this->assertDatabaseHas('inventories', [
            'product_id' => $passedItem->product_id,
            'available_stock' => 10,
        ]);
    }

    public function test_perform_stock_in_fails_without_eligible_items(): void
    {
        $user = User::factory()->create();
        $receiving = $this->makeReceiving([
            ['product' => 'Widget C', 'qty' => 3, 'inspection_status' => 'Pending QA'],
        ]);

        $response = $this->actingAs($user)->postJson("/api/stock-in/receivings/{$receiving->id}/stock-in");

        $response->assertStatus(422);
    }
}
