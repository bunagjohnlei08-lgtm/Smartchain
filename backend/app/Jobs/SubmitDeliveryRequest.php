<?php

namespace App\Jobs;

use App\Models\DeliveryRequest;
use App\Services\Logistics\DeliverySubmissionService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class SubmitDeliveryRequest implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;
    public int $timeout = 20;

    public function __construct(public int $deliveryRequestId) { $this->onQueue('logistics'); }
    public function backoff(): array { return [60, 300]; }
    public function handle(DeliverySubmissionService $service): void { $service->submit($this->deliveryRequestId); }

    public function failed(?Throwable $exception): void
    {
        DeliveryRequest::query()->whereKey($this->deliveryRequestId)->where('state', 'RETRY_PENDING')->update([
            'state' => 'RECONCILIATION_REQUIRED',
            'next_attempt_at' => null,
            'last_error_code' => 'RETRY_LIMIT_REACHED',
            'last_error_message' => 'Automatic retries were exhausted; review with the partner before resubmitting.',
        ]);
    }
}
