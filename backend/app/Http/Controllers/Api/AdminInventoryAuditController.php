<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\InventoryAuditItem;
use App\Models\InventoryAuditSetting;
use App\Models\Warehouse;
use App\Notifications\WorkflowNotification;
use App\Support\AuditLogger;
use App\Support\InventoryAuditCycles;
use App\Support\WarehouseCapacity;
use App\Support\WorkflowNotificationSender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminInventoryAuditController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->admin($request);
        $validated = $request->validate(['status' => ['nullable', Rule::in([
            InventoryAuditItem::STATUS_PENDING, InventoryAuditItem::STATUS_APPROVED,
            InventoryAuditItem::STATUS_RETURNED, InventoryAuditItem::STATUS_PASSED,
        ])]]);
        $query = InventoryAuditItem::query()
            ->with(['cycle', 'inventory.product', 'inventory.warehouse', 'qaUser:id,name', 'adminUser:id,name', 'evidence']);
        if ($validated['status'] ?? null) $query->where('status', $validated['status']);

        return response()->json([
            'schedule' => ['months' => InventoryAuditCycles::setting()->audit_months],
            'data' => $query->orderByRaw("CASE WHEN status = ? THEN 0 ELSE 1 END", [InventoryAuditItem::STATUS_PENDING])
                ->orderByDesc('submitted_at')->get()->map(fn (InventoryAuditItem $item) => $this->itemData($item))->values(),
        ]);
    }

    public function show(Request $request, InventoryAuditItem $inventoryAuditItem): JsonResponse
    {
        $this->admin($request);
        return response()->json(['data' => $this->itemData($inventoryAuditItem)]);
    }

    public function updateSchedule(Request $request): JsonResponse
    {
        $this->admin($request);
        $validated = $request->validate([
            'months' => ['required', 'array', 'min:1', 'max:12'],
            'months.*' => ['required', 'integer', 'distinct', 'between:1,12'],
        ]);
        $months = collect($validated['months'])->map(fn ($month) => (int) $month)->sort()->values()->all();
        $setting = InventoryAuditSetting::query()->firstOrNew(['id' => 1]);
        $before = $setting->exists ? $setting->audit_months : InventoryAuditCycles::DEFAULT_MONTHS;
        $setting->fill(['audit_months' => $months, 'updated_by' => $request->user()->id])->save();

        AuditLogger::success('INVENTORY_AUDIT_SCHEDULE_UPDATED', AuditLogger::MODULE_INVENTORY_AUDIT, [
            'resource' => $setting, 'details' => 'Updated configured inventory quality audit months.',
            'metadata' => ['from' => $before, 'to' => $months],
        ]);

        if ($cycle = InventoryAuditCycles::ensureFor(InventoryAuditCycles::currentDate())) InventoryAuditCycles::notifyDue($cycle);
        return response()->json(['months' => $months]);
    }

    public function approve(Request $request, InventoryAuditItem $inventoryAuditItem): JsonResponse
    {
        $this->admin($request);
        $validated = $request->validate(['remarks' => ['nullable', 'string', 'max:2000']]);

        $item = DB::transaction(function () use ($request, $inventoryAuditItem, $validated) {
            $item = InventoryAuditItem::query()->lockForUpdate()->findOrFail($inventoryAuditItem->id);
            if ($item->status !== InventoryAuditItem::STATUS_PENDING) {
                throw ValidationException::withMessages(['status' => 'This audit submission has already been processed.']);
            }
            $warehouseId = Inventory::query()->whereKey($item->inventory_id)->value('warehouse_id');
            $warehouse = Warehouse::query()->lockForUpdate()->findOrFail($warehouseId);
            $inventory = Inventory::query()->lockForUpdate()->findOrFail($item->inventory_id);
            $inventory->backload += $item->failed_quantity;
            $inventory->save();
            WarehouseCapacity::recordTransition($warehouse);
            $item->update([
                'status' => InventoryAuditItem::STATUS_APPROVED,
                'admin_user_id' => $request->user()->id,
                'admin_remarks' => $validated['remarks'] ?? null,
                'reviewed_at' => now(),
            ]);

            $product = $inventory->product()->value('name') ?? 'inventory item';
            DB::afterCommit(fn () => WorkflowNotificationSender::send($item->qaUser, new WorkflowNotification(
                'Inventory Audit Approved',
                "The failed inventory audit for {$product} has been approved and transferred to Backload.",
                'success', (string) $item->id, 'Inventory Quality Audit', ['path' => '/qa/inventory-audit']
            )));
            AuditLogger::success('INVENTORY_AUDIT_APPROVED_FOR_BACKLOAD', AuditLogger::MODULE_INVENTORY_AUDIT, [
                'resource' => $item, 'resource_label' => $item->audit_reference,
                'details' => 'Admin approved the failed quantity and transferred it to existing Backload stock.',
                'metadata' => ['inventory_id' => $inventory->id, 'quantity' => $item->failed_quantity],
            ]);
            AuditLogger::success('INVENTORY_AUDIT_QUANTITY_TRANSFERRED_TO_BACKLOAD', AuditLogger::MODULE_INVENTORY_AUDIT, [
                'resource' => $item, 'resource_label' => $item->audit_reference,
                'details' => 'Transferred the approved held quantity into the existing inventory Backload field.',
                'metadata' => ['inventory_id' => $inventory->id, 'quantity' => $item->failed_quantity],
            ]);
            return $item;
        }, 3);

        return response()->json(['data' => $this->itemData($item->fresh())]);
    }

    public function returnForReinspection(Request $request, InventoryAuditItem $inventoryAuditItem): JsonResponse
    {
        $this->admin($request);
        $validated = $request->validate(['remarks' => ['required', 'string', 'max:2000']]);

        $item = DB::transaction(function () use ($request, $inventoryAuditItem, $validated) {
            $item = InventoryAuditItem::query()->lockForUpdate()->findOrFail($inventoryAuditItem->id);
            if ($item->status !== InventoryAuditItem::STATUS_PENDING) {
                throw ValidationException::withMessages(['status' => 'This audit submission has already been processed.']);
            }
            $item->update([
                'status' => InventoryAuditItem::STATUS_RETURNED,
                'admin_user_id' => $request->user()->id,
                'admin_remarks' => $validated['remarks'],
                'reviewed_at' => now(),
            ]);
            $product = $item->inventory()->with('product')->firstOrFail()->product->name;
            DB::afterCommit(fn () => WorkflowNotificationSender::send($item->qaUser, new WorkflowNotification(
                'Inventory Audit Returned for Reinspection',
                "The inventory audit for {$product} was returned for reinspection. Review the Admin remarks.",
                'warning', (string) $item->id, 'Inventory Quality Audit', ['path' => '/qa/inventory-audit']
            )));
            AuditLogger::success('INVENTORY_AUDIT_RETURNED_FOR_REINSPECTION', AuditLogger::MODULE_INVENTORY_AUDIT, [
                'resource' => $item, 'resource_label' => $item->audit_reference,
                'details' => 'Admin returned the failed audit for reinspection; held stock remains unavailable.',
                'metadata' => ['inventory_id' => $item->inventory_id, 'quantity_held' => $item->failed_quantity],
            ]);
            return $item;
        }, 3);

        return response()->json(['data' => $this->itemData($item->fresh())]);
    }

    private function admin(Request $request): void { abort_unless($request->user()?->isAdmin(), 403, 'Admin access is required.'); }

    private function itemData(InventoryAuditItem $item): array
    {
        $item->loadMissing(['cycle', 'inventory.product', 'inventory.warehouse', 'qaUser:id,name', 'adminUser:id,name', 'evidence']);
        return [
            'id' => $item->id, 'audit_reference' => $item->audit_reference, 'attempt_number' => $item->attempt_number,
            'cycle' => $item->cycle?->name, 'inventory_id' => $item->inventory_id, 'product' => $item->inventory?->product?->name,
            'barcode' => $item->inventory?->barcode, 'warehouse' => $item->inventory?->warehouse?->name,
            'category' => $item->inventory?->product?->category, 'brand' => $item->inventory?->product?->brand,
            'audited_quantity' => $item->audited_quantity, 'failed_quantity' => $item->failed_quantity,
            'passed_quantity' => $item->audited_quantity - $item->failed_quantity,
            'result' => $item->result, 'status' => $item->status, 'failure_reason' => $item->failure_reason,
            'qa_remarks' => $item->qa_remarks, 'qa_user' => $item->qaUser?->name, 'submitted_at' => $item->submitted_at,
            'admin_user' => $item->adminUser?->name, 'admin_remarks' => $item->admin_remarks, 'reviewed_at' => $item->reviewed_at,
            'evidence' => $item->evidence->map(fn ($evidence) => [
                'id' => $evidence->id, 'original_name' => $evidence->original_name, 'mime_type' => $evidence->mime_type,
                'file_size' => $evidence->file_size, 'view_url' => "/inventory-audits/evidence/{$evidence->id}",
            ])->values(),
        ];
    }
}
