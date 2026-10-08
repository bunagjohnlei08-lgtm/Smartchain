<?php

namespace App\Support;

use App\Models\SupplierApplicationOffering;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Validation and normalization for structured supplier product/service offerings. */
final class SupplierApplicationOfferings
{
    public static function rules(bool $required = true): array
    {
        return [
            'offerings' => [$required ? 'required' : 'sometimes', 'array', 'min:1', 'max:'.SupplierApplicationOffering::MAX_PER_APPLICATION],
            'offerings.*' => ['array:type,name,category,description'],
            // New offerings are products only; SERVICE remains readable for historical rows.
            'offerings.*.type' => ['sometimes', Rule::in([SupplierApplicationOffering::TYPE_PRODUCT])],
            'offerings.*.name' => ['required', 'string', 'min:2', 'max:150'],
            'offerings.*.category' => ['required', 'string', 'min:2', 'max:150'],
            'offerings.*.description' => ['nullable', 'string', 'max:1000'],
        ];
    }

    public static function messages(): array
    {
        return [
            'offerings.required' => 'Add at least one product.',
            'offerings.min' => 'Add at least one product.',
            'offerings.max' => 'You may list a maximum of '.SupplierApplicationOffering::MAX_PER_APPLICATION.' products.',
            'offerings.*.type.in' => 'Only product offerings are accepted.',
            'offerings.*.name.required' => 'Enter the product name.',
            'offerings.*.category.required' => 'Enter a category for each product.',
        ];
    }

    /** Trim string fields before validation; leaves non-array input for the validator to reject. */
    public static function trimInput(mixed $offerings): mixed
    {
        if (! is_array($offerings)) {
            return $offerings;
        }

        return array_map(fn ($offering) => is_array($offering)
            ? array_map(fn ($value) => is_string($value) ? trim((string) preg_replace('/\s+/u', ' ', $value)) : $value, $offering)
            : $offering, $offerings);
    }

    /**
     * @return list<array<string, mixed>> rows ready for createMany()
     */
    public static function normalize(array $offerings): array
    {
        $rows = collect(array_values($offerings))->map(fn (array $offering, int $index) => [
            'type' => SupplierApplicationOffering::TYPE_PRODUCT,
            'name' => $offering['name'],
            'normalized_name' => SupplierApplicationOffering::normalizeName($offering['name']),
            'category' => filled($offering['category'] ?? null) ? $offering['category'] : null,
            'description' => filled($offering['description'] ?? null) ? $offering['description'] : null,
            'sort_order' => $index,
        ]);

        $duplicate = $rows->duplicates(fn (array $row) => $row['type'].'|'.$row['normalized_name'])->keys()->first();
        if ($duplicate !== null) {
            throw ValidationException::withMessages([
                "offerings.{$duplicate}.name" => ['Each product may only be listed once.'],
            ]);
        }

        return $rows->all();
    }

    public static function present(Collection $offerings): array
    {
        return $offerings->map(fn (SupplierApplicationOffering $offering) => [
            'id' => $offering->id,
            'type' => $offering->type,
            'name' => $offering->name,
            'category' => $offering->category,
            'description' => $offering->description,
        ])->values()->all();
    }
}
