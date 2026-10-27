<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class BidEvaluation extends Model { protected $fillable=['supplier_bid_line_id','supplier_bid_revision_id','mandatory_passed','mandatory_results','criterion_scores','weighted_score','qualification_reason','evaluated_by','evaluated_at'];protected function casts():array{return['mandatory_passed'=>'boolean','mandatory_results'=>'array','criterion_scores'=>'array','weighted_score'=>'decimal:4','evaluated_at'=>'datetime'];} }
