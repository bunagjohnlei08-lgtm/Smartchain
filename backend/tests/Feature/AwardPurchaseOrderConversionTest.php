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
