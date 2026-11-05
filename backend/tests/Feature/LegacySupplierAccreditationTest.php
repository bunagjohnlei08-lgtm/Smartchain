<?php
namespace Tests\Feature;

use App\Models\{Branch, Product, ReplenishmentRequest, Rfq, Role, Supplier, SupplierAccreditationDocument as Document, SupplierAccreditationRequest as Accreditation, SupplierApplication, SupplierApplicationAttachment, User, Warehouse};
use App\Services\SupplierAccreditationEligibility;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Mail, Notification, Storage};
use Tests\TestCase;

class LegacySupplierAccreditationTest extends TestCase
{
    use RefreshDatabase;
    private User $admin; private User $user; private Supplier $supplier;
    protected function setUp(): void
    {
        parent::setUp();Storage::fake('local');Mail::fake();Notification::fake();
        $this->admin=$this->actor('ADMIN');
        $this->supplier=Supplier::create(['supplier_code'=>'SUP-LEGACY','name'=>'Legacy supplier','email'=>'legacy@example.test','status'=>'ACTIVE','accreditation_status'=>'INACTIVE']);
        $this->user=$this->actor('SUPPLIER',['supplier_id'=>$this->supplier->id]);
        Product::create(['name'=>'Catalog tools','category'=>'TOOLS','unit'=>'PCS']);
    }
    private function actor(string $slug,array $extra=[]): User
    {
        $role=Role::firstOrCreate(['slug'=>$slug],['name'=>$slug]);
        return User::factory()->create(['role_id'=>$role->id,'status'=>'ACTIVE',...$extra]);
    }
    private function submit(string $type='COMPLETION'): Accreditation
    {
        $id=$this->actingAs($this->user)->post('/api/supplier-account/accreditation-requests',[
            'request_type'=>$type,'reason'=>'Please review legitimate business evidence.','requested_categories'=>['TOOLS'],
            'business_certificate'=>UploadedFile::fake()->create('certificate.pdf',20,'application/pdf'),
            'business_permit'=>UploadedFile::fake()->create('permit.pdf',20,'application/pdf'),
        ],['Accept'=>'application/json'])->assertCreated()->json('data.id');
        return Accreditation::findOrFail($id);
    }
    private function verify(Accreditation $row): void
    {
        foreach($row->documents as $document) {
            $this->actingAs($this->user)->patchJson("/api/admin/accreditation-documents/{$document->id}/verification",[
                'verification_status'=>'VERIFIED','expires_on'=>today()->addYear()->toDateString(),'document_updated_at'=>$document->updated_at->toISOString(),
            ])->assertForbidden();
            $this->actingAs($this->admin)->patchJson("/api/admin/accreditation-documents/{$document->id}/verification",[
                'verification_status'=>'VERIFIED','expires_on'=>today()->addYear()->toDateString(),'document_updated_at'=>$document->updated_at->toISOString(),
            ])->assertOk();
        }
    }
    private function decision(Accreditation $row,string $decision='APPROVED')
    {
        return $this->actingAs($this->admin)->postJson("/api/admin/accreditation-requests/{$row->id}/decision",[
            'decision'=>$decision,'reason'=>'Business evidence reviewed by Admin.','lock_version'=>$row->fresh()->lock_version,
        ]);
    }
    private function eligible(): bool {return app(SupplierAccreditationEligibility::class)->eligible($this->supplier->fresh());}
    private function complete(): Accreditation
    {
        $row=$this->submit();$this->verify($row);$this->decision($row)->assertOk();$this->user->unsetRelation('supplier');return$row;
    }
    public function test_completion_requires_verification_and_approval_without_creating_application_or_supplier(): void
    {
        $this->assertFalse($this->eligible());$row=$this->submit();
        $this->decision($row)->assertUnprocessable();$this->assertFalse($this->eligible());
        $this->verify($row);$this->assertFalse($this->eligible());
        $this->actingAs($this->user)->postJson("/api/admin/accreditation-requests/{$row->id}/decision",['decision'=>'APPROVED','reason'=>'Supplier cannot approve.','lock_version'=>1])->assertForbidden();
        $this->decision($row)->assertOk();$this->user->unsetRelation('supplier');$this->assertTrue($this->eligible());
        $this->assertSame('TOOLS',$this->supplier->fresh()->supply_category);
        $this->assertDatabaseCount('supplier_applications',0);$this->assertDatabaseCount('suppliers',1);
        $this->actingAs($this->user)->getJson('/api/supplier-account/profile')->assertOk()
            ->assertJsonPath('data.supplier.bidding_eligibility.eligible',true)
            ->assertJsonPath('data.supplier.required_documents.0.status','VERIFIED');
    }
    public function test_rejected_and_pending_requests_never_grant_eligibility(): void
    {
        $row=$this->submit();$this->verify($row);
        $this->supplier->update(['accreditation_status'=>'ACTIVE','accreditation_expires_on'=>today()->addYear(),'supply_category'=>'TOOLS']);
        $this->assertFalse($this->eligible());$this->decision($row,'REJECTED')->assertOk();$this->assertFalse($this->eligible());
    }
    public function test_expired_documents_accreditation_future_validity_and_missing_categories_block(): void
    {
        $row=$this->complete();$doc=$row->documents()->first();$this->assertTrue($this->eligible());
        $doc->update(['expires_on'=>today()->subDay()]);$this->assertFalse($this->eligible());
        $this->actingAs($this->user)->getJson('/api/supplier-account/profile')->assertOk()->assertJsonPath('data.supplier.required_documents.0.status','EXPIRED');
        $doc->update(['expires_on'=>today()->addYear(),'valid_from'=>today()->addDay()]);$this->assertFalse($this->eligible());
        $doc->update(['valid_from'=>null]);$this->supplier->update(['accreditation_expires_on'=>today()->subDay()]);$this->assertFalse($this->eligible());
        $this->supplier->update(['accreditation_expires_on'=>today()->addYear(),'supply_category'=>'']);$this->assertFalse($this->eligible());
        $this->supplier->update(['supply_category'=>'TOOLS','status'=>'INACTIVE']);$this->assertFalse($this->eligible());
        $this->user->unsetRelation('supplier');$this->actingAs($this->user)->getJson('/api/supplier-account/profile')->assertForbidden();
    }
    public function test_renewals_replace_expired_evidence_and_profile_uses_the_effective_documents(): void
    {
        $old=$this->complete();$old->documents()->update(['expires_on'=>today()->subDay()]);
        $renewal=$this->submit('RENEWAL');$this->verify($renewal);$this->assertFalse($this->eligible());
        $this->decision($renewal)->assertOk();$this->assertTrue($this->eligible());
        $this->actingAs($this->user)->getJson('/api/supplier-account/profile')->assertOk()
            ->assertJsonPath('data.supplier.required_documents.0.expires_on',today()->addYear()->toDateString());
    }
    public function test_incomplete_revised_and_future_dated_documents_cannot_be_approved(): void
    {
        $row=$this->submit();$this->verify($row);
        $permit=$row->documents()->where('document_type','BUSINESS_PERMIT')->firstOrFail();
        $permit->update(['verification_status'=>Document::CORRECTION_REQUIRED]);
        $this->decision($row)->assertUnprocessable();$this->assertFalse($this->eligible());
        $permit->update(['verification_status'=>Document::VERIFIED,'valid_from'=>today()->addDay()]);
        $this->decision($row)->assertUnprocessable();
        $permit->update(['valid_from'=>null,'expires_on'=>today()->subDay()]);
        $this->decision($row)->assertUnprocessable();
        $permit->delete();$this->decision($row)->assertUnprocessable();
        $this->assertSame(Accreditation::PENDING,$row->fresh()->status);
    }
    public function test_approved_category_request_does_not_replace_explicit_accreditation_completion(): void
    {
        $row=$this->submit('CATEGORY_EXPANSION');$this->verify($row);$this->decision($row)->assertOk();
        $this->supplier->update(['accreditation_status'=>'ACTIVE','accreditation_expires_on'=>today()->addYear()]);
        $this->assertFalse($this->eligible());
        $this->assertContains('ACCREDITATION_EVIDENCE_REQUIRED',array_column(app(SupplierAccreditationEligibility::class)->blockers($this->supplier->fresh()),'code'));
    }
    public function test_completion_cannot_grant_unknown_catalog_categories(): void
    {
        $row=$this->submit();$this->verify($row);Product::where('category','TOOLS')->delete();
        $this->decision($row)->assertUnprocessable();$this->assertFalse($this->eligible());
        $this->assertSame(Accreditation::PENDING,$row->fresh()->status);
    }

    private function application(string $status): SupplierApplication
    {
        return SupplierApplication::create(['application_number'=>'APP-LEGACY','company_name'=>'Legacy supplier','owner_name'=>'Owner','normalized_company_name'=>'legacy supplier','address'=>'Manila','contact_person'=>'Contact','email'=>$this->supplier->email,'normalized_email'=>$this->supplier->email,'phone'=>'09170000000','business_type'=>'Corporation','supply_category'=>'TOOLS','products_services'=>'Tools','status'=>$status,'submitted_at'=>now(),'approved_supplier_id'=>$this->supplier->id]);
    }
    public function test_linked_unapproved_application_cannot_bypass_review_with_completion(): void
    {
        $this->complete();$application=$this->application(SupplierApplication::STATUS_UNDER_REVIEW);
        $this->assertFalse($this->eligible());
        $application->update(['status'=>SupplierApplication::STATUS_REJECTED]);$this->assertFalse($this->eligible());
        $renewal=$this->submit('RENEWAL');$this->verify($renewal);$this->decision($renewal)->assertUnprocessable();
        $application->update(['status'=>SupplierApplication::STATUS_APPROVED]);$this->assertTrue($this->eligible());
    }
    public function test_application_documents_and_approved_renewals_remain_supported(): void
    {
        $application=$this->application(SupplierApplication::STATUS_APPROVED);
        foreach(['BUSINESS_CERTIFICATE','BUSINESS_PERMIT']as$type)$application->attachments()->create(['attachment_type'=>$type,'original_name'=>'verified.pdf','stored_path'=>'test/'.$type.'.pdf','mime_type'=>'application/pdf','file_size'=>10,'verification_status'=>'VERIFIED','is_current'=>true,'expires_on'=>today()->addMonth()]);
        $this->supplier->update(['accreditation_status'=>'ACTIVE','accreditation_expires_on'=>today()->addMonth(),'supply_category'=>'TOOLS']);
        $this->assertTrue($this->eligible());$row=$this->submit('RENEWAL');$this->verify($row);$this->decision($row)->assertOk();
        $application->attachments()->update(['expires_on'=>today()->subDay()]);$this->assertTrue($this->eligible());
        $this->actingAs($this->user)->getJson('/api/supplier-account/profile')->assertOk()->assertJsonPath('data.supplier.required_documents.0.expires_on',today()->addYear()->toDateString());
    }
    public function test_qualified_legacy_supplier_sees_matching_rfq_and_can_bid_with_existing_restrictions(): void
    {
        $this->complete();
        $branch=Branch::create(['name'=>'Main','code'=>'LEG']);$warehouse=Warehouse::create(['name'=>'Main','code'=>'LEG','branch_id'=>$branch->id]);
        $manager=$this->actor('PLANT_MANAGER',['warehouse_id'=>$warehouse->id]);$product=Product::where('category','TOOLS')->first();
        $requirement=ReplenishmentRequest::create(['request_no'=>'RR-LEGACY','requested_by'=>$manager->id,'warehouse_id'=>$warehouse->id,'product_id'=>$product->id,'requested_qty'=>10,'priority'=>'High','status'=>ReplenishmentRequest::STATUS_APPROVED,'sourcing_method'=>ReplenishmentRequest::SOURCING_COMPETITIVE]);
        $rfq=Rfq::create(['rfq_number'=>'RFQ-LEGACY','title'=>'Tools RFQ','status'=>Rfq::OPEN,'opens_at'=>now()->subHour(),'closes_at'=>now()->addHour(),'required_delivery_date'=>today()->addDays(5),'delivery_destination'=>'Warehouse','partial_offers_allowed'=>true,'minimum_decrement'=>1,'currency'=>'PHP','version'=>1,'created_by'=>$this->admin->id,'approved_by'=>$this->admin->id,'approved_at'=>now(),'published_by'=>$this->admin->id,'published_at'=>now()]);
        $line=$rfq->lines()->create(['replenishment_request_id'=>$requirement->id,'product_id'=>$product->id,'product_name'=>$product->name,'category'=>'TOOLS','unit'=>'PCS','required_quantity'=>10,'public_specification'=>'Sealed tools']);
        $payload=['rfq_id'=>$rfq->id,'rfq_version'=>1,'idempotency_key'=>'legacy-bidding-001','tax_included'=>true,'freight_included'=>true,'commercial_terms'=>'Net 30','lines'=>[['rfq_line_id'=>$line->id,'unit'=>'PCS','unit_price'=>'100','offered_quantity'=>10,'lead_time_days'=>1,'delivery_available_on'=>today()->addDays(2)->toDateString(),'remarks'=>'Compliant']]];
        $this->actingAs($this->user)->getJson('/api/supplier-account/rfqs')->assertOk()->assertJsonPath('data.0.id',$rfq->id);
        $this->supplier->update(['supply_category'=>'OTHER']);$this->user->unsetRelation('supplier');
        $this->postJson('/api/supplier-account/quotations',$payload)->assertForbidden();
        $this->supplier->update(['supply_category'=>'TOOLS']);$this->user->unsetRelation('supplier');
        $this->postJson('/api/supplier-account/quotations',[...$payload,'rfq_version'=>2])->assertStatus(409);
        $this->postJson('/api/supplier-account/quotations',$payload)->assertCreated();
        $this->postJson('/api/supplier-account/quotations',$payload)->assertCreated();$this->assertDatabaseCount('supplier_quotations',1);
        // Continue the actual legacy bid through evaluation, approved award and canonical PO.
        config(['procurement.award_to_po_enabled'=>true]);
        $rfq->update(['closes_at'=>now()->subMinute(),'status'=>Rfq::CLOSED,'evaluation_criteria'=>[['name'=>'Price','weight'=>100]]]);
        $bid=\App\Models\SupplierBidLine::with('activeRevision')->sole();
        $this->actingAs($this->admin)->putJson("/api/admin/procurement/bid-lines/{$bid->id}/evaluation",[
            'mandatory_results'=>['technical'=>true],'criterion_scores'=>['Price'=>100],'qualification_reason'=>'Mandatory legacy supplier requirements verified.',
        ])->assertOk();
        $checks=$this->getJson("/api/admin/procurement/rfqs/{$rfq->id}/bids")->assertOk()->json('data.bids.0.compliance_checks');
        $this->assertSame('PASSED',collect($checks)->firstWhere('key','system_documents')['status']);
        $mandatory=Document::where('document_type','BUSINESS_PERMIT')->firstOrFail();
        $mandatory->update(['expires_on'=>today()->subDay()]);
        $this->postJson("/api/admin/procurement/rfqs/{$rfq->id}/award",[
            'idempotency_key'=>'legacy-award-po-0001','outcome'=>'FULL_AWARD','justification'=>'Best qualified legacy offer.',
            'lines'=>[['rfq_line_id'=>$line->id,'supplier_bid_revision_id'=>$bid->activeRevision->id,'awarded_quantity'=>10]],
        ])->assertUnprocessable();
        $this->assertDatabaseCount('supplier_awards',0);$this->assertDatabaseCount('purchase_orders',0);
        $mandatory->update(['expires_on'=>today()->addYear()]);
        $awardId=$this->postJson("/api/admin/procurement/rfqs/{$rfq->id}/award",[
            'idempotency_key'=>'legacy-award-po-0001','outcome'=>'FULL_AWARD','justification'=>'Best qualified legacy offer.',
            'lines'=>[['rfq_line_id'=>$line->id,'supplier_bid_revision_id'=>$bid->activeRevision->id,'awarded_quantity'=>10]],
        ])->assertCreated()->json('data.id');
        $this->postJson("/api/admin/supplier-awards/{$awardId}/purchase-orders")->assertCreated();
        $order=\App\Models\PurchaseOrder::with('items')->sole();
        $this->assertSame($this->supplier->id,$order->supplier_id);
        $this->assertSame('100.00',(string)$order->items->sole()->unit_price);
        $this->assertSame('PCS',$order->items->sole()->unit);$this->assertSame(10,$order->items->sole()->ordered_quantity);
        $this->assertSame('1000.00',(string)$order->total_amount);$this->assertTrue($order->tax_included);$this->assertTrue($order->freight_included);
        $this->assertSame('Net 30',$order->commercial_terms);$this->assertSame('Pending Approval',$order->status);
        $this->actingAs($this->user)->getJson("/api/supplier-account/purchase-orders/{$order->id}")->assertOk()->assertJsonPath('data.id',$order->id);
        $rfq->update(['closes_at'=>now()->subMinute()]);
        $this->actingAs($this->user)->postJson('/api/supplier-account/quotations',[...$payload,'idempotency_key'=>'legacy-closed-001'])->assertUnprocessable();
        $other=Supplier::create(['supplier_code'=>'SUP-OTHER','name'=>'Other','status'=>'ACTIVE']);$otherUser=$this->actor('SUPPLIER',['supplier_id'=>$other->id]);
        $this->actingAs($otherUser)->getJson('/api/supplier-account/quotations')->assertOk()->assertJsonCount(0,'data');
        $this->getJson("/api/supplier-account/purchase-orders/{$order->id}")->assertNotFound();
        $document=Document::first();$this->get('/api/supplier-account/accreditation-documents/'.$document->id)->assertNotFound();
        $this->assertDatabaseCount('supplier_applications',0);
    }
}
