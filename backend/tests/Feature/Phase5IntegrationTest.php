<?php

namespace Tests\Feature;

use App\Models\{PurchaseOrder,Role,Supplier,SupplierAward,User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Phase5IntegrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_award_conversion_gate_is_disabled_server_side_by_default(): void
    {
        config(['procurement.award_to_po_enabled'=>false]);
        $admin=$this->user('ADMIN');
        $award=new SupplierAward(['status'=>'APPROVED','outcome'=>'FULL_AWARD']);$award->id=999;
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        app(\App\Services\AwardPurchaseOrderService::class)->convert($award,$admin);
    }

    public function test_supplier_can_only_view_its_own_purchase_orders(): void
    {
        [$supplier,$user]=$this->supplierUser('SUP-P5-A');[$other,$otherUser]=$this->supplierUser('SUP-P5-B');
        $own=$this->order($supplier);$foreign=$this->order($other);
        $this->actingAs($user)->getJson('/api/supplier-account/purchase-orders')->assertOk()->assertJsonCount(1,'data')->assertJsonPath('data.0.id',$own->id);
        $this->actingAs($user)->getJson("/api/supplier-account/purchase-orders/{$foreign->id}")->assertNotFound();
        $this->actingAs($otherUser)->getJson("/api/supplier-account/purchase-orders/{$foreign->id}")->assertOk();
    }

    public function test_supplier_acknowledgment_is_idempotent_and_does_not_change_inventory_or_po_terms(): void
    {
        [$supplier,$user]=$this->supplierUser('SUP-P5-C');$order=$this->order($supplier);$order->items()->create(['product_name'=>'Material','unit'=>'KG','ordered_quantity'=>10,'unit_price'=>'12.50','total_price'=>'125.00']);
        $payload=['action'=>'ACCEPTED','remarks'=>'Confirmed for the approved delivery date.','idempotency_key'=>'phase5-ack-key-0001'];
        $this->actingAs($user)->postJson("/api/supplier-account/purchase-orders/{$order->id}/acknowledgments",$payload)->assertCreated();
        $this->actingAs($user)->postJson("/api/supplier-account/purchase-orders/{$order->id}/acknowledgments",$payload)->assertOk();
        $this->assertDatabaseCount('purchase_order_acknowledgments',1);$this->assertDatabaseCount('inventories',0);
        $this->assertSame('125.00',(string)$order->fresh()->total_amount);$this->assertSame(10,(int)$order->items()->first()->ordered_quantity);
    }

    public function test_inactive_performance_policy_cannot_persist_official_snapshot(): void
    {
        config(['supplier_performance.policy_active'=>false]);$admin=$this->user('ADMIN');[$supplier]=$this->supplierUser('SUP-P5-D');
        $this->actingAs($admin)->postJson("/api/admin/supplier-performance/{$supplier->id}/snapshots",[])->assertStatus(503);
        $this->assertDatabaseCount('supplier_performance_snapshots',0);
    }

    public function test_pending_award_purchase_order_cannot_be_released_before_internal_approval(): void
    {
        [$supplier]=$this->supplierUser('SUP-P5-E');$admin=$this->user('ADMIN');$order=$this->order($supplier);$order->update(['status'=>PurchaseOrder::STATUS_PENDING_APPROVAL,'approved_by'=>null,'created_by'=>$admin->id]);
        $this->actingAs($admin)->patchJson("/api/purchase-orders/{$order->id}/send")->assertStatus(422);
        $this->actingAs($admin)->patchJson("/api/purchase-orders/{$order->id}/approve")->assertOk()->assertJsonPath('status',PurchaseOrder::STATUS_APPROVED);
        $this->actingAs($admin)->patchJson("/api/purchase-orders/{$order->id}/approve")->assertOk()->assertJsonPath('status',PurchaseOrder::STATUS_APPROVED);
        $this->assertDatabaseCount('audit_logs', 1);
    }

    private function user(string $role,array $attributes=[]):User{$model=Role::firstOrCreate(['slug'=>$role],['name'=>$role]);return User::factory()->create([...$attributes,'role_id'=>$model->id,'status'=>'ACTIVE']);}
    private function supplierUser(string $code):array{$supplier=Supplier::create(['supplier_code'=>$code,'name'=>$code,'contact_person'=>'Contact','email'=>strtolower($code).'@example.test','phone'=>'09170000000','address'=>'Manila','business_type'=>'Corporation','supply_category'=>'CHEMICALS','status'=>Supplier::STATUS_ACTIVE,'accreditation_status'=>'ACTIVE','accredited_at'=>now()->subDay(),'accreditation_expires_on'=>now()->addYear()]);return[$supplier,$this->user('SUPPLIER',['supplier_id'=>$supplier->id])];}
    private function order(Supplier $supplier):PurchaseOrder{return PurchaseOrder::create(['po_number'=>'PO-P5-'.$supplier->id,'supplier_id'=>$supplier->id,'supplier_name'=>$supplier->name,'delivery_details'=>'Main warehouse','expected_delivery_date'=>now()->addWeek(),'total_amount'=>'125.00','currency'=>'PHP','status'=>PurchaseOrder::STATUS_SENT_TO_SUPPLIER,'approved_by'=>$this->user('ADMIN')->id,'sent_at'=>now()]);}
}
