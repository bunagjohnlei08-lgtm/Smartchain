<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\{PurchaseOrder,SupplierAward,SupplierBidLine,SupplierQuotation};
use App\Notifications\WorkflowNotification;
use App\Services\ReverseBidService;
use App\Support\WorkflowNotificationSender;
use Illuminate\Http\{JsonResponse,Request};

class SupplierBidController extends Controller
{
    public function store(Request $request, ReverseBidService $service): JsonResponse
    {
        $quotation = $service->submit($request->user(), $request->validate($this->rules()));
        if ($quotation->wasRecentlyCreated) {
            WorkflowNotificationSender::send($request->user(), new WorkflowNotification('Quotation Submitted', "Quotation {$quotation->quotation_number} was accepted and persisted.", 'success', $quotation->quotation_number, 'Supplier Bidding', ['quotation_id'=>$quotation->id,'rfq_id'=>$quotation->rfq_id]));
            $this->notifyOutbidSuppliers($quotation->lines, $request->user()->supplier_id);
        }
        return response()->json(['data'=>$this->quotation($quotation,$request->user()->supplier_id)], 201);
    }

    public function revise(Request $request, SupplierBidLine $bidLine, ReverseBidService $service): JsonResponse
    {
        $validated = $request->validate($this->lineRules()+['rfq_version'=>['required','integer','min:1'],'idempotency_key'=>['required','string','min:16','max:80']]);
        [$bid,$created] = $service->revise($request->user(), $bidLine, $validated);
        if ($created) {
            WorkflowNotificationSender::send($request->user(), new WorkflowNotification('Bid Revision Submitted', "Revision {$bid->current_revision_number} was accepted and the prior revision remains in history.", 'success', $bid->quotation->quotation_number, 'Supplier Bidding', ['bid_line_id'=>$bid->id,'quotation_id'=>$bid->supplier_quotation_id]));
            $this->notifyOutbidSuppliers(collect([$bid]), $request->user()->supplier_id);
        }
        return response()->json(['data'=>$bid]);
    }

    public function index(Request $request): JsonResponse
    {
        $rows = SupplierQuotation::where('supplier_id',$request->user()->supplier_id)->with(['rfq','lines.rfqLine','lines.activeRevision','lines.revisions'])->latest('submitted_at')->get();
        return response()->json(['data'=>$rows->map(fn($quotation)=>$this->quotation($quotation,$request->user()->supplier_id))]);
    }

    private function rules(): array { return ['rfq_id'=>['required','integer','exists:rfqs,id'],'rfq_version'=>['required','integer','min:1'],'idempotency_key'=>['required','string','min:16','max:80'],'tax_included'=>['required','boolean'],'freight_included'=>['required','boolean'],'commercial_terms'=>['nullable','string','max:3000'],'lines'=>['required','array','min:1','max:50'],'lines.*.rfq_line_id'=>['required','integer','distinct','exists:rfq_lines,id'],...collect($this->lineRules())->mapWithKeys(fn($rules,$key)=>["lines.*.$key"=>$rules])->all()]; }
    private function lineRules(): array { return ['unit'=>['required','string','max:16'],'unit_price'=>['required','regex:/^\d{1,12}(?:\.\d{1,2})?$/'],'offered_quantity'=>['required','integer','min:1'],'lead_time_days'=>['required','integer','min:0','max:3650'],'delivery_available_on'=>['required','date','after_or_equal:today'],'remarks'=>['nullable','string','max:2000']]; }

    private function quotation(SupplierQuotation $quotation, int $supplierId): array
    {
        $quotation->loadMissing(['rfq','lines.rfqLine','lines.activeRevision','lines.revisions']);
        $award = SupplierAward::where('rfq_id',$quotation->rfq_id)->with(['lines'=>fn($query)=>$query->where('supplier_id',$supplierId)->with('rfqLine')])->first();
        $won = $award?->lines->isNotEmpty() ?? false;
        $purchaseOrder=$award?PurchaseOrder::where('supplier_award_id',$award->id)->where('supplier_id',$supplierId)->first():null;
        return [
            'id'=>$quotation->id,'quotation_number'=>$quotation->quotation_number,
            'rfq'=>['id'=>$quotation->rfq->id,'rfq_number'=>$quotation->rfq->rfq_number,'title'=>$quotation->rfq->title,'closes_at'=>$quotation->rfq->closes_at->toIso8601String(),'status'=>$quotation->rfq->effectiveStatus(),'version'=>$quotation->rfq->version],
            'currency'=>$quotation->currency,'status'=>$quotation->status,'tax_included'=>$quotation->tax_included,'freight_included'=>$quotation->freight_included,'commercial_terms'=>$quotation->commercial_terms,'submitted_at'=>$quotation->submitted_at?->toIso8601String(),
            'lines'=>$quotation->lines->map(fn($line)=>['id'=>$line->id,'status'=>$line->status,'revision_count'=>$line->revisions->count(),'rfq_line'=>$line->rfqLine->only(['id','product_name','category','unit','required_quantity','public_specification']),'active_revision'=>$line->activeRevision?->only(['id','revision_number','unit_price','offered_quantity','lead_time_days','delivery_available_on','remarks','submitted_at']),'revisions'=>$line->revisions->sortByDesc('revision_number')->values()->map(fn($revision)=>$revision->only(['id','revision_number','unit_price','offered_quantity','lead_time_days','delivery_available_on','status','submitted_at']))]),
            'result'=>$award?['award_reference'=>$award->award_number,'outcome'=>$won?$award->outcome:'UNSUCCESSFUL','status'=>$award->status,'approved_at'=>$award->approved_at?->toIso8601String(),'currency'=>$quotation->currency,'delivery_terms'=>$quotation->commercial_terms,'po_status'=>$won?($purchaseOrder?['id'=>$purchaseOrder->id,'po_number'=>$purchaseOrder->po_number,'status'=>$purchaseOrder->status]:['status'=>'PENDING_PO_PROCESSING','activation_enabled'=>(bool)config('procurement.award_to_po_enabled')]):null,'next_steps'=>$won?($purchaseOrder?'An authorized Purchase Order is available in Purchase Orders.':'Award approved and pending authorized PO processing. Automatic conversion remains gated until Phase 6 verification.'):'This quotation was not selected. Contact Procurement only through authorized channels if clarification is required.','lines'=>$award->lines->map(function($line)use($quotation){$offer=$quotation->lines->firstWhere('rfq_line_id',$line->rfq_line_id)?->activeRevision?->offered_quantity;return['product_name'=>$line->rfqLine->product_name,'unit'=>$line->rfqLine->unit,'offered_quantity'=>$offer,'awarded_quantity'=>$line->awarded_quantity,'unawarded_quantity'=>$offer===null?null:max(0,$offer-$line->awarded_quantity),'awarded_unit_price'=>(string)$line->awarded_unit_price,'line_total'=>$this->lineTotal($line->awarded_quantity,(string)$line->awarded_unit_price)];})]:null,
        ];
    }
    private function lineTotal(int $quantity,string $price):string { [$whole,$decimal]=array_pad(explode('.',$price,2),2,'');$cents=(((int)$whole*100)+(int)str_pad($decimal,2,'0'))*$quantity;return intdiv($cents,100).'.'.str_pad((string)($cents%100),2,'0',STR_PAD_LEFT); }
    private function notifyOutbidSuppliers($bidLines,int $currentSupplierId):void { foreach($bidLines as $bidLine){$bidLine->loadMissing(['quotation.rfq','activeRevision','rfqLine']);if(!$bidLine->quotation->rfq->show_lowest_bid)continue;$others=SupplierBidLine::where('rfq_line_id',$bidLine->rfq_line_id)->whereHas('quotation',fn($q)=>$q->where('supplier_id','!=',$currentSupplierId))->whereHas('activeRevision',fn($q)=>$q->where('unit_price','>',$bidLine->activeRevision->unit_price))->with('quotation.supplier.authorizedUsers')->get();foreach($others as $other)WorkflowNotificationSender::send($other->quotation->supplier->authorizedUsers,new WorkflowNotification('Competitive Bid Updated',"A lower anonymous bid was accepted for {$bidLine->rfqLine->product_name}. You may revise before the deadline.",'info',$bidLine->quotation->rfq->rfq_number,'Supplier Bidding',['rfq_id'=>$bidLine->quotation->rfq_id,'bid_line_id'=>$other->id]));} }
}
