<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SubmitDeliveryRequest;
use App\Models\DeliveryRequest;
use App\Models\LogisticsPartner;
use App\Models\Order;
use App\Services\Logistics\DeliveryPayloadBuilder;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AdminLogisticsIntegrationController extends Controller
{
    public function partners(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Order::class);
        return response()->json(LogisticsPartner::query()->where('enabled', true)->orderBy('name')->get()->map(fn ($partner) => [
            'id' => $partner->id, 'code' => $partner->code, 'name' => $partner->name,
            'configured' => filled($partner->base_url) && filled($partner->outbound_token)
                && filled($partner->callback_secret) && $partner->supports_idempotency,
        ]));
    }

    public function preview(Request $request, Order $order, DeliveryPayloadBuilder $builder): JsonResponse
    {
        $this->authorize('update', $order);
        $data = $request->validate(['logistics_partner_id' => ['required', 'integer', 'exists:logistics_partners,id']]);
        $partner = LogisticsPartner::query()->findOrFail($data['logistics_partner_id']);
        // Preview validation must not imply that its synthetic identifier is the persisted idempotency key.
        $payload = $builder->build($order, $partner, '00000000-0000-4000-8000-000000000000');
        return response()->json(['preview_only' => true, 'delivery_request_id_assigned_on_send' => true, 'payload' => $payload]);
    }

    public function send(Request $request, Order $order, DeliveryPayloadBuilder $builder): JsonResponse
    {
        $this->authorize('update', $order);
        $data = $request->validate(['logistics_partner_id' => ['required', 'integer', 'exists:logistics_partners,id']]);
        $partner = LogisticsPartner::query()->findOrFail($data['logistics_partner_id']);

        try {
            $delivery = DB::transaction(function () use ($order, $partner, $builder) {
                $locked = Order::query()->lockForUpdate()->findOrFail($order->id);
                $existing = DeliveryRequest::query()->where('order_id', $locked->id)->lockForUpdate()->first();
                if ($existing) {
                    if ($existing->logistics_partner_id !== $partner->id) {
                        throw ValidationException::withMessages(['partner' => 'This order already has a delivery request assigned to another partner.']);
                    }
                    return $existing;
                }
                $uuid = (string) Str::uuid();
                $payload = $builder->build($locked, $partner, $uuid);
                $delivery = DeliveryRequest::create([
                    'request_uuid' => $uuid, 'order_id' => $locked->id,
                    'shipment_packing_id' => $locked->shipmentPacking?->id,
                    'logistics_partner_id' => $partner->id,
                    'payload_snapshot' => $payload, 'state' => 'QUEUED',
                ]);
                DB::afterCommit(fn () => SubmitDeliveryRequest::dispatch($delivery->id));
                return $delivery;
            }, 3);
        } catch (QueryException $exception) {
            $delivery = DeliveryRequest::query()->where('order_id', $order->id)->first();
            if (! $delivery) throw $exception;
            if ($delivery->logistics_partner_id !== $partner->id) {
                throw ValidationException::withMessages(['partner' => 'This order already has a delivery request assigned to another partner.']);
            }
        }

        return response()->json($this->data($delivery->fresh(['partner', 'attempts', 'statusEvents'])), $delivery->wasRecentlyCreated ? 202 : 200);
    }

    private function data(DeliveryRequest $delivery): array
    {
        return [
            'delivery_request_id' => $delivery->request_uuid,
            'state' => $delivery->state,
            'partner' => $delivery->partner?->only(['id', 'code', 'name']),
            'partner_delivery_request_id' => $delivery->partner_request_id,
            'retry_count' => $delivery->retry_count,
            'next_attempt_at' => $delivery->next_attempt_at,
            'submitted_at' => $delivery->submitted_at,
            'accepted_at' => $delivery->accepted_at,
            'latest_event_at' => $delivery->latest_event_at,
            'last_error' => $delivery->last_error_code ? ['code' => $delivery->last_error_code, 'message' => $delivery->last_error_message] : null,
            'payload' => $delivery->payload_snapshot,
            'attempts' => $delivery->attempts->sortByDesc('attempt_number')->values()->map->only([
                'attempt_number', 'correlation_id', 'result', 'http_status', 'error_code', 'safe_message', 'started_at', 'completed_at',
            ]),
            'events' => $delivery->statusEvents->sortByDesc('occurred_at')->values()->map->only([
                'event_id', 'partner_status', 'occurred_at', 'processing_result', 'note', 'proof_reference', 'received_at',
            ]),
        ];
    }
}
