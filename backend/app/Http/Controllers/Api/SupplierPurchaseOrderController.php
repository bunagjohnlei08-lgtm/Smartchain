<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\{PurchaseOrder,PurchaseOrderAcknowledgment,SupplierPerformanceSnapshot,User};
use App\Notifications\WorkflowNotification;
use App\Services\SupplierPerformanceService;
use App\Support\{AuditLogger,WorkflowNotificationSender};
use Illuminate\Http\{JsonResponse,Request};
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class SupplierPurchaseOrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $orders=PurchaseOrder::where('supplier_id',$request->user()->supplier_id)->with(['items','award.rfq','acknowledgments','receivings.items.qaInspectionItem','receivings.qaInspection'])->latest()->get();
        return response()->json(['data'=>$orders->map(fn($order)=>$this->present($order))]);
    }
    public function show(Request $request,PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->own($request,$purchaseOrder);
        return response()->json(['data'=>$this->present($purchaseOrder->load(['items','award.rfq','acknowledgments.actor:id,name','receivings.items.qaInspectionItem','receivings.qaInspection']))]);
    }
    public function acknowledge(Request $request,PurchaseOrder $purchaseOrder): JsonResponse
    {
        $this->own($request,$purchaseOrder);
        $data=$request->validate(['action'=>['required',Rule::in(PurchaseOrderAcknowledgment::ACTIONS)],'remarks'=>['nullable','string','max:3000'],'idempotency_key'=>['required','string','min:16','max:80']]);
        $ack=DB::transaction(function()use($purchaseOrder,$request,$data){
            $order=PurchaseOrder::query()->lockForUpdate()->findOrFail($purchaseOrder->id);$this->own($request,$order);
            abort_unless(in_array($order->status,[PurchaseOrder::STATUS_SENT_TO_SUPPLIER,PurchaseOrder::STATUS_PARTIALLY_RECEIVED],true),422,'Only an issued Purchase Order can be acknowledged.');
            if($existing=PurchaseOrderAcknowledgment::where('purchase_order_id',$order->id)->where('idempotency_key',$data['idempotency_key'])->first()){
                if($existing->action!==$data['action']||($existing->remarks??null)!==($data['remarks']??null))throw new ConflictHttpException('This idempotency key was already used for a different acknowledgment.');
                return $existing;
            }
            return PurchaseOrderAcknowledgment::create(['purchase_order_id'=>$order->id,'supplier_id'=>$request->user()->supplier_id,'acted_by'=>$request->user()->id,'action'=>$data['action'],'remarks'=>$data['remarks']??null,'idempotency_key'=>$data['idempotency_key'],'acted_at'=>now()]);
        },3);
        if($ack->wasRecentlyCreated){
            AuditLogger::success('SUPPLIER_PO_ACKNOWLEDGED',AuditLogger::MODULE_PURCHASE_ORDERS,['actor'=>$request->user(),'resource'=>$purchaseOrder,'resource_label'=>$purchaseOrder->po_number,'details'=>$ack->remarks,'metadata'=>['action'=>$ack->action]]);
            $admins=User::whereHas('role',fn($q)=>$q->where('slug','ADMIN'))->where('status','ACTIVE')->get();
            WorkflowNotificationSender::send($admins,new WorkflowNotification('Supplier PO Response',"{$purchaseOrder->po_number}: ".str_replace('_',' ',$ack->action),in_array($ack->action,[PurchaseOrderAcknowledgment::DECLINED,PurchaseOrderAcknowledgment::CLARIFICATION_REQUESTED],true)?'warning':'info',$purchaseOrder->po_number,'Purchase Orders',['purchase_order_id'=>$purchaseOrder->id,'acknowledgment_id'=>$ack->id]));
        }
        return response()->json(['data'=>$ack],$ack->wasRecentlyCreated?201:200);
    }
    public function performance(Request $request,SupplierPerformanceService $service):JsonResponse
    {
        $supplier=$request->user()->supplier;
        return response()->json(['data'=>$service->summarizeSupplier($supplier),'history'=>SupplierPerformanceSnapshot::where('supplier_id',$supplier->id)->latest('calculated_at')->get()]);
    }
    private function own(Request $request,PurchaseOrder $order):void{abort_unless((int)$order->supplier_id===(int)$request->user()->supplier_id,404);}
    private function present(PurchaseOrder $order):array
    {
        $latest=$order->acknowledgments->first();
        return ['id'=>$order->id,'po_number'=>$order->po_number,'award_reference'=>$order->award?->award_number,'rfq_reference'=>$order->award?->rfq?->rfq_number,'issue_date'=>$order->created_at?->toDateString(),'supplier'=>$order->supplier_name,'currency'=>$order->currency,'total_amount'=>(string)$order->total_amount,'expected_delivery_date'=>$order->expected_delivery_date?->toDateString(),'delivery_details'=>$order->delivery_details,'tax_included'=>$order->tax_included,'freight_included'=>$order->freight_included,'commercial_terms'=>$order->commercial_terms,'agreement_reference'=>$order->agreement_reference,'status'=>$order->status,'acknowledgment'=>$latest?['action'=>$latest->action,'remarks'=>$latest->remarks,'acted_at'=>$latest->acted_at?->toIso8601String()]:null,'items'=>$order->items->map(function($item)use($order){$receivingItems=$order->receivings->flatMap->items->where('purchase_order_item_id',$item->id);$received=(int)$receivingItems->sum('delivered_quantity');$accepted=(int)$receivingItems->sum(fn($row)=>(int)($row->qaInspectionItem?->accepted_quantity??0));$rejected=(int)$receivingItems->sum(fn($row)=>(int)($row->qaInspectionItem?->rejected_quantity??0));return ['id'=>$item->id,'product_name'=>$item->product_name,'unit'=>$item->unit,'ordered_quantity'=>(int)$item->ordered_quantity,'unit_price'=>(string)$item->unit_price,'total_price'=>(string)$item->total_price,'quantity_dispatched'=>null,'quantity_received'=>$received,'quantity_accepted'=>$accepted,'quantity_rejected'=>$rejected,'remaining_quantity'=>max(0,(int)$item->ordered_quantity-$received)];})->values(),'deliveries'=>$order->receivings->map(fn($receiving)=>['reference'=>$receiving->receiving_no,'delivery_date'=>$receiving->delivery_date?->toDateString(),'delivery_status'=>$receiving->status,'inspection_status'=>$receiving->qaInspection?->status,'warehouse_confirmed'=>true])->values()];
    }
}
