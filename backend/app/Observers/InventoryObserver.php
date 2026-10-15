<?php

namespace App\Observers;

use App\Models\Inventory;
use App\Support\StockAlertNotifier;

class InventoryObserver
{
    public function saving(Inventory $inventory): void
    {
        if ($inventory->available_stock > 0 || $inventory->reserved_stock > 0 || $inventory->backload > 0
            || $inventory->getOriginal('available_stock') > 0 || $inventory->getOriginal('reserved_stock') > 0 || $inventory->getOriginal('backload') > 0) {
            // Once stock has existed, zero current quantity is not proof of unused setup.
            $inventory->catalog_setup_at = null;
            $inventory->has_stock_history = true;
        }
    }

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
