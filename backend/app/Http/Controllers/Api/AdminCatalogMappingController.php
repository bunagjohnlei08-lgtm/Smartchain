<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\SupplierApplicationOffering;
use App\Support\AuditLogger;
use App\Support\ProductCatalogSetup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Admin review of approved suppliers' PRODUCT offerings. Approval never
 * creates catalog records; each offering is linked or created here explicitly.
 */
class AdminCatalogMappingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $offerings = SupplierApplicationOffering::query()->pendingCatalogMapping()
            ->with('application:id,application_number,approved_supplier_id', 'application.approvedSupplier:id,supplier_code,name,status')
            ->orderBy('supplier_application_id')->orderBy('sort_order')->orderBy('id')
            ->get();

        // Suggestions only on an exact normalized-name match; Admin must confirm.
        $productsByName = Product::query()->get(['id', 'name', 'category'])
            ->keyBy(fn (Product $product) => SupplierApplicationOffering::normalizeName($product->name));

        return response()->json([
            'data' => $offerings->map(function (SupplierApplicationOffering $offering) use ($productsByName) {
                $supplier = $offering->application?->approvedSupplier;
                $suggested = $productsByName->get($offering->normalized_name);

                return [
                    'id' => $offering->id,
                    'name' => $offering->name,
                    'category' => $offering->category,
                    'description' => $offering->description,
                    'application_number' => $offering->application?->application_number,
                    'supplier' => $supplier ? [
                        'id' => $supplier->id, 'code' => $supplier->supplier_code, 'name' => $supplier->name,
                        'status' => $supplier->status, 'is_active' => $supplier->status === 'ACTIVE',
                    ] : null,
                    'suggested_product' => $suggested?->only(['id', 'name', 'category']),
                ];
            })->values(),
        ]);
    }

    public function link(Request $request, SupplierApplicationOffering $offering): JsonResponse
    {
        $this->authorizeAdmin($request);
        $validated = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'make_primary' => ['sometimes', 'boolean'],
        ]);

        $product = DB::transaction(function () use ($offering, $validated, $request) {
            [$locked, $supplier] = $this->lockPendingOffering($offering);
            $product = Product::query()->lockForUpdate()->findOrFail($validated['product_id']);
            ProductCatalogSetup::attachSupplier($product, $supplier, (bool) ($validated['make_primary'] ?? false), $request->user());
            $this->markMapped($locked, $product, $request);
            AuditLogger::success('SUPPLIER_OFFERING_MAPPED', AuditLogger::MODULE_INVENTORY, [
                'resource' => $product, 'resource_label' => $product->name,
                'details' => "Linked {$supplier->name} offering \"{$locked->name}\" to existing product {$product->name}.",
                'metadata' => ['offering_id' => $locked->id, 'supplier_id' => $supplier->id, 'mode' => 'link_existing'],
            ]);

            return $product;
        });

        return response()->json([
            'message' => 'Offering linked to the existing product.',
            'data' => ['offering_id' => $offering->id, 'product' => $product->only(['id', 'name'])],
        ]);
    }

    public function createProduct(Request $request, SupplierApplicationOffering $offering): JsonResponse
    {
        $this->authorizeAdmin($request);
        if (is_string($request->input('unit'))) {
            $request->merge(['unit' => mb_strtoupper(trim($request->input('unit')))]);
        }
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:255'],
            'brand' => ['nullable', 'string', 'max:255'],
            'cost_price' => ['nullable', 'numeric', 'min:0'],
            'selling_price' => ['nullable', 'numeric', 'min:0'],
            'warehouse_id' => ['required', 'integer'],
            'unit' => ['nullable', 'string', Rule::in([Product::DEFAULT_UNIT])],
        ], ['unit.in' => 'Unit must be '.Product::DEFAULT_UNIT.'.']);
        $validated['name'] = trim($validated['name']);

        $product = DB::transaction(function () use ($offering, $validated, $request) {
            [$locked, $supplier] = $this->lockPendingOffering($offering);
            $warehouse = ProductCatalogSetup::lockActiveWarehouse((int) $validated['warehouse_id']);
            // Serializes concurrent creations so two offerings cannot both create the same name.
            DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['smartchain_catalog_product_create']);
            $normalized = SupplierApplicationOffering::normalizeName($validated['name']);
            $existing = Product::query()->get(['id', 'name'])
                ->first(fn (Product $product) => SupplierApplicationOffering::normalizeName($product->name) === $normalized);
            if ($existing) {
                throw ValidationException::withMessages([
                    'name' => ["{$existing->name} already exists in the Product Catalog. Link the offering to it instead of creating a duplicate."],
                ]);
            }

            $product = Product::create([
                'name' => $validated['name'],
                'category' => filled($validated['category'] ?? null) ? trim($validated['category']) : null,
                'brand' => filled($validated['brand'] ?? null) ? trim($validated['brand']) : null,
                'unit' => Product::DEFAULT_UNIT,
                'cost_price' => $validated['cost_price'] ?? null,
                'selling_price' => $validated['selling_price'] ?? null,
            ]);
            ProductCatalogSetup::attachSupplier($product, $supplier, true, $request->user());
            [$inventory] = ProductCatalogSetup::ensureInventory($product, $warehouse, $request->user());
            $this->markMapped($locked, $product, $request);
            AuditLogger::success('PRODUCT_CREATED_FROM_OFFERING', AuditLogger::MODULE_INVENTORY, [
                'resource' => $product, 'resource_label' => $product->name,
                'details' => "Created {$product->name} from {$supplier->name} offering \"{$locked->name}\" in {$warehouse->name}.",
                'metadata' => ['offering_id' => $locked->id, 'supplier_id' => $supplier->id, 'warehouse_id' => $warehouse->id, 'inventory_id' => $inventory->id],
            ]);
            ProductCatalogSetup::notifyNewProduct($product, $warehouse, $supplier, (int) $inventory->available_stock);

            return $product;
        });

        return response()->json([
            'message' => 'Product created and assigned to the warehouse.',
            'data' => ['offering_id' => $offering->id, 'product' => $product->only(['id', 'name', 'category', 'unit'])],
        ], 201);
    }

    /** @return array{0: SupplierApplicationOffering, 1: \App\Models\Supplier} */
    private function lockPendingOffering(SupplierApplicationOffering $offering): array
    {
        $locked = SupplierApplicationOffering::query()->pendingCatalogMapping()->lockForUpdate()->find($offering->id);
        if (! $locked) {
            throw ValidationException::withMessages([
                'offering' => ['This offering is not awaiting catalog mapping.'],
            ]);
        }
        $supplierId = (int) $locked->application()->value('approved_supplier_id');

        return [$locked, ProductCatalogSetup::lockActiveSupplier($supplierId, 'offering')];
    }

    private function markMapped(SupplierApplicationOffering $offering, Product $product, Request $request): void
    {
        $offering->update([
            'mapped_product_id' => $product->id,
            'mapped_at' => now(),
            'mapped_by_id' => $request->user()->id,
        ]);
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Only administrators can map supplier offerings.');
    }
}
