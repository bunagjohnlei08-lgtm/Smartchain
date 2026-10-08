<?php

namespace App\Support;

use App\Models\Inventory;
use App\Models\Product;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warehouse;
use App\Notifications\WorkflowNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Explicit Admin catalog setup: Supplier/Product association and the
 * Product/Warehouse inventory assignment. Callers must hold a transaction
 * and a row lock on the product, which serializes these writes per product.
 */
final class ProductCatalogSetup
{
    public const WAREHOUSE_ACTIVE = 'Active';

    /** Lock and return an ACTIVE supplier, or fail validation. Never falls back to an inactive one. */
    public static function lockActiveSupplier(int $supplierId, string $field = 'supplier_id'): Supplier
    {
        $supplier = Supplier::query()->lockForUpdate()->find($supplierId);
        if (! $supplier || $supplier->status !== Supplier::STATUS_ACTIVE) {
            throw ValidationException::withMessages([$field => ['Select an active supplier.']]);
        }

        return $supplier;
    }

    public static function lockActiveWarehouse(int $warehouseId, string $field = 'warehouse_id'): Warehouse
    {
        $warehouse = Warehouse::query()->lockForUpdate()->find($warehouseId);
        if (! $warehouse || $warehouse->status !== self::WAREHOUSE_ACTIVE) {
            throw ValidationException::withMessages([$field => ['Select an active warehouse.']]);
        }

        return $warehouse;
    }

    /**
     * Create the association if missing (never duplicates it). The first
     * supplier of a product becomes its primary supplier.
     *
     * @return array{linked: bool, primary_changed: bool}
     */
    public static function attachSupplier(Product $product, Supplier $supplier, bool $makePrimary, ?User $actor = null): array
    {
        $pivot = DB::table('product_supplier')->where('product_id', $product->id);
        $existing = (clone $pivot)->where('supplier_id', $supplier->id)->first();
        $currentPrimaryId = (clone $pivot)->where('is_primary', true)->value('supplier_id');
        $becomesPrimary = $makePrimary || $currentPrimaryId === null;
        $primaryChanged = $becomesPrimary && (int) $currentPrimaryId !== $supplier->id;

        if ($primaryChanged && $currentPrimaryId !== null) {
            (clone $pivot)->where('is_primary', true)->update(['is_primary' => false, 'updated_at' => now()]);
        }
        if (! $existing) {
            DB::table('product_supplier')->insert([
                'product_id' => $product->id, 'supplier_id' => $supplier->id,
                'is_primary' => $becomesPrimary, 'created_at' => now(), 'updated_at' => now(),
            ]);
        } elseif ($primaryChanged) {
            (clone $pivot)->where('supplier_id', $supplier->id)->update(['is_primary' => true, 'updated_at' => now()]);
        }

        if (! $existing) {
            AuditLogger::success('PRODUCT_SUPPLIER_LINKED', AuditLogger::MODULE_INVENTORY, [
                'actor' => $actor, 'resource' => $product, 'resource_label' => $product->name,
                'details' => "Linked {$product->name} to supplier {$supplier->name}".($becomesPrimary ? ' as primary supplier.' : '.'),
                'metadata' => ['supplier_id' => $supplier->id, 'is_primary' => $becomesPrimary],
            ]);
        }
        if ($primaryChanged && $currentPrimaryId !== null) {
            AuditLogger::success('PRODUCT_PRIMARY_SUPPLIER_CHANGED', AuditLogger::MODULE_INVENTORY, [
                'actor' => $actor, 'resource' => $product, 'resource_label' => $product->name,
                'details' => "Primary supplier of {$product->name} changed to {$supplier->name}.",
                'metadata' => ['previous_supplier_id' => (int) $currentPrimaryId, 'supplier_id' => $supplier->id],
            ]);
        }

        return ['linked' => ! $existing, 'primary_changed' => $primaryChanged];
    }

    /**
     * Reuse the Product/Warehouse inventory row or create it with zero stock.
     *
     * @return array{0: Inventory, 1: bool} the row and whether it was created
     */
    public static function ensureInventory(Product $product, Warehouse $warehouse, ?User $actor = null): array
    {
        $inventory = Inventory::query()->where('product_id', $product->id)
            ->where('warehouse_id', $warehouse->id)->lockForUpdate()->first();
        if ($inventory) {
            return [$inventory, false];
        }

        $inventory = Inventory::create([
            'barcode' => self::uniqueBarcode(), 'product_id' => $product->id, 'warehouse_id' => $warehouse->id,
            'available_stock' => 0, 'reserved_stock' => 0, 'backload' => 0,
            'status' => 'Out of Stock', 'pending_receiving' => false,
        ]);
        AuditLogger::success('PRODUCT_WAREHOUSE_ASSIGNED', AuditLogger::MODULE_INVENTORY, [
            'actor' => $actor, 'resource' => $inventory, 'resource_label' => $inventory->barcode,
            'details' => "Assigned {$product->name} to {$warehouse->name} with an empty inventory record.",
            'metadata' => ['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'available_stock' => 0],
        ]);

        return [$inventory, true];
    }

    /** Tell the warehouse's Plant Managers about a newly stocked-for-replenishment product. */
    public static function notifyNewProduct(Product $product, Warehouse $warehouse, ?Supplier $supplier, int $availableStock): void
    {
        $productId = $product->id;
        $message = $supplier
            ? "{$product->name} has been added to {$warehouse->name} and assigned to {$supplier->name}."
            : "{$product->name} has been added to {$warehouse->name}.";
        if (StockLevel::needsReplenishment($availableStock)) {
            $message .= $availableStock === 0
                ? ' The product currently requires replenishment.'
                : ' The product is within the replenishment threshold.';
        }

        DB::afterCommit(function () use ($warehouse, $message, $productId, $product): void {
            $plantManagers = User::query()->where('status', 'ACTIVE')->where('warehouse_id', $warehouse->id)
                ->whereHas('role', fn ($role) => $role->where('slug', 'PLANT_MANAGER'))->get();
            WorkflowNotificationSender::send($plantManagers, new WorkflowNotification(
                'New Product Added', $message, 'info', $product->name, 'Procurement',
                ['product_id' => $productId, 'warehouse_id' => $warehouse->id, 'path' => '/plant-manager/procurement'],
            ));
        });
    }

    private static function uniqueBarcode(): string
    {
        do {
            $barcode = (string) random_int(2000000000000, 2999999999999);
        } while (Inventory::query()->where('barcode', $barcode)->exists());

        return $barcode;
    }
}
