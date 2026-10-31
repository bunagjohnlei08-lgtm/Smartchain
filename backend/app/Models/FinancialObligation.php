<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FinancialObligation extends Model
{
    public const SUBMITTING = 'SUBMITTING';

    public const BILL_CREATED = 'BILL_CREATED';

    public const FAILED = 'FAILED';

    public const RECONCILIATION_REQUIRED = 'RECONCILIATION_REQUIRED';

    protected $fillable = [
        'purchase_order_id', 'receiving_id', 'local_reference', 'external_reference_id',
        'state', 'amount', 'payload_sha256', 'bill_number', 'transaction_code',
        'financial_status', 'submitted_at', 'acknowledged_at', 'last_error_code',
        'last_error_message', 'created_by',
    ];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'submitted_at' => 'datetime', 'acknowledged_at' => 'datetime'];
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function receiving(): BelongsTo
    {
        return $this->belongsTo(Receiving::class);
    }

    public function attempts(): HasMany
    {
        return $this->hasMany(FinancialObligationAttempt::class);
    }
}
