<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReceivingDiscrepancy extends Model
{
    public const TYPE_SHORT_DELIVERY = 'SHORT_DELIVERY';
    public const STATUS_REPORTED = 'REPORTED';
    public const STATUS_CONTACTED = 'SUPPLIER_CONTACTED';
    public const STATUS_AWAITING_RESPONSE = 'AWAITING_SUPPLIER_RESPONSE';
    public const STATUS_AWAITING_BALANCE = 'AWAITING_BALANCE_DELIVERY';
    public const STATUS_UNDER_RESOLUTION = 'UNDER_RESOLUTION';
    public const STATUS_RESOLVED = 'RESOLVED';
    public const STATUS_CLOSED_SHORTAGE = 'CLOSED_WITH_SHORTAGE';
    public const RESPONSE_WILL_FULFILL = 'WILL_FULFILL';
    public const RESPONSE_WILL_NOT_FULFILL = 'WILL_NOT_FULFILL';
    public const RESPONSE_OTHER = 'OTHER';

    protected $fillable = [
        'purchase_order_id', 'receiving_id', 'supplier_id', 'discrepancy_type',
        'expected_quantity', 'delivered_quantity', 'short_quantity', 'status',
        'reported_by_id', 'reported_at', 'contact_method', 'contact_note', 'contacted_by_id', 'contacted_at',
        'supplier_response', 'supplier_response_code', 'response_notes', 'expected_balance_delivery_date',
        'responded_by_id', 'responded_at', 'resolution_notes', 'resolved_by_id', 'resolved_by_receiving_id', 'resolved_at',
    ];

    protected function casts(): array
    {
        return [
            'expected_quantity' => 'integer', 'delivered_quantity' => 'integer',
            'short_quantity' => 'integer', 'reported_at' => 'datetime', 'contacted_at' => 'datetime',
            'responded_at' => 'datetime', 'expected_balance_delivery_date' => 'date', 'resolved_at' => 'datetime',
        ];
    }

    public function purchaseOrder(): BelongsTo { return $this->belongsTo(PurchaseOrder::class); }
    public function receiving(): BelongsTo { return $this->belongsTo(Receiving::class); }
    public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); }
    public function reportedBy(): BelongsTo { return $this->belongsTo(User::class, 'reported_by_id'); }
    public function contactedBy(): BelongsTo { return $this->belongsTo(User::class, 'contacted_by_id'); }
    public function respondedBy(): BelongsTo { return $this->belongsTo(User::class, 'responded_by_id'); }
    public function resolvedBy(): BelongsTo { return $this->belongsTo(User::class, 'resolved_by_id'); }
    public function resolvedByReceiving(): BelongsTo { return $this->belongsTo(Receiving::class, 'resolved_by_receiving_id'); }
}
