<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:255'],
            'brand' => ['nullable', 'string', 'max:255'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'status' => ['nullable', Rule::in(['IN STOCK', 'LOW STOCK', 'OUT OF STOCK'])],
            'sort_by' => ['nullable', Rule::in(['name', 'category', 'brand', 'cost_price', 'selling_price', 'reorder_level', 'current_stock', 'created_at'])],
            'sort_direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = Product::query()->with(['inventories.warehouse']);
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

        $allProducts = Product::query()->with('inventories:id,product_id,available_stock')->get();
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
                'total_inventory_value' => $summaryRows->contains(fn (array $row) => $row['inventory_value'] === null)
                    ? null : round($summaryRows->sum('inventory_value'), 2),
            ],
            'filters' => [
                'categories' => $allProducts->pluck('category')->filter()->unique()->sort()->values(),
                'brands' => $allProducts->pluck('brand')->filter()->unique()->sort()->values(),
                'suppliers' => [],
                'warehouses' => DB::table('warehouses')->orderBy('name')->get(['id', 'name']),
                'statuses' => ['IN STOCK', 'LOW STOCK', 'OUT OF STOCK'],
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
        return response()->json($this->present($product->load(['inventories.warehouse'])));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $product = Product::create($this->validatedProduct($request));
        return response()->json($this->present($product->load('inventories')), 201);
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        $this->authorizeAdmin($request);
        $product->update($this->validatedProduct($request, $product));
        return response()->json($this->present($product->fresh()->load(['inventories.warehouse'])));
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

    private function validatedProduct(Request $request, ?Product $product = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique('products', 'name')->ignore($product?->id)],
            'category' => ['nullable', 'string', 'max:255'],
            'brand' => ['nullable', 'string', 'max:255'],
            'unit' => ['nullable', 'string', 'max:50'],
            'cost_price' => ['nullable', 'numeric', 'min:0'],
            'selling_price' => ['nullable', 'numeric', 'min:0'],
            'reorder_level' => ['nullable', 'integer', 'min:0'],
        ]);
    }

    private function present(Product $product): array
    {
        $stock = (int) $product->inventories->sum('available_stock');
        $reorderLevel = $product->reorder_level;
        $costPrice = $product->cost_price === null ? null : (float) $product->cost_price;
        $status = $stock === 0 ? 'OUT OF STOCK'
            : ($reorderLevel === null ? null : ($stock <= $reorderLevel ? 'LOW STOCK' : 'IN STOCK'));
        $warehouses = $product->inventories->pluck('warehouse.name')->filter()->unique()->values();

        return [
            'id' => $product->id,
            'name' => $product->name,
            'category' => $product->category,
            'brand' => $product->brand,
            'supplier' => null,
            'warehouses' => $warehouses,
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
