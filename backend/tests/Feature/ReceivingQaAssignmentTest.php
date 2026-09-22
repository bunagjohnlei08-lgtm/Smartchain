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

class ReceivingQaAssignmentTest extends TestCase
{
    use RefreshDatabase;

    private Role $qaRole;
    private Role $managerRole;
    private Role $adminRole;
    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        $this->qaRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $this->managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $this->adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->manager = User::factory()->create(['role_id' => $this->managerRole->id, 'status' => 'ACTIVE']);
    }

    private function qa(string $name, string $status = 'ACTIVE'): User
    {
        return User::factory()->create(['name' => $name, 'role_id' => $this->qaRole->id, 'status' => $status]);
    }

    private function receiving(string $number, ?User $qa = null, string $status = 'Pending QA'): Receiving
    {
        $product = Product::firstOrCreate(['name' => 'Assignment Product'], ['unit' => 'pcs', 'cost_price' => 10]);
        $receiving = Receiving::create([
            'receiving_no' => $number,
            'purchase_order' => 'PO-'.$number,
            'supplier' => 'Assignment Supplier',
            'delivery_date' => today(),
            'status' => $status,
            'prepared_by_id' => $this->manager->id,
            'assigned_qa_user_id' => $qa?->id,
        ]);
        ReceivingItem::create([
            'receiving_id' => $receiving->id,
            'product_id' => $product->id,
            'product_name' => $product->name,
            'delivered_quantity' => 5,
            'unit' => 'pcs',
            'inspection_status' => $status === 'Pending QA' ? 'Pending QA' : $status,
        ]);

        return $receiving->fresh('items');
    }

    public function test_assignee_choices_only_include_active_qa_supervisors(): void
    {
        $active = $this->qa('Active QA');
        $this->qa('Inactive QA', 'SUSPENDED');
        $this->qa('Pending QA', 'PENDING');
        User::factory()->create(['name' => 'Admin User', 'role_id' => $this->adminRole->id, 'status' => 'ACTIVE']);

        $this->actingAs($this->manager)->getJson('/api/receivings/qa-assignees')
            ->assertOk()
            ->assertExactJson(['data' => [['id' => $active->id, 'name' => 'Active QA']]]);
    }

    public function test_manager_can_assign_active_qa_and_invalid_assignees_are_rejected(): void
    {
        $active = $this->qa('Active QA');
        $inactive = $this->qa('Inactive QA', 'SUSPENDED');
        $admin = User::factory()->create(['role_id' => $this->adminRole->id, 'status' => 'ACTIVE']);
        $receiving = $this->receiving('RCV-ASSIGN');

        $this->actingAs($this->manager)->patchJson("/api/receivings/{$receiving->id}/assign-qa", ['qa_user_id' => $active->id])
            ->assertOk()
            ->assertJsonPath('assigned_qa.id', $active->id);
        $this->assertDatabaseHas('receivings', ['id' => $receiving->id, 'assigned_qa_user_id' => $active->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'QA_ASSIGNED', 'resource_id' => (string) $receiving->id]);

        foreach ([$inactive->id, $admin->id, $this->manager->id] as $invalidId) {
            $this->patchJson("/api/receivings/{$receiving->id}/assign-qa", ['qa_user_id' => $invalidId])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('qa_user_id');
        }
        $this->patchJson("/api/receivings/{$receiving->id}/assign-qa", ['qa_user_id' => 999999])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('qa_user_id');
    }

    public function test_qa_list_detail_write_and_reassignment_are_owner_scoped(): void
    {
        $qaA = $this->qa('QA A');
        $qaB = $this->qa('QA B');
        $a = $this->receiving('RCV-A', $qaA);
        $b = $this->receiving('RCV-B', $qaB);
        $unassigned = $this->receiving('RCV-U');

        $this->actingAs($qaA)->getJson('/api/qa/inspections')
            ->assertOk()->assertJsonFragment(['receiving_no' => 'RCV-A'])
            ->assertJsonMissing(['receiving_no' => 'RCV-B'])
            ->assertJsonMissing(['receiving_no' => 'RCV-U']);
        $this->actingAs($qaB)->getJson('/api/qa/inspections')
            ->assertOk()->assertJsonFragment(['receiving_no' => 'RCV-B'])
            ->assertJsonMissing(['receiving_no' => 'RCV-A']);
        $this->actingAs($qaA)->getJson("/api/qa/inspections/{$b->id}")->assertNotFound();
        $this->actingAs($qaA)->getJson("/api/qa/inspections/{$unassigned->id}")->assertNotFound();
        $this->actingAs($qaA)->postJson("/api/qa/inspections/{$b->id}", [
            'submit' => false,
            'items' => [[
                'receiving_item_id' => $b->items->first()->id,
                'accepted_quantity' => 0,
                'rejected_quantity' => 0,
                'inspection_result' => 'Pending',
            ]],
        ])->assertNotFound();

        $this->actingAs($this->manager)->getJson('/api/receivings')
            ->assertOk()->assertJsonCount(3, 'data');
        $this->patchJson("/api/receivings/{$a->id}/assign-qa", ['qa_user_id' => $qaB->id])->assertOk();
        $this->actingAs($qaA)->getJson('/api/qa/inspections')->assertJsonMissing(['receiving_no' => 'RCV-A']);
        $this->actingAs($qaB)->getJson('/api/qa/inspections')->assertJsonFragment(['receiving_no' => 'RCV-A']);
    }

    public function test_dashboard_and_completed_history_are_scoped_to_assigned_qa(): void
    {
        $qaA = $this->qa('QA A');
        $qaB = $this->qa('QA B');
        $pendingA = $this->receiving('RCV-PENDING-A', $qaA);
        $this->receiving('RCV-PENDING-B', $qaB);
        $completedB = $this->receiving('RCV-DONE-B', $qaB, 'Passed');
        $inspection = QaInspection::create([
            'receiving_id' => $completedB->id, 'status' => 'Passed', 'started_at' => now()->subHour(),
            'completed_at' => now(), 'inspected_by_id' => $qaB->id, 'submitted_by_id' => $qaB->id,
        ]);
        QaInspectionItem::create([
            'qa_inspection_id' => $inspection->id,
            'receiving_item_id' => $completedB->items->first()->id,
            'accepted_quantity' => 5,
            'rejected_quantity' => 0,
            'inspection_result' => 'Passed',
        ]);

        $this->actingAs($qaA)->getJson('/api/qa/dashboard')
            ->assertOk()->assertJsonPath('pending_inspection', 1)
            ->assertJsonPath('todays_inspections', 0)
            ->assertJsonPath('approved_products', 0)
            ->assertJsonCount(0, 'recent_activities')
            ->assertJsonPath('inspection_queue.0.id', $pendingA->id);
        $this->getJson('/api/qa/inspection-history')->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($qaB)->getJson('/api/qa/dashboard')
            ->assertJsonPath('todays_inspections', 1)
            ->assertJsonPath('approved_products', 5);
        $this->getJson('/api/qa/inspection-history')->assertJsonFragment(['receiving_no' => 'RCV-DONE-B']);
    }

    public function test_completed_inspection_cannot_be_reassigned(): void
    {
        $qaA = $this->qa('QA A');
        $qaB = $this->qa('QA B');
        $receiving = $this->receiving('RCV-FINAL', $qaA, 'Passed');
        QaInspection::create([
            'receiving_id' => $receiving->id,
            'status' => 'Passed',
            'started_at' => now()->subHour(),
            'completed_at' => now(),
            'inspected_by_id' => $qaA->id,
            'submitted_by_id' => $qaA->id,
        ]);

        $this->actingAs($this->manager)
            ->patchJson("/api/receivings/{$receiving->id}/assign-qa", ['qa_user_id' => $qaB->id])
            ->assertUnprocessable();
        $this->assertSame($qaA->id, $receiving->fresh()->assigned_qa_user_id);
    }
}
