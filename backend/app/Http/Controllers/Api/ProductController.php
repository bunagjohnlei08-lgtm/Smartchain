<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Supplier;
use App\Support\AuditLogger;
use App\Support\ProductCatalogSetup;
use App\Support\StockLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    public const STATUS_SETUP_REQUIRED = 'SETUP REQUIRED';

    public const STATUSES = [self::STATUS_SETUP_REQUIRED, 'OUT OF STOCK', 'LOW STOCK', 'IN STOCK'];

    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:255'],
            'brand' => ['nullable', 'string', 'max:255'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'status' => ['nullable', Rule::in(self::STATUSES)],
            'sort_by' => ['nullable', Rule::in(['name', 'category', 'brand', 'cost_price', 'selling_price', 'reorder_level', 'current_stock', 'created_at'])],
            'sort_direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = Product::query()->with(['inventories.warehouse', 'suppliers:id,name,status']);
        if ($search = $validated['search'] ?? null) {
            $query->where(fn ($q) => $q->where('name', 'like', "%{$search}%")
                ->orWhere('category', 'like', "%{$search}%")
                ->orWhere('brand', 'like', "%{$search}%"));
        }
        foreach (['category', 'brand'] as $field) {
            if (! empty($validated[$field])) {
                $query->where($field, $validated[$field]);
            }
        }
        if (! empty($validated['warehouse_id'])) {
            $query->whereHas('inventories', fn ($q) => $q->where('warehouse_id', $validated['warehouse_id']));
        }

        $products = $query->get()->map(fn (Product $product) => $this->present($product));
        if (! empty($validated['status'])) {
            $products = $products->where('status', $validated['status'])->values();
        }

        $sortBy = $validated['sort_by'] ?? 'name';
        $descending = ($validated['sort_direction'] ?? 'asc') === 'desc';
        $products = $products->sortBy($sortBy, SORT_NATURAL | SORT_FLAG_CASE, $descending)->values();

        $allProducts = Product::query()->with(['inventories:id,product_id,available_stock', 'suppliers:id,name,status'])->get();
        $summaryRows = $allProducts->map(fn (Product $product) => $this->present($product));
        $page = (int) ($validated['page'] ?? 1);
        $perPage = (int) ($validated['per_page'] ?? 15);

        $lastPage = max(1, (int) ceil($products->count() / $perPage));

        return response()->json([
            'data' => $products->forPage($page, $perPage)->values(),
            'current_page' => $page,
            'per_page' => $perPage,
            'total' => $products->count(),
            'last_page' => $lastPage,
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $products->count(),
                'last_page' => $lastPage,
            ],
            'summary' => [
                'total_products' => $summaryRows->count(),
                'low_stock_items' => $summaryRows->where('status', 'LOW STOCK')->count(),
                'out_of_stock' => $summaryRows->where('status', 'OUT OF STOCK')->count(),
                'setup_required' => $summaryRows->where('status', self::STATUS_SETUP_REQUIRED)->count(),
                'total_inventory_value' => $summaryRows->contains(fn (array $row) => $row['inventory_value'] === null)
                    ? null : round($summaryRows->sum('inventory_value'), 2),
            ],
            'filters' => [
                'categories' => $allProducts->pluck('category')->filter()->unique()->sort()->values(),
                'brands' => $allProducts->pluck('brand')->filter()->unique()->sort()->values(),
                'suppliers' => $allProducts->pluck('suppliers')->flatten()->pluck('name')->unique()->sort()->values(),
                'warehouses' => DB::table('warehouses')->orderBy('name')->get(['id', 'name']),
                'statuses' => self::STATUSES,
            ],
            'assignment_options' => [
                'suppliers' => Supplier::query()->where('status', Supplier::STATUS_ACTIVE)->orderBy('name')->get(['id', 'name']),
                'warehouses' => DB::table('warehouses')->where('status', ProductCatalogSetup::WAREHOUSE_ACTIVE)->orderBy('name')->get(['id', 'name']),
                'unit' => Product::DEFAULT_UNIT,
                'replenishment_threshold' => 30,
            ],
        ]);
    }

    public function options(Request $request): JsonResponse
    {
        abort_unless(
            $request->user()?->isAdmin() || $request->user()?->isPlantManager(),
            403,
            'Product Catalog access is required.'
        );

        $perPage = min(max($request->integer('per_page', 100), 1), 100);
        return response()->json(Product::query()->orderBy('name')->paginate($perPage, ['id', 'name', 'category']));
    }

    public function show(Request $request, Product $product): JsonResponse
    {
        $this->authorizeAdmin($request);
        return response()->json($this->present($product->load(['inventories.warehouse', 'suppliers:id,name,status'])));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        // New catalog products must be procurement-ready: an ACTIVE supplier and a warehouse inventory row.
        $validated = $this->validatedProduct($request, null, [
            'supplier_id' => ['required', 'integer'],
            'warehouse_id' => ['required', 'integer'],
        ], [
            'supplier_id.required' => 'Select an assigned supplier.',
            'warehouse_id.required' => 'Select a warehouse.',
        ]);
        $assignment = array_intersect_key($validated, array_flip(['supplier_id', 'warehouse_id']));
        $attributes = array_diff_key($validated, $assignment);

        $product = DB::transaction(function () use ($attributes, $assignment, $request) {
            $product = Product::create([...$attributes, 'unit' => Product::DEFAULT_UNIT]);
            AuditLogger::success('PRODUCT_CREATED', AuditLogger::MODULE_INVENTORY, [
                'resource' => $product, 'resource_label' => $product->name,
                'details' => "Created catalog product {$product->name}.",
            ]);
            $this->applyAssignment($product, (int) $assignment['supplier_id'], (int) $assignment['warehouse_id'], $request);

            return $product;
        });

        return response()->json($this->present($product->load(['inventories.warehouse', 'suppliers:id,name,status'])), 201);
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        $this->authorizeAdmin($request);
        // Supplier is optional for legacy products; warehouse assignment is never changed here.
        $validated = $this->validatedProduct($request, $product, ['supplier_id' => ['nullable', 'integer']]);
        $assignment = array_intersect_key($validated, ['supplier_id' => true]);
        $attributes = array_diff_key($validated, $assignment);
        DB::transaction(function () use ($product, $attributes, $assignment, $request) {
            $product->update($attributes);
            if (! empty($assignment['supplier_id'])) {
                $this->applyAssignment($product, (int) $assignment['supplier_id'], null, $request);
            }
        });
        return response()->json($this->present($product->fresh()->load(['inventories.warehouse', 'suppliers:id,name,status'])));
    }

    /** Explicit Admin mapping of existing (legacy) products to one supplier. */
    public function bulkAssignSupplier(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $validated = $request->validate([
            'product_ids' => ['required', 'array', 'min:1', 'max:100'],
            'product_ids.*' => ['required', 'integer', 'distinct', 'exists:products,id'],
            'supplier_id' => ['required', 'integer'],
            'make_primary' => ['sometimes', 'boolean'],
        ]);

        $result = DB::transaction(function () use ($validated, $request) {
            $supplier = ProductCatalogSetup::lockActiveSupplier((int) $validated['supplier_id']);
            $products = Product::query()->whereIn('id', $validated['product_ids'])->orderBy('id')->lockForUpdate()->get();
            $linked = 0;
            foreach ($products as $product) {
                $outcome = ProductCatalogSetup::attachSupplier($product, $supplier, (bool) ($validated['make_primary'] ?? false), $request->user());
                $linked += $outcome['linked'] ? 1 : 0;
            }
            AuditLogger::success('PRODUCT_SUPPLIER_BULK_MAPPED', AuditLogger::MODULE_INVENTORY, [
                'resource' => $supplier, 'resource_label' => $supplier->name,
                'details' => "Mapped {$products->count()} product(s) to {$supplier->name}; {$linked} new association(s).",
                'metadata' => ['product_ids' => $products->pluck('id')->all(), 'new_links' => $linked],
            ]);

            return ['products' => $products->count(), 'new_links' => $linked, 'already_linked' => $products->count() - $linked];
        });

        return response()->json(['message' => 'Supplier mapping applied.', 'data' => $result]);
    }

    /** Explicit Admin assignment of a product to a warehouse (creates an empty inventory row). */
    public function assignWarehouse(Request $request, Product $product): JsonResponse
    {
        $this->authorizeAdmin($request);
        $validated = $request->validate(['warehouse_id' => ['required', 'integer']]);

        DB::transaction(fn () => $this->applyAssignment($product, null, (int) $validated['warehouse_id'], $request));

        return response()->json($this->present($product->fresh()->load(['inventories.warehouse', 'suppliers:id,name,status'])));
    }

    private function applyAssignment(Product $product, ?int $supplierId, ?int $warehouseId, Request $request): void
    {
        // Lock order (supplier, warehouse, product) matches bulk and offering mapping.
        $supplier = $supplierId ? ProductCatalogSetup::lockActiveSupplier($supplierId) : null;
        $warehouse = $warehouseId ? ProductCatalogSetup::lockActiveWarehouse($warehouseId) : null;
        $product = Product::query()->lockForUpdate()->findOrFail($product->id);
        if ($supplier) {
            ProductCatalogSetup::attachSupplier($product, $supplier, true, $request->user());
        }
        if (! $warehouse) {
            return;
        }

        [$inventory, $created] = ProductCatalogSetup::ensureInventory($product, $warehouse, $request->user());
        $supplier ??= $product->load('suppliers:id,name,status')->activePrimarySupplier();
        if ($created && $supplier) {
            ProductCatalogSetup::notifyNewProduct($product, $warehouse, $supplier, (int) $inventory->available_stock);
        }
    }

    public function destroy(Request $request, Product $product): JsonResponse
    {
        $this->authorizeAdmin($request);
        $references = collect([
            'inventories' => 'product_id',
            'order_items' => 'product_id',
            'receiving_items' => 'product_id',
            'replenishment_requests' => 'product_id',
            'stock_out_transactions' => 'product_id',
        ])->filter(fn (string $column, string $table) => Schema::hasTable($table)
            && Schema::hasColumn($table, $column)
            && DB::table($table)->where($column, $product->id)->exists())->keys()->values();

        if ($references->isNotEmpty()) {
            return response()->json([
                'message' => 'This product is referenced by existing inventory or transactions and cannot be deleted.',
                'references' => $references,
            ], 409);
        }

        $product->delete();
        return response()->json(['message' => 'Product deleted.']);
    }

    private function validatedProduct(Request $request, ?Product $product = null, array $extraRules = [], array $extraMessages = []): array
    {
        if (is_string($request->input('unit'))) {
            $request->merge(['unit' => mb_strtoupper(trim($request->input('unit')))]);
        }
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique('products', 'name')->ignore($product?->id)],
            'category' => ['nullable', 'string', 'max:255'],
            'brand' => ['nullable', 'string', 'max:255'],
            // Stock is tracked in pieces; the column stays for future units.
            'unit' => ['nullable', 'string', 'max:50', Rule::in([Product::DEFAULT_UNIT])],
            'cost_price' => ['nullable', 'numeric', 'min:0'],
            'selling_price' => ['nullable', 'numeric', 'min:0'],
            'reorder_level' => ['nullable', 'integer', 'min:0'],
            ...$extraRules,
        ], ['unit.in' => 'Unit must be '.Product::DEFAULT_UNIT.'.', ...$extraMessages]);
        if (array_key_exists('unit', $validated)) {
            $validated['unit'] = Product::DEFAULT_UNIT;
        }

        return $validated;
    }

    private function present(Product $product): array
    {
        $stock = (int) $product->inventories->sum('available_stock');
        $reorderLevel = $product->reorder_level;
        $costPrice = $product->cost_price === null ? null : (float) $product->cost_price;
        // A product without any warehouse inventory row is not stocked yet,
        // which is different from a real zero-stock inventory row.
        $status = match (true) {
            $product->inventories->isEmpty() => self::STATUS_SETUP_REQUIRED,
            $stock === 0 => 'OUT OF STOCK',
            StockLevel::needsReplenishment($stock) => 'LOW STOCK',
            default => 'IN STOCK',
        };
        $warehouses = $product->inventories->pluck('warehouse.name')->filter()->unique()->values();
        $suppliers = $product->relationLoaded('suppliers') ? $product->suppliers : collect();
        $primary = $suppliers->first(fn (Supplier $supplier) => $supplier->pivot->is_primary);

        return [
            'id' => $product->id,
            'name' => $product->name,
            'category' => $product->category,
            'brand' => $product->brand,
            'supplier' => $primary?->name,
            'primary_supplier' => $primary ? [
                'id' => $primary->id, 'name' => $primary->name, 'status' => $primary->status,
                'is_active' => $primary->status === Supplier::STATUS_ACTIVE,
            ] : null,
            'suppliers' => $suppliers->map(fn (Supplier $supplier) => [
                'id' => $supplier->id, 'name' => $supplier->name, 'status' => $supplier->status,
                'is_primary' => (bool) $supplier->pivot->is_primary,
            ])->values(),
            'warehouses' => $warehouses,
            'warehouse_ids' => $product->inventories->pluck('warehouse_id')->unique()->values(),
            'current_stock' => $stock,
            'unit' => $product->unit,
            'cost_price' => $costPrice,
            'selling_price' => $product->selling_price === null ? null : (float) $product->selling_price,
            'reorder_level' => $reorderLevel,
            'status' => $status,
            'inventory_value' => $stock === 0 ? 0 : ($costPrice === null ? null : round($stock * $costPrice, 2)),
            'created_at' => $product->created_at,
            'updated_at' => $product->updated_at,
        ];
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Only administrators can manage the product catalog.');
    }
}
