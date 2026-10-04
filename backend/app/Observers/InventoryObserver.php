<?php

namespace App\Observers;

use App\Models\Inventory;
use App\Support\StockAlertNotifier;

class InventoryObserver
{
    public function updated(Inventory $inventory): void
    {
        if (! $inventory->wasChanged('available_stock')) {
            return;
        }

        StockAlertNotifier::notifyTransition(
            $inventory,
            (int) $inventory->getOriginal('available_stock'),
            (int) $inventory->available_stock,
        );
    }
}
