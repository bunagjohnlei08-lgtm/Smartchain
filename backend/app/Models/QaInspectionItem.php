<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QaInspectionItem extends Model
{
    protected $fillable = [
        'qa_inspection_id',
        'receiving_item_id',
        'accepted_quantity',
        'rejected_quantity',
        'inspection_result',
        'remarks',
    ];

    protected function casts(): array
    {
        return [
            'accepted_quantity' => 'integer',
            'rejected_quantity' => 'integer',
        ];
    }

    public function inspection(): BelongsTo
    {
        return $this->belongsTo(QaInspection::class, 'qa_inspection_id');
    }

    public function receivingItem(): BelongsTo
    {
        return $this->belongsTo(ReceivingItem::class);
    }
}
