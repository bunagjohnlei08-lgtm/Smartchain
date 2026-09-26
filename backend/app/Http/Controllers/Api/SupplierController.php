<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use App\Models\SupplierAlias;
use App\Support\SupplierName;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

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

        $suppliers = Supplier::query()->with('aliases')
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
        return response()->json(['data' => $supplier->load('aliases')]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $validated = $request->validate($this->rules());
        $this->validateNames($validated);

        $supplier = DB::transaction(function () use ($validated) {
            // supplier_code is NOT NULL: hold a throwaway unique value until the
            // database has assigned the id the real code is derived from. The
            // placeholder never leaves this transaction.
            $supplier = new Supplier($validated);
            $supplier->forceFill(['supplier_code' => 'TMP-'.Str::uuid()])->save();
            $supplier->forceFill(['supplier_code' => $this->generateSupplierCode($supplier)])->save();
            $this->syncAliases($supplier, $validated['aliases'] ?? []);

            return $supplier->load('aliases');
        });

        return response()->json(['data' => $supplier->fresh('aliases')], 201);
    }

    public function update(Request $request, Supplier $supplier): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $validated = $request->validate($this->rules());
        $this->validateNames($validated, $supplier);
        DB::transaction(function () use ($supplier, $validated) {
            $supplier->update(collect($validated)->except('aliases')->all());
            $this->syncAliases($supplier, $validated['aliases'] ?? []);
        });
        return response()->json(['data' => $supplier->fresh('aliases')]);
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
            'aliases' => ['sometimes', 'array', 'max:20'],
            'aliases.*' => ['required', 'string', 'max:255'],
        ];
    }

    private function validateNames(array &$validated, ?Supplier $supplier = null): void
    {
        $aliases = collect($validated['aliases'] ?? [])->map(fn ($alias) => SupplierName::display($alias));
        $normalized = $aliases->map(fn ($alias) => SupplierName::normalize($alias));
        $errors = [];

        if ($normalized->contains('')) $errors['aliases'] = ['Recognized supplier names cannot be empty.'];
        if ($normalized->duplicates()->isNotEmpty()) $errors['aliases'] = ['Recognized supplier names must be unique.'];

        $primary = SupplierName::normalize($validated['name'] ?? $supplier?->name);
        if ($normalized->contains($primary)) $errors['aliases'] = ['The primary supplier name does not need to be added as an alias.'];

        foreach ($normalized->unique() as $name) {
            if ($name === '') continue;
            $aliasConflict = SupplierAlias::query()->where('normalized_alias', $name)
                ->when($supplier, fn ($query) => $query->where('supplier_id', '!=', $supplier->id))->exists();
            $nameConflict = Supplier::query()->whereRaw("LOWER(REGEXP_REPLACE(TRIM(name), '\\s+', ' ', 'g')) = ?", [$name])
                ->when($supplier, fn ($query) => $query->whereKeyNot($supplier->id))->exists();
            if ($aliasConflict || $nameConflict) {
                $errors['aliases'] = ['A recognized supplier name conflicts with another registered supplier.'];
                break;
            }
        }

        $primaryAliasConflict = SupplierAlias::query()->where('normalized_alias', $primary)
            ->when($supplier, fn ($query) => $query->where('supplier_id', '!=', $supplier->id))->exists();
        if ($primaryAliasConflict) $errors['name'] = ['This supplier name conflicts with another supplier alias.'];
        if ($errors) throw ValidationException::withMessages($errors);

        $validated['aliases'] = $aliases->values()->all();
    }

    private function syncAliases(Supplier $supplier, array $aliases): void
    {
        $supplier->aliases()->delete();
        $supplier->aliases()->createMany(collect($aliases)->map(fn ($alias) => [
            'alias' => SupplierName::display($alias),
            'normalized_alias' => SupplierName::normalize($alias),
        ])->all());
    }
}
