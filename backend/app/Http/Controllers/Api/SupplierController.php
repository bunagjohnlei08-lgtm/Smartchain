<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
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
        $validated = $request->validate($this->rules());

        $supplier = DB::transaction(function () use ($validated) {
            // supplier_code is NOT NULL: hold a throwaway unique value until the
            // database has assigned the id the real code is derived from. The
            // placeholder never leaves this transaction.
            $supplier = new Supplier($validated);
            $supplier->forceFill(['supplier_code' => 'TMP-'.Str::uuid()])->save();
            $supplier->forceFill(['supplier_code' => $this->generateSupplierCode($supplier)])->save();

            return $supplier;
        });

        return response()->json(['data' => $supplier->fresh()], 201);
    }

    public function update(Request $request, Supplier $supplier): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $supplier->update($request->validate($this->rules()));
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

    /**
     * SUP-<id zero-padded to 3>. Derived from the database-assigned primary
     * key, so concurrent creations never compute the same code. Older codes
     * were typed by hand; if one already holds the value, a suffix keeps it
     * unique.
     */
    private function generateSupplierCode(Supplier $supplier): string
    {
        $base = 'SUP-'.str_pad((string) $supplier->getKey(), 3, '0', STR_PAD_LEFT);
        $candidate = $base;

        for ($suffix = 2; Supplier::query()->where('supplier_code', $candidate)->whereKeyNot($supplier->getKey())->exists(); $suffix++) {
            $candidate = $base.'-'.$suffix;
        }

        return $candidate;
    }

    private function rules(): array
    {
        return [
            // Server-generated and immutable.
            'supplier_code' => ['prohibited'],
            'name' => ['required', 'string', 'max:255'],
            'contact_person' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            // Philippine numbers, digits only, kept as a string for the leading 0.
            'phone' => ['nullable', 'string', 'regex:/^[0-9]+$/', 'max:11'],
            'address' => ['nullable', 'string', 'max:2000'],
            'status' => ['required', Rule::in(self::STATUSES)],
            'payment_terms' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ];
    }
}
