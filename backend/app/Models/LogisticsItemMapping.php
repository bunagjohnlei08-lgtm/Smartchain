<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LogisticsItemMapping extends Model
{
    protected $fillable = ['logistics_partner_id', 'product_id', 'partner_item_reference'];

    public function partner(): BelongsTo { return $this->belongsTo(LogisticsPartner::class, 'logistics_partner_id'); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
}
