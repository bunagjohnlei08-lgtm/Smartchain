<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\PurchaseOrderMail;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\ReplenishmentRequest;
use App\Models\Supplier;
use App\Support\AuditLogger;
use App\Support\PurchaseOrderPdf;
use App\Support\PurchaseOrderSupplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class PurchaseOrderController extends Controller
{
    private const STATUSES = ['Pending Approval', 'Approved', 'Sent to Supplier', 'Completed', 'Cancelled'];

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $orders = PurchaseOrder::query()->with(['items', 'approver:id,name'])->latest()->get();
        return response()->json(['data' => $orders->map(fn (PurchaseOrder $order) => $this->present($order))]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $validated = $request->validate([
            'po_number' => ['nullable', 'string', 'max:50', 'unique:purchase_orders,po_number'],
            'supplier_id' => [
                'required', 'integer',
                Rule::exists('suppliers', 'id')->where(fn ($query) => $query->where('status', 'ACTIVE')),
            ],
            'supplier_name' => ['prohibited'],
            'delivery_details' => ['required', 'string', 'max:2000'],
            'expected_delivery_date' => ['required', 'date', 'after_or_equal:today'],
            'replenishment_request_id' => ['nullable', 'integer', 'exists:replenishment_requests,id', 'unique:purchase_orders,replenishment_request_id'],
            'status' => ['nullable', Rule::in(self::STATUSES)],
            'signature_data' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_name' => ['required', 'string', 'distinct', Rule::exists('products', 'name')],
            'items.*.ordered_quantity' => ['required', 'integer', 'min:1'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
        ]);

        $order = DB::transaction(function () use ($validated, $request) {
            $supplier = Supplier::query()->where('status', 'ACTIVE')->findOrFail($validated['supplier_id']);
            $replenishmentRequest = null;
            if (!empty($validated['replenishment_request_id'])) {
                $replenishmentRequest = ReplenishmentRequest::query()->lockForUpdate()->findOrFail($validated['replenishment_request_id']);
                abort_unless($replenishmentRequest->isAvailableForPurchaseOrder(), 422, 'Only approved replenishment requests can generate a Purchase Order.');
            }
            $items = collect($validated['items'])->map(function (array $item) {
                $product = Product::query()->where('name', $item['product_name'])->firstOrFail();
                return [
                    'product_name' => $product->name,
                    'ordered_quantity' => (int) $item['ordered_quantity'],
                    'unit_price' => round((float) $item['unit_price'], 2),
                    'total_price' => round((int) $item['ordered_quantity'] * (float) $item['unit_price'], 2),
                ];
            });

            $order = PurchaseOrder::create([
                'po_number' => $validated['po_number'] ?? $this->nextPoNumber(),
                'replenishment_request_id' => $replenishmentRequest?->id,
                'supplier_id' => $supplier->id,
                'supplier_name' => $supplier->name,
                'delivery_details' => $validated['delivery_details'],
                'expected_delivery_date' => $validated['expected_delivery_date'],
                'total_amount' => $items->sum('total_price'),
                'status' => $validated['status'] ?? 'Approved',
                'approved_by' => $request->user()->id,
                'signature_data' => $validated['signature_data'] ?? null,
            ]);
            $order->items()->createMany($items->all());
            if ($replenishmentRequest) {
                $replenishmentRequest->update(['status' => ReplenishmentRequest::STATUS_PO_CREATED]);
            }
            return $order->load(['items', 'approver:id,name']);
        });

        AuditLogger::success('PURCHASE_ORDER_GENERATED', AuditLogger::MODULE_PURCHASE_ORDERS, [
            'resource' => $order,
            'resource_label' => $order->po_number,
            'details' => sprintf(
                'Generated %s for %s (%d item%s)',
                $order->po_number,
                $order->supplier_name,
                $order->items->count(),
                $order->items->count() === 1 ? '' : 's',
            ),
            'metadata' => [
                'supplier' => $order->supplier_name,
                'total_amount' => (float) $order->total_amount,
                'replenishment_request_id' => $order->replenishment_request_id,
            ],
        ]);

        return response()->json($this->present($order), 201);
    }

    public function approved(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin() || $request->user()->isPlantManager(), 403);
        $orders = PurchaseOrder::query()
            ->whereIn('status', ['Approved', 'Sent to Supplier'])
            ->with(['items', 'approver:id,name', 'receivings.items'])
            ->latest()
            ->get();
        return response()->json(['data' => $orders->map(fn (PurchaseOrder $order) => $this->present($order))]);
    }

    /** The same document the supplier receives by email. */
    public function pdf(Request $request, PurchaseOrder $purchaseOrder, PurchaseOrderPdf $pdf): Response
    {
        abort_unless($request->user()->isAdmin(), 403);

        $filename = PurchaseOrderPdf::filename($purchaseOrder);

        return response($pdf->render($purchaseOrder), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
            'Cache-Control' => 'no-store, private',
        ]);
    }

    /**
     * Email the PO PDF to its supplier. The recipient always comes from the
     * supplier record, never from the request, so this endpoint cannot be
     * used to mail arbitrary addresses. The PO is only marked sent once
     * Brevo has accepted the message.
     */
    public function send(Request $request, PurchaseOrder $purchaseOrder, PurchaseOrderPdf $pdf, PurchaseOrderSupplier $supplierResolver): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        abort_if(in_array($purchaseOrder->status, ['Completed', 'Cancelled'], true), 422, 'Completed or cancelled Purchase Orders cannot be sent.');

        $supplier = $supplierResolver->resolve($purchaseOrder);
        abort_if(! $supplier, 422, 'This Purchase Order is not linked to a registered supplier.');

        $email = trim((string) $supplier->email);
        abort_if($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false, 422, 'This supplier does not have a valid email address.');

        try {
            $document = $pdf->render($purchaseOrder);
        } catch (Throwable $exception) {
            report($exception);
            abort(500, 'The Purchase Order PDF could not be generated.');
        }

        try {
            Mail::to($email, $supplier->name)->send(new PurchaseOrderMail(
                supplierName: $supplier->name,
                poNumber: $purchaseOrder->po_number,
                pdfFilename: PurchaseOrderPdf::filename($purchaseOrder),
                pdf: $document,
            ));
        } catch (Throwable $exception) {
            // Transport errors carry no PDF or API key (see BrevoTransactionalMail).
            report($exception);
            AuditLogger::failure('PO_SENT_TO_SUPPLIER', AuditLogger::MODULE_PURCHASE_ORDERS, [
                'resource' => $purchaseOrder,
                'resource_label' => $purchaseOrder->po_number,
                'details' => sprintf('Could not email %s to %s', $purchaseOrder->po_number, $supplier->name),
                'metadata' => ['supplier_id' => $supplier->id],
            ]);

            return response()->json(['message' => 'The Purchase Order could not be emailed to the supplier. Please try again.'], 502);
        }

        $purchaseOrder->update([
            'status' => 'Sent to Supplier',
            'sent_at' => now(),
        ]);

        AuditLogger::success('PO_SENT_TO_SUPPLIER', AuditLogger::MODULE_PURCHASE_ORDERS, [
            'resource' => $purchaseOrder,
            'resource_label' => $purchaseOrder->po_number,
            'details' => sprintf('Emailed %s to %s', $purchaseOrder->po_number, $supplier->name),
            'metadata' => [
                'supplier_id' => $supplier->id,
                'supplier_email' => $email,
            ],
        ]);

        return response()->json(array_merge(
            $this->present($purchaseOrder->load(['items', 'approver:id,name'])),
            ['message' => 'Purchase order sent to supplier successfully.'],
        ));
    }

    private function nextPoNumber(): string
    {
        $year = now()->format('Y');
        $last = PurchaseOrder::query()->where('po_number', 'like', "PO-{$year}-%")->lockForUpdate()->latest('id')->value('po_number');
        $sequence = $last ? ((int) substr($last, -4)) + 1 : 1;
        return sprintf('PO-%s-%04d', $year, $sequence);
    }

    private function present(PurchaseOrder $order): array
    {
        return [
            'id' => $order->id,
            'po_number' => $order->po_number,
            'supplier_name' => $order->supplier_name,
            'supplier_id' => $order->supplier_id,
            'replenishment_request_id' => $order->replenishment_request_id,
            'delivery_details' => $order->delivery_details,
            'expected_delivery_date' => $order->expected_delivery_date?->toDateString(),
            'total_amount' => (float) $order->total_amount,
            'status' => $order->status,
            'sent_at' => $order->sent_at?->toIso8601String(),
            'approved_by' => $order->approver?->name,
            'signature_data' => $order->signature_data,
            'created_at' => $order->created_at?->toDateString(),
            'items' => $order->items->map(function ($item) use ($order) {
                $received = (int) $order->receivings->flatMap->items
                    ->where('product_name', $item->product_name)->sum('delivered_quantity');
                return [
                'id' => $item->id,
                'product_name' => $item->product_name,
                'ordered_quantity' => $item->ordered_quantity,
                'received_quantity' => $received,
                'remaining_quantity' => max(0, $item->ordered_quantity - $received),
                'unit' => Product::query()->where('name', $item->product_name)->value('unit'),
                'unit_price' => (float) $item->unit_price,
                'total_price' => (float) $item->total_price,
                ];
            })->values(),
        ];
    }
}
