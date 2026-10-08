<?php

namespace Tests\Feature;

use App\Models\SupplierApplication;
use App\Models\SupplierApplicationMeetingSlot;
use App\Models\SupplierApplicationEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class RepairPreFixMeetingSlotTimesTest extends TestCase
{
    use RefreshDatabase;

    private const FIXED_AT = '2026-10-08T07:30:00+00:00';

    private int $sequence = 0;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        Notification::fake();
        // The +08 session timezone under which the pre-fix writes were made.
        DB::statement("SET TIME ZONE 'Asia/Kuala_Lumpur'");
        $this->travelTo(Carbon::parse('2026-10-08 12:00:00', 'UTC'));
    }

    private function application(string $status): SupplierApplication
    {
        $this->sequence++;
        $application = SupplierApplication::create([
            'application_number' => "SUP-APP-REPAIR-{$this->sequence}", 'company_name' => "Repair {$this->sequence}",
            'normalized_company_name' => "repair {$this->sequence}", 'address' => '1 Road', 'contact_person' => 'Contact',
            'email' => "repair{$this->sequence}@example.test", 'normalized_email' => "repair{$this->sequence}@example.test",
            'phone' => '639170000000', 'business_type' => 'Corporation', 'supply_category' => 'Chemicals',
            'status' => $status, 'submitted_at' => now()->subDays(3),
        ]);
        $application->events()->create(['event_type' => SupplierApplicationEvent::SUBMITTED, 'title' => 'Submitted', 'description' => 'Received.', 'occurred_at' => now()->subDays(3)]);

        return $application;
    }

    /** Reproduces the old write: a UTC literal without offset, read by PostgreSQL as +08. */
    private function preFixSlot(SupplierApplication $application, string $status, string $intendedUtcStart, int $hours = 1): int
    {
        $start = Carbon::parse($intendedUtcStart, 'UTC');

        return DB::table('supplier_application_meeting_slots')->insertGetId([
            'supplier_application_id' => $application->id, 'status' => $status,
            'scheduled_at' => $start->format('Y-m-d H:i:s'), 'starts_at' => $start->format('Y-m-d H:i:s'),
            'ends_at' => $start->copy()->addHours($hours)->format('Y-m-d H:i:s'),
            'selected_at' => $status === 'RESERVED' ? '2026-10-07 09:00:00' : null,
            'created_at' => '2026-10-07 08:00:00', 'updated_at' => '2026-10-07 08:00:00',
        ]);
    }

    private function audit(string $action, array $metadata, string $createdAt): void
    {
        DB::table('audit_logs')->insert([
            'action' => $action, 'module' => 'Supplier Management', 'status' => 'SUCCESS',
            'metadata' => json_encode($metadata), 'created_at' => $createdAt,
        ]);
    }

    private function manila(int $slotId): array
    {
        $slot = SupplierApplicationMeetingSlot::query()->findOrFail($slotId);

        return [$slot->status, $slot->starts_at->copy()->setTimezone('Asia/Manila')->format('Y-m-d H:i'), $slot->ends_at->copy()->setTimezone('Asia/Manila')->format('Y-m-d H:i')];
    }

    private function snapshot(): array
    {
        return collect(['supplier_application_meeting_slots', 'supplier_applications', 'supplier_application_events', 'audit_logs'])
            ->mapWithKeys(fn (string $table) => [$table => DB::table($table)->orderBy('id')->get()->map(fn ($row) => (array) $row)->all()])->all();
    }

    /** Pre-fix: AVAILABLE + CANCELLED (publish audit only) and RESERVED (creation audit with intended times). */
    private function scenario(): array
    {
        $scheduled = $this->application(SupplierApplication::STATUS_MEETING_SCHEDULED);
        $reserved = $this->preFixSlot($scheduled, 'RESERVED', '2026-10-10 00:00', 2);
        $this->audit('SUPPLIER_APPLICATION_MEETING_SLOT_CREATED', ['meeting_slot_id' => $reserved, 'starts_at' => '2026-10-10T00:00:00.000000Z', 'ends_at' => '2026-10-10T02:00:00.000000Z'], '2026-10-07 08:00:00');
        $cancelled = $this->preFixSlot($scheduled, 'CANCELLED', '2026-10-09 07:00');
        $this->audit('SUPPLIER_APPLICATION_MEETING_OPTIONS_PUBLISHED', ['meeting_slot_ids' => [$cancelled]], '2026-10-07 08:00:00');

        $qualified = $this->application(SupplierApplication::STATUS_QUALIFIED_FOR_MEETING);
        $available = $this->preFixSlot($qualified, 'AVAILABLE', '2026-10-12 07:00');
        $this->audit('SUPPLIER_APPLICATION_MEETING_OPTIONS_PUBLISHED', ['meeting_slot_ids' => [$available]], '2026-10-08 07:18:05');

        // Post-fix write through the model (explicit offset): already correct.
        $postFix = $this->application(SupplierApplication::STATUS_QUALIFIED_FOR_MEETING);
        $correct = $postFix->meetingSlots()->create([
            'scheduled_at' => Carbon::parse('2026-10-13 15:00', 'Asia/Manila'), 'starts_at' => Carbon::parse('2026-10-13 15:00', 'Asia/Manila'),
            'ends_at' => Carbon::parse('2026-10-13 16:00', 'Asia/Manila'), 'status' => 'AVAILABLE',
        ])->id;
        $this->audit('SUPPLIER_APPLICATION_MEETING_OPTIONS_PUBLISHED', ['meeting_slot_ids' => [$correct]], '2026-10-08 09:00:00');

        return compact('scheduled', 'qualified', 'reserved', 'cancelled', 'available', 'correct');
    }

    public function test_dry_run_reports_affected_rows_and_writes_nothing(): void
    {
        $ids = $this->scenario();
        $before = $this->snapshot();

        $this->artisan('supplier-meetings:repair-pre-fix-times', ['--dry-run' => true, '--fixed-at' => self::FIXED_AT])
            ->expectsOutputToContain('DRY RUN')
            // One expectation per table row: the RESERVED row's proposed time, then the AVAILABLE row's application.
            ->expectsOutputToContain('Oct 10, 2026 8:00 AM')
            ->expectsOutputToContain($ids['qualified']->application_number)
            ->expectsOutputToContain('3 of 4 slot(s) would be corrected.')
            ->assertSuccessful();

        $this->assertSame($before, $this->snapshot());
        $this->assertSame(['RESERVED', '2026-10-10 00:00', '2026-10-10 02:00'], $this->manila($ids['reserved']));
    }

    public function test_repairs_available_reserved_and_cancelled_slots_without_touching_workflow(): void
    {
        $ids = $this->scenario();
        $selectedAt = DB::table('supplier_application_meeting_slots')->where('id', $ids['reserved'])->value('selected_at');
        $eventCount = DB::table('supplier_application_events')->count();

        $this->artisan('supplier-meetings:repair-pre-fix-times', ['--fixed-at' => self::FIXED_AT])
            ->expectsConfirmation('Apply these corrections?', 'yes')
            ->expectsOutputToContain('Corrected 3 slot(s).')
            ->assertSuccessful();

        $this->assertSame(['RESERVED', '2026-10-10 08:00', '2026-10-10 10:00'], $this->manila($ids['reserved']));
        $this->assertSame(['CANCELLED', '2026-10-09 15:00', '2026-10-09 16:00'], $this->manila($ids['cancelled']));
        $this->assertSame(['AVAILABLE', '2026-10-12 15:00', '2026-10-12 16:00'], $this->manila($ids['available']));
        $this->assertSame(['AVAILABLE', '2026-10-13 15:00', '2026-10-13 16:00'], $this->manila($ids['correct']));

        $this->assertSame($selectedAt, DB::table('supplier_application_meeting_slots')->where('id', $ids['reserved'])->value('selected_at'));
        $this->assertSame(SupplierApplication::STATUS_MEETING_SCHEDULED, $ids['scheduled']->fresh()->status);
        $this->assertSame(SupplierApplication::STATUS_QUALIFIED_FOR_MEETING, $ids['qualified']->fresh()->status);
        $this->assertSame($eventCount, DB::table('supplier_application_events')->count());
        $this->assertSame(2, DB::table('audit_logs')->where('action', 'SUPPLIER_MEETING_SLOT_TIMES_REPAIRED')->count());
        Mail::assertNothingSent();
        Notification::assertNothingSent();
    }

    public function test_rerun_is_idempotent(): void
    {
        $ids = $this->scenario();
        $this->artisan('supplier-meetings:repair-pre-fix-times', ['--fixed-at' => self::FIXED_AT])
            ->expectsConfirmation('Apply these corrections?', 'yes')->assertSuccessful();
        $after = $this->snapshot();

        $this->artisan('supplier-meetings:repair-pre-fix-times', ['--fixed-at' => self::FIXED_AT])
            ->expectsOutputToContain('0 of 4 slot(s) will be corrected.')
            ->assertSuccessful();

        $this->assertSame($after, $this->snapshot());
        $this->assertSame(['AVAILABLE', '2026-10-12 15:00', '2026-10-12 16:00'], $this->manila($ids['available']));
    }

    public function test_slots_without_proof_of_a_pre_fix_shift_are_left_alone(): void
    {
        $application = $this->application(SupplierApplication::STATUS_QUALIFIED_FOR_MEETING);
        // Creation audit matches the stored instant: not shifted.
        $matching = $application->meetingSlots()->create(['scheduled_at' => Carbon::parse('2026-10-14 07:00', 'UTC'), 'starts_at' => Carbon::parse('2026-10-14 07:00', 'UTC'), 'ends_at' => Carbon::parse('2026-10-14 08:00', 'UTC'), 'status' => 'AVAILABLE'])->id;
        $this->audit('SUPPLIER_APPLICATION_MEETING_SLOT_CREATED', ['meeting_slot_id' => $matching, 'starts_at' => '2026-10-14T07:00:00.000000Z'], '2026-10-07 08:00:00');
        // Differs by something other than the session offset.
        $odd = $this->preFixSlot($application, 'AVAILABLE', '2026-10-15 07:00');
        $this->audit('SUPPLIER_APPLICATION_MEETING_SLOT_CREATED', ['meeting_slot_id' => $odd, 'starts_at' => '2026-10-15T03:00:00.000000Z'], '2026-10-07 08:00:00');
        // No audit at all.
        $this->preFixSlot($application, 'AVAILABLE', '2026-10-16 07:00');
        // Pre-fix creation but republished after the fix (times rewritten correctly).
        $republished = $this->preFixSlot($application, 'AVAILABLE', '2026-10-17 07:00');
        $this->audit('SUPPLIER_APPLICATION_MEETING_OPTIONS_PUBLISHED', ['meeting_slot_ids' => [$republished]], '2026-10-07 08:00:00');
        $this->audit('SUPPLIER_APPLICATION_MEETING_OPTIONS_PUBLISHED', ['meeting_slot_ids' => [$republished]], '2026-10-08 10:00:00');
        $before = $this->snapshot();

        $this->artisan('supplier-meetings:repair-pre-fix-times', ['--fixed-at' => self::FIXED_AT])
            ->expectsOutputToContain('matches recorded time')
            ->expectsOutputToContain('unexpected amount')
            ->expectsOutputToContain('no audit evidence')
            ->expectsOutputToContain('written after fix')
            ->expectsOutputToContain('0 of 4 slot(s) will be corrected.')
            ->assertSuccessful();

        $this->assertSame($before, $this->snapshot());
    }

    public function test_requires_fixed_at_and_explicit_confirmation(): void
    {
        $this->scenario();
        $before = $this->snapshot();

        $this->artisan('supplier-meetings:repair-pre-fix-times', ['--dry-run' => true])->assertExitCode(2);
        $this->artisan('supplier-meetings:repair-pre-fix-times', ['--fixed-at' => self::FIXED_AT])
            ->expectsConfirmation('Apply these corrections?', 'no')
            ->assertFailed();

        $this->assertSame($before, $this->snapshot());
    }
}
