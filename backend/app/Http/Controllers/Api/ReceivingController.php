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
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReceivingController extends Controller
{
    private function present(Receiving $receiving): array
    {
        $receiving->loadMissing(['items', 'timeline', 'preparedBy']);

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
            'prepared_by' => $receiving->preparedBy?->name,
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

    public function index(Request $request)
    {
        abort_unless($request->user()?->isPlantManager(), 403, 'Plant Manager access is required.');

        $query = Receiving::query()->with(['items', 'timeline', 'preparedBy']);

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
        $last = Receiving::query()
            ->lockForUpdate()
            ->orderByDesc('id')
            ->value('receiving_no');

        $nextNumber = 1;
        if ($last && preg_match('/(\d+)$/', $last, $matches)) {
            $nextNumber = (int) $matches[1] + 1;
        }

        return 'RCV-'.str_pad((string) $nextNumber, 5, '0', STR_PAD_LEFT);
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
                    ->whereHas('receiving', fn ($query) => $query->where('purchase_order_id', $purchaseOrder->id))
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

        $qaSupervisors = User::query()
            ->where('status', 'ACTIVE')
            ->whereHas('role', fn ($query) => $query->where('slug', 'QA_SUPERVISOR'))
            ->get();
        WorkflowNotificationSender::send($qaSupervisors, new WorkflowNotification(
            'Pending QA Inspection',
            "Receiving #{$receiving->receiving_no} is ready for QA.",
            'info',
            $receiving->receiving_no,
            'Quality Inspection',
        ));

        return response()->json($this->present($receiving), 201);
    }
}
