<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class SupplierAwardLine extends Model { protected $fillable=['supplier_award_id','rfq_line_id','supplier_id','supplier_bid_revision_id','awarded_quantity','awarded_unit_price','evaluation_snapshot'];protected function casts():array{return['awarded_unit_price'=>'decimal:2','evaluation_snapshot'=>'array'];}public function award():BelongsTo{return $this->belongsTo(SupplierAward::class,'supplier_award_id');}public function rfqLine():BelongsTo{return $this->belongsTo(RfqLine::class);}public function revision():BelongsTo{return $this->belongsTo(SupplierBidRevision::class,'supplier_bid_revision_id');} }
