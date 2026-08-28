<?php

namespace Tests\Feature;

use App\Models\ReplenishmentRequest;
use App\Models\Branch;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminProcurementTest extends TestCase
{
    use RefreshDatabase;

    private User $requester;
    private Product $product;
    private Warehouse $warehouse;

    protected function setUp(): void
    {
        parent::setUp();
        $this->requester = $this->userWithRole('PLANT_MANAGER');
        $this->requester->update(['name' => 'M. Santos']);
        $this->product = Product::create(['name' => 'Nitrile Gloves (Box 100)']);
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $this->warehouse = Warehouse::create([
            'name' => 'Main Warehouse',
            'code' => 'MAIN-WH',
            'branch_id' => $branch->id,
        ]);
    }

    private function userWithRole(string $slug): User
    {
        $role = Role::firstOrCreate(['slug' => $slug], ['name' => str_replace('_', ' ', $slug)]);
        return User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
    }

    private function replenishmentRequest(array $overrides = []): ReplenishmentRequest
    {
        return ReplenishmentRequest::create(array_merge([
            'request_no' => 'RR-1001',
            'requested_by' => $this->requester->id,
            'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'requested_qty' => 60,
            'priority' => 'Critical',
            'status' => ReplenishmentRequest::STATUS_PENDING,
            'submitted_at' => '2026-08-27 09:00:00',
        ], $overrides));
    }

    public function test_admin_sees_the_requests_submitted_by_the_plant_manager(): void
    {
        $this->replenishmentRequest();

        $response = $this->actingAs($this->userWithRole('ADMIN'))->getJson('/api/admin/procurement/requests');

        $response->assertOk()->assertJsonPath('data.0.request_no', 'RR-1001')
            ->assertJsonPath('data.0.product_name', 'Nitrile Gloves (Box 100)')
            ->assertJsonPath('data.0.warehouse_name', 'Main Warehouse')
            ->assertJsonPath('data.0.requested_qty', 60)
            ->assertJsonPath('data.0.priority', 'Critical')
            ->assertJsonPath('data.0.status', 'Pending Approval')
            ->assertJsonPath('data.0.requested_by', 'M. Santos')
            ->assertJsonPath('data.0.submitted_date', '2026-08-27');
    }

    public function test_approving_keeps_the_request_number_and_persists_the_decision(): void
    {
        $replenishmentRequest = $this->replenishmentRequest();

        $response = $this->actingAs($this->userWithRole('ADMIN'))
            ->postJson("/api/admin/procurement/requests/{$replenishmentRequest->id}/approve");

        $response->assertOk()
            ->assertJsonPath('request_no', 'RR-1001')
            ->assertJsonPath('status', 'Approved')
            ->assertJsonPath('available_for_purchase_order', true);

        $this->assertDatabaseHas('replenishment_requests', [
            'request_no' => 'RR-1001',
            'status' => 'Approved',
        ]);
    }

    public function test_declining_rejects_the_request_but_keeps_it_in_history(): void
    {
        $replenishmentRequest = $this->replenishmentRequest();

        $this->actingAs($this->userWithRole('ADMIN'))
            ->postJson("/api/admin/procurement/requests/{$replenishmentRequest->id}/decline", ['remarks' => 'Insufficient budget'])
            ->assertOk()
            ->assertJsonPath('status', 'Rejected')
            ->assertJsonPath('admin_decision', 'Insufficient budget');

        $this->assertDatabaseHas('replenishment_requests', ['request_no' => 'RR-1001', 'status' => 'Rejected']);
    }

    public function test_an_already_decided_request_cannot_be_reviewed_again(): void
    {
        $replenishmentRequest = $this->replenishmentRequest(['status' => ReplenishmentRequest::STATUS_APPROVED]);

        $this->actingAs($this->userWithRole('ADMIN'))
            ->postJson("/api/admin/procurement/requests/{$replenishmentRequest->id}/approve")
            ->assertStatus(422);
    }

    public function test_summary_counts_come_from_the_request_records(): void
    {
        $this->replenishmentRequest();
        $this->replenishmentRequest(['request_no' => 'RR-1002', 'status' => ReplenishmentRequest::STATUS_APPROVED]);
        $this->replenishmentRequest(['request_no' => 'RR-1003', 'status' => ReplenishmentRequest::STATUS_PO_CREATED]);
        $this->replenishmentRequest(['request_no' => 'RR-1004', 'status' => ReplenishmentRequest::STATUS_REJECTED]);
        $this->replenishmentRequest(['request_no' => 'RR-1005', 'status' => ReplenishmentRequest::STATUS_PO_CREATED]);

        $this->actingAs($this->userWithRole('ADMIN'))->getJson('/api/admin/procurement/summary')
            ->assertOk()
            ->assertJson([
                'total_requests' => 5,
                'pending_approval' => 1,
                'approved' => 1,
                'rejected' => 1,
                'po_created' => 2,
                'for_purchase_order' => 1,
            ]);
    }

    public function test_drafts_are_excluded_from_admin_results_and_summary(): void
    {
        $this->replenishmentRequest(['status' => ReplenishmentRequest::STATUS_DRAFT, 'submitted_at' => null]);

        $this->actingAs($this->userWithRole('ADMIN'))
            ->getJson('/api/admin/procurement/requests')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($this->userWithRole('ADMIN'))
            ->getJson('/api/admin/procurement/summary')
            ->assertOk()
            ->assertJsonPath('total_requests', 0)
            ->assertJsonPath('draft', 0);
    }

    public function test_plant_manager_and_admin_use_the_same_request_record(): void
    {
        $replenishmentRequest = $this->replenishmentRequest();

        $this->actingAs($this->requester)
            ->getJson('/api/plant-manager/procurement/requests')
            ->assertOk()
            ->assertJsonPath('data.0.id', $replenishmentRequest->id)
            ->assertJsonPath('data.0.status', ReplenishmentRequest::STATUS_PENDING);

        $this->actingAs($this->requester)
            ->getJson('/api/admin/procurement/requests')
            ->assertForbidden();
        $this->actingAs($this->requester)
            ->postJson("/api/admin/procurement/requests/{$replenishmentRequest->id}/approve")
            ->assertForbidden();

        $this->actingAs($this->userWithRole('ADMIN'))
            ->postJson("/api/admin/procurement/requests/{$replenishmentRequest->id}/approve")
            ->assertOk();

        $this->actingAs($this->requester)
            ->getJson('/api/plant-manager/procurement/requests')
            ->assertOk()
            ->assertJsonPath('data.0.id', $replenishmentRequest->id)
            ->assertJsonPath('data.0.status', ReplenishmentRequest::STATUS_APPROVED);
    }

    public function test_submitted_plant_manager_request_appears_in_admin_procurement(): void
    {
        $created = $this->actingAs($this->requester)
            ->postJson('/api/plant-manager/procurement/requests', [
                'product_id' => $this->product->id,
                'warehouse_id' => $this->warehouse->id,
                'requested_qty' => 60,
                'priority' => 'Critical',
                'status' => ReplenishmentRequest::STATUS_PENDING,
            ])
            ->assertCreated()
            ->assertJsonPath('requested_by', 'M. Santos')
            ->assertJsonPath('product_name', 'Nitrile Gloves (Box 100)')
            ->assertJsonPath('warehouse_name', 'Main Warehouse')
            ->assertJsonPath('status', ReplenishmentRequest::STATUS_PENDING)
            ->json();

        $this->actingAs($this->userWithRole('ADMIN'))
            ->getJson('/api/admin/procurement/requests')
            ->assertOk()
            ->assertJsonPath('data.0.id', $created['id'])
            ->assertJsonPath('data.0.requested_qty', 60);
    }
}
