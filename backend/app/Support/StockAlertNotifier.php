<?php

namespace App\Support;

use App\Models\Inventory;
use App\Models\User;
use App\Notifications\WorkflowNotification;

final class StockAlertNotifier
{
    public static function notifyTransition(Inventory $inventory, int $oldQuantity, int $newQuantity): void
    {
        $alert = StockLevel::alertTransition($oldQuantity, $newQuantity);
        if ($alert === null) {
            return;
        }

        $inventory->loadMissing(['product:id,name', 'warehouse:id,name']);
        $productName = $inventory->product?->name ?? $inventory->barcode;

        [$title, $message, $type] = match ($alert) {
            StockLevel::LOW_STOCK => [
                'Low Stock',
                "{$productName} has reached a low stock level. Current quantity: {$newQuantity} units.",
                'warning',
            ],
            StockLevel::CRITICAL_STOCK => [
                'Critical Stock',
                "{$productName} has reached a critical stock level. Current quantity: {$newQuantity} units. Replenishment should be prioritized.",
                'error',
            ],
            default => [
                'Out of Stock',
                "{$productName} is out of stock. Immediate replenishment is required.",
                'error',
            ],
        };

        $recipients = User::query()
            ->where('status', 'ACTIVE')
            ->where('warehouse_id', $inventory->warehouse_id)
            ->whereHas('role', fn ($query) => $query->where('slug', 'PLANT_MANAGER'))
            ->get();

        WorkflowNotificationSender::send($recipients, new WorkflowNotification(
            $title,
            $message,
            $type,
            $inventory->barcode,
            'Inventory',
        ));
    }
}
