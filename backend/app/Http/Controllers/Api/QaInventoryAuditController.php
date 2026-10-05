<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\InventoryAuditCycle;
use App\Models\InventoryAuditEvidence;
use App\Models\InventoryAuditItem;
use App\Models\Role;
use App\Models\User;
use App\Models\Warehouse;
use App\Notifications\WorkflowNotification;
use App\Support\AuditLogger;
use App\Support\InventoryAuditCycles;
use App\Support\WarehouseCapacity;
use App\Support\WorkflowNotificationSender;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Throwable;

class QaInventoryAuditController extends Controller
{
    private const FAILURE_REASONS = [
        'Damaged Packaging / Container',
        'Broken or Tampered Seal',
        'Leakage / Spillage',
        'Product Deterioration',
        'Contamination',
        'Expired / Beyond Shelf Life',
        'Moisture / Water Damage',
        'Cracked / Broken / Deformed Product',
        'Missing or Unreadable Label',
        'Does Not Meet Quality Standard',
        'Other',
    ];

    public function index(Request $request): JsonResponse
    {
        $user = $this->qa($request);
        $cycle = InventoryAuditCycles::ensureFor(InventoryAuditCycles::currentDate());
        $query = $this->inventoryFor($user)->with(['product', 'warehouse'])->orderBy('id');

        $latest = $cycle
            ? InventoryAuditItem::query()->where('inventory_audit_cycle_id', $cycle->id)
                ->with(['qaUser:id,name', 'adminUser:id,name', 'evidence'])->orderByDesc('attempt_number')->get()->groupBy('inventory_id')
            : collect();

        return response()->json([
            'schedule' => ['months' => InventoryAuditCycles::setting()->audit_months],
            'cycle' => $cycle ? $this->cycleData($cycle) : null,
            'data' => $query->get()->map(function (Inventory $inventory) use ($latest) {
                $attempts = $latest->get($inventory->id, collect());
                return $this->inventoryData($inventory, $attempts->first(), $attempts);
            })->values(),
        ]);
    }

    public function history(Request $request): JsonResponse
    {
        $user = $this->qa($request);
        $inventoryIds = $this->inventoryFor($user)->pluck('id');
        $cycles = InventoryAuditCycle::query()->with(['items' => fn ($query) => $query
            ->whereIn('inventory_id', $inventoryIds)
            ->with(['inventory.product', 'inventory.warehouse', 'qaUser:id,name', 'adminUser:id,name', 'evidence'])
            ->orderByDesc('submitted_at')])
            ->orderByDesc('scheduled_for')->get();

        return response()->json(['data' => $cycles->map(fn (InventoryAuditCycle $cycle) => [
            ...$this->cycleData($cycle),
            'items' => $cycle->items->map(fn (InventoryAuditItem $item) => $this->itemData($item))->values(),
        ])]);
    }

    public function store(Request $request, Inventory $inventory): JsonResponse
    {
        $user = $this->qa($request);
        abort_unless($this->inventoryFor($user)->whereKey($inventory->id)->exists(), 403, 'This inventory is outside your assigned scope.');

        $validated = $request->validate([
            'result' => ['required', Rule::in(['PASSED', 'FAILED'])],
            'failed_quantity' => ['required_if:result,FAILED', 'nullable', 'integer', 'min:1'],
            'failure_reason' => ['required_if:result,FAILED', 'nullable', 'string', Rule::in(self::FAILURE_REASONS), 'max:255'],
            'remarks' => [Rule::requiredIf(fn () => $request->input('result') === 'FAILED' && $request->input('failure_reason') === 'Other'), 'nullable', 'string', 'max:2000'],
            'evidence' => ['required_if:result,FAILED', 'prohibited_unless:result,FAILED', 'array', 'min:1', 'max:5'],
            'evidence.*' => ['file', 'mimes:jpg,jpeg,png', 'mimetypes:image/jpeg,image/png', 'extensions:jpg,jpeg,png', 'max:5120'],
        ], [
            'evidence.required_if' => 'At least one photo is required for a failed audit.',
            'evidence.max' => 'A failed audit may contain no more than 5 photos.',
            'evidence.*.max' => 'Each photo must not exceed 5 MB.',
            'failure_reason.in' => 'Select a valid failure reason.',
            'remarks.required' => 'Please specify the failure reason in Remarks.',
        ]);

        $cycle = InventoryAuditCycles::ensureFor(InventoryAuditCycles::currentDate());
        if (! $cycle) throw ValidationException::withMessages(['cycle' => 'No inventory quality audit is scheduled for this month.']);

        $storedPaths = [];
        try {
            $item = DB::transaction(function () use ($request, $user, $inventory, $cycle, $validated, &$storedPaths) {
                $lockedCycle = InventoryAuditCycle::query()->lockForUpdate()->findOrFail($cycle->id);
                abort_unless($lockedCycle->status === InventoryAuditCycle::STATUS_ACTIVE, 422, 'This audit cycle is no longer active.');
                $warehouse = Warehouse::query()->lockForUpdate()->findOrFail($inventory->warehouse_id);
                $lockedInventory = Inventory::query()->lockForUpdate()->findOrFail($inventory->id);
                $latest = InventoryAuditItem::query()
                    ->where('inventory_audit_cycle_id', $lockedCycle->id)
                    ->where('inventory_id', $lockedInventory->id)
                    ->orderByDesc('attempt_number')->lockForUpdate()->first();

                if ($latest && $latest->status !== InventoryAuditItem::STATUS_RETURNED) {
                    throw ValidationException::withMessages(['inventory' => 'This inventory has already been submitted for the current audit cycle.']);
                }

                $previousHold = $latest?->failed_quantity ?? 0;
                $auditedQuantity = $lockedInventory->available_stock + $previousHold;
                $failedQuantity = $validated['result'] === 'FAILED' ? (int) $validated['failed_quantity'] : 0;
                if ($failedQuantity > $auditedQuantity) {
                    throw ValidationException::withMessages(['failed_quantity' => 'Failed quantity cannot exceed the quantity available for this inspection.']);
                }

                $lockedInventory->available_stock = $auditedQuantity - $failedQuantity;
                $lockedInventory->status = $this->inventoryStatus($lockedInventory->available_stock);
                $lockedInventory->save();
                WarehouseCapacity::recordTransition($warehouse);

                $item = InventoryAuditItem::create([
                    'inventory_audit_cycle_id' => $lockedCycle->id,
                    'inventory_id' => $lockedInventory->id,
                    'qa_user_id' => $user->id,
                    'previous_item_id' => $latest?->id,
                    'audit_reference' => sprintf('%s-%06d-A%d', $lockedCycle->reference, $lockedInventory->id, ($latest?->attempt_number ?? 0) + 1),
                    'attempt_number' => ($latest?->attempt_number ?? 0) + 1,
                    'audited_quantity' => $auditedQuantity,
                    'failed_quantity' => $failedQuantity,
                    'result' => $validated['result'],
                    'status' => $validated['result'] === 'PASSED' ? InventoryAuditItem::STATUS_PASSED : InventoryAuditItem::STATUS_PENDING,
                    'failure_reason' => $validated['failure_reason'] ?? null,
                    'qa_remarks' => $validated['remarks'] ?? null,
                    'submitted_at' => now(),
                ]);

                foreach ($request->file('evidence', []) as $file) {
                    $path = $file->storeAs('inventory-audit-evidence/'.$item->id, Str::uuid().'.'.$file->guessExtension(), 'local');
                    $storedPaths[] = $path;
                    InventoryAuditEvidence::create([
                        'inventory_audit_item_id' => $item->id,
                        'original_name' => $file->getClientOriginalName(),
                        'stored_path' => $path,
                        'mime_type' => $file->getMimeType(),
                        'file_size' => $file->getSize(),
                        'uploaded_by' => $user->id,
                    ]);
                }

                if (! $lockedCycle->started_at) $lockedCycle->update(['started_at' => now()]);

                $productName = $lockedInventory->product()->value('name') ?? 'inventory item';
                if ($item->status === InventoryAuditItem::STATUS_PENDING) {
                    DB::afterCommit(function () use ($item, $productName, $failedQuantity) {
                        $adminRoleId = Role::query()->where('slug', 'ADMIN')->value('id');
                        $admins = $adminRoleId ? User::query()->where('role_id', $adminRoleId)->where('status', 'ACTIVE')->get() : collect();
                        WorkflowNotificationSender::send($admins, new WorkflowNotification(
                            'Inventory Audit Approval Required',
                            "QA/QC Supervisor submitted {$failedQuantity} units of {$productName} for inventory audit approval.",
                            'warning', (string) $item->id, 'Inventory Audit Approval', ['path' => '/admin/inventory-audit-approvals']
                        ));
                    });
                }

                AuditLogger::success($item->result === 'PASSED' ? 'INVENTORY_AUDIT_PASSED' : 'INVENTORY_AUDIT_FAILED_SUBMITTED', AuditLogger::MODULE_INVENTORY_AUDIT, [
                    'resource' => $item,
                    'resource_label' => $item->audit_reference,
                    'details' => $item->result === 'PASSED' ? 'Inventory item passed quality audit.' : 'Failed inventory was held and sent for Admin approval.',
                    'metadata' => ['inventory_id' => $lockedInventory->id, 'failed_quantity' => $failedQuantity, 'attempt' => $item->attempt_number],
                ]);
                if ($item->evidence()->exists()) {
                    AuditLogger::success('INVENTORY_AUDIT_EVIDENCE_SUBMITTED', AuditLogger::MODULE_INVENTORY_AUDIT, [
                        'resource' => $item, 'resource_label' => $item->audit_reference,
                        'details' => 'Submitted photo evidence for a failed inventory audit.',
                        'metadata' => ['evidence_count' => $item->evidence()->count()],
                    ]);
                }
                if ($latest) {
                    AuditLogger::success('INVENTORY_AUDIT_REINSPECTION_COMPLETED', AuditLogger::MODULE_INVENTORY_AUDIT, [
                        'resource' => $item, 'resource_label' => $item->audit_reference,
                        'details' => 'Completed a new inspection attempt without changing the original returned submission.',
                        'metadata' => ['previous_item_id' => $latest->id, 'result' => $item->result],
                    ]);
                }

                return $item;
            }, 3);
        } catch (Throwable $exception) {
            foreach ($storedPaths as $path) Storage::disk('local')->delete($path);
            throw $exception;
        }

        return response()->json(['data' => $this->itemData($item->load(['cycle', 'inventory.product', 'inventory.warehouse', 'qaUser:id,name', 'adminUser:id,name', 'evidence']))], 201);
    }

    private function qa(Request $request): User
    {
        $user = $request->user();
        abort_unless($user?->isQaSupervisor(), 403, 'QA Supervisor access is required.');
        abort_unless($user->warehouse_id || $user->branch_id, 403, 'A warehouse or branch assignment is required.');
        return $user;
    }

    private function inventoryFor(User $user): Builder
    {
        $query = Inventory::query();
        if ($user->warehouse_id) return $query->where('warehouse_id', $user->warehouse_id);
        return $query->whereHas('warehouse', fn (Builder $warehouse) => $warehouse->where('branch_id', $user->branch_id));
    }

    private function inventoryStatus(int $available): string
    {
        return $available <= 0 ? 'Out of Stock' : ($available <= 20 ? 'Low Stock' : 'Available');
    }

    private function cycleData(InventoryAuditCycle $cycle): array
    {
        return ['id' => $cycle->id, 'reference' => $cycle->reference, 'name' => $cycle->name, 'scheduled_for' => $cycle->scheduled_for->toDateString(), 'status' => $cycle->status, 'started_at' => $cycle->started_at, 'completed_at' => $cycle->completed_at];
    }

    private function inventoryData(Inventory $inventory, ?InventoryAuditItem $latest, $attempts): array
    {
        return [
            'id' => $inventory->id, 'barcode' => $inventory->barcode, 'product' => $inventory->product->name,
            'category' => $inventory->product->category, 'brand' => $inventory->product->brand, 'unit' => $inventory->product->unit,
            'warehouse' => $inventory->warehouse->name, 'available_stock' => $inventory->available_stock,
            'backload' => $inventory->backload, 'latest_audit' => $latest ? $this->itemData($latest) : null,
            'attempts' => $attempts->map(fn (InventoryAuditItem $item) => $this->itemData($item))->values(),
        ];
    }

    private function itemData(InventoryAuditItem $item): array
    {
        $item->loadMissing(['cycle', 'inventory.product', 'inventory.warehouse', 'qaUser:id,name', 'adminUser:id,name', 'evidence']);
        return [
            'id' => $item->id, 'audit_reference' => $item->audit_reference, 'attempt_number' => $item->attempt_number,
            'cycle' => $item->cycle?->name, 'inventory_id' => $item->inventory_id, 'product' => $item->inventory?->product?->name,
            'barcode' => $item->inventory?->barcode, 'warehouse' => $item->inventory?->warehouse?->name,
            'audited_quantity' => $item->audited_quantity, 'failed_quantity' => $item->failed_quantity,
            'result' => $item->result, 'status' => $item->status, 'failure_reason' => $item->failure_reason,
            'qa_remarks' => $item->qa_remarks, 'qa_user' => $item->qaUser?->name, 'submitted_at' => $item->submitted_at,
            'admin_user' => $item->adminUser?->name, 'admin_remarks' => $item->admin_remarks, 'reviewed_at' => $item->reviewed_at,
            'evidence' => $item->evidence->map(fn (InventoryAuditEvidence $evidence) => [
                'id' => $evidence->id, 'original_name' => $evidence->original_name, 'mime_type' => $evidence->mime_type,
                'file_size' => $evidence->file_size, 'view_url' => "/inventory-audits/evidence/{$evidence->id}",
            ])->values(),
        ];
    }
}
