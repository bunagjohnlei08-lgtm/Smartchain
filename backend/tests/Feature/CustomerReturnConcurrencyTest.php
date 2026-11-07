<?php

namespace Tests\Feature;

use App\Models\{Branch, CustomerReturn, Inventory, Order, Product, Role, StockOutTransaction, User, Warehouse};
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class CustomerReturnConcurrencyTest extends TestCase
{
    use DatabaseTruncation;

    private function guardDatabase(): void
    {
        $identity = DB::selectOne('select current_database() as database_name, current_user as user_name');
        if (!app()->environment('testing') || $identity->database_name !== 'smartchain_test_db' || $identity->user_name !== 'smartchain_test_user') throw new \RuntimeException('Unsafe concurrency database');
    }
    protected function beforeTruncatingDatabase(): void { $this->guardDatabase(); }
    protected function tearDown(): void
    {
        try {
            $this->guardDatabase(); $this->truncateTablesForAllConnections();
            DB::table('roles')->insert(['slug'=>'SUPPLIER','name'=>'Supplier','description'=>'Supplier portal','created_at'=>now(),'updated_at'=>now()]);
        } finally { parent::tearDown(); }
    }
    private function actor(string $role, ?int $warehouse=null): User
    {
        $role = Role::firstOrCreate(['slug'=>$role],['name'=>$role]);
        return User::factory()->create(['role_id'=>$role->id,'warehouse_id'=>$warehouse,'status'=>'ACTIVE']);
    }

    public function test_simultaneous_reservations_cannot_over_return_and_simultaneous_stock_in_moves_once(): void
    {
        Storage::fake('local');
        $branch = Branch::create(['name'=>'Concurrency','code'=>'RET-CON']);
        $warehouse = Warehouse::create(['name'=>'Concurrency','code'=>'RET-CON','branch_id'=>$branch->id,'capacity'=>200,'capacity_powder'=>50,'capacity_liquid'=>50,'capacity_solid'=>50,'capacity_returned'=>50]);
        $admin = $this->actor('ADMIN'); $manager = $this->actor('PLANT_MANAGER',$warehouse->id); $qa = $this->actor('QA_SUPERVISOR',$warehouse->id);
        $product = Product::create(['name'=>'Concurrent returns','unit'=>'PCS']);
        $inventory = Inventory::create(['product_id'=>$product->id,'warehouse_id'=>$warehouse->id,'barcode'=>'RETURN-CON','available_stock'=>10,'returned_stock'=>0]);
        $order = Order::create(['order_no'=>'SO-RET-CON','customer_name'=>'Customer','customer_address'=>'Manila','order_date'=>today()->subDays(2),'required_delivery_date'=>today(),'total_amount'=>50,'status'=>'DELIVERED']);
        $item = $order->items()->create(['product_id'=>$product->id,'product_name'=>$product->name,'quantity'=>5,'unit'=>'PCS','unit_price'=>10,'subtotal'=>50]);
        StockOutTransaction::create(['reference_no'=>(string)Str::uuid(),'idempotency_key'=>(string)Str::uuid(),'order_id'=>$order->id,'order_item_id'=>$item->id,'inventory_id'=>$inventory->id,'product_id'=>$product->id,'warehouse_id'=>$warehouse->id,'barcode'=>$inventory->barcode,'quantity'=>5,'unit'=>'PCS','performed_by'=>$manager->id]);
        $payload = ['order_item_id'=>$item->id,'warehouse_id'=>$warehouse->id,'quantity'=>3,'reason'=>'DAMAGED'];
        $results = $this->workers('register',[
            ['actor_id'=>$admin->id,'payload'=>$payload+['submission_key'=>(string)Str::uuid()]],
            ['actor_id'=>$admin->id,'payload'=>$payload+['submission_key'=>(string)Str::uuid()]],
        ]);
        $this->assertSame(1,collect($results)->where('ok',true)->count());
        $this->assertSame(422,collect($results)->firstWhere('ok',false)['status']);
        $this->assertDatabaseCount('customer_returns',1);
        $return = CustomerReturn::sole();
        $evidence = fn () => [UploadedFile::fake()->createWithContent('evidence.pdf',"%PDF-1.4\n%%EOF\n")];
        $url = '/api/customer-returns/'.$return->id;
        $this->actingAs($admin)->post($url.'/approve',['verification_reference'=>'Independent delivery CON','delivery_verified'=>true,'evidence'=>$evidence()],['Accept'=>'application/json'])->assertOk();
        $this->actingAs($manager)->post($url.'/receive',['quantity'=>3,'received_at'=>today()->toDateString(),'condition'=>'SEALED','qa_user_id'=>$qa->id,'evidence'=>$evidence()],['Accept'=>'application/json'])->assertOk();
        $this->actingAs($qa)->post($url.'/inspect',['passed_quantity'=>3,'failed_quantity'=>0,'findings'=>'Approved after QA review','policy_reference'=>'Storage suitability policy','suitability_confirmed'=>true,'evidence'=>$evidence()],['Accept'=>'application/json'])->assertOk();
        $results = $this->workers('restock',array_fill(0,2,['actor_id'=>$manager->id,'return_id'=>$return->id]));
        $this->assertTrue($results[0]['ok']); $this->assertTrue($results[1]['ok']);
        $this->assertSame(13,$inventory->fresh()->available_stock);
        $this->assertSame(0,$inventory->fresh()->returned_stock);
        $this->assertSame(1,DB::table('inventory_return_movements')->where('direction','RETURN_RESTOCK')->count());
        $this->assertSame('COMPLETED',$return->fresh()->status);
    }

    public function test_simultaneous_completed_disposal_is_recorded_once_without_deducting_available_stock(): void
    {
        Storage::fake('local');
        \Illuminate\Support\Facades\Http::preventStrayRequests();
        \Illuminate\Support\Facades\Http::fake();
        \Illuminate\Support\Facades\Mail::fake();
        \Illuminate\Support\Facades\Notification::fake();
        $branch = Branch::create(['name'=>'Disposal concurrency','code'=>'RET-DIS']);
        $warehouse = Warehouse::create(['name'=>'Disposal concurrency','code'=>'RET-DIS','branch_id'=>$branch->id,'capacity'=>200,'capacity_powder'=>50,'capacity_liquid'=>50,'capacity_solid'=>50,'capacity_returned'=>50]);
        $admin = $this->actor('ADMIN'); $manager = $this->actor('PLANT_MANAGER',$warehouse->id); $qa = $this->actor('QA_SUPERVISOR',$warehouse->id);
        $product = Product::create(['name'=>'Disposal test product','unit'=>'PCS']);
        $inventory = Inventory::create(['product_id'=>$product->id,'warehouse_id'=>$warehouse->id,'barcode'=>'RETURN-DIS','available_stock'=>10,'returned_stock'=>0]);
        $order = Order::create(['order_no'=>'SO-RET-DIS','customer_name'=>'Synthetic customer','customer_address'=>'Test fixture','order_date'=>today()->subDays(2),'required_delivery_date'=>today(),'total_amount'=>50,'status'=>'DELIVERED']);
        $item = $order->items()->create(['product_id'=>$product->id,'product_name'=>$product->name,'quantity'=>5,'unit'=>'PCS','unit_price'=>10,'subtotal'=>50]);
        StockOutTransaction::create(['reference_no'=>(string)Str::uuid(),'idempotency_key'=>(string)Str::uuid(),'order_id'=>$order->id,'order_item_id'=>$item->id,'inventory_id'=>$inventory->id,'product_id'=>$product->id,'warehouse_id'=>$warehouse->id,'barcode'=>$inventory->barcode,'quantity'=>5,'unit'=>'PCS','performed_by'=>$manager->id]);
        $id = $this->actingAs($admin)->postJson('/api/customer-returns',['submission_key'=>(string)Str::uuid(),'order_item_id'=>$item->id,'warehouse_id'=>$warehouse->id,'quantity'=>5,'reason'=>'DAMAGED'])->assertCreated()->json('data.id');
        $evidence = fn () => [UploadedFile::fake()->createWithContent('test.pdf',"%PDF-1.4\n%%EOF\n")];
        $url = '/api/customer-returns/'.$id;
        $this->post($url.'/approve',['verification_reference'=>'Synthetic independent delivery evidence','delivery_verified'=>true,'evidence'=>$evidence()],['Accept'=>'application/json'])->assertOk();
        $this->actingAs($manager)->post($url.'/receive',['quantity'=>5,'received_at'=>today()->toDateString(),'condition'=>'DAMAGED','qa_user_id'=>$qa->id,'evidence'=>$evidence()],['Accept'=>'application/json'])->assertOk();
        $this->actingAs($qa)->post($url.'/inspect',['passed_quantity'=>0,'failed_quantity'=>5,'findings'=>'Synthetic QA failure','policy_reference'=>'Synthetic QA policy','suitability_confirmed'=>false,'evidence'=>$evidence()],['Accept'=>'application/json'])->assertOk();
        $document = "%PDF-1.4\nSynthetic completed disposal evidence\n%%EOF\n";
        $path = 'customer-return-evidence/'.$id.'/'.Str::random(40).'.pdf';
        Storage::disk('local')->put($path,$document);
        $spec = ['actor_id'=>$admin->id,'return_id'=>$id,
            'payload'=>['reason'=>'Synthetic disposal completed','disposal_date'=>today()->toDateString(),'policy_reference'=>'Synthetic disposal record','physical_disposal_confirmed'=>true],
            'evidence'=>['original_name'=>'synthetic-disposal.pdf','stored_path'=>$path,'mime_type'=>'application/pdf','file_size'=>strlen($document),'sha256'=>hash('sha256',$document)]];
        $results = $this->workers('dispose',[$spec,$spec]);
        $this->assertTrue($results[0]['ok']); $this->assertTrue($results[1]['ok']);
        $this->assertSame(10,$inventory->fresh()->available_stock);
        $this->assertSame(0,$inventory->fresh()->returned_stock);
        $this->assertSame('COMPLETED',CustomerReturn::findOrFail($id)->status);
        $this->assertSame(1,DB::table('inventory_return_movements')->where('direction','RETURN_DISPOSAL')->count());
        $this->assertSame(1,DB::table('customer_return_events')->where('action','DISPOSE')->count());
        $this->assertSame(1,DB::table('customer_return_evidence')->where('stage','dispose')->count());
    }

    private function workers(string $action,array $specs): array
    {
        $barrier = storage_path('framework/testing/return-concurrency-'.Str::uuid());
        mkdir($barrier,0700,true); $processes = [];
        try {
            foreach ($specs as $index=>$spec) {
                $path = $barrier.'/'.$index.'.spec.json'; file_put_contents($path,json_encode($spec,JSON_THROW_ON_ERROR));
                $processes[$index] = new Process([PHP_BINARY,base_path('tests/Support/customer-return-worker.php'),$action,$path,$barrier,(string)$index],base_path(),['APP_ENV'=>'testing','DB_DATABASE'=>'smartchain_test_db']);
                $processes[$index]->setTimeout(35); $processes[$index]->start();
            }
            $deadline = microtime(true)+20;
            while (!is_file($barrier.'/0.ready') || !is_file($barrier.'/1.ready')) {
                if (microtime(true)>$deadline) $this->fail('Return workers did not reach barrier: '.implode(' | ',array_map(fn ($process) => $process->getErrorOutput(),$processes)));
                usleep(20000);
            }
            file_put_contents($barrier.'/start','go');
            $results = [];
            foreach ($processes as $index=>$process) {
                $process->wait(); $path = $barrier.'/'.$index.'.result.json';
                $this->assertFileExists($path,$process->getErrorOutput());
                $results[] = json_decode(file_get_contents($path),true,512,JSON_THROW_ON_ERROR);
                $this->assertNotSame(500,$results[$index]['status'] ?? 200,$results[$index]['message'] ?? 'Worker error');
            }
            return $results;
        } finally {
            foreach ($processes as $process) if ($process->isRunning()) $process->stop(1);
            foreach (glob($barrier.'/*') ?: [] as $file) unlink($file);
            rmdir($barrier);
        }
    }
}
