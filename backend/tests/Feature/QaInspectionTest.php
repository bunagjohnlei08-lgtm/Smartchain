<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\QaInspection;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QaInspectionTest extends TestCase
{
    use RefreshDatabase;

    private function qaUser(): User
    {
        $role = Role::create([
            'name' => 'QA Supervisor',
            'slug' => 'QA_SUPERVISOR',
        ]);

        return User::factory()->create(['role_id' => $role->id]);
    }

    private function makeReceiving(array $items, string $status = 'Pending QA'): Receiving
    {
        $receiving = Receiving::create([
            'receiving_no' => 'RCV-'.uniqid(),
            'purchase_order' => 'PO-1',
            'supplier' => 'Test Supplier',
            'reference_no' => 'REF-1',
            'delivery_date' => now()->toDateString(),
            'status' => $status,
        ]);

        foreach ($items as $item) {
            $product = Product::create([
                'name' => $item['product'],
                'unit' => $item['unit'] ?? 'pcs',
                'cost_price' => 100,
            ]);

            ReceivingItem::create([
                'receiving_id' => $receiving->id,
                'product_id' => $product->id,
                'product_name' => $product->name,
                'delivered_quantity' => $item['qty'],
                'unit' => $item['unit'] ?? 'pcs',
                'inspection_status' => $item['inspection_status'] ?? 'Pending QA',
            ]);
        }

        return $receiving->fresh('items');
    }

    public function test_index_lists_existing_receivings_for_qa(): void
    {
        $qa = $this->qaUser();
        $receiving = $this->makeReceiving([
            ['product' => 'Stainless Steel Pipe 2in', 'qty' => 8],
        ]);

        $response = $this->actingAs($qa)->getJson('/api/qa/inspections');

        $response->assertOk();
        $response->assertJsonPath('data.0.receiving_no', $receiving->receiving_no);
        $response->assertJsonPath('data.0.product', 'Stainless Steel Pipe 2in');
        $response->assertJsonPath('data.0.inspection_status', 'Pending');
        $response->assertJsonPath('data.0.action', 'Start Inspection');
    }

    public function test_show_returns_receiving_products_without_sku(): void
    {
        $qa = $this->qaUser();
        $receiving = $this->makeReceiving([
            ['product' => 'Industrial Valve DN50', 'qty' => 10],
        ]);

        $response = $this->actingAs($qa)->getJson("/api/qa/inspections/{$receiving->id}");

        $response->assertOk();
        $response->assertJsonPath('receiving_no', $receiving->receiving_no);
        $response->assertJsonMissingPath('products.0.sku');
        $response->assertJsonPath('products.0.product', 'Industrial Valve DN50');
        $response->assertJsonPath('products.0.ordered_qty', 10);
        $response->assertJsonPath('products.0.delivered_qty', 10);
    }

    public function test_submiting_inspection_updates_qa_and_receiving_statuses(): void
    {
        $qa = $this->qaUser();
        $receiving = $this->makeReceiving([
            ['product' => 'Widget A', 'qty' => 10],
            ['product' => 'Widget B', 'qty' => 5],
        ]);

        $payload = [
            'items' => [
                [
                    'receiving_item_id' => $receiving->items[0]->id,
                    'accepted_quantity' => 10,
                    'rejected_quantity' => 0,
                    'inspection_result' => 'Passed',
                    'remarks' => 'Accepted.',
                ],
                [
                    'receiving_item_id' => $receiving->items[1]->id,
                    'accepted_quantity' => 3,
                    'rejected_quantity' => 2,
                    'inspection_result' => 'Partial',
                    'remarks' => 'Two damaged pieces.',
                ],
            ],
        ];

        $response = $this->actingAs($qa)->postJson("/api/qa/inspections/{$receiving->id}", $payload);

        $response->assertOk();
        $response->assertJsonPath('inspection_status', 'Partial');
        $response->assertJsonPath('products.0.accepted_qty', 10);
        $response->assertJsonPath('products.1.rejected_qty', 2);

        $this->assertDatabaseHas('receivings', [
            'id' => $receiving->id,
            'status' => 'Partial',
        ]);

        $this->assertDatabaseHas('receiving_items', [
            'id' => $receiving->items[0]->id,
            'inspection_status' => 'Passed',
        ]);

        $this->assertDatabaseHas('receiving_items', [
            'id' => $receiving->items[1]->id,
            'inspection_status' => 'Partial',
        ]);

        $this->assertDatabaseHas('qa_inspections', [
            'receiving_id' => $receiving->id,
            'status' => 'Partial',
        ]);
    }

    public function test_rejects_invalid_quantities(): void
    {
        $qa = $this->qaUser();
        $receiving = $this->makeReceiving([
            ['product' => 'Widget A', 'qty' => 5],
        ]);

        $payload = [
            'items' => [
                [
                    'receiving_item_id' => $receiving->items[0]->id,
                    'accepted_quantity' => 4,
                    'rejected_quantity' => 2,
                    'inspection_result' => 'Partial',
                ],
            ],
        ];

        $response = $this->actingAs($qa)->postJson("/api/qa/inspections/{$receiving->id}", $payload);

        $response->assertStatus(422);
        $response->assertJsonPath('message', 'Accepted and rejected quantities cannot exceed delivered quantity.');
    }

    public function test_non_qa_users_are_forbidden(): void
    {
        $user = User::factory()->create();
        $receiving = $this->makeReceiving([
            ['product' => 'Widget A', 'qty' => 5],
        ]);

        $response = $this->actingAs($user)->getJson("/api/qa/inspections/{$receiving->id}");

        $response->assertStatus(403);
        $response->assertJsonPath('message', 'Unauthorized QA access.');
    }
}
