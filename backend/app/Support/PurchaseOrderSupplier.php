<?php

namespace App\Support;

use App\Models\PurchaseOrder;
use App\Models\Supplier;
use App\Models\SupplierAlias;

class PurchaseOrderSupplier
{
    public function resolve(PurchaseOrder $order): ?Supplier
    {
        if ($order->supplier_id !== null) {
            return Supplier::query()->find($order->supplier_id);
        }

        $normalized = SupplierName::normalize($order->supplier_name);
        if ($normalized === '') return null;

        $matches = Supplier::query()
            ->whereRaw("LOWER(REGEXP_REPLACE(TRIM(name), '\\s+', ' ', 'g')) = ?", [$normalized])
            ->limit(2)
            ->get();

        if ($matches->count() === 1) return $matches->first();
        if ($matches->count() > 1) return null;

        $aliases = SupplierAlias::query()->with('supplier')->where('normalized_alias', $normalized)->limit(2)->get();
        $supplierIds = $aliases->pluck('supplier_id')->unique();

        return $aliases->count() > 0 && $supplierIds->count() === 1 ? $aliases->first()->supplier : null;
    }

    /**
     * Link legacy purchase orders to a registered supplier only when the exact
     * normalized name/alias resolves to exactly one supplier. Idempotent; never
     * touches supplier_name.
     */
    public function backfillMissingSupplierIds(): int
    {
        $linked = 0;
        PurchaseOrder::query()->whereNull('supplier_id')->orderBy('id')->chunkById(100, function ($orders) use (&$linked): void {
            foreach ($orders as $order) {
                $supplier = $this->resolve($order);
                if ($supplier) {
                    $order->updateQuietly(['supplier_id' => $supplier->id]);
                    $linked++;
                }
            }
        });

        return $linked;
    }
}
