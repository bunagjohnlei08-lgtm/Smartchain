<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\SupplierApplication;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SupplierApplicationListTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
    }

    private function application(string $status, string $company): SupplierApplication
    {
        $key = strtolower($status);

        return SupplierApplication::create([
            'application_number' => 'SUP-APP-LIST-'.$status, 'company_name' => $company, 'normalized_company_name' => strtolower($company),
            'address' => '1 Road', 'contact_person' => 'Contact', 'email' => "{$key}@example.test", 'normalized_email' => "{$key}@example.test",
            'phone' => '639170000000', 'business_type' => 'Corporation', 'supply_category' => 'Chemicals',
            'status' => $status, 'submitted_at' => now(), 'decision_reason' => $status === 'REJECTED' ? 'Internal note' : null,
            'supplier_message' => $status === 'REJECTED' ? 'Not a fit.' : null,
        ]);
    }

    public function test_rejected_applications_are_excluded_from_the_operational_list_but_kept(): void
    {
        foreach ([SupplierApplication::STATUS_PENDING, SupplierApplication::STATUS_QUALIFIED_FOR_MEETING, SupplierApplication::STATUS_MEETING_SCHEDULED, SupplierApplication::STATUS_APPROVED] as $status) {
            $this->application($status, "Visible {$status}");
        }
        $rejected = $this->application(SupplierApplication::STATUS_REJECTED, 'Hidden Rejected Co');
        $rejected->events()->create(['event_type' => 'REJECTED', 'title' => 'Rejected', 'description' => 'Not a fit.', 'occurred_at' => now()]);

        $list = $this->actingAs($this->admin)->getJson('/api/admin/supplier-applications')->assertOk()
            ->assertJsonPath('meta.total', 4);
        $this->assertEqualsCanonicalizing(
            ['PENDING', 'QUALIFIED_FOR_MEETING', 'MEETING_SCHEDULED', 'APPROVED'],
            collect($list->json('data'))->pluck('status')->all(),
        );

        $this->getJson('/api/admin/supplier-applications?search=Hidden')->assertOk()->assertJsonPath('meta.total', 0);
        $this->getJson('/api/admin/supplier-applications?search=Visible')->assertOk()->assertJsonPath('meta.total', 4);
        $this->getJson('/api/admin/supplier-applications?status=APPROVED')->assertOk()->assertJsonPath('meta.total', 1);
        $this->getJson('/api/admin/supplier-applications?status=REJECTED')->assertUnprocessable();

        // The rejected record, its decision, and history are untouched and still viewable directly.
        $this->getJson("/api/admin/supplier-applications/{$rejected->id}")->assertOk()
            ->assertJsonPath('data.status', 'REJECTED')->assertJsonPath('data.supplier_message', 'Not a fit.');
        $this->assertDatabaseHas('supplier_applications', ['id' => $rejected->id, 'status' => 'REJECTED', 'decision_reason' => 'Internal note']);
        $this->assertDatabaseHas('supplier_application_events', ['supplier_application_id' => $rejected->id, 'event_type' => 'REJECTED']);
    }
}
