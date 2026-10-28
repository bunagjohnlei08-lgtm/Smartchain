<?php

namespace App\Services;

use App\Models\Inventory;
use App\Models\ReplenishmentRequest;
use App\Support\WarehouseCapacity;
use Carbon\CarbonImmutable;

final class ForecastReorderService
{
    public const DISCRETE_UNITS = ['PCS', 'SACK', 'DRUM'];

    public function __construct(private readonly AIForecastGateway $forecasts) {}

    /** @return array<string, mixed> */
    public function recommendation(Inventory $inventory): array
    {
        $inventory->loadMissing(['product:id,name,unit,item_classification', 'warehouse:id,name']);
        $product = $inventory->product;
        $unit = WarehouseCapacity::normalizeUnit($product?->unit);
        $warehouseCount = Inventory::query()->where('product_id', $inventory->product_id)->count();
        $activeRequest = ReplenishmentRequest::query()
            ->where('product_id', $inventory->product_id)
            ->where('warehouse_id', $inventory->warehouse_id)
            ->active()->latest('id')->first();

        $base = [
            'product_id' => $inventory->product_id,
            'product_name' => $product?->name,
            'item_classification' => $product?->item_classification,
            'warehouse_id' => $inventory->warehouse_id,
            'warehouse_name' => $inventory->warehouse?->name,
            'unit' => $unit,
            'available_stock' => (int) $inventory->available_stock,
            'eligible_confirmed_incoming' => 0,
            'incoming_data_supported' => false,
            'incoming_note' => 'Supplier-confirmed incoming quantities are not represented by the current procurement workflow.',
            'existing_request' => $activeRequest ? [
                'id' => $activeRequest->id,
                'reference' => $activeRequest->request_no,
                'status' => $activeRequest->lifecycleStatus(),
            ] : null,
        ];

        if (! in_array($unit, self::DISCRETE_UNITS, true)) {
            return [...$base, 'status' => 'UNSUPPORTED_UNIT', 'actionable' => false,
                'message' => "{$unit} is not configured as a discrete package unit; its existing quantity rules were preserved."];
        }
        if ($warehouseCount !== 1) {
            return [...$base, 'status' => 'WAREHOUSE_SCOPE_UNAVAILABLE', 'actionable' => false,
                'message' => 'The trained demand forecast is company-wide and this product exists in multiple warehouses, so SmartChain will not copy it into this warehouse.'];
        }

        $forecast = $this->forecasts->forecast((int) $inventory->product_id);
        if (! isset($forecast['generated_at'], $forecast['horizon_weeks'])) {
            throw new \Symfony\Component\HttpKernel\Exception\HttpException(502, 'AI forecasting service returned incomplete planning metadata.');
        }
        $rawDemand = collect($forecast['forecast'])->sum(fn (array $week) => (float) $week['expected_quantity']);
        $netNeed = max(0.0, $rawDemand - (int) $inventory->available_stock);
        $recommended = $netNeed > 0 ? (int) ceil($netNeed) : 0;
        $generatedAt = CarbonImmutable::parse((string) $forecast['generated_at']);

        return [...$base,
            'status' => $recommended > 0 ? 'REORDER_RECOMMENDED' : 'NO_REORDER_NEEDED',
            'actionable' => $recommended > 0 && $activeRequest === null,
            'raw_demand' => round($rawDemand, 3),
            'planning_demand' => $rawDemand > 0 ? (int) ceil($rawDemand) : 0,
            'net_need_raw' => round($netNeed, 3),
            'recommended_reorder' => $recommended,
            'horizon_weeks' => (int) $forecast['horizon_weeks'],
            'forecast' => $forecast['forecast'],
            'generated_at' => $generatedAt->toIso8601String(),
            'stale' => $generatedAt->lt(now()->subHours(24)),
            'model_version' => $forecast['model_version'] ?? null,
            'training_weeks' => $forecast['training_weeks'] ?? null,
            'model_quality' => $forecast['model_quality'] ?? null,
            'message' => $recommended > 0
                ? 'Four-week company demand is attributable to this sole inventory location; reorder is the final positive net need rounded up once.'
                : 'Available stock covers the four-week planning demand.',
        ];
    }
}
