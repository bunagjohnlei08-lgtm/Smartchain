<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\ReceivingTimeline;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

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
            'supplier' => $receiving->supplier,
            'reference_no' => $receiving->reference_no,
            'delivery_date' => $receiving->delivery_date?->toDateString(),
            'status' => $receiving->status,
            'prepared_by' => $receiving->preparedBy?->name,
            'product_summary' => $productSummary,
            'items_count' => $items->sum('delivered_quantity'),
            'items' => $items->map(fn (ReceivingItem $item) => [
                'id' => $item->id,
                'product_id' => $item->product_id,
                'product_name' => $item->product_name,
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
        $validated = $request->validate([
            'purchase_order' => 'required|string|max:255',
            'supplier' => 'required|string|max:255',
            'reference_no' => 'nullable|string|max:255',
            'delivery_date' => 'required|date',
            'items' => 'required|array|min:1',
            'items.*.product' => 'required|string|max:255',
            'items.*.delivered_quantity' => 'required|integer|min:1',
            'items.*.unit' => 'required|string|max:50',
        ]);

        try {
            $receiving = DB::transaction(function () use ($validated, $request) {
                $receiving = Receiving::create([
                    'receiving_no' => $this->generateReceivingNo(),
                    'purchase_order' => $validated['purchase_order'],
                    'supplier' => $validated['supplier'],
                    'reference_no' => $validated['reference_no'] ?? null,
                    'delivery_date' => $validated['delivery_date'],
                    'status' => 'Pending QA',
                    'prepared_by_id' => $request->user()->id,
                ]);

                foreach ($validated['items'] as $itemData) {
                    $product = Product::firstOrCreate(
                        ['name' => $itemData['product']],
                        ['unit' => $itemData['unit']]
                    );

                    ReceivingItem::create([
                        'receiving_id' => $receiving->id,
                        'product_id' => $product->id,
                        'product_name' => $product->name,
                        'delivered_quantity' => $itemData['delivered_quantity'],
                        'unit' => $itemData['unit'],
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

                return $receiving;
            });
        } catch (Throwable $e) {
            Log::error('Receiving creation failed', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Failed to create receiving due to a server error. Please try again.'], 500);
        }

        return response()->json($this->present($receiving), 201);
    }
}
