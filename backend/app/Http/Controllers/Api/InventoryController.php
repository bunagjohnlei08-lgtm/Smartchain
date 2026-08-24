<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class InventoryController extends Controller
{
    private function present(Inventory $inventory, User $user): array
    {
        $inventory->loadMissing(['product', 'warehouse']);

        $data = [
            'id' => $inventory->id,
            'barcode' => $inventory->barcode,
            'product' => $inventory->product->name,
            'category' => $inventory->product->category,
            'brand' => $inventory->product->brand,
            'unit' => $inventory->product->unit,
            'warehouse' => $inventory->warehouse->name,
            'warehouse_id' => $inventory->warehouse_id,
            'available_stock' => $inventory->available_stock,
            'status' => $inventory->status,
            'updated_at' => $inventory->updated_at,
        ];

        if ($user->isPlantManager() || $user->isAdmin()) {
            $data['reserved_stock'] = $inventory->reserved_stock;
            $data['backload'] = $inventory->backload;
        }

        if ($user->isAdmin()) {
            $data['cost_price'] = (float) $inventory->product->cost_price;
            $data['pending_receiving'] = $inventory->pending_receiving;
            $data['created_at'] = $inventory->created_at;
        }

        return $data;
    }

    public function index(Request $request)
    {
        $this->authorize('viewAny', Inventory::class);
        $user = $request->user();
        $query = $this->readableInventoryQuery($user)->with(['product', 'warehouse']);

        if ($request->filled('warehouse_id')) {
            $query->where('warehouse_id', $request->warehouse_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('barcode', 'like', "%{$search}%")
                    ->orWhereHas('product', function ($pq) use ($search) {
                        $pq->where('name', 'like', "%{$search}%");
                    })
                    ->orWhereHas('warehouse', function ($wq) use ($search) {
                        $wq->where('name', 'like', "%{$search}%");
                    });
            });
        }

        $items = $query->get()->map(fn(Inventory $inventory) => $this->present($inventory, $user));

        return response()->json(['data' => $items]);
    }

    public function show(Request $request, $id)
    {
        $this->authorize('viewAny', Inventory::class);
        $user = $request->user();
        $inventory = $this->readableInventoryQuery($user)
            ->with(['product', 'warehouse'])
            ->findOrFail($id);

        return response()->json($this->present($inventory, $user));
    }

    private function resolveProduct(array $validated): Product
    {
        return Product::firstOrCreate(
            ['name' => $validated['product']],
            [
                'category' => $validated['category'] ?? null,
                'brand' => $validated['brand'] ?? null,
                'unit' => $validated['unit'] ?? 'pcs',
                'cost_price' => $validated['cost_price'] ?? 0,
            ]
        );
    }

    public function store(Request $request)
    {
        $this->authorizeAdmin($request);
        $validated = $request->validate([
            'barcode' => 'required|string|unique:inventories,barcode',
            'product' => 'required|string|max:255',
            'category' => 'nullable|string|max:255',
            'brand' => 'nullable|string|max:255',
            'unit' => 'nullable|string|max:50',
            'cost_price' => 'nullable|numeric|min:0',
            'warehouse_id' => 'required|exists:warehouses,id',
            'available_stock' => 'required|integer|min:0',
            'reserved_stock' => 'required|integer|min:0',
            'backload' => 'required|integer|min:0',
            'status' => 'required|string|in:Available,Low Stock,Out of Stock',
            'pending_receiving' => 'nullable|boolean',
        ]);

        $product = $this->resolveProduct($validated);

        $inventory = Inventory::create([
            'barcode' => $validated['barcode'],
            'product_id' => $product->id,
            'warehouse_id' => $validated['warehouse_id'],
            'available_stock' => $validated['available_stock'],
            'reserved_stock' => $validated['reserved_stock'],
            'backload' => $validated['backload'],
            'status' => $validated['status'],
            'pending_receiving' => $validated['pending_receiving'] ?? false,
        ]);

        return response()->json($this->present($inventory, $request->user()), 201);
    }

    public function update(Request $request, $id)
    {
        $this->authorizeAdmin($request);
        $inventory = Inventory::findOrFail($id);

        $validated = $request->validate([
            'barcode' => ['sometimes', 'string', Rule::unique('inventories', 'barcode')->ignore($inventory->id)],
            'product' => 'sometimes|string|max:255',
            'category' => 'nullable|string|max:255',
            'brand' => 'nullable|string|max:255',
            'unit' => 'nullable|string|max:50',
            'cost_price' => 'nullable|numeric|min:0',
            'warehouse_id' => 'sometimes|exists:warehouses,id',
            'available_stock' => 'sometimes|integer|min:0',
            'reserved_stock' => 'sometimes|integer|min:0',
            'backload' => 'sometimes|integer|min:0',
            'status' => ['sometimes', 'string', Rule::in(['Available', 'Low Stock', 'Out of Stock'])],
            'pending_receiving' => 'sometimes|boolean',
        ]);

        if (array_key_exists('product', $validated)) {
            $product = $this->resolveProduct($validated);
            $inventory->product_id = $product->id;
        }

        $inventory->fill(collect($validated)->except(['product', 'category', 'brand', 'unit', 'cost_price'])->toArray());
        $inventory->save();

        return response()->json($this->present($inventory, $request->user()));
    }

    public function destroy(Request $request, $id)
    {
        $this->authorizeAdmin($request);
        $inventory = Inventory::findOrFail($id);
        $inventory->delete();

        return response()->json(['message' => 'Inventory record deleted.']);
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Admin access is required.');
    }

    private function readableInventoryQuery(User $user): Builder
    {
        $query = Inventory::query();

        if ($user->isAdmin()) {
            return $query;
        }

        if ($user->warehouse_id) {
            return $query->where('warehouse_id', $user->warehouse_id);
        }

        return $query->whereHas(
            'warehouse',
            fn (Builder $warehouse) => $warehouse->where('branch_id', $user->branch_id)
        );
    }
}
