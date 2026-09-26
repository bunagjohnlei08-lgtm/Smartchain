<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\ReceivingTimeline;
use App\Models\User;
use App\Notifications\WorkflowNotification;
use App\Support\WorkflowNotificationSender;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReceivingController extends Controller
{
    private function present(Receiving $receiving): array
    {
        $receiving->loadMissing(['items', 'timeline', 'preparedBy', 'assignedQa', 'replacementForCase.inspectionItem.inspection.receiving:id,receiving_no']);

        $items = $receiving->items;
        $productSummary = match (true) {
            $items->isEmpty() => '—',
            $items->count() === 1 => $items->first()->product_name,
            default => $items->first()->product_name.' +'.($items->count() - 1).' more',
        };

        return [
            'id' => $receiving->id,
            'receiving_no' => $receiving->receiving_no,
            'purchase_order' => $receiving->purchase_order,
            'purchase_order_id' => $receiving->purchase_order_id,
            'supplier' => $receiving->supplier,
            'reference_no' => $receiving->reference_no,
            'notes' => $receiving->notes,
            'delivery_date' => $receiving->delivery_date?->toDateString(),
            'status' => $receiving->status,
            'is_replacement' => $receiving->replacement_for_rejection_case_id !== null,
            'replacement' => $this->presentReplacement($receiving),
            'prepared_by' => $receiving->preparedBy?->name,
            'assigned_qa_user_id' => $receiving->assigned_qa_user_id,
            'assigned_qa' => $receiving->assignedQa ? [
                'id' => $receiving->assignedQa->id,
                'name' => $receiving->assignedQa->name,
            ] : null,
            'product_summary' => $productSummary,
            'items_count' => $items->sum('delivered_quantity'),
            'items' => $items->map(fn (ReceivingItem $item) => [
                'id' => $item->id,
                'product_id' => $item->product_id,
                'product_name' => $item->product_name,
                'ordered_quantity' => $item->ordered_quantity,
                'delivered_quantity' => $item->delivered_quantity,
                'unit' => $item->unit,
                'inspection_status' => $item->inspection_status,
                'created_at' => $item->created_at,
                'updated_at' => $item->updated_at,
            ])->values(),
            'timeline' => $receiving->timeline->map(fn (ReceivingTimeline $event) => [
                'status' => $event->status,
                'performed_by' => $event->performed_by,
                'occurred_at' => $event->occurred_at,
            ])->values(),
            'created_at' => $receiving->created_at,
            'updated_at' => $receiving->updated_at,
        ];
    }

    private function presentReplacement(Receiving $receiving): ?array
    {
        $case = $receiving->replacementForCase;
        if (! $case) return null;
        $original = $case->inspectionItem?->inspection?->receiving;

        return [
            'rejection_case_id' => $case->id,
            'rejection_reference' => sprintf('RJ-%06d', $case->id),
            'original_receiving_id' => $original?->id,
            'original_receiving_no' => $original?->receiving_no,
            'expected_quantity' => (int) $receiving->items->sum('ordered_quantity'),
            'awaiting_delivery' => $receiving->status === Receiving::STATUS_AWAITING_REPLACEMENT,
        ];
    }

    public function index(Request $request)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        $query = Receiving::query()->with(['items', 'timeline', 'preparedBy', 'assignedQa', 'replacementForCase.inspectionItem.inspection.receiving:id,receiving_no']);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('supplier')) {
            $query->where('supplier', $request->supplier);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('receiving_no', 'like', "%{$search}%")
                    ->orWhere('purchase_order', 'like', "%{$search}%")
                    ->orWhere('supplier', 'like', "%{$search}%");
            });
        }

        $items = $query->orderByDesc('created_at')
            ->get()
            ->map(fn (Receiving $receiving) => $this->present($receiving));

        return response()->json(['data' => $items]);
    }

    public function show(Request $request, $id)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        $receiving = Receiving::findOrFail($id);

        return response()->json($this->present($receiving));
    }

    private function generateReceivingNo(): string
    {
        return Receiving::nextReceivingNo();
    }

    public function store(Request $request)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        $validated = $request->validate([
            'purchase_order_id' => 'required|integer|exists:purchase_orders,id',
            'reference_no' => 'nullable|string|max:255',
            'delivery_date' => 'required|date',
            'items' => 'required|array|min:1',
            'items.*.purchase_order_item_id' => 'required|integer|distinct|exists:purchase_order_items,id',
            'items.*.delivered_quantity' => 'required|integer|min:0',
        ]);

        $receiving = DB::transaction(function () use ($validated, $request) {
                $purchaseOrder = PurchaseOrder::query()->with('items')->lockForUpdate()->findOrFail($validated['purchase_order_id']);
                abort_unless(in_array($purchaseOrder->status, ['Approved', 'Sent to Supplier'], true), 422, 'This Purchase Order is not active for receiving.');

                $submitted = collect($validated['items'])->keyBy('purchase_order_item_id');
                abort_unless($submitted->keys()->sort()->values()->all() === $purchaseOrder->items->pluck('id')->sort()->values()->all(), 422, 'Receiving items must exactly match the selected Purchase Order.');
                abort_unless($submitted->contains(fn ($item) => (int) $item['delivered_quantity'] > 0), 422, 'At least one product must have a delivered quantity greater than zero.');

                $previouslyReceived = ReceivingItem::query()
                    // Replacement deliveries re-supply rejected goods and do not consume the PO balance.
                    ->whereHas('receiving', fn ($query) => $query->where('purchase_order_id', $purchaseOrder->id)->whereNull('replacement_for_rejection_case_id'))
                    ->selectRaw('product_name, SUM(delivered_quantity) as quantity')
                    ->groupBy('product_name')->pluck('quantity', 'product_name');

                foreach ($purchaseOrder->items as $poItem) {
                    $quantity = (int) $submitted[$poItem->id]['delivered_quantity'];
                    $remaining = max(0, $poItem->ordered_quantity - (int) ($previouslyReceived[$poItem->product_name] ?? 0));
                    abort_if($quantity > $remaining, 422, "Delivered quantity for {$poItem->product_name} exceeds the remaining Purchase Order quantity of {$remaining}.");
                }

                $receiving = Receiving::create([
                    'receiving_no' => $this->generateReceivingNo(),
                    'purchase_order_id' => $purchaseOrder->id,
                    'purchase_order' => $purchaseOrder->po_number,
                    'supplier' => $purchaseOrder->supplier_name,
                    'reference_no' => $validated['reference_no'] ?? null,
                    'delivery_date' => $validated['delivery_date'],
                    'status' => 'Pending QA',
                    'prepared_by_id' => $request->user()->id,
                ]);

                foreach ($purchaseOrder->items as $poItem) {
                    $itemData = $submitted[$poItem->id];
                    if ((int) $itemData['delivered_quantity'] === 0) continue;
                    $product = Product::query()->where('name', $poItem->product_name)->firstOrFail();

                    ReceivingItem::create([
                        'receiving_id' => $receiving->id,
                        'product_id' => $product->id,
                        'product_name' => $product->name,
                        'ordered_quantity' => $poItem->ordered_quantity,
                        'delivered_quantity' => $itemData['delivered_quantity'],
                        'unit' => $product->unit,
                        'inspection_status' => 'Pending QA',
                    ]);
                }

                $now = now();

                ReceivingTimeline::insert([
                    [
                        'receiving_id' => $receiving->id,
                        'status' => 'Receiving Created',
                        'performed_by' => $request->user()->name,
                        'occurred_at' => $now,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ],
                    [
                        'receiving_id' => $receiving->id,
                        'status' => 'Pending QA Inspection',
                        'performed_by' => 'System',
                        'occurred_at' => $now,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ],
                ]);

                $receivedNow = $purchaseOrder->items->every(function ($poItem) use ($previouslyReceived, $submitted) {
                    return (int) ($previouslyReceived[$poItem->product_name] ?? 0)
                        + (int) $submitted[$poItem->id]['delivered_quantity'] >= $poItem->ordered_quantity;
                });
                if ($receivedNow) $purchaseOrder->update(['status' => 'Completed']);

                return $receiving;
            });

        return response()->json($this->present($receiving), 201);
    }

    public function qaAssignees(Request $request)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        return response()->json(['data' => User::query()
            ->select(['users.id', 'users.name'])
            ->where('users.status', 'ACTIVE')
            ->whereHas('role', fn ($query) => $query->where('slug', 'QA_SUPERVISOR'))
            ->orderBy('users.name')
            ->get()]);
    }

    public function assignQa(Request $request, Receiving $receiving)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        $validated = $request->validate(['qa_user_id' => ['required', 'integer', 'exists:users,id']]);
        $qa = User::query()->with('role')->find($validated['qa_user_id']);

        if (! $qa || $qa->status !== 'ACTIVE' || ! $qa->isQaSupervisor()) {
            return response()->json([
                'message' => 'The selected QA Supervisor is not active or is not eligible for assignment.',
                'errors' => ['qa_user_id' => ['The selected QA Supervisor is not active or is not eligible for assignment.']],
            ], 422);
        }

        if ($receiving->qaInspection?->completed_at) {
            return response()->json(['message' => 'A completed inspection cannot be reassigned.'], 422);
        }

        if ($receiving->status === Receiving::STATUS_AWAITING_REPLACEMENT) {
            return response()->json(['message' => 'Confirm the replacement delivery before assigning QA.'], 422);
        }

        $previousQaId = $receiving->assigned_qa_user_id;
        $receiving->update(['assigned_qa_user_id' => $qa->id]);

        ReceivingTimeline::create([
            'receiving_id' => $receiving->id,
            'status' => $previousQaId ? 'QA Reassigned' : 'QA Assigned',
            'performed_by' => $request->user()->name,
            'occurred_at' => now(),
        ]);

        AuditLogger::success('QA_ASSIGNED', AuditLogger::MODULE_RECEIVING, [
            'resource' => $receiving,
            'resource_label' => $receiving->receiving_no,
            'details' => $previousQaId ? "Reassigned QA Supervisor to {$qa->name}" : "Assigned QA Supervisor {$qa->name}",
            'metadata' => [
                'receiving_id' => $receiving->id,
                'assigned_qa_user_id' => $qa->id,
                'assigned_qa_name' => $qa->name,
                'previous_assigned_qa_user_id' => $previousQaId,
            ],
        ]);

        WorkflowNotificationSender::send($qa, new WorkflowNotification(
            'QA Inspection Assigned',
            "Receiving #{$receiving->receiving_no} was assigned to you.",
            'info',
            $receiving->receiving_no,
            'Quality Inspection',
        ));

        return response()->json($this->present($receiving->fresh()));
    }

    public function confirmReplacementDelivery(Request $request, Receiving $receiving)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        $validated = $request->validate([
            'delivery_date' => 'required|date',
            'reference_no' => 'nullable|string|max:255',
            'items' => 'required|array|min:1',
            'items.*.receiving_item_id' => 'required|integer|distinct',
            'items.*.delivered_quantity' => 'required|integer|min:0',
        ]);

        $receiving = DB::transaction(function () use ($validated, $request, $receiving) {
            $locked = Receiving::query()->with('items')->lockForUpdate()->findOrFail($receiving->id);
            abort_unless($locked->replacement_for_rejection_case_id !== null, 422, 'Only replacement receivings can be confirmed this way.');
            abort_unless($locked->status === Receiving::STATUS_AWAITING_REPLACEMENT, 422, 'This replacement delivery has already been confirmed.');

            $submitted = collect($validated['items'])->keyBy('receiving_item_id');
            abort_unless($submitted->keys()->sort()->values()->all() === $locked->items->pluck('id')->sort()->values()->all(), 422, 'Delivered items must exactly match the expected replacement items.');
            abort_unless($submitted->contains(fn ($item) => (int) $item['delivered_quantity'] > 0), 422, 'At least one product must have a delivered quantity greater than zero.');

            foreach ($locked->items as $item) {
                $quantity = (int) $submitted[$item->id]['delivered_quantity'];
                abort_if($quantity > (int) $item->ordered_quantity, 422, "Delivered quantity for {$item->product_name} exceeds the expected replacement quantity of {$item->ordered_quantity}.");
            }
            foreach ($locked->items as $item) {
                $item->update(['delivered_quantity' => (int) $submitted[$item->id]['delivered_quantity'], 'inspection_status' => 'Pending QA']);
            }

            $locked->update([
                'status' => 'Pending QA',
                'delivery_date' => $validated['delivery_date'],
                'reference_no' => $validated['reference_no'] ?? $locked->reference_no,
            ]);
            $now = now();
            foreach (['Replacement Delivered' => $request->user()->name, 'Pending QA Inspection' => 'System'] as $status => $performedBy) {
                ReceivingTimeline::create(['receiving_id' => $locked->id, 'status' => $status, 'performed_by' => $performedBy, 'occurred_at' => $now]);
            }

            AuditLogger::success('REPLACEMENT_DELIVERY_CONFIRMED', AuditLogger::MODULE_RECEIVING, [
                'resource' => $locked,
                'resource_label' => $locked->receiving_no,
                'details' => "Confirmed replacement delivery for {$locked->receiving_no}",
                'metadata' => [
                    'receiving_id' => $locked->id,
                    'rejection_case_id' => $locked->replacement_for_rejection_case_id,
                    'delivered_quantity' => (int) $submitted->sum('delivered_quantity'),
                ],
            ]);

            return $locked;
        });

        return response()->json($this->present($receiving->fresh()));
    }
}
