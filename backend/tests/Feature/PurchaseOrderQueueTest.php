<?php

namespace Tests\Feature;

use App\Models\PurchaseOrder;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PurchaseOrderQueueTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
        $this->supplier = Supplier::create([
            'supplier_code' => 'SUP-QUEUE',
            'name' => 'Queue Supplier',
            'status' => 'ACTIVE',
        ]);
    }

    private function purchaseOrder(string $number, string $status = PurchaseOrder::STATUS_APPROVED): PurchaseOrder
    {
        return PurchaseOrder::create([
            'po_number' => $number,
            'supplier_id' => $this->supplier->id,
            'supplier_name' => $this->supplier->name,
            'delivery_details' => 'Main warehouse',
            'expected_delivery_date' => now()->addWeek()->toDateString(),
            'total_amount' => 100,
            'status' => $status,
            'approved_by' => $this->admin->id,
        ]);
    }

    public function test_default_queue_filters_terminal_orders_before_ten_row_pagination(): void
    {
        foreach (range(1, 12) as $number) {
            $this->purchaseOrder(sprintf('PO-ACTIVE-%02d', $number));
        }
        $terminal = collect([
            PurchaseOrder::STATUS_COMPLETED,
            PurchaseOrder::STATUS_CLOSED_WITH_SHORTAGE,
            PurchaseOrder::STATUS_CANCELLED,
        ])->map(fn (string $status, int $index) => $this->purchaseOrder("PO-TERMINAL-{$index}", $status));

        $firstPage = $this->actingAs($this->admin)->getJson('/api/purchase-orders')
            ->assertOk()
            ->assertJsonCount(10, 'data')
            ->assertJsonPath('current_page', 1)
            ->assertJsonPath('per_page', 10)
            ->assertJsonPath('total', 12)
            ->assertJsonPath('last_page', 2)
            ->assertJsonPath('from', 1)
            ->assertJsonPath('to', 10);

        $secondPage = $this->actingAs($this->admin)->getJson('/api/purchase-orders?page=2')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('current_page', 2)
            ->assertJsonPath('total', 12)
            ->assertJsonPath('from', 11)
            ->assertJsonPath('to', 12);

        $returnedIds = collect([...$firstPage->json('data'), ...$secondPage->json('data')])->pluck('id');
        foreach ($terminal as $order) {
            $this->assertNotContains($order->id, $returnedIds);
            $this->assertDatabaseHas('purchase_orders', ['id' => $order->id, 'status' => $order->status]);
        }
    }

    public function test_search_and_active_status_filters_are_applied_before_pagination(): void
    {
        foreach (range(1, 11) as $number) {
            $this->purchaseOrder(sprintf('PO-MATCH-%02d', $number), PurchaseOrder::STATUS_SENT_TO_SUPPLIER);
        }
        $this->purchaseOrder('PO-OTHER', PurchaseOrder::STATUS_APPROVED);
        $this->purchaseOrder('PO-MATCH-COMPLETED', PurchaseOrder::STATUS_COMPLETED);

        $this->actingAs($this->admin)
            ->getJson('/api/purchase-orders?search=PO-MATCH&status='.urlencode(PurchaseOrder::STATUS_SENT_TO_SUPPLIER))
            ->assertOk()
            ->assertJsonCount(10, 'data')
            ->assertJsonPath('total', 11)
            ->assertJsonPath('last_page', 2);

        $this->actingAs($this->admin)
            ->getJson('/api/purchase-orders?search=PO-MATCH&status='.urlencode(PurchaseOrder::STATUS_COMPLETED))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');
    }

    public function test_purchase_order_queue_remains_admin_only(): void
    {
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $manager = User::factory()->create(['role_id' => $managerRole->id, 'status' => 'ACTIVE']);

        $this->actingAs($manager)->getJson('/api/purchase-orders')->assertForbidden();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/purchase-orders')->assertUnauthorized();
    }
}
