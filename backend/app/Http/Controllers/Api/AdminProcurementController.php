<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ReplenishmentRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Admin side of the replenishment workflow: review the requests submitted by the
 * Plant Manager and approve or decline them. Purchase Orders are created later,
 * in the Purchase Order module, using an approved request as its reference.
 */
class AdminProcurementController extends Controller
{
    private const STATUS_DRAFT = 'draft';
    private const STATUS_PENDING = 'pending';
    private const STATUS_APPROVED = 'approved';
    private const STATUS_REJECTED = 'rejected';
    private const STATUS_FOR_PURCHASE_ORDER = 'for_purchase_order';
    private const STATUSES = [self::STATUS_DRAFT, self::STATUS_PENDING, self::STATUS_APPROVED, self::STATUS_REJECTED, self::STATUS_FOR_PURCHASE_ORDER];

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', ReplenishmentRequest::class);
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', Rule::in(self::STATUSES)],
            'priority' => ['nullable', Rule::in(ReplenishmentRequest::PRIORITIES)],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        // Drafts have not been submitted to Admin Procurement yet.
        $query = ReplenishmentRequest::query()
            ->where('status', '!=', self::STATUS_DRAFT)
            ->with(['requester:id,name', 'reviewer:id,name', 'product:id,name', 'warehouse:id,name']);

        if (!empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($q) use ($search) {
                $q->where('request_no', 'like', "%{$search}%")
                    ->orWhereHas('product', fn ($product) => $product->where('name', 'like', "%{$search}%"))
                    ->orWhereHas('warehouse', fn ($warehouse) => $warehouse->where('name', 'like', "%{$search}%"))
                    ->orWhereHas('requester', fn ($requester) => $requester->where('name', 'like', "%{$search}%"));
            });
        }
        if (!empty($validated['status'])) $query->where('status', $validated['status']);
        if (!empty($validated['priority'])) $query->where('priority', $validated['priority']);

        $requests = $query
            ->orderByRaw('CASE WHEN status = ? THEN 0 ELSE 1 END', [self::STATUS_PENDING])
            ->orderByDesc('submitted_at')
            ->orderByDesc('id')
            ->paginate($validated['per_page'] ?? 100)
            ->through(fn (ReplenishmentRequest $replenishmentRequest) => $this->requestData($replenishmentRequest));

        return response()->json($requests);
    }

    public function summary(Request $request): JsonResponse
    {
        $this->authorize('viewAny', ReplenishmentRequest::class);

        $counts = ReplenishmentRequest::query()
            ->where('status', '!=', self::STATUS_DRAFT)
            ->selectRaw('status, COUNT(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status');

        $byStatus = collect(self::STATUSES)->mapWithKeys(
            fn (string $status) => [$status => (int) ($counts[$status] ?? 0)]
        );

        return response()->json([
            'total_requests' => (int) $counts->sum(),
            'pending_approval' => $byStatus[self::STATUS_PENDING],
            'approved' => $byStatus[self::STATUS_APPROVED],
            'rejected' => $byStatus[self::STATUS_REJECTED],
            'po_created' => $byStatus[self::STATUS_FOR_PURCHASE_ORDER],
            'draft' => $byStatus[self::STATUS_DRAFT],
            // Approved requests still waiting to be turned into a Purchase Order.
            'for_purchase_order' => ReplenishmentRequest::query()
                ->where('status', self::STATUS_APPROVED)
                ->count(),
        ]);
    }

    public function show(Request $request, ReplenishmentRequest $replenishmentRequest): JsonResponse
    {
        $this->authorize('view', $replenishmentRequest);
        $replenishmentRequest->load(['requester:id,name,employee_id', 'reviewer:id,name', 'product:id,name', 'warehouse:id,name']);

        return response()->json($this->requestData($replenishmentRequest));
    }

    public function approve(Request $request, ReplenishmentRequest $replenishmentRequest): JsonResponse
    {
        return $this->decide($request, $replenishmentRequest, self::STATUS_APPROVED);
    }

    public function decline(Request $request, ReplenishmentRequest $replenishmentRequest): JsonResponse
    {
        return $this->decide($request, $replenishmentRequest, self::STATUS_REJECTED);
    }

    /**
     * Records the Admin decision on the original request. The request keeps its
     * Request No. and stays in the history either way - nothing is deleted and no
     * Purchase Order is created here.
     */
    private function decide(Request $request, ReplenishmentRequest $replenishmentRequest, string $status): JsonResponse
    {
        $this->authorize('decide', $replenishmentRequest);

        if ($replenishmentRequest->status !== self::STATUS_PENDING) {
            throw ValidationException::withMessages([
                'status' => "Only requests awaiting approval can be reviewed. {$replenishmentRequest->request_no} is already {$replenishmentRequest->status}.",
            ]);
        }

        $validated = $request->validate([
            'remarks' => ['nullable', 'string', 'max:1000'],
        ]);

        $replenishmentRequest->forceFill([
            'status' => $status,
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
            'admin_decision' => $validated['remarks']
                ?? ($status === self::STATUS_APPROVED
                    ? 'Approved by Admin Procurement'
                    : 'Declined by Admin Procurement'),
        ])->save();

        $replenishmentRequest->load(['requester:id,name', 'reviewer:id,name', 'product:id,name', 'warehouse:id,name']);

        return response()->json($this->requestData($replenishmentRequest));
    }

    private function requestData(ReplenishmentRequest $replenishmentRequest): array
    {
        return [
            'id' => $replenishmentRequest->id,
            'request_no' => $replenishmentRequest->request_no,
            'product_id' => $replenishmentRequest->product_id,
            'product_name' => $replenishmentRequest->product?->name,
            'warehouse_id' => $replenishmentRequest->warehouse_id,
            'warehouse_name' => $replenishmentRequest->warehouse?->name,
            'requested_qty' => $replenishmentRequest->requested_qty,
            'priority' => $replenishmentRequest->priority,
            'status' => $replenishmentRequest->status,
            'requested_by' => $replenishmentRequest->requester?->name,
            'submitted_date' => $replenishmentRequest->submitted_at?->toDateString(),
            'reviewed_by' => $replenishmentRequest->reviewer?->name,
            'reviewed_at' => $replenishmentRequest->reviewed_at,
            'approved_date' => $replenishmentRequest->status === self::STATUS_APPROVED
                ? $replenishmentRequest->reviewed_at?->toDateString()
                : null,
            'admin_decision' => $replenishmentRequest->admin_decision,
            'available_for_purchase_order' => $replenishmentRequest->status === self::STATUS_APPROVED,
        ];
    }
}
