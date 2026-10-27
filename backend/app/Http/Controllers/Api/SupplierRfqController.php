<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\{Rfq,RfqLine,Supplier,SupplierBidRevision};
use App\Services\SupplierAccreditationEligibility;
use Illuminate\Http\{JsonResponse,Request};
use Illuminate\Support\Facades\DB;
class SupplierRfqController extends Controller
{
 public function index(Request $request):JsonResponse{$supplier=$request->user()->supplier;$blockers=$this->accreditationBlockers($supplier);if($blockers!==[])return response()->json(['data'=>[],'eligibility'=>['eligible'=>false,'blockers'=>$blockers]])->header('Cache-Control','private, no-store');$categories=$this->categories($supplier->supply_category);$rfqs=Rfq::query()->whereNotNull('published_at')->whereIn('status',[Rfq::SCHEDULED,Rfq::OPEN])->where('closes_at','>',now())->whereHas('lines',fn($q)=>$q->whereIn(DB::raw('UPPER(category)'),$categories))->with(['lines'=>fn($q)=>$q->whereIn(DB::raw('UPPER(category)'),$categories)])->orderBy('closes_at')->get();return response()->json(['data'=>$rfqs->map(fn($r)=>$this->data($r))]);}
 public function show(Request $request,Rfq $rfq):JsonResponse{abort_unless($this->accreditationEligible($request->user()->supplier),403,'Supplier accreditation or verified documents require attention.');$categories=$this->categories($request->user()->supplier->supply_category);abort_unless($rfq->published_at&&$rfq->closes_at->isFuture(),404);$rfq->load(['lines'=>fn($q)=>$q->whereIn(DB::raw('UPPER(category)'),$categories)]);abort_if($rfq->lines->isEmpty(),403,'Your accreditation does not cover this RFQ.');return response()->json(['data'=>$this->data($rfq)]);}
 public function interests(Request $request):JsonResponse
 {
  $v=$request->validate(['rfq_line_ids'=>['required','array','min:1','max:50'],'rfq_line_ids.*'=>['integer','distinct','exists:rfq_lines,id']]);
  $supplier=$request->user()->supplier;
  abort_unless($this->accreditationEligible($supplier),403,'Active accreditation with current verified documents is required.');
  $categories=$this->categories($supplier->supply_category);
  DB::transaction(function()use($request,$supplier,$categories,$v){
   $lines=RfqLine::whereIn('id',$v['rfq_line_ids'])->with('rfq')->lockForUpdate()->get();
   abort_unless($lines->count()===count($v['rfq_line_ids']),422,'One or more opportunities are unavailable.');
   foreach($lines as $line){
    $rfq=$line->rfq;
    abort_unless($rfq->published_at&&$rfq->effectiveStatus()===Rfq::OPEN&&$rfq->closes_at->isFuture(),422,'An opportunity is not open for bidding.');
    abort_unless($categories->contains(mb_strtoupper((string)$line->category)),403,'Your accreditation does not cover this product category.');
    DB::table('supplier_bidding_interests')->updateOrInsert(['supplier_id'=>$supplier->id,'rfq_line_id'=>$line->id],['selected_by_user_id'=>$request->user()->id,'updated_at'=>now(),'created_at'=>now()]);
   }
  });
  return response()->json(['message'=>'Interests saved. No quotation or bid has been submitted.']);
 }
 public function myInterests(Request $request):JsonResponse{$supplier=$request->user()->supplier;$categories=$this->categories($supplier->supply_category);$accredited=$this->accreditationEligible($supplier);$accreditationBlockers=$this->accreditationBlockers($supplier);$lines=RfqLine::query()->whereIn('id',DB::table('supplier_bidding_interests')->where('supplier_id',$supplier->id)->select('rfq_line_id'))->with('rfq')->get();return response()->json(['data'=>$lines->map(function(RfqLine $line)use($categories,$accredited,$accreditationBlockers){$rfq=$line->rfq;$categoryEligible=$categories->contains(mb_strtoupper((string)$line->category));[$code,$message]=!$rfq->published_at?['UNAVAILABLE','This opportunity is not published.']:($rfq->status===Rfq::CANCELLED?['RFQ_CANCELLED','This RFQ was cancelled.']:(now()->gte($rfq->closes_at)||in_array($rfq->effectiveStatus(),[Rfq::CLOSED,Rfq::UNDER_EVALUATION,Rfq::AWARDED,Rfq::PARTIALLY_AWARDED,Rfq::NO_AWARD],true)?['RFQ_CLOSED','The bidding deadline has passed.']:(!$accredited?['ACCREDITATION_REQUIRED','Active accreditation with current verified documents is required.']:(!$categoryEligible?['CATEGORY_NOT_ELIGIBLE','Your accredited supply categories do not cover this product category.']:($rfq->effectiveStatus()===Rfq::SCHEDULED?['SCHEDULED','This published RFQ has not opened for bidding yet.']:['ELIGIBLE_TO_BID','This opportunity is open and your supplier account is eligible.'])))));return['rfq_line_id'=>$line->id,'eligibility_status'=>$code,'eligibility_message'=>$message,'eligibility_reasons'=>collect($accreditationBlockers)->when(!$categoryEligible,fn($reasons)=>$reasons->push(['code'=>'CATEGORY_NOT_ELIGIBLE','message'=>'Your accredited supply categories do not cover this product category.']))->values(),'can_bid'=>$code==='ELIGIBLE_TO_BID','rfq'=>$this->data($rfq,collect([$line]))];})->values()]);}
 private function data(Rfq $r,$lines=null):array{$lines??=$r->lines;return['id'=>$r->id,'rfq_number'=>$r->rfq_number,'title'=>$r->title,'description'=>$r->description,'status'=>$r->effectiveStatus(),'version'=>$r->version,'opens_at'=>$r->opens_at->toIso8601String(),'closes_at'=>$r->closes_at->toIso8601String(),'required_delivery_date'=>$r->required_delivery_date->toDateString(),'delivery_destination'=>$r->delivery_destination,'partial_offers_allowed'=>$r->partial_offers_allowed,'currency'=>$r->currency,'minimum_decrement'=>(string)$r->minimum_decrement,'lines'=>$lines->map(function($l)use($r){$active=SupplierBidRevision::where('status','ACTIVE')->whereHas('bidLine',fn($q)=>$q->where('rfq_line_id',$l->id));return['id'=>$l->id,'product_id'=>$l->product_id,'product_name'=>$l->product_name,'category'=>$l->category,'unit'=>$l->unit,'required_quantity'=>$l->required_quantity,'public_specification'=>$l->public_specification,'reference_unit_price'=>$r->show_reference_price&&$l->publish_reference_price?(string)$l->reference_unit_price:null,'current_best_unit_price'=>$r->show_lowest_bid?($active->min('unit_price')!==null?(string)$active->min('unit_price'):null):null,'active_bid_count'=>$r->show_lowest_bid?$active->count():null,'image_url'=>$l->public_image_path?route('public.rfq-lines.image',$l):null];})->values()];}
 private function accreditationBlockers(Supplier $supplier):array{return app(SupplierAccreditationEligibility::class)->blockers($supplier);}
 private function accreditationEligible(Supplier $supplier):bool{return app(SupplierAccreditationEligibility::class)->eligible($supplier);}
 private function categories(?string $value){return collect(explode(',',(string)$value))->map(fn($v)=>mb_strtoupper(trim($v)))->filter()->values();}
}
