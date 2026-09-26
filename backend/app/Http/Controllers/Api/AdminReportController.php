<?php

namespace App\Http\Controllers\Api;

use App\Console\Commands\RunScheduledReports;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ReportExport;
use App\Models\ReportSchedule;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use App\Reports\ReportDefinition;
use App\Reports\ReportGenerationFailed;
use App\Reports\ReportInput;
use App\Reports\ReportRegistry;
use App\Reports\ReportRunner;
use App\Support\AuditLogger;
use App\Support\WarehouseCapacity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class AdminReportController extends Controller
{
    private const COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];

    public function __construct(
        private readonly ReportRegistry $registry,
        private readonly ReportInput $input,
        private readonly ReportRunner $runner,
    ) {}

    public function dashboard(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $warehouseCapacity = Warehouse::query()->where('status', 'Active')->orderBy('name')->orderBy('id')->get()
            ->values()->map(function (Warehouse $warehouse, int $index) {
                $snapshot = WarehouseCapacity::snapshot($warehouse);

                return [
                    'name' => $warehouse->name,
                    'code' => $warehouse->code,
                    'used' => $snapshot['utilized'],
                    'capacity' => $snapshot['capacity'] === null ? null : (int) $snapshot['capacity'],
                    'available' => $snapshot['available'],
                    'utilization_percentage' => $snapshot['utilization_percentage'],
                    'alert_level' => strtoupper($snapshot['capacity_state']),
                    'color' => self::COLORS[$index % count(self::COLORS)],
                ];
            });

        $status = ReportRegistry::STOCK_STATUS_SQL;
        $stock = DB::table('inventories')
            ->join('products', 'products.id', '=', 'inventories.product_id')
            ->selectRaw("COALESCE(SUM(CASE WHEN {$status} = 'Healthy' THEN 1 ELSE 0 END), 0) as healthy")
            ->selectRaw("COALESCE(SUM(CASE WHEN {$status} = 'Low Stock' THEN 1 ELSE 0 END), 0) as low_stock")
            ->selectRaw("COALESCE(SUM(CASE WHEN {$status} = 'Out of Stock' THEN 1 ELSE 0 END), 0) as out_of_stock")
            ->first();

        $configured = $warehouseCapacity->filter(fn (array $warehouse) => $warehouse['capacity'] !== null && $warehouse['capacity'] > 0);
        $usedCapacity = (int) $configured->sum('used');
        $totalCapacity = (int) $configured->sum('capacity');
        $today = now()->startOfDay();
        $successToday = ReportExport::query()->where('status', ReportExport::STATUS_SUCCESS)->where('generated_at', '>=', $today);
        $definitions = collect($this->registry->all());

        return response()->json([
            'metrics' => [
                'total_reports_available' => $definitions->filter(fn (ReportDefinition $definition) => $definition->available())->count(),
                'total_report_definitions' => $definitions->count(),
                'exports_today' => (clone $successToday)->where('action', ReportExport::ACTION_EXPORT)->count(),
                'generated_today' => (clone $successToday)->count(),
                'pending_reports' => ReportSchedule::query()->where('status', 'ACTIVE')->count(),
                'last_generated_at' => ReportExport::query()->where('status', ReportExport::STATUS_SUCCESS)
                    ->orderByDesc('generated_at')->first(['generated_at'])?->generated_at?->toIso8601String(),
                'warehouse_capacity' => [
                    'used' => $usedCapacity,
                    'total' => $totalCapacity > 0 ? $totalCapacity : null,
                    'utilization_percentage' => $totalCapacity > 0 ? round(min(100, $usedCapacity / $totalCapacity * 100), 1) : null,
                ],
                'total_stock_units' => (int) (DB::table('inventories')->selectRaw('COALESCE(SUM(available_stock + reserved_stock), 0) as total')->value('total') ?? 0),
                // No forecast results are persisted anywhere, so accuracy cannot be measured.
                'ai_forecast_accuracy' => null,
            ],
            'reports_list' => $this->definitionList(),
            'warehouse_capacity_overview' => $warehouseCapacity,
            'stock_status_overview' => [
                ['name' => 'Healthy', 'value' => (int) $stock->healthy, 'color' => '#10b981'],
                ['name' => 'Low Stock', 'value' => (int) $stock->low_stock, 'color' => '#f59e0b'],
                ['name' => 'Out of Stock', 'value' => (int) $stock->out_of_stock, 'color' => '#ef4444'],
            ],
            'recent_exports' => ReportExport::query()->with('user:id,name')
                ->where('action', ReportExport::ACTION_EXPORT)
                ->orderByDesc('generated_at')->orderByDesc('id')->limit(8)->get()
                ->map(fn (ReportExport $export) => $this->presentHistory($export)),
            'scheduler' => $this->schedulerState(),
        ]);
    }

    public function definitions(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => $this->definitionList()]);
    }

    public function options(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'categories' => collect(ReportRegistry::CATEGORIES)->map(fn ($label, $id) => ['id' => $id, 'label' => $label])->values(),
            'formats' => collect(ReportRunner::FORMAT_LABELS)->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values(),
            'warehouses' => Warehouse::query()->orderBy('name')->get(['id', 'name', 'code', 'status']),
            'products' => Product::query()->orderBy('name')->get(['id', 'name', 'category']),
            'product_categories' => Product::query()->whereNotNull('category')->where('category', '<>', '')->distinct()->orderBy('category')->pluck('category'),
            'suppliers' => Supplier::query()->orderBy('name')->get(['id', 'supplier_code', 'name', 'status']),
            'recipients' => $this->eligibleRecipients()->map(fn (User $user) => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email])->values(),
            'schedule' => [
                'frequencies' => ReportSchedule::FREQUENCIES,
                'date_windows' => array_keys(ReportSchedule::DATE_WINDOWS),
                'timezone' => config('app.timezone'),
            ],
        ]);
    }

    public function preview(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        [$definition, $filters, $extra] = $this->input->resolve($request->query(), [
            'page' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);

        return response()->json([
            'report' => [
                'key' => $definition->key,
                'name' => $definition->name,
                'category' => $definition->category,
                'category_label' => $definition->categoryLabel(),
                'formats' => $definition->formats,
                'columns' => $definition->toArray()['columns'],
            ],
            ...$this->runner->preview($definition, $filters, (int) ($extra['page'] ?? 1), (int) ($extra['per_page'] ?? 25), $request->user()),
        ]);
    }

    public function export(Request $request): BinaryFileResponse|JsonResponse
    {
        $this->authorizeAdmin($request);
        [$definition, $filters, $extra] = $this->input->resolve($request->all(), [
            'format' => ['required', Rule::in(array_keys(ReportRunner::WRITERS))],
            'source' => ['nullable', Rule::in(ReportExport::SOURCES)],
            'title' => ['nullable', 'string', 'max:80', 'regex:/^[A-Za-z0-9 ,.()_\-]+$/'],
        ]);
        if (! $definition->supportsFormat($extra['format'])) {
            throw ValidationException::withMessages(['format' => "{$definition->name} does not support {$extra['format']} export."]);
        }

        try {
            $file = $this->runner->export(
                $definition, $filters, $extra['format'], $request->user(),
                $extra['source'] ?? ReportExport::SOURCE_STANDARD,
                isset($extra['title']) ? trim($extra['title']) : null,
            );
        } catch (ReportGenerationFailed $exception) {
            return response()->json(['message' => $exception->getMessage()], 500);
        }

        return response()->download($file['path'], $file['filename'], [
            'Content-Type' => $file['mime'],
            'X-Report-Rows' => (string) $file['row_count'],
            'Cache-Control' => 'no-store',
        ])->deleteFileAfterSend();
    }

    public function history(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $validated = $request->validate([
            'action' => ['nullable', Rule::in([ReportExport::ACTION_EXPORT, ReportExport::ACTION_PREVIEW])],
            'status' => ['nullable', Rule::in([ReportExport::STATUS_SUCCESS, ReportExport::STATUS_FAILED])],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        return response()->json(ReportExport::query()->with('user:id,name')
            ->when($validated['action'] ?? null, fn ($query, $action) => $query->where('action', $action))
            ->when($validated['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->orderByDesc('generated_at')->orderByDesc('id')
            ->paginate($validated['per_page'] ?? 10)
            ->through(fn (ReportExport $export) => $this->presentHistory($export)));
    }

    public function schedules(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'data' => ReportSchedule::query()->with(['recipient:id,name,email', 'creator:id,name'])
                ->orderByDesc('created_at')->orderByDesc('id')->get()
                ->map(fn (ReportSchedule $schedule) => $this->presentSchedule($schedule)),
            'scheduler' => $this->schedulerState(),
        ]);
    }

    public function storeSchedule(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        [$definition, $filters, $extra] = $this->input->resolve($request->all(), [
            'format' => ['required', Rule::in(array_keys(ReportRunner::WRITERS))],
            'frequency' => ['required', Rule::in(ReportSchedule::FREQUENCIES)],
            'run_time' => ['required', 'regex:/^([01]\d|2[0-3]):[0-5]\d$/'],
            'day_of_week' => ['nullable', 'required_if:frequency,WEEKLY', 'integer', 'between:0,6'],
            'day_of_month' => ['nullable', 'required_if:frequency,MONTHLY', 'integer', 'between:1,28'],
            'date_window' => ['nullable', Rule::in(array_keys(ReportSchedule::DATE_WINDOWS))],
            'recipient_user_id' => ['required', 'integer'],
        ]);

        $errors = [];
        if (! $definition->supportsFormat($extra['format'])) $errors['format'] = "{$definition->name} does not support {$extra['format']} export.";
        if ($filters->dateFrom || $filters->dateTo) $errors['date_from'] = 'Scheduled reports use a relative date window instead of fixed dates.';
        $window = $extra['date_window'] ?? 'ALL';
        if ($window !== 'ALL' && ! $definition->allows('date')) $errors['date_window'] = "{$definition->name} has no date filter.";
        if (! $this->eligibleRecipients()->contains('id', (int) $extra['recipient_user_id'])) {
            $errors['recipient_user_id'] = 'Scheduled reports can only be delivered to an active Admin account with a valid email.';
        }
        if ($errors !== []) throw ValidationException::withMessages($errors);

        $schedule = new ReportSchedule([
            'created_by' => $request->user()->id,
            'report_key' => $definition->key,
            'format' => $extra['format'],
            'frequency' => $extra['frequency'],
            'run_time' => $extra['run_time'],
            'day_of_week' => $extra['frequency'] === 'WEEKLY' ? (int) $extra['day_of_week'] : null,
            'day_of_month' => $extra['frequency'] === 'MONTHLY' ? (int) $extra['day_of_month'] : null,
            'date_window' => $window,
            'filters' => $filters->toArray() ?: null,
            'recipient_user_id' => (int) $extra['recipient_user_id'],
            'status' => 'ACTIVE',
        ]);
        $schedule->next_run_at = $schedule->computeNextRun();
        $schedule->save();

        AuditLogger::success('REPORT_SCHEDULE_CREATED', AuditLogger::MODULE_REPORTS, [
            'resource' => $schedule, 'resource_label' => $definition->name,
            'details' => "Scheduled {$definition->name} ({$schedule->frequency}, {$schedule->format})",
            'metadata' => [
                'report_key' => $definition->key, 'format' => $schedule->format, 'frequency' => $schedule->frequency,
                'recipient_user_id' => $schedule->recipient_user_id, 'date_window' => $window,
            ] + $filters->toArray(),
        ]);

        return response()->json([
            'message' => 'Report schedule saved.',
            'data' => $this->presentSchedule($schedule->load(['recipient:id,name,email', 'creator:id,name'])),
            'scheduler' => $this->schedulerState(),
        ], 201);
    }

    public function updateSchedule(Request $request, ReportSchedule $reportSchedule): JsonResponse
    {
        $this->authorizeAdmin($request);
        $validated = $request->validate(['status' => ['required', Rule::in(ReportSchedule::STATUSES)]]);

        $reportSchedule->status = $validated['status'];
        $reportSchedule->next_run_at = $validated['status'] === 'ACTIVE' ? $reportSchedule->computeNextRun() : null;
        $reportSchedule->save();

        AuditLogger::success($validated['status'] === 'ACTIVE' ? 'REPORT_SCHEDULE_RESUMED' : 'REPORT_SCHEDULE_PAUSED', AuditLogger::MODULE_REPORTS, [
            'resource' => $reportSchedule, 'resource_label' => $this->registry->find($reportSchedule->report_key)?->name,
            'metadata' => ['report_key' => $reportSchedule->report_key],
        ]);

        return response()->json(['data' => $this->presentSchedule($reportSchedule->load(['recipient:id,name,email', 'creator:id,name']))]);
    }

    public function destroySchedule(Request $request, ReportSchedule $reportSchedule): JsonResponse
    {
        $this->authorizeAdmin($request);
        $label = $this->registry->find($reportSchedule->report_key)?->name;
        $reportSchedule->delete();

        AuditLogger::success('REPORT_SCHEDULE_DELETED', AuditLogger::MODULE_REPORTS, [
            'resource_type' => 'ReportSchedule', 'resource_id' => $reportSchedule->id, 'resource_label' => $label,
            'metadata' => ['report_key' => $reportSchedule->report_key],
        ]);

        return response()->json(['message' => 'Report schedule deleted.']);
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Administrator access is required.');
    }

    private function definitionList(): array
    {
        $lastGenerated = ReportExport::query()->where('status', ReportExport::STATUS_SUCCESS)
            ->groupBy('report_key')->selectRaw('report_key, MAX(generated_at) as last_generated_at')
            ->pluck('last_generated_at', 'report_key');
        $scheduled = ReportSchedule::query()->where('status', 'ACTIVE')
            ->groupBy('report_key')->selectRaw('report_key, COUNT(*) as schedules')
            ->pluck('schedules', 'report_key');

        return collect($this->registry->all())->map(fn (ReportDefinition $definition) => $definition->toArray() + [
            'last_generated_at' => isset($lastGenerated[$definition->key]) ? Carbon::parse($lastGenerated[$definition->key])->toIso8601String() : null,
            'active_schedules' => (int) ($scheduled[$definition->key] ?? 0),
        ])->values()->all();
    }

    private function presentHistory(ReportExport $export): array
    {
        return [
            'id' => $export->id,
            'action' => $export->action,
            'source' => $export->source,
            'report_key' => $export->report_key,
            'report_name' => $export->report_name,
            'category' => $export->category,
            'format' => $export->format,
            'filters' => $export->filters ?? (object) [],
            'status' => $export->status,
            'row_count' => $export->row_count,
            'file_name' => $export->file_name,
            'file_size' => $export->file_size,
            'error_message' => $export->error_message,
            'generated_at' => $export->generated_at?->toIso8601String(),
            'generated_by' => $export->user?->name ?? ($export->source === ReportExport::SOURCE_SCHEDULED ? 'Scheduler' : null),
        ];
    }

    private function presentSchedule(ReportSchedule $schedule): array
    {
        $definition = $this->registry->find($schedule->report_key);

        return [
            'id' => $schedule->id,
            'report_key' => $schedule->report_key,
            'report_name' => $definition?->name ?? $schedule->report_key,
            'category' => $definition?->category,
            'format' => $schedule->format,
            'frequency' => $schedule->frequency,
            'run_time' => $schedule->run_time,
            'day_of_week' => $schedule->day_of_week,
            'day_of_month' => $schedule->day_of_month,
            'date_window' => $schedule->date_window,
            'filters' => $schedule->filters ?? (object) [],
            'recipient' => $schedule->recipient ? ['id' => $schedule->recipient->id, 'name' => $schedule->recipient->name, 'email' => $schedule->recipient->email] : null,
            'created_by' => $schedule->creator?->name,
            'status' => $schedule->status,
            'next_run_at' => $schedule->next_run_at?->toIso8601String(),
            'last_run_at' => $schedule->last_run_at?->toIso8601String(),
            'last_status' => $schedule->last_status,
            'last_error' => $schedule->last_error,
        ];
    }

    /** Heartbeat written by reports:run-scheduled; absent until the production scheduler actually runs. */
    private function schedulerState(): array
    {
        $lastRun = Cache::get(RunScheduledReports::HEARTBEAT_KEY);
        $overdue = ReportSchedule::query()->where('status', 'ACTIVE')->where('next_run_at', '<', now()->subMinutes(15))->count();

        return [
            'last_run_at' => $lastRun,
            'running' => $lastRun !== null && Carbon::parse($lastRun)->gt(now()->subMinutes(15)),
            'overdue_schedules' => $overdue,
            'requirement' => 'Scheduled delivery requires the Laravel scheduler (php artisan schedule:run every minute) to be configured as a cron/worker in production.',
        ];
    }

    private function eligibleRecipients()
    {
        return User::query()->where('status', 'ACTIVE')
            ->whereHas('role', fn ($role) => $role->where('slug', 'ADMIN'))
            ->orderBy('name')->get(['id', 'name', 'email', 'role_id'])
            ->filter(fn (User $user) => filter_var((string) $user->email, FILTER_VALIDATE_EMAIL) !== false)
            ->values();
    }
}
