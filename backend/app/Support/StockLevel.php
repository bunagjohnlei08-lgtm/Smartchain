<?php

namespace App\Support;

final class StockLevel
{
    public const NORMAL = 'NORMAL';

    public const REORDER_RANGE = 'REORDER_RANGE';

    public const LOW_STOCK = 'LOW_STOCK';

    public const CRITICAL_STOCK = 'CRITICAL_STOCK';

    public const OUT_OF_STOCK = 'OUT_OF_STOCK';

    /**
     * @return array{condition: string, priority: string, alert: ?string}
     */
    public static function classify(int $quantity): array
    {
        if ($quantity <= 0) {
            return ['condition' => self::OUT_OF_STOCK, 'priority' => 'Critical', 'alert' => self::OUT_OF_STOCK];
        }

        if ($quantity <= 10) {
            return ['condition' => self::CRITICAL_STOCK, 'priority' => 'Critical', 'alert' => self::CRITICAL_STOCK];
        }

        if ($quantity <= 20) {
            return ['condition' => self::LOW_STOCK, 'priority' => 'High', 'alert' => self::LOW_STOCK];
        }

        if ($quantity <= 30) {
            return ['condition' => self::REORDER_RANGE, 'priority' => 'Medium', 'alert' => null];
        }

        return ['condition' => self::NORMAL, 'priority' => 'Low', 'alert' => null];
    }

    public static function priority(int $quantity): string
    {
        return self::classify($quantity)['priority'];
    }

    public static function needsReplenishment(int $quantity): bool
    {
        return $quantity <= 30;
    }

    public static function alertTransition(int $oldQuantity, int $newQuantity): ?string
    {
        if ($newQuantity >= $oldQuantity) {
            return null;
        }

        $oldAlert = self::classify($oldQuantity)['alert'];
        $newAlert = self::classify($newQuantity)['alert'];

        return self::severity($newAlert) > self::severity($oldAlert) ? $newAlert : null;
    }

    private static function severity(?string $alert): int
    {
        return match ($alert) {
            self::LOW_STOCK => 1,
            self::CRITICAL_STOCK => 2,
            self::OUT_OF_STOCK => 3,
            default => 0,
        };
    }
}
