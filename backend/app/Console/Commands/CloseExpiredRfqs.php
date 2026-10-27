<?php

namespace App\Console\Commands;

use App\Models\{Rfq,SupplierQuotation};
use App\Notifications\WorkflowNotification;
use App\Support\WorkflowNotificationSender;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class CloseExpiredRfqs extends Command
{
    protected $signature = 'rfqs:close-expired';
    protected $description = 'Persist server-expired RFQs as closed and notify participating suppliers once.';

    public function handle(): int
    {
        Rfq::query()->whereIn('status',[Rfq::SCHEDULED,Rfq::OPEN])->whereNotNull('published_at')->where('closes_at','<=',now())->orderBy('id')->chunkById(100,function($rfqs){
            foreach($rfqs as $rfq){$changed=DB::transaction(function()use($rfq){$locked=Rfq::query()->lockForUpdate()->find($rfq->id);if(!$locked||!in_array($locked->status,[Rfq::SCHEDULED,Rfq::OPEN],true)||$locked->closes_at->isFuture())return false;$locked->update(['status'=>Rfq::CLOSED]);return true;});if(!$changed)continue;foreach(SupplierQuotation::where('rfq_id',$rfq->id)->with('supplier.authorizedUsers')->get() as $quotation)WorkflowNotificationSender::send($quotation->supplier->authorizedUsers,new WorkflowNotification('RFQ Bidding Closed',"Bidding has closed for {$rfq->rfq_number}. Procurement evaluation will follow.",'info',$rfq->rfq_number,'Supplier Bidding',['rfq_id'=>$rfq->id,'quotation_id'=>$quotation->id]));}
        });
        return self::SUCCESS;
    }
}
