<?php
namespace Tests\Feature;
use App\Models\{Branch,Product,ReplenishmentRequest,Rfq,Role,Supplier,SupplierApplication,SupplierApplicationAttachment,User,Warehouse};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class RfqImageAndInterestJourneyTest extends TestCase
{
 use RefreshDatabase;

 public function test_admin_can_upload_replace_remove_and_public_access_is_publication_scoped():void
 {
  Storage::fake('local');[$admin,$supplierUser,$line]=$this->fixture('WOOD PRESERVATIVE PRODUCTS');
  $url="/api/admin/procurement/rfq-lines/{$line->id}/image";$public="/api/public/rfq-lines/{$line->id}/image";
  $this->actingAs($supplierUser)->postJson($url,['image'=>UploadedFile::fake()->image('blocked.jpg')])->assertForbidden();
  $this->actingAs($admin)->postJson($url,['image'=>UploadedFile::fake()->create('script.jpg',10,'text/plain')])->assertUnprocessable();
  $this->actingAs($admin)->postJson($url,['image'=>UploadedFile::fake()->create('large.png',5121,'image/png')])->assertUnprocessable();
  $this->actingAs($admin)->postJson($url,['image'=>UploadedFile::fake()->image('first.jpg',600,400)])->assertOk();
  $first=$line->fresh()->public_image_path;$this->assertNotNull($first);Storage::disk('local')->assertExists($first);$this->get($public)->assertNotFound();
  $this->actingAs($admin)->postJson($url,['image'=>UploadedFile::fake()->image('replacement.png',600,400)])->assertOk();
  $second=$line->fresh()->public_image_path;$this->assertNotSame($first,$second);Storage::disk('local')->assertMissing($first);Storage::disk('local')->assertExists($second);
  $line->rfq->update(['status'=>Rfq::OPEN,'published_at'=>now(),'published_by'=>$admin->id,'approved_at'=>now(),'approved_by'=>$admin->id,'opens_at'=>now()->subMinute()]);
  $this->get($public)->assertOk()->assertHeader('x-content-type-options','nosniff');
  $this->actingAs($admin)->deleteJson($url)->assertStatus(422);
  $this->actingAs($admin)->deleteJson($url,['reason'=>'Remove incorrect public photo'])->assertOk();Storage::disk('local')->assertMissing($second);
 }

 public function test_distinct_images_are_associated_with_their_own_rfq_lines():void
 {
  Storage::fake('local');[$admin,,$first]=$this->fixture('TOOLS');$requirement=$this->requirement($first->replenishmentRequest->requester,$first->replenishmentRequest->warehouse,'Second Product','PCS');$second=$first->rfq->lines()->create(['replenishment_request_id'=>$requirement->id,'product_id'=>$requirement->product_id,'product_name'=>$requirement->product->name,'category'=>'TOOLS','unit'=>'PCS','required_quantity'=>5,'public_specification'=>'Second specification','publish_reference_price'=>false]);
  $this->actingAs($admin)->postJson("/api/admin/procurement/rfq-lines/{$first->id}/image",['image'=>UploadedFile::fake()->image('one.jpg')])->assertOk();
  $this->actingAs($admin)->postJson("/api/admin/procurement/rfq-lines/{$second->id}/image",['image'=>UploadedFile::fake()->image('two.png')])->assertOk();
  $this->assertNotSame($first->fresh()->public_image_path,$second->fresh()->public_image_path);
 }

 public function test_ineligible_public_selection_cannot_be_saved_as_interest():void
 {
  [$admin,$supplierUser,$line]=$this->fixture('WOOD PRESERVATIVE PRODUCTS','Tools',true);$line->rfq->update(['status'=>Rfq::OPEN,'published_at'=>now(),'published_by'=>$admin->id,'approved_at'=>now(),'approved_by'=>$admin->id,'opens_at'=>now()->subMinute()]);
  $this->actingAs($supplierUser)->postJson('/api/supplier-account/bidding-interests',['rfq_line_ids'=>[$line->id]])->assertForbidden();
  $this->assertDatabaseCount('supplier_bidding_interests',0);
  $this->actingAs($supplierUser)->getJson('/api/supplier-account/profile')->assertOk()
   ->assertJsonPath('data.account_status','ACTIVE')
   ->assertJsonPath('data.supplier.bidding_eligibility.eligible',true);
  $this->actingAs($supplierUser)->getJson('/api/supplier-account/rfqs')->assertOk()->assertJsonCount(0,'data');
  $this->actingAs($supplierUser)->getJson('/api/supplier-account/bidding-interests')->assertOk()->assertJsonCount(0,'data');
 }

 public function test_eligible_supplier_sees_open_opportunity_and_can_retain_interest_after_closure():void
 {
  [$admin,$supplierUser,$line]=$this->fixture('TOOLS','Tools',true);$line->rfq->update(['status'=>Rfq::OPEN,'published_at'=>now(),'published_by'=>$admin->id,'approved_at'=>now(),'approved_by'=>$admin->id,'opens_at'=>now()->subMinute()]);
  $this->actingAs($supplierUser)->postJson('/api/supplier-account/bidding-interests',['rfq_line_ids'=>[$line->id]])->assertOk();
  $this->actingAs($supplierUser)->getJson('/api/supplier-account/rfqs')->assertOk()->assertJsonPath('data.0.lines.0.id',$line->id);
  $line->rfq->update(['status'=>Rfq::CLOSED,'closes_at'=>now()->subMinute()]);
  $this->actingAs($supplierUser)->getJson('/api/supplier-account/bidding-interests')->assertOk()->assertJsonPath('data.0.eligibility_status','RFQ_CLOSED')->assertJsonPath('data.0.can_bid',false);
 }

 private function fixture(string $lineCategory,string $supplierCategory='Tools',bool $eligible=false):array
 {
  $adminRole=Role::firstOrCreate(['slug'=>'ADMIN'],['name'=>'Admin']);$supplierRole=Role::firstOrCreate(['slug'=>'SUPPLIER'],['name'=>'Supplier']);$managerRole=Role::firstOrCreate(['slug'=>'PLANT_MANAGER'],['name'=>'Plant Manager']);
  $admin=User::factory()->create(['role_id'=>$adminRole->id,'status'=>'ACTIVE']);$manager=User::factory()->create(['role_id'=>$managerRole->id,'status'=>'ACTIVE']);$branch=Branch::create(['name'=>'Journey','code'=>'JOURNEY']);$warehouse=Warehouse::create(['name'=>'Journey Warehouse','code'=>'JOURNEY-WH','branch_id'=>$branch->id]);$requirement=$this->requirement($manager,$warehouse,'Journey Product','PCS');
  $rfq=Rfq::create(['rfq_number'=>'RFQ-JOURNEY','title'=>'Journey','status'=>Rfq::DRAFT,'opens_at'=>now()->addMinute(),'closes_at'=>now()->addDay(),'required_delivery_date'=>now()->addDays(3)->toDateString(),'delivery_destination'=>'Journey Warehouse','minimum_decrement'=>'1.00','currency'=>'PHP','created_by'=>$admin->id]);$line=$rfq->lines()->create(['replenishment_request_id'=>$requirement->id,'product_id'=>$requirement->product_id,'product_name'=>$requirement->product->name,'category'=>$lineCategory,'unit'=>'PCS','required_quantity'=>5,'public_specification'=>'Factory sealed','publish_reference_price'=>false]);
  $supplier=Supplier::create(['supplier_code'=>'SUP-JOURNEY','name'=>'Journey Supplier','contact_person'=>'Supplier User','email'=>'supplier@example.test','phone'=>'1234567','address'=>'Journey address','business_type'=>'Corporation','supply_category'=>$supplierCategory,'status'=>'ACTIVE','accreditation_status'=>'ACTIVE','accredited_at'=>now(),'accreditation_expires_on'=>$eligible?now()->addYear()->toDateString():null]);$supplierUser=User::factory()->create(['role_id'=>$supplierRole->id,'supplier_id'=>$supplier->id,'status'=>'ACTIVE']);
  if($eligible){$application=SupplierApplication::create(['application_number'=>'SUP-APP-JOURNEY','company_name'=>$supplier->name,'owner_name'=>'Owner','normalized_company_name'=>'journey supplier','address'=>$supplier->address,'contact_person'=>$supplier->contact_person,'email'=>$supplier->email,'normalized_email'=>$supplier->email,'phone'=>$supplier->phone,'business_type'=>$supplier->business_type,'supply_category'=>$supplier->supply_category,'status'=>SupplierApplication::STATUS_APPROVED,'submitted_at'=>now(),'approved_supplier_id'=>$supplier->id]);foreach([SupplierApplicationAttachment::TYPE_BUSINESS_CERTIFICATE,SupplierApplicationAttachment::TYPE_BUSINESS_PERMIT]as$type)$application->attachments()->create(['attachment_type'=>$type,'original_name'=>'verified.pdf','stored_path'=>'test/'.strtolower($type).'.pdf','mime_type'=>'application/pdf','file_size'=>10,'verification_status'=>SupplierApplicationAttachment::STATUS_VERIFIED,'is_current'=>true]);}
  return[$admin,$supplierUser,$line];
 }
 private function requirement(User $manager,Warehouse $warehouse,string $name,string $unit):ReplenishmentRequest{$product=Product::create(['name'=>$name,'category'=>'TOOLS','unit'=>$unit,'item_classification'=>Product::RAW_MATERIAL]);return ReplenishmentRequest::create(['request_no'=>'RR-'.fake()->unique()->numerify('#####'),'requested_by'=>$manager->id,'warehouse_id'=>$warehouse->id,'product_id'=>$product->id,'requested_qty'=>5,'priority'=>'High','status'=>ReplenishmentRequest::STATUS_FOR_PURCHASE_ORDER,'sourcing_method'=>ReplenishmentRequest::SOURCING_COMPETITIVE,'submitted_at'=>now(),'reviewed_at'=>now()]);}
}
