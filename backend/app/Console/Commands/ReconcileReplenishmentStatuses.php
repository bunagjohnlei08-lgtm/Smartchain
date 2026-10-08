<?php

namespace App\Console\Commands;

use App\Models\ReplenishmentRequest;
use App\Support\ReplenishmentLifecycle;
use Illuminate\Console\Command;

class ReconcileReplenishmentStatuses extends Command
{
    protected $signature = 'replenishment:reconcile-statuses {--dry-run : Report changes without updating records}';

    protected $description = 'Synchronize PO-linked replenishment requests with their Purchase Order lifecycle';

    public function handle(ReplenishmentLifecycle $lifecycle): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $examined = 0;
        $changes = 0;

        ReplenishmentRequest::query()
            ->whereIn('status', [
                ReplenishmentRequest::STATUS_APPROVED,
                ReplenishmentRequest::STATUS_FOR_PURCHASE_ORDER,
                ReplenishmentRequest::STATUS_PO_CREATED,
            ])
            ->whereHas('purchaseOrder')
            ->with('purchaseOrder:id,replenishment_request_id,po_number,status')
            ->orderBy('id')
            ->chunkById(100, function ($requests) use ($lifecycle, $dryRun, &$examined, &$changes) {
                foreach ($requests as $request) {
                    $examined++;
                    $target = $lifecycle->statusForPurchaseOrder($request->purchaseOrder);
                    if ($request->status === $target) {
                        continue;
                    }

                    $changes++;
                    $this->line("{$request->request_no}: {$request->status} -> {$target} ({$request->purchaseOrder->po_number})");
                    if (! $dryRun) {
                        $lifecycle->synchronize($request->purchaseOrder);
                    }
                }
            });

        $verb = $dryRun ? 'Would update' : 'Updated';
        $this->info("{$verb} {$changes} of {$examined} linked replenishment request(s).");

        return self::SUCCESS;
    }
}
