<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class PurchaseOrderAcknowledgment extends Model
{
    public const RECEIVED='RECEIVED'; public const ACCEPTED='ACCEPTED'; public const CLARIFICATION_REQUESTED='CLARIFICATION_REQUESTED'; public const DECLINED='DECLINED';
    public const ACTIONS=[self::RECEIVED,self::ACCEPTED,self::CLARIFICATION_REQUESTED,self::DECLINED];
    protected $fillable=['purchase_order_id','supplier_id','acted_by','action','remarks','idempotency_key','acted_at'];
    protected function casts():array{return['acted_at'=>'datetime'];}
    public function purchaseOrder():BelongsTo{return $this->belongsTo(PurchaseOrder::class);}
    public function actor():BelongsTo{return $this->belongsTo(User::class,'acted_by');}
}
