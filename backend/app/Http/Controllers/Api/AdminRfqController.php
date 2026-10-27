<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ReplenishmentRequest;
use App\Models\Product;
use App\Models\Rfq;
use App\Models\SupplierQuotation;
use App\Notifications\WorkflowNotification;
use App\Support\{AuditLogger,RfqCatalogImageSnapshot,WorkflowNotificationSender};
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\URL;

class AdminRfqController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(),403);
        $validated=$request->validate(['search'=>['nullable','string','max:255'],'status'=>['nullable',Rule::in(Rfq::STATUSES)]]);
        $rows=Rfq::query()->withCount('lines')->with('creator:id,name')->when($validated['search']??null,fn($q,$s)=>$q->where(fn($q)=>$q->where('rfq_number','like',"%{$s}%")->orWhere('title','like',"%{$s}%")))->when($validated['status']??null,fn($q,$s)=>$q->where('status',$s))->latest()->paginate(25);
        $rows->through(fn(Rfq $rfq)=>$this->data($rfq));
        return response()->json($rows);
    }

    public function sourcingDecision(Request $request, ReplenishmentRequest $replenishmentRequest): JsonResponse
    {
        abort_unless($request->user()->isAdmin(),403);
        $validated=$request->validate(['sourcing_method'=>['required',Rule::in(ReplenishmentRequest::SOURCING_METHODS)]]);
        $row=DB::transaction(function()use($request,$replenishmentRequest,$validated){
            $row=ReplenishmentRequest::query()->lockForUpdate()->findOrFail($replenishmentRequest->id);
            abort_unless(in_array($row->status,ReplenishmentRequest::AWAITING_PURCHASE_ORDER_STATUSES,true),422,'Only an approved requirement can receive a sourcing decision.');
            abort_if($row->purchaseOrder()->exists()||$row->rfqLine()->exists(),409,'This requirement already has a downstream sourcing commitment.');
            abort_if($row->sourcing_method && $row->sourcing_method!==$validated['sourcing_method'],409,'The sourcing method is already committed.');
            $row->forceFill(['sourcing_method'=>$validated['sourcing_method'],'sourcing_selected_by'=>$request->user()->id,'sourcing_selected_at'=>now()])->save();
            return $row;
        });
        AuditLogger::success('PROCUREMENT_SOURCING_METHOD_SELECTED',AuditLogger::MODULE_PROCUREMENT,['actor'=>$request->user(),'resource'=>$row,'resource_label'=>$row->request_no,'details'=>"Selected {$row->sourcing_method}."]);
        return response()->json(['data'=>$row->only(['id','request_no','sourcing_method','sourcing_selected_at'])]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(),403);
        $v=$request->validate($this->rules());
        $this->validateCriteriaWeights($v);
        $rfq=DB::transaction(function()use($request,$v){
            $requests=ReplenishmentRequest::query()->whereIn('id',collect($v['lines'])->pluck('replenishment_request_id'))->lockForUpdate()->get()->keyBy('id');
            abort_unless($requests->count()===count($v['lines']),422,'Every RFQ line must reference an existing requirement.');
            foreach($v['lines'] as $line){ $requirement=$requests[$line['replenishment_request_id']]; abort_unless(in_array($requirement->status,ReplenishmentRequest::AWAITING_PURCHASE_ORDER_STATUSES,true)&&$requirement->sourcing_method===ReplenishmentRequest::SOURCING_COMPETITIVE&&!$requirement->purchaseOrder()->exists()&&!$requirement->rfqLine()->exists(),422,"Requirement {$requirement->request_no} is not available for competitive bidding."); abort_unless($requirement->product_id===$line['product_id']&&(int)$requirement->requested_qty===(int)$line['required_quantity']&&$requirement->product->unit===$line['unit'],422,"RFQ line values must match {$requirement->request_no}."); }
            $rfq=Rfq::create([...collect($v)->except('lines')->all(),'rfq_number'=>$v['rfq_number']??$this->number(),'status'=>Rfq::DRAFT,'created_by'=>$request->user()->id]);
            foreach($v['lines'] as $line){$product=$requests[$line['replenishment_request_id']]->product;$rfqLine=$rfq->lines()->create([...$line,'product_name'=>$product->name,'category'=>$product->category]);RfqCatalogImageSnapshot::copy($product,$rfqLine);}
            return $rfq->load(['lines','creator:id,name']);
        });
        AuditLogger::success('RFQ_DRAFT_CREATED',AuditLogger::MODULE_PROCUREMENT,['actor'=>$request->user(),'resource'=>$rfq,'resource_label'=>$rfq->rfq_number,'details'=>'Created RFQ draft.']);
        return response()->json(['data'=>$this->data($rfq)],201);
    }

    public function submit(Request $request,Rfq $rfq): JsonResponse { return $this->transition($request,$rfq,Rfq::DRAFT,Rfq::PENDING_APPROVAL,'RFQ_SUBMITTED_FOR_APPROVAL',[],true); }
    public function approve(Request $request,Rfq $rfq): JsonResponse { return $this->transition($request,$rfq,Rfq::PENDING_APPROVAL,Rfq::SCHEDULED,'RFQ_APPROVED',['approved_by'=>$request->user()->id,'approved_at'=>now()]); }
    public function publish(Request $request,Rfq $rfq): JsonResponse { abort_unless($request->user()->isAdmin(),403); return DB::transaction(function()use($request,$rfq){$locked=Rfq::query()->lockForUpdate()->with('lines')->findOrFail($rfq->id);abort_unless($locked->status===Rfq::SCHEDULED&&$locked->approved_at&&!$locked->published_at&&$locked->lines->isNotEmpty(),422,'Only a complete approved, unpublished RFQ can be published.');abort_if(now()->gte($locked->closes_at),422,'An RFQ cannot be published after its deadline.');$locked->update(['published_by'=>$request->user()->id,'published_at'=>now(),'status'=>now()->gte($locked->opens_at)?Rfq::OPEN:Rfq::SCHEDULED]);AuditLogger::success('RFQ_PUBLISHED',AuditLogger::MODULE_PROCUREMENT,['actor'=>$request->user(),'resource'=>$locked,'resource_label'=>$locked->rfq_number]);return response()->json(['data'=>$this->data($locked)]);}); }
    public function cancel(Request $request,Rfq $rfq): JsonResponse { abort_unless($request->user()->isAdmin(),403);$v=$request->validate(['reason'=>['required','string','min:3','max:2000']]);$cancelled=DB::transaction(function()use($request,$rfq,$v){$locked=Rfq::query()->lockForUpdate()->findOrFail($rfq->id);abort_if(in_array($locked->status,[Rfq::AWARDED,Rfq::PARTIALLY_AWARDED,Rfq::CANCELLED],true),422,'This RFQ cannot be cancelled.');$locked->update(['status'=>Rfq::CANCELLED,'cancelled_by'=>$request->user()->id,'cancelled_at'=>now(),'cancellation_reason'=>$v['reason']]);AuditLogger::success('RFQ_CANCELLED',AuditLogger::MODULE_PROCUREMENT,['actor'=>$request->user(),'resource'=>$locked,'resource_label'=>$locked->rfq_number,'details'=>$v['reason']]);return $locked;});foreach(SupplierQuotation::where('rfq_id',$cancelled->id)->with('supplier.authorizedUsers')->get()as$quotation)WorkflowNotificationSender::send($quotation->supplier->authorizedUsers,new WorkflowNotification('RFQ Cancelled',"{$cancelled->rfq_number} was cancelled by Procurement. No award was created.",'info',$cancelled->rfq_number,'Supplier Bidding',['rfq_id'=>$cancelled->id,'quotation_id'=>$quotation->id]));return response()->json(['data'=>$this->data($cancelled)]); }

    private function transition(Request $request,Rfq $rfq,string $from,string $to,string $action,array $extra=[],bool $idempotent=false): JsonResponse { abort_unless($request->user()->isAdmin(),403);[$row,$changed]=DB::transaction(function()use($rfq,$from,$to,$extra,$idempotent){$row=Rfq::query()->lockForUpdate()->with('lines')->findOrFail($rfq->id);if($idempotent&&$row->status===$to)return[$row,false];abort_unless($row->status===$from,422,"RFQ must be {$from}.");abort_if($row->lines->isEmpty()||$row->opens_at->gte($row->closes_at)||$row->closes_at->toDateString()>=$row->required_delivery_date->toDateString(),422,'RFQ dates and lines are incomplete or invalid.');abort_if(now()->gte($row->closes_at),422,'The RFQ deadline has passed. Update the draft with a future deadline before submitting or approving it.');$row->update(['status'=>$to,...$extra]);return[$row,true];});if($changed)AuditLogger::success($action,AuditLogger::MODULE_PROCUREMENT,['actor'=>$request->user(),'resource'=>$row,'resource_label'=>$row->rfq_number]);return response()->json(['data'=>$this->data($row)]); }
    private function rules(): array { return ['rfq_number'=>['nullable','string','max:40','unique:rfqs,rfq_number'],'title'=>['required','string','max:255'],'description'=>['nullable','string','max:5000'],'opens_at'=>['required','date','after:now'],'closes_at'=>['required','date','after:opens_at'],'required_delivery_date'=>['required','date','after:closes_at'],'delivery_destination'=>['required','string','max:2000'],'partial_offers_allowed'=>['required','boolean'],'split_awards_allowed'=>['required','boolean'],'minimum_decrement'=>['required','decimal:0,2','min:0'],'currency'=>['required','string','size:3','regex:/^[A-Z]{3}$/'],'show_reference_price'=>['required','boolean'],'show_lowest_bid'=>['required','boolean'],'eligibility_criteria'=>['nullable','array'],'eligibility_criteria.*'=>['string','max:500'],'mandatory_compliance'=>['nullable','array'],'mandatory_compliance.*'=>['string','max:500'],'evaluation_criteria'=>['nullable','array'],'evaluation_criteria.*.name'=>['required_with:evaluation_criteria','string','max:150'],'evaluation_criteria.*.weight'=>['required_with:evaluation_criteria','numeric','min:0','max:100'],'procurement_remarks'=>['nullable','string','max:5000'],'lines'=>['required','array','min:1','max:50'],'lines.*.replenishment_request_id'=>['required','integer','distinct'],'lines.*.product_id'=>['required','integer','exists:products,id'],'lines.*.unit'=>['required',Rule::in([...Product::PACKAGE_UNITS,'KG','L'])],'lines.*.required_quantity'=>['required','integer','min:1'],'lines.*.public_specification'=>['required','string','max:5000'],'lines.*.reference_unit_price'=>['nullable','decimal:0,2','min:0'],'lines.*.publish_reference_price'=>['required','boolean']]; }
    private function validateCriteriaWeights(array $data): void { $criteria=$data['evaluation_criteria']??[];if($criteria!==[]&&abs((float)collect($criteria)->sum('weight')-100)>0.001)throw ValidationException::withMessages(['evaluation_criteria'=>['Evaluation criteria weights must total 100%.']]); }
    private function number(): string { return 'RFQ-'.now()->format('Ymd').'-'.strtoupper(substr((string)\Illuminate\Support\Str::uuid(),0,8)); }
    private function data(Rfq $r): array { $r->loadMissing(['lines','creator:id,name']);return ['id'=>$r->id,'rfq_number'=>$r->rfq_number,'title'=>$r->title,'description'=>$r->description,'status'=>$r->effectiveStatus(),'stored_status'=>$r->status,'published_at'=>$r->published_at?->toIso8601String(),'opens_at'=>$r->opens_at?->toIso8601String(),'closes_at'=>$r->closes_at?->toIso8601String(),'required_delivery_date'=>$r->required_delivery_date?->toDateString(),'delivery_destination'=>$r->delivery_destination,'partial_offers_allowed'=>$r->partial_offers_allowed,'split_awards_allowed'=>$r->split_awards_allowed,'minimum_decrement'=>(string)$r->minimum_decrement,'currency'=>$r->currency,'show_reference_price'=>$r->show_reference_price,'show_lowest_bid'=>$r->show_lowest_bid,'eligibility_criteria'=>$r->eligibility_criteria??[],'mandatory_compliance'=>$r->mandatory_compliance??[],'evaluation_criteria'=>$r->evaluation_criteria??[],'created_by'=>$r->creator?->name,'lines'=>$r->lines->map(fn($l)=>[...$l->only(['id','replenishment_request_id','product_id','product_name','category','unit','required_quantity','public_specification','reference_unit_price','publish_reference_price']),'image_url'=>$l->public_image_path?URL::temporarySignedRoute('rfq-lines.image.preview',now()->addMinutes(10),['rfqLine'=>$l]):null])]; }
}
