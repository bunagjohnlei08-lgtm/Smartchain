<?php

namespace Tests\Feature;

use App\Models\{BidEvaluation,Branch,Product,PurchaseOrder,ReplenishmentRequest,Rfq,Role,Supplier,SupplierApplication,SupplierApplicationAttachment,SupplierAward,SupplierAwardLine,SupplierBidLine,SupplierBidRevision,SupplierQuotation,User,Warehouse};
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class Phase4PostgresConcurrencyTest extends TestCase
{
    use DatabaseTruncation;

    private User $admin; private Rfq $rfq; private array $suppliers=[]; private array $users=[];

    protected function setUp(): void
    {
        parent::setUp();$this->travelTo(Carbon::parse('2026-10-23 09:00:00'));
        $this->admin=$this->user('ADMIN');$product=Product::create(['name'=>'Concurrent Chemical','category'=>'CHEMICALS','unit'=>'L','cost_price'=>250,'selling_price'=>300,'reorder_level'=>10]);$branch=Branch::create(['name'=>'Concurrency','code'=>'CON']);$warehouse=Warehouse::create(['name'=>'Concurrency Warehouse','code'=>'CON-WH','branch_id'=>$branch->id]);$manager=$this->user('PLANT_MANAGER',['branch_id'=>$branch->id,'warehouse_id'=>$warehouse->id]);$requirement=ReplenishmentRequest::create(['request_no'=>'RR-CON-1','requested_by'=>$manager->id,'warehouse_id'=>$warehouse->id,'product_id'=>$product->id,'requested_qty'=>100,'priority'=>'High','status'=>ReplenishmentRequest::STATUS_APPROVED,'sourcing_method'=>ReplenishmentRequest::SOURCING_COMPETITIVE]);$this->rfq=Rfq::create(['rfq_number'=>'RFQ-CON-1','title'=>'Concurrency','status'=>Rfq::OPEN,'opens_at'=>now()->subHour(),'closes_at'=>now()->addHour(),'required_delivery_date'=>now()->addDays(10)->toDateString(),'delivery_destination'=>'Concurrency Warehouse','partial_offers_allowed'=>true,'split_awards_allowed'=>true,'minimum_decrement'=>5,'currency'=>'PHP','show_reference_price'=>true,'show_lowest_bid'=>true,'evaluation_criteria'=>[['name'=>'Price','weight'=>100]],'version'=>1,'created_by'=>$this->admin->id,'approved_by'=>$this->admin->id,'approved_at'=>now()->subDay(),'published_by'=>$this->admin->id,'published_at'=>now()->subHour()]);$this->rfq->lines()->create(['replenishment_request_id'=>$requirement->id,'product_id'=>$product->id,'product_name'=>$product->name,'category'=>'CHEMICALS','unit'=>'L','required_quantity'=>100,'public_specification'=>'Industrial grade','reference_unit_price'=>250,'publish_reference_price'=>true]);
        foreach([1,2,3]as$i){$supplier=$this->supplier("SUP-CON-{$i}");$this->suppliers[$i]=$supplier;$this->users[$i]=$this->user('SUPPLIER',['supplier_id'=>$supplier->id]);$this->approveDocuments($supplier);}
    }

    protected function tearDown(): void
    {
        try {
            // Worker processes require committed fixtures, so DatabaseTruncation
            // is used instead of transactions. Clear those fixtures after every
            // scenario so later RefreshDatabase tests inherit a clean database.
            $this->assertIsolatedTestDatabase();
            $this->truncateTablesForAllConnections();
            $this->restoreMigrationReferenceData();
        } finally {
            parent::tearDown();
        }
    }

    protected function beforeTruncatingDatabase(): void
    {
        $this->assertIsolatedTestDatabase();
    }

    private function assertIsolatedTestDatabase(): void
    {
        $identity = DB::selectOne('select current_database() as database_name, current_user as user_name');
        if (! app()->environment('testing') || config('database.default') !== 'pgsql'
            || $identity->database_name !== 'smartchain_test_db' || $identity->user_name !== 'smartchain_test_user') {
            throw new \RuntimeException('Refusing concurrency test truncation outside the isolated PostgreSQL test database.');
        }
    }

    private function restoreMigrationReferenceData(): void
    {
        DB::table('roles')->insert([
            'slug' => 'SUPPLIER', 'name' => 'Supplier',
            'description' => 'Accredited supplier portal access',
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_simultaneous_reverse_bids_revalidate_the_committed_best_price(): void
    {
        app(\App\Services\ReverseBidService::class)->submit($this->users[1],$this->bidPayload('con-initial-00001',240));
        $outcomes=$this->runWorkers('reverse-bid', [['user_id'=>$this->users[2]->id,'data'=>$this->bidPayload('con-worker-a-00001',235)],['user_id'=>$this->users[3]->id,'data'=>$this->bidPayload('con-worker-b-00001',235)]]);
        $this->assertNotSame($outcomes[0]['pid'],$outcomes[1]['pid']);$this->assertSame(1,collect($outcomes)->where('ok',true)->count());$loser=collect($outcomes)->firstWhere('ok',false);$this->assertSame(409,$loser['status']);$this->assertDatabaseCount('supplier_quotations',2);$this->assertDatabaseCount('supplier_bid_revisions',2);$this->assertSame('235.00',(string)SupplierBidRevision::where('status','ACTIVE')->min('unit_price'));
        $winnerIndex=$outcomes[0]['ok']?0:1;$winnerPayload=$this->bidPayload($winnerIndex===0?'con-worker-a-00001':'con-worker-b-00001',235);$retry=app(\App\Services\ReverseBidService::class)->submit($this->users[$winnerIndex+2],$winnerPayload);$this->assertSame($outcomes[$winnerIndex]['result']['quotation_id'],$retry->id);$this->assertDatabaseCount('supplier_bid_revisions',2);
    }

    public function test_concurrent_award_approvals_commit_one_complete_decision(): void
    {
        $bid=$this->qualifiedBid();$payload=$this->awardPayload($bid,'con-award-a-00001');$other=$payload;$other['idempotency_key']='con-award-b-00001';$outcomes=$this->runWorkers('award', [['user_id'=>$this->admin->id,'rfq_id'=>$this->rfq->id,'data'=>$payload],['user_id'=>$this->admin->id,'rfq_id'=>$this->rfq->id,'data'=>$other]]);
        $this->assertNotSame($outcomes[0]['pid'],$outcomes[1]['pid']);$this->assertSame(1,collect($outcomes)->where('ok',true)->count());$this->assertSame(409,collect($outcomes)->firstWhere('ok',false)['status']);$this->assertDatabaseCount('supplier_awards',1);$this->assertDatabaseCount('supplier_award_lines',1);$this->assertSame(100,(int)SupplierAwardLine::sum('awarded_quantity'));$this->assertDatabaseCount('purchase_orders',0);
        $winner=SupplierAward::firstOrFail();$retry=$this->awardPayload($bid,$winner->idempotency_key);$this->actingAs($this->admin)->postJson("/api/admin/procurement/rfqs/{$this->rfq->id}/award",$retry)->assertCreated()->assertJsonPath('data.id',$winner->id);$this->assertDatabaseCount('supplier_awards',1);
    }

    public function test_supplier_suspension_and_award_follow_authoritative_lock_order(): void
    {
        $bid=$this->qualifiedBid();$award=['user_id'=>$this->admin->id,'rfq_id'=>$this->rfq->id,'data'=>$this->awardPayload($bid,'con-suspend-first1')];$suspend=['user_id'=>$this->admin->id,'supplier_id'=>$this->suppliers[1]->id,'prelock'=>true,'data'=>['status'=>Supplier::STATUS_ON_HOLD]];$first=$this->runWorkers(['suspend','award'],[$suspend,$award]);$this->assertTrue($first[0]['ok'],json_encode($first));$this->assertFalse($first[1]['ok'],json_encode($first));$this->assertSame(422,$first[1]['status']);$this->assertDatabaseCount('supplier_awards',0);$this->assertDatabaseHas('audit_logs',['action'=>'RFQ_AWARD_APPROVAL_REJECTED','status'=>'FAILED']);
        Supplier::query()->whereKey($this->suppliers[1]->id)->update(['status'=>Supplier::STATUS_ACTIVE]);$award['data']['idempotency_key']='con-award-first-01';$award['supplier_id']=$this->suppliers[1]->id;$suspend['prelock']=false;$second=$this->runWorkers(['award-prelocked','suspend'],[$award,$suspend]);$this->assertTrue($second[0]['ok'],json_encode($second));$this->assertTrue($second[1]['ok'],json_encode($second));$this->assertDatabaseCount('supplier_awards',1);$this->assertDatabaseCount('supplier_award_lines',1);$this->assertSame(Supplier::STATUS_ON_HOLD,$this->suppliers[1]->fresh()->status);$this->assertDatabaseCount('purchase_orders',0);
    }

    public function test_concurrent_award_to_purchase_order_conversion_consumes_each_allocation_once(): void
    {
        $bid=$this->qualifiedBid();$payload=$this->awardPayload($bid,'con-award-to-po-001');
        $this->actingAs($this->admin)->postJson("/api/admin/procurement/rfqs/{$this->rfq->id}/award",$payload)->assertCreated();
        $award=SupplierAward::firstOrFail();$spec=['user_id'=>$this->admin->id,'award_id'=>$award->id];
        $outcomes=$this->runWorkers('award-to-po',[$spec,$spec]);
        $this->assertNotSame($outcomes[0]['pid'],$outcomes[1]['pid']);$this->assertTrue($outcomes[0]['ok']);$this->assertTrue($outcomes[1]['ok']);
        $this->assertSame(1,collect($outcomes)->where('result.created',true)->count());$this->assertDatabaseCount('purchase_orders',1);$this->assertDatabaseCount('purchase_order_items',1);
        $order=PurchaseOrder::firstOrFail();$this->assertSame($award->id,$order->supplier_award_id);$this->assertSame(PurchaseOrder::STATUS_PENDING_APPROVAL,$order->status);$this->assertNull($order->approved_by);$this->assertSame(100,(int)$order->items()->sum('ordered_quantity'));$this->assertDatabaseCount('inventories',0);
    }

    private function runWorkers(string|array $scenarios,array $specs):array
    {
        $scenarios=is_array($scenarios)?$scenarios:[$scenarios,$scenarios];$barrier=storage_path('framework/testing/phase4-concurrency-'.Str::uuid());mkdir($barrier,0700,true);$processes=[];
        try{foreach([0,1]as$i){$worker='worker-'.$i;$spec="{$barrier}/{$worker}.spec.json";$specs[$i]['_test_now']=now()->toIso8601String();file_put_contents($spec,json_encode($specs[$i],JSON_THROW_ON_ERROR));$processes[$i]=new Process([PHP_BINARY,'artisan','phase4:concurrency-worker',$scenarios[$i],$worker,$barrier,$spec],base_path(),['APP_ENV'=>'testing','DB_CONNECTION'=>'pgsql','DB_DATABASE'=>'smartchain_test_db']);$processes[$i]->setTimeout(25);$processes[$i]->start();}$deadline=microtime(true)+10;while(!(is_file("{$barrier}/worker-0.ready.json")&&is_file("{$barrier}/worker-1.ready.json"))){if(microtime(true)>=$deadline)$this->fail('Workers did not reach the concurrency barrier. '.implode(' | ',array_map(fn($p)=>$p->getErrorOutput(),$processes)));usleep(20_000);}file_put_contents("{$barrier}/start",'go');foreach($processes as$process)$process->wait();$outcomes=[];foreach([0,1]as$i){$path="{$barrier}/worker-{$i}.outcome.json";$this->assertFileExists($path,"Worker {$i} produced no outcome. stderr: ".$processes[$i]->getErrorOutput());$outcomes[$i]=json_decode(file_get_contents($path),true,512,JSON_THROW_ON_ERROR);if($processes[$i]->getExitCode()!==0&&($outcomes[$i]['status']??500)>=500)$this->fail("Worker {$i} failed: ".json_encode($outcomes[$i]));}return$outcomes;}finally{foreach($processes as$process)if($process->isRunning())$process->stop(1);foreach(glob("{$barrier}/*")?:[]as$file)@unlink($file);@rmdir($barrier);}
    }

    private function user(string $slug,array $attributes=[]):User{$role=Role::firstOrCreate(['slug'=>$slug],['name'=>str_replace('_',' ',$slug)]);return User::factory()->create([...$attributes,'role_id'=>$role->id,'status'=>'ACTIVE']);}
    private function supplier(string $code):Supplier{return Supplier::create(['supplier_code'=>$code,'name'=>$code,'contact_person'=>'Contact','email'=>strtolower($code).'@example.test','phone'=>'09170000000','address'=>'Manila','business_type'=>'Corporation','supply_category'=>'CHEMICALS','status'=>Supplier::STATUS_ACTIVE,'accreditation_status'=>'ACTIVE','accredited_at'=>now()->subDay(),'accreditation_expires_on'=>now()->addYear()]);}
    private function approveDocuments(Supplier $supplier):void{$application=SupplierApplication::create(['application_number'=>'APP-'.$supplier->supplier_code,'company_name'=>$supplier->name,'owner_name'=>'Owner','normalized_company_name'=>strtolower($supplier->name),'address'=>'Manila','contact_person'=>'Contact','email'=>$supplier->email,'normalized_email'=>$supplier->email,'phone'=>'09170000000','business_type'=>'Corporation','supply_category'=>'CHEMICALS','products_services'=>'Chemicals','status'=>SupplierApplication::STATUS_APPROVED,'submitted_at'=>now()->subMonth(),'approved_supplier_id'=>$supplier->id]);foreach([SupplierApplicationAttachment::TYPE_BUSINESS_CERTIFICATE,SupplierApplicationAttachment::TYPE_BUSINESS_PERMIT]as$type)$application->attachments()->create(['attachment_type'=>$type,'original_name'=>$type.'.pdf','stored_path'=>'tests/'.$supplier->id.'/'.$type.'.pdf','mime_type'=>'application/pdf','file_size'=>100,'is_current'=>true,'verification_status'=>SupplierApplicationAttachment::STATUS_VERIFIED,'verified_at'=>now(),'expires_on'=>now()->addYear()]);}
    private function bidPayload(string $key,int $price):array{$line=$this->rfq->lines()->firstOrFail();return['rfq_id'=>$this->rfq->id,'rfq_version'=>1,'idempotency_key'=>$key,'tax_included'=>true,'freight_included'=>true,'commercial_terms'=>'Net 30','lines'=>[['rfq_line_id'=>$line->id,'unit'=>'L','unit_price'=>(string)$price,'offered_quantity'=>100,'lead_time_days'=>3,'delivery_available_on'=>now()->addDays(5)->toDateString(),'remarks'=>'Concurrent offer']]];}
    private function qualifiedBid():SupplierBidLine{$quote=app(\App\Services\ReverseBidService::class)->submit($this->users[1],$this->bidPayload('con-qualified-0001',240));$this->rfq->update(['status'=>Rfq::CLOSED,'closes_at'=>now()->subMinute()]);$bid=$quote->lines()->firstOrFail();$revision=$bid->activeRevision()->firstOrFail();BidEvaluation::create(['supplier_bid_line_id'=>$bid->id,'supplier_bid_revision_id'=>$revision->id,'mandatory_passed'=>true,'mandatory_results'=>['technical'=>true],'criterion_scores'=>['Price'=>100],'weighted_score'=>100,'qualification_reason'=>'Qualified','evaluated_by'=>$this->admin->id,'evaluated_at'=>now()]);$bid->update(['status'=>'QUALIFIED']);return$bid;}
    private function awardPayload(SupplierBidLine $bid,string $key):array{return['idempotency_key'=>$key,'outcome'=>'FULL_AWARD','justification'=>'Best evaluated compliant offer.','lines'=>[['rfq_line_id'=>$bid->rfq_line_id,'supplier_bid_revision_id'=>$bid->activeRevision()->firstOrFail()->id,'awarded_quantity'=>100,'override_reason'=>null]]];}
}
