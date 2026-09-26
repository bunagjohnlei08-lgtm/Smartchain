<?php

namespace App\Reports;

use App\Models\Product;
use App\Models\ReportExport;
use App\Models\ReportSchedule;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use App\Reports\Writers\CsvReportWriter;
use App\Reports\Writers\PdfReportWriter;
use App\Reports\Writers\ReportWriter;
use App\Reports\Writers\XlsxReportWriter;
use App\Support\AuditLogger;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Executes registry definitions for preview and export, and records every
 * generation (success or failure) in report history and the audit log.
 */
class ReportRunner
{
    public const WRITERS = ['CSV' => CsvReportWriter::class, 'XLSX' => XlsxReportWriter::class, 'PDF' => PdfReportWriter::class];
    public const FORMAT_LABELS = ['CSV' => 'CSV', 'XLSX' => 'Excel (.xlsx)', 'PDF' => 'PDF'];

    /** @return array{rows: list<array<string, mixed>>, total: int, page: int, per_page: int, last_page: int, generated_at: string, filters_applied: list<string>} */
    public function preview(ReportDefinition $definition, ReportFilters $filters, int $page, int $perPage, User $user): array
    {
        $source = $definition->source($filters);
        if ($source instanceof Builder) {
            $paginator = $source->paginate($perPage, ['*'], 'page', $page);
            $items = collect($paginator->items());
            $total = $paginator->total();
        } else {
            $total = $source->count();
            $items = $source->forPage($page, $perPage)->values();
        }
        $generatedAt = now();
        $described = $this->describeFilters($definition, $filters);

        // Paging through an open preview is not a new generation.
        if ($page === 1) {
            $this->record($definition, $filters, $user, ReportExport::ACTION_PREVIEW, ReportExport::SOURCE_STANDARD, null, ReportExport::STATUS_SUCCESS, [
                'row_count' => $total, 'generated_at' => $generatedAt,
            ]);
            AuditLogger::success('REPORT_PREVIEWED', AuditLogger::MODULE_REPORTS, [
                'actor' => $user, 'resource_type' => 'Report', 'resource_id' => $definition->key, 'resource_label' => $definition->name,
                'details' => "Previewed {$definition->name}",
                'metadata' => ['report_key' => $definition->key, 'record_count' => $total] + $filters->toArray(),
            ]);
        }

        return [
            'rows' => $items->map(fn ($row) => $this->formatRow($definition, $row, false))->values()->all(),
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'last_page' => max(1, (int) ceil($total / $perPage)),
            'generated_at' => $generatedAt->toIso8601String(),
            'filters_applied' => $described,
        ];
    }

    /**
     * @return array{path: string, filename: string, mime: string, row_count: int, history: ReportExport}
     *
     * @throws ReportGenerationFailed
     */
    public function export(
        ReportDefinition $definition,
        ReportFilters $filters,
        string $format,
        ?User $user,
        string $source = ReportExport::SOURCE_STANDARD,
        ?string $title = null,
        ?ReportSchedule $schedule = null,
    ): array {
        $title = $title ?: $definition->name;
        if ($format === 'PDF' && $this->count($definition, $filters) > PdfReportWriter::MAX_ROWS) {
            throw ValidationException::withMessages([
                'format' => 'PDF export is limited to '.number_format(PdfReportWriter::MAX_ROWS).' rows. Narrow the filters or export as CSV or Excel.',
            ]);
        }

        /** @var ReportWriter $writer */
        $writer = app(self::WRITERS[$format]);
        $generatedAt = now();
        $count = 0;
        $metadata = ['report_key' => $definition->key, 'format' => $format, 'source' => $source] + $filters->toArray();
        $auditContext = ['actor' => $user, 'resource_type' => 'Report', 'resource_id' => $definition->key, 'resource_label' => $title];

        try {
            $rows = (function () use ($definition, $filters, &$count) {
                foreach ($this->iterate($definition, $filters) as $row) {
                    $count++;
                    yield $this->formatRow($definition, $row, true);
                }
            })();
            $path = $writer->write($definition, $rows, [
                'title' => $title,
                'category' => $definition->categoryLabel(),
                'generated_at' => $generatedAt->format('M d, Y g:i A T'),
                'filters' => $this->describeFilters($definition, $filters),
            ]);
        } catch (Throwable $exception) {
            report($exception);
            $this->record($definition, $filters, $user, ReportExport::ACTION_EXPORT, $source, $format, ReportExport::STATUS_FAILED, [
                'report_name' => $title, 'error_message' => 'Report generation failed.', 'generated_at' => $generatedAt,
                'report_schedule_id' => $schedule?->id,
            ]);
            AuditLogger::failure('REPORT_EXPORT_FAILED', AuditLogger::MODULE_REPORTS, $auditContext + [
                'details' => "Failed to export {$title} as {$format}", 'metadata' => $metadata,
            ]);

            throw new ReportGenerationFailed('The report could not be generated. Please try again.', previous: $exception);
        }

        $base = trim((string) preg_replace('/[^A-Za-z0-9_-]+/', '_', $title), '_') ?: 'report';
        $filename = $base.'_'.$generatedAt->format('Y-m-d_His').'.'.$writer->extension();
        $history = $this->record($definition, $filters, $user, ReportExport::ACTION_EXPORT, $source, $format, ReportExport::STATUS_SUCCESS, [
            'report_name' => $title, 'row_count' => $count, 'file_name' => $filename, 'file_size' => filesize($path) ?: null,
            'generated_at' => $generatedAt, 'report_schedule_id' => $schedule?->id,
        ]);
        AuditLogger::success($source === ReportExport::SOURCE_CUSTOM ? 'CUSTOM_REPORT_GENERATED' : 'REPORT_EXPORTED', AuditLogger::MODULE_REPORTS, $auditContext + [
            'details' => "Exported {$title} as {$format} ({$count} records)", 'metadata' => $metadata + ['record_count' => $count],
        ]);

        return ['path' => $path, 'filename' => $filename, 'mime' => $writer->mimeType(), 'row_count' => $count, 'history' => $history];
    }

    public function count(ReportDefinition $definition, ReportFilters $filters): int
    {
        $source = $definition->source($filters);

        return $source instanceof Builder ? (int) $source->getCountForPagination() : $source->count();
    }

    private function iterate(ReportDefinition $definition, ReportFilters $filters): iterable
    {
        $source = $definition->source($filters);

        return $source instanceof Builder ? $source->lazy(1000) : $source;
    }

    /** Casts raw values by declared column type; only declared columns ever leave the server. */
    public function formatRow(ReportDefinition $definition, object $row, bool $forExport): array
    {
        $formatted = [];
        foreach ($definition->columns as $key => [, $type]) {
            $value = $row->{$key} ?? null;
            $formatted[$key] = match (true) {
                $value === null => null,
                $type === 'percent' => is_numeric($value) ? round((float) $value, 1) : $value,
                $type === 'number' => is_numeric($value) ? (fmod((float) $value, 1.0) === 0.0 ? (int) $value : (float) $value) : $value,
                $type === 'datetime' => $forExport ? Carbon::parse($value)->format('Y-m-d H:i:s') : Carbon::parse($value)->toIso8601String(),
                $type === 'date' => Carbon::parse($value)->toDateString(),
                default => (string) $value,
            };
        }

        return $formatted;
    }

    /** @return list<string> */
    public function describeFilters(ReportDefinition $definition, ReportFilters $filters): array
    {
        $dateLabel = $definition->dateLabel ?? 'Date';

        return array_values(array_filter([
            $filters->dateFrom ? "{$dateLabel} from {$filters->dateFrom->toDateString()}" : null,
            $filters->dateTo ? "{$dateLabel} to {$filters->dateTo->toDateString()}" : null,
            $filters->warehouseId ? 'Warehouse: '.Warehouse::query()->whereKey($filters->warehouseId)->value('name') : null,
            $filters->productId ? 'Product: '.Product::query()->whereKey($filters->productId)->value('name') : null,
            $filters->supplierId ? 'Supplier: '.Supplier::query()->whereKey($filters->supplierId)->value('name') : null,
            $filters->status ? 'Status: '.($definition->statuses[$filters->status] ?? $filters->status) : null,
            $filters->movementType ? 'Movement: '.($filters->movementType === 'STOCK_IN' ? 'Stock In' : 'Stock Out') : null,
            $filters->category ? "Category: {$filters->category}" : null,
        ]));
    }

    private function record(ReportDefinition $definition, ReportFilters $filters, ?User $user, string $action, string $source, ?string $format, string $status, array $attributes): ReportExport
    {
        return ReportExport::create([
            'user_id' => $user?->id,
            'action' => $action,
            'source' => $source,
            'report_key' => $definition->key,
            'report_name' => $definition->name,
            'category' => $definition->category,
            'format' => $format,
            'filters' => $filters->toArray() ?: null,
            'status' => $status,
            ...$attributes,
        ]);
    }
}
