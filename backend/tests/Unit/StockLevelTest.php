<?php

namespace Tests\Unit;

use App\Support\StockLevel;
use PHPUnit\Framework\TestCase;

class StockLevelTest extends TestCase
{
    public function test_v1_boundaries_return_the_expected_condition_priority_and_alert(): void
    {
        $cases = [
            0 => [StockLevel::OUT_OF_STOCK, 'Critical', StockLevel::OUT_OF_STOCK],
            1 => [StockLevel::CRITICAL_STOCK, 'Critical', StockLevel::CRITICAL_STOCK],
            10 => [StockLevel::CRITICAL_STOCK, 'Critical', StockLevel::CRITICAL_STOCK],
            11 => [StockLevel::LOW_STOCK, 'High', StockLevel::LOW_STOCK],
            20 => [StockLevel::LOW_STOCK, 'High', StockLevel::LOW_STOCK],
            21 => [StockLevel::REORDER_RANGE, 'Medium', null],
            30 => [StockLevel::REORDER_RANGE, 'Medium', null],
            31 => [StockLevel::NORMAL, 'Low', null],
            100 => [StockLevel::NORMAL, 'Low', null],
        ];

        foreach ($cases as $quantity => [$condition, $priority, $alert]) {
            $this->assertSame(
                compact('condition', 'priority', 'alert'),
                StockLevel::classify($quantity),
                "Unexpected stock classification for quantity {$quantity}",
            );
        }
    }

    public function test_negative_historical_quantity_is_classified_as_out_of_stock(): void
    {
        $this->assertSame(StockLevel::OUT_OF_STOCK, StockLevel::classify(-1)['condition']);
        $this->assertSame('Critical', StockLevel::priority(-1));
    }
}
