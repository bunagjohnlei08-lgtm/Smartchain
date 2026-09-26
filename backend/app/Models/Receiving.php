<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Receiving extends Model
{
    protected $fillable = [
        'receiving_no',
        'purchase_order_id',
        'replacement_for_rejection_case_id',
        'purchase_order',
        'supplier',
        'reference_no',
        'notes',
        'delivery_date',
        'status',
        'prepared_by_id',
        'assigned_qa_user_id',
    ];

    protected function casts(): array
    {
        return [
            'delivery_date' => 'date',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(ReceivingItem::class);
    }

    public const STATUS_AWAITING_REPLACEMENT = 'Awaiting Replacement';

    // Callers must hold a transaction; the row lock serialises number allocation.
    public static function nextReceivingNo(): string
    {
        $last = static::query()->lockForUpdate()->orderByDesc('id')->value('receiving_no');
        $nextNumber = $last && preg_match('/(\d+)$/', $last, $matches) ? (int) $matches[1] + 1 : 1;

        return 'RCV-'.str_pad((string) $nextNumber, 5, '0', STR_PAD_LEFT);
    }

    public function replacementForCase(): BelongsTo
    {
        return $this->belongsTo(SupplierRejectionCase::class, 'replacement_for_rejection_case_id');
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function timeline(): HasMany
    {
        return $this->hasMany(ReceivingTimeline::class)->orderBy('occurred_at');
    }

    public function preparedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'prepared_by_id');
    }

    public function assignedQa(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_qa_user_id');
    }

    public function qaInspection(): HasOne
    {
        return $this->hasOne(QaInspection::class);
    }
}
