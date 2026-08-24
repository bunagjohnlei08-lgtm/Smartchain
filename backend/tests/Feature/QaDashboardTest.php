<?php

namespace Tests\Feature;

use App\Models\QaInspection;
use App\Models\QaInspectionItem;
use App\Models\Product;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QaDashboardTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $slug): User
    {
        $role = Role::create(['name' => $slug, 'slug' => $slug]);

        return User::factory()->create(['role_id' => $role->id]);
    }

    public function test_dashboard_returns_live_qa_aggregates(): void
    {
        $qa = $this->user('QA_SUPERVISOR');
        $product = Product::create(['name' => 'Widget', 'unit' => 'pcs']);
        $receiving = Receiving::create([
            'receiving_no' => 'RCV-DASH-1', 'purchase_order' => 'PO-DASH-1',
            'supplier' => 'Supplier', 'delivery_date' => today(), 'status' => 'Passed',
        ]);
        $item = ReceivingItem::create([
            'receiving_id' => $receiving->id, 'product_id' => $product->id, 'product_name' => 'Widget',
            'delivered_quantity' => 5, 'unit' => 'pcs', 'inspection_status' => 'Passed',
        ]);
        $inspection = QaInspection::create([
            'receiving_id' => $receiving->id, 'status' => 'Passed', 'started_at' => now()->subHour(),
            'completed_at' => now(), 'inspected_by_id' => $qa->id, 'submitted_by_id' => $qa->id,
        ]);
        QaInspectionItem::create([
            'qa_inspection_id' => $inspection->id, 'receiving_item_id' => $item->id,
            'accepted_quantity' => 4, 'rejected_quantity' => 1, 'inspection_result' => 'Partial',
        ]);
        Receiving::create([
            'receiving_no' => 'RCV-DASH-2', 'purchase_order' => 'PO-DASH-2',
            'supplier' => 'Supplier', 'delivery_date' => today(), 'status' => 'Pending QA',
        ]);

        $this->actingAs($qa)->getJson('/api/qa/dashboard')
            ->assertOk()
            ->assertJsonPath('todays_inspections', 1)
            ->assertJsonPath('pending_inspection', 1)
            ->assertJsonPath('approved_products', 4)
            ->assertJsonPath('rejected_products', 1)
            ->assertJsonPath('inspection_rate', 100)
            ->assertJsonCount(1, 'recent_activities')
            ->assertJsonCount(1, 'inspection_queue');
    }

    public function test_dashboard_rejects_non_qa_roles_and_unauthenticated_users(): void
    {
        $this->getJson('/api/qa/dashboard')->assertUnauthorized();

        $this->actingAs($this->user('PLANT_MANAGER'))
            ->getJson('/api/qa/dashboard')
            ->assertForbidden();
    }
}
