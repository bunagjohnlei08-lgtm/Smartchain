<?php

namespace App\Services;

use App\Models\Product;
use App\Models\Supplier;
use App\Models\SupplierProductPurchasingTerm;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class PurchasingTermResolver
{
    public function __construct(private readonly SupplierAccreditationEligibility $accreditation) {}

    public function eligibleSuppliers(Collection $products): Collection
    {
        if ($products->isEmpty()) return collect();
        $productIds = $products->pluck('id');

        return Supplier::query()->where('status', Supplier::STATUS_ACTIVE)
            ->whereHas('products', fn ($query) => $query->whereIn('products.id', $productIds), '=', $productIds->count())
            ->whereHas('purchasingTerms', fn ($query) => $query->effective()->whereIn('product_id', $productIds), '=', $productIds->count())
            ->with(['purchasingTerms' => fn ($query) => $query->effective()->whereIn('product_id', $productIds)
                ->orderByDesc('effective_from')->orderByDesc('id')->with('product:id,name,category,unit')])
            ->orderBy('name')->get()->filter(fn (Supplier $supplier) => $this->accreditation->eligible($supplier))->values();
    }

    public function plantManagerRule(Product $product): array
    {
        $suppliers = $this->eligibleSuppliers(collect([$product]));
        if ($suppliers->count() !== 1) {
            return ['mode' => 'admin_validation', 'eligible_supplier_count' => $suppliers->count()];
        }

        /** @var Supplier $supplier */
        $supplier = $suppliers->first();
        /** @var SupplierProductPurchasingTerm|null $term */
        $term = $supplier->purchasingTerms->firstWhere('product_id', $product->id);
        if (! $term || $term->unit !== $product->unit) {
            return ['mode' => 'admin_validation', 'eligible_supplier_count' => $suppliers->count()];
        }

        return [
            'mode' => 'unique_agreement',
            'eligible_supplier_count' => 1,
            'term_id' => $term->id,
            'supplier_id' => $supplier->id,
            'supplier_name' => $supplier->name,
            'unit' => $term->unit,
            'minimum_order_quantity' => $term->minimum_order_quantity,
            'maximum_order_quantity' => $term->maximum_order_quantity,
            'order_multiple' => $term->order_multiple,
        ];
    }

    public function validatePlantManagerQuantity(Product $product, int $quantity, ?int $submittedTermId, string $errorKey = 'requested_qty'): void
    {
        $rule = $this->plantManagerRule($product);
        if ($rule['mode'] !== 'unique_agreement') {
            if ($submittedTermId !== null) {
                throw ValidationException::withMessages([$errorKey => 'Supplier purchasing terms changed. Review the current quantity requirements.']);
            }
            return;
        }
        if ($submittedTermId !== null && $submittedTermId !== $rule['term_id']) {
            throw ValidationException::withMessages([$errorKey => 'Supplier purchasing terms changed. Review the current quantity requirements.']);
        }

        $term = SupplierProductPurchasingTerm::query()->effective()
            ->whereKey($rule['term_id'])->where('supplier_id', $rule['supplier_id'])
            ->where('product_id', $product->id)->first();
        if (! $term || $term->unit !== $product->unit) {
            throw ValidationException::withMessages([$errorKey => 'Supplier purchasing terms changed. Review the current quantity requirements.']);
        }
        $this->validateQuantity($term, $quantity, $product->name, $errorKey);
    }

    public function resolve(Supplier $supplier, Collection $products, array $quantities, ?Carbon $start = null, bool $lockTerms = false): array
    {
        if (! $this->accreditation->eligible($supplier)) {
            throw ValidationException::withMessages(['supplier_id' => 'The selected supplier is not currently active and accredited for new purchasing.']);
        }
        $mapped = $supplier->products()->whereIn('products.id', $products->pluck('id'))->pluck('products.id');
        if ($mapped->count() !== $products->count()) {
            throw ValidationException::withMessages(['supplier_id' => 'The selected supplier is not authorized for every product in this Purchase Order.']);
        }

        $start ??= today(Supplier::BUSINESS_TIMEZONE);
        $lines = $products->map(function (Product $product) use ($supplier, $quantities, $start, $lockTerms) {
            $term = SupplierProductPurchasingTerm::query()->effective($start)->where('supplier_id', $supplier->id)
                ->where('product_id', $product->id)->orderByDesc('effective_from')->when($lockTerms, fn ($query) => $query->lockForUpdate())->first();
            if (! $term) throw ValidationException::withMessages(['items' => "No verified supplier price is available for {$product->name}."]);
            if ($term->unit !== $product->unit) throw ValidationException::withMessages(['items' => "The purchasing-term unit for {$product->name} no longer matches the Product Catalog."]);
            $quantity = (int) ($quantities[$product->id] ?? 0);
            $this->validateQuantity($term, $quantity, $product->name);
            return ['product' => $product, 'term' => $term, 'expected_date' => $this->expectedDate($term, $start)];
        })->values();

        $dates = $lines->pluck('expected_date')->unique()->values();
        if ($lines->pluck('term.currency')->unique()->count() !== 1) {
            throw ValidationException::withMessages(['items' => 'Selected products use different agreement currencies. Create separate Purchase Orders.']);
        }
        if ($dates->count() !== 1) {
            throw ValidationException::withMessages(['expected_delivery_date' => 'Selected products have different contractual delivery dates. Create separate supplier-specific Purchase Orders.']);
        }
        return ['lines' => $lines, 'expected_date' => $dates->first(), 'start_date' => $start->toDateString(), 'currency' => $lines->first()['term']->currency];
    }

    public function expectedDate(SupplierProductPurchasingTerm $term, Carbon $start): string
    {
        $date = $start->copy();
        return ($term->lead_time_basis === SupplierProductPurchasingTerm::BUSINESS_DAYS
            ? $date->addWeekdays($term->delivery_lead_time_days)
            : $date->addDays($term->delivery_lead_time_days))->toDateString();
    }

    public function validateQuantity(SupplierProductPurchasingTerm $term, int $quantity, string $product, string $errorKey = 'items'): void
    {
        if ($quantity < 1) throw ValidationException::withMessages([$errorKey => "Enter a positive quantity for {$product}."]);
        if ($term->minimum_order_quantity !== null && $quantity < $term->minimum_order_quantity) {
            throw ValidationException::withMessages([$errorKey => "{$product} requires a minimum order of {$term->minimum_order_quantity} {$term->unit}."]);
        }
        if ($term->order_multiple !== null) {
            $base = $term->minimum_order_quantity ?? 0;
            if (($quantity - $base) < 0 || (($quantity - $base) % $term->order_multiple) !== 0) {
                throw ValidationException::withMessages([$errorKey => "{$product} must be ordered in multiples of {$term->order_multiple} {$term->unit} from the agreed minimum."]);
            }
        }
        if ($term->maximum_order_quantity !== null && $quantity > $term->maximum_order_quantity) {
            throw ValidationException::withMessages([$errorKey => "{$product} has a maximum order of {$term->maximum_order_quantity} {$term->unit}."]);
        }
    }
}
