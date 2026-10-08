<?php

namespace Tests\Feature;

use App\Mail\SupplierApplicationPortalMail;
use App\Models\Role;
use App\Models\SupplierApplication;
use App\Models\SupplierApplicationEvent;
use App\Models\SupplierApplicationMeetingSlot;
use App\Models\User;
use App\Notifications\WorkflowNotification;
use App\Support\SupplierPortalAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SupplierMeetingSchedulingTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Mail::fake();
        Notification::fake();
        // Reproduce the production database session (+08) that exposed the 8-hour shift.
        DB::statement("SET TIME ZONE 'Asia/Kuala_Lumpur'");
        $role = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->admin = User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE']);
    }

    private function application(string $status = SupplierApplication::STATUS_UNDER_REVIEW): SupplierApplication
    {
        $application = SupplierApplication::create([
            'application_number' => 'SUP-APP-2026-MEET', 'company_name' => 'Novtech', 'normalized_company_name' => 'novtech',
            'address' => '1 Meeting Road', 'contact_person' => 'Nova Contact',
            'email' => 'sales@novtech.test', 'normalized_email' => 'sales@novtech.test', 'phone' => '639170000000',
            'business_type' => 'Corporation', 'supply_category' => 'Chemicals', 'status' => $status, 'submitted_at' => now(),
        ]);
        $application->events()->create([
            'event_type' => SupplierApplicationEvent::SUBMITTED, 'title' => 'Application Submitted',
            'description' => 'Received.', 'occurred_at' => now(),
        ]);

        return $application;
    }

    private function portalSession(SupplierApplication $application): array
    {
        $link = SupplierPortalAccess::issueLink($application);
        $token = $this->postJson('/api/supplier-portal/access', ['access_token' => $link['token']])->assertOk()->json('session_token');

        return ['X-Supplier-Portal-Session' => $token];
    }

    private function slots(array $dates, string $start = '15:00', string $end = '16:00'): array
    {
        return array_map(fn (string $date) => ['date' => $date, 'start_time' => $start, 'end_time' => $end], $dates);
    }

    private function futureDates(int $count = 3, int $offset = 2): array
    {
        $first = now('Asia/Manila')->addDays($offset);

        return array_map(fn (int $index) => $first->copy()->addDays($index)->format('Y-m-d'), range(0, $count - 1));
    }

    private static function manilaClock(string $iso): string
    {
        return Carbon::parse($iso)->setTimezone('Asia/Manila')->format('Y-m-d g:i A');
    }

    // TEST 4 + TEST 6 + TEST 7 + TEST 8
    public function test_admin_entered_manila_time_round_trips_to_admin_portal_and_email(): void
    {
        $application = $this->application();
        [$first] = $dates = $this->futureDates();

        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots", [
            'slots' => $this->slots($dates),
        ])->assertCreated();

        // Stored instant is 15:00 Manila (07:00 UTC), independent of the DB session timezone.
        $stored = DB::selectOne(
            "select to_char(starts_at at time zone 'Asia/Manila', 'HH24:MI') s, to_char(ends_at at time zone 'Asia/Manila', 'HH24:MI') e from supplier_application_meeting_slots order by starts_at limit 1",
        );
        $this->assertSame(['15:00', '16:00'], [$stored->s, $stored->e]);

        $admin = $this->getJson("/api/admin/supplier-applications/{$application->id}")->assertOk()
            ->assertJsonPath('data.status', SupplierApplication::STATUS_QUALIFIED_FOR_MEETING);
        $this->assertSame("{$first} 3:00 PM", self::manilaClock($admin->json('data.meeting_slots.0.starts_at')));
        $this->assertSame("{$first} 4:00 PM", self::manilaClock($admin->json('data.meeting_slots.0.ends_at')));

        $portal = $this->withHeaders($this->portalSession($application))->getJson('/api/supplier-portal/application')->assertOk()
            ->assertJsonCount(3, 'data.available_meeting_slots');
        $this->assertSame("{$first} 3:00 PM", self::manilaClock($portal->json('data.available_meeting_slots.0.starts_at')));
        $this->assertSame("{$first} 4:00 PM", self::manilaClock($portal->json('data.available_meeting_slots.0.ends_at')));

        Mail::assertSent(SupplierApplicationPortalMail::class, fn (SupplierApplicationPortalMail $mail) => $mail->subjectLine === 'Supplier Application - Select Your Meeting Schedule'
            && count($mail->meetingOptions) === 3
            && collect($mail->meetingOptions)->every(fn (string $option) => str_contains($option, '3:00 PM – 4:00 PM (Asia/Manila)')));
    }

    // TEST 5
    public function test_duplicate_calendar_dates_are_rejected_even_with_different_times(): void
    {
        $application = $this->application();
        [$first, $second] = $this->futureDates(2);

        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots", ['slots' => [
            ['date' => $first, 'start_time' => '08:00', 'end_time' => '09:00'],
            ['date' => $first, 'start_time' => '15:00', 'end_time' => '16:00'],
            ['date' => $second, 'start_time' => '08:00', 'end_time' => '09:00'],
        ]])->assertUnprocessable()->assertJsonPath('errors.slots.0', 'Each meeting option must use a different date.');

        $this->assertDatabaseCount('supplier_application_meeting_slots', 0);
        $this->assertSame(SupplierApplication::STATUS_UNDER_REVIEW, $application->fresh()->status);
        Mail::assertNothingSent();
    }

    public function test_fewer_than_three_options_or_invalid_ranges_are_rejected(): void
    {
        $application = $this->application();
        $dates = $this->futureDates();
        $url = "/api/admin/supplier-applications/{$application->id}/meeting-slots";

        $this->actingAs($this->admin)->postJson($url, ['slots' => $this->slots(array_slice($dates, 0, 2))])->assertUnprocessable();
        $this->postJson($url, ['slots' => $this->slots($dates, '16:00', '15:00')])->assertUnprocessable();
        $this->postJson($url, ['slots' => $this->slots([now('Asia/Manila')->subDay()->format('Y-m-d'), ...array_slice($dates, 0, 2)])])->assertUnprocessable();
        $this->assertDatabaseCount('supplier_application_meeting_slots', 0);
    }

    // TEST 9 + TEST 10 + TEST 11 + TEST 12
    public function test_supplier_confirmation_moves_application_to_meeting_scheduled_with_consistent_times(): void
    {
        $application = $this->application();
        $dates = $this->futureDates();
        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots", [
            'slots' => [['date' => $dates[0], 'start_time' => '15:00', 'end_time' => '16:00'],
                ['date' => $dates[1], 'start_time' => '08:00', 'end_time' => '10:00'],
                ['date' => $dates[2], 'start_time' => '15:00', 'end_time' => '16:00']],
        ])->assertCreated();
        $selected = SupplierApplicationMeetingSlot::query()->orderBy('starts_at')->get()[1];
        $headers = $this->portalSession($application);
        $this->app['auth']->forgetGuards();

        $this->withHeaders($headers)->postJson("/api/supplier-portal/meeting-slots/{$selected->id}/select")->assertOk()
            ->assertJsonPath('data.status', SupplierApplication::STATUS_MEETING_SCHEDULED)
            ->assertJsonPath('data.confirmed_meeting.id', $selected->id)
            ->assertJsonPath('data.available_meeting_slots', []);

        $this->assertSame(SupplierApplication::STATUS_MEETING_SCHEDULED, $application->fresh()->status);
        $this->assertSame(SupplierApplicationMeetingSlot::RESERVED, $selected->fresh()->status);
        $this->assertNotNull($selected->fresh()->selected_at);
        $this->assertSame(2, SupplierApplicationMeetingSlot::query()->where('status', SupplierApplicationMeetingSlot::CANCELLED)->count());
        $this->assertDatabaseHas('supplier_application_events', ['supplier_application_id' => $application->id, 'event_type' => SupplierApplicationEvent::MEETING_SELECTED]);

        $expected = Carbon::parse($dates[1], 'Asia/Manila')->format('F j, Y').', 8:00 AM – 10:00 AM';
        Notification::assertSentTo($this->admin, WorkflowNotification::class, fn (WorkflowNotification $notification) => $notification->title === 'Supplier Meeting Confirmed'
            && str_contains($notification->message, "Novtech selected {$expected}"));
        Mail::assertSent(SupplierApplicationPortalMail::class, fn (SupplierApplicationPortalMail $mail) => $mail->subjectLine === 'Supplier Meeting Schedule Confirmed'
            && $mail->meetingDate === "{$expected} (Asia/Manila)");

        // Admin reopening the application sees the backend status and the exact selected slot.
        $admin = $this->actingAs($this->admin)->getJson("/api/admin/supplier-applications/{$application->id}")->assertOk()
            ->assertJsonPath('data.status', SupplierApplication::STATUS_MEETING_SCHEDULED);
        $reserved = collect($admin->json('data.meeting_slots'))->firstWhere('status', 'RESERVED');
        $this->assertSame("{$dates[1]} 8:00 AM", self::manilaClock($reserved['starts_at']));
        $this->assertSame("{$dates[1]} 10:00 AM", self::manilaClock($reserved['ends_at']));
        $this->assertNotNull($reserved['selected_at']);

        // No second selection after confirmation.
        $other = SupplierApplicationMeetingSlot::query()->where('status', SupplierApplicationMeetingSlot::CANCELLED)->first();
        $this->app['auth']->forgetGuards();
        $this->withHeaders($headers)->postJson("/api/supplier-portal/meeting-slots/{$other->id}/select")->assertStatus(422);
        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots", [
            'slots' => $this->slots($this->futureDates(3, 6)),
        ])->assertUnprocessable();
    }

    // TEST 13
    public function test_alternative_request_keeps_scheduling_step_and_allows_new_options(): void
    {
        $application = $this->application();
        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots", [
            'slots' => $this->slots($this->futureDates()),
        ])->assertCreated();
        $headers = $this->portalSession($application);
        $this->app['auth']->forgetGuards();

        $this->withHeaders($headers)->postJson('/api/supplier-portal/request-another-schedule', ['message' => 'Mornings next week work better.'])
            ->assertOk()->assertJsonPath('data.status', SupplierApplication::STATUS_QUALIFIED_FOR_MEETING);
        Notification::assertSentTo($this->admin, WorkflowNotification::class, fn (WorkflowNotification $notification) => $notification->title === 'Supplier Requested Another Meeting Schedule');
        $this->assertNotNull($application->fresh()->alternative_schedule_requested_at);

        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots", [
            'slots' => $this->slots($this->futureDates(3, 8), '09:00', '10:00'),
        ])->assertCreated();
        $fresh = $application->fresh();
        $this->assertSame(SupplierApplication::STATUS_QUALIFIED_FOR_MEETING, $fresh->status);
        $this->assertNull($fresh->alternative_schedule_requested_at);
        $this->assertSame(3, $fresh->meetingSlots()->where('status', SupplierApplicationMeetingSlot::AVAILABLE)->count());
        $this->assertSame(3, $fresh->meetingSlots()->where('status', SupplierApplicationMeetingSlot::CANCELLED)->count());
    }

    // TEST 14 + TEST 15
    public function test_meeting_completion_then_final_approval_creates_exactly_one_supplier(): void
    {
        $application = $this->application();
        $dates = $this->futureDates();
        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots", ['slots' => $this->slots($dates)])->assertCreated();
        $slot = SupplierApplicationMeetingSlot::query()->orderBy('starts_at')->first();
        $headers = $this->portalSession($application);
        $this->app['auth']->forgetGuards();
        $this->withHeaders($headers)->postJson("/api/supplier-portal/meeting-slots/{$slot->id}/select")->assertOk();

        $this->travelTo(Carbon::parse("{$dates[0]} 16:30", 'Asia/Manila'));
        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/meeting-slots/{$slot->id}/complete", [
            'evaluation_notes' => 'Capabilities confirmed.',
            'overall_assessment' => 'RECOMMEND_APPROVAL',
        ])->assertOk();
        $this->assertSame(SupplierApplication::STATUS_MEETING_COMPLETED, $application->fresh()->status);
        $this->assertDatabaseCount('suppliers', 0);

        $this->postJson("/api/admin/supplier-applications/{$application->id}/approve")->assertOk();
        $this->postJson("/api/admin/supplier-applications/{$application->id}/approve")->assertOk();
        $this->assertDatabaseCount('suppliers', 1);
    }
    /** A confirmed meeting on Oct 12, 2026 8:30–10:50 AM Asia/Manila. */
    private function scheduledMeeting(): array
    {
        $application = $this->application(SupplierApplication::STATUS_MEETING_SCHEDULED);
        $slot = $application->meetingSlots()->create([
            'scheduled_at' => Carbon::parse('2026-10-12 08:30', 'Asia/Manila'), 'starts_at' => Carbon::parse('2026-10-12 08:30', 'Asia/Manila'),
            'ends_at' => Carbon::parse('2026-10-12 10:50', 'Asia/Manila'), 'status' => SupplierApplicationMeetingSlot::RESERVED,
            'created_by_id' => $this->admin->id, 'selected_at' => Carbon::parse('2026-10-08 10:00', 'Asia/Manila'),
        ]);

        return [$application, $slot, "/api/admin/supplier-applications/{$application->id}/meeting-slots/{$slot->id}/complete"];
    }

    // Evaluation TEST 1 + 4 + 5: completion availability follows the Asia/Manila end time.
    public function test_completion_is_rejected_before_the_manila_end_time_and_allowed_at_it(): void
    {
        [$application, $slot, $url] = $this->scheduledMeeting();
        $payload = ['overall_assessment' => 'RECOMMEND_APPROVAL'];

        $this->travelTo(Carbon::parse('2026-10-12 09:00', 'Asia/Manila'));
        $this->actingAs($this->admin)->postJson($url, $payload)->assertUnprocessable()
            ->assertJsonPath('message', 'A meeting cannot be marked completed before its scheduled end time.');
        $this->travelTo(Carbon::parse('2026-10-12 10:49:59', 'Asia/Manila'));
        $this->postJson($url, $payload)->assertUnprocessable();
        $this->assertSame(SupplierApplication::STATUS_MEETING_SCHEDULED, $application->fresh()->status);

        // Admin sees the same end time used for the rule (10:50 AM Manila, no 8-hour shift).
        $ends = $this->getJson("/api/admin/supplier-applications/{$application->id}")->json('data.meeting_slots.0.ends_at');
        $this->assertSame('2026-10-12 10:50 AM', Carbon::parse($ends)->setTimezone('Asia/Manila')->format('Y-m-d h:i A'));

        $this->travelTo(Carbon::parse('2026-10-12 10:50', 'Asia/Manila'));
        $this->postJson($url, $payload)->assertOk();
        $this->assertSame(SupplierApplication::STATUS_MEETING_COMPLETED, $application->fresh()->status);
        $this->assertSame(SupplierApplicationMeetingSlot::COMPLETED, $slot->fresh()->status);
    }

    // Evaluation TEST 6
    public function test_overall_assessment_is_required_and_must_be_a_known_code(): void
    {
        [$application, , $url] = $this->scheduledMeeting();
        $this->travelTo(Carbon::parse('2026-10-12 11:00', 'Asia/Manila'));

        $this->actingAs($this->admin)->postJson($url, ['evaluation_notes' => 'Notes only.'])->assertUnprocessable()
            ->assertJsonPath('errors.overall_assessment.0', 'Select an overall assessment before completing the meeting.');
        $this->postJson($url, ['overall_assessment' => 'APPROVED'])->assertUnprocessable()->assertJsonValidationErrors('overall_assessment');
        $this->postJson($url, ['overall_assessment' => 'RECOMMEND_APPROVAL', 'requirements_discussed' => 'maybe'])->assertUnprocessable()->assertJsonValidationErrors('requirements_discussed');
        $this->assertSame(SupplierApplication::STATUS_MEETING_SCHEDULED, $application->fresh()->status);
    }

    // Evaluation TEST 7 + 8 + 10 + 11: partial checklist persists; assessment is not a decision.
    public function test_structured_evaluation_persists_without_deciding_the_application(): void
    {
        [$application, $slot, $url] = $this->scheduledMeeting();
        $this->travelTo(Carbon::parse('2026-10-12 11:00', 'Asia/Manila'));

        $this->actingAs($this->admin)->postJson($url, [
            'requirements_discussed' => true, 'product_capability_verified' => true,
            'delivery_capability_verified' => false, 'compliance_requirements_discussed' => true,
            'overall_assessment' => 'NEEDS_FURTHER_REVIEW',
            'evaluation_notes' => 'Delivery capability requires additional verification.',
        ])->assertOk();

        $this->getJson("/api/admin/supplier-applications/{$application->id}")->assertOk()
            ->assertJsonPath('data.status', SupplierApplication::STATUS_MEETING_COMPLETED)
            ->assertJsonPath('data.meeting_slots.0.evaluation', [
                'requirements_discussed' => true, 'product_capability_verified' => true,
                'delivery_capability_verified' => false, 'compliance_requirements_discussed' => true,
                'overall_assessment' => 'NEEDS_FURTHER_REVIEW',
            ])
            ->assertJsonPath('data.meeting_slots.0.evaluation_notes', 'Delivery capability requires additional verification.')
            ->assertJsonPath('data.meeting_slots.0.completed_by_id', $this->admin->id);
        $this->assertNotNull($slot->fresh()->completed_at);
        $this->assertDatabaseCount('suppliers', 0);

        // Admin-only: the supplier portal never sees the evaluation.
        $this->app['auth']->forgetGuards();
        $portal = $this->withHeaders($this->portalSession($application))->getJson('/api/supplier-portal/application')->assertOk();
        $this->assertStringNotContainsString('NEEDS_FURTHER_REVIEW', $portal->getContent());
        $this->assertStringNotContainsString('additional verification', $portal->getContent());
    }

    public function test_recommend_rejection_assessment_does_not_reject_the_application(): void
    {
        [$application, , $url] = $this->scheduledMeeting();
        $this->travelTo(Carbon::parse('2026-10-12 11:00', 'Asia/Manila'));

        $this->actingAs($this->admin)->postJson($url, ['overall_assessment' => 'RECOMMEND_REJECTION'])->assertOk();
        $this->assertSame(SupplierApplication::STATUS_MEETING_COMPLETED, $application->fresh()->status);
        $this->assertDatabaseCount('suppliers', 0);
    }

    // Evaluation TEST 9
    public function test_legacy_free_text_evaluation_still_loads(): void
    {
        $application = $this->application(SupplierApplication::STATUS_MEETING_COMPLETED);
        $application->meetingSlots()->create([
            'scheduled_at' => now()->subDay(), 'starts_at' => now()->subDay(), 'ends_at' => now()->subDay()->addHour(),
            'status' => SupplierApplicationMeetingSlot::COMPLETED, 'completed_at' => now()->subDay(),
            'evaluation_notes' => 'Requirements are ready. Good luck, see you soon',
        ]);

        $this->actingAs($this->admin)->getJson("/api/admin/supplier-applications/{$application->id}")->assertOk()
            ->assertJsonPath('data.meeting_slots.0.evaluation', null)
            ->assertJsonPath('data.meeting_slots.0.evaluation_notes', 'Requirements are ready. Good luck, see you soon');
    }
}
