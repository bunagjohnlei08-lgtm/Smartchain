<?php

namespace App\Reports;

use Closure;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;

/**
 * One predefined, allowlisted report. Clients can only pick a definition by
 * key and supply the filters it declares; columns and data sources are fixed
 * server-side.
 */
final class ReportDefinition
{
    public const FILTERS = ['date', 'warehouse', 'product', 'supplier', 'status', 'movement_type', 'category'];

    /**
     * @param  array<string, array{0: string, 1: string}>  $columns  key => [label, type]
     * @param  list<string>  $filters
     * @param  array<string, string>  $statuses  value => label
     * @param  list<string>  $formats
     */
    public function __construct(
        public readonly string $key,
        public readonly string $name,
        public readonly string $description,
        public readonly string $category,
        public readonly array $columns,
        public readonly array $filters = [],
        public readonly array $statuses = [],
        public readonly array $formats = ['CSV', 'XLSX', 'PDF'],
        public readonly ?string $dateLabel = null,
        private readonly ?Closure $source = null,
        public readonly ?string $unavailableReason = null,
    ) {}

    public function available(): bool
    {
        return $this->unavailableReason === null && $this->source !== null;
    }

    public function allows(string $filter): bool
    {
        return in_array($filter, $this->filters, true);
    }

    public function supportsFormat(string $format): bool
    {
        return $this->available() && in_array($format, $this->formats, true);
    }

    /** Ordered query (paginated/chunked by the runner) or a small in-memory collection. */
    public function source(ReportFilters $filters): Builder|Collection
    {
        return ($this->source)($filters);
    }

    public function categoryLabel(): string
    {
        return ReportRegistry::CATEGORIES[$this->category] ?? $this->category;
    }

    public function toArray(): array
    {
        return [
            'key' => $this->key,
            'name' => $this->name,
            'description' => $this->description,
            'category' => $this->category,
            'category_label' => $this->categoryLabel(),
            'formats' => $this->available() ? $this->formats : [],
            'filters' => $this->filters,
            'date_label' => $this->dateLabel,
            'statuses' => collect($this->statuses)->map(fn (string $label, string $value) => ['value' => $value, 'label' => $label])->values(),
            'columns' => collect($this->columns)->map(fn (array $column, string $key) => ['key' => $key, 'label' => $column[0], 'type' => $column[1]])->values(),
            'available' => $this->available(),
            'unavailable_reason' => $this->unavailableReason,
        ];
    }
}
