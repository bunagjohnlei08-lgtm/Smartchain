<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\Rfq;
use App\Models\SupplierBidRevision;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PublicRfqController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $v=$request->validate(['search'=>['nullable','string','max:255'],'category'=>['nullable','string','max:100']]);
        $query=Rfq::query()->whereNotNull('published_at')->whereIn('status',[Rfq::SCHEDULED,Rfq::OPEN])->where('closes_at','>',now())->whereHas('lines')->with('lines');
        if($v['search']??null)$query->whereHas('lines',fn($q)=>$q->where('product_name','like','%'.$v['search'].'%')->orWhere('public_specification','like','%'.$v['search'].'%'));
        if($v['category']??null)$query->whereHas('lines',fn($q)=>$q->where('category',$v['category']));
        return response()->json(['data'=>$query->orderBy('closes_at')->get()->map(fn(Rfq $r)=>$this->publicData($r))]);
    }
    public function show(Rfq $rfq): JsonResponse { abort_unless($rfq->published_at&&in_array($rfq->status,[Rfq::SCHEDULED,Rfq::OPEN],true)&&$rfq->closes_at->isFuture(),404);$rfq->load('lines');return response()->json(['data'=>$this->publicData($rfq)]); }
    private function publicData(Rfq $r): array { $lines=$r->lines->map(function($l)use($r){$active=SupplierBidRevision::where('status','ACTIVE')->whereHas('bidLine',fn($q)=>$q->where('rfq_line_id',$l->id));return['id'=>$l->id,'product_id'=>$l->product_id,'product_name'=>$l->product_name,'category'=>$l->category,'unit'=>$l->unit,'required_quantity'=>$l->required_quantity,'public_specification'=>$l->public_specification,'reference_unit_price'=>$r->show_reference_price&&$l->publish_reference_price?(string)$l->reference_unit_price:null,'current_best_unit_price'=>$r->show_lowest_bid?($active->min('unit_price')!==null?(string)$active->min('unit_price'):null):null,'active_bid_count'=>$r->show_lowest_bid?$active->count():null,'image_url'=>$l->public_image_path?route('public.rfq-lines.image',$l):null];});return ['id'=>$r->id,'rfq_number'=>$r->rfq_number,'title'=>$r->title,'description'=>$r->description,'status'=>$r->effectiveStatus(),'opens_at'=>$r->opens_at->toIso8601String(),'closes_at'=>$r->closes_at->toIso8601String(),'required_delivery_date'=>$r->required_delivery_date->toDateString(),'delivery_destination'=>$r->delivery_destination,'partial_offers_allowed'=>$r->partial_offers_allowed,'currency'=>$r->currency,'eligibility_criteria'=>$r->eligibility_criteria??[],'mandatory_compliance'=>$r->mandatory_compliance??[],'bid_count'=>$lines->sum(fn($l)=>$l['active_bid_count']??0),'lowest_bid'=>null,'bidding_available'=>$r->effectiveStatus()===Rfq::OPEN,'bidding_message'=>$r->effectiveStatus()===Rfq::OPEN?'Sign in with an active accredited supplier account to submit a quotation.':'Published and scheduled. Bidding opens at the stated opening time.','lines'=>$lines]; }
}
