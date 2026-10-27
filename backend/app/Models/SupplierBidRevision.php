<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class SupplierBidRevision extends Model { protected $fillable=['supplier_bid_line_id','previous_revision_id','revision_number','rfq_version','unit_price','offered_quantity','lead_time_days','delivery_available_on','remarks','status','submitted_by','submitted_at','idempotency_key','request_fingerprint'];protected $hidden=['request_fingerprint'];protected function casts():array{return['unit_price'=>'decimal:2','delivery_available_on'=>'date','submitted_at'=>'datetime'];}public function bidLine():BelongsTo{return $this->belongsTo(SupplierBidLine::class,'supplier_bid_line_id');}public function previous():BelongsTo{return $this->belongsTo(self::class,'previous_revision_id');} }
