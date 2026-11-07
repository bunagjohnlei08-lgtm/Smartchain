<?php
// Isolated regression-test worker, never routed or used by the application.
putenv('APP_ENV=testing');
$_ENV['APP_ENV'] = $_SERVER['APP_ENV'] = 'testing';
$root = dirname(__DIR__,2);
require $root.'/vendor/autoload.php';
$app = require $root.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$identity = Illuminate\Support\Facades\DB::selectOne('select current_database() as database_name, current_user as user_name');
if (!app()->environment('testing') || $identity->database_name !== 'smartchain_test_db' || $identity->user_name !== 'smartchain_test_user') throw new RuntimeException('Unsafe worker database');
Illuminate\Support\Facades\Http::preventStrayRequests();
Illuminate\Support\Facades\Http::fake();
Illuminate\Support\Facades\Mail::fake();
Illuminate\Support\Facades\Notification::fake();
[$script,$action,$specPath,$barrier,$worker] = $argv;
$spec = json_decode(file_get_contents($specPath),true,512,JSON_THROW_ON_ERROR);
file_put_contents($barrier.'/'.$worker.'.ready','ready');
$deadline = microtime(true)+15;
while (!is_file($barrier.'/start')) { if (microtime(true)>$deadline) throw new RuntimeException('Barrier timeout'); usleep(20000); }
try {
    $service = app(App\Services\CustomerReturnService::class);
    $actor = App\Models\User::findOrFail($spec['actor_id']);
    if (!in_array($action,['register','restock','dispose'],true)) throw new RuntimeException('Unknown test worker action');
    $result = $action === 'register' ? $service->register($actor,$spec['payload'])
        : $service->transition($actor,App\Models\CustomerReturn::findOrFail($spec['return_id']),$action,$spec['payload'] ?? [],function ($row) use ($action,$spec,$actor) {
            if ($action === 'dispose') $row->evidence()->create($spec['evidence'] + ['uploaded_by'=>$actor->id,'stage'=>'dispose','created_at'=>now()]);
        });
    $outcome = ['ok'=>true,'id'=>$result->id];
} catch (Illuminate\Validation\ValidationException $error) { $outcome = ['ok'=>false,'status'=>422]; }
catch (Throwable $error) { $outcome = ['ok'=>false,'status'=>500,'message'=>$error->getMessage()]; }
file_put_contents($barrier.'/'.$worker.'.result.json',json_encode($outcome,JSON_THROW_ON_ERROR));
