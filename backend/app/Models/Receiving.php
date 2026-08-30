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
        'purchase_order',
        'supplier',
        'reference_no',
        'notes',
        'delivery_date',
        'status',
        'prepared_by_id',
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

    public function qaInspection(): HasOne
    {
        return $this->hasOne(QaInspection::class);
    }
}
