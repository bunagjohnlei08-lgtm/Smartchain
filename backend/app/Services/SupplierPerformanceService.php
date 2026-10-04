<?php

namespace App\Services;

use App\Models\PurchaseOrder;
use App\Models\ReceivingDiscrepancy;
use App\Models\Supplier;
use Illuminate\Support\Collection;

class SupplierPerformanceService
{
    /** @return array<int, array<string, mixed>> */
    public function summarize(Collection $suppliers): array
    {
        $rows = $suppliers->map(fn (Supplier $supplier) => $this->supplierSummary($supplier))->values();
        $highest = $rows->where('eligibility_status', 'ELIGIBLE')->max('overall_score');

        return $rows->map(function (array $row) use ($highest) {
            $row['is_top_supplier'] = $highest !== null
                && $row['eligibility_status'] === 'ELIGIBLE'
                && $row['overall_score'] === $highest;

            return $row;
        })->all();
    }

    /** @return array<string, mixed> */
    private function supplierSummary(Supplier $supplier): array
    {
        $nonCancelled = $supplier->purchaseOrders->where('status', '!=', PurchaseOrder::STATUS_CANCELLED);
        $eligibleOrders = $nonCancelled->whereIn('status', [PurchaseOrder::STATUS_COMPLETED, PurchaseOrder::STATUS_CLOSED_WITH_SHORTAGE]);
        $eligibleReceivings = $eligibleOrders->flatMap(function (PurchaseOrder $order) {
            return $order->receivings->each(fn ($receiving) => $receiving->setRelation('purchaseOrder', $order));
        })->whereNull('replacement_for_rejection_case_id')->values();

        $reliableDeliveries = $eligibleReceivings->filter(fn ($receiving) => $receiving->delivery_date && $receiving->purchaseOrder?->expected_delivery_date);
        $onTimeCount = $reliableDeliveries->filter(fn ($receiving) => $receiving->delivery_date->lte($receiving->purchaseOrder->expected_delivery_date))->count();

        $orderedQuantity = (int) $eligibleOrders->flatMap(fn (PurchaseOrder $order) => $order->items)->sum('ordered_quantity');
        $receivedQuantity = (int) $eligibleReceivings->flatMap(fn ($receiving) => $receiving->items)
            ->whereNotNull('purchase_order_item_id')->sum('delivered_quantity');

        $completedQaItems = $eligibleReceivings->filter(fn ($receiving) => $receiving->qaInspection?->completed_at)
            ->flatMap(fn ($receiving) => $receiving->qaInspection->items);
        $acceptedQuantity = (int) $completedQaItems->sum('accepted_quantity');
        $rejectedQuantity = (int) $completedQaItems->sum('rejected_quantity');
        $inspectedQuantity = $acceptedQuantity + $rejectedQuantity;

        $discrepancyCount = $eligibleReceivings->filter(fn ($receiving) => $receiving->discrepancy?->discrepancy_type === ReceivingDiscrepancy::TYPE_SHORT_DELIVERY
        )->count();
        $openDiscrepancies = $eligibleReceivings->filter(fn ($receiving) => $receiving->discrepancy
            && ! in_array($receiving->discrepancy->status, [ReceivingDiscrepancy::STATUS_RESOLVED, ReceivingDiscrepancy::STATUS_CLOSED_SHORTAGE], true))->count();
        $openRejections = $eligibleReceivings->flatMap(fn ($receiving) => $receiving->qaInspection?->items ?? collect())
            ->filter(fn ($item) => $item->supplierRejectionCase && $item->supplierRejectionCase->status !== 'RESOLVED')->count();

        $metrics = [
            'on_time_delivery' => $this->percentage($onTimeCount, $reliableDeliveries->count()),
            'fulfillment' => $this->percentage($receivedQuantity, $orderedQuantity, true),
            'qa_acceptance' => $this->percentage($acceptedQuantity, $inspectedQuantity),
            'discrepancy_rate' => $this->percentage($discrepancyCount, $eligibleReceivings->count()),
            'discrepancy_free' => $this->percentage($eligibleReceivings->count() - $discrepancyCount, $eligibleReceivings->count()),
        ];

        [$eligibility, $score, $scoringMessage] = $this->score($metrics, $eligibleReceivings->count());
        [$recognition, $recognitionMessage] = $this->recognition($score, $eligibility);

        return [
            'supplier' => [
                'id' => $supplier->id,
                'supplier_code' => $supplier->supplier_code,
                'name' => $supplier->name,
                'status' => $supplier->status,
            ],
            'metrics' => $metrics,
            'counts' => [
                'total_purchase_orders' => $nonCancelled->count(),
                'eligible_purchase_orders' => $eligibleOrders->count(),
                'eligible_deliveries' => $eligibleReceivings->count(),
                'reliable_on_time_deliveries' => $reliableDeliveries->count(),
                'ordered_quantity' => $orderedQuantity,
                'received_quantity' => $receivedQuantity,
                'inspected_quantity' => $inspectedQuantity,
                'accepted_quantity' => $acceptedQuantity,
                'rejected_quantity' => $rejectedQuantity,
                'discrepancy_deliveries' => $discrepancyCount,
                'open_supplier_issues' => $openDiscrepancies + $openRejections,
            ],
            'eligibility_status' => $eligibility,
            'overall_score' => $score,
            'recognition' => $recognition,
            'scoring_message' => $scoringMessage,
            'recognition_message' => $recognitionMessage,
            'is_top_supplier' => false,
        ];
    }

    private function percentage(int $numerator, int $denominator, bool $capAtHundred = false): ?float
    {
        if ($denominator <= 0) {
            return null;
        }
        $value = ($numerator / $denominator) * 100;

        return round($capAtHundred ? min($value, 100) : $value, 2);
    }

    /** @return array{string, ?float, string} */
    private function score(array $metrics, int $eligibleDeliveries): array
    {
        $minimum = config('supplier_performance.minimum_eligible_deliveries');
        $weights = config('supplier_performance.weights', []);
        $required = ['on_time_delivery', 'fulfillment', 'qa_acceptance', 'discrepancy_free'];
        $validWeights = collect($required)->every(fn ($key) => isset($weights[$key]) && is_numeric($weights[$key]) && (float) $weights[$key] >= 0)
            && abs(collect($required)->sum(fn ($key) => (float) $weights[$key]) - 100.0) < 0.001;

        if (! is_numeric($minimum) || (int) $minimum < 1 || (float) $minimum !== (float) (int) $minimum || ! $validWeights) {
            return ['SCORING_NOT_CONFIGURED', null, 'Performance scoring rules not yet configured. Individual operational metrics remain available.'];
        }
        if ($eligibleDeliveries < (int) $minimum) {
            return ['INSUFFICIENT_DATA', null, "Insufficient data: {$eligibleDeliveries} eligible deliveries; at least ".(int) $minimum.' are required.'];
        }
        if (collect($required)->contains(fn ($key) => $metrics[$key] === null)) {
            return ['INSUFFICIENT_DATA', null, 'Insufficient reliable data to calculate every configured metric.'];
        }

        $score = collect($required)->sum(fn ($key) => $metrics[$key] * ((float) $weights[$key] / 100));

        return ['ELIGIBLE', round($score, 2), 'Score calculated from centrally configured weights and eligible operational history.'];
    }

    /** @return array{?string, string} */
    private function recognition(?float $score, string $eligibility): array
    {
        if ($eligibility !== 'ELIGIBLE' || $score === null) {
            return [null, 'Recognition is unavailable until scoring eligibility is met.'];
        }

        $tiers = collect(config('supplier_performance.recognition_tiers', []))
            ->filter(fn ($tier) => is_array($tier) && isset($tier['label'], $tier['min_score']) && is_string($tier['label']) && is_numeric($tier['min_score']) && (float) $tier['min_score'] >= 0 && (float) $tier['min_score'] <= 100)
            ->sortByDesc(fn ($tier) => (float) $tier['min_score']);
        if ($tiers->isEmpty()) {
            return [null, 'Recognition thresholds are not configured.'];
        }

        $tier = $tiers->first(fn ($tier) => $score >= (float) $tier['min_score']);

        return [$tier['label'] ?? null, $tier ? 'Recognition follows the centrally configured score threshold.' : 'The score does not meet a configured recognition threshold.'];
    }
}
