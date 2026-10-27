<?php

namespace App\Services\Logistics;

use App\Models\DeliveryRequest;
use App\Models\DeliverySubmissionAttempt;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

class DeliverySubmissionService
{
    public function submit(int $deliveryRequestId): void
    {
        [$request, $attempt] = DB::transaction(function () use ($deliveryRequestId) {
            $request = DeliveryRequest::query()->with('partner')->lockForUpdate()->findOrFail($deliveryRequestId);
            if (in_array($request->state, ['ACCEPTED', 'IN_TRANSIT', 'DELIVERED', 'REJECTED', 'AUTH_FAILED', 'RECONCILIATION_REQUIRED'], true)) return [$request, null];
            if ($request->state === 'SENDING' && $request->updated_at->greaterThan(now()->subMinutes(2))) return [$request, null];
            if (! $this->usesCurrentItemIdentity($request->payload_snapshot)) {
                $request->update([
                    'state' => 'RECONCILIATION_REQUIRED',
                    'next_attempt_at' => null,
                    'last_error_code' => 'LEGACY_ITEM_IDENTITY',
                    'last_error_message' => 'This unsent snapshot uses the retired mandatory SKU format and requires an operator-reviewed replacement; it will not be sent automatically.',
                ]);
                return [$request, null];
            }
            $number = (int) $request->attempts()->max('attempt_number') + 1;
            $attempt = $request->attempts()->create([
                'attempt_number' => $number,
                'correlation_id' => (string) Str::uuid(),
                'result' => 'STARTED',
                'started_at' => now(),
            ]);
            $request->update(['state' => 'SENDING', 'submitted_at' => $request->submitted_at ?? now(), 'next_attempt_at' => null]);
            return [$request->fresh('partner'), $attempt];
        }, 3);

        if (! $attempt) return;
        $partner = $request->partner;
        $url = rtrim($partner->base_url, '/').$partner->request_path;

        try {
            $response = Http::acceptJson()->asJson()
                ->withToken($partner->outbound_token)
                ->withHeaders([
                    'Idempotency-Key' => $request->request_uuid,
                    'X-Correlation-ID' => $attempt->correlation_id,
                ])
                ->connectTimeout((int) config('logistics.connect_timeout_seconds', 3))
                ->timeout((int) config('logistics.request_timeout_seconds', 10))
                ->post($url, $request->payload_snapshot);
        } catch (ConnectionException $exception) {
            $this->networkFailure($request, $attempt, 'AMBIGUOUS_NETWORK_FAILURE', 'The partner response was not received.');
            return;
        }

        if ($response->successful()) {
            $body = $response->json();
            $valid = is_array($body) && ($body['accepted'] ?? null) === true
                && ($body['delivery_request_id'] ?? null) === $request->request_uuid
                && filled($body['partner_delivery_request_id'] ?? null)
                && ($body['status'] ?? null) === 'ACCEPTED';
            if (! $valid) {
                $this->finish($request, $attempt, 'REJECTED', $response->status(), 'INVALID_ACCEPTANCE_RESPONSE', 'Partner returned an invalid acceptance response.');
                return;
            }
            DB::transaction(function () use ($request, $attempt, $response, $body) {
                $locked = DeliveryRequest::query()->lockForUpdate()->findOrFail($request->id);
                if ($locked->partner_request_id && $locked->partner_request_id !== $body['partner_delivery_request_id']) {
                    $this->finishLocked($locked, $attempt, 'RECONCILIATION_REQUIRED', $response->status(), 'PARTNER_REFERENCE_CONFLICT', 'Partner returned a conflicting external reference.');
                    return;
                }
                $changes = [
                    'partner_request_id' => $body['partner_delivery_request_id'],
                    'accepted_at' => $locked->accepted_at ?? now(),
                    'last_error_code' => null, 'last_error_message' => null, 'next_attempt_at' => null,
                ];
                if (! in_array($locked->state, ['IN_TRANSIT', 'DELIVERED'], true)) $changes['state'] = 'ACCEPTED';
                $locked->update($changes);
                $attempt->update(['result' => 'ACCEPTED', 'http_status' => $response->status(), 'completed_at' => now()]);
            }, 3);
            return;
        }

        if ($response->status() === 401 || $response->status() === 403) {
            $this->finish($request, $attempt, 'AUTH_FAILED', $response->status(), 'PARTNER_AUTHENTICATION_FAILED', 'Partner rejected SmartChain authentication.');
            return;
        }
        if ($response->clientError() && ! in_array($response->status(), [408, 429], true)) {
            $this->finish($request, $attempt, 'REJECTED', $response->status(), 'PARTNER_VALIDATION_REJECTED', 'Partner rejected the delivery request.');
            return;
        }

        $this->networkFailure($request, $attempt, 'RETRYABLE_PARTNER_FAILURE', 'Partner service was unavailable.');
    }

    private function networkFailure(DeliveryRequest $request, DeliverySubmissionAttempt $attempt, string $code, string $message): void
    {
        if (! $request->partner->supports_idempotency) {
            $this->finish($request, $attempt, 'RECONCILIATION_REQUIRED', null, $code, $message.' Manual reconciliation is required.');
            return;
        }
        DB::transaction(function () use ($request, $attempt, $code, $message) {
            $locked = DeliveryRequest::query()->lockForUpdate()->findOrFail($request->id);
            $retryCount = $locked->retry_count + 1;
            $locked->update([
                'state' => 'RETRY_PENDING', 'retry_count' => $retryCount,
                'next_attempt_at' => now()->addSeconds(match ($retryCount) { 1 => 60, 2 => 300, default => 900 }),
                'last_error_code' => $code, 'last_error_message' => $message,
            ]);
            $attempt->update(['result' => 'RETRY_PENDING', 'error_code' => $code, 'safe_message' => $message, 'completed_at' => now()]);
        }, 3);
        throw new RuntimeException($code);
    }

    private function finish(DeliveryRequest $request, DeliverySubmissionAttempt $attempt, string $state, ?int $status, string $code, string $message): void
    {
        DB::transaction(fn () => $this->finishLocked(
            DeliveryRequest::query()->lockForUpdate()->findOrFail($request->id), $attempt, $state, $status, $code, $message
        ), 3);
    }

    private function finishLocked(DeliveryRequest $request, DeliverySubmissionAttempt $attempt, string $state, ?int $status, string $code, string $message): void
    {
        if (! in_array($request->state, ['IN_TRANSIT', 'DELIVERED'], true)) {
            $request->update(['state' => $state, 'last_error_code' => $code, 'last_error_message' => $message, 'next_attempt_at' => null]);
        }
        $attempt->update(['result' => $state, 'http_status' => $status, 'error_code' => $code, 'safe_message' => $message, 'completed_at' => now()]);
    }

    private function usesCurrentItemIdentity(array $payload): bool
    {
        $items = $payload['items'] ?? null;
        if (! is_array($items) || $items === []) return false;

        foreach ($items as $item) {
            if (! is_array($item)
                || ! filled($item['product_id'] ?? null)
                || ! filled($item['product_name'] ?? null)
                || ! is_numeric($item['quantity'] ?? null)
                || (float) $item['quantity'] <= 0
                || ! filled($item['unit'] ?? null)) return false;
        }

        return true;
    }
}
