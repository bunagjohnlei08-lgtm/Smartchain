<?php

namespace App\Services\Financial;

use App\Models\FinancialPoSubmission;
use App\Models\FinancialPoSubmissionAttempt;
use App\Models\PurchaseOrder;
use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class FinancialPoSubmissionService
{
    public function __construct(
        private readonly FinancialPoPayloadBuilder $payloadBuilder,
        private readonly FinancialDisbursementAdapter $adapter,
    ) {}

    public function submit(PurchaseOrder $purchaseOrder, User $actor): FinancialPoSubmission
    {
        $this->assertConfiguration();

        [$submission, $attempt] = DB::transaction(function () use ($purchaseOrder, $actor) {
            $order = PurchaseOrder::query()->with(['items', 'supplier'])->lockForUpdate()->findOrFail($purchaseOrder->id);
            $existing = FinancialPoSubmission::query()->where('purchase_order_id', $order->id)->lockForUpdate()->first();

            if ($existing) {
                if ($existing->state === FinancialPoSubmission::ACKNOWLEDGED) {
                    return [$existing, null];
                }
                if ($existing->state === FinancialPoSubmission::RECONCILIATION_REQUIRED) {
                    throw ValidationException::withMessages(['financial' => ['This submission has an ambiguous outcome and requires reconciliation before another transmission.']]);
                }
                if ($existing->state === FinancialPoSubmission::FAILED) {
                    throw ValidationException::withMessages(['financial' => ['The previous submission failed permanently. Review its safe error before retrying.']]);
                }
                if ($existing->state === FinancialPoSubmission::SUBMITTING && $existing->updated_at->greaterThan(now()->subMinutes(2))) {
                    return [$existing, null];
                }
                if ($existing->state === FinancialPoSubmission::RETRY_PENDING && $existing->next_attempt_at?->isFuture()) {
                    return [$existing, null];
                }
                $submission = $existing;
                $snapshot = $existing->payload_snapshot;
            } else {
                $messageId = (string) Str::uuid();
                $snapshot = $this->payloadBuilder->build($order, $messageId);
                $canonical = json_encode($snapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
                $submission = FinancialPoSubmission::create([
                    'purchase_order_id' => $order->id,
                    'message_id' => $messageId,
                    'state' => FinancialPoSubmission::PENDING,
                    'payload_version' => '1.0',
                    'payload_sha256' => hash('sha256', $canonical),
                    'payload_snapshot' => $snapshot,
                    'created_by' => $actor->id,
                ]);
            }

            // The stored snapshot is immutable. A changed PO must be reconciled/versioned,
            // never silently resubmitted under the original message identity.
            $current = $this->payloadBuilder->build($order, $submission->message_id);
            $currentHash = hash('sha256', json_encode($current, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
            if (! hash_equals($submission->payload_sha256, $currentHash)) {
                $submission->update([
                    'state' => FinancialPoSubmission::RECONCILIATION_REQUIRED,
                    'last_error_code' => 'PO_CHANGED_AFTER_SNAPSHOT',
                    'last_error_message' => 'Purchase Order data changed after the Financial snapshot was created.',
                ]);
                throw ValidationException::withMessages(['financial' => ['Purchase Order data changed after its Financial snapshot was created. Reconciliation is required.']]);
            }

            $attempt = $submission->attempts()->create([
                'attempt_number' => (int) $submission->attempts()->max('attempt_number') + 1,
                'correlation_id' => (string) Str::uuid(),
                'result' => 'STARTED',
                'started_at' => now(),
            ]);
            $submission->update([
                'state' => FinancialPoSubmission::SUBMITTING,
                'submitted_at' => $submission->submitted_at ?? now(),
                'next_attempt_at' => null,
                'last_error_code' => null,
                'last_error_message' => null,
            ]);

            return [$submission->fresh(), $attempt];
        }, 3);

        if (! $attempt) {
            return $submission->fresh();
        }

        $url = $this->requestUrl();
        try {
            $response = Http::acceptJson()->asJson()
                ->withHeaders([
                    'X-API-KEY' => (string) config('financial.api_key'),
                    'Idempotency-Key' => $submission->message_id,
                    'X-Correlation-ID' => $attempt->correlation_id,
                ])
                ->connectTimeout((int) config('financial.connect_timeout_seconds', 3))
                ->timeout((int) config('financial.request_timeout_seconds', 10))
                ->post($url, $this->adapter->outbound($submission->payload_snapshot));
        } catch (ConnectionException) {
            return $this->retryable($submission, $attempt, null);
        }

        if ($response->successful()) {
            if (! in_array($response->status(), [200, 201], true)) {
                return $this->finish($submission, $attempt, FinancialPoSubmission::RECONCILIATION_REQUIRED, $response->status(), 'UNVERIFIED_ACKNOWLEDGMENT_STATUS', 'Financial returned an unexpected success status.');
            }
            $ack = $this->adapter->acknowledgment($response->json(), $submission->payload_snapshot['external_reference_id']);
            if (! $ack['acknowledged']) {
                return $this->finish($submission, $attempt, FinancialPoSubmission::RECONCILIATION_REQUIRED, $response->status(), 'UNVERIFIED_ACKNOWLEDGMENT_SCHEMA', 'Financial returned success with an unrecognized acknowledgment.');
            }

            return DB::transaction(function () use ($submission, $attempt, $response, $ack) {
                $locked = FinancialPoSubmission::query()->lockForUpdate()->findOrFail($submission->id);
                if ($locked->financial_reference && $locked->financial_reference !== $ack['external_reference']) {
                    return $this->finishLocked($locked, $attempt, FinancialPoSubmission::RECONCILIATION_REQUIRED, $response->status(), 'FINANCIAL_REFERENCE_CONFLICT', 'Financial returned a conflicting external reference.');
                }
                $locked->update([
                    'state' => FinancialPoSubmission::ACKNOWLEDGED,
                    'financial_reference' => $ack['external_reference'],
                    'partner_acknowledgment' => $ack['acknowledgment'],
                    'acknowledged_at' => $locked->acknowledged_at ?? now(),
                    'next_attempt_at' => null,
                    'last_error_code' => null,
                    'last_error_message' => null,
                ]);
                $attempt->update(['result' => FinancialPoSubmission::ACKNOWLEDGED, 'http_status' => $response->status(), 'completed_at' => now()]);

                return $locked->fresh();
            }, 3);
        }

        if (in_array($response->status(), [401, 403], true)) {
            return $this->finish($submission, $attempt, FinancialPoSubmission::FAILED, $response->status(), 'FINANCIAL_AUTHENTICATION_REJECTED', 'Financial rejected SmartChain authentication.');
        }
        if ($response->status() === 409) {
            return $this->finish($submission, $attempt, FinancialPoSubmission::RECONCILIATION_REQUIRED, 409, 'FINANCIAL_IDEMPOTENCY_CONFLICT', 'Financial reported an idempotency conflict.');
        }
        if ($response->clientError() && ! in_array($response->status(), [408, 429], true)) {
            return $this->finish($submission, $attempt, FinancialPoSubmission::FAILED, $response->status(), 'FINANCIAL_VALIDATION_REJECTED', 'Financial rejected the Purchase Order payload.');
        }

        return $this->retryable($submission, $attempt, $response->status());
    }

    private function assertConfiguration(): void
    {
        if (! config('financial.enabled')) {
            throw ValidationException::withMessages(['financial' => ['Financial integration is disabled.']]);
        }
        if (! config('financial.contract_confirmed')) {
            throw ValidationException::withMessages(['financial' => ['The Financial API contract has not been confirmed.']]);
        }
        if (! filled(config('financial.api_key'))) {
            throw ValidationException::withMessages(['financial' => ['Financial API credentials are not configured.']]);
        }
        $url = $this->requestUrl();
        $parts = parse_url($url);
        if (($parts['scheme'] ?? null) !== 'https' || ! filled($parts['host'] ?? null)) {
            throw ValidationException::withMessages(['financial' => ['A valid Financial HTTPS endpoint is required.']]);
        }
        if ($parts['path'] !== '/api/v1/integration/purchase-orders') {
            throw ValidationException::withMessages(['financial' => ['The confirmed Financial Purchase Order intake endpoint is required.']]);
        }
    }

    private function requestUrl(): string
    {
        return rtrim((string) config('financial.base_url'), '/').'/'.ltrim((string) config('financial.request_path'), '/');
    }

    private function retryable(FinancialPoSubmission $submission, FinancialPoSubmissionAttempt $attempt, ?int $status): FinancialPoSubmission
    {
        return DB::transaction(function () use ($submission, $attempt, $status) {
            $locked = FinancialPoSubmission::query()->lockForUpdate()->findOrFail($submission->id);
            $retryCount = $locked->retry_count + 1;
            $locked->update([
                'state' => FinancialPoSubmission::RETRY_PENDING,
                'retry_count' => $retryCount,
                'next_attempt_at' => now()->addSeconds(match ($retryCount) {
                    1 => 60, 2 => 300, default => 900
                }),
                'last_error_code' => 'RETRYABLE_FINANCIAL_FAILURE',
                'last_error_message' => 'Financial is temporarily unavailable. The same submission identity can be retried.',
            ]);
            $attempt->update(['result' => FinancialPoSubmission::RETRY_PENDING, 'http_status' => $status, 'error_code' => 'RETRYABLE_FINANCIAL_FAILURE', 'safe_message' => $locked->last_error_message, 'completed_at' => now()]);

            return $locked->fresh();
        }, 3);
    }

    private function finish(FinancialPoSubmission $submission, FinancialPoSubmissionAttempt $attempt, string $state, ?int $status, string $code, string $message): FinancialPoSubmission
    {
        return DB::transaction(fn () => $this->finishLocked(FinancialPoSubmission::query()->lockForUpdate()->findOrFail($submission->id), $attempt, $state, $status, $code, $message), 3);
    }

    private function finishLocked(FinancialPoSubmission $submission, FinancialPoSubmissionAttempt $attempt, string $state, ?int $status, string $code, string $message): FinancialPoSubmission
    {
        $submission->update(['state' => $state, 'next_attempt_at' => null, 'last_error_code' => $code, 'last_error_message' => $message]);
        $attempt->update(['result' => $state, 'http_status' => $status, 'error_code' => $code, 'safe_message' => $message, 'completed_at' => now()]);

        return $submission->fresh();
    }
}
