<?php

namespace App\Console\Commands;

use App\Http\Controllers\Api\AdminBidEvaluationController;
use App\Http\Controllers\Api\SupplierController;
use App\Models\{Rfq,Supplier,User};
use App\Services\ReverseBidService;
use App\Services\AwardPurchaseOrderService;
use Illuminate\Console\Command;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class Phase4ConcurrencyWorker extends Command
{
    protected $signature = 'phase4:concurrency-worker {scenario} {worker} {barrier} {spec}';
    protected $description = 'Internal isolated-test worker for real PostgreSQL Phase 4 concurrency verification.';

    public function handle(): int
    {
        if (app()->environment() !== 'testing' || DB::getDriverName() !== 'pgsql' || DB::getDatabaseName() !== 'smartchain_test_db') {
            $this->error('Unsafe database environment.');
            return self::FAILURE;
        }

        $barrier = (string) $this->argument('barrier');
        $worker = (string) $this->argument('worker');
        $spec = json_decode(file_get_contents((string) $this->argument('spec')), true, 512, JSON_THROW_ON_ERROR);
        Date::setTestNow($spec['_test_now']);
        DB::statement("set lock_timeout to '8s'");
        DB::statement("set statement_timeout to '15s'");
        $pid = (int) DB::scalar('select pg_backend_pid()');
        $database = DB::getDatabaseName();

        try {
            $result = match ((string) $this->argument('scenario')) {
                'reverse-bid' => $this->afterBarrier($barrier, $worker, $pid, fn () => $this->reverseBid($spec)),
                'award' => $this->afterBarrier($barrier, $worker, $pid, fn () => $this->award($spec)),
                'suspend' => $this->supplierStatus($spec, $barrier, $worker, $pid),
                'award-prelocked' => $this->awardPrelocked($spec, $barrier, $worker, $pid),
                'award-to-po' => $this->afterBarrier($barrier, $worker, $pid, fn () => $this->awardToPurchaseOrders($spec)),
                default => throw new \InvalidArgumentException('Unknown concurrency scenario.'),
            };
            $this->writeJson("{$barrier}/{$worker}.outcome.json", ['ok'=>true,'scenario'=>(string)$this->argument('scenario'),'pid'=>$pid,'database'=>$database,'result'=>$result]);
            return self::SUCCESS;
        } catch (Throwable $exception) {
            $status = match (true) {
                $exception instanceof ValidationException => 422,
                $exception instanceof HttpExceptionInterface => $exception->getStatusCode(),
                default => 500,
            };
            $this->writeJson("{$barrier}/{$worker}.outcome.json", ['ok'=>false,'scenario'=>(string)$this->argument('scenario'),'pid'=>$pid,'database'=>$database,'status'=>$status,'exception'=>$exception::class,'message'=>$exception->getMessage()]);
            return $status >= 500 ? self::FAILURE : self::SUCCESS;
        }
    }

    private function reverseBid(array $spec): array
    {
        $quotation = app(ReverseBidService::class)->submit(User::findOrFail($spec['user_id']), $spec['data']);
        return ['quotation_id'=>$quotation->id,'quotation_number'=>$quotation->quotation_number];
    }

    private function award(array $spec): array
    {
        $response = app(AdminBidEvaluationController::class)->award($this->request($spec), Rfq::findOrFail($spec['rfq_id']));
        return ['http_status'=>$response->status(),'award_id'=>$response->getData(true)['data']['id']];
    }

    private function supplierStatus(array $spec, string $barrier, string $worker, int $pid): array
    {
        if (! ($spec['prelock'] ?? false)) {
            return $this->afterBarrier($barrier, $worker, $pid, function () use ($spec) {
                $supplier = Supplier::findOrFail($spec['supplier_id']);
                $response = app(SupplierController::class)->updateStatus($this->request($spec), $supplier);
                return ['http_status'=>$response->status(),'supplier_status'=>$supplier->fresh()->status];
            });
        }
        return DB::transaction(function () use ($spec, $barrier, $worker, $pid) {
            $supplier = Supplier::query()->lockForUpdate()->findOrFail($spec['supplier_id']);
            $this->readyAndWait($barrier, $worker, $pid);
            $response = app(SupplierController::class)->updateStatus($this->request($spec), $supplier);
            return ['http_status'=>$response->status(),'supplier_status'=>$spec['data']['status']];
        });
    }

    private function awardPrelocked(array $spec, string $barrier, string $worker, int $pid): array
    {
        return DB::transaction(function () use ($spec, $barrier, $worker, $pid) {
            Rfq::query()->lockForUpdate()->findOrFail($spec['rfq_id']);
            Supplier::query()->lockForUpdate()->findOrFail($spec['supplier_id']);
            $this->readyAndWait($barrier, $worker, $pid);
            return $this->award($spec);
        }, 3);
    }

    private function awardToPurchaseOrders(array $spec): array
    {
        config(['procurement.award_to_po_enabled' => true]);
        $result = app(AwardPurchaseOrderService::class)->convert(
            \App\Models\SupplierAward::findOrFail($spec['award_id']),
            User::findOrFail($spec['user_id']),
        );
        return ['created'=>$result['created'],'purchase_order_ids'=>collect($result['orders'])->pluck('id')->all()];
    }

    private function request(array $spec): Request
    {
        $request = Request::create('/phase4-concurrency-worker', 'POST', $spec['data']);
        app()->instance('request', $request);
        // Laravel's request rebinding installs the auth-guard resolver, so the
        // isolated worker identity must be attached after the rebind.
        $request->setUserResolver(fn () => User::findOrFail($spec['user_id']));
        return $request;
    }

    private function afterBarrier(string $barrier, string $worker, int $pid, callable $operation): mixed
    {
        $this->readyAndWait($barrier, $worker, $pid);
        return $operation();
    }

    private function readyAndWait(string $barrier, string $worker, int $pid): void
    {
        $this->writeJson("{$barrier}/{$worker}.ready.json", ['pid'=>$pid,'database'=>DB::getDatabaseName(),'ready_at'=>microtime(true)]);
        $deadline = microtime(true) + 10;
        while (! is_file("{$barrier}/start")) {
            if (microtime(true) >= $deadline) throw new \RuntimeException('Timed out waiting for concurrency start barrier.');
            usleep(20_000);
        }
    }

    private function writeJson(string $path, array $data): void
    {
        $temporary = $path.'.tmp.'.getmypid();
        file_put_contents($temporary, json_encode($data, JSON_THROW_ON_ERROR));
        rename($temporary, $path);
    }
}
