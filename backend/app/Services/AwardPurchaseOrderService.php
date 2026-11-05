<?php

namespace App\Services;

use App\Models\{PurchaseOrder,Rfq,Supplier,SupplierAward,SupplierBidRevision,User};
use App\Notifications\WorkflowNotification;
use App\Support\AuditLogger;
use App\Support\WorkflowNotificationSender;
use Illuminate\Support\Facades\DB;

class AwardPurchaseOrderService
{
    public function convert(SupplierAward $award, User $actor): array
    {
        abort_unless(config('procurement.award_to_po_enabled') === true, 503, 'Award-to-PO processing is disabled pending Phase 6 verification.');
        abort_unless($actor->isAdmin(), 403);

        return DB::transaction(function () use ($award, $actor) {
            $locked = SupplierAward::query()->lockForUpdate()->with(['rfq.lines','lines.rfqLine.replenishmentRequest','lines.revision.bidLine.quotation'])->findOrFail($award->id);
            abort_unless($locked->status === 'APPROVED' && in_array($locked->outcome, ['FULL_AWARD','PARTIAL_AWARD','SPLIT_AWARD'], true), 422, 'Only an approved allocation award can generate Purchase Orders.');
            $rfq = Rfq::query()->lockForUpdate()->findOrFail($locked->rfq_id);
            abort_unless(in_array($rfq->status, [Rfq::AWARDED,Rfq::PARTIALLY_AWARDED], true), 422, 'The RFQ does not have a final approved award state.');

            $orders = []; $created = false;
            foreach ($locked->lines->groupBy('supplier_id')->sortKeys() as $supplierId => $lines) {
                $conversionKey = "award:{$locked->id}:supplier:{$supplierId}";
                if ($existing = PurchaseOrder::where('conversion_key', $conversionKey)->first()) {
                    $orders[] = $existing->load(['items','award']);
                    continue;
                }
                $supplier = Supplier::query()->lockForUpdate()->findOrFail($supplierId);
                $this->assertEligible($supplier);
                $categories = collect(explode(',', (string) $supplier->supply_category))
                    ->map(fn ($category) => mb_strtoupper(trim($category)))->filter();
                foreach ($lines as $line) {
                    abort_unless($categories->contains(mb_strtoupper(trim((string) $line->rfqLine->category))), 422,
                        'The awarded supplier accreditation no longer covers an awarded product category.');
                }
                $quotation = $lines->first()->revision->bidLine->quotation;
                $items = $lines->map(function ($line) use ($locked, $supplier) {
                    $revision = SupplierBidRevision::query()->lockForUpdate()->with('bidLine.quotation')->findOrFail($line->supplier_bid_revision_id);
                    abort_unless($revision->status==='ACTIVE' && $revision->bidLine->status==='AWARDED' && $revision->bidLine->quotation->supplier_id === $supplier->id && $revision->bidLine->rfq_line_id === $line->rfq_line_id, 422, 'The immutable winning bid revision does not match the award allocation.');
                    abort_unless((int)$line->awarded_quantity > 0 && (int)$line->awarded_quantity <= (int)$revision->offered_quantity, 422, 'Award quantity exceeds the immutable winning offer.');
                    abort_unless((string)$line->awarded_unit_price === (string)$revision->unit_price, 422, 'Award price differs from the immutable winning revision.');
                    $request = $line->rfqLine->replenishmentRequest;
                    abort_unless($request && $request->sourcing_method === $request::SOURCING_COMPETITIVE, 422, 'Award line is not linked to a competitive procurement requirement.');
                    abort_if(PurchaseOrder::whereHas('items', fn($query)=>$query->where('supplier_award_line_id',$line->id))->exists(), 409, 'An award allocation has already been consumed.');
                    return ['product_id'=>$line->rfqLine->product_id,'product_name'=>$line->rfqLine->product_name,'unit'=>$line->rfqLine->unit,'item_classification'=>$line->rfqLine->product?->item_classification,'ordered_quantity'=>(int)$line->awarded_quantity,'unit_price'=>$line->awarded_unit_price,'total_price'=>$this->lineTotal((int)$line->awarded_quantity,(string)$line->awarded_unit_price),'supplier_award_line_id'=>$line->id,'price_source'=>'AWARDED_BID','agreement_reference'=>$revision->bidLine->quotation->quotation_number,'replenishment_request_id'=>$request->id];
                });
                $order = PurchaseOrder::create(['po_number'=>$this->nextNumber(),'replenishment_request_id'=>null,'supplier_award_id'=>$locked->id,'conversion_key'=>$conversionKey,'supplier_id'=>$supplier->id,'supplier_name'=>$supplier->name,'delivery_details'=>$rfq->delivery_destination,'expected_delivery_date'=>$rfq->required_delivery_date,'total_amount'=>$items->sum('total_price'),'currency'=>$rfq->currency,'tax_included'=>$quotation->tax_included,'freight_included'=>$quotation->freight_included,'commercial_terms'=>$quotation->commercial_terms,'status'=>PurchaseOrder::STATUS_PENDING_APPROVAL,'created_by'=>$actor->id,'approved_by'=>null]);
                $order->items()->createMany($items->all());
                $created = true;
                foreach ($items->pluck('replenishment_request_id')->unique() as $requestId) DB::table('replenishment_requests')->where('id',$requestId)->update(['status'=>'po_created','updated_at'=>now()]);
                AuditLogger::success('AWARD_PURCHASE_ORDER_GENERATED',AuditLogger::MODULE_PURCHASE_ORDERS,['actor'=>$actor,'resource'=>$order,'resource_label'=>$order->po_number,'metadata'=>['award_id'=>$locked->id,'supplier_id'=>$supplier->id,'conversion_key'=>$conversionKey]]);
                DB::afterCommit(fn()=>WorkflowNotificationSender::send($supplier->authorizedUsers,new WorkflowNotification('Purchase Order Generated',"{$order->po_number} was generated from approved award {$locked->award_number} and is awaiting authorized release.",'info',$order->po_number,'Purchase Orders',['purchase_order_id'=>$order->id,'award_id'=>$locked->id])));
                $orders[] = $order->load(['items','award']);
            }
            return ['orders'=>$orders,'created'=>$created];
        }, 3);
    }

    private function assertEligible(Supplier $supplier): void
    {
        $blockers = app(SupplierAccreditationEligibility::class)->blockersForUpdate($supplier);
        abort_if($blockers !== [], 422, 'The awarded supplier is no longer eligible for PO conversion. '
            .implode(' ', array_column($blockers, 'message')));
    }
    private function nextNumber(): string {$year=now()->format('Y');$last=PurchaseOrder::where('po_number','like',"PO-{$year}-%")->lockForUpdate()->latest('id')->value('po_number');return sprintf('PO-%s-%04d',$year,$last?((int)substr($last,-4))+1:1);}
    private function lineTotal(int $quantity,string $price): string {[$whole,$decimal]=array_pad(explode('.',$price,2),2,'');$cents=(((int)$whole*100)+(int)str_pad($decimal,2,'0'))*$quantity;return intdiv($cents,100).'.'.str_pad((string)($cents%100),2,'0',STR_PAD_LEFT);}
}
