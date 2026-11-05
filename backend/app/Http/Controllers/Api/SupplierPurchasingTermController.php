<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\PurchaseOrderItem;
use App\Models\Supplier;
use App\Models\SupplierProductPurchasingTerm;
use App\Services\SupplierAccreditationEligibility;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SupplierPurchasingTermController extends Controller
{
    public function index(Request $request, Supplier $supplier): JsonResponse
    {
        $this->admin($request);
        $validated = $request->validate(['search' => ['nullable', 'string', 'max:255']]);
        $terms = $supplier->purchasingTerms()->with(['product:id,name,category,unit', 'verifier:id,name'])
            ->when($validated['search'] ?? null, fn ($query, $search) => $query->whereHas('product', fn ($products) => $products->where('name', 'ilike', '%'.str_replace(['%', '_'], ['\\%', '\\_'], $search).'%')))
            ->orderByDesc('effective_from')->orderBy('product_id')->get();
        return response()->json([
            'data' => $terms->map(fn ($term) => $this->present($term)),
            'product_options' => $supplier->products()->orderBy('name')->get(['products.id','products.name','products.category','products.unit']),
        ]);
    }

    public function store(Request $request, Supplier $supplier, SupplierAccreditationEligibility $eligibility): JsonResponse
    {
        $this->admin($request);
        $validated = $this->validated($request);
        $term = DB::transaction(function () use ($validated, $supplier, $request, $eligibility) {
            $supplier = Supplier::query()->lockForUpdate()->findOrFail($supplier->id);
            $product = Product::query()->lockForUpdate()->findOrFail($validated['product_id']);
            $this->assertAuthorized($supplier, $product, $validated, $eligibility);
            $this->rejectOverlap($supplier->id, $product->id, $validated);
            $term = $supplier->purchasingTerms()->create([...$validated, 'unit' => $product->unit, 'verified_by' => $request->user()->id, 'verified_at' => now()]);
            AuditLogger::success('SUPPLIER_PURCHASING_TERM_CREATED', AuditLogger::MODULE_PURCHASE_ORDERS, ['actor' => $request->user(), 'resource' => $supplier, 'resource_label' => $supplier->name, 'metadata' => ['term_id' => $term->id, 'product_id' => $product->id]]);
            return $term;
        });
        return response()->json(['data' => $this->present($term->load(['product', 'verifier']))], 201);
    }

    public function update(Request $request, Supplier $supplier, SupplierProductPurchasingTerm $purchasingTerm, SupplierAccreditationEligibility $eligibility): JsonResponse
    {
        $this->admin($request);
        abort_unless($purchasingTerm->supplier_id === $supplier->id, 404);
        $validated = $this->validated($request);
        DB::transaction(function () use ($validated, $supplier, $purchasingTerm, $request, $eligibility) {
            $supplier = Supplier::query()->lockForUpdate()->findOrFail($supplier->id);
            $product = Product::query()->lockForUpdate()->findOrFail($validated['product_id']);
            $locked = SupplierProductPurchasingTerm::query()->lockForUpdate()->findOrFail($purchasingTerm->id);
            if (PurchaseOrderItem::where('supplier_product_purchasing_term_id', $locked->id)->exists()) {
                throw ValidationException::withMessages(['agreement' => 'Referenced purchasing terms are immutable. Deactivate this version and add a replacement.']);
            }
            $this->assertAuthorized($supplier, $product, $validated, $eligibility);
            $this->rejectOverlap($supplier->id, $product->id, $validated, $locked->id);
            $locked->update([...$validated, 'unit' => $product->unit, 'verified_by' => $request->user()->id, 'verified_at' => now()]);
            AuditLogger::success('SUPPLIER_PURCHASING_TERM_UPDATED', AuditLogger::MODULE_PURCHASE_ORDERS, ['actor' => $request->user(), 'resource' => $supplier, 'resource_label' => $supplier->name, 'metadata' => ['term_id' => $locked->id, 'product_id' => $product->id]]);
        });
        return response()->json(['data' => $this->present($purchasingTerm->fresh(['product', 'verifier']))]);
    }

    public function deactivate(Request $request, Supplier $supplier, SupplierProductPurchasingTerm $purchasingTerm): JsonResponse
    {
        $this->admin($request);
        abort_unless($purchasingTerm->supplier_id === $supplier->id, 404);
        $purchasingTerm->update(['status' => SupplierProductPurchasingTerm::STATUS_INACTIVE]);
        AuditLogger::success('SUPPLIER_PURCHASING_TERM_DEACTIVATED', AuditLogger::MODULE_PURCHASE_ORDERS, ['actor' => $request->user(), 'resource' => $supplier, 'resource_label' => $supplier->name, 'metadata' => ['term_id' => $purchasingTerm->id]]);
        return response()->json(['data' => $this->present($purchasingTerm->fresh(['product', 'verifier']))]);
    }

    private function validated(Request $request): array
    {
        if (is_string($request->input('currency'))) $request->merge(['currency' => strtoupper(trim($request->input('currency')))]);
        return $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'agreed_unit_price' => ['required', 'decimal:0,2', 'min:0', 'max:999999999999.99'],
            'currency' => ['required', 'string', 'size:3', 'regex:/^[A-Z]{3}$/'],
            'delivery_lead_time_days' => ['required', 'integer', 'min:0', 'max:3650'],
            'lead_time_basis' => ['required', Rule::in(SupplierProductPurchasingTerm::LEAD_TIME_BASES)],
            'lead_time_start_event' => ['required', Rule::in(SupplierProductPurchasingTerm::START_EVENTS)],
            'minimum_order_quantity' => ['nullable', 'integer', 'min:1'],
            'order_multiple' => ['nullable', 'integer', 'min:1'],
            'maximum_order_quantity' => ['nullable', 'integer', 'min:1', 'gte:minimum_order_quantity'],
            'effective_from' => ['required', 'date'], 'effective_until' => ['nullable', 'date', 'after_or_equal:effective_from'],
            'status' => ['required', Rule::in(SupplierProductPurchasingTerm::STATUSES)],
            'agreement_reference' => ['nullable', 'string', 'max:255'],
        ]);
    }

    private function assertAuthorized(Supplier $supplier, Product $product, array $validated, SupplierAccreditationEligibility $eligibility): void
    {
        if (! $supplier->products()->whereKey($product->id)->exists()) throw ValidationException::withMessages(['product_id' => 'This product is not linked to the selected supplier.']);
        if ($validated['status'] === SupplierProductPurchasingTerm::STATUS_ACTIVE && ! $eligibility->eligible($supplier)) throw ValidationException::withMessages(['status' => 'Only an active, currently accredited supplier can have active purchasing terms.']);
    }

    private function rejectOverlap(int $supplierId, int $productId, array $values, ?int $ignore = null): void
    {
        if ($values['status'] !== SupplierProductPurchasingTerm::STATUS_ACTIVE) return;
        $overlap = SupplierProductPurchasingTerm::query()->where('supplier_id', $supplierId)->where('product_id', $productId)
            ->where('status', SupplierProductPurchasingTerm::STATUS_ACTIVE)->when($ignore, fn ($query) => $query->whereKeyNot($ignore))
            ->whereDate('effective_from', '<=', $values['effective_until'] ?? '9999-12-31')
            ->where(fn ($query) => $query->whereNull('effective_until')->orWhereDate('effective_until', '>=', $values['effective_from']))->exists();
        if ($overlap) throw ValidationException::withMessages(['effective_from' => 'An active purchasing-term version already overlaps this effective period.']);
    }

    private function present(SupplierProductPurchasingTerm $term): array
    {
        return [...$term->only(['id','supplier_id','product_id','unit','agreed_unit_price','currency','delivery_lead_time_days','lead_time_basis','lead_time_start_event','minimum_order_quantity','order_multiple','maximum_order_quantity','status','agreement_reference']),
            'effective_from' => $term->effective_from?->toDateString(), 'effective_until' => $term->effective_until?->toDateString(),
            'is_current' => $term->status === SupplierProductPurchasingTerm::STATUS_ACTIVE && $term->effective_from?->lte(today()) && (! $term->effective_until || $term->effective_until->gte(today())),
            'product' => $term->product?->only(['id','name','category','unit']), 'verified_by' => $term->verifier?->name, 'verified_at' => $term->verified_at?->toIso8601String()];
    }

    private function admin(Request $request): void { abort_unless($request->user()?->isAdmin(), 403); }
}
