<?php

namespace App\Reports;

use Illuminate\Support\Carbon;

/** Server-validated filter values. Built only by ReportRequest. */
final class ReportFilters
{
    public function __construct(
        public readonly ?Carbon $dateFrom = null,
        public readonly ?Carbon $dateTo = null,
        public readonly ?int $warehouseId = null,
        public readonly ?int $productId = null,
        public readonly ?int $supplierId = null,
        public readonly ?string $status = null,
        public readonly ?string $movementType = null,
        public readonly ?string $category = null,
    ) {}

    /** Request-shaped representation used for history, audit metadata and schedules. */
    public function toArray(): array
    {
        return array_filter([
            'date_from' => $this->dateFrom?->toDateString(),
            'date_to' => $this->dateTo?->toDateString(),
            'warehouse_id' => $this->warehouseId,
            'product_id' => $this->productId,
            'supplier_id' => $this->supplierId,
            'status' => $this->status,
            'movement_type' => $this->movementType,
            'category' => $this->category,
        ], fn ($value) => $value !== null && $value !== '');
    }
}
