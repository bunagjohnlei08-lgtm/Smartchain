<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeliveryRequest;
use App\Models\DeliveryStatusEvent;
use App\Models\LogisticsPartner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class LogisticsStatusCallbackController extends Controller
{
    private const FIELDS = ['schema_version', 'event_id', 'delivery_request_id', 'partner_delivery_request_id', 'status', 'occurred_at', 'note', 'proof_reference'];

    public function store(Request $request): JsonResponse
    {
        $unknown = array_values(array_diff(array_keys($request->all()), self::FIELDS));
        if ($unknown) return response()->json([
            'acknowledged' => false,
            'error' => ['code' => 'UNKNOWN_FIELDS', 'message' => 'Unknown properties are not allowed.', 'fields' => $unknown],
        ], 422);

        $validator = Validator::make($request->all(), [
            'schema_version' => ['required', Rule::in(['1.0'])],
            'event_id' => ['required', 'string', 'max:100', 'regex:/^[A-Za-z0-9._:-]+$/'],
            'delivery_request_id' => ['required', 'uuid'],
            'partner_delivery_request_id' => ['required', 'string', 'max:100'],
            'status' => ['required', Rule::in(['IN_TRANSIT', 'DELIVERED'])],
            'occurred_at' => ['required', 'string', 'max:40', 'regex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/'],
            'note' => ['nullable', 'string', 'max:1000'],
            'proof_reference' => ['nullable', 'string', 'max:255'],
        ]);
        if ($validator->fails()) {
            return response()->json([
                'acknowledged' => false,
                'error' => [
                    'code' => 'VALIDATION_ERROR',
                    'message' => 'The callback payload is invalid.',
                    'fields' => array_keys($validator->errors()->toArray()),
                ],
            ], 422);
        }
        $data = $validator->validated();
        $partner = $request->attributes->get('logistics_partner');
        abort_unless($partner instanceof LogisticsPartner, 401);
        $hash = hash('sha256', $request->getContent());

        $result = DB::transaction(function () use ($data, $partner, $hash) {
            $existing = DeliveryStatusEvent::query()
                ->where('logistics_partner_id', $partner->id)->where('event_id', $data['event_id'])
                ->lockForUpdate()->first();
            if ($existing) {
                if (! hash_equals($existing->payload_sha256, $hash)) return ['conflict' => true];
                return ['event' => $existing, 'duplicate' => true, 'state' => $existing->deliveryRequest()->value('state')];
            }

            $delivery = DeliveryRequest::query()->where('request_uuid', $data['delivery_request_id'])->lockForUpdate()->first();
            if (! $delivery) return ['unknown' => true];
            if ($delivery->logistics_partner_id !== $partner->id) return ['wrong_partner' => true];
            if ($delivery->partner_request_id && $delivery->partner_request_id !== $data['partner_delivery_request_id']) return ['reference_mismatch' => true];
            if (! in_array($delivery->order()->value('status'), ['FORWARDED_TO_LOGISTICS', 'IN_TRANSIT', 'DELIVERED'], true)) return ['invalid_state' => true];

            $occurredAt = Carbon::parse($data['occurred_at']);
            $rank = ['IN_TRANSIT' => 1, 'DELIVERED' => 2];
            $currentRank = $rank[$delivery->state] ?? 0;
            $incomingRank = $rank[$data['status']];
            $processing = $incomingRank < $currentRank ? 'IGNORED_OUT_OF_ORDER' : 'APPLIED';
            $event = $delivery->statusEvents()->create([
                'logistics_partner_id' => $partner->id,
                'event_id' => $data['event_id'], 'payload_sha256' => $hash,
                'partner_status' => $data['status'], 'occurred_at' => $occurredAt,
                'processing_result' => $processing, 'note' => $data['note'] ?? null,
                'proof_reference' => $data['proof_reference'] ?? null, 'received_at' => now(),
            ]);
            if ($processing === 'APPLIED') {
                $delivery->update([
                    'partner_request_id' => $delivery->partner_request_id ?? $data['partner_delivery_request_id'],
                    'state' => $data['status'],
                    'latest_event_at' => ! $delivery->latest_event_at || $occurredAt->greaterThan($delivery->latest_event_at) ? $occurredAt : $delivery->latest_event_at,
                    'last_error_code' => null, 'last_error_message' => null, 'next_attempt_at' => null,
                ]);
                $order = $delivery->order()->lockForUpdate()->firstOrFail();
                $orderRank = $rank[$order->status] ?? 0;
                if ($incomingRank > $orderRank) {
                    $previous = $order->status;
                    $order->update(['status' => $data['status']]);
                    $order->histories()->create([
                        'previous_status' => $previous, 'new_status' => $data['status'],
                        'action' => 'LOGISTICS_'.$data['status'], 'performed_by' => null,
                    ]);
                }
            }
            return ['event' => $event, 'duplicate' => false, 'state' => $delivery->fresh()->state];
        }, 3);

        if ($result['conflict'] ?? false) return $this->error('EVENT_ID_CONFLICT', 'The event ID was already used with different content.', 409);
        if ($result['unknown'] ?? false) return $this->error('UNKNOWN_DELIVERY_REQUEST', 'The delivery request was not found.', 404);
        if ($result['wrong_partner'] ?? false) return $this->error('WRONG_PARTNER', 'This partner does not own the delivery request.', 403);
        if ($result['reference_mismatch'] ?? false) return $this->error('PARTNER_REFERENCE_MISMATCH', 'The partner delivery reference does not match.', 409);
        if ($result['invalid_state'] ?? false) return $this->error('INVALID_STATE', 'The order cannot accept logistics status updates.', 409);

        return response()->json([
            'acknowledged' => true,
            'event_id' => $data['event_id'],
            'result' => ($result['duplicate'] ?? false) ? 'DUPLICATE' : $result['event']->processing_result,
            'smartchain_status' => $result['state'],
        ]);
    }

    private function error(string $code, string $message, int $status): JsonResponse
    {
        return response()->json(['acknowledged' => false, 'error' => ['code' => $code, 'message' => $message]], $status);
    }
}
