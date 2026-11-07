<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CustomerReturn extends Model
{
    protected $guarded = ['id'];
    protected $hidden = ['submission_key', 'request_hash'];
    public const STATUSES = ['REQUESTED','AWAITING_RETURN','PENDING_QA','PENDING_DISPOSITION','COMPLETED','REJECTED','CANCELLED'];
    public const REASONS = ['DAMAGED','INCORRECT_PRODUCT','QUALITY_CONCERN','EXCESS_ORDER','OTHER'];
    protected function casts(): array
    {
        return ['received_at'=>'datetime','inspected_at'=>'datetime','closed_at'=>'datetime',
            'requested_quantity'=>'integer','reserved_quantity'=>'integer','received_quantity'=>'integer',
            'passed_quantity'=>'integer','failed_quantity'=>'integer','restocked_quantity'=>'integer','disposed_quantity'=>'integer'];
    }
    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function orderItem(): BelongsTo { return $this->belongsTo(OrderItem::class); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function warehouse(): BelongsTo { return $this->belongsTo(Warehouse::class); }
    public function inspector(): BelongsTo { return $this->belongsTo(User::class, 'qa_user_id'); }
    public function events(): HasMany { return $this->hasMany(CustomerReturnEvent::class)->orderBy('id'); }
    public function evidence(): HasMany { return $this->hasMany(CustomerReturnEvidence::class)->orderBy('id'); }
}
