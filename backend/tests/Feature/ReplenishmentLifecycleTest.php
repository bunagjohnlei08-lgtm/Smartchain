<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\ReplenishmentRequest;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReplenishmentLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_reconciliation_is_dry_run_capable_idempotent_and_preserves_history(): void
    {
        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $warehouse = Warehouse::create(['name' => 'Main Warehouse', 'code' => 'MAIN-WH', 'branch_id' => $branch->id]);
        $product = Product::create(['name' => 'Lifecycle Product']);

        $completedRequest = $this->request($admin, $warehouse, $product, 'RR-STALE-COMPLETED');
        $completedPo = $this->purchaseOrder($admin, $completedRequest, 'PO-STALE-COMPLETED', PurchaseOrder::STATUS_COMPLETED);
        $activeRequest = $this->request($admin, $warehouse, $product, 'RR-STALE-ACTIVE');
        $activePo = $this->purchaseOrder($admin, $activeRequest, 'PO-STALE-ACTIVE', PurchaseOrder::STATUS_SENT_TO_SUPPLIER);
        $cancelledRequest = $this->request($admin, $warehouse, $product, 'RR-STALE-CANCELLED');
        $cancelledPo = $this->purchaseOrder($admin, $cancelledRequest, 'PO-STALE-CANCELLED', PurchaseOrder::STATUS_CANCELLED);

        $this->artisan('replenishment:reconcile-statuses', ['--dry-run' => true])
            ->expectsOutputToContain('Would update 3 of 3 linked replenishment request(s).')
            ->assertSuccessful();
        $this->assertDatabaseHas('replenishment_requests', [
            'id' => $completedRequest->id,
            'status' => ReplenishmentRequest::STATUS_FOR_PURCHASE_ORDER,
        ]);

        $this->artisan('replenishment:reconcile-statuses')
            ->expectsOutputToContain('Updated 3 of 3 linked replenishment request(s).')
            ->assertSuccessful();

        $this->assertDatabaseHas('replenishment_requests', ['id' => $completedRequest->id, 'status' => ReplenishmentRequest::STATUS_COMPLETED]);
        $this->assertDatabaseHas('replenishment_requests', ['id' => $activeRequest->id, 'status' => ReplenishmentRequest::STATUS_PO_CREATED]);
        $this->assertDatabaseHas('replenishment_requests', ['id' => $cancelledRequest->id, 'status' => ReplenishmentRequest::STATUS_CANCELLED]);
        $this->assertDatabaseHas('purchase_orders', ['id' => $completedPo->id, 'replenishment_request_id' => $completedRequest->id]);
        $this->assertDatabaseHas('purchase_orders', ['id' => $activePo->id, 'replenishment_request_id' => $activeRequest->id]);
        $this->assertDatabaseHas('purchase_orders', ['id' => $cancelledPo->id, 'replenishment_request_id' => $cancelledRequest->id]);
        $this->assertDatabaseCount('purchase_orders', 3);

        $this->artisan('replenishment:reconcile-statuses')
            ->expectsOutputToContain('Updated 0 of 1 linked replenishment request(s).')
            ->assertSuccessful();
    }

    private function request(User $user, Warehouse $warehouse, Product $product, string $number): ReplenishmentRequest
    {
        return ReplenishmentRequest::create([
            'request_no' => $number,
            'requested_by' => $user->id,
            'warehouse_id' => $warehouse->id,
            'product_id' => $product->id,
            'requested_qty' => 10,
            'priority' => 'Critical',
            'status' => ReplenishmentRequest::STATUS_FOR_PURCHASE_ORDER,
            'submitted_at' => now(),
        ]);
    }

    private function purchaseOrder(User $admin, ReplenishmentRequest $request, string $number, string $status): PurchaseOrder
    {
        return PurchaseOrder::create([
            'po_number' => $number,
            'replenishment_request_id' => $request->id,
            'supplier_name' => 'Lifecycle Supplier',
            'delivery_details' => 'Main Warehouse',
            'expected_delivery_date' => now()->addDay()->toDateString(),
            'total_amount' => 100,
            'status' => $status,
            'approved_by' => $admin->id,
        ]);
    }
}
