<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Builder;

class ExcessDeliveryReview extends Model
{
    public const STATUS_PENDING = 'PENDING_REVIEW';
    public const STATUS_FINANCIAL_HOLD = 'AWAITING_FINANCIAL_RECONCILIATION';
    public const STATUS_DOCUMENTATION_REQUESTED = 'DOCUMENTATION_REQUESTED';
    public const STATUS_DOCUMENTATION_SUBMITTED = 'DOCUMENTATION_SUBMITTED';
    public const STATUS_APPROVED = 'APPROVED_FOR_QA';
    public const STATUS_RETURN_REQUIRED = 'REJECTED_RETURN_REQUIRED';
    public const STATUS_RETURN_IN_PROGRESS = 'RETURN_IN_PROGRESS';
    public const STATUS_RETURNED = 'RETURNED_TO_SUPPLIER';
    public const COST_FREE = 'NO_ADDITIONAL_CHARGE';
    public const COST_CHARGEABLE = 'CHARGEABLE';

    protected $fillable = [
        'submission_key', 'delivery_identity', 'reference', 'receiving_id', 'purchase_order_id', 'supplier_id', 'warehouse_id',
        'submitted_by_id', 'status', 'cost_resolution', 'financial_reconciliation_status',
        'supplier_confirmation_reference', 'supplier_evidence_path', 'supplier_evidence_name',
        'supplier_evidence_mime', 'supplier_evidence_sha256', 'review_notes', 'rejection_reason',
        'reviewed_by_id', 'reviewed_at', 'documentation_type', 'documentation_requested_by_id',
        'documentation_assigned_to_id', 'documentation_requested_at', 'documentation_submitted_at',
        'return_status', 'return_prepared_at', 'return_date', 'return_completed_at', 'return_completed_by_id',
    ];

    protected function casts(): array { return ['reviewed_at' => 'datetime', 'documentation_requested_at' => 'datetime', 'documentation_submitted_at' => 'datetime', 'return_prepared_at' => 'datetime', 'return_date' => 'date', 'return_completed_at' => 'datetime']; }
    public function items(): HasMany { return $this->hasMany(ExcessDeliveryReviewItem::class); }
    public function documents(): HasMany { return $this->hasMany(ExcessDeliveryDocument::class)->orderBy('created_at')->orderBy('id'); }
    public function receiving(): BelongsTo { return $this->belongsTo(Receiving::class); }
    public function purchaseOrder(): BelongsTo { return $this->belongsTo(PurchaseOrder::class); }
    public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); }
    public function warehouse(): BelongsTo { return $this->belongsTo(Warehouse::class); }
    public function submittedBy(): BelongsTo { return $this->belongsTo(User::class, 'submitted_by_id'); }
    public function reviewedBy(): BelongsTo { return $this->belongsTo(User::class, 'reviewed_by_id'); }
    public function documentationRequestedBy(): BelongsTo { return $this->belongsTo(User::class, 'documentation_requested_by_id'); }
    public function documentationAssignedTo(): BelongsTo { return $this->belongsTo(User::class, 'documentation_assigned_to_id'); }
    public function returnCompletedBy(): BelongsTo { return $this->belongsTo(User::class, 'return_completed_by_id'); }

    public function scopeResolved(Builder $query): Builder
    {
        return $query->where(function (Builder $resolved) {
            $resolved->where('status', self::STATUS_RETURNED)
                ->orWhere(function (Builder $stocked) {
                    $stocked->where('status', self::STATUS_APPROVED)
                        ->whereHas('items')
                        ->whereDoesntHave('items.receivingItem', fn (Builder $item) => $item
                            ->whereNull('stocked_in_at')
                            ->orWhere('inspection_status', '<>', 'Passed'));
                });
        });
    }

    public function scopeUnresolved(Builder $query): Builder
    {
        return $query->whereNot(fn (Builder $unresolved) => $unresolved->resolved());
    }

    public function isResolved(): bool
    {
        if ($this->status === self::STATUS_RETURNED) return true;
        if ($this->status !== self::STATUS_APPROVED || $this->items->isEmpty()) return false;

        return $this->items->every(fn (ExcessDeliveryReviewItem $item) =>
            $item->receivingItem?->stocked_in_at !== null
            && $item->receivingItem?->inspection_status === 'Passed'
        );
    }
}
