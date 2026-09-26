<?php

namespace App\Reports;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Validates report requests against the registry. Unknown keys (e.g. table,
 * columns, model, recipient) are rejected outright, and each filter must be
 * declared by the chosen definition.
 */
class ReportInput
{
    /** Request key => definition filter name. */
    public const FILTER_KEYS = [
        'date_from' => 'date', 'date_to' => 'date', 'warehouse_id' => 'warehouse', 'product_id' => 'product',
        'supplier_id' => 'supplier', 'status' => 'status', 'movement_type' => 'movement_type', 'category' => 'category',
    ];

    public function __construct(private readonly ReportRegistry $registry) {}

    /**
     * @param  array<string, mixed>  $extraRules  rules for non-filter keys accepted by the endpoint
     * @return array{0: ReportDefinition, 1: ReportFilters, 2: array<string, mixed>}
     */
    public function resolve(array $input, array $extraRules = [], bool $requireAvailable = true): array
    {
        $allowed = ['report_key', ...array_keys(self::FILTER_KEYS), ...array_keys($extraRules)];
        $unknown = array_values(array_diff(array_keys($input), $allowed));
        if ($unknown !== []) {
            throw ValidationException::withMessages(collect($unknown)->mapWithKeys(
                fn ($key) => [(string) $key => 'This field is not allowed for report requests.']
            )->all());
        }

        $validated = Validator::make($input, [
            'report_key' => ['required', 'string', Rule::in($this->registry->keys())],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'status' => ['nullable', 'string', 'max:64'],
            'movement_type' => ['nullable', Rule::in(['STOCK_IN', 'STOCK_OUT'])],
            'category' => ['nullable', 'string', 'max:100'],
            ...$extraRules,
        ], [
            'date_to.after_or_equal' => 'The To date must be on or after the From date.',
        ])->validate();

        $definition = $this->registry->find($validated['report_key']);
        if ($requireAvailable && ! $definition->available()) {
            throw ValidationException::withMessages(['report_key' => $definition->unavailableReason]);
        }

        $errors = [];
        foreach (self::FILTER_KEYS as $key => $filter) {
            if (($validated[$key] ?? null) !== null && $validated[$key] !== '' && ! $definition->allows($filter)) {
                $errors[$key] = "The {$filter} filter does not apply to {$definition->name}.";
            }
        }
        if (($validated['status'] ?? null) && ! array_key_exists($validated['status'], $definition->statuses)) {
            $errors['status'] ??= 'The selected status is not valid for this report.';
        }
        if ($errors !== []) throw ValidationException::withMessages($errors);

        $filters = new ReportFilters(
            dateFrom: isset($validated['date_from']) ? Carbon::createFromFormat('Y-m-d', $validated['date_from'])->startOfDay() : null,
            dateTo: isset($validated['date_to']) ? Carbon::createFromFormat('Y-m-d', $validated['date_to'])->startOfDay() : null,
            warehouseId: isset($validated['warehouse_id']) ? (int) $validated['warehouse_id'] : null,
            productId: isset($validated['product_id']) ? (int) $validated['product_id'] : null,
            supplierId: isset($validated['supplier_id']) ? (int) $validated['supplier_id'] : null,
            status: $validated['status'] ?? null ?: null,
            movementType: $validated['movement_type'] ?? null,
            category: isset($validated['category']) && trim($validated['category']) !== '' ? trim($validated['category']) : null,
        );

        return [$definition, $filters, array_intersect_key($validated, $extraRules)];
    }
}
