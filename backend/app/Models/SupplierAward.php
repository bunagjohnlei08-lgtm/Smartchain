<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
class SupplierAward extends Model { protected $fillable=['award_number','rfq_id','outcome','status','justification','idempotency_key','approved_by','approved_at'];protected function casts():array{return['approved_at'=>'datetime'];}public function rfq():BelongsTo{return $this->belongsTo(Rfq::class);}public function lines():HasMany{return $this->hasMany(SupplierAwardLine::class);}public function purchaseOrders():HasMany{return $this->hasMany(PurchaseOrder::class);} }
