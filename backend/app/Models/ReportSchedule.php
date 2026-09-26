<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

class ReportSchedule extends Model
{
    public const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'];
    public const STATUSES = ['ACTIVE', 'PAUSED'];

    /** Relative date windows applied at run time to date-filterable reports. */
    public const DATE_WINDOWS = ['ALL' => null, 'LAST_1_DAY' => 1, 'LAST_7_DAYS' => 7, 'LAST_30_DAYS' => 30];

    protected $fillable = [
        'created_by', 'report_key', 'format', 'frequency', 'run_time', 'day_of_week', 'day_of_month',
        'date_window', 'filters', 'recipient_user_id', 'status', 'next_run_at', 'last_run_at',
        'last_status', 'last_error',
    ];

    protected function casts(): array
    {
        return [
            'filters' => 'array',
            'day_of_week' => 'integer',
            'day_of_month' => 'integer',
            'next_run_at' => 'datetime',
            'last_run_at' => 'datetime',
        ];
    }

    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
    public function recipient(): BelongsTo { return $this->belongsTo(User::class, 'recipient_user_id'); }

    /** The first run strictly after $after, in the application timezone. */
    public function computeNextRun(?CarbonInterface $after = null): Carbon
    {
        $after = Carbon::instance($after ?? now());
        [$hour, $minute] = array_map('intval', explode(':', $this->run_time));
        $candidate = $after->copy()->setTime($hour, $minute);

        return match ($this->frequency) {
            'WEEKLY' => $this->advance($candidate, $after, fn (Carbon $date) => $date->dayOfWeek === $this->day_of_week, 'addDay'),
            'MONTHLY' => $this->advance($candidate->day(min($this->day_of_month ?? 1, 28)), $after, fn () => true, 'addMonthNoOverflow'),
            default => $this->advance($candidate, $after, fn () => true, 'addDay'),
        };
    }

    private function advance(Carbon $candidate, Carbon $after, callable $matches, string $step): Carbon
    {
        for ($guard = 0; $guard < 400 && ($candidate->lte($after) || ! $matches($candidate)); $guard++) {
            $candidate = $candidate->{$step}();
        }

        return $candidate;
    }
}
