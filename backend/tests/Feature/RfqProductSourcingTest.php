<?php

namespace Tests\Feature;

use App\Models\{Branch, Product, ReplenishmentRequest, Rfq, Role, User, Warehouse};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RfqProductSourcingTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_bidding_relevant_products_are_listed_with_grounded_sourcing_statuses(): void
    {
        [$admin, $requester, $warehouse] = $this->actors();
        $ready = Product::create(['name'=>'Castable Cement','category'=>'REFRACTORY PRODUCTS','unit'=>'SACK','item_classification'=>Product::RAW_MATERIAL]);
        Product::create(['name'=>'Idle Catalog Product','category'=>'INDUSTRIAL CHEMICALS','unit'=>'DRUM','item_classification'=>Product::FINISHED_PRODUCT]);
        ReplenishmentRequest::create(['request_no'=>'RR-RFQ-READY','requested_by'=>$requester->id,'warehouse_id'=>$warehouse->id,'product_id'=>$ready->id,'requested_qty'=>24,'priority'=>'High','status'=>ReplenishmentRequest::STATUS_FOR_PURCHASE_ORDER,'sourcing_method'=>ReplenishmentRequest::SOURCING_COMPETITIVE,'submitted_at'=>now(),'reviewed_at'=>now()]);

        $response = $this->actingAs($admin)->getJson('/api/admin/procurement/sourcing-products?per_page=100')->assertOk();
        $this->assertSame(1, $response->json('meta.total'));
        $rows = collect($response->json('data'))->keyBy('name');
        $this->assertSame('READY_FOR_RFQ', $rows['Castable Cement']['sourcing_status']);
        $this->assertSame('SACK', $rows['Castable Cement']['unit']);
        $this->assertSame(24, $rows['Castable Cement']['approved_requirement']['requested_qty']);
        $this->assertFalse($rows->has('Idle Catalog Product'));
        $this->getJson('/api/admin/procurement/rfq-requirements')->assertOk()
            ->assertJsonPath('delivery_destination.name', 'Main Warehouse')
            ->assertJsonPath('delivery_destination.address', '29 Flamingo, Marikina');
    }

    public function test_rfq_draft_uses_snapshot_and_consumed_requirement_is_not_eligible(): void
    {
        [$admin, $requester, $warehouse] = $this->actors();
        $product = Product::create(['name'=>'Industrial Solvent','category'=>'INDUSTRIAL CHEMICALS','unit'=>'DRUM','item_classification'=>Product::RAW_MATERIAL]);
        $requirement = ReplenishmentRequest::create(['request_no'=>'RR-RFQ-DRAFT','requested_by'=>$requester->id,'warehouse_id'=>$warehouse->id,'product_id'=>$product->id,'requested_qty'=>10,'priority'=>'High','status'=>ReplenishmentRequest::STATUS_FOR_PURCHASE_ORDER,'sourcing_method'=>ReplenishmentRequest::SOURCING_COMPETITIVE,'submitted_at'=>now(),'reviewed_at'=>now()]);
        $rfq = Rfq::create(['rfq_number'=>'RFQ-SOURCE-1','title'=>'Solvent requirement','status'=>Rfq::DRAFT,'opens_at'=>now()->addDay(),'closes_at'=>now()->addDays(2),'required_delivery_date'=>now()->addDays(5)->toDateString(),'delivery_destination'=>'Main Warehouse','minimum_decrement'=>'1.00','currency'=>'PHP','created_by'=>$admin->id]);
        $rfq->lines()->create(['replenishment_request_id'=>$requirement->id,'product_id'=>$product->id,'product_name'=>$product->name,'category'=>$product->category,'unit'=>$product->unit,'required_quantity'=>10,'public_specification'=>'Sealed industrial drums','publish_reference_price'=>false]);
        $product->update(['name'=>'Renamed Catalog Solvent']);

        $response = $this->actingAs($admin)->getJson('/api/admin/procurement/sourcing-products?search=Renamed')->assertOk()
            ->assertJsonPath('data.0.sourcing_status','RFQ_DRAFT')->assertJsonPath('data.0.rfq.rfq_number','RFQ-SOURCE-1');
        $this->assertSame([], $response->json('data.0.eligible_requirements'));
        $this->assertDatabaseHas('rfq_lines',['id'=>$rfq->lines()->first()->id,'product_name'=>'Industrial Solvent']);
    }

    public function test_showcase_endpoints_are_retired_and_admin_projection_is_authorized(): void
    {
        [$admin, $requester] = $this->actors();
        $this->getJson('/api/public/products')->assertNotFound();
        $this->actingAs($requester)->getJson('/api/admin/procurement/sourcing-products')->assertForbidden();
        $this->actingAs($admin)->getJson('/api/admin/product-displays')->assertNotFound();
    }

    private function actors(): array
    {
        $adminRole = Role::firstOrCreate(['slug'=>'ADMIN'],['name'=>'Admin']);
        $requesterRole = Role::firstOrCreate(['slug'=>'PLANT_MANAGER'],['name'=>'Plant Manager']);
        $admin = User::factory()->create(['role_id'=>$adminRole->id,'status'=>'ACTIVE']);
        $requester = User::factory()->create(['role_id'=>$requesterRole->id,'status'=>'ACTIVE']);
        $branch = Branch::create(['name'=>'Main Branch','code'=>'RFQ-MAIN']);
        $warehouse = Warehouse::create(['name'=>'Main Warehouse','code'=>'WH-MAIN','branch_id'=>$branch->id,'address'=>'29 Flamingo, Marikina']);
        return [$admin,$requester,$warehouse];
    }
}
