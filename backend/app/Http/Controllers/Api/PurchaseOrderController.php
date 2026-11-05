<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\PurchaseOrderMail;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\ExcessDeliveryReview;
use App\Models\ReplenishmentRequest;
use App\Models\Supplier;
use App\Services\PurchasingTermResolver;
use App\Support\AuditLogger;
use App\Support\PurchaseOrderPdf;
use App\Support\PurchaseOrderSupplier;
use App\Support\ReplenishmentLifecycle;
use App\Notifications\WorkflowNotification;
use App\Support\WorkflowNotificationSender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class PurchaseOrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);

        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', Rule::in(PurchaseOrder::ACTIVE_STATUSES)],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:10'],
        ]);

        $query = PurchaseOrder::query()
            ->whereIn('status', PurchaseOrder::ACTIVE_STATUSES)
            ->with([
            'items', 'approver:id,name', 'award.rfq', 'acknowledgments.actor:id,name', 'financialSubmission', 'receivings.items.excessReviewItem.review', 'receivings.excessDeliveryReview',
            'discrepancies.reportedBy:id,name', 'discrepancies.contactedBy:id,name',
            'discrepancies.respondedBy:id,name', 'discrepancies.resolvedBy:id,name',
            'discrepancies.resolvedByReceiving:id,receiving_no,delivery_date',
        ]);

        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($builder) use ($search) {
                $builder->where('po_number', 'like', "%{$search}%")
                    ->orWhere('supplier_name', 'like', "%{$search}%")
                    ->orWhereHas('items', fn ($items) => $items->where('product_name', 'like', "%{$search}%"));
            });
        }
        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        $orders = $query->latest()
            ->paginate($validated['per_page'] ?? 10)
            ->through(fn (PurchaseOrder $order) => $this->present($order));

        $counts = PurchaseOrder::query()->selectRaw('status, COUNT(*) as aggregate')
            ->groupBy('status')->pluck('aggregate', 'status');

        return response()->json([
            ...$orders->toArray(),
            'summary' => [
                'total' => (int) $counts->sum(),
                'pending' => (int) ($counts[PurchaseOrder::STATUS_PENDING_APPROVAL] ?? 0),
                'approved' => (int) ($counts[PurchaseOrder::STATUS_APPROVED] ?? 0),
                'completed' => (int) ($counts[PurchaseOrder::STATUS_COMPLETED] ?? 0),
                'cancelled' => (int) ($counts[PurchaseOrder::STATUS_CANCELLED] ?? 0),
            ],
        ]);
    }

    public function purchasingOptions(Request $request, PurchasingTermResolver $resolver): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'distinct', 'exists:products,id'],
            'items.*.ordered_quantity' => ['required', 'integer', 'min:1'],
        ]);
        $products = Product::query()->whereIn('id', collect($validated['items'])->pluck('product_id'))->get()->keyBy('id');
        $ordered = collect($validated['items'])->map(fn ($item) => $products->get($item['product_id']))->filter()->values();
        $quantities = collect($validated['items'])->mapWithKeys(fn ($item) => [(int) $item['product_id'] => (int) $item['ordered_quantity']])->all();
        $primaryIds = DB::table('product_supplier')->whereIn('product_id', $ordered->pluck('id'))->where('is_primary', true)->pluck('supplier_id')->unique();
        $preferred = $primaryIds->count() === 1 ? (int) $primaryIds->first() : null;

        $suppliers = $resolver->eligibleSuppliers($ordered)->map(function (Supplier $supplier) use ($resolver, $ordered, $quantities) {
            $terms = $supplier->purchasingTerms->keyBy('product_id');
            $data = ['id' => $supplier->id, 'supplier_code' => $supplier->supplier_code, 'name' => $supplier->name,
                'lines' => $ordered->map(function (Product $product) use ($terms) { $term = $terms->get($product->id); return [
                    'product_id' => $product->id, 'product_name' => $product->name, 'unit' => $product->unit,
                    'purchasing_term_id' => $term?->id, 'unit_price' => $term?->agreed_unit_price, 'currency' => $term?->currency,
                    'agreement_reference' => $term?->agreement_reference, 'delivery_lead_time_days' => $term?->delivery_lead_time_days,
                    'lead_time_basis' => $term?->lead_time_basis, 'lead_time_start_event' => $term?->lead_time_start_event,
                    'minimum_order_quantity' => $term?->minimum_order_quantity, 'order_multiple' => $term?->order_multiple,
                    'maximum_order_quantity' => $term?->maximum_order_quantity,
                ]; })->values(), 'can_create' => true, 'validation_message' => null];
            try { $resolution = $resolver->resolve($supplier, $ordered, $quantities); $data['expected_delivery_date'] = $resolution['expected_date']; $data['currency'] = $resolution['currency']; }
            catch (ValidationException $exception) { $data['can_create'] = false; $data['validation_message'] = collect($exception->errors())->flatten()->first(); $data['expected_delivery_date'] = null; }
            return $data;
        });
        return response()->json(['data' => ['suppliers' => $suppliers, 'preferred_supplier_id' => $preferred && $suppliers->contains('id', $preferred) ? $preferred : null]]);
    }

    public function store(Request $request, ReplenishmentLifecycle $replenishmentLifecycle, PurchasingTermResolver $resolver): JsonResponse
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
            'status' => ['prohibited'],
            'signature_data' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['nullable', 'integer', 'distinct', 'exists:products,id'],
            'items.*.product_name' => ['required', 'string', 'distinct', Rule::exists('products', 'name')],
            'items.*.ordered_quantity' => ['required', 'integer', 'min:1'],
            'items.*.unit_price' => ['required', 'decimal:0,2', 'min:0'],
            'items.*.purchasing_term_id' => ['required', 'integer', 'distinct', 'exists:supplier_product_purchasing_terms,id'],
        ]);

        $order = DB::transaction(function () use ($validated, $request, $resolver) {
            $supplier = Supplier::query()->where('status', 'ACTIVE')->findOrFail($validated['supplier_id']);
            $replenishmentRequest = null;
            if (!empty($validated['replenishment_request_id'])) {
                $replenishmentRequest = ReplenishmentRequest::query()->lockForUpdate()->findOrFail($validated['replenishment_request_id']);
                abort_unless($replenishmentRequest->isAvailableForPurchaseOrder(), 422, 'Only approved replenishment requests can generate a Purchase Order.');
                abort_if($replenishmentRequest->sourcing_method === ReplenishmentRequest::SOURCING_COMPETITIVE, 422, 'Competitive-bidding requirements cannot generate a Purchase Order before an approved award.');
                if ($replenishmentRequest->sourcing_method === null) {
                    $replenishmentRequest->forceFill(['sourcing_method' => ReplenishmentRequest::SOURCING_DIRECT, 'sourcing_selected_by' => $request->user()->id, 'sourcing_selected_at' => now()])->save();
                }
            }
            $submitted = collect($validated['items']);
            $products = $submitted->map(function (array $item) {
                $product = Product::query()->when($item['product_id'] ?? null, fn ($query, $id) => $query->whereKey($id), fn ($query) => $query->where('name', $item['product_name']))->lockForUpdate()->firstOrFail();
                if ($product->name !== $item['product_name']) throw ValidationException::withMessages(['items' => 'A selected product changed. Refresh the Product Catalog options.']);
                return $product;
            })->values();
            $quantities = $products->mapWithKeys(fn (Product $product, $index) => [$product->id => (int) $submitted[$index]['ordered_quantity']])->all();
            $resolution = $resolver->resolve($supplier, $products, $quantities, null, true);
            if ($validated['expected_delivery_date'] !== $resolution['expected_date']) throw ValidationException::withMessages(['expected_delivery_date' => 'Purchasing terms changed or the expected delivery date is stale. Refresh the resolved terms.']);
            $resolvedLines = $resolution['lines']->keyBy(fn ($line) => $line['product']->id);
            $items = $submitted->map(function (array $item, int $index) use ($products, $resolvedLines) {
                $product = $products[$index]; $term = $resolvedLines[$product->id]['term'];
                if ((int) $item['purchasing_term_id'] !== $term->id || $this->moneyToCents((string) $item['unit_price']) !== $this->moneyToCents((string) $term->agreed_unit_price)) {
                    throw ValidationException::withMessages(['items' => "The verified purchasing price for {$product->name} changed. Refresh before creating the Purchase Order."]);
                }
                $totalCents = (int) $item['ordered_quantity'] * $this->moneyToCents((string) $term->agreed_unit_price);
                return [
                    'product_id' => $product->id,
                    'unit' => $product->unit,
                    'item_classification' => $product->item_classification,
                    'product_name' => $product->name,
                    'ordered_quantity' => (int) $item['ordered_quantity'],
                    'unit_price' => $term->agreed_unit_price,
                    'total_price' => $this->centsToMoney($totalCents),
                    'supplier_product_purchasing_term_id' => $term->id,
                    'price_source' => 'SUPPLIER_AGREEMENT', 'agreement_reference' => $term->agreement_reference,
                    'delivery_lead_time_days' => $term->delivery_lead_time_days, 'lead_time_basis' => $term->lead_time_basis,
                    'lead_time_start_event' => $term->lead_time_start_event,
                ];
            });

            $order = PurchaseOrder::create([
                'po_number' => $validated['po_number'] ?? $this->nextPoNumber(),
                'replenishment_request_id' => $replenishmentRequest?->id,
                'supplier_id' => $supplier->id,
                'supplier_name' => $supplier->name,
                'delivery_details' => $validated['delivery_details'],
                'expected_delivery_date' => $validated['expected_delivery_date'],
                'total_amount' => $this->centsToMoney((int) $items->sum(fn ($item) => $this->moneyToCents($item['total_price']))),
                'currency' => $resolution['currency'],
                'agreement_reference' => $items->pluck('agreement_reference')->unique()->count() === 1 ? $items->first()['agreement_reference'] : null,
                'status' => PurchaseOrder::STATUS_APPROVED,
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
        if ($order->replenishment_request_id) {
            $replenishmentLifecycle->synchronize($order);
            AuditLogger::success('REPLENISHMENT_PURCHASE_ORDER_CREATED', AuditLogger::MODULE_PROCUREMENT, [
                'resource_type' => 'ReplenishmentRequest',
                'resource_id' => $order->replenishment_request_id,
                'resource_label' => $order->po_number,
                'details' => "Created linked Purchase Order {$order->po_number}.",
                'metadata' => ['purchase_order_id' => $order->id, 'request_status' => ReplenishmentRequest::STATUS_PO_CREATED],
            ]);
        }

        return response()->json($this->present($order), 201);
    }

    public function approved(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin() || $request->user()->isPlantManager(), 403);
        $orders = PurchaseOrder::query()
            ->whereIn('status', ['Approved', 'Sent to Supplier', 'Partially Received'])
            ->with(['items', 'approver:id,name', 'receivings.items.excessReviewItem.review', 'receivings.excessDeliveryReview'])
            ->latest()
            ->get();
        return response()->json(['data' => $orders->map(fn (PurchaseOrder $order) => $this->present($order))]);
    }

    public function approve(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);

        $order = DB::transaction(function () use ($request, $purchaseOrder) {
            $locked = PurchaseOrder::query()->lockForUpdate()->findOrFail($purchaseOrder->id);

            if ($locked->status === PurchaseOrder::STATUS_APPROVED) {
                return $locked;
            }

            abort_unless(
                $locked->status === PurchaseOrder::STATUS_PENDING_APPROVAL,
                422,
                'Only a pending Purchase Order can be approved.',
            );

            $locked->update([
                'status' => PurchaseOrder::STATUS_APPROVED,
                'approved_by' => $request->user()->id,
            ]);

            AuditLogger::success('PURCHASE_ORDER_APPROVED', AuditLogger::MODULE_PURCHASE_ORDERS, [
                'actor' => $request->user(),
                'resource' => $locked,
                'resource_label' => $locked->po_number,
            ]);

            return $locked;
        });

        $order->load(['items', 'approver:id,name', 'award.rfq', 'acknowledgments.actor:id,name', 'receivings.items.excessReviewItem.review', 'receivings.excessDeliveryReview']);

        return response()->json($this->present($order));
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

        $purchaseOrder->refresh();
        if (in_array($purchaseOrder->status, [PurchaseOrder::STATUS_SENT_TO_SUPPLIER, PurchaseOrder::STATUS_PARTIALLY_RECEIVED], true)) {
            return response()->json(array_merge(
                $this->present($purchaseOrder->load(['items', 'approver:id,name'])),
                ['message' => 'Purchase order was already sent to the supplier.'],
            ));
        }

        abort_unless($purchaseOrder->status === PurchaseOrder::STATUS_APPROVED, 422, 'Only an approved active Purchase Order can be sent.');

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
        WorkflowNotificationSender::send($supplier->authorizedUsers, new WorkflowNotification('Purchase Order Issued', "{$purchaseOrder->po_number} is available for review and acknowledgment.", 'info', $purchaseOrder->po_number, 'Purchase Orders', ['purchase_order_id'=>$purchaseOrder->id]));

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

    private function moneyToCents(string $value): int
    {
        [$whole, $decimal] = array_pad(explode('.', $value, 2), 2, '');
        return ((int) $whole * 100) + (int) substr(str_pad($decimal, 2, '0'), 0, 2);
    }

    private function centsToMoney(int $cents): string
    {
        return intdiv($cents, 100).'.'.str_pad((string) ($cents % 100), 2, '0', STR_PAD_LEFT);
    }

    private function present(PurchaseOrder $order): array
    {
        return [
            'id' => $order->id,
            'po_number' => $order->po_number,
            'supplier_name' => $order->supplier_name,
            'supplier_id' => $order->supplier_id,
            'replenishment_request_id' => $order->replenishment_request_id,
            'supplier_award_id' => $order->supplier_award_id,
            'award_reference' => $order->award?->award_number,
            'rfq_reference' => $order->award?->rfq?->rfq_number,
            'delivery_details' => $order->delivery_details,
            'expected_delivery_date' => $order->expected_delivery_date?->toDateString(),
            'total_amount' => (float) $order->total_amount,
            'status' => $order->status,
            'currency' => $order->currency ?? 'PHP',
            'acknowledgment' => $order->relationLoaded('acknowledgments') && $order->acknowledgments->isNotEmpty() ? [
                'action'=>$order->acknowledgments->first()->action,
                'remarks'=>$order->acknowledgments->first()->remarks,
                'acted_at'=>$order->acknowledgments->first()->acted_at?->toIso8601String(),
                'acted_by'=>$order->acknowledgments->first()->actor?->name,
            ] : null,
            'sent_at' => $order->sent_at?->toIso8601String(),
            'approved_by' => $order->approver?->name,
            'signature_data' => $order->signature_data,
            'created_at' => $order->created_at?->toDateString(),
            'financial_integration' => [
                'enabled' => (bool) config('financial.enabled'),
                'contract_confirmed' => (bool) config('financial.contract_confirmed'),
                'state' => $order->financialSubmission?->state ?? 'NOT_SUBMITTED',
                'message_id' => $order->financialSubmission?->message_id,
                'financial_reference' => $order->financialSubmission?->financial_reference,
                'partner_acknowledgment' => $order->financialSubmission?->partner_acknowledgment,
                'submitted_at' => $order->financialSubmission?->submitted_at?->toIso8601String(),
                'acknowledged_at' => $order->financialSubmission?->acknowledged_at?->toIso8601String(),
                'last_error_code' => $order->financialSubmission?->last_error_code,
                'last_error_message' => $order->financialSubmission?->last_error_message,
            ],
            'items' => $order->items->map(function ($item) use ($order) {
                $received = (int) $order->receivings->whereNull('replacement_for_rejection_case_id')
                    ->flatMap->items
                    ->filter(fn ($receivingItem) => ! $receivingItem->excessReviewItem || $receivingItem->excessReviewItem->review?->status === ExcessDeliveryReview::STATUS_APPROVED)
                    ->where('product_name', $item->product_name)->sum('delivered_quantity');
                return [
                'id' => $item->id,
                'product_name' => $item->product_name,
                'ordered_quantity' => $item->ordered_quantity,
                'received_quantity' => $received,
                'remaining_quantity' => max(0, $item->ordered_quantity - $received),
                'unit' => $item->unit ?? Product::query()->where('name', $item->product_name)->value('unit'),
                'item_classification' => $item->item_classification ?? Product::query()->where('name', $item->product_name)->value('item_classification'),
                'product_id' => $item->product_id,
                'unit_price' => (float) $item->unit_price,
                'total_price' => (float) $item->total_price,
                'price_source' => $item->price_source ?? ($item->supplier_award_line_id ? 'AWARDED_BID' : null),
                'agreement_reference' => $item->agreement_reference,
                'delivery_lead_time_days' => $item->delivery_lead_time_days,
                'lead_time_basis' => $item->lead_time_basis,
                'lead_time_start_event' => $item->lead_time_start_event,
                ];
            })->values(),
            'receiving_history' => $order->relationLoaded('receivings') ? $order->receivings->map(fn ($receiving) => [
                'id' => $receiving->id,
                'receiving_no' => $receiving->receiving_no,
                'delivery_date' => $receiving->delivery_date?->toDateString(),
                'delivered_quantity' => (int) $receiving->items->sum('delivered_quantity'),
                'status' => $receiving->status,
            ])->values() : [],
            'discrepancies' => $order->relationLoaded('discrepancies') ? $order->discrepancies->map(fn ($case) => [
                'id' => $case->id,
                'receiving_id' => $case->receiving_id,
                'type' => $case->discrepancy_type,
                'short_quantity' => $case->short_quantity,
                'status' => $case->status,
                'expected_quantity' => $case->expected_quantity,
                'delivered_quantity' => $case->delivered_quantity,
                'reported_at' => $case->reported_at,
                'reported_by' => $case->reportedBy?->name,
                'contact_method' => $case->contact_method,
                'contact_note' => $case->contact_note,
                'contacted_at' => $case->contacted_at,
                'contacted_by' => $case->contactedBy?->name,
                'supplier_response_code' => $case->supplier_response_code,
                'supplier_response' => $case->supplier_response,
                'response_notes' => $case->response_notes,
                'expected_balance_delivery_date' => $case->expected_balance_delivery_date?->toDateString(),
                'responded_at' => $case->responded_at,
                'responded_by' => $case->respondedBy?->name,
                'resolution_notes' => $case->resolution_notes,
                'resolved_at' => $case->resolved_at,
                'resolved_by' => $case->resolvedBy?->name,
                'resolved_by_receiving' => $case->resolvedByReceiving ? [
                    'id' => $case->resolvedByReceiving->id,
                    'receiving_no' => $case->resolvedByReceiving->receiving_no,
                    'delivery_date' => $case->resolvedByReceiving->delivery_date?->toDateString(),
                ] : null,
            ])->values() : [],
        ];
    }
}
