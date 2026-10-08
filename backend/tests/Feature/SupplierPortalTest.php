<?php

namespace Tests\Feature;

use App\Mail\SupplierApplicationPortalMail;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\SupplierApplication;
use App\Models\SupplierApplicationEvent;
use App\Models\SupplierApplicationMeetingSlot;
use App\Models\User;
use App\Notifications\WorkflowNotification;
use App\Support\SupplierPortalAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SupplierPortalTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
    }

    private function application(string $suffix = 'one', string $status = SupplierApplication::STATUS_PENDING): SupplierApplication
    {
        $application = SupplierApplication::create([
            'application_number' => 'SUP-APP-2026-'.strtoupper($suffix),
            'company_name' => "Applicant {$suffix}",
            'normalized_company_name' => "applicant {$suffix}",
            'address' => '123 Supplier Avenue',
            'contact_person' => 'Applicant Contact',
            'email' => "{$suffix}@example.test",
            'normalized_email' => "{$suffix}@example.test",
            'phone' => '+63 900 000 0000',
            'business_type' => 'Corporation',
            'supply_category' => 'Materials',
            'products_services' => 'Industrial materials and services.',
            'status' => $status,
            'submitted_at' => now(),
        ]);
        $application->events()->create([
            'event_type' => SupplierApplicationEvent::SUBMITTED,
            'title' => 'Application Submitted',
            'description' => 'Your supplier application was received for review.',
            'occurred_at' => now(),
        ]);

        return $application;
    }

    private function sessionFor(SupplierApplication $application): string
    {
        $link = SupplierPortalAccess::issueLink($application);

        return $this->postJson('/api/supplier-portal/access', ['access_token' => $link['token']])
            ->assertOk()->json('session_token');
    }

    private function portalHeaders(string $session): array
    {
        return ['X-Supplier-Portal-Session' => $session];
    }

    private function meetingOptions(int $count = 3, int $firstDayOffset = 2): array
    {
        $date = now('Asia/Manila')->addDays($firstDayOffset);

        return collect(range(0, $count - 1))->map(fn (int $offset) => [
            'date' => $date->copy()->addDays($offset)->format('Y-m-d'),
            'start_time' => '14:00',
            'end_time' => '15:00',
        ])->all();
    }

    private function tokenFromLastPortalMail(): string
    {
        /** @var SupplierApplicationPortalMail|null $mail */
        $mail = Mail::sent(SupplierApplicationPortalMail::class)->last();
        $this->assertNotNull($mail);
        $this->assertNotNull($mail->actionUrl);
        $this->assertStringContainsString('/supplier-portal#token=', $mail->actionUrl);

        parse_str((string) parse_url($mail->actionUrl, PHP_URL_FRAGMENT), $fragment);
        $this->assertArrayHasKey('token', $fragment);

        return (string) $fragment['token'];
    }

    public function test_secure_link_is_hashed_and_exchanges_for_application_scoped_session(): void
    {
        $application = $this->application();
        $link = SupplierPortalAccess::issueLink($application);

        $this->assertStringContainsString('/supplier-portal#token=', $link['url']);
        $this->assertDatabaseMissing('supplier_application_accesses', ['link_token_hash' => $link['token']]);
        $this->assertTrue($application->portalAccess()->firstOrFail()->link_expires_at->between(
            now()->addDays((int) config('supplier_portal.link_expiration_days'))->subMinute(),
            now()->addDays((int) config('supplier_portal.link_expiration_days'))->addMinute(),
        ));
        $response = $this->postJson('/api/supplier-portal/access', ['access_token' => $link['token']])->assertOk();
        $session = $response->json('session_token');
        $this->assertNotSame($link['token'], $session);
        $this->assertDatabaseMissing('supplier_application_accesses', ['session_token_hash' => $session]);

        $this->withHeaders($this->portalHeaders($session))->getJson('/api/supplier-portal/application')
            ->assertOk()
            ->assertJsonPath('data.application_number', $application->application_number)
            ->assertJsonMissingPath('data.decision_reason')
            ->assertJsonMissingPath('data.attachments.0.stored_path')
            ->assertJsonMissingPath('data.attachments.0.preview_url')
            ->assertJsonMissingPath('data.id');

        $auditPayload = AuditLog::query()->get()->toJson();
        $this->assertStringNotContainsString($link['token'], $auditPayload);
        $this->assertStringNotContainsString($session, $auditPayload);

        $this->postJson('/api/supplier-portal/access', ['access_token' => $link['token']])
            ->assertUnauthorized()
            ->assertJsonPath('message', 'This application access link is invalid or has already been used.');
        $this->withHeaders($this->portalHeaders($session))->getJson('/api/supplier-portal/application')
            ->assertOk()
            ->assertJsonPath('data.status', SupplierApplication::STATUS_PENDING);
    }

    public function test_cors_allows_supplier_portal_session_header(): void
    {
        $this->assertContains('X-Supplier-Portal-Session', config('cors.allowed_headers'));

        $response = $this->withHeaders([
            'Origin' => 'http://localhost:5173',
            'Access-Control-Request-Method' => 'GET',
            'Access-Control-Request-Headers' => 'X-Supplier-Portal-Session',
        ])->options('/api/supplier-portal/application');

        $response->assertNoContent()
            ->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
        $this->assertStringContainsString(
            'x-supplier-portal-session',
            strtolower((string) $response->headers->get('Access-Control-Allow-Headers')),
        );
    }

    public function test_invalid_expired_and_revoked_links_are_denied_safely(): void
    {
        $this->application();
        $this->postJson('/api/supplier-portal/access', ['access_token' => str_repeat('x', 64)])
            ->assertUnauthorized()
            ->assertJsonPath('message', 'This application access link is invalid or has already been used.')
            ->assertJsonMissingPath('application_id');

        $application = $this->application('expired');
        $link = SupplierPortalAccess::issueLink($application);
        $application->portalAccess()->update(['link_expires_at' => now()->subMinute()]);
        $this->postJson('/api/supplier-portal/access', ['access_token' => $link['token']])
            ->assertStatus(410)->assertJsonPath('message', 'This application access link has expired.');

        $application->portalAccess()->update(['link_expires_at' => now()->addDay(), 'revoked_at' => now()]);
        $this->postJson('/api/supplier-portal/access', ['access_token' => $link['token']])
            ->assertUnauthorized()
            ->assertJsonPath('message', 'This application access link is invalid or has already been used.');

        $sessionApplication = $this->application('expired-session');
        $session = $this->sessionFor($sessionApplication);
        $sessionApplication->portalAccess()->update(['session_expires_at' => now()->subMinute()]);
        $this->withHeaders($this->portalHeaders($session))
            ->getJson('/api/supplier-portal/application')
            ->assertUnauthorized()
            ->assertJsonPath('message', 'Your temporary supplier portal session has expired.');
    }

    public function test_approval_and_rejection_emails_issue_fresh_working_links(): void
    {
        $approved = $this->application('approved-email', SupplierApplication::STATUS_MEETING_COMPLETED);
        $oldApprovedLink = SupplierPortalAccess::issueLink($approved);
        $existingApprovalSession = $this->postJson('/api/supplier-portal/access', ['access_token' => $oldApprovedLink['token']])
            ->assertOk()
            ->json('session_token');

        $this->actingAs($this->admin)
            ->postJson("/api/admin/supplier-applications/{$approved->id}/approve")
            ->assertOk();
        $this->withHeaders($this->portalHeaders($existingApprovalSession))
            ->getJson('/api/supplier-portal/application')
            ->assertOk()
            ->assertJsonPath('data.status', SupplierApplication::STATUS_APPROVED);
        $approvalToken = $this->tokenFromLastPortalMail();
        $this->assertNotSame($oldApprovedLink['token'], $approvalToken);
        $approvalSession = $this->postJson('/api/supplier-portal/access', ['access_token' => $approvalToken])
            ->assertOk()
            ->json('session_token');
        $this->withHeaders($this->portalHeaders($approvalSession))
            ->getJson('/api/supplier-portal/application')
            ->assertOk()
            ->assertJsonPath('data.status', SupplierApplication::STATUS_APPROVED)
            ->assertJsonFragment(['event_type' => SupplierApplicationEvent::APPROVED]);

        Mail::fake();
        $rejected = $this->application('rejected-email', SupplierApplication::STATUS_UNDER_REVIEW);
        $oldRejectedLink = SupplierPortalAccess::issueLink($rejected);
        $this->actingAs($this->admin)
            ->postJson("/api/admin/supplier-applications/{$rejected->id}/reject", [
                'reason_codes' => ['OUTSIDE_CURRENT_REQUIREMENTS'],
                'internal_note' => 'Internal procurement reason.',
                'supplier_message' => 'This category is not currently being onboarded.',
            ])->assertOk();
        $rejectionToken = $this->tokenFromLastPortalMail();
        $this->assertNotSame($oldRejectedLink['token'], $rejectionToken);
        $rejectionSession = $this->postJson('/api/supplier-portal/access', ['access_token' => $rejectionToken])
            ->assertOk()
            ->json('session_token');
        $this->withHeaders($this->portalHeaders($rejectionSession))
            ->getJson('/api/supplier-portal/application')
            ->assertOk()
            ->assertJsonPath('data.status', SupplierApplication::STATUS_REJECTED)
            ->assertJsonPath('data.supplier_message', 'This category is not currently being onboarded.')
            ->assertJsonMissingPath('data.decision_reason')
            ->assertJsonFragment(['event_type' => SupplierApplicationEvent::REJECTED]);
    }

    public function test_first_meeting_availability_email_issues_a_fresh_working_link(): void
    {
        $application = $this->application('meeting-email', SupplierApplication::STATUS_QUALIFIED_FOR_MEETING);
        $oldLink = SupplierPortalAccess::issueLink($application);

        $slotId = $this->actingAs($this->admin)
            ->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots", [
                'slots' => $this->meetingOptions(),
            ])->assertCreated()
            ->json('data.meeting_slots.0.id');

        $meetingToken = $this->tokenFromLastPortalMail();
        $this->assertNotSame($oldLink['token'], $meetingToken);
        $meetingSession = $this->postJson('/api/supplier-portal/access', ['access_token' => $meetingToken])
            ->assertOk()
            ->json('session_token');
        $this->withHeaders($this->portalHeaders($meetingSession))
            ->getJson('/api/supplier-portal/application')
            ->assertOk()
            ->assertJsonPath('data.status', SupplierApplication::STATUS_QUALIFIED_FOR_MEETING)
            ->assertJsonPath('data.available_meeting_slots.0.id', $slotId)
            ->assertJsonFragment(['event_type' => SupplierApplicationEvent::SLOTS_AVAILABLE]);
    }

    public function test_portal_session_cannot_read_or_book_another_application(): void
    {
        $first = $this->application('first', SupplierApplication::STATUS_QUALIFIED_FOR_MEETING);
        $second = $this->application('second', SupplierApplication::STATUS_QUALIFIED_FOR_MEETING);
        $session = $this->sessionFor($first);
        $foreignSlot = $second->meetingSlots()->create([
            'scheduled_at' => now()->addDays(2), 'starts_at' => now()->addDays(2), 'ends_at' => now()->addDays(2)->addHour(),
            'status' => SupplierApplicationMeetingSlot::AVAILABLE,
            'created_by_id' => $this->admin->id,
        ]);

        $this->withHeaders($this->portalHeaders($session))
            ->postJson("/api/supplier-portal/meeting-slots/{$foreignSlot->id}/select")
            ->assertNotFound();
        $this->assertSame(SupplierApplicationMeetingSlot::AVAILABLE, $foreignSlot->fresh()->status);

        foreach (['/api/admin/supplier-applications', '/api/qa/dashboard', '/api/inventory'] as $uri) {
            $this->withHeaders($this->portalHeaders($session))->getJson($uri)->assertUnauthorized();
        }
    }

    public function test_admin_slots_are_visible_and_only_one_can_be_selected(): void
    {
        Notification::fake();
        $application = $this->application('meeting', SupplierApplication::STATUS_QUALIFIED_FOR_MEETING);
        $session = $this->sessionFor($application);
        $response = $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots", [
            'slots' => $this->meetingOptions(),
        ])->assertCreated();
        $firstId = $response->json('data.meeting_slots.0.id');
        $secondId = $response->json('data.meeting_slots.1.id');

        $this->withHeaders($this->portalHeaders($session))->getJson('/api/supplier-portal/application')
            ->assertOk()->assertJsonCount(3, 'data.available_meeting_slots');
        $this->withHeaders($this->portalHeaders($session))
            ->postJson("/api/supplier-portal/meeting-slots/{$firstId}/select")
            ->assertOk()->assertJsonPath('data.confirmed_meeting.id', $firstId);
        $this->withHeaders($this->portalHeaders($session))
            ->postJson("/api/supplier-portal/meeting-slots/{$secondId}/select")
            ->assertStatus(422);

        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('personal_access_tokens', 0);
        Mail::assertSent(SupplierApplicationPortalMail::class, 2);
        Mail::assertSent(SupplierApplicationPortalMail::class, fn (SupplierApplicationPortalMail $mail): bool => $mail->hasTo($application->email)
            && $mail->subjectLine === 'Supplier Meeting Schedule Confirmed'
            && $mail->meetingDate !== null
        );
        Notification::assertSentTo($this->admin, WorkflowNotification::class, fn (WorkflowNotification $notification): bool => $notification->title === 'Supplier Meeting Confirmed'
            && ($notification->metadata['supplier_application_id'] ?? null) === $application->id
            && ($notification->metadata['meeting_slot_id'] ?? null) === $firstId
        );
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'SUPPLIER_APPLICATION_MEETING_SELECTED',
            'resource_label' => $application->application_number,
        ]);
    }

    public function test_meeting_time_validation_and_admin_authorization_are_enforced(): void
    {
        $application = $this->application('validation', SupplierApplication::STATUS_QUALIFIED_FOR_MEETING);
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $manager = User::factory()->create(['role_id' => $managerRole->id, 'status' => 'ACTIVE']);

        $this->actingAs($manager)->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots", [
            'slots' => $this->meetingOptions(),
        ])->assertForbidden();
        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots", [
            'slots' => array_slice($this->meetingOptions(), 0, 2),
        ])->assertUnprocessable()->assertJsonValidationErrors('slots');
        $invalidEnd = $this->meetingOptions();
        $invalidEnd[0]['end_time'] = '13:00';
        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots", [
            'slots' => $invalidEnd,
        ])->assertUnprocessable();

        $slotId = $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots", [
            'slots' => $this->meetingOptions(),
        ])->assertCreated()->json('data.meeting_slots.0.id');

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'SUPPLIER_APPLICATION_MEETING_OPTIONS_PUBLISHED',
            'resource_label' => $application->application_number,
        ]);
        $this->assertDatabaseHas('supplier_application_meeting_slots', [
            'id' => $slotId,
            'status' => SupplierApplicationMeetingSlot::AVAILABLE,
        ]);
    }

    public function test_future_meeting_cannot_be_completed(): void
    {
        $application = $this->application('future-completion', SupplierApplication::STATUS_MEETING_SCHEDULED);
        $startsAt = now()->addDay();
        $slot = $application->meetingSlots()->create([
            'scheduled_at' => $startsAt,
            'starts_at' => $startsAt,
            'ends_at' => $startsAt->copy()->addHour(),
            'status' => SupplierApplicationMeetingSlot::RESERVED,
            'created_by_id' => $this->admin->id,
            'selected_at' => now(),
        ]);

        $this->assertTrue($slot->fresh()->starts_at->isFuture());

        $this->actingAs($this->admin)
            ->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots/{$slot->id}/complete", [
                'evaluation_notes' => 'This must not be recorded before the meeting starts.',
                'overall_assessment' => 'RECOMMEND_APPROVAL',
            ])->assertUnprocessable()
            ->assertJsonPath('message', 'A meeting cannot be marked completed before its scheduled end time.');

        $this->assertSame(SupplierApplication::STATUS_MEETING_SCHEDULED, $application->fresh()->status);
        $this->assertSame(SupplierApplicationMeetingSlot::RESERVED, $slot->fresh()->status);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'SUPPLIER_APPLICATION_MEETING_COMPLETED']);
    }

    public function test_meeting_completion_preserves_portal_access_for_final_decision(): void
    {
        $application = $this->application('complete', SupplierApplication::STATUS_MEETING_SCHEDULED);
        $session = $this->sessionFor($application);
        $slot = $application->meetingSlots()->create([
            'scheduled_at' => now()->subHour(), 'starts_at' => now()->subHour(), 'ends_at' => now()->subMinutes(5),
            'status' => SupplierApplicationMeetingSlot::RESERVED,
            'created_by_id' => $this->admin->id, 'selected_at' => now(),
        ]);

        $this->actingAs($this->admin)
            ->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots/{$slot->id}/complete", [
                'evaluation_notes' => 'Delivery capability and product quality were reviewed.',
                'overall_assessment' => 'RECOMMEND_APPROVAL',
            ])
            ->assertOk();
        $this->actingAs($this->admin)
            ->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots", [
                'starts_at' => now()->addDays(4)->toISOString(),
                'ends_at' => now()->addDays(4)->addHour()->toISOString(),
            ])->assertStatus(422);
        $this->withHeaders($this->portalHeaders($session))->getJson('/api/supplier-portal/application')
            ->assertOk()->assertJsonPath('data.status', SupplierApplication::STATUS_MEETING_COMPLETED);
        $this->assertDatabaseMissing('supplier_application_events', [
            'supplier_application_id' => $application->id, 'event_type' => SupplierApplicationEvent::PROCESS_COMPLETED,
        ]);
        $this->assertDatabaseHas('supplier_application_meeting_slots', [
            'id' => $slot->id, 'status' => SupplierApplicationMeetingSlot::COMPLETED,
            'evaluation_notes' => 'Delivery capability and product quality were reviewed.',
        ]);
        $this->assertDatabaseHas('supplier_applications', ['id' => $application->id, 'status' => SupplierApplication::STATUS_MEETING_COMPLETED]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'SUPPLIER_APPLICATION_MEETING_COMPLETED',
            'resource_label' => $application->application_number,
        ]);
    }

    public function test_revision_reuses_application_and_preserves_attachment_history(): void
    {
        Storage::fake('local');
        Notification::fake();
        $application = $this->application('revision', SupplierApplication::STATUS_UNDER_REVIEW);
        $oldPath = "supplier-applications/{$application->id}/old-permit.pdf";
        Storage::disk('local')->put($oldPath, 'old permit');
        $application->attachments()->create([
            'attachment_type' => 'BUSINESS_PERMIT',
            'original_name' => 'old-permit.pdf',
            'stored_path' => $oldPath,
            'mime_type' => 'application/pdf',
            'file_size' => 10,
            'file_sha256' => hash('sha256', 'old permit'),
            'is_current' => true,
        ]);
        $session = $this->sessionFor($application);

        $this->actingAs($this->admin)
            ->postJson("/api/admin/supplier-applications/{$application->id}/revision", [
                'reason_codes' => ['BUSINESS_PERMIT'],
                'supplier_message' => 'Please replace the expired business permit.',
                'internal_note' => 'Expiry was confirmed during document review.',
            ])->assertOk()->assertJsonPath('data.status', SupplierApplication::STATUS_NEEDS_REVISION);

        $this->withHeaders($this->portalHeaders($session))
            ->getJson('/api/supplier-portal/application')
            ->assertOk()
            ->assertJsonPath('data.revision_reason_codes.0', 'BUSINESS_PERMIT')
            ->assertJsonMissingPath('data.decision_reason');

        $this->withHeaders($this->portalHeaders($session))
            ->post('/api/supplier-portal/resubmit', [
                'business_permit' => [UploadedFile::fake()->create('renewed-permit.pdf', 20, 'application/pdf')],
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.status', SupplierApplication::STATUS_UNDER_REVIEW);

        $this->assertDatabaseCount('supplier_applications', 1);
        $this->assertDatabaseHas('supplier_application_attachments', [
            'supplier_application_id' => $application->id,
            'stored_path' => $oldPath,
            'is_current' => false,
        ]);
        $this->assertDatabaseHas('supplier_application_events', [
            'supplier_application_id' => $application->id,
            'event_type' => SupplierApplicationEvent::CORRECTIONS_SUBMITTED,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'SUPPLIER_APPLICATION_CORRECTIONS_SUBMITTED',
            'resource_label' => $application->application_number,
        ]);
        Notification::assertSentTo($this->admin, WorkflowNotification::class, fn (WorkflowNotification $notification): bool => $notification->title === 'Supplier Corrections Resubmitted'
        );
    }

    public function test_supplier_can_request_another_schedule_without_rejection(): void
    {
        Notification::fake();
        $application = $this->application('alternative', SupplierApplication::STATUS_QUALIFIED_FOR_MEETING);
        $session = $this->sessionFor($application);

        $this->withHeaders($this->portalHeaders($session))
            ->postJson('/api/supplier-portal/request-another-schedule', [
                'message' => 'Weekday mornings work best for our team.',
            ])->assertOk()
            ->assertJsonPath('data.status', SupplierApplication::STATUS_QUALIFIED_FOR_MEETING)
            ->assertJsonPath('data.alternative_schedule_requested', true);

        $this->assertDatabaseHas('supplier_application_events', [
            'supplier_application_id' => $application->id,
            'event_type' => SupplierApplicationEvent::ALTERNATIVE_SCHEDULE_REQUESTED,
        ]);
        $this->assertDatabaseMissing('supplier_applications', [
            'id' => $application->id,
            'status' => SupplierApplication::STATUS_REJECTED,
        ]);
        Notification::assertSentTo($this->admin, WorkflowNotification::class, fn (WorkflowNotification $notification): bool => $notification->title === 'Supplier Requested Another Meeting Schedule'
        );
        $this->withHeaders($this->portalHeaders($session))
            ->postJson('/api/supplier-portal/request-another-schedule', ['message' => 'Duplicate request'])
            ->assertUnprocessable();
    }

    public function test_portal_access_verification_is_rate_limited(): void
    {
        for ($attempt = 1; $attempt <= 10; $attempt++) {
            $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.55'])
                ->postJson('/api/supplier-portal/access', ['access_token' => str_pad((string) $attempt, 64, 'x')])
                ->assertUnauthorized();
        }

        $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.55'])
            ->postJson('/api/supplier-portal/access', ['access_token' => str_repeat('z', 64)])
            ->assertTooManyRequests();
    }
}
