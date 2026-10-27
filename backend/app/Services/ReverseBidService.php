<?php
namespace App\Services;
use App\Models\{Rfq,RfqLine,Supplier,SupplierBidLine,SupplierBidRevision,SupplierQuotation,User};
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class ReverseBidService
{
    public function submit(User $user,array $data): SupplierQuotation
    {
        return DB::transaction(function()use($user,$data){
            $existing=SupplierQuotation::where('supplier_id',$user->supplier_id)->where('idempotency_key',$data['idempotency_key'])->first();
            if($existing){if($existing->rfq_id!==(int)$data['rfq_id'])throw new ConflictHttpException('This idempotency key belongs to a different RFQ submission.');return $existing->load(['rfq','lines.rfqLine','lines.activeRevision']);}
            $rfq=Rfq::query()->lockForUpdate()->findOrFail($data['rfq_id']);$this->assertOpen($rfq,(int)$data['rfq_version']);
            $supplier=Supplier::query()->lockForUpdate()->findOrFail($user->supplier_id);$this->assertSupplierEligible($supplier);
            if($retry=SupplierQuotation::where('supplier_id',$supplier->id)->where('idempotency_key',$data['idempotency_key'])->first()){if($retry->rfq_id!==(int)$data['rfq_id'])throw new ConflictHttpException('This idempotency key belongs to a different RFQ submission.');return $retry->load(['rfq','lines.rfqLine','lines.activeRevision']);}
            if(SupplierQuotation::where('supplier_id',$supplier->id)->where('rfq_id',$rfq->id)->exists())throw new ConflictHttpException('A quotation already exists for this RFQ. Revise its individual bid lines instead.');
            $lines=RfqLine::query()->where('rfq_id',$rfq->id)->whereIn('id',collect($data['lines'])->pluck('rfq_line_id'))->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            if($lines->count()!==count($data['lines']))throw ValidationException::withMessages(['lines'=>['Every selected line must belong to this RFQ.']]);
            $quotation=SupplierQuotation::create(['quotation_number'=>'QUO-'.now()->format('Ymd').'-'.strtoupper(substr((string)Str::uuid(),0,8)),'rfq_id'=>$rfq->id,'supplier_id'=>$supplier->id,'submitted_by'=>$user->id,'currency'=>$rfq->currency,'status'=>'SUBMITTED','idempotency_key'=>$data['idempotency_key'],'rfq_version'=>$rfq->version,'tax_included'=>$data['tax_included'],'freight_included'=>$data['freight_included'],'commercial_terms'=>$data['commercial_terms']??null,'submitted_at'=>now()]);
            foreach($data['lines'] as $offer){$line=$lines[$offer['rfq_line_id']];$this->assertCategory($supplier->supply_category,$line->category);$this->assertOffer($rfq,$line,$offer);$bid=$quotation->lines()->create(['rfq_line_id'=>$line->id,'status'=>'SUBMITTED','current_revision_number'=>1]);$bid->revisions()->create([...$this->revisionData($offer,$rfq,$user),'revision_number'=>1]);}
            AuditLogger::success('SUPPLIER_QUOTATION_SUBMITTED',AuditLogger::MODULE_PROCUREMENT,['actor'=>$user,'resource'=>$quotation,'resource_label'=>$quotation->quotation_number,'metadata'=>['rfq_id'=>$rfq->id,'line_count'=>count($data['lines'])]]);
            return $quotation->load(['rfq','lines.rfqLine','lines.activeRevision']);
        },3);
    }
    public function revise(User $user,SupplierBidLine $bid,array $data): array
    {
        return DB::transaction(function()use($user,$bid,$data){$candidate=SupplierBidLine::query()->with('quotation')->findOrFail($bid->id);abort_unless($candidate->quotation->supplier_id===$user->supplier_id,404);$rfq=Rfq::query()->lockForUpdate()->findOrFail($candidate->quotation->rfq_id);$locked=SupplierBidLine::query()->lockForUpdate()->findOrFail($candidate->id);$locked->load(['quotation','rfqLine']);$fingerprint=$this->revisionFingerprint($data);$replay=$locked->revisions()->where('idempotency_key',$data['idempotency_key'])->first();if($replay){if(!hash_equals((string)$replay->request_fingerprint,$fingerprint))throw new ConflictHttpException('This idempotency key was already used with different revision data.');return[$locked->fresh(['quotation.rfq','rfqLine','revisions','activeRevision']),false];}$line=RfqLine::query()->lockForUpdate()->findOrFail($locked->rfq_line_id);$supplier=Supplier::query()->lockForUpdate()->findOrFail($user->supplier_id);$this->assertSupplierEligible($supplier);$this->assertOpen($rfq,(int)$data['rfq_version']);$this->assertCategory($supplier->supply_category,$line->category);$this->assertOffer($rfq,$line,$data);$previous=$locked->activeRevision()->lockForUpdate()->firstOrFail();$previous->update(['status'=>'SUPERSEDED']);$next=$locked->current_revision_number+1;$locked->update(['current_revision_number'=>$next,'status'=>'SUBMITTED']);$locked->revisions()->create([...$this->revisionData($data,$rfq,$user),'revision_number'=>$next,'previous_revision_id'=>$previous->id,'idempotency_key'=>$data['idempotency_key'],'request_fingerprint'=>$fingerprint]);AuditLogger::success('SUPPLIER_BID_REVISED',AuditLogger::MODULE_PROCUREMENT,['actor'=>$user,'resource'=>$locked,'resource_label'=>$locked->quotation->quotation_number,'metadata'=>['rfq_line_id'=>$line->id,'revision'=>$next]]);return[$locked->fresh(['quotation.rfq','rfqLine','revisions','activeRevision']),true];},3);
    }
    private function assertSupplierEligible(Supplier $supplier):void
    {
        $blockers = app(SupplierAccreditationEligibility::class)->blockers($supplier);
        abort_unless($blockers === [], 403, $blockers[0]['message'] ?? 'Supplier accreditation is not currently eligible for bidding.');
    }
    private function assertOpen(Rfq $rfq,int $version):void { if($rfq->version!==$version)throw new ConflictHttpException('The RFQ changed. Reload its current requirements before bidding.');if(!$rfq->published_at||$rfq->effectiveStatus()!==Rfq::OPEN||now()->gte($rfq->closes_at))throw ValidationException::withMessages(['rfq_id'=>['This RFQ is not open for bidding.']]); }
    private function assertCategory(?string $categories,?string $category):void {$eligible=collect(explode(',',(string)$categories))->map(fn($v)=>mb_strtoupper(trim($v)))->filter();abort_unless($eligible->contains(mb_strtoupper((string)$category)),403,'Your accreditation does not cover this product category.');}
    private function assertOffer(Rfq $rfq,RfqLine $line,array $offer):void {
        if($offer['unit']!==$line->unit)throw ValidationException::withMessages(['lines'=>['The offered unit does not match the RFQ.']]);$qty=(int)$offer['offered_quantity'];if($qty>$line->required_quantity||(!$rfq->partial_offers_allowed&&$qty!==$line->required_quantity))throw ValidationException::withMessages(['lines'=>['Offered quantity violates the RFQ quantity policy.']]);if($offer['delivery_available_on']>$rfq->required_delivery_date->toDateString())throw ValidationException::withMessages(['lines'=>['Delivery availability is later than the required delivery date.']]);
        $price=$this->cents($offer['unit_price']);if($line->reference_unit_price!==null&&$price>$this->cents($line->reference_unit_price))throw ValidationException::withMessages(['lines'=>['Unit price exceeds the RFQ reference ceiling.']]);
        $best=SupplierBidRevision::query()->where('status','ACTIVE')->whereHas('bidLine',fn($q)=>$q->where('rfq_line_id',$line->id))->orderBy('unit_price')->lockForUpdate()->first();
        if($best){$maximum=$this->cents($best->unit_price)-$this->cents($rfq->minimum_decrement);if($price>$maximum)throw new ConflictHttpException('The competitive threshold changed. Reload and submit a lower bid.');}
    }
    private function cents(string|int|float $value):int {$v=(string)$value;if(!preg_match('/^\d{1,12}(?:\.\d{1,2})?$/',$v))throw ValidationException::withMessages(['unit_price'=>['Use a positive amount with no more than two decimal places.']]);[$whole,$decimal]=array_pad(explode('.',$v,2),2,'');$cents=((int)$whole*100)+(int)str_pad($decimal,2,'0');if($cents<=0)throw ValidationException::withMessages(['unit_price'=>['Unit price must be greater than zero.']]);return $cents;}
    private function revisionFingerprint(array $data):string {$payload=['rfq_version'=>(int)$data['rfq_version'],'unit'=>(string)$data['unit'],'unit_price'=>number_format($this->cents($data['unit_price'])/100,2,'.',''),'offered_quantity'=>(int)$data['offered_quantity'],'lead_time_days'=>(int)$data['lead_time_days'],'delivery_available_on'=>(string)$data['delivery_available_on'],'remarks'=>$data['remarks']??null];return hash('sha256',json_encode($payload,JSON_THROW_ON_ERROR));}
    private function revisionData(array $data,Rfq $rfq,User $user):array{return['rfq_version'=>$rfq->version,'unit_price'=>number_format($this->cents($data['unit_price'])/100,2,'.',''),'offered_quantity'=>$data['offered_quantity'],'lead_time_days'=>$data['lead_time_days'],'delivery_available_on'=>$data['delivery_available_on'],'remarks'=>$data['remarks']??null,'status'=>'ACTIVE','submitted_by'=>$user->id,'submitted_at'=>now()];}
}
