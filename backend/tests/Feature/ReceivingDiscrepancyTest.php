<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\ReceivingDiscrepancy;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReceivingDiscrepancyTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $manager;
    private User $qa;
    private PurchaseOrder $order;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->user('ADMIN');
        $this->manager = $this->user('PLANT_MANAGER');
        $this->qa = $this->user('QA_SUPERVISOR');
        Product::create(['name' => 'SPIK N SPAN', 'unit' => 'pcs', 'cost_price' => 100]);
        $this->order = PurchaseOrder::create([
            'po_number' => 'PO-2026-0030', 'supplier_name' => 'Test Supplier',
            'delivery_details' => 'Main warehouse', 'expected_delivery_date' => '2026-10-01',
            'total_amount' => 500, 'status' => 'Sent to Supplier', 'approved_by' => $this->admin->id,
        ]);
        $this->order->items()->create(['product_name' => 'SPIK N SPAN', 'ordered_quantity' => 5, 'unit_price' => 100, 'total_price' => 500]);
    }

    private function user(string $slug): User
    {
        $role = Role::firstOrCreate(['slug' => $slug], ['name' => str_replace('_', ' ', $slug)]);
        return User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
    }

    private function receive(int $quantity, string $reference): int
    {
        return (int) $this->actingAs($this->manager)->postJson('/api/receivings', [
            'purchase_order_id' => $this->order->id,
            'reference_no' => $reference,
            'delivery_date' => '2026-10-01',
            'items' => [[
                'purchase_order_item_id' => $this->order->items()->firstOrFail()->id,
                'delivered_quantity' => $quantity,
            ]],
        ])->assertCreated()->json('id');
    }

    public function test_short_delivery_preserves_po_quantity_and_qa_uses_delivered_quantity(): void
    {
        $receivingId = $this->receive(3, 'DEL-1');

        $this->assertSame(5, $this->order->items()->firstOrFail()->ordered_quantity);
        $this->assertSame('Partially Received', $this->order->fresh()->status);
        $this->assertDatabaseHas('receiving_discrepancies', [
            'purchase_order_id' => $this->order->id, 'receiving_id' => $receivingId,
            'expected_quantity' => 5, 'delivered_quantity' => 3, 'short_quantity' => 2,
            'status' => ReceivingDiscrepancy::STATUS_REPORTED,
        ]);
        $this->assertDatabaseCount('supplier_rejection_cases', 0);

        $this->actingAs($this->manager)->patchJson("/api/receivings/{$receivingId}/assign-qa", ['qa_user_id' => $this->qa->id])->assertOk();
        $this->actingAs($this->qa)->getJson("/api/qa/inspections/{$receivingId}")
            ->assertOk()->assertJsonPath('products.0.ordered_qty', 5)
            ->assertJsonPath('products.0.delivered_qty', 3)
            ->assertJsonPath('totals.ordered_qty', 5)
            ->assertJsonPath('totals.delivered_qty', 3);

        $payload = ['items' => [[
            'receiving_item_id' => $this->order->receivings()->firstOrFail()->items()->firstOrFail()->id,
            'accepted_quantity' => 4, 'rejected_quantity' => 0, 'inspection_result' => 'Passed',
        ]], 'submit' => true];
        $this->actingAs($this->qa)->postJson("/api/qa/inspections/{$receivingId}", $payload)->assertUnprocessable();
    }

    public function test_follow_up_receiving_consumes_only_balance_and_resolves_discrepancy(): void
    {
        $first = $this->receive(3, 'DEL-1');
        $second = $this->receive(2, 'DEL-2');

        $this->assertNotSame($first, $second);
        $this->assertSame('Completed', $this->order->fresh()->status);
        $this->assertSame(5, (int) $this->order->receivings()->with('items')->get()->flatMap->items->sum('delivered_quantity'));
        $this->assertDatabaseHas('receiving_discrepancies', [
            'receiving_id' => $first, 'short_quantity' => 2, 'status' => ReceivingDiscrepancy::STATUS_RESOLVED,
        ]);
        $this->assertDatabaseCount('receiving_discrepancies', 1);

        $this->actingAs($this->manager)->postJson('/api/receivings', [
            'purchase_order_id' => $this->order->id, 'delivery_date' => '2026-10-02',
            'items' => [['purchase_order_item_id' => $this->order->items()->firstOrFail()->id, 'delivered_quantity' => 1]],
        ])->assertUnprocessable();
    }

    public function test_admin_can_close_shortage_with_notes_but_other_roles_cannot(): void
    {
        $this->receive(3, 'DEL-1');
        $case = ReceivingDiscrepancy::firstOrFail();

        $this->actingAs($this->manager)->patchJson("/api/admin/receiving-discrepancies/{$case->id}", [
            'action' => 'CLOSE_SHORTAGE', 'resolution_notes' => 'Supplier cannot fulfill.',
        ])->assertForbidden();
        $this->actingAs($this->admin)->patchJson("/api/admin/receiving-discrepancies/{$case->id}", [
            'action' => 'CLOSE_SHORTAGE',
        ])->assertUnprocessable()->assertJsonValidationErrors('resolution_notes');
        $this->actingAs($this->admin)->patchJson("/api/admin/receiving-discrepancies/{$case->id}", [
            'action' => 'CLOSE_SHORTAGE', 'resolution_notes' => 'Supplier confirmed the balance cannot be fulfilled.',
        ])->assertOk()->assertJsonPath('status', ReceivingDiscrepancy::STATUS_CLOSED_SHORTAGE);

        $this->assertSame('Closed with Shortage', $this->order->fresh()->status);
        $this->assertDatabaseCount('supplier_rejection_cases', 0);
    }
}
