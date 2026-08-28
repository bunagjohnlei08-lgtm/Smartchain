<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PurchaseOrder extends Model
{
    protected $fillable = [
        'po_number', 'replenishment_request_id', 'supplier_name', 'delivery_details',
        'expected_delivery_date', 'total_amount',
        'status', 'approved_by', 'signature_data', 'sent_at',
    ];

    protected function casts(): array
    {
        return ['total_amount' => 'decimal:2', 'expected_delivery_date' => 'date', 'sent_at' => 'datetime'];
    }

    public function items(): HasMany { return $this->hasMany(PurchaseOrderItem::class); }
    public function approver(): BelongsTo { return $this->belongsTo(User::class, 'approved_by'); }
    public function replenishmentRequest(): BelongsTo { return $this->belongsTo(ReplenishmentRequest::class); }
}
