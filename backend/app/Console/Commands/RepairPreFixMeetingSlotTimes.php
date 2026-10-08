<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\SupplierApplicationMeetingSlot;
use App\Support\AuditLogger;
use App\Support\BusinessTime;
use Carbon\CarbonImmutable;
use DateTimeZone;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

/**
 * One-off repair for meeting slots written before timestamptz values carried an
 * offset (see BusinessTime::DB_DATE_FORMAT). Those writes were read by PostgreSQL
 * in its session timezone, storing instants one session offset too early.
 *
 * Only slots with audit evidence of a pre-fix write are changed:
 *  - SLOT_CREATED audits record the intended time; the slot is restored to it
 *    only when the stored time is exactly one session offset earlier.
 *  - OPTIONS_PUBLISHED audits (pre-fix, no recorded times) imply a shift of one
 *    session offset.
 * Writes after --fixed-at, unexplained differences, and slots without evidence
 * are reported and left untouched. Statuses, history, and notifications are not changed.
 */
class RepairPreFixMeetingSlotTimes extends Command
{
    protected $signature = 'supplier-meetings:repair-pre-fix-times
        {--fixed-at= : When the offset fix was deployed (ISO 8601 with offset), e.g. 2026-10-08T15:39:00+08:00}
        {--session-timezone= : PostgreSQL session timezone in effect before the fix (defaults to the current session timezone)}
        {--dry-run : Report proposed changes without writing anything}';

    protected $description = 'Repair supplier meeting slot times stored 8 hours early before the timezone fix';

    private const SLOT_CREATED = 'SUPPLIER_APPLICATION_MEETING_SLOT_CREATED';

    private const OPTIONS_PUBLISHED = 'SUPPLIER_APPLICATION_MEETING_OPTIONS_PUBLISHED';

    public function handle(): int
    {
        if (! filled($this->option('fixed-at'))) {
            $this->error('--fixed-at is required: the time the offset fix was deployed to this environment.');

            return self::INVALID;
        }
        try {
            $fixedAt = CarbonImmutable::parse((string) $this->option('fixed-at'))->utc();
            $sessionZone = new DateTimeZone((string) ($this->option('session-timezone') ?: DB::selectOne('show timezone')->TimeZone));
        } catch (Throwable $exception) {
            $this->error('Invalid --fixed-at or --session-timezone: '.$exception->getMessage());

            return self::INVALID;
        }

        $dryRun = (bool) $this->option('dry-run');
        $this->line(sprintf('Fix deployed at %s UTC; pre-fix session timezone %s. Times shown in %s.%s',
            $fixedAt->format('Y-m-d H:i:s'), $sessionZone->getName(), BusinessTime::TIMEZONE, $dryRun ? ' DRY RUN — nothing will be written.' : ''));

        $plans = $this->plan($fixedAt, $sessionZone);
        $this->table(
            ['Application', 'Slot', 'Status', 'Current start', 'Current end', 'Proposed start', 'Proposed end', 'Change', 'Reason'],
            $plans->map(fn (array $plan) => [
                $plan['application'], $plan['slot']->id, $plan['slot']->status,
                $this->show($plan['slot']->starts_at ?? $plan['slot']->scheduled_at), $this->show($plan['slot']->ends_at),
                $plan['change'] ? $this->show($plan['starts_at']) : '—', $plan['change'] ? $this->show($plan['ends_at']) : '—',
                $plan['change'] ? 'YES' : 'no', $plan['reason'],
            ])->all(),
        );

        $changes = $plans->where('change', true);
        $this->info("{$changes->count()} of {$plans->count()} slot(s) ".($dryRun ? 'would be' : 'will be').' corrected.');
        if ($dryRun || $changes->isEmpty()) {
            return self::SUCCESS;
        }
        if (! $this->confirm('Apply these corrections?')) {
            $this->warn('Aborted; nothing was written.');

            return self::FAILURE;
        }

        try {
            $this->apply($changes);
        } catch (RuntimeException $exception) {
            $this->error($exception->getMessage().' Nothing was written.');

            return self::FAILURE;
        }
        $this->info("Corrected {$changes->count()} slot(s).");

        return self::SUCCESS;
    }

    /** @return Collection<int, array<string, mixed>> */
    private function plan(CarbonImmutable $fixedAt, DateTimeZone $sessionZone): Collection
    {
        $evidence = $this->lastTimeWrites();

        return SupplierApplicationMeetingSlot::query()->with('application:id,application_number')->orderBy('supplier_application_id')->orderBy('id')->get()
            ->map(function (SupplierApplicationMeetingSlot $slot) use ($evidence, $fixedAt, $sessionZone) {
                $plan = ['slot' => $slot, 'application' => $slot->application?->application_number ?? "#{$slot->supplier_application_id}", 'change' => false];
                $stored = CarbonImmutable::instance($slot->starts_at ?? $slot->scheduled_at)->utc();
                $offset = $sessionZone->getOffset($stored);
                $audit = $evidence->get($slot->id);

                if ($slot->times_repaired_at !== null) {
                    return $plan + ['reason' => 'already repaired'];
                }
                if (! $audit) {
                    return $plan + ['reason' => 'no audit evidence; review manually'];
                }
                if (CarbonImmutable::parse($audit->created_at)->utc()->greaterThanOrEqualTo($fixedAt)) {
                    return $plan + ['reason' => 'written after fix'];
                }
                if ($offset === 0) {
                    return $plan + ['reason' => 'session offset is zero; no shift occurred'];
                }

                if ($audit->action === self::SLOT_CREATED) {
                    $recorded = $audit->metadata['starts_at'] ?? $audit->metadata['scheduled_at'] ?? null;
                    if (! $recorded) {
                        return $plan + ['reason' => 'creation audit has no recorded time; review manually'];
                    }
                    $delta = CarbonImmutable::parse($recorded)->utc()->getTimestamp() - $stored->getTimestamp();
                    if ($delta === 0) {
                        return $plan + ['reason' => 'matches recorded time'];
                    }
                    if ($delta !== $offset) {
                        return $plan + ['reason' => 'differs from recorded time by an unexpected amount; review manually'];
                    }
                    $reason = 'restored to audited intended time';
                } else {
                    $delta = $offset;
                    $reason = 'pre-fix publish; shifted by session offset';
                }

                return [...$plan,
                    'change' => true,
                    'delta' => $delta,
                    'reason' => $reason,
                    'scheduled_at' => CarbonImmutable::instance($slot->scheduled_at)->addSeconds($delta),
                    'starts_at' => $slot->starts_at ? CarbonImmutable::instance($slot->starts_at)->addSeconds($delta) : null,
                    'ends_at' => $slot->ends_at ? CarbonImmutable::instance($slot->ends_at)->addSeconds($delta) : null,
                ];
            });
    }

    /** Latest audit entry that wrote each slot's times, keyed by slot id. */
    private function lastTimeWrites(): Collection
    {
        $latest = collect();
        AuditLog::query()->whereIn('action', [self::SLOT_CREATED, self::OPTIONS_PUBLISHED])->orderBy('id')->get(['id', 'action', 'created_at', 'metadata'])
            ->each(function (AuditLog $audit) use ($latest) {
                $ids = $audit->action === self::SLOT_CREATED
                    ? [$audit->metadata['meeting_slot_id'] ?? null]
                    : ($audit->metadata['meeting_slot_ids'] ?? []);
                foreach (array_filter($ids) as $id) {
                    $latest->put((int) $id, $audit);
                }
            });

        return $latest;
    }

    private function apply(Collection $changes): void
    {
        DB::transaction(function () use ($changes) {
            $ids = $changes->map(fn (array $plan) => $plan['slot']->id)->all();
            $locked = SupplierApplicationMeetingSlot::query()->whereIn('id', $ids)->lockForUpdate()->get()->keyBy('id');

            // Latest first: a forward shift never lands on a sibling that has not moved yet.
            foreach ($changes->sortByDesc(fn (array $plan) => $plan['scheduled_at']->getTimestamp()) as $plan) {
                $slot = $locked->get($plan['slot']->id);
                if (! $slot || $slot->times_repaired_at !== null
                    || ! $slot->scheduled_at->equalTo($plan['slot']->scheduled_at)) {
                    throw new RuntimeException("Slot {$plan['slot']->id} changed since it was inspected.");
                }
                $conflict = SupplierApplicationMeetingSlot::query()->where('supplier_application_id', $slot->supplier_application_id)
                    ->whereKeyNot($slot->id)->whereNotIn('id', $ids)
                    ->where('scheduled_at', $plan['scheduled_at']->toIso8601String())->exists();
                if ($conflict) {
                    throw new RuntimeException("Slot {$slot->id} would collide with another slot of the same application.");
                }

                // Query builder with explicit offsets: no model events, statuses, or history touched.
                DB::table('supplier_application_meeting_slots')->where('id', $slot->id)->update([
                    'scheduled_at' => $plan['scheduled_at']->toIso8601String(),
                    'starts_at' => $plan['starts_at']?->toIso8601String(),
                    'ends_at' => $plan['ends_at']?->toIso8601String(),
                    'times_repaired_at' => now(),
                ]);
            }

            $changes->groupBy(fn (array $plan) => $plan['slot']->supplier_application_id)->each(function (Collection $plans) {
                $first = $plans->first();
                AuditLogger::success('SUPPLIER_MEETING_SLOT_TIMES_REPAIRED', AuditLogger::MODULE_SUPPLIERS, [
                    'actor_identifier' => 'System repair (supplier-meetings:repair-pre-fix-times)',
                    'resource_type' => 'SupplierApplication',
                    'resource_id' => $first['slot']->supplier_application_id,
                    'resource_label' => $first['application'],
                    'details' => 'Corrected meeting slot times stored before the timezone fix. No supplier-facing history or notifications were created.',
                    'metadata' => ['slots' => $plans->map(fn (array $plan) => [
                        'meeting_slot_id' => $plan['slot']->id,
                        'status' => $plan['slot']->status,
                        'shift_seconds' => $plan['delta'],
                        'evidence' => $plan['reason'],
                        'before' => [($plan['slot']->starts_at ?? $plan['slot']->scheduled_at)->toIso8601String(), $plan['slot']->ends_at?->toIso8601String()],
                        'after' => [($plan['starts_at'] ?? $plan['scheduled_at'])->toIso8601String(), $plan['ends_at']?->toIso8601String()],
                    ])->values()->all()],
                ]);
            });
        });
    }

    private function show(mixed $value): string
    {
        return $value ? CarbonImmutable::instance($value)->setTimezone(BusinessTime::TIMEZONE)->format('M j, Y g:i A') : '—';
    }
}
