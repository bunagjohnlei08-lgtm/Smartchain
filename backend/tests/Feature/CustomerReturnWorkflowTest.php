<?php

namespace Tests\Feature;

use App\Models\{Branch, CustomerReturn, Inventory, Order, Product, Role, StockOutTransaction, User, Warehouse};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\TestCase;

class CustomerReturnWorkflowTest extends TestCase
{
    use RefreshDatabase;
    private User $admin;
    private User $manager;
    private User $qa;
    private Warehouse $warehouse;
    private Inventory $inventory;
    private Order $order;
    private int $itemId;

    protected function setUp(): void
    {
        parent::setUp(); Storage::fake('local');
        Http::preventStrayRequests(); Http::fake(); Mail::fake(); Notification::fake();
        $branch = Branch::create(['name'=>'Returns branch','code'=>'RET']);
        $this->warehouse = Warehouse::create(['name'=>'Returns warehouse','code'=>'RET','branch_id'=>$branch->id,'capacity'=>200,'capacity_powder'=>50,'capacity_liquid'=>50,'capacity_solid'=>50,'capacity_returned'=>50]);
        $this->admin = $this->actor('ADMIN');
        $this->manager = $this->actor('PLANT_MANAGER',['warehouse_id'=>$this->warehouse->id]);
        $this->qa = $this->actor('QA_SUPERVISOR',['warehouse_id'=>$this->warehouse->id]);
        $product = Product::create(['name'=>'Customer Chemical','unit'=>'DRUM','cost_price'=>100]);
        $this->inventory = Inventory::create(['barcode'=>'RETURN-BARCODE','product_id'=>$product->id,'warehouse_id'=>$this->warehouse->id,'available_stock'=>10,'returned_stock'=>0]);
        $this->order = Order::create(['order_no'=>'SO-RETURN','customer_name'=>'Customer','customer_address'=>'Manila','order_date'=>today()->subDays(10),
            'required_delivery_date'=>today()->subDays(5),'status'=>'DELIVERED','assigned_to'=>$this->manager->id,'total_amount'=>500]);
        $item = $this->order->items()->create(['product_id'=>$product->id,'product_name'=>$product->name,'quantity'=>5,'unit'=>'DRUM','unit_price'=>100,'subtotal'=>500]);
        $this->itemId = $item->id;
        StockOutTransaction::create(['reference_no'=>(string)Str::uuid(),'idempotency_key'=>(string)Str::uuid(),'order_id'=>$this->order->id,'order_item_id'=>$item->id,
            'inventory_id'=>$this->inventory->id,'product_id'=>$product->id,'warehouse_id'=>$this->warehouse->id,'barcode'=>$this->inventory->barcode,'quantity'=>5,'unit'=>'DRUM','performed_by'=>$this->manager->id]);
    }

    private function actor(string $slug, array $extra=[]): User
    {
        $role = Role::firstOrCreate(['slug'=>$slug],['name'=>$slug]);
        return User::factory()->create(['role_id'=>$role->id,'status'=>'ACTIVE']+$extra);
    }
    private function payload(array $changes=[]): array
    {
        return array_replace(['submission_key'=>(string)Str::uuid(),'order_item_id'=>$this->itemId,'warehouse_id'=>$this->warehouse->id,'quantity'=>5,'reason'=>'QUALITY_CONCERN'],$changes);
    }
    private function register(array $changes=[]): int
    {
        return $this->actingAs($this->admin)->postJson('/api/customer-returns',$this->payload($changes))->assertCreated()->json('data.id');
    }
    private function action(int $id, string $action, array $values=[], bool $evidence=true)
    {
        if ($evidence) $values['evidence'] = [UploadedFile::fake()->createWithContent('return.pdf',"%PDF-1.4\n".$action."\n%%EOF\n")];
        return $this->post("/api/customer-returns/{$id}/{$action}",$values,['Accept'=>'application/json']);
    }
    private function receive(int $id, int $quantity=5): void
    {
        $this->actingAs($this->admin);
        $this->action($id,'approve',['verification_reference'=>'Verified delivery document RET-123','delivery_verified'=>true])->assertOk();
        $this->actingAs($this->manager);
        $this->action($id,'receive',['quantity'=>$quantity,'received_at'=>today()->toDateString(),'condition'=>'SEALED','qa_user_id'=>$this->qa->id,'shortage_reason'=>'Confirmed remainder was not returned'])->assertOk();
    }
    private function inspect(int $id, int $passed=3, int $failed=2): void
    {
        $this->actingAs($this->qa);
        $this->action($id,'inspect',['passed_quantity'=>$passed,'failed_quantity'=>$failed,'findings'=>'Product suitability independently inspected','policy_reference'=>'Product/storage QA policy RET-1','suitability_confirmed'=>true])->assertOk();
    }

    private function tenPieceFulfillment(): void
    {
        $this->inventory->product->update(['unit'=>'PCS']);
        $this->order->items()->whereKey($this->itemId)->update(['quantity'=>10,'unit'=>'PCS','subtotal'=>1000]);
        $this->order->update(['total_amount'=>1000]);
        StockOutTransaction::where('order_item_id',$this->itemId)->update(['quantity'=>10,'unit'=>'PCS']);
    }

    public function test_ten_piece_mixed_return_persists_seven_restocked_three_disposed_with_complete_history(): void
    {
        $this->tenPieceFulfillment();
        $original = $this->order->fresh()->getAttributes();
        $stockOut = StockOutTransaction::get()->toArray();
        $id = $this->register(['quantity'=>10]);
        $this->receive($id,10);
        $this->action($id,'receive',['quantity'=>10,'received_at'=>today()->toDateString(),'condition'=>'SEALED','qa_user_id'=>$this->qa->id])->assertOk();
        $this->action($id,'restock',[],false)->assertUnprocessable();
        $this->assertSame(10,$this->inventory->fresh()->available_stock);
        $this->assertSame(10,$this->inventory->fresh()->returned_stock);
        $this->inspect($id,7,3);
        $this->assertSame(10,$this->inventory->fresh()->available_stock);
        $this->assertSame(10,$this->inventory->fresh()->returned_stock);
        $this->actingAs($this->manager);
        $this->action($id,'restock',[],false)->assertOk()->assertJsonPath('data.status','PENDING_DISPOSITION');
        $this->action($id,'restock',[],false)->assertOk();
        $this->assertSame(17,$this->inventory->fresh()->available_stock);
        $this->assertSame(3,$this->inventory->fresh()->returned_stock);
        $this->actingAs($this->admin);
        $values = ['reason'=>'Synthetic failed goods disposal completed','disposal_date'=>today()->toDateString(),
            'policy_reference'=>'Synthetic disposal policy DISP-10','physical_disposal_confirmed'=>true];
        $this->action($id,'dispose',$values)->assertOk()->assertJsonPath('data.status','COMPLETED');
        $this->action($id,'dispose',$values)->assertOk();
        $detail = $this->getJson('/api/customer-returns/'.$id)->assertOk()
            ->assertJsonPath('data.unit','PCS')->assertJsonPath('data.restocked_quantity',7)
            ->assertJsonPath('data.disposed_quantity',3)->assertJsonPath('data.quarantine_quantity',0)->assertJsonCount(6,'data.events');
        $this->assertSame(['REQUESTED','APPROVE','RECEIVE','INSPECT','RESTOCK','DISPOSE'],array_column($detail->json('data.events'),'action'));
        foreach ($detail->json('data.events') as $event) { $this->assertNotEmpty($event['actor']); $this->assertNotEmpty($event['created_at']); }
        $this->assertSame(17,$this->inventory->fresh()->available_stock);
        $this->assertSame(0,$this->inventory->fresh()->returned_stock);
        $this->assertSame($original,$this->order->fresh()->getAttributes());
        $this->assertSame($stockOut,StockOutTransaction::get()->toArray());
        $this->assertDatabaseHas('inventory_return_movements',['source_reference'=>$detail->json('data.reference'),'direction'=>'RETURN_RESTOCK','quantity'=>7,'unit'=>'PCS','performed_by'=>$this->manager->id]);
        $this->assertDatabaseHas('inventory_return_movements',['source_reference'=>$detail->json('data.reference'),'direction'=>'RETURN_DISPOSAL','quantity'=>3,'unit'=>'PCS','performed_by'=>$this->admin->id]);
        $this->assertDatabaseCount('inventory_return_movements',3);
        Http::assertNothingSent(); Mail::assertNothingSent(); Notification::assertNothingSent();
    }

    public function test_all_passed_and_all_failed_returns_complete_only_after_the_required_disposition(): void
    {
        $this->tenPieceFulfillment();
        foreach ([[5,0,'restock'],[0,5,'dispose']] as [$passed,$failed,$action]) {
            $before = $this->inventory->fresh()->available_stock;
            $id = $this->register(); $this->receive($id); $this->inspect($id,$passed,$failed);
            $this->assertSame($before,$this->inventory->fresh()->available_stock);
            $this->assertSame(5,$this->inventory->fresh()->returned_stock);
            $this->actingAs($action === 'restock' ? $this->manager : $this->admin);
            $values = $action === 'dispose' ? ['reason'=>'Synthetic complete disposal','disposal_date'=>today()->toDateString(),
                'policy_reference'=>'Synthetic disposal record','physical_disposal_confirmed'=>true] : [];
            $this->action($id,$action,$values,$action === 'dispose')->assertOk()->assertJsonPath('data.status','COMPLETED');
            $this->action($id,$action,$values,$action === 'dispose')->assertOk();
            $this->assertSame($before+$passed,$this->inventory->fresh()->available_stock);
            $this->assertSame(0,$this->inventory->fresh()->returned_stock);
        }
        Http::assertNothingSent(); Mail::assertNothingSent(); Notification::assertNothingSent();
    }

    public function test_partial_return_quarantine_qa_restock_and_disposal_reconcile_without_altering_order_or_stockout(): void
    {
        $original = $this->order->fresh()->getAttributes();
        $transactions = StockOutTransaction::get()->toArray();
        $id = $this->register(); $this->receive($id);
        $this->assertSame(10,$this->inventory->fresh()->available_stock);
        $this->assertSame(5,$this->inventory->fresh()->returned_stock);
        $this->inspect($id);
        $this->assertSame(10,$this->inventory->fresh()->available_stock);
        $this->actingAs($this->manager);
        $this->action($id,'restock',[],false)->assertOk()->assertJsonPath('data.restocked_quantity',3)->assertJsonPath('data.status','PENDING_DISPOSITION');
        $this->action($id,'restock',[],false)->assertOk();
        $this->assertSame(13,$this->inventory->fresh()->available_stock);
        $this->assertSame(2,$this->inventory->fresh()->returned_stock);
        $this->action($id,'dispose',['reason'=>'Documented actual disposal'],false)->assertForbidden();
        $this->actingAs($this->admin);
        $disposal = ['reason'=>'Failed goods physically disposed','disposal_date'=>today()->toDateString(),'policy_reference'=>'Approved disposal record DISP-123','physical_disposal_confirmed'=>true];
        $this->action($id,'dispose',$disposal,false)->assertUnprocessable();
        $this->action($id,'dispose',$disposal)->assertOk()->assertJsonPath('data.disposed_quantity',2)->assertJsonPath('data.status','COMPLETED')->assertJsonPath('data.quarantine_quantity',0);
        $this->action($id,'dispose',$disposal)->assertOk();
        $this->assertSame(13,$this->inventory->fresh()->available_stock);
        $this->assertSame(0,$this->inventory->fresh()->returned_stock);
        $this->assertSame($original,$this->order->fresh()->getAttributes());
        $this->assertSame($transactions,StockOutTransaction::get()->toArray());
        $this->assertDatabaseCount('order_status_histories',0);
        $this->assertDatabaseCount('customer_return_events',6);
        $this->assertDatabaseCount('inventory_return_movements',3);
        $this->assertDatabaseHas('inventory_return_movements',['source_reference'=>CustomerReturn::findOrFail($id)->reference,'direction'=>'RETURN_RESTOCK','quantity'=>3,'unit'=>'DRUM']);
    }

    public function test_pending_and_completed_returns_reserve_fulfilled_quantities_and_idempotent_registration_creates_one(): void
    {
        $payload = $this->payload(['quantity'=>3]);
        $id = $this->actingAs($this->admin)->postJson('/api/customer-returns',$payload)->assertCreated()->json('data.id');
        $this->postJson('/api/customer-returns',$payload)->assertCreated()->assertJsonPath('data.id',$id);
        $this->postJson('/api/customer-returns',array_replace($payload,['quantity'=>2]))->assertStatus(409);
        $this->postJson('/api/customer-returns',$this->payload(['quantity'=>3]))->assertUnprocessable()->assertJsonValidationErrors('quantity');
        $this->getJson('/api/customer-returns/options?order_id='.$this->order->id)->assertOk()->assertJsonPath('lines.0.remaining_returnable_quantity',2);
        $this->assertDatabaseCount('customer_returns',1);
        $this->receive($id,3); $this->inspect($id,3,0);
        $this->actingAs($this->manager); $this->action($id,'restock',[],false)->assertOk()->assertJsonPath('data.status','COMPLETED');
        $this->actingAs($this->admin)->postJson('/api/customer-returns',$this->payload(['quantity'=>3]))->assertUnprocessable();
    }

    public function test_forwarding_is_a_verification_hold_and_receipt_requires_explicit_admin_approval(): void
    {
        $this->order->update(['status'=>'FORWARDED_TO_LOGISTICS']);
        $id = $this->register();
        $this->getJson('/api/customer-returns/'.$id)->assertOk()->assertJsonPath('data.verification_status','DELIVERY_VERIFICATION_HOLD');
        $this->actingAs($this->manager);
        $this->action($id,'receive',['quantity'=>5,'received_at'=>today()->toDateString(),'condition'=>'SEALED','qa_user_id'=>$this->qa->id])->assertUnprocessable();
        $this->actingAs($this->admin);
        $this->action($id,'approve',['verification_reference'=>'Unverified delivery','delivery_verified'=>false])->assertUnprocessable();
        $this->action($id,'approve',['verification_reference'=>'Independent confirmation RET-1','delivery_verified'=>true],false)->assertUnprocessable();
        $this->receive($id);
        $this->assertSame('FORWARDED_TO_LOGISTICS',$this->order->fresh()->status);
    }

    public function test_role_warehouse_qa_and_private_evidence_scope_are_enforced(): void
    {
        $this->getJson('/api/customer-returns')->assertUnauthorized();
        $supplier = $this->actor('SUPPLIER');
        $this->actingAs($supplier)->getJson('/api/customer-returns')->assertForbidden();
        $this->actingAs($this->manager)->postJson('/api/customer-returns',$this->payload())->assertForbidden();
        $id = $this->register(); $this->receive($id);
        $detail = $this->actingAs($this->manager)->getJson('/api/customer-returns/'.$id)->assertOk();
        $url = '/api'.$detail->json('data.evidence.0.view_url');
        $this->get($url)->assertOk()->assertHeader('Cache-Control','no-store, private');
        $otherManager = $this->actor('PLANT_MANAGER');
        $otherQa = $this->actor('QA_SUPERVISOR');
        $this->actingAs($otherManager)->getJson('/api/customer-returns/'.$id)->assertForbidden();
        $this->actingAs($otherQa)->getJson('/api/customer-returns/'.$id)->assertNotFound();
        $this->get($url)->assertNotFound();
        $this->action($id,'inspect',['passed_quantity'=>5,'failed_quantity'=>0,'findings'=>'Other QA','policy_reference'=>'Policy reference','suitability_confirmed'=>true])->assertNotFound();
        $second = $this->registerOtherItem();
        $fileId = $detail->json('data.evidence.0.id');
        $this->actingAs($this->admin)->get("/api/customer-returns/{$second}/evidence/{$fileId}")->assertNotFound();
    }

    private function registerOtherItem(): int
    {
        $this->actionScopeAdmin();
        $item = $this->order->items()->first();
        $new = $this->order->items()->create($item->only(['product_id','product_name','quantity','unit','unit_price','subtotal']));
        $tx = StockOutTransaction::first();
        StockOutTransaction::create(array_replace($tx->only(['order_id','inventory_id','product_id','warehouse_id','barcode','quantity','unit','performed_by']),['reference_no'=>(string)Str::uuid(),'idempotency_key'=>(string)Str::uuid(),'order_item_id'=>$new->id]));
        return $this->register(['order_item_id'=>$new->id]);
    }
    private function actionScopeAdmin(): void { $this->actingAs($this->admin); }

    public function test_failed_items_never_stock_in_and_disposal_stays_pending_until_documented(): void
    {
        $id = $this->register(); $this->receive($id); $this->inspect($id,0,5);
        $this->actingAs($this->manager); $this->action($id,'restock',[],false)->assertUnprocessable();
        $this->assertSame(10,$this->inventory->fresh()->available_stock);
        $this->assertSame(5,$this->inventory->fresh()->returned_stock);
        $this->assertDatabaseHas('customer_returns',['id'=>$id,'disposal_status'=>'FOR_DISPOSAL','status'=>'PENDING_DISPOSITION']);
        $this->actingAs($this->admin);
        $this->action($id,'dispose',['reason'=>'Not yet disposed','disposal_date'=>today()->toDateString(),'policy_reference'=>'DISP reference','physical_disposal_confirmed'=>false])->assertUnprocessable();
    }

    public function test_qa_requires_reconciled_quantities_evidence_and_explicit_restock_suitability(): void
    {
        $id = $this->register(); $this->receive($id); $this->actingAs($this->qa);
        $values = ['passed_quantity'=>3,'failed_quantity'=>1,'findings'=>'Inspected product','policy_reference'=>'Policy reference','suitability_confirmed'=>true];
        $this->action($id,'inspect',$values)->assertUnprocessable();
        $values['failed_quantity'] = 2; $values['suitability_confirmed'] = false;
        $this->action($id,'inspect',$values)->assertUnprocessable();
        $values['suitability_confirmed'] = true;
        $this->action($id,'inspect',$values,false)->assertUnprocessable();
        $this->action($id,'inspect',$values)->assertOk();
        $this->action($id,'inspect',$values)->assertOk();
        $this->assertDatabaseCount('customer_return_events',4);
    }

    public function test_returned_and_regular_storage_capacity_block_receipt_and_restock_atomically(): void
    {
        $this->warehouse->update(['capacity_returned'=>2,'capacity'=>152]);
        $id = $this->register();
        $this->action($id,'approve',['verification_reference'=>'Delivery verified RET1','delivery_verified'=>true])->assertOk();
        $this->actingAs($this->manager);
        $this->action($id,'receive',['quantity'=>5,'received_at'=>today()->toDateString(),'condition'=>'SEALED','qa_user_id'=>$this->qa->id])->assertUnprocessable();
        $this->assertSame(0,$this->inventory->fresh()->returned_stock);
        $this->warehouse->update(['capacity_returned'=>50,'capacity'=>200]);
        $this->action($id,'receive',['quantity'=>5,'received_at'=>today()->toDateString(),'condition'=>'SEALED','qa_user_id'=>$this->qa->id])->assertOk();
        $this->inspect($id,5,0);
        $this->warehouse->update(['capacity_liquid'=>10,'capacity'=>160]);
        $this->actingAs($this->manager); $this->action($id,'restock',[],false)->assertUnprocessable();
        $this->assertSame(5,$this->inventory->fresh()->returned_stock);
        $this->assertSame(10,$this->inventory->fresh()->available_stock);
    }

    public function test_missing_fulfillment_mismatched_units_and_cancellation_preserve_balances(): void
    {
        $otherOrder = $this->order->replicate();
        $otherOrder->order_no = 'SO-RETURN-OTHER';
        $otherOrder->save();
        StockOutTransaction::query()->update(['order_id'=>$otherOrder->id]);
        $this->actingAs($this->admin)->postJson('/api/customer-returns',$this->payload())->assertUnprocessable();
        StockOutTransaction::query()->update(['order_id'=>$this->order->id,'quantity'=>0]);
        $this->postJson('/api/customer-returns',$this->payload())->assertUnprocessable();
        StockOutTransaction::query()->update(['quantity'=>5]);
        StockOutTransaction::query()->update(['unit'=>'SACK']);
        $this->actingAs($this->admin)->postJson('/api/customer-returns',$this->payload())->assertUnprocessable();
        StockOutTransaction::query()->update(['unit'=>'DRUM']);
        $id = $this->register();
        $this->action($id,'cancel',['reason'=>'Customer withdrew request'],false)->assertOk()->assertJsonPath('data.status','CANCELLED');
        $this->getJson('/api/customer-returns/options?order_id='.$this->order->id)->assertOk()->assertJsonPath('lines.0.remaining_returnable_quantity',5);
        $this->assertSame(0,$this->inventory->fresh()->returned_stock);
        $this->action($id,'approve',['verification_reference'=>'Too late approval','delivery_verified'=>true])->assertUnprocessable();
        $this->postJson('/api/customer-returns',$this->payload(['order_item_id'=>999999]))->assertUnprocessable();
    }

    public function test_short_receipt_is_explicitly_reconciled_and_preserves_other_quarantine_stock(): void
    {
        $this->inventory->update(['returned_stock'=>7]);
        $id = $this->register();
        $this->action($id,'approve',['verification_reference'=>'Synthetic independent receipt confirmation','delivery_verified'=>true])->assertOk();
        $this->actingAs($this->manager);
        $this->action($id,'receive',['quantity'=>3,'received_at'=>today()->toDateString(),'condition'=>'SEALED','qa_user_id'=>$this->qa->id])->assertUnprocessable()->assertJsonValidationErrors('shortage_reason');
        $this->assertSame(7,$this->inventory->fresh()->returned_stock);
        $this->receive($id,3); $this->inspect($id,3,0);
        $this->actingAs($this->manager); $this->action($id,'restock',[],false)->assertOk()->assertJsonPath('data.status','COMPLETED');
        $this->assertSame(7,$this->inventory->fresh()->returned_stock);
        $this->actingAs($this->admin)->getJson('/api/customer-returns/options?order_id='.$this->order->id)->assertOk()->assertJsonPath('lines.0.remaining_returnable_quantity',2);
    }

    public function test_list_is_eight_rows_and_search_status_scoped(): void
    {
        for ($i=0;$i<9;$i++) { $id = $this->register(['quantity'=>1]); $this->action($id,'reject',['reason'=>'Rejected request '.$i],false)->assertOk(); }
        $this->getJson('/api/customer-returns?status=REJECTED')->assertOk()->assertJsonCount(8,'data')->assertJsonPath('total',9)->assertJsonPath('last_page',2);
        $this->getJson('/api/customer-returns?status=REJECTED&page=2')->assertOk()->assertJsonCount(1,'data');
        $this->getJson('/api/customer-returns?search=not-present')->assertOk()->assertJsonPath('total',0);
        $this->getJson('/api/customer-returns?status=PENDING_QA')->assertOk()->assertJsonPath('total',0);
    }

    public function test_browser_string_quantities_reconcile_and_invalid_evidence_rolls_back_receipt(): void
    {
        $id = $this->register();
        $this->action($id,'approve',['verification_reference'=>'Delivery confirmation RET','delivery_verified'=>'1'])->assertOk();
        $this->actingAs($this->manager);
        $values = ['quantity'=>'5','received_at'=>today()->toDateString(),'condition'=>'SEALED','qa_user_id'=>(string)$this->qa->id];
        $bad = $values + ['evidence'=>[UploadedFile::fake()->create('script.html',1,'text/html')]];
        $this->post("/api/customer-returns/{$id}/receive",$bad,['Accept'=>'application/json'])->assertUnprocessable();
        $this->assertSame(0,$this->inventory->fresh()->returned_stock);
        $this->action($id,'receive',$values)->assertOk()->assertJsonPath('data.received_quantity',5);
        $this->actingAs($this->qa);
        $this->action($id,'inspect',['passed_quantity'=>'0','failed_quantity'=>'5','findings'=>'Failed under QA review','policy_reference'=>'Handling policy RET','suitability_confirmed'=>'0'])->assertOk()
            ->assertJsonPath('data.disposal_status','FOR_DISPOSAL');
        $this->assertSame(10,$this->inventory->fresh()->available_stock);
    }

    public function test_canonical_package_units_keep_independent_quarantine_and_no_conversion(): void
    {
        foreach (['PCS','SACK','DRUM'] as $unit) {
            $this->inventory->product->update(['unit'=>$unit]);
            $this->order->items()->whereKey($this->itemId)->update(['unit'=>$unit]);
            StockOutTransaction::where('order_item_id',$this->itemId)->update(['unit'=>$unit]);
            $id = $this->register(['quantity'=>1]); $this->receive($id,1); $this->inspect($id,1,0);
            $this->actingAs($this->manager); $this->action($id,'restock',[],false)->assertOk()->assertJsonPath('data.unit',$unit)->assertJsonPath('data.restocked_quantity',1);
            $this->assertSame(0,$this->inventory->fresh()->returned_stock);
        }
        $this->assertSame(13,$this->inventory->fresh()->available_stock);
    }
}
