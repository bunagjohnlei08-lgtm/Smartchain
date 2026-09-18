<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Read-only access to the audit trail. There are intentionally no write,
 * update or delete endpoints: records are only created by AuditLogger.
 */
class AuditLogController extends Controller
{
    private const PER_PAGE = 20;

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', AuditLog::class);

        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'action' => ['nullable', 'string', 'max:64'],
            'module' => ['nullable', 'string', 'max:64'],
            'status' => ['nullable', Rule::in([AuditLog::STATUS_SUCCESS, AuditLog::STATUS_FAILED])],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $logs = AuditLog::query()
            ->when($filters['search'] ?? null, function (Builder $query, string $search) {
                $term = '%'.addcslashes($search, '\\%_').'%';
                $query->where(function (Builder $query) use ($term) {
                    foreach (['actor_name', 'actor_identifier', 'action', 'resource_label', 'details'] as $column) {
                        $query->orWhere($column, 'like', $term);
                    }
                });
            })
            ->when($filters['action'] ?? null, fn (Builder $query, string $action) => $query->where('action', $action))
            ->when($filters['module'] ?? null, fn (Builder $query, string $module) => $query->where('module', $module))
            ->when($filters['status'] ?? null, fn (Builder $query, string $status) => $query->where('status', $status))
            ->when($filters['date_from'] ?? null, fn (Builder $query, string $date) => $query->whereDate('created_at', '>=', $date))
            ->when($filters['date_to'] ?? null, fn (Builder $query, string $date) => $query->whereDate('created_at', '<=', $date))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(self::PER_PAGE)
            ->through(fn (AuditLog $log) => [
                'id' => $log->id,
                'created_at' => $log->created_at?->toIso8601String(),
                'actor_user_id' => $log->actor_user_id,
                'actor_name' => $log->actor_name,
                'actor_identifier' => $log->actor_identifier,
                'action' => $log->action,
                'module' => $log->module,
                'resource_type' => $log->resource_type,
                'resource_id' => $log->resource_id,
                'resource_label' => $log->resource_label,
                'status' => $log->status,
                'details' => $log->details,
                'ip_address' => $log->ip_address,
                'user_agent' => $log->user_agent,
                'metadata' => $log->metadata,
            ]);

        return response()->json($logs);
    }

    /**
     * Distinct action and module values for the filter dropdowns.
     */
    public function options(): JsonResponse
    {
        $this->authorize('viewAny', AuditLog::class);

        return response()->json([
            'actions' => AuditLog::query()->distinct()->orderBy('action')->pluck('action'),
            'modules' => AuditLog::query()->distinct()->orderBy('module')->pluck('module'),
        ]);
    }
}
