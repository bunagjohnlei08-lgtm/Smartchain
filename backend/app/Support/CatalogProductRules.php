<?php

namespace App\Support;

use App\Models\Inventory;
use App\Models\Product;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

final class CatalogProductRules
{
    public static function supportedUnits(Warehouse $warehouse): array
    {
        $snapshot = WarehouseCapacity::snapshot($warehouse);
        return $snapshot['allocation_configured'] ? array_values(array_filter(WarehouseCapacity::UNITS,
            fn ($unit) => $snapshot['unit_capacity'][$unit]['allocated'] > 0)) : [];
    }

    public static function ensureSupported(Warehouse $warehouse, ?string $unit): void
    {
        if (! in_array(WarehouseCapacity::normalizeUnit($unit), self::supportedUnits($warehouse), true)) {
            throw ValidationException::withMessages(['unit' => "The selected Stock Unit is not supported by {$warehouse->name}. Configure its allocations in Manage Locations → Edit Location."]);
        }
    }

    public static function warehouseOptions(): array
    {
        return Warehouse::query()->where('status', ProductCatalogSetup::WAREHOUSE_ACTIVE)->orderBy('name')->get()
            ->map(fn ($warehouse) => ['id' => $warehouse->id, 'name' => $warehouse->name,
                'supported_units' => self::supportedUnits($warehouse), 'allocation_configured' => WarehouseCapacity::snapshot($warehouse)['allocation_configured']])->all();
    }

    /** Real history blocks editing/deletion irrespective of current quantities or terminal status. */
    public static function historyReferences(Product $product): array
    {
        $references = [];
        foreach (['order_items', 'receiving_items', 'replenishment_requests', 'stock_out_transactions', 'production_batches', 'production_batch_materials', 'bom_materials', 'boms'] as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'product_id') && DB::table($table)->where('product_id', $product->id)->exists()) {
                $references[] = $table;
            }
        }
        // Earlier POs stored names only. Include known original catalog names from setup audits.
        $names = self::knownNames($product);
        // Legacy customer orders also resolved products by their name when the ID was absent.
        if (DB::table('order_items')->whereNull('product_id')->whereIn('product_name', $names)->exists()) {
            $references[] = 'order_items';
        }
        if (DB::table('purchase_order_items')->where(fn ($query) => $query->where('product_id', $product->id)
            ->orWhere(fn ($legacy) => $legacy->whereNull('product_id')->whereIn('product_name', $names)))->exists()) {
            $references[] = 'purchase_order_items';
        }
        $inventoryIds = $product->inventories()->pluck('id');
        // Retain real manual adjustment history even if an older API removed its stock row.
        $historicalIds = DB::table('audit_logs')->where('resource_type', 'Inventory')->where('action', 'PRODUCT_WAREHOUSE_ASSIGNED')
            ->where('metadata->product_id', $product->id)->pluck('resource_id');
        $inventoryIds = $inventoryIds->merge($historicalIds)->unique();
        if (DB::table('audit_logs')->where('resource_type', 'Inventory')->whereIn('resource_id', $inventoryIds)
            ->where('action', 'INVENTORY_ADJUSTED')->exists()) $references[] = 'audit_logs (inventory adjustments)';
        foreach (['inventory_audit_items', 'stock_out_transactions', 'production_material_issues'] as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'inventory_id') && DB::table($table)->whereIn('inventory_id', $inventoryIds)->exists()) {
                $references[] = $table;
            }
        }
        return array_values(array_unique($references));
    }

    private static function knownNames(Product $product): array
    {
        $names = [$product->name];
        foreach (DB::table('audit_logs')->where('resource_type', 'Product')->where('resource_id', (string) $product->id)->get(['resource_label', 'metadata']) as $audit) {
            $metadata = $audit->metadata ? json_decode($audit->metadata, true) : [];
            // Labels are truncated to 250 characters; rename metadata keeps the full old identity.
            foreach ([$audit->resource_label, $metadata['changes']['name']['from'] ?? null, $metadata['changes']['name']['to'] ?? null] as $name) {
                if (is_string($name) && $name !== '') $names[] = $name;
            }
        }
        return array_values(array_unique($names));
    }

    public static function isDisposableSetup(Inventory $inventory): bool
    {
        if ($inventory->has_stock_history || $inventory->available_stock !== 0 || $inventory->reserved_stock !== 0 || $inventory->backload !== 0 || $inventory->returned_stock !== 0 || $inventory->pending_receiving) return false;
        if ($inventory->catalog_setup_at !== null) return true;
        // Existing zero-stock setup is accepted only with the original setup audit and no later adjustment.
        $audit = DB::table('audit_logs')->where('resource_type', 'Inventory')->where('resource_id', (string) $inventory->id);
        return (clone $audit)->where('action', 'PRODUCT_WAREHOUSE_ASSIGNED')->exists()
            && ! (clone $audit)->where('action', 'INVENTORY_ADJUSTED')->exists()
            && $inventory->created_at?->equalTo($inventory->updated_at);
    }

    public static function unitChangeReason(Product $product): ?string
    {
        $references = self::historyReferences($product);
        if ($references !== []) return 'Stock Unit cannot change because this product has business history or BOM dependencies: '.implode(', ', $references).'. No unit conversion is supported.';
        if ($product->inventories()->get()->contains(fn ($inventory) => ! self::isDisposableSetup($inventory))) {
            return 'Stock Unit cannot change because inventory has stock, reservations, returned stock, backload, pending receiving, or is not proven unused catalog setup.';
        }
        return null;
    }

    public static function ensureClassificationChange(Product $product, string $classification): void
    {
        if ($classification === $product->item_classification) return;
        if (DB::table('production_batches')->where('product_id', $product->id)->exists()
            || DB::table('production_batch_materials')->where('product_id', $product->id)->exists()) {
            throw ValidationException::withMessages(['item_classification' => 'Production history fixes this product\'s material or output role. Keep its classification to preserve that history.']);
        }
        if (Schema::hasTable('boms') && (DB::table('boms')->where('product_id', $product->id)->exists()
            || DB::table('bom_materials')->where('product_id', $product->id)->exists())) {
            throw ValidationException::withMessages(['item_classification' => 'This product is used by a configured BOM. Update its production dependencies before reclassifying it.']);
        }
        if ($classification === Product::RAW_MATERIAL && DB::table('order_items')->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where(fn ($query) => $query->where('order_items.product_id', $product->id)
                ->orWhere(fn ($legacy) => $legacy->whereNull('order_items.product_id')->whereIn('order_items.product_name', self::knownNames($product))))
            ->whereNotIn('orders.status', ['DELIVERED', 'CANCELLED'])->exists()) {
            throw ValidationException::withMessages(['item_classification' => 'An active customer order uses this product. Finish or cancel that order before classifying it as a raw material.']);
        }
    }
}
