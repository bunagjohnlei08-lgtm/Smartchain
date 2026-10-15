<?php
namespace App\Support;

use App\Models\{Bom, Product, ProductionBatch, User};
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class ProductionRules
{
    public const DEFAULT_MINUTES = 30;
    public static function usableBom(?Bom $bom): bool
    {
        if (!$bom || $bom->output_quantity < 1 || $bom->minimum_processing_minutes < 1) return false;
        $bom->loadMissing(['product', 'materials.product']);
        return $bom->product?->item_classification === Product::FINISHED_PRODUCT
            && in_array(WarehouseCapacity::normalizeUnit($bom->product->unit), WarehouseCapacity::UNITS, true)
            && $bom->materials->isNotEmpty() && $bom->materials->every(fn ($material) => $material->product?->item_classification === Product::RAW_MATERIAL
                && in_array(WarehouseCapacity::normalizeUnit($material->product->unit), WarehouseCapacity::UNITS, true)
                && (float) $material->required_quantity > 0);
    }
    /** Legacy duration is reconstructed only from an authoritative recorded start, never page load. */
    public static function timing(ProductionBatch $batch): array
    {
        $minimum = $batch->minimum_processing_minutes ?? self::DEFAULT_MINUTES;
        $start = $batch->production_started_at ?? $batch->issued_at;
        $compatibility = $batch->minimum_processing_minutes === null ? 'legacy_recorded_issuance' : 'snapshot';
        if (!$start && $batch->minimum_processing_minutes === null) {
            $event = DB::table('production_batch_events')->where('production_batch_id', $batch->id)->where('action', 'MATERIAL_ISSUED_TO_PRODUCTION')->orderBy('id')->value('occurred_at');
            $start = $event ? Carbon::parse($event) : null;
            if (!$start) {
                $issued = DB::table('production_material_issues as issues')->join('production_batch_materials as materials', 'materials.id', '=', 'issues.production_batch_material_id')
                    ->where('materials.production_batch_id', $batch->id)->max('issues.issued_at');
                $start = $issued ? Carbon::parse($issued) : null;
            }
            if (!$start) $compatibility = 'legacy_no_recorded_start';
        }
        $available = $batch->output_available_at ?? ($start ? $start->copy()->addMinutes($minimum) : null);
        $remaining = $available ? max(0, $available->getTimestamp() - now()->getTimestamp()) : 0;
        return ['minimum_processing_minutes' => $minimum, 'production_started_at' => $start?->toIso8601String(),
            'output_available_at' => $available?->toIso8601String(), 'server_time' => now()->toIso8601String(), 'remaining_seconds' => $remaining,
            'elapsed' => $remaining === 0 && ($available !== null || $compatibility === 'legacy_no_recorded_start'), 'compatibility' => $compatibility];
    }
    public static function legacyIssuedWithoutTimestamp(ProductionBatch $batch): bool
    {
        if ($batch->minimum_processing_minutes !== null) return false;
        $materials = $batch->materials()->get();
        return $materials->isNotEmpty() && $materials->every(fn ($material) => $material->required_quantity !== null
            && $material->required_quantity > 0 && $material->issued_quantity >= $material->required_quantity);
    }
    public static function requireElapsed(ProductionBatch $batch): void
    {
        $timing = self::timing($batch);
        if (!$timing['elapsed']) throw ValidationException::withMessages(['actual_quantity' => 'Minimum processing time has not elapsed. Output is available at '.($timing['output_available_at'] ?? 'the recorded production start plus its saved duration').'.']);
    }
    public static function outputAcknowledgment(User $user, ProductionBatch $batch, array $values): ?array
    {
        $over = (int) $values['actual_quantity'] > $batch->target_quantity;
        $ack = $values['excess_confirmation'] ?? null;
        if (!$over && !$ack) return null;
        if (!$ack || (int) ($ack['target_quantity'] ?? -1) !== $batch->target_quantity || (int) ($ack['actual_quantity'] ?? -1) !== (int) $values['actual_quantity'] || ($ack['confirmed'] ?? false) !== true) {
            throw ValidationException::withMessages(['excess_confirmation' => 'Confirm the current target and actual over-target output quantity before sending to QA. Previous or missing confirmations are invalid.']);
        }
        return [...$ack, 'excess_quantity' => (int) $values['actual_quantity'] - $batch->target_quantity, 'confirmed_by' => $user->id, 'confirmed_at' => now()->toIso8601String()];
    }
    public static function qaAcknowledgment(User $user, ProductionBatch $batch, array $values): ?array
    {
        if ($batch->actual_quantity <= $batch->target_quantity) return null;
        $ack = $values['excess_confirmation'] ?? [];
        $context = ['target_quantity' => $batch->target_quantity, 'actual_quantity' => $batch->actual_quantity, 'passed_quantity' => (int) $values['passed_quantity'], 'failed_quantity' => (int) $values['failed_quantity']];
        foreach ($context as $field => $expected) {
            if ((int) ($ack[$field] ?? -1) !== $expected) self::invalidQa('Re-review the current target, actual, passed and failed quantities. Previous or missing confirmations are invalid.');
        }
        if (($ack['inspection_notes'] ?? null) !== $values['notes']) self::invalidQa('Inspection notes changed. Review the result and confirm the applicable checks again.');
        if (($ack['quantity_verified'] ?? false) !== true) self::invalidQa('Verify actual produced quantity and its stock unit.');
        if ($context['passed_quantity'] > 0 && (($ack['passed_inspected'] ?? false) !== true || ($ack['passed_meets_requirements'] ?? false) !== true)) self::invalidQa('Confirm inspection against approved criteria and applicable quality requirements for the units marked as passed.');
        if ($context['failed_quantity'] > 0 && ($ack['failed_excluded'] ?? false) !== true) self::invalidQa('Confirm failed/non-conforming units are identified and excluded from the passed quantity.');
        return [...$context, 'inspection_notes' => $values['notes'], 'excess_quantity' => $batch->actual_quantity - $batch->target_quantity,
            'checks' => ['quantity_verified' => true, 'passed_inspected' => $context['passed_quantity'] > 0 ? true : 'not_applicable', 'passed_meets_requirements' => $context['passed_quantity'] > 0 ? true : 'not_applicable', 'failed_excluded' => $context['failed_quantity'] > 0 ? true : 'not_applicable'],
            'inspector_id' => $user->id, 'confirmed_at' => now()->toIso8601String()];
    }
    private static function invalidQa(string $message): never { throw ValidationException::withMessages(['excess_confirmation' => $message]); }
}
