<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Bom;
use App\Models\Product;
use App\Models\ProductionBatch;
use App\Models\User;
use App\Models\Warehouse;
use App\Support\ProductionWorkflow;
use App\Support\ProductionRules;
use App\Support\CatalogProductRules;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductionController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        abort_unless($user?->isAdmin() || $user?->isPlantManager() || $user?->isQaSupervisor(), 403);
        $values = $request->validate(['status' => ['nullable', Rule::in(ProductionBatch::STATUSES)], 'per_page' => ['nullable', 'integer', 'min:1', 'max:100']]);
        $query = ProductionBatch::query();
        if ($user->isPlantManager()) { abort_unless($user->warehouse_id, 403, 'A warehouse assignment is required.'); $query->where('warehouse_id', $user->warehouse_id); }
        if ($user->isQaSupervisor()) $query->where('assigned_qa_user_id', $user->id);
        if (! empty($values['status'])) $query->where('status', $values['status']);
        return response()->json($query->latest('id')->paginate($values['per_page'] ?? 25)->through(fn ($batch) => ProductionWorkflow::present($batch)));
    }

    public function options(Request $request)
    {
        $user = $request->user();
        abort_unless($user?->isAdmin() || $user?->isPlantManager() || $user?->isQaSupervisor(), 403);
        $warehouse = $user->warehouse_id ? Warehouse::find($user->warehouse_id) : null;
        $products = Product::where('item_classification', Product::FINISHED_PRODUCT);
        if ($user->isPlantManager()) {
            abort_unless($warehouse, 403, 'A warehouse assignment is required.');
            $products->whereHas('inventories', fn ($query) => $query->where('warehouse_id', $warehouse->id));
        }
        $products = $products->orderBy('name')->get(['id', 'name', 'unit']);
        $boms = Bom::with(['product', 'materials.product'])->whereIn('product_id', $products->pluck('id'))->get()->keyBy('product_id');
        if ($user->isPlantManager()) {
            $units = $warehouse->status === 'Active' ? CatalogProductRules::supportedUnits($warehouse) : [];
            $products = $products->filter(fn ($product) => in_array(\App\Support\WarehouseCapacity::normalizeUnit($product->unit), $units, true)
                && ProductionRules::usableBom($boms->get($product->id)))->values();
        }
        $qa = User::where('status', 'ACTIVE')->whereHas('role', fn ($role) => $role->where('slug', 'QA_SUPERVISOR'));
        if ($warehouse) $qa->where(fn ($query) => $query->where('warehouse_id', $warehouse->id)
            ->orWhere(fn ($branch) => $branch->whereNull('warehouse_id')->where('branch_id', $warehouse->branch_id))
            ->orWhere(fn ($global) => $global->whereNull('warehouse_id')->whereNull('branch_id')));
        return response()->json(['warehouse' => $warehouse?->only(['id', 'name']),
            'products' => $products->map(fn ($product) => [...$product->toArray(), 'bom_id' => $boms->get($product->id)?->id]),
            'qa_assignees' => $qa->orderBy('name')->get(['id', 'name']), 'statuses' => ProductionBatch::STATUSES]);
    }

    public function show(Request $request, ProductionBatch $productionBatch)
    {
        ProductionWorkflow::authorizeBatch($request->user(), $productionBatch, 'read');
        return response()->json(['data' => ProductionWorkflow::present($productionBatch)]);
    }
    public function pickList(Request $request, ProductionBatch $productionBatch, \App\Support\ProductionPickList $document)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required for the production pick list.');
        ProductionWorkflow::authorizeBatch($request->user(), $productionBatch, 'read');
        $values = $request->validate(['format' => ['sometimes', Rule::in(['pdf', 'html'])]]);
        $html = $document->html($productionBatch);
        if (($values['format'] ?? 'pdf') === 'html') return response($html)->header('Content-Type', 'text/html; charset=UTF-8')->header('Cache-Control', 'private, no-store');
        return response($document->pdf($html))->header('Content-Type', 'application/pdf')
            ->header('Content-Disposition', 'attachment; filename="'.\App\Support\ProductionPickList::filename($productionBatch).'"')->header('Cache-Control', 'private, no-store');
    }

    public function store(Request $request)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Only Plant Managers create production batches.');
        $values = $request->validate(['product_id' => ['required', 'integer', 'exists:products,id'], 'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'], 'target_quantity' => ['required', 'integer', 'min:1', 'max:1000000']]);
        return $this->response(ProductionWorkflow::create($request->user(), $values), 201);
    }
    public function issue(Request $request, ProductionBatch $productionBatch) { return $this->response(ProductionWorkflow::issue($request->user(), $productionBatch)); }
    public function stockIn(Request $request, ProductionBatch $productionBatch) { return $this->response(ProductionWorkflow::stockIn($request->user(), $productionBatch)); }
    public function output(Request $request, ProductionBatch $productionBatch)
    {
        ProductionWorkflow::authorizeBatch($request->user(), $productionBatch, 'output');
        $values = $request->validate(['actual_quantity' => ['required', 'integer', 'min:1', 'max:1000000'], 'assigned_qa_user_id' => ['required', 'integer', 'exists:users,id'],
            'production_started_at' => ['prohibited'], 'output_available_at' => ['prohibited'],
            'excess_confirmation' => ['sometimes', 'array:target_quantity,actual_quantity,confirmed'],
            'excess_confirmation.target_quantity' => ['required_with:excess_confirmation', 'integer', 'min:1'],
            'excess_confirmation.actual_quantity' => ['required_with:excess_confirmation', 'integer', 'min:1'],
            'excess_confirmation.confirmed' => ['required_with:excess_confirmation', 'boolean']]);
        return $this->response(ProductionWorkflow::recordOutput($request->user(), $productionBatch, $values));
    }
    public function inspect(Request $request, ProductionBatch $productionBatch)
    {
        ProductionWorkflow::authorizeBatch($request->user(), $productionBatch, 'qa');
        $values = $request->validate(['passed_quantity' => ['required', 'integer', 'min:0', 'max:1000000'], 'failed_quantity' => ['required', 'integer', 'min:0', 'max:1000000'], 'notes' => ['required', 'string', 'min:3', 'max:2000'],
            'excess_confirmation' => ['sometimes', 'array:target_quantity,actual_quantity,passed_quantity,failed_quantity,inspection_notes,quantity_verified,passed_inspected,passed_meets_requirements,failed_excluded'],
            'excess_confirmation.target_quantity' => ['required_with:excess_confirmation', 'integer', 'min:1'],
            'excess_confirmation.actual_quantity' => ['required_with:excess_confirmation', 'integer', 'min:1'],
            'excess_confirmation.passed_quantity' => ['required_with:excess_confirmation', 'integer', 'min:0'],
            'excess_confirmation.failed_quantity' => ['required_with:excess_confirmation', 'integer', 'min:0'],
            'excess_confirmation.inspection_notes' => ['required_with:excess_confirmation', 'string', 'max:2000'],
            'excess_confirmation.quantity_verified' => ['required_with:excess_confirmation', 'boolean'],
            'excess_confirmation.passed_inspected' => ['sometimes', 'boolean'],
            'excess_confirmation.passed_meets_requirements' => ['sometimes', 'boolean'],
            'excess_confirmation.failed_excluded' => ['sometimes', 'boolean']]);
        return $this->response(ProductionWorkflow::inspect($request->user(), $productionBatch, $values));
    }
    public function cancel(Request $request, ProductionBatch $productionBatch)
    {
        ProductionWorkflow::authorizeBatch($request->user(), $productionBatch, 'cancel');
        $values = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:2000'], 'material_disposition' => ['nullable', Rule::in(['RETURN_UNUSED', 'DISPOSED'])], 'confirm_unused_materials' => ['sometimes', 'boolean']]);
        return $this->response(ProductionWorkflow::cancel($request->user(), $productionBatch, $values));
    }
    public function disposition(Request $request, ProductionBatch $productionBatch)
    {
        ProductionWorkflow::authorizeBatch($request->user(), $productionBatch, 'disposition');
        $values = $request->validate(['disposition' => ['required', Rule::in(['HOLD', 'REWORK', 'DISPOSAL'])], 'notes' => ['required', 'string', 'min:3', 'max:2000']]);
        ProductionWorkflow::disposition($request->user(), $productionBatch, $values);
        return $this->response($productionBatch->fresh());
    }
    private function response(ProductionBatch $batch, int $status = 200) { return response()->json(['data' => ProductionWorkflow::present($batch->fresh())], $status); }
}
