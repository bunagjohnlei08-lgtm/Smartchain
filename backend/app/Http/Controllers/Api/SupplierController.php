<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SupplierController extends Controller
{
    private const STATUSES = ['ACTIVE', 'ON_HOLD', 'INACTIVE'];

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', Rule::in(self::STATUSES)],
        ]);

        $suppliers = Supplier::query()
            ->when($validated['search'] ?? null, function ($query, string $search) {
                $term = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $search).'%';
                $query->where(function ($nested) use ($term) {
                    $nested->where('supplier_code', 'ilike', $term)
                        ->orWhere('name', 'ilike', $term)
                        ->orWhere('contact_person', 'ilike', $term)
                        ->orWhere('email', 'ilike', $term)
                        ->orWhere('phone', 'ilike', $term)
                        ->orWhere('address', 'ilike', $term);
                });
            })
            ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status))
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $suppliers]);
    }

    public function show(Request $request, Supplier $supplier): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        return response()->json(['data' => $supplier]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $supplier = Supplier::create($request->validate($this->rules()));
        return response()->json(['data' => $supplier], 201);
    }

    public function update(Request $request, Supplier $supplier): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $supplier->update($request->validate($this->rules($supplier)));
        return response()->json(['data' => $supplier->fresh()]);
    }

    public function updateStatus(Request $request, Supplier $supplier): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $supplier->update($request->validate(['status' => ['required', Rule::in(self::STATUSES)]]));
        return response()->json(['data' => $supplier->fresh()]);
    }

    public function destroy(Request $request, Supplier $supplier): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $supplier->delete();
        return response()->json(status: 204);
    }

    private function rules(?Supplier $supplier = null): array
    {
        return [
            'supplier_code' => ['required', 'string', 'max:50', Rule::unique('suppliers')->ignore($supplier?->id)],
            'name' => ['required', 'string', 'max:255'],
            'contact_person' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string', 'max:2000'],
            'status' => ['required', Rule::in(self::STATUSES)],
            'payment_terms' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ];
    }
}
