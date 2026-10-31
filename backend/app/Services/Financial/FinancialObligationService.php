<?php

namespace App\Services\Financial;

use App\Models\FinancialObligation;
use App\Models\FinancialObligationAttempt;
use App\Models\PurchaseOrder;
use App\Models\Receiving;
use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class FinancialObligationService
{
    public function __construct(private readonly FinancialObligationAdapter $adapter) {}

    public function sendBillableObligationToFinance(
        PurchaseOrder $purchaseOrder,
        Receiving $receiving,
        string $externalReferenceId,
        User $actor,
    ): FinancialObligation {
        $this->assertConfiguration();

        [$obligation, $attempt, $payload] = DB::transaction(function () use ($purchaseOrder, $receiving, $externalReferenceId, $actor) {
            $lockedReceiving = Receiving::query()
                ->with(['purchaseOrder.supplier', 'items.purchaseOrderItem', 'items.qaInspectionItem', 'qaInspection'])
                ->lockForUpdate()->findOrFail($receiving->id);
            if ($lockedReceiving->purchase_order_id !== $purchaseOrder->id) {
                throw ValidationException::withMessages(['receiving' => ['The receiving record does not belong to this Purchase Order.']]);
            }

            $existing = FinancialObligation::query()->where('receiving_id', $lockedReceiving->id)->lockForUpdate()->first();
            if ($existing) {
                if ($existing->external_reference_id !== $externalReferenceId) {
                    throw ValidationException::withMessages(['external_reference_id' => ['This receipt already has a different Financial obligation reference.']]);
                }

                return [$existing, null, null];
            }

            $payload = $this->buildPayload($lockedReceiving, $externalReferenceId);
            $canonical = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $obligation = FinancialObligation::create([
                'purchase_order_id' => $purchaseOrder->id,
                'receiving_id' => $lockedReceiving->id,
                'local_reference' => (string) Str::uuid(),
                'external_reference_id' => $externalReferenceId,
                'state' => FinancialObligation::SUBMITTING,
                'amount' => $payload['amount'],
                'payload_sha256' => hash('sha256', $canonical),
                'submitted_at' => now(),
                'created_by' => $actor->id,
            ]);
            $attempt = $obligation->attempts()->create([
                'attempt_number' => 1,
                'result' => 'STARTED',
                'started_at' => now(),
            ]);

            return [$obligation->fresh(), $attempt, $payload];
        }, 3);

        if (! $attempt) {
            return $obligation->fresh();
        }

        try {
            $response = Http::acceptJson()->asJson()
                ->withHeaders(['X-API-KEY' => (string) config('financial.api_key')])
                ->connectTimeout((int) config('financial.connect_timeout_seconds', 3))
                ->timeout((int) config('financial.disbursement_timeout_seconds', 60))
                ->post($this->requestUrl(), $this->adapter->payload($payload));
        } catch (ConnectionException) {
            return $this->finish($obligation, $attempt, FinancialObligation::RECONCILIATION_REQUIRED, null, 'AMBIGUOUS_NETWORK_FAILURE', 'Financial did not return a response. Manual reconciliation is required; do not retry blindly.');
        }

        if ($response->status() === 200) {
            $ack = $this->adapter->acknowledgment($response->json());
            if ($ack) {
                return DB::transaction(function () use ($obligation, $attempt, $ack) {
                    $locked = FinancialObligation::query()->lockForUpdate()->findOrFail($obligation->id);
                    $locked->update([
                        'state' => FinancialObligation::BILL_CREATED,
                        'bill_number' => $ack['bill_number'],
                        'transaction_code' => $ack['transaction_code'],
                        'financial_status' => $ack['financial_status'],
                        'acknowledged_at' => now(),
                    ]);
                    $attempt->update(['result' => FinancialObligation::BILL_CREATED, 'http_status' => 200, 'completed_at' => now()]);

                    return $locked->fresh();
                }, 3);
            }
        }

        if (in_array($response->status(), [401, 422], true)) {
            return $this->finish($obligation, $attempt, FinancialObligation::FAILED, $response->status(), 'FINANCIAL_REJECTED_OBLIGATION', 'Financial rejected the obligation request. Review configuration and billable data before creating a new obligation.');
        }

        return $this->finish($obligation, $attempt, FinancialObligation::RECONCILIATION_REQUIRED, $response->status(), 'UNVERIFIED_FINANCIAL_OUTCOME', 'Financial returned an unverified outcome. Manual reconciliation is required; do not retry blindly.');
    }

    private function buildPayload(Receiving $receiving, string $externalReferenceId): array
    {
        $order = $receiving->purchaseOrder;
        $supplier = $order?->supplier;
        $errors = [];
        if (! $receiving->qaInspection?->completed_at) {
            $errors['receiving'][] = 'The receiving record must have a completed QA inspection.';
        }
        if (! $supplier || ! filled($supplier->name)) {
            $errors['supplier'][] = 'A registered supplier name is required.';
        }
        if (! filled($supplier?->bank_name)) {
            $errors['bank_name'][] = 'Verified supplier bank information is required.';
        }
        if (! filled($supplier?->bank_account)) {
            $errors['bank_account'][] = 'Verified supplier bank account information is required.';
        }

        $amountCents = 0;
        $acceptedUnits = 0;
        foreach ($receiving->items as $item) {
            $accepted = (int) ($item->qaInspectionItem?->accepted_quantity ?? 0);
            $rejected = (int) ($item->qaInspectionItem?->rejected_quantity ?? 0);
            if (! $item->qaInspectionItem || $accepted + $rejected !== (int) $item->delivered_quantity) {
                $errors['items'][] = "{$item->product_name} does not have a complete QA quantity decision.";

                continue;
            }
            if ($accepted <= 0) {
                continue;
            }
            if (! $item->purchaseOrderItem || ! preg_match('/^\d+(?:\.\d{1,2})?$/', (string) $item->purchaseOrderItem->unit_price)) {
                $errors['items'][] = "{$item->product_name} has no canonical Purchase Order line price.";

                continue;
            }
            [$whole, $decimal] = array_pad(explode('.', (string) $item->purchaseOrderItem->unit_price, 2), 2, '');
            $unitPriceCents = ((int) $whole * 100) + (int) str_pad($decimal, 2, '0');
            $amountCents += $accepted * $unitPriceCents;
            $acceptedUnits += $accepted;
        }
        if ($acceptedUnits === 0 || $amountCents <= 0) {
            $errors['amount'][] = 'The receipt has no positive-priced QA-accepted inventory to bill.';
        }
        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        return [
            'external_reference_id' => $externalReferenceId,
            'amount' => intdiv($amountCents, 100).'.'.str_pad((string) ($amountCents % 100), 2, '0', STR_PAD_LEFT),
            'payee_info' => ['name' => $supplier->name, 'bank' => $supplier->bank_name, 'account' => $supplier->bank_account],
            'description' => "QA-accepted inventory for {$order->po_number}, receipt {$receiving->receiving_no}",
        ];
    }

    private function assertConfiguration(): void
    {
        if (! config('financial.disbursement_enabled')) {
            throw ValidationException::withMessages(['financial' => ['Financial disbursement submission is disabled pending accounting-policy confirmation.']]);
        }
        if (! filled(config('financial.api_key'))) {
            throw ValidationException::withMessages(['financial' => ['Financial API credentials are not configured.']]);
        }
        $parts = parse_url($this->requestUrl());
        if (($parts['scheme'] ?? null) !== 'https' || ! filled($parts['host'] ?? null) || ($parts['path'] ?? null) !== '/api/v1/integration/request-disbursement') {
            throw ValidationException::withMessages(['financial' => ['The confirmed Financial disbursement HTTPS endpoint is required.']]);
        }
    }

    private function requestUrl(): string
    {
        return rtrim((string) config('financial.base_url'), '/').'/'.ltrim((string) config('financial.disbursement_request_path'), '/');
    }

    private function finish(FinancialObligation $obligation, FinancialObligationAttempt $attempt, string $state, ?int $status, string $code, string $message): FinancialObligation
    {
        return DB::transaction(function () use ($obligation, $attempt, $state, $status, $code, $message) {
            $locked = FinancialObligation::query()->lockForUpdate()->findOrFail($obligation->id);
            $locked->update(['state' => $state, 'last_error_code' => $code, 'last_error_message' => $message]);
            $attempt->update(['result' => $state, 'http_status' => $status, 'error_code' => $code, 'safe_message' => $message, 'completed_at' => now()]);

            return $locked->fresh();
        }, 3);
    }
}
