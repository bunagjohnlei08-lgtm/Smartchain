<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Bom;
use App\Models\Product;
use App\Support\AuditLogger;
use App\Support\WarehouseCapacity;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class BomController extends Controller
{
    public function index(Request $request)
    {
        abort_unless($request->user()?->isAdmin(), 403);
        return response()->json([
            'data' => Bom::with(['product:id,name,unit,item_classification', 'materials.product:id,name,unit,item_classification'])->orderBy('id')->get(),
            'finished_products' => Product::where('item_classification', Product::FINISHED_PRODUCT)->orderBy('name')->get(['id', 'name', 'unit']),
            'raw_materials' => Product::where('item_classification', Product::RAW_MATERIAL)->orderBy('name')->get(['id', 'name', 'unit']),
        ]);
    }

    public function store(Request $request) { return $this->save($request); }
    public function update(Request $request, Bom $bom) { return $this->save($request, $bom); }

    private function save(Request $request, ?Bom $existing = null)
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Only Admin manages BOM formulas.');
        $values = $request->validate([
            'product_id' => ['required', 'integer', Rule::exists('products', 'id')->where('item_classification', Product::FINISHED_PRODUCT)],
            'output_quantity' => ['required', 'integer', 'min:1', 'max:1000000'],
            'minimum_processing_minutes' => ['sometimes', 'integer', 'min:1', 'max:2147483647'],
            'materials' => ['required', 'array', 'min:1', 'max:100'],
            'materials.*.product_id' => ['required', 'integer', 'distinct', Rule::exists('products', 'id')->where('item_classification', Product::RAW_MATERIAL)],
            'materials.*.required_quantity' => ['required', 'numeric', 'gt:0', 'max:1000000', 'regex:/^\d+(\.\d{1,6})?$/'],
        ], ['materials.*.required_quantity.regex' => 'Use a plain positive decimal with at most six decimal places. Demand is never silently rounded.']);
        if ($existing && $existing->product_id !== (int) $values['product_id']) throw ValidationException::withMessages(['product_id' => 'An existing BOM cannot be reassigned to a different finished product.']);
        $bom = DB::transaction(function () use ($request, $values, $existing) {
            $products = Product::whereIn('id', array_merge([$values['product_id']], array_column($values['materials'], 'product_id')))->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $output = $products[$values['product_id']];
            if ($output->item_classification !== Product::FINISHED_PRODUCT) throw ValidationException::withMessages(['product_id' => 'Choose a Finished Product.']);
            foreach ($values['materials'] as $material) {
                $product = $products[$material['product_id']];
                if ($product->item_classification !== Product::RAW_MATERIAL || ! in_array(WarehouseCapacity::normalizeUnit($product->unit), WarehouseCapacity::UNITS, true)) {
                    throw ValidationException::withMessages(['materials' => 'All ingredients must be Raw Materials with a valid KG, L, or PCS Stock Unit.']);
                }
            }
            $bom = Bom::where('product_id', $output->id)->lockForUpdate()->first();
            if (!$existing && $bom) throw ValidationException::withMessages(['product_id' => 'This finished product already has a current formula. Use Edit Formula to change it.']);
            if ($existing && (! $bom || $bom->id !== $existing->id)) abort(409, 'BOM configuration changed. Reload and retry.');
            $created = ! $bom;
            $bom ??= new Bom(['product_id' => $output->id]);
            $bom->fill(['output_quantity' => $values['output_quantity'], 'updated_by_id' => $request->user()->id,
                'minimum_processing_minutes' => $values['minimum_processing_minutes'] ?? $bom->minimum_processing_minutes ?? 30])->save();
            $bom->materials()->delete();
            $bom->materials()->createMany($values['materials']);
            AuditLogger::success($created ? 'BOM_CREATED' : 'BOM_UPDATED', AuditLogger::MODULE_INVENTORY, ['actor' => $request->user(), 'resource' => $bom,
                'resource_label' => $output->name, 'details' => 'Saved the current BOM. Existing batches retain immutable material snapshots.']);
            return $bom;
        }, 3);
        return response()->json(['data' => $bom->load(['product:id,name,unit', 'materials.product:id,name,unit'])], $existing ? 200 : 201);
    }
}
