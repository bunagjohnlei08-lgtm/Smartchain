<?php

namespace App\Support;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * Single entry point for writing audit records.
 *
 * - Successful actions are written after the surrounding DB transaction
 *   commits, so a rolled-back operation is never recorded as a success.
 * - Metadata is scrubbed of credential-like keys before storage.
 * - A logging failure is reported but never breaks the audited request.
 */
class AuditLogger
{
    public const MODULE_AUTH = 'Authentication';
    public const MODULE_USERS = 'User Management';
    public const MODULE_PROCUREMENT = 'Procurement';
    public const MODULE_PURCHASE_ORDERS = 'Purchase Orders';
    public const MODULE_INVENTORY = 'Inventory';
    public const MODULE_ORDERS = 'Order Management';

    private const SENSITIVE_KEY_PATTERN = '/pass(word)?|secret|token|api[_-]?key|otp|authorization|cookie|session|signature|remember/i';

    /**
     * @param  array{
     *     actor?: ?User,
     *     actor_identifier?: ?string,
     *     resource?: ?Model,
     *     resource_type?: ?string,
     *     resource_id?: int|string|null,
     *     resource_label?: ?string,
     *     status?: string,
     *     details?: ?string,
     *     metadata?: array<string, mixed>,
     * }  $context
     */
    public static function log(string $action, string $module, array $context = []): void
    {
        try {
            $record = self::buildRecord($action, $module, $context);
        } catch (Throwable $exception) {
            report($exception);

            return;
        }

        $write = static function () use ($record): void {
            try {
                AuditLog::create($record);
            } catch (Throwable $exception) {
                report($exception);
            }
        };

        if ($record['status'] === AuditLog::STATUS_SUCCESS) {
            DB::afterCommit($write);
        } else {
            $write();
        }
    }

    public static function success(string $action, string $module, array $context = []): void
    {
        self::log($action, $module, ['status' => AuditLog::STATUS_SUCCESS] + $context);
    }

    public static function failure(string $action, string $module, array $context = []): void
    {
        self::log($action, $module, ['status' => AuditLog::STATUS_FAILED] + $context);
    }

    /**
     * Summarise attribute changes as "field: old → new" without exposing
     * credential fields. Keys map attribute names to display labels.
     *
     * @param  array<string, mixed>  $before
     * @param  array<string, mixed>  $after
     * @param  array<string, string>  $labels
     * @return array<string, array{from: mixed, to: mixed}>
     */
    public static function diff(array $before, array $after, array $labels): array
    {
        $changes = [];

        foreach ($labels as $attribute => $label) {
            if (! array_key_exists($attribute, $after)) {
                continue;
            }

            $old = $before[$attribute] ?? null;
            $new = $after[$attribute];

            if ((string) $old !== (string) $new) {
                $changes[$label] = ['from' => $old, 'to' => $new];
            }
        }

        return $changes;
    }

    /**
     * @param  array<string, array{from: mixed, to: mixed}>  $changes
     */
    public static function describeChanges(array $changes): string
    {
        return collect($changes)
            ->map(fn (array $change, string $label) => sprintf(
                'Changed %s from %s to %s',
                $label,
                self::displayValue($change['from']),
                self::displayValue($change['to']),
            ))
            ->implode('; ');
    }

    private static function buildRecord(string $action, string $module, array $context): array
    {
        $request = app()->bound('request') ? request() : null;
        $actor = $context['actor'] ?? $request?->user();
        $resource = $context['resource'] ?? null;

        return [
            'actor_user_id' => $actor?->getKey(),
            'actor_name' => $actor?->name,
            'actor_identifier' => isset($context['actor_identifier'])
                ? Str::limit((string) $context['actor_identifier'], 250, '')
                : null,
            'action' => $action,
            'module' => $module,
            'resource_type' => $context['resource_type'] ?? ($resource ? class_basename($resource) : null),
            'resource_id' => isset($context['resource_id'])
                ? (string) $context['resource_id']
                : ($resource?->getKey() !== null ? (string) $resource->getKey() : null),
            'resource_label' => isset($context['resource_label'])
                ? Str::limit((string) $context['resource_label'], 250, '')
                : null,
            'status' => $context['status'] ?? AuditLog::STATUS_SUCCESS,
            'details' => isset($context['details']) ? Str::limit((string) $context['details'], 495) : null,
            'ip_address' => $request?->ip(),
            'user_agent' => $request ? Str::limit((string) $request->userAgent(), 250, '') ?: null : null,
            'metadata' => self::scrub($context['metadata'] ?? []) ?: null,
        ];
    }

    /**
     * Recursively drop any key that looks like a credential or secret. Also
     * applied when records are read back, as defence in depth.
     */
    public static function scrub(array $data): array
    {
        $clean = [];

        foreach ($data as $key => $value) {
            if (is_string($key) && preg_match(self::SENSITIVE_KEY_PATTERN, $key)) {
                continue;
            }

            $clean[$key] = is_array($value) ? self::scrub($value) : $value;
        }

        return $clean;
    }

    private static function displayValue(mixed $value): string
    {
        if ($value === null || $value === '') {
            return 'none';
        }

        if (is_bool($value)) {
            return $value ? 'yes' : 'no';
        }

        return (string) $value;
    }
}
