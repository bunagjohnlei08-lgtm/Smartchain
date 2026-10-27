<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
class SupplierBidLine extends Model { protected $fillable=['supplier_quotation_id','rfq_line_id','status','current_revision_number'];public function quotation():BelongsTo{return $this->belongsTo(SupplierQuotation::class,'supplier_quotation_id');}public function rfqLine():BelongsTo{return $this->belongsTo(RfqLine::class);}public function revisions():HasMany{return $this->hasMany(SupplierBidRevision::class);}public function activeRevision():HasOne{return $this->hasOne(SupplierBidRevision::class)->where('status','ACTIVE');}public function evaluation():HasOne{return $this->hasOne(BidEvaluation::class);} }
