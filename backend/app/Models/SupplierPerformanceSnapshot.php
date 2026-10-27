<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class SupplierPerformanceSnapshot extends Model
{
    protected $fillable=['supplier_id','policy_version','period_from','period_to','metrics','counts','eligibility_status','overall_score','recognition_tier','calculated_by','calculated_at','override_reason'];
    protected function casts():array{return['metrics'=>'array','counts'=>'array','period_from'=>'date','period_to'=>'date','overall_score'=>'decimal:2','calculated_at'=>'datetime'];}
    public function supplier():BelongsTo{return $this->belongsTo(Supplier::class);}
    public function calculator():BelongsTo{return $this->belongsTo(User::class,'calculated_by');}
}
