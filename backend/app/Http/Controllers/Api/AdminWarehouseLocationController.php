<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Warehouse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminWarehouseLocationController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        return response()->json($this->present($this->mainWarehouse()));
    }

    public function update(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $warehouse = $this->mainWarehouse();
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'max:50', Rule::unique('warehouses', 'code')->ignore($warehouse->id)],
            'address' => ['nullable', 'string', 'max:2000'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'capacity' => ['nullable', 'integer', 'min:0'],
            'status' => ['required', Rule::in(['Active', 'Inactive'])],
        ]);
        $warehouse->update($validated);
        return response()->json($this->present($warehouse->fresh()));
    }

    private function mainWarehouse(): Warehouse
    {
        return Warehouse::query()->where('code', 'WH-MAIN')->first()
            ?? Warehouse::query()->orderBy('id')->firstOrFail();
    }

    private function present(Warehouse $warehouse): array
    {
        $utilized = (int) $warehouse->inventories()
            ->selectRaw('COALESCE(SUM(available_stock + reserved_stock), 0) AS aggregate')
            ->value('aggregate');
        $capacity = $warehouse->capacity;
        $available = $capacity === null ? null : max(0, $capacity - $utilized);
        return [
            'id' => $warehouse->id, 'name' => $warehouse->name, 'code' => $warehouse->code,
            'address' => $warehouse->address, 'latitude' => $warehouse->latitude === null ? null : (float) $warehouse->latitude,
            'longitude' => $warehouse->longitude === null ? null : (float) $warehouse->longitude,
            'capacity' => $capacity, 'utilized' => $utilized, 'available' => $available,
            'utilization_percentage' => $capacity && $capacity > 0 ? round(min(100, $utilized / $capacity * 100), 1) : null,
            'status' => $warehouse->status,
        ];
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->isAdmin(), 403, 'Administrator access is required.');
    }
}
