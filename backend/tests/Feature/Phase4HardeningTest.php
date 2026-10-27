<?php

namespace Tests\Feature;

use App\Models\{BidEvaluation,Branch,Product,PurchaseOrder,ReplenishmentRequest,Rfq,Role,Supplier,SupplierApplication,SupplierApplicationAttachment,SupplierBidLine,SupplierBidRevision,SupplierQuotation,User,Warehouse};
use App\Notifications\WorkflowNotification;
use App\Support\WorkflowNotificationSender;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class Phase4HardeningTest extends TestCase
{
    use RefreshDatabase;

    private User $admin; private User $supplierUser; private Supplier $supplier; private Rfq $rfq;

    protected function setUp(): void
    {
        parent::setUp(); $this->travelTo(Carbon::parse('2026-10-22 09:00:00'));
        $this->admin=$this->user('ADMIN');$this->supplier=$this->supplier('SUP-P4','CHEMICALS');$this->supplierUser=$this->user('SUPPLIER',['supplier_id'=>$this->supplier->id]);
        $product=Product::create(['name'=>'Industrial Chemical A','category'=>'CHEMICALS','unit'=>'L']);$branch=Branch::create(['name'=>'Main','code'=>'P4']);$warehouse=Warehouse::create(['name'=>'Main Warehouse','code'=>'P4-WH','branch_id'=>$branch->id]);$manager=$this->user('PLANT_MANAGER',['branch_id'=>$branch->id,'warehouse_id'=>$warehouse->id]);
        $requirement=ReplenishmentRequest::create(['request_no'=>'RR-P4-1','requested_by'=>$manager->id,'warehouse_id'=>$warehouse->id,'product_id'=>$product->id,'requested_qty'=>100,'priority'=>'High','status'=>ReplenishmentRequest::STATUS_APPROVED,'sourcing_method'=>ReplenishmentRequest::SOURCING_COMPETITIVE]);
        $this->rfq=Rfq::create(['rfq_number'=>'RFQ-P4-1','title'=>'Chemicals','status'=>Rfq::OPEN,'opens_at'=>now()->subHour(),'closes_at'=>now()->addHour(),'required_delivery_date'=>now()->addDays(10)->toDateString(),'delivery_destination'=>'Main Warehouse','partial_offers_allowed'=>true,'split_awards_allowed'=>true,'minimum_decrement'=>5,'currency'=>'PHP','show_reference_price'=>true,'show_lowest_bid'=>true,'evaluation_criteria'=>[['name'=>'Price','weight'=>100]],'version'=>1,'created_by'=>$this->admin->id,'approved_by'=>$this->admin->id,'approved_at'=>now()->subDay(),'published_by'=>$this->admin->id,'published_at'=>now()->subHour()]);
        $this->rfq->lines()->create(['replenishment_request_id'=>$requirement->id,'product_id'=>$product->id,'product_name'=>$product->name,'category'=>'CHEMICALS','unit'=>'L','required_quantity'=>100,'public_specification'=>'Industrial grade','reference_unit_price'=>250,'publish_reference_price'=>true]);$this->approveDocuments($this->supplier);
    }

    public function test_reverse_bid_rules_idempotency_and_atomic_price_ordering(): void
    {
        Notification::fake();
        $first=$this->actingAs($this->supplierUser)->postJson('/api/supplier-account/quotations',$this->payload('idem-000000000001',240))->assertCreated();
        $this->actingAs($this->supplierUser)->postJson('/api/supplier-account/quotations',$this->payload('idem-000000000001',240))->assertCreated()->assertJsonPath('data.id',$first->json('data.id'));
        Notification::assertSentToTimes($this->supplierUser,WorkflowNotification::class,2);
        $secondSupplier=$this->supplier('SUP-P4-2','CHEMICALS');$secondUser=$this->user('SUPPLIER',['supplier_id'=>$secondSupplier->id]);$this->approveDocuments($secondSupplier);
        $this->actingAs($secondUser)->postJson('/api/supplier-account/quotations',$this->payload('idem-000000000002',239))->assertStatus(409);
        $this->actingAs($secondUser)->postJson('/api/supplier-account/quotations',$this->payload('idem-000000000003',235))->assertCreated();
        $this->assertSame(2,SupplierQuotation::count());$this->assertSame('235.00',(string)SupplierBidRevision::where('status','ACTIVE')->min('unit_price'));
    }

    public function test_expired_accreditation_and_supplier_isolation_are_enforced(): void
    {
        $this->supplier->update(['accreditation_expires_on'=>now()->subDay()->toDateString()]);
        $this->actingAs($this->supplierUser)->postJson('/api/supplier-account/quotations',$this->payload('idem-000000000004',240))->assertForbidden();
        $this->supplier->update(['accreditation_expires_on'=>now()->addYear()->toDateString()]);$this->supplierUser->unsetRelation('supplier');$this->actingAs($this->supplierUser)->postJson('/api/supplier-account/quotations',$this->payload('idem-000000000005',240))->assertCreated();
        $other=$this->supplier('SUP-P4-3','CHEMICALS');$otherUser=$this->user('SUPPLIER',['supplier_id'=>$other->id]);$this->approveDocuments($other);
        $this->actingAs($otherUser)->getJson('/api/supplier-account/quotations')->assertOk()->assertJsonCount(0,'data');
    }

    public function test_server_deadlines_versions_and_terminal_states_reject_bids(): void
    {
        $this->rfq->update(['status'=>Rfq::SCHEDULED,'opens_at'=>now()->addMinute()]);
        $this->actingAs($this->supplierUser)->postJson('/api/supplier-account/quotations',$this->payload('idem-before-open-01',240))->assertStatus(422);
        $this->rfq->update(['status'=>Rfq::OPEN,'opens_at'=>now()->subHour(),'closes_at'=>now()]);
        $this->actingAs($this->supplierUser)->postJson('/api/supplier-account/quotations',$this->payload('idem-at-close-0001',240))->assertStatus(422);
        $this->rfq->update(['closes_at'=>now()->subSecond()]);
        $this->actingAs($this->supplierUser)->postJson('/api/supplier-account/quotations',$this->payload('idem-after-close1',240))->assertStatus(422);
        $this->rfq->update(['closes_at'=>now()->addHour(),'version'=>2]);
        $this->actingAs($this->supplierUser)->postJson('/api/supplier-account/quotations',$this->payload('idem-stale-version',240))->assertStatus(409);
        $this->rfq->update(['status'=>Rfq::CANCELLED,'version'=>1]);
        $this->actingAs($this->supplierUser)->postJson('/api/supplier-account/quotations',$this->payload('idem-cancelled-001',240))->assertStatus(422);
        $this->assertDatabaseCount('supplier_quotations',0);$this->assertDatabaseCount('supplier_bid_revisions',0);
    }

    public function test_three_line_quotation_is_atomic_and_corrected_retry_succeeds(): void
    {
        Notification::fake();$base=$this->rfq->lines()->firstOrFail();$manager=User::whereHas('role',fn($q)=>$q->where('slug','PLANT_MANAGER'))->firstOrFail();
        foreach([2,3]as$i){$product=Product::create(['name'=>"Industrial Chemical {$i}",'category'=>'CHEMICALS','unit'=>'L']);$request=ReplenishmentRequest::create(['request_no'=>"RR-P4-{$i}",'requested_by'=>$manager->id,'warehouse_id'=>$manager->warehouse_id,'product_id'=>$product->id,'requested_qty'=>100,'priority'=>'High','status'=>ReplenishmentRequest::STATUS_APPROVED,'sourcing_method'=>ReplenishmentRequest::SOURCING_COMPETITIVE]);$this->rfq->lines()->create(['replenishment_request_id'=>$request->id,'product_id'=>$product->id,'product_name'=>$product->name,'category'=>'CHEMICALS','unit'=>'L','required_quantity'=>100,'public_specification'=>'Industrial grade','reference_unit_price'=>250,'publish_reference_price'=>true]);}
        $payload=$this->payload('idem-three-lines01',240);$payload['lines']=$this->rfq->lines->map(fn($line)=>['rfq_line_id'=>$line->id,'unit'=>'L','unit_price'=>'240','offered_quantity'=>100,'lead_time_days'=>3,'delivery_available_on'=>now()->addDays(5)->toDateString(),'remarks'=>'Compliant offer'])->all();$payload['lines'][2]['unit']='KG';
        $this->actingAs($this->supplierUser)->postJson('/api/supplier-account/quotations',$payload)->assertStatus(422);
        $this->assertDatabaseCount('supplier_quotations',0);$this->assertDatabaseCount('supplier_bid_lines',0);$this->assertDatabaseCount('supplier_bid_revisions',0);Notification::assertNothingSent();
        $payload['lines'][2]['unit']='L';$this->actingAs($this->supplierUser)->postJson('/api/supplier-account/quotations',$payload)->assertCreated();
        $this->assertDatabaseCount('supplier_quotations',1);$this->assertDatabaseCount('supplier_bid_lines',3);$this->assertDatabaseCount('supplier_bid_revisions',3);
    }

    public function test_revisions_are_immutable_scoped_closed_and_idempotent(): void
    {
        Notification::fake();$quote=$this->submit();$bid=$quote->lines()->firstOrFail();$original=$bid->activeRevision()->firstOrFail();$payload=$this->revisionPayload('revision-idem-0001','235');
        $this->actingAs($this->supplierUser)->postJson("/api/supplier-account/bid-lines/{$bid->id}/revisions",$payload)->assertOk();
        $this->actingAs($this->supplierUser)->postJson("/api/supplier-account/bid-lines/{$bid->id}/revisions",$payload)->assertOk();
        $this->assertDatabaseCount('supplier_bid_revisions',2);$this->assertDatabaseHas('supplier_bid_revisions',['id'=>$original->id,'unit_price'=>'240.00','status'=>'SUPERSEDED']);Notification::assertSentToTimes($this->supplierUser,WorkflowNotification::class,4);
        $conflict=$payload;$conflict['unit_price']='230';$this->actingAs($this->supplierUser)->postJson("/api/supplier-account/bid-lines/{$bid->id}/revisions",$conflict)->assertStatus(409);$this->assertDatabaseCount('supplier_bid_revisions',2);
        $other=$this->supplier('SUP-P4-REV','CHEMICALS');$otherUser=$this->user('SUPPLIER',['supplier_id'=>$other->id]);$this->approveDocuments($other);$this->actingAs($otherUser)->postJson("/api/supplier-account/bid-lines/{$bid->id}/revisions",$this->revisionPayload('revision-other-0001','230'))->assertNotFound();
        $this->closeRfq();$this->actingAs($this->supplierUser)->postJson("/api/supplier-account/bid-lines/{$bid->id}/revisions",$this->revisionPayload('revision-closed-001','230'))->assertStatus(422);$this->assertDatabaseCount('supplier_bid_revisions',2);
    }

    public function test_unapproved_documents_and_category_restrictions_block_bidding(): void
    {
        $this->supplier->approvedApplication()->update(['status'=>SupplierApplication::STATUS_UNDER_REVIEW]);
        $this->actingAs($this->supplierUser)->postJson('/api/supplier-account/quotations',$this->payload('idem-unapproved-001',240))->assertForbidden();
        SupplierApplication::where('approved_supplier_id',$this->supplier->id)->update(['status'=>SupplierApplication::STATUS_APPROVED]);
        $this->supplier->update(['supply_category'=>'PACKAGING']);
        $this->actingAs($this->supplierUser)->postJson('/api/supplier-account/quotations',$this->payload('idem-category-0001',240))->assertForbidden();
        $this->assertDatabaseCount('supplier_quotations',0);
    }

    public function test_weighted_evaluation_uses_approved_criteria_and_new_supplier_is_not_zero_rated(): void
    {
        $quote=$this->submit();$this->closeRfq();$bid=$quote->lines()->firstOrFail();
        $comparison=$this->actingAs($this->admin)->getJson("/api/admin/procurement/rfqs/{$this->rfq->id}/bids")->assertOk();
        $comparison->assertJsonPath('data.bids.0.performance.status','NOT_YET_RATED')->assertJsonPath('data.bids.0.performance.overall_score',null);
        $this->actingAs($this->admin)->putJson("/api/admin/procurement/bid-lines/{$bid->id}/evaluation",['mandatory_results'=>['technical'=>true],'criterion_scores'=>['Price'=>87.5],'qualification_reason'=>'Mandatory requirements verified.'])->assertOk()->assertJsonPath('data.weighted_score','87.5000');
    }

    public function test_numeric_legacy_criterion_key_is_compatible_without_rewriting_approved_policy(): void
    {
        $this->rfq->update(['evaluation_criteria'=>[['name'=>'500','weight'=>100]]]);
        $approved=$this->rfq->fresh()->evaluation_criteria;
        $quote=$this->submit();$this->closeRfq();$bid=$quote->lines()->firstOrFail();
        $payload=['mandatory_results'=>['manual_0'=>'PASSED','manual_1'=>'PASSED'],'criterion_scores'=>['500'=>82.5],'finding_codes'=>['MANDATORY_QUALIFIED','SPECIFICATION_COMPLIANT'],'qualification_comments'=>'Historical criterion meaning was verified against the approved RFQ record.'];
        $this->actingAs($this->admin)->putJson("/api/admin/procurement/bid-lines/{$bid->id}/evaluation",$payload)->assertOk()->assertJsonPath('data.weighted_score','82.5000');
        $this->actingAs($this->admin)->getJson("/api/admin/procurement/rfqs/{$this->rfq->id}/bids")->assertOk()
            ->assertJsonPath('data.bids.0.evaluation.finding_codes.0','MANDATORY_QUALIFIED')
            ->assertJsonPath('data.bids.0.evaluation.qualification_reason',fn($value)=>str_contains($value,'Historical criterion meaning was verified'));
        $this->assertSame($approved,$this->rfq->fresh()->evaluation_criteria);
        $this->assertSame('82.5',(string)BidEvaluation::firstOrFail()->criterion_scores[500]);
    }

    public function test_structured_evaluation_rejects_invalid_scores_and_contradictory_findings(): void
    {
        $quote=$this->submit();$this->closeRfq();$bid=$quote->lines()->firstOrFail();
        $base=['mandatory_results'=>['manual_0'=>'PASSED','manual_1'=>'PASSED'],'criterion_scores'=>['Price'=>101],'finding_codes'=>['MANDATORY_QUALIFIED']];
        $this->actingAs($this->admin)->putJson("/api/admin/procurement/bid-lines/{$bid->id}/evaluation",$base)->assertUnprocessable();
        $base['criterion_scores']['Price']=85;$base['finding_codes']=['MANDATORY_QUALIFIED','VERIFICATION_REQUIRED'];
        $this->actingAs($this->admin)->putJson("/api/admin/procurement/bid-lines/{$bid->id}/evaluation",$base)->assertUnprocessable();
        $base['mandatory_results']['manual_0']='FAILED';$base['finding_codes']=['SPECIFICATION_COMPLIANT'];
        $this->actingAs($this->admin)->putJson("/api/admin/procurement/bid-lines/{$bid->id}/evaluation",$base)->assertUnprocessable();
        $this->assertDatabaseCount('bid_evaluations',0);
    }

    public function test_manual_checklist_cannot_override_failed_server_accreditation(): void
    {
        $quote=$this->submit();$this->closeRfq();$bid=$quote->lines()->firstOrFail();
        $this->supplier->update(['accreditation_expires_on'=>now()->subDay()->toDateString()]);
        $response=$this->actingAs($this->admin)->putJson("/api/admin/procurement/bid-lines/{$bid->id}/evaluation",['mandatory_results'=>['manual_0'=>'PASSED','manual_1'=>'PASSED','system_accreditation'=>'PASSED'],'criterion_scores'=>['Price'=>90],'finding_codes'=>['MANDATORY_FAILED'],'qualification_comments'=>'Accreditation expired before evaluation.'])->assertOk();
        $response->assertJsonPath('data.mandatory_passed',false)->assertJsonPath('data.mandatory_results.system_accreditation','FAILED');
        $this->assertSame('DISQUALIFIED',$bid->fresh()->status);
    }

    public function test_admin_can_monitor_open_bids_with_revision_history_while_supplier_is_denied(): void
    {
        $quote = $this->submit();
        $bid = $quote->lines()->firstOrFail();
        $this->actingAs($this->supplierUser)->postJson(
            "/api/supplier-account/bid-lines/{$bid->id}/revisions",
            $this->revisionPayload('monitor-revision-01', '235')
        )->assertOk();

        $this->app['auth']->forgetGuards();
        $this->getJson("/api/admin/procurement/rfqs/{$this->rfq->id}/bids")
            ->assertUnauthorized();

        $response = $this->actingAs($this->admin)
            ->getJson("/api/admin/procurement/rfqs/{$this->rfq->id}/bids")
            ->assertOk();

        $response->assertJsonPath('data.effective_status', Rfq::OPEN)
            ->assertJsonPath('data.supplier_count', 1)
            ->assertJsonPath('data.quotation_count', 1)
            ->assertJsonPath('data.active_revision_count', 1)
            ->assertJsonPath('data.bids.0.active_revision.revision_number', 2)
            ->assertJsonPath('data.bids.0.active_revision.total_offered_amount', '23500.00')
            ->assertJsonPath('data.bids.0.revision_count', 2)
            ->assertJsonCount(2, 'data.bids.0.revisions');

        $this->actingAs($this->supplierUser)
            ->getJson("/api/admin/procurement/rfqs/{$this->rfq->id}/bids")
            ->assertForbidden();
    }

    public function test_mandatory_disqualification_is_preserved_and_cannot_be_awarded(): void
    {
        $quote=$this->submit();$this->closeRfq();$bid=$quote->lines()->firstOrFail();$this->actingAs($this->admin)->putJson("/api/admin/procurement/bid-lines/{$bid->id}/evaluation",['mandatory_results'=>['technical'=>false],'criterion_scores'=>['Price'=>100],'qualification_reason'=>'Mandatory technical requirement failed.'])->assertOk()->assertJsonPath('data.mandatory_passed',false)->assertJsonPath('data.weighted_score',null);$this->assertSame('DISQUALIFIED',$bid->fresh()->status);$this->actingAs($this->admin)->postJson("/api/admin/procurement/rfqs/{$this->rfq->id}/award",$this->awardPayload($bid,'award-disqualified1'))->assertStatus(422);$this->assertDatabaseCount('supplier_awards',0);$this->assertDatabaseHas('bid_evaluations',['supplier_bid_line_id'=>$bid->id,'mandatory_passed'=>false]);
    }

    public function test_higher_price_award_requires_and_preserves_override_justification(): void
    {
        $first=$this->submit();$secondSupplier=$this->supplier('SUP-P4-HIGH','CHEMICALS');$secondUser=$this->user('SUPPLIER',['supplier_id'=>$secondSupplier->id]);$this->approveDocuments($secondSupplier);$this->actingAs($secondUser)->postJson('/api/supplier-account/quotations',$this->payload('idem-higher-low-01',235))->assertCreated();$this->closeRfq();
        foreach(SupplierBidLine::with('activeRevision')->get()as$bid){BidEvaluation::create(['supplier_bid_line_id'=>$bid->id,'supplier_bid_revision_id'=>$bid->activeRevision->id,'mandatory_passed'=>true,'mandatory_results'=>['technical'=>true],'criterion_scores'=>['Price'=>100],'weighted_score'=>100,'qualification_reason'=>'Qualified','evaluated_by'=>$this->admin->id,'evaluated_at'=>now()]);$bid->update(['status'=>'QUALIFIED']);}
        $higher=$first->lines()->firstOrFail();$payload=$this->awardPayload($higher,'award-higher-no-01');$this->actingAs($this->admin)->postJson("/api/admin/procurement/rfqs/{$this->rfq->id}/award",$payload)->assertStatus(422);$this->assertDatabaseCount('supplier_awards',0);$payload['idempotency_key']='award-higher-yes1';$payload['lines'][0]['override_reason']='Authorized delivery reliability advantage.';$this->actingAs($this->admin)->postJson("/api/admin/procurement/rfqs/{$this->rfq->id}/award",$payload)->assertCreated();$this->assertDatabaseHas('supplier_award_lines',['supplier_bid_revision_id'=>$higher->activeRevision()->firstOrFail()->id,'awarded_unit_price'=>'240.00']);$snapshot=\App\Models\SupplierAwardLine::firstOrFail()->evaluation_snapshot;$this->assertSame('Authorized delivery reliability advantage.',$snapshot['override_reason']);
    }

    public function test_suspended_supplier_and_expired_documents_are_rejected_at_final_award(): void
    {
        [$quote,$bid]=$this->qualifiedBid();$this->supplier->update(['status'=>Supplier::STATUS_ON_HOLD]);
        $this->actingAs($this->admin)->postJson("/api/admin/procurement/rfqs/{$this->rfq->id}/award",$this->awardPayload($bid))->assertStatus(422);
        $this->assertDatabaseHas('audit_logs',['action'=>'RFQ_AWARD_APPROVAL_REJECTED','status'=>'FAILED','resource_id'=>(string)$this->rfq->id]);
        $this->supplier->update(['status'=>Supplier::STATUS_ACTIVE]);$this->supplier->approvedApplication->attachments()->where('attachment_type',SupplierApplicationAttachment::TYPE_BUSINESS_PERMIT)->update(['expires_on'=>now()->subDay()]);
        $this->actingAs($this->admin)->postJson("/api/admin/procurement/rfqs/{$this->rfq->id}/award",$this->awardPayload($bid,'award-idempotency-02'))->assertStatus(422);
    }

    public function test_no_award_is_persisted_without_lines_or_purchase_orders(): void
    {
        $this->assertDecisionWithoutAward('NO_AWARD','decision-no-award-001');
    }

    public function test_rebid_is_persisted_without_lines_or_purchase_orders(): void
    {
        Notification::fake();$this->assertDecisionWithoutAward('REBID','decision-rebid-00001');Notification::assertSentTo($this->supplierUser,WorkflowNotification::class,fn(WorkflowNotification $notification)=>$notification->title==='RFQ Rebid Decision'&&$notification->metadata['decision']==='REBID');
    }

    public function test_unauthorized_award_attempt_is_denied_and_durably_audited(): void
    {
        $quote=$this->submit();$this->closeRfq();$bid=$quote->lines()->firstOrFail();$this->actingAs($this->supplierUser)->postJson("/api/admin/procurement/rfqs/{$this->rfq->id}/award",$this->awardPayload($bid,'award-unauthorized1'))->assertForbidden();$this->assertDatabaseCount('supplier_awards',0);$this->assertDatabaseHas('audit_logs',['action'=>'RFQ_AWARD_APPROVAL_REJECTED','status'=>'FAILED','actor_user_id'=>$this->supplierUser->id,'resource_id'=>(string)$this->rfq->id]);
    }

    public function test_expired_rfq_closure_command_is_rerunnable_without_duplicate_events(): void
    {
        Notification::fake();$this->submit();$this->rfq->update(['closes_at'=>now()->subSecond(),'status'=>Rfq::OPEN]);Artisan::call('rfqs:close-expired');Artisan::call('rfqs:close-expired');$this->assertSame(Rfq::CLOSED,$this->rfq->fresh()->status);$this->assertCount(2,Notification::sent($this->supplierUser,WorkflowNotification::class)->filter(fn(WorkflowNotification $notification)=>$notification->title==='RFQ Bidding Closed'));
    }

    public function test_full_partial_split_quantity_conservation_and_no_unauthorized_po(): void
    {
        [$quote,$bid]=$this->qualifiedBid();$before=PurchaseOrder::count();
        $bad=$this->awardPayload($bid);$bad['lines'][0]['awarded_quantity']=101;$this->actingAs($this->admin)->postJson("/api/admin/procurement/rfqs/{$this->rfq->id}/award",$bad)->assertStatus(422);
        $good=$this->awardPayload($bid,'award-idempotency-03');$this->actingAs($this->admin)->postJson("/api/admin/procurement/rfqs/{$this->rfq->id}/award",$good)->assertCreated();
        $this->actingAs($this->admin)->postJson("/api/admin/procurement/rfqs/{$this->rfq->id}/award",$good)->assertCreated();
        $this->assertSame($before,PurchaseOrder::count());$this->assertDatabaseCount('supplier_awards',1);$this->assertDatabaseHas('supplier_award_lines',['awarded_quantity'=>100]);
    }

    public function test_partial_award_preserves_remaining_quantity_and_rejects_overlapping_approval(): void
    {
        [$quote,$bid]=$this->qualifiedBid();$payload=$this->awardPayload($bid,'award-partial-0001');$payload['outcome']='PARTIAL_AWARD';$payload['lines'][0]['awarded_quantity']=60;
        $this->actingAs($this->admin)->postJson("/api/admin/procurement/rfqs/{$this->rfq->id}/award",$payload)->assertCreated();
        $payload['idempotency_key']='award-overlap-0002';$this->actingAs($this->admin)->postJson("/api/admin/procurement/rfqs/{$this->rfq->id}/award",$payload)->assertStatus(409);
        $this->assertDatabaseHas('supplier_award_lines',['awarded_quantity'=>60]);$this->assertSame(Rfq::PARTIALLY_AWARDED,$this->rfq->fresh()->status);
    }

    public function test_split_award_respects_each_supplier_capacity(): void
    {
        $first=$this->submit();$secondSupplier=$this->supplier('SUP-P4-SPLIT','CHEMICALS');$secondUser=$this->user('SUPPLIER',['supplier_id'=>$secondSupplier->id]);$this->approveDocuments($secondSupplier);
        $this->actingAs($secondUser)->postJson('/api/supplier-account/quotations',$this->payload('idem-split-0000001',235))->assertCreated();$this->closeRfq();
        $bids=SupplierBidLine::with('activeRevision')->get();foreach($bids as $bid){BidEvaluation::create(['supplier_bid_line_id'=>$bid->id,'supplier_bid_revision_id'=>$bid->activeRevision->id,'mandatory_passed'=>true,'mandatory_results'=>['technical'=>true],'criterion_scores'=>['Price'=>100],'weighted_score'=>100,'qualification_reason'=>'Qualified','evaluated_by'=>$this->admin->id,'evaluated_at'=>now()]);$bid->update(['status'=>'QUALIFIED']);}
        $payload=['idempotency_key'=>'award-split-000001','outcome'=>'SPLIT_AWARD','justification'=>'Combined qualified capacity is selected.','lines'=>$bids->map(fn($bid)=>['rfq_line_id'=>$bid->rfq_line_id,'supplier_bid_revision_id'=>$bid->activeRevision->id,'awarded_quantity'=>50,'override_reason'=>$bid->activeRevision->unit_price==='240.00'?'Higher evaluated delivery confidence.':null])->all()];
        $this->actingAs($this->admin)->postJson("/api/admin/procurement/rfqs/{$this->rfq->id}/award",$payload)->assertCreated();$this->assertSame(100,(int)\App\Models\SupplierAwardLine::sum('awarded_quantity'));$this->assertDatabaseCount('supplier_award_lines',2);
    }

    public function test_supplier_results_are_scoped_and_include_award_totals(): void
    {
        [$quote,$bid]=$this->qualifiedBid();$this->actingAs($this->admin)->postJson("/api/admin/procurement/rfqs/{$this->rfq->id}/award",$this->awardPayload($bid,'award-idempotency-04'))->assertCreated();
        $this->actingAs($this->supplierUser)->getJson('/api/supplier-account/quotations')->assertOk()->assertJsonPath('data.0.result.award_reference',fn($value)=>str_starts_with($value,'AWD-'))->assertJsonPath('data.0.result.currency','PHP')->assertJsonPath('data.0.result.delivery_terms','Net 30')->assertJsonPath('data.0.result.lines.0.offered_quantity',100)->assertJsonPath('data.0.result.lines.0.awarded_quantity',100)->assertJsonPath('data.0.result.lines.0.unawarded_quantity',0)->assertJsonPath('data.0.result.lines.0.line_total','24000.00')->assertJsonMissingPath('data.0.result.lines.0.supplier_id');
    }

    public function test_final_award_rejects_an_active_revision_that_was_not_evaluated(): void
    {
        [$quote,$bid]=$this->qualifiedBid();$evaluated=$bid->activeRevision()->firstOrFail();
        $evaluated->update(['status'=>'SUPERSEDED']);
        $replacement=$bid->revisions()->create(['previous_revision_id'=>$evaluated->id,'revision_number'=>2,'rfq_version'=>$this->rfq->version,'unit_price'=>'235.00','offered_quantity'=>100,'lead_time_days'=>3,'delivery_available_on'=>now()->addDays(5)->toDateString(),'remarks'=>'Revised before close','status'=>'ACTIVE','submitted_by'=>$this->supplierUser->id,'submitted_at'=>now()]);
        $bid->update(['current_revision_number'=>2]);$payload=$this->awardPayload($bid,'award-stale-eval-01');$payload['lines'][0]['supplier_bid_revision_id']=$replacement->id;
        $this->actingAs($this->admin)->postJson("/api/admin/procurement/rfqs/{$this->rfq->id}/award",$payload)->assertStatus(422);
        $this->assertDatabaseCount('supplier_awards',0);
    }

    public function test_notification_transport_failure_does_not_rollback_business_transaction(): void
    {
        Notification::shouldReceive('send')->andThrow(new \RuntimeException('mail transport unavailable'));
        $this->actingAs($this->supplierUser)->postJson('/api/supplier-account/quotations',$this->payload('idem-000000000006',240))->assertCreated();
        $this->assertDatabaseCount('supplier_quotations',1);
    }

    private function user(string $slug,array $attributes=[]):User{$role=Role::firstOrCreate(['slug'=>$slug],['name'=>str_replace('_',' ',$slug)]);return User::factory()->create([...$attributes,'role_id'=>$role->id,'status'=>'ACTIVE']);}
    private function supplier(string $code,string $category):Supplier{return Supplier::create(['supplier_code'=>$code,'name'=>$code,'contact_person'=>'Contact','email'=>strtolower($code).'@example.test','phone'=>'09170000000','address'=>'Manila','business_type'=>'Corporation','supply_category'=>$category,'status'=>Supplier::STATUS_ACTIVE,'accreditation_status'=>'ACTIVE','accredited_at'=>now()->subDay(),'accreditation_expires_on'=>now()->addYear()]);}
    private function approveDocuments(Supplier $supplier):void{$application=SupplierApplication::create(['application_number'=>'APP-'.$supplier->supplier_code,'company_name'=>$supplier->name,'owner_name'=>'Owner','normalized_company_name'=>strtolower($supplier->name),'address'=>'Manila','contact_person'=>'Contact','email'=>$supplier->email,'normalized_email'=>$supplier->email,'phone'=>'09170000000','business_type'=>'Corporation','supply_category'=>$supplier->supply_category,'products_services'=>'Chemicals','status'=>SupplierApplication::STATUS_APPROVED,'submitted_at'=>now()->subMonth(),'approved_supplier_id'=>$supplier->id]);foreach([SupplierApplicationAttachment::TYPE_BUSINESS_CERTIFICATE,SupplierApplicationAttachment::TYPE_BUSINESS_PERMIT]as$type)$application->attachments()->create(['attachment_type'=>$type,'original_name'=>$type.'.pdf','stored_path'=>'tests/'.$supplier->id.'/'.$type.'.pdf','mime_type'=>'application/pdf','file_size'=>100,'is_current'=>true,'verification_status'=>SupplierApplicationAttachment::STATUS_VERIFIED,'verified_at'=>now(),'expires_on'=>now()->addYear()]);}
    private function payload(string $key,int $price):array{$line=$this->rfq->lines()->firstOrFail();return['rfq_id'=>$this->rfq->id,'rfq_version'=>1,'idempotency_key'=>$key,'tax_included'=>true,'freight_included'=>true,'commercial_terms'=>'Net 30','lines'=>[['rfq_line_id'=>$line->id,'unit'=>'L','unit_price'=>(string)$price,'offered_quantity'=>100,'lead_time_days'=>3,'delivery_available_on'=>now()->addDays(5)->toDateString(),'remarks'=>'Compliant offer']]];}
    private function submit():SupplierQuotation{$this->actingAs($this->supplierUser)->postJson('/api/supplier-account/quotations',$this->payload('idem-000000000007',240))->assertCreated();return SupplierQuotation::firstOrFail();}
    private function closeRfq():void{$this->rfq->update(['status'=>Rfq::CLOSED,'closes_at'=>now()->subMinute()]);$this->rfq->refresh();}
    private function qualifiedBid():array{$quote=$this->submit();$this->closeRfq();$bid=$quote->lines()->firstOrFail();$revision=$bid->activeRevision()->firstOrFail();BidEvaluation::create(['supplier_bid_line_id'=>$bid->id,'supplier_bid_revision_id'=>$revision->id,'mandatory_passed'=>true,'mandatory_results'=>['technical'=>true],'criterion_scores'=>['Price'=>100],'weighted_score'=>100,'qualification_reason'=>'Qualified','evaluated_by'=>$this->admin->id,'evaluated_at'=>now()]);$bid->update(['status'=>'QUALIFIED']);return[$quote,$bid];}
    private function awardPayload(SupplierBidLine $bid,string $key='award-idempotency-01'):array{return['idempotency_key'=>$key,'outcome'=>'FULL_AWARD','justification'=>'Best evaluated compliant offer.','lines'=>[['rfq_line_id'=>$bid->rfq_line_id,'supplier_bid_revision_id'=>$bid->activeRevision()->firstOrFail()->id,'awarded_quantity'=>100,'override_reason'=>null]]];}
    private function revisionPayload(string $key,string $price):array{return['idempotency_key'=>$key,'rfq_version'=>$this->rfq->version,'unit'=>'L','unit_price'=>$price,'offered_quantity'=>100,'lead_time_days'=>3,'delivery_available_on'=>now()->addDays(5)->toDateString(),'remarks'=>'Supplier price revision'];}
    private function assertDecisionWithoutAward(string $outcome,string $key):void{$this->submit();$this->closeRfq();$before=PurchaseOrder::count();$response=$this->actingAs($this->admin)->postJson("/api/admin/procurement/rfqs/{$this->rfq->id}/award",['idempotency_key'=>$key,'outcome'=>$outcome,'justification'=>'No compliant award can be authorized at this time.','lines'=>[]])->assertCreated();$this->assertDatabaseHas('supplier_awards',['id'=>$response->json('data.id'),'outcome'=>$outcome]);$this->assertDatabaseCount('supplier_award_lines',0);$this->assertSame($before,PurchaseOrder::count());$this->assertSame(Rfq::NO_AWARD,$this->rfq->fresh()->status);}
}
