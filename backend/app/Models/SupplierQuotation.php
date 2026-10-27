<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
class SupplierQuotation extends Model { protected $fillable=['quotation_number','rfq_id','supplier_id','submitted_by','currency','status','idempotency_key','rfq_version','tax_included','freight_included','commercial_terms','submitted_at'];protected function casts():array{return['tax_included'=>'boolean','freight_included'=>'boolean','submitted_at'=>'datetime'];}public function rfq():BelongsTo{return $this->belongsTo(Rfq::class);}public function supplier():BelongsTo{return $this->belongsTo(Supplier::class);}public function lines():HasMany{return $this->hasMany(SupplierBidLine::class);} }
