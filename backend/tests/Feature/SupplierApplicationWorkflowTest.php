<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierApplication;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SupplierApplicationWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'company_name' => '  Atlas   Industrial Supply  ',
            'address' => '123 Manufacturing Avenue, Makati City',
            'contact_person' => 'Maria Santos',
            'email' => 'SALES@ATLAS.TEST',
            'phone' => '+63 917 123 4567',
            'business_type' => 'Corporation',
            'supply_category' => 'Industrial materials',
            'products_services' => 'Industrial materials, safety equipment, and local delivery services.',
        ], $overrides);
    }

    private function submit(array $overrides = [], string $ip = '198.51.100.10'): SupplierApplication
    {
        $response = $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->postJson('/api/supplier-applications', $this->payload($overrides))
            ->assertCreated()->assertJsonPath('data.status', SupplierApplication::STATUS_PENDING)
            ->assertJsonMissingPath('data.id');

        return SupplierApplication::where('application_number', $response->json('data.application_number'))->firstOrFail();
    }

    public function test_guest_can_submit_application_without_creating_supplier_or_user(): void
    {
        $userCount = User::count();
        $application = $this->submit();

        $this->assertMatchesRegularExpression('/^SUP-APP-\d{4}-[A-Z0-9]{10}$/', $application->application_number);
        $this->assertSame('Atlas Industrial Supply', $application->company_name);
        $this->assertSame('atlas industrial supply', $application->normalized_company_name);
        $this->assertSame('sales@atlas.test', $application->email);
        $this->assertDatabaseCount('suppliers', 0);
        $this->assertSame($userCount, User::count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'SUPPLIER_APPLICATION_SUBMITTED', 'resource_label' => $application->application_number]);
    }

    public function test_public_validation_is_enforced(): void
    {
        $this->postJson('/api/supplier-applications', [])->assertUnprocessable()
            ->assertJsonValidationErrors(['company_name', 'address', 'contact_person', 'email', 'phone', 'business_type', 'supply_category', 'products_services']);
    }

    public function test_same_normalized_email_cannot_create_two_pending_applications(): void
    {
        $this->submit(['email' => 'supplier@example.com']);

        $this->postJson('/api/supplier-applications', $this->payload([
            'company_name' => 'Different Company Name',
            'email' => '  Supplier@Example.COM  ',
        ]))->assertUnprocessable()
            ->assertJsonValidationErrors('email')
            ->assertJsonPath('errors.email.0', 'An application with these details is already being processed. Please contact the company if you need assistance.');

        $this->assertSame(1, SupplierApplication::where('normalized_email', 'supplier@example.com')->count());
    }

    public function test_under_review_application_still_blocks_same_email(): void
    {
        $application = $this->submit(['email' => 'review@example.com']);
        $application->update(['status' => SupplierApplication::STATUS_UNDER_REVIEW]);

        $this->postJson('/api/supplier-applications', $this->payload([
            'company_name' => 'Another Applicant',
            'email' => 'REVIEW@example.com',
        ]))->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_official_supplier_email_cannot_open_public_application(): void
    {
        Supplier::create([
            'supplier_code' => 'SUP-EXISTING',
            'name' => 'Existing Official Supplier',
            'email' => 'partner@example.com',
            'status' => 'ACTIVE',
        ]);

        $this->postJson('/api/supplier-applications', $this->payload([
            'email' => ' Partner@Example.com ',
        ]))->assertUnprocessable()->assertJsonValidationErrors('email');

        $this->assertDatabaseCount('supplier_applications', 0);
    }

    public function test_rejected_applicant_may_reapply_without_an_invented_cooldown(): void
    {
        $application = $this->submit(['email' => 'reapply@example.com']);
        $application->update(['status' => SupplierApplication::STATUS_REJECTED]);

        $second = $this->submit([
            'company_name' => 'Atlas Industrial Supply Reapplication',
            'email' => 'REAPPLY@example.com',
        ]);

        $this->assertNotSame($application->id, $second->id);
        $this->assertSame(2, SupplierApplication::where('normalized_email', 'reapply@example.com')->count());
    }

    public function test_public_submission_honeypot_is_enforced_without_a_detailed_bot_error(): void
    {
        $this->postJson('/api/supplier-applications', $this->payload([
            'website' => 'https://bot.example',
        ]))->assertUnprocessable()
            ->assertExactJson(['message' => 'We could not submit your application. Please review the form and try again.']);

        $this->assertDatabaseCount('supplier_applications', 0);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'SUPPLIER_APPLICATION_SUBMITTED']);
    }

    public function test_five_different_applicants_from_one_ip_are_allowed_and_sixth_attempt_is_limited(): void
    {
        $ip = '198.51.100.25';

        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->withServerVariables(['REMOTE_ADDR' => $ip])->postJson('/api/supplier-applications', $this->payload([
                'company_name' => "Applicant Company {$attempt}",
                'email' => "applicant{$attempt}@example.com",
            ]))->assertCreated();
        }

        $this->withServerVariables(['REMOTE_ADDR' => $ip])->postJson('/api/supplier-applications', $this->payload([
            'company_name' => 'Sixth Applicant Company',
            'email' => 'applicant6@example.com',
        ]))->assertTooManyRequests()
            ->assertJsonPath('message', 'Too many application attempts were submitted. Please try again later.')
            ->assertHeader('Retry-After');

        $this->assertDatabaseCount('supplier_applications', 5);
    }

    public function test_submission_rate_limit_expires_after_sixty_minutes(): void
    {
        $ip = '198.51.100.26';
        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $this->withServerVariables(['REMOTE_ADDR' => $ip])->postJson('/api/supplier-applications', $this->payload([
                'company_name' => "Window Applicant {$attempt}",
                'email' => "window{$attempt}@example.com",
            ]))->assertCreated();
        }

        $this->withServerVariables(['REMOTE_ADDR' => $ip])->postJson('/api/supplier-applications', $this->payload([
            'company_name' => 'Blocked Window Applicant',
            'email' => 'window-blocked@example.com',
        ]))->assertTooManyRequests();

        $this->travel(61)->minutes();

        $this->withServerVariables(['REMOTE_ADDR' => $ip])->postJson('/api/supplier-applications', $this->payload([
            'company_name' => 'Later Window Applicant',
            'email' => 'window-later@example.com',
        ]))->assertCreated();
    }

    public function test_database_has_one_active_application_per_email_constraint(): void
    {
        $definition = DB::table('pg_indexes')
            ->where('tablename', 'supplier_applications')
            ->where('indexname', 'supplier_applications_one_active_email')
            ->value('indexdef');

        $this->assertIsString($definition);
        $this->assertStringContainsString('normalized_email', $definition);
        $this->assertStringContainsString('PENDING', $definition);
        $this->assertStringContainsString('UNDER_REVIEW', $definition);
    }

    public function test_only_admin_can_list_and_decide_applications(): void
    {
        $application = $this->submit();
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $manager = User::factory()->create(['role_id' => $managerRole->id, 'status' => 'ACTIVE']);
        $qaRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $qa = User::factory()->create(['role_id' => $qaRole->id, 'status' => 'ACTIVE']);

        $this->getJson('/api/admin/supplier-applications')->assertUnauthorized();
        $this->actingAs($manager)->getJson('/api/admin/supplier-applications')->assertForbidden();
        $this->actingAs($manager)->postJson("/api/admin/supplier-applications/{$application->id}/approve")->assertForbidden();
        $this->actingAs($qa)->postJson("/api/admin/supplier-applications/{$application->id}/approve")->assertForbidden();
        $this->actingAs($this->admin)->getJson('/api/admin/supplier-applications')
            ->assertOk()->assertJsonPath('data.0.id', $application->id);
        $this->assertDatabaseCount('suppliers', 0);
    }

    public function test_approval_is_transactional_idempotent_and_creates_only_active_supplier_record(): void
    {
        $application = $this->submit();
        $first = $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/approve")
            ->assertOk()->assertJsonPath('data.status', SupplierApplication::STATUS_APPROVED);
        $second = $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/approve")
            ->assertOk()->assertJsonPath('data.approved_supplier.id', $first->json('data.approved_supplier.id'));

        $this->assertDatabaseCount('suppliers', 1);
        $this->assertDatabaseHas('suppliers', [
            'id' => $first->json('data.approved_supplier.id'), 'name' => 'Atlas Industrial Supply',
            'business_type' => 'Corporation', 'supply_category' => 'Industrial materials',
            'products_services' => 'Industrial materials, safety equipment, and local delivery services.', 'status' => 'ACTIVE',
        ]);
        $this->assertDatabaseMissing('suppliers', ['supplier_code' => null]);
        $this->assertSame(0, User::where('email', 'sales@atlas.test')->count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'SUPPLIER_APPLICATION_APPROVED', 'resource_label' => $application->application_number]);
    }

    public function test_rejection_requires_reason_and_never_creates_supplier(): void
    {
        $application = $this->submit();
        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/reject", [])->assertUnprocessable()->assertJsonValidationErrors('reason');
        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/reject", ['reason' => 'Category is outside the current approved sourcing scope.'])
            ->assertOk()->assertJsonPath('data.status', SupplierApplication::STATUS_REJECTED);

        $this->assertDatabaseCount('suppliers', 0);
        $this->assertDatabaseHas('supplier_applications', ['id' => $application->id, 'decision_reason' => 'Category is outside the current approved sourcing scope.']);
    }

    public function test_approval_blocks_exact_normalized_company_or_email_duplicate(): void
    {
        Supplier::create(['supplier_code' => 'SUP-EXISTING', 'name' => 'Atlas Industrial Supply', 'email' => 'other@atlas.test', 'status' => 'ACTIVE']);
        $application = $this->submit();

        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/approve")
            ->assertUnprocessable()->assertJsonValidationErrors('application');
        $this->assertDatabaseCount('suppliers', 1);
        $this->assertSame(SupplierApplication::STATUS_PENDING, $application->fresh()->status);
    }
}
