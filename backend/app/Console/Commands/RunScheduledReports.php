<?php

namespace App\Console\Commands;

use App\Mail\ScheduledReportMail;
use App\Models\ReportExport;
use App\Models\ReportSchedule;
use App\Models\User;
use App\Reports\ReportInput;
use App\Reports\ReportRegistry;
use App\Reports\ReportRunner;
use App\Support\AuditLogger;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Delivers due report schedules. Registered in routes/console.php; it only
 * runs when the production Laravel scheduler (schedule:run) is configured.
 */
class RunScheduledReports extends Command
{
    public const HEARTBEAT_KEY = 'reports:scheduler:last_run_at';

    protected $signature = 'reports:run-scheduled {--limit=20 : Maximum schedules to deliver in one run}';

    protected $description = 'Generate and email Admin report schedules that are due';

    public function handle(ReportRegistry $registry, ReportInput $input, ReportRunner $runner): int
    {
        Cache::forever(self::HEARTBEAT_KEY, now()->toIso8601String());

        $due = ReportSchedule::query()->where('status', 'ACTIVE')->whereNotNull('next_run_at')
            ->where('next_run_at', '<=', now())->orderBy('next_run_at')->limit((int) $this->option('limit'))->get();

        foreach ($due as $schedule) {
            // Claim the run by advancing next_run_at atomically so overlapping runs cannot double-send.
            $claimed = ReportSchedule::query()->whereKey($schedule->id)->where('status', 'ACTIVE')
                ->where('next_run_at', $schedule->next_run_at)
                ->update(['next_run_at' => $schedule->computeNextRun(now()), 'last_run_at' => now()]);
            if ($claimed === 0) continue;

            $this->deliver($schedule->fresh(['recipient.role', 'creator']), $input, $runner);
        }

        $this->info("Processed {$due->count()} due report schedule(s).");

        return self::SUCCESS;
    }

    private function deliver(ReportSchedule $schedule, ReportInput $input, ReportRunner $runner): void
    {
        $path = null;
        try {
            $recipient = $schedule->recipient;
            if (! $recipient instanceof User || $recipient->status !== 'ACTIVE' || ! $recipient->isAdmin()
                || filter_var((string) $recipient->email, FILTER_VALIDATE_EMAIL) === false) {
                throw new \RuntimeException('The recipient is no longer an active Admin with a valid email.');
            }

            $days = ReportSchedule::DATE_WINDOWS[$schedule->date_window] ?? null;
            $request = ['report_key' => $schedule->report_key] + ($schedule->filters ?? []);
            if ($days !== null) {
                $request['date_from'] = now()->subDays($days)->toDateString();
                $request['date_to'] = now()->toDateString();
            }
            [$definition, $filters] = $input->resolve($request);

            $file = $runner->export($definition, $filters, $schedule->format, $schedule->creator ?? $recipient, ReportExport::SOURCE_SCHEDULED, null, $schedule);
            $path = $file['path'];

            Mail::to($recipient->email, $recipient->name)->send(new ScheduledReportMail(
                recipientName: $recipient->name,
                reportName: $definition->name,
                rowCount: $file['row_count'],
                filename: $file['filename'],
                mime: $file['mime'],
                filePath: $path,
            ));

            $schedule->update(['last_status' => 'SUCCESS', 'last_error' => null]);
            AuditLogger::success('REPORT_SCHEDULE_DELIVERED', AuditLogger::MODULE_REPORTS, [
                'actor' => $schedule->creator, 'resource' => $schedule, 'resource_label' => $definition->name,
                'metadata' => ['report_key' => $definition->key, 'format' => $schedule->format, 'record_count' => $file['row_count'], 'recipient_user_id' => $recipient->id],
            ]);
        } catch (Throwable $exception) {
            report($exception);
            $schedule->update(['last_status' => 'FAILED', 'last_error' => 'Scheduled delivery failed. Check the report, recipient and mail configuration.']);
            AuditLogger::failure('REPORT_SCHEDULE_DELIVERY_FAILED', AuditLogger::MODULE_REPORTS, [
                'actor' => $schedule->creator, 'resource' => $schedule,
                'metadata' => ['report_key' => $schedule->report_key, 'format' => $schedule->format],
            ]);
        } finally {
            if ($path !== null) @unlink($path);
        }
    }
}
