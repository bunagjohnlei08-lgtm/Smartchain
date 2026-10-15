<?php

namespace App\Support;

use App\Models\Bom;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\ProductionBatch;
use App\Models\User;
use App\Models\Warehouse;
use App\Notifications\WorkflowNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class ProductionWorkflow
{
    /** Exact fixed-point arithmetic; existing inventory stores whole quantities. */
    public static function scaledDemand(string $coefficient, int $target, int $output): array
    {
        [$whole, $fraction] = array_pad(explode('.', $coefficient, 2), 2, '');
        $fixed = (int) $whole * 1000000 + (int) str_pad($fraction, 6, '0');
        $numerator = $fixed * $target;
        $denominator = 1000000 * $output;
        $a = $numerator; $b = $denominator;
        while ($b !== 0) { $remainder = $a % $b; $a = $b; $b = $remainder; }
        $exact = intdiv($numerator, $a).'/'.intdiv($denominator, $a);
        $quantity = $numerator % $denominator === 0 ? intdiv($numerator, $denominator) : null;
        $reason = $quantity === null ? "Exact demand {$exact} is fractional. Inventory stores whole stock units; use a compatible target quantity or explicitly revise the BOM." : null;
        if ($quantity !== null && $quantity > 2147483647) { $reason = 'Demand exceeds the existing whole-quantity column limit. Reduce the target quantity.'; $quantity = null; }
        return ['required_quantity' => $quantity, 'required_quantity_exact' => $quantity === null ? $exact : (string) $quantity, 'blocking_reason' => $reason];
    }

    public static function authorizeBatch(User $user, ProductionBatch $batch, string $operation): void
    {
        if ($operation === 'read' && $user->isAdmin()) return;
        if ($user->isPlantManager() && (int) $user->warehouse_id === (int) $batch->warehouse_id && ! in_array($operation, ['qa', 'disposition'], true)) return;
        if ($user->isQaSupervisor() && (int) $batch->assigned_qa_user_id === (int) $user->id && in_array($operation, ['read', 'qa', 'disposition'], true)) return;
        abort(403, 'This production action is outside your role or assigned warehouse/QA batch.');
    }

    public static function create(User $user, array $values): ProductionBatch
    {
        abort_unless($user->isPlantManager() && $user->warehouse_id && (int) $values['warehouse_id'] === (int) $user->warehouse_id, 403, 'Plant Managers create batches only in their assigned warehouse.');
        return DB::transaction(function () use ($user, $values) {
            $warehouse = ProductCatalogSetup::lockActiveWarehouse((int) $values['warehouse_id']);
            $product = Product::query()->lockForUpdate()->findOrFail($values['product_id']);
            if ($product->item_classification !== Product::FINISHED_PRODUCT) self::invalid('product_id', 'Production output must be a Finished Product.');
            CatalogProductRules::ensureSupported($warehouse, $product->unit);
            if (! $product->inventories()->where('warehouse_id', $warehouse->id)->exists()) self::invalid('product_id', 'Assign this finished product to your warehouse in Product Catalog before production.');
            $bom = Bom::query()->where('product_id', $product->id)->lockForUpdate()->first();
            if (! ProductionRules::usableBom($bom)) self::invalid('bom', 'A valid current BOM is required. Ask Admin to configure the finished product formula.');
            $batch = ProductionBatch::create([
                'batch_number' => 'PROD-'.now()->format('Ymd').'-'.strtoupper(Str::random(10)),
                'product_id' => $product->id, 'product_name' => $product->name, 'unit' => $product->unit,
                'warehouse_id' => $warehouse->id, 'bom_id' => $bom->id, 'bom_output_quantity' => $bom->output_quantity,
                'target_quantity' => $values['target_quantity'], 'status' => 'PLANNED', 'created_by_id' => $user->id,
                'minimum_processing_minutes' => $bom->minimum_processing_minutes,
            ]);
            foreach ($bom->materials()->with('product')->orderBy('product_id')->get() as $material) {
                if ($material->product->item_classification !== Product::RAW_MATERIAL) self::invalid('bom', 'Every BOM ingredient must be an existing Raw Material.');
                $batch->materials()->create([
                    'product_id' => $material->product_id, 'product_name' => $material->product->name, 'unit' => $material->product->unit,
                    'bom_quantity' => $material->required_quantity,
                    ...self::scaledDemand($material->required_quantity, (int) $values['target_quantity'], $bom->output_quantity),
                ]);
            }
            self::event($batch, $user, 'PRODUCTION_BATCH_CREATED', 'Planned from an explicit Plant Manager action. No material was deducted.');
            self::notify($batch, 'Production Batch Created');
            return $batch;
        }, 3);
    }

    public static function issue(User $user, ProductionBatch $batch): ProductionBatch
    {
        self::authorizeBatch($user, $batch, 'issue');
        return DB::transaction(function () use ($user, $batch) {
            $warehouse = Warehouse::query()->lockForUpdate()->findOrFail($batch->warehouse_id);
            $batch = ProductionBatch::query()->lockForUpdate()->findOrFail($batch->id);
            if ($batch->status === 'CANCELLED') self::invalid('status', 'Cancelled batches cannot issue materials.');
            if ($batch->issued_at) return $batch;
            if ($batch->status !== 'PLANNED') self::invalid('status', 'Only planned batches can issue materials.');
            $materials = $batch->materials()->with('product')->orderBy('product_id')->lockForUpdate()->get();
            if ($materials->isEmpty()) self::invalid('materials', 'No BOM ingredients are configured.');
            $inventories = Inventory::query()->where('warehouse_id', $warehouse->id)->whereIn('product_id', $materials->pluck('product_id'))->orderBy('product_id')->lockForUpdate()->get()->keyBy('product_id');
            foreach ($materials as $material) {
                if ($material->blocking_reason || $material->required_quantity === null) self::invalid('materials', "{$material->product_name}: {$material->blocking_reason}");
                if ($material->product->item_classification !== Product::RAW_MATERIAL || WarehouseCapacity::normalizeUnit($material->product->unit) !== WarehouseCapacity::normalizeUnit($material->unit)) self::invalid('materials', 'Material classification/unit changed; do not issue this snapshot.');
                $inventory = $inventories->get($material->product_id);
                if (! $inventory || $inventory->pending_receiving || $inventory->available_stock < $material->required_quantity) self::invalid('materials', "Insufficient {$material->product_name}: {$material->required_quantity} {$material->unit} required, ".($inventory?->available_stock ?? 0).' available in this warehouse.');
            }
            foreach ($materials as $material) {
                $inventory = $inventories[$material->product_id];
                $inventory->available_stock -= $material->required_quantity;
                if ($inventory->available_stock === 0) $inventory->status = 'Out of Stock';
                $inventory->save();
                $material->update(['issued_quantity' => $material->required_quantity]);
                DB::table('production_material_issues')->insert([
                    'production_batch_material_id' => $material->id, 'inventory_id' => $inventory->id, 'warehouse_id' => $warehouse->id,
                    'quantity' => $material->required_quantity, 'issued_by_id' => $user->id, 'issued_at' => now(),
                ]);
            }
            $started = now();
            $minimum = $batch->minimum_processing_minutes ?? ProductionRules::DEFAULT_MINUTES;
            $batch->update(['status' => 'IN_PRODUCTION', 'issued_at' => $started, 'production_started_at' => $started,
                'minimum_processing_minutes' => $minimum, 'output_available_at' => $started->copy()->addMinutes($minimum)]);
            WarehouseCapacity::recordTransition($warehouse);
            self::event($batch, $user, 'MATERIAL_ISSUED_TO_PRODUCTION', 'All planned whole-unit materials issued atomically.');
            self::notify($batch, 'Production Materials Issued');
            return $batch;
        }, 3);
    }

    public static function recordOutput(User $user, ProductionBatch $batch, array $values): ProductionBatch
    {
        self::authorizeBatch($user, $batch, 'output');
        return DB::transaction(function () use ($user, $batch, $values) {
            $batch = ProductionBatch::query()->lockForUpdate()->findOrFail($batch->id);
            if ($batch->status !== 'IN_PRODUCTION' || (! $batch->issued_at && !ProductionRules::legacyIssuedWithoutTimestamp($batch))) self::invalid('status', 'Issue materials first. Output can be recorded once, while the batch is in production.');
            ProductionRules::requireElapsed($batch);
            $acknowledgment = ProductionRules::outputAcknowledgment($user, $batch, $values);
            $qa = User::query()->with('role')->lockForUpdate()->findOrFail($values['assigned_qa_user_id']);
            $warehouse = $batch->warehouse;
            $scoped = $qa->warehouse_id ? (int) $qa->warehouse_id === (int) $warehouse->id : (! $qa->branch_id || (int) $qa->branch_id === (int) $warehouse->branch_id);
            if (! $qa->isQaSupervisor() || $qa->status !== 'ACTIVE' || ! $scoped) self::invalid('assigned_qa_user_id', 'Select an active QA Supervisor eligible for this warehouse.');
            $batch->update(['actual_quantity' => $values['actual_quantity'], 'assigned_qa_user_id' => $qa->id, 'output_recorded_at' => now(), 'status' => 'PENDING_QA']);
            self::event($batch, $user, 'PRODUCTION_OUTPUT_RECORDED', 'Actual output recorded; no finished inventory increase.',
                ['target_quantity' => $batch->target_quantity, 'actual_quantity' => $batch->actual_quantity, 'unit' => $batch->unit, 'excess_confirmation' => $acknowledgment]);
            self::notify($batch, 'Production Output Awaiting QA');
            return $batch;
        }, 3);
    }

    public static function inspect(User $user, ProductionBatch $batch, array $values): ProductionBatch
    {
        self::authorizeBatch($user, $batch, 'qa');
        return DB::transaction(function () use ($user, $batch, $values) {
            $batch = ProductionBatch::query()->lockForUpdate()->findOrFail($batch->id);
            if ($batch->qa_completed_at && (int) $values['passed_quantity'] === $batch->passed_quantity && (int) $values['failed_quantity'] === $batch->failed_quantity) return $batch;
            if ($batch->status !== 'PENDING_QA') self::invalid('status', 'Only recorded output awaiting QA can be inspected.');
            if ((int) $values['passed_quantity'] + (int) $values['failed_quantity'] !== $batch->actual_quantity) self::invalid('passed_quantity', 'Passed and failed quantities must add up exactly to the recorded produced quantity.');
            $acknowledgment = ProductionRules::qaAcknowledgment($user, $batch, $values);
            $batch->update(['passed_quantity' => $values['passed_quantity'], 'failed_quantity' => $values['failed_quantity'], 'qa_notes' => $values['notes'], 'qa_completed_at' => now(), 'status' => 'QA_COMPLETED']);
            if ($batch->failed_quantity > 0) DB::table('production_non_conformances')->insert([
                'production_batch_id' => $batch->id, 'quantity' => $batch->failed_quantity, 'disposition' => 'HOLD', 'notes' => $values['notes'],
                'handled_by_id' => $user->id, 'created_at' => now(), 'updated_at' => now(),
            ]);
            self::event($batch, $user, 'PRODUCTION_QA_COMPLETED', $values['notes'], ['passed' => $batch->passed_quantity, 'failed' => $batch->failed_quantity,
                'target_quantity' => $batch->target_quantity, 'actual_quantity' => $batch->actual_quantity, 'unit' => $batch->unit, 'excess_confirmation' => $acknowledgment]);
            self::notify($batch, $batch->passed_quantity > 0 ? 'Finished Goods Ready for Stock In' : 'Production Output Failed QA');
            return $batch;
        }, 3);
    }

    public static function stockIn(User $user, ProductionBatch $batch): ProductionBatch
    {
        self::authorizeBatch($user, $batch, 'stock_in');
        return DB::transaction(function () use ($user, $batch) {
            $warehouse = Warehouse::query()->lockForUpdate()->findOrFail($batch->warehouse_id);
            $batch = ProductionBatch::query()->lockForUpdate()->findOrFail($batch->id);
            if ($batch->stocked_in_at) return $batch;
            if ($batch->status !== 'QA_COMPLETED' || ! $batch->qa_completed_at || $batch->passed_quantity <= 0) self::invalid('status', 'Only the QA-passed quantity is eligible for finished-goods Stock In.');
            $product = Product::query()->lockForUpdate()->findOrFail($batch->product_id);
            if ($product->item_classification !== Product::FINISHED_PRODUCT || WarehouseCapacity::normalizeUnit($product->unit) !== WarehouseCapacity::normalizeUnit($batch->unit)) self::invalid('product', 'Finished product classification/unit differs from the batch snapshot.');
            WarehouseCapacity::ensureAdditionsFit($warehouse, [WarehouseCapacity::normalizeUnit($batch->unit) => $batch->passed_quantity]);
            [$inventory] = ProductCatalogSetup::ensureInventory($product, $warehouse, $user);
            $inventory->available_stock += $batch->passed_quantity;
            $inventory->status = 'Available';
            $inventory->pending_receiving = false;
            $inventory->save();
            $batch->update(['stocked_in_at' => now(), 'status' => 'STOCKED_IN']);
            WarehouseCapacity::recordTransition($warehouse);
            self::event($batch, $user, 'FINISHED_GOODS_STOCKED_IN', 'Only QA-passed quantity entered the existing inventory.', ['quantity' => $batch->passed_quantity, 'inventory_id' => $inventory->id, 'barcode' => $inventory->barcode]);
            self::notify($batch, 'Production Stock In Completed');
            return $batch;
        }, 3);
    }

    public static function cancel(User $user, ProductionBatch $batch, array $values): ProductionBatch
    {
        self::authorizeBatch($user, $batch, 'cancel');
        return DB::transaction(function () use ($user, $batch, $values) {
            $warehouse = Warehouse::query()->lockForUpdate()->findOrFail($batch->warehouse_id);
            $batch = ProductionBatch::query()->lockForUpdate()->findOrFail($batch->id);
            if ($batch->status === 'CANCELLED') return $batch;
            if (! in_array($batch->status, ['PLANNED', 'IN_PRODUCTION'], true)) self::invalid('status', 'Recorded output must complete the production QA/disposition workflow and cannot be cancelled.');
            $disposition = $values['material_disposition'] ?? null;
            $issued = $batch->issued_at || ProductionRules::legacyIssuedWithoutTimestamp($batch);
            $materials = $batch->materials()->orderBy('product_id')->lockForUpdate()->get();
            if ($issued && ! in_array($disposition, ['RETURN_UNUSED', 'DISPOSED'], true)) self::invalid('material_disposition', 'Issued materials require an explicit unused-material return or documented disposal before cancellation.');
            if ($issued && $disposition === 'RETURN_UNUSED') {
                if (empty($values['confirm_unused_materials'])) self::invalid('confirm_unused_materials', 'Confirm all issued materials are unused and physically returned; consumed materials cannot be returned.');
                $additions = [];
                foreach ($materials as $material) { $unit = WarehouseCapacity::normalizeUnit($material->unit); $additions[$unit] = ($additions[$unit] ?? 0) + $material->issued_quantity; }
                WarehouseCapacity::ensureAdditionsFit($warehouse, $additions);
                foreach ($materials as $material) {
                    $product = Product::query()->lockForUpdate()->findOrFail($material->product_id);
                    [$inventory] = ProductCatalogSetup::ensureInventory($product, $warehouse, $user);
                    $inventory->available_stock += $material->issued_quantity;
                    $inventory->status = 'Available'; $inventory->save();
                }
            }
            if ($issued) foreach ($materials as $material) $material->update(['disposition' => $disposition]);
            $batch->update(['status' => 'CANCELLED', 'cancelled_at' => now(), 'cancellation_reason' => $values['reason']]);
            WarehouseCapacity::recordTransition($warehouse);
            self::event($batch, $user, 'PRODUCTION_BATCH_CANCELLED', $values['reason'], ['material_disposition' => $disposition]);
            return $batch;
        }, 3);
    }

    public static function disposition(User $user, ProductionBatch $batch, array $values): void
    {
        self::authorizeBatch($user, $batch, 'disposition');
        DB::transaction(function () use ($user, $batch, $values) {
            ProductionBatch::query()->lockForUpdate()->findOrFail($batch->id);
            $case = DB::table('production_non_conformances')->where('production_batch_id', $batch->id)->lockForUpdate()->first();
            if (! $case) self::invalid('disposition', 'This batch has no internal QA failure.');
            if ($case->resolved_at) self::invalid('disposition', 'This disposal decision is already recorded and cannot be rewritten.');
            DB::table('production_non_conformances')->where('id', $case->id)->update([
                'disposition' => $values['disposition'], 'notes' => $values['notes'], 'handled_by_id' => $user->id,
                'resolved_at' => $values['disposition'] === 'DISPOSAL' ? now() : null, 'updated_at' => now(),
            ]);
            self::event($batch, $user, 'PRODUCTION_NON_CONFORMANCE_DISPOSITION', $values['notes'], ['disposition' => $values['disposition']]);
        }, 3);
    }

    public static function present(ProductionBatch $batch): array
    {
        $batch->loadMissing(['materials.product', 'warehouse']);
        $inventory = Inventory::query()->where('warehouse_id', $batch->warehouse_id)->whereIn('product_id', $batch->materials->pluck('product_id'))->get()->keyBy('product_id');
        return [
            ...$batch->toArray(),
            'timing' => ProductionRules::timing($batch),
            'created_by_name' => User::whereKey($batch->created_by_id)->value('name'),
            'assigned_qa_name' => $batch->assigned_qa_user_id ? User::whereKey($batch->assigned_qa_user_id)->value('name') : null,
            'materials' => $batch->materials->map(function ($material) use ($inventory) {
                $record = $inventory->get($material->product_id);
                $available = $record && ! $record->pending_receiving ? $record->available_stock : 0;
                $compatible = WarehouseCapacity::normalizeUnit($material->product?->unit) === WarehouseCapacity::normalizeUnit($material->unit);
                $available = $compatible ? $available : 0;
                $remaining = $material->required_quantity === null ? null : max(0, $material->required_quantity - $material->issued_quantity);
                return [...$material->only(['id', 'product_id', 'product_name', 'unit', 'bom_quantity', 'required_quantity', 'required_quantity_exact', 'blocking_reason', 'issued_quantity', 'disposition']),
                    'blocking_reason' => $compatible ? $material->blocking_reason : 'Current material unit differs from the saved batch unit. Refresh or ask Admin to review this snapshot.',
                    'available_quantity' => $available, 'remaining_required' => $remaining,
                    'shortage_quantity' => $remaining === null ? null : max(0, $remaining - $available)];
            })->values(),
            'events' => DB::table('production_batch_events as events')->leftJoin('users', 'users.id', '=', 'events.performed_by_id')
                ->where('events.production_batch_id', $batch->id)->orderBy('events.id')->get(['events.*', 'users.name as actor_name'])->map(fn ($event) => [
                'id' => $event->id, 'action' => $event->action, 'notes' => $event->notes, 'actor_name' => $event->actor_name, 'metadata' => $event->metadata ? json_decode($event->metadata, true) : null, 'occurred_at' => $event->occurred_at,
            ]),
            'non_conformance' => DB::table('production_non_conformances')->where('production_batch_id', $batch->id)->first(),
        ];
    }

    private static function event(ProductionBatch $batch, User $user, string $action, ?string $notes = null, array $metadata = []): void
    {
        DB::table('production_batch_events')->insert(['production_batch_id' => $batch->id, 'action' => $action, 'performed_by_id' => $user->id, 'notes' => $notes, 'metadata' => json_encode($metadata), 'occurred_at' => now()]);
        AuditLogger::success($action, AuditLogger::MODULE_INVENTORY, ['actor' => $user, 'resource' => $batch, 'resource_label' => $batch->batch_number, 'details' => $notes, 'metadata' => $metadata]);
    }

    private static function notify(ProductionBatch $batch, string $title): void
    {
        $warehouseId = $batch->warehouse_id; $qaId = $batch->assigned_qa_user_id; $number = $batch->batch_number; $id = $batch->id;
        DB::afterCommit(function () use ($warehouseId, $qaId, $number, $id, $title) {
            $recipients = User::query()->with('role')->where('status', 'ACTIVE')->where(fn ($query) => $query
                ->whereHas('role', fn ($role) => $role->where('slug', 'ADMIN'))
                ->orWhere(fn ($managers) => $managers->where('warehouse_id', $warehouseId)->whereHas('role', fn ($role) => $role->where('slug', 'PLANT_MANAGER')))
                ->orWhere('id', $qaId))->get();
            foreach ($recipients as $recipient) {
                $path = $recipient->isAdmin() ? '/admin/production' : ($recipient->isQaSupervisor() ? '/qa/production' : '/plant-manager/production');
                WorkflowNotificationSender::send($recipient, new WorkflowNotification($title, "{$number}: {$title}.", 'info', $number, 'Production', ['path' => $path, 'production_batch_id' => $id]));
            }
        });
    }

    private static function invalid(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }
}
