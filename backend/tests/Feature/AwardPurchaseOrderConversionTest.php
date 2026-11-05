<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\ReplenishmentRequest;
use App\Models\Rfq;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierApplication;
use App\Models\SupplierApplicationAttachment;
use App\Models\SupplierAward;
use App\Models\SupplierBidLine;
use App\Models\SupplierBidRevision;
use App\Models\SupplierQuotation;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\AwardPurchaseOrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AwardPurchaseOrderConversionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Warehouse $warehouse;

    protected function setUp(): void
    {
        parent::setUp();

        config(['procurement.award_to_po_enabled' => true]);
        $this->admin = $this->user('ADMIN');
        $branch = Branch::create(['name' => 'Phase 5 Conversion', 'code' => 'P5C']);
        $this->warehouse = Warehouse::create(['name' => 'Phase 5 Warehouse', 'code' => 'P5C-WH', 'branch_id' => $branch->id]);
    }

    public function test_full_multi_product_award_converts_exact_amounts_units_and_is_idempotent(): void
    {
        $award = $this->award('FULL_AWARD', Rfq::AWARDED, [
            ['supplier' => 'SUP-P5-FULL', 'product' => 'Chemical Alpha', 'unit' => 'L', 'required' => 50, 'awarded' => 50, 'price' => '10.00'],
            ['supplier' => 'SUP-P5-FULL', 'product' => 'Chemical Beta', 'unit' => 'KG', 'required' => 25, 'awarded' => 25, 'price' => '4.25'],
        ]);

        $first = app(AwardPurchaseOrderService::class)->convert($award, $this->admin);
        $second = app(AwardPurchaseOrderService::class)->convert($award, $this->admin);

        $this->assertTrue($first['created']);
        $this->assertFalse($second['created']);
        $this->assertDatabaseCount('purchase_orders', 1);
        $this->assertDatabaseCount('purchase_order_items', 2);
        $this->assertDatabaseCount('inventories', 0);

        $order = PurchaseOrder::with('items')->sole();
        $this->assertSame(PurchaseOrder::STATUS_PENDING_APPROVAL, $order->status);
        $this->assertSame($this->admin->id, $order->created_by);
        $this->assertNull($order->approved_by);
        $this->assertSame('606.25', (string) $order->total_amount);
        $this->assertSame(['KG', 'L'], $order->items->pluck('unit')->sort()->values()->all());
        $this->assertSame(75, (int) $order->items->sum('ordered_quantity'));
        $this->assertSame(2, ReplenishmentRequest::where('status', ReplenishmentRequest::STATUS_PO_CREATED)->count());
    }

    public function test_partial_award_converts_only_the_approved_allocation(): void
    {
        $award = $this->award('PARTIAL_AWARD', Rfq::PARTIALLY_AWARDED, [
            ['supplier' => 'SUP-P5-PART', 'product' => 'Partial Chemical', 'unit' => 'DRUM', 'required' => 100, 'awarded' => 40, 'price' => '125.50'],
        ]);

        app(AwardPurchaseOrderService::class)->convert($award, $this->admin);

        $order = PurchaseOrder::with('items')->sole();
        $this->assertSame(40, (int) $order->items->sole()->ordered_quantity);
        $this->assertSame('DRUM', $order->items->sole()->unit);
        $this->assertSame('5020.00', (string) $order->total_amount);
        $this->assertSame(PurchaseOrder::STATUS_PENDING_APPROVAL, $order->status);
    }

    public function test_split_award_creates_one_exact_pending_order_per_supplier(): void
    {
        $award = $this->award('SPLIT_AWARD', Rfq::AWARDED, [
            ['supplier' => 'SUP-P5-SPLIT-A', 'product' => 'Shared Chemical', 'unit' => 'L', 'required' => 100, 'awarded' => 40, 'price' => '9.50'],
            ['supplier' => 'SUP-P5-SPLIT-B', 'product' => 'Shared Chemical', 'unit' => 'L', 'required' => 100, 'awarded' => 60, 'price' => '10.00'],
        ]);

        app(AwardPurchaseOrderService::class)->convert($award, $this->admin);

        $this->assertDatabaseCount('purchase_orders', 2);
        $this->assertDatabaseCount('purchase_order_items', 2);
        $this->assertSame(100, (int) PurchaseOrder::with('items')->get()->flatMap->items->sum('ordered_quantity'));
        $this->assertSame(['380.00', '600.00'], PurchaseOrder::orderBy('total_amount')->pluck('total_amount')->map(fn ($amount) => (string) $amount)->all());
        $this->assertSame(2, PurchaseOrder::where('status', PurchaseOrder::STATUS_PENDING_APPROVAL)->whereNull('approved_by')->count());
        $this->assertSame(2, PurchaseOrder::distinct()->count('supplier_id'));
    }

    private function legacyEvidence(Supplier $supplier): \App\Models\SupplierAccreditationRequest
    {
        $supplier->approvedApplication()->get()->each(function ($application) {
            $application->attachments()->delete(); $application->delete();
        });
        $request = \App\Models\SupplierAccreditationRequest::create([
            'supplier_id'=>$supplier->id,'submitted_by_id'=>$supplier->authorizedUsers()->first()->id,
            'request_type'=>'COMPLETION','status'=>'APPROVED','supplier_reason'=>'Verified legacy business evidence.',
            'admin_reason'=>'Mandatory evidence approved.','submitted_at'=>now()->subDay(),
            'reviewed_by_id'=>$this->admin->id,'reviewed_at'=>now(),
        ]);
        foreach (['BUSINESS_CERTIFICATE','BUSINESS_PERMIT'] as $type) $request->documents()->create([
            'document_type'=>$type,'original_name'=>'verified.pdf','stored_path'=>'test/'.$supplier->id.'/'.$type.'.pdf',
            'mime_type'=>'application/pdf','file_size'=>100,'file_sha256'=>hash('sha256',$type),'verification_status'=>'VERIFIED',
            'verified_by_id'=>$this->admin->id,'verified_at'=>now(),'expires_on'=>today()->addYear(),
        ]);
        return $request;
    }

    public function test_legacy_conversion_preserves_winning_terms_lineage_and_duplicate_protection(): void
    {
        $award=$this->award('FULL_AWARD',Rfq::AWARDED,[['supplier'=>'SUP-LEG-PO','product'=>'Legacy Chemical','unit'=>'DRUM','required'=>10,'awarded'=>10,'price'=>'125.50']]);
        $supplier=Supplier::where('supplier_code','SUP-LEG-PO')->firstOrFail();$this->legacyEvidence($supplier);
        $response=$this->actingAs($this->admin)->postJson("/api/admin/supplier-awards/{$award->id}/purchase-orders")->assertCreated();
        $order=PurchaseOrder::with('items')->sole();$item=$order->items->sole();
        $this->assertSame($supplier->id,$order->supplier_id);$this->assertSame($award->id,$order->supplier_award_id);
        $this->assertSame('125.50',(string)$item->unit_price);$this->assertSame('1255.00',(string)$order->total_amount);
        $this->assertSame(10,$item->ordered_quantity);$this->assertSame('DRUM',$item->unit);
        $this->assertSame($award->lines()->first()->rfqLine->product_id,$item->product_id);
        $this->assertSame('AWARDED_BID',$item->price_source);$this->assertSame($award->lines()->first()->id,$item->supplier_award_line_id);
        $this->assertSame('PHP',$order->currency);$this->assertTrue($order->tax_included);$this->assertTrue($order->freight_included);
        $this->assertSame('Net 30',$order->commercial_terms);$this->assertSame($award->rfq->delivery_destination,$order->delivery_details);
        $this->assertSame($award->rfq->required_delivery_date->toDateString(),$order->expected_delivery_date->toDateString());
        $this->assertSame(PurchaseOrder::STATUS_PENDING_APPROVAL,$order->status);$this->assertNull($order->approved_by);
        $this->postJson("/api/admin/supplier-awards/{$award->id}/purchase-orders")->assertOk();$this->assertDatabaseCount('purchase_orders',1);
        $this->assertDatabaseCount('supplier_applications',0);
    }

    public static function disqualifications(): array
    {
        return array_map(fn ($case)=>[$case], ['no_evidence','pending','rejected','unverified','documents_expired','accreditation_expired','inactive','wrong_category','no_category','approval_removed','pending_application','rejected_application']);
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('disqualifications')]
    public function test_conversion_rechecks_legacy_qualification_and_rolls_back_split_orders(string $case): void
    {
        $award=$this->award('SPLIT_AWARD',Rfq::AWARDED,[
            ['supplier'=>'SUP-LEG-FIRST','product'=>'Split Chemical','unit'=>'PCS','required'=>100,'awarded'=>40,'price'=>'9.50'],
            ['supplier'=>'SUP-LEG-SECOND','product'=>'Split Chemical','unit'=>'PCS','required'=>100,'awarded'=>60,'price'=>'10.00'],
        ]);
        $suppliers=Supplier::orderBy('id')->get();$this->legacyEvidence($suppliers[0]);$supplier=$suppliers[1];$request=$this->legacyEvidence($supplier);
        switch($case) {
            case 'no_evidence': $request->documents()->delete();$request->delete();break;
            case 'pending':$request->update(['status'=>'PENDING']);break;
            case 'rejected':$request->update(['status'=>'REJECTED']);break;
            case 'unverified':$request->documents()->update(['verification_status'=>'PENDING_VERIFICATION']);break;
            case 'documents_expired':$request->documents()->update(['expires_on'=>today()->subDay()]);break;
            case 'accreditation_expired':$supplier->update(['accreditation_expires_on'=>today()->subDay()]);break;
            case 'inactive':$supplier->update(['status'=>'INACTIVE']);break;
            case 'wrong_category':$supplier->update(['supply_category'=>'PACKAGING']);break;
            case 'no_category':$supplier->update(['supply_category'=>'']);break;
            case 'approval_removed':$request->update(['reviewed_by_id'=>null,'reviewed_at'=>null]);break;
            default:
                SupplierApplication::create(['application_number'=>'APP-LINKED','company_name'=>$supplier->name,'owner_name'=>'Owner','normalized_company_name'=>'linked legacy','address'=>'Manila','contact_person'=>'Contact','email'=>$supplier->email,'normalized_email'=>$supplier->email,'phone'=>'09170000000','business_type'=>'Corporation','supply_category'=>'CHEMICALS','status'=>$case==='pending_application'?'UNDER_REVIEW':'REJECTED','submitted_at'=>now(),'approved_supplier_id'=>$supplier->id]);
        }
        $this->actingAs($this->admin)->postJson("/api/admin/supplier-awards/{$award->id}/purchase-orders")->assertUnprocessable();
        $this->assertDatabaseCount('purchase_orders',0);$this->assertDatabaseCount('purchase_order_items',0);
        $this->assertSame(0,ReplenishmentRequest::where('status',ReplenishmentRequest::STATUS_PO_CREATED)->count());
        $this->assertDatabaseMissing('audit_logs',['action'=>'AWARD_PURCHASE_ORDER_GENERATED']);
    }

    public function test_legacy_renewal_and_application_renewal_are_both_effective_at_conversion(): void
    {
        $award=$this->award('SPLIT_AWARD',Rfq::AWARDED,[
            ['supplier'=>'SUP-RENEW-A','product'=>'Renewed Chemical','unit'=>'SACK','required'=>100,'awarded'=>40,'price'=>'9.50'],
            ['supplier'=>'SUP-RENEW-B','product'=>'Renewed Chemical','unit'=>'SACK','required'=>100,'awarded'=>60,'price'=>'10.00'],
        ]);
        $suppliers=Supplier::orderBy('id')->get();$request=$this->legacyEvidence($suppliers[0]);$request->update(['request_type'=>'RENEWAL']);
        $application=$suppliers[1]->approvedApplication()->first();$application->attachments()->update(['expires_on'=>today()->subDay()]);
        $renewal=\App\Models\SupplierAccreditationRequest::create(['supplier_id'=>$suppliers[1]->id,'submitted_by_id'=>$this->admin->id,'request_type'=>'RENEWAL','status'=>'APPROVED','supplier_reason'=>'Renewed documents.','reviewed_by_id'=>$this->admin->id,'reviewed_at'=>now(),'submitted_at'=>now()]);
        foreach($request->documents as $document)$renewal->documents()->create($document->only(['document_type','original_name','stored_path','mime_type','file_size','file_sha256','verification_status','verified_by_id','verified_at','expires_on']));
        $this->actingAs($this->admin)->postJson("/api/admin/supplier-awards/{$award->id}/purchase-orders")->assertCreated();
        $this->assertDatabaseCount('purchase_orders',2);$this->assertDatabaseCount('purchase_order_items',2);
    }

    /** @param array<int, array{supplier:string,product:string,unit:string,required:int,awarded:int,price:string}> $allocations */
    private function award(string $outcome, string $rfqStatus, array $allocations): SupplierAward
    {
        $manager = $this->user('PLANT_MANAGER', ['warehouse_id' => $this->warehouse->id]);
        $rfq = Rfq::create([
            'rfq_number' => 'RFQ-P5-'.str_replace('_', '-', $outcome),
            'title' => 'Phase 5 conversion fixture',
            'status' => $rfqStatus,
            'opens_at' => now()->subDays(2),
            'closes_at' => now()->subDay(),
            'required_delivery_date' => now()->addDays(10),
            'delivery_destination' => $this->warehouse->name,
            'partial_offers_allowed' => true,
            'split_awards_allowed' => true,
            'minimum_decrement' => 1,
            'currency' => 'PHP',
            'show_reference_price' => false,
            'show_lowest_bid' => true,
            'version' => 1,
            'created_by' => $this->admin->id,
            'approved_by' => $this->admin->id,
            'approved_at' => now()->subDays(2),
            'published_by' => $this->admin->id,
            'published_at' => now()->subDays(2),
        ]);

        $rfqLines = [];
        foreach (collect($allocations)->unique('product') as $index => $allocation) {
            $product = Product::create(['name' => $allocation['product'], 'category' => 'CHEMICALS', 'unit' => $allocation['unit'], 'cost_price' => 1, 'selling_price' => 2, 'reorder_level' => 1]);
            $request = ReplenishmentRequest::create([
                'request_no' => 'RR-P5-'.$outcome.'-'.$index,
                'requested_by' => $manager->id,
                'warehouse_id' => $this->warehouse->id,
                'product_id' => $product->id,
                'requested_qty' => $allocation['required'],
                'priority' => 'High',
                'status' => ReplenishmentRequest::STATUS_APPROVED,
                'sourcing_method' => ReplenishmentRequest::SOURCING_COMPETITIVE,
            ]);
            $rfqLines[$allocation['product']] = $rfq->lines()->create([
                'replenishment_request_id' => $request->id,
                'product_id' => $product->id,
                'product_name' => $product->name,
                'category' => 'CHEMICALS',
                'unit' => $product->unit,
                'required_quantity' => $allocation['required'],
                'public_specification' => 'Phase 5 verified specification',
            ]);
        }

        $award = SupplierAward::create([
            'award_number' => 'AWD-P5-'.str_replace('_', '-', $outcome),
            'rfq_id' => $rfq->id,
            'outcome' => $outcome,
            'status' => 'APPROVED',
            'justification' => 'Approved Phase 5 regression fixture.',
            'idempotency_key' => 'award-p5-'.strtolower(str_replace('_', '-', $outcome)),
            'approved_by' => $this->admin->id,
            'approved_at' => now(),
        ]);

        $suppliers = [];
        foreach ($allocations as $index => $allocation) {
            $supplier = $suppliers[$allocation['supplier']] ??= $this->eligibleSupplier($allocation['supplier']);
            $supplierUser = $supplier->authorizedUsers()->firstOrFail();
            $quotation = SupplierQuotation::firstOrCreate(
                ['supplier_id' => $supplier->id, 'rfq_id' => $rfq->id],
                ['quotation_number' => 'QUO-P5-'.$supplier->id.'-'.$rfq->id, 'submitted_by' => $supplierUser->id, 'currency' => 'PHP', 'status' => 'SUBMITTED', 'idempotency_key' => 'quote-p5-'.$supplier->id.'-'.$rfq->id, 'rfq_version' => 1, 'tax_included' => true, 'freight_included' => true, 'commercial_terms' => 'Net 30', 'submitted_at' => now()->subDay()],
            );
            $bid = SupplierBidLine::create(['supplier_quotation_id' => $quotation->id, 'rfq_line_id' => $rfqLines[$allocation['product']]->id, 'status' => 'AWARDED', 'current_revision_number' => 1]);
            $revision = SupplierBidRevision::create(['supplier_bid_line_id' => $bid->id, 'revision_number' => 1, 'rfq_version' => 1, 'unit_price' => $allocation['price'], 'offered_quantity' => $allocation['required'], 'lead_time_days' => 5, 'delivery_available_on' => now()->addDays(5), 'status' => 'ACTIVE', 'submitted_by' => $supplierUser->id, 'submitted_at' => now()->subDay()]);
            $award->lines()->create(['rfq_line_id' => $rfqLines[$allocation['product']]->id, 'supplier_id' => $supplier->id, 'supplier_bid_revision_id' => $revision->id, 'awarded_quantity' => $allocation['awarded'], 'awarded_unit_price' => $allocation['price']]);
        }

        return $award;
    }

    private function eligibleSupplier(string $code): Supplier
    {
        $supplier = Supplier::create(['supplier_code' => $code, 'name' => $code, 'contact_person' => 'Contact', 'email' => strtolower($code).'@example.test', 'phone' => '09170000000', 'address' => 'Manila', 'business_type' => 'Corporation', 'supply_category' => 'CHEMICALS', 'status' => Supplier::STATUS_ACTIVE, 'accreditation_status' => 'ACTIVE', 'accredited_at' => now()->subMonth(), 'accreditation_expires_on' => now()->addYear()]);
        $this->user('SUPPLIER', ['supplier_id' => $supplier->id]);
        $application = SupplierApplication::create(['application_number' => 'APP-'.$code, 'company_name' => $code, 'owner_name' => 'Owner', 'normalized_company_name' => strtolower($code), 'address' => 'Manila', 'contact_person' => 'Contact', 'email' => $supplier->email, 'normalized_email' => $supplier->email, 'phone' => '09170000000', 'business_type' => 'Corporation', 'supply_category' => 'CHEMICALS', 'products_services' => 'Chemicals', 'status' => SupplierApplication::STATUS_APPROVED, 'submitted_at' => now()->subMonth(), 'approved_supplier_id' => $supplier->id]);
        foreach ([SupplierApplicationAttachment::TYPE_BUSINESS_CERTIFICATE, SupplierApplicationAttachment::TYPE_BUSINESS_PERMIT] as $type) {
            $application->attachments()->create(['attachment_type' => $type, 'original_name' => $type.'.pdf', 'stored_path' => 'tests/'.$supplier->id.'/'.$type.'.pdf', 'mime_type' => 'application/pdf', 'file_size' => 100, 'is_current' => true, 'verification_status' => SupplierApplicationAttachment::STATUS_VERIFIED, 'verified_at' => now(), 'expires_on' => now()->addYear()]);
        }

        return $supplier;
    }

    private function user(string $slug, array $attributes = []): User
    {
        $role = Role::firstOrCreate(['slug' => $slug], ['name' => str_replace('_', ' ', $slug)]);

        return User::factory()->create([...$attributes, 'role_id' => $role->id, 'status' => 'ACTIVE']);
    }
}
