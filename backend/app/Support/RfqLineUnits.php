<?php

namespace App\Support;

use App\Models\Product;
use App\Models\ReplenishmentRequest;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

final class RfqLineUnits
{
    /** Normalize representation only; never convert stock quantities or legacy units. */
    public static function canonical(?string $unit): ?string
    {
        $canonical = mb_strtoupper(trim($unit ?? ''));
        return in_array($canonical, Product::PACKAGE_UNITS, true) ? $canonical : $unit;
    }

    public static function normalizeRequest(Request $request): void
    {
        $lines = $request->input('lines');
        if (! is_array($lines)) return;
        foreach ($lines as &$line) {
            if (is_array($line) && is_string($line['unit'] ?? null)) {
                $line['unit'] = self::canonical($line['unit']);
            }
        }
        unset($line);
        $request->merge(['lines' => $lines]);
    }

    public static function assertMatches(ReplenishmentRequest $requirement, array $line, int|string $index): void
    {
        $product = $requirement->product;
        $errors = [];
        if ($requirement->product_id !== $line['product_id']) {
            $errors["lines.{$index}.product_id"] = ["Product identity no longer matches {$requirement->request_no}. Reload the approved requirement."];
        }
        if ((int) $requirement->requested_qty !== (int) $line['required_quantity']) {
            $errors["lines.{$index}.required_quantity"] = ["Approved quantity for {$product->name} is {$requirement->requested_qty}. Reload the approved requirement."];
        }
        $expected = self::canonical($product->unit);
        if ($expected !== $line['unit']) {
            $errors["lines.{$index}.unit"] = ["{$product->name} — Invalid stock unit. Expected {$expected}. Reload the approved requirement; stock units cannot be converted."];
        }
        if ($errors) throw ValidationException::withMessages($errors);
    }
}
