<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SupplierApplication;
use App\Models\SupplierApplicationEvent;
use App\Models\SupplierApplicationMeetingSlot;
use App\Support\AuditLogger;
use App\Support\BusinessTime;
use App\Support\SupplierPortalNotifications;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminSupplierApplicationMeetingController extends Controller
{
    public function store(Request $request, SupplierApplication $supplierApplication): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $validated = $request->validate([
            'slots' => ['required', 'array', 'min:3', 'max:10'],
            'slots.*.date' => ['required', 'date_format:Y-m-d'],
            'slots.*.start_time' => ['required', 'date_format:H:i'],
            'slots.*.end_time' => ['required', 'date_format:H:i'],
        ]);

        // Dates are entered as Asia/Manila calendar dates, so they compare directly.
        $dates = array_column($validated['slots'], 'date');
        if (count($dates) !== count(array_unique($dates))) {
            throw ValidationException::withMessages(['slots' => ['Each meeting option must use a different date.']]);
        }

        $parsedSlots = [];
        $seen = [];
        foreach ($validated['slots'] as $index => $slot) {
            $startsAt = Carbon::createFromFormat('Y-m-d H:i', "{$slot['date']} {$slot['start_time']}", BusinessTime::TIMEZONE);
            $endsAt = Carbon::createFromFormat('Y-m-d H:i', "{$slot['date']} {$slot['end_time']}", BusinessTime::TIMEZONE);
            if ($startsAt->isPast()) {
                abort(422, 'Every meeting option must start in the future.');
            }
            if ($endsAt->lessThanOrEqualTo($startsAt)) {
                abort(422, 'Every meeting option must end after it starts.');
            }
            $key = $startsAt->toISOString().'|'.$endsAt->toISOString();
            if (isset($seen[$key])) {
                abort(422, 'Duplicate meeting options are not allowed.');
            }
            $seen[$key] = true;
            $parsedSlots[$index] = ['starts_at' => $startsAt->utc(), 'ends_at' => $endsAt->utc()];
        }

        [$application, $createdSlots] = DB::transaction(function () use ($request, $supplierApplication, $parsedSlots) {
            $application = SupplierApplication::query()->lockForUpdate()->findOrFail($supplierApplication->id);
            abort_unless(in_array($application->status, [
                SupplierApplication::STATUS_UNDER_REVIEW,
                SupplierApplication::STATUS_QUALIFIED_FOR_MEETING,
            ], true), 422, 'Meeting options can only be published during initial review or meeting qualification.');
            abort_if($application->meetingSlots()->where('status', SupplierApplicationMeetingSlot::RESERVED)->exists(), 422, 'Meeting options cannot be replaced after a schedule is confirmed.');

            $application->meetingSlots()->where('status', SupplierApplicationMeetingSlot::AVAILABLE)
                ->update(['status' => SupplierApplicationMeetingSlot::CANCELLED]);

            $createdSlots = collect($parsedSlots)->map(function (array $slot) use ($application, $request) {
                $existing = $application->meetingSlots()
                    ->where('starts_at', $slot['starts_at']->toIso8601String())
                    ->where('ends_at', $slot['ends_at']->toIso8601String())
                    ->first();
                if ($existing) {
                    $existing->update([
                        'scheduled_at' => $slot['starts_at'],
                        'status' => SupplierApplicationMeetingSlot::AVAILABLE,
                        'created_by_id' => $request->user()->id,
                        'selected_at' => null,
                        'completed_at' => null,
                        'completed_by_id' => null,
                        'evaluation_notes' => null,
                        'evaluation' => null,
                    ]);

                    return $existing->fresh();
                }

                return $application->meetingSlots()->create([
                    'scheduled_at' => $slot['starts_at'],
                    'starts_at' => $slot['starts_at'],
                    'ends_at' => $slot['ends_at'],
                    'status' => SupplierApplicationMeetingSlot::AVAILABLE,
                    'created_by_id' => $request->user()->id,
                ]);
            });

            if ($application->status !== SupplierApplication::STATUS_QUALIFIED_FOR_MEETING) {
                $application->update([
                    'status' => SupplierApplication::STATUS_QUALIFIED_FOR_MEETING,
                    'reviewed_at' => now(),
                    'reviewed_by_id' => $request->user()->id,
                    'qualified_at' => now(),
                    'qualified_by_id' => $request->user()->id,
                    'decision_reason' => null,
                    'supplier_message' => null,
                    'revision_reason_codes' => null,
                ]);
                $application->events()->create([
                    'event_type' => SupplierApplicationEvent::QUALIFIED_FOR_MEETING,
                    'title' => 'Qualified for Meeting',
                    'description' => 'Your application passed the initial review and qualified for a meeting.',
                    'occurred_at' => now(),
                ]);
            }
            $application->update([
                'alternative_schedule_message' => null,
                'alternative_schedule_requested_at' => null,
            ]);
            $application->events()->create([
                'event_type' => SupplierApplicationEvent::SLOTS_AVAILABLE,
                'title' => 'Meeting Scheduling Available',
                'description' => 'New meeting schedules are available for selection.',
                'occurred_at' => now(),
            ]);

            AuditLogger::success('SUPPLIER_APPLICATION_MEETING_OPTIONS_PUBLISHED', AuditLogger::MODULE_SUPPLIERS, [
                'actor' => $request->user(),
                'resource' => $application,
                'resource_label' => $application->application_number,
                'details' => 'Initial review completed and meeting options were published atomically.',
                'metadata' => ['meeting_slot_ids' => $createdSlots->pluck('id')->all(), 'option_count' => $createdSlots->count()],
            ]);

            return [$application->fresh(), $createdSlots];
        });

        SupplierPortalNotifications::sendStatus(
            $application,
            'Supplier Application - Select Your Meeting Schedule',
            'Meeting options available',
            'Your application passed the initial review. Please choose one of the available meeting schedules using the secure Supplier Application Portal.',
            $createdSlots->map(fn (SupplierApplicationMeetingSlot $slot) => BusinessTime::meetingRange($slot->starts_at ?? $slot->scheduled_at, $slot->ends_at).' (Asia/Manila)')->values()->all(),
        );

        return response()->json([
            'message' => 'Meeting options published.',
            'data' => ['application' => $application, 'meeting_slots' => $createdSlots],
        ], 201);
    }

    public function destroy(
        Request $request,
        SupplierApplication $supplierApplication,
        SupplierApplicationMeetingSlot $meetingSlot,
    ): JsonResponse {
        abort_unless($request->user()->isAdmin(), 403);
        abort_unless($meetingSlot->supplier_application_id === $supplierApplication->id, 404);

        DB::transaction(function () use ($request, $supplierApplication, $meetingSlot) {
            $locked = SupplierApplicationMeetingSlot::query()->lockForUpdate()->findOrFail($meetingSlot->id);
            abort_unless($locked->status === SupplierApplicationMeetingSlot::AVAILABLE, 422, 'Only an unused meeting slot can be removed.');
            $remainingOptions = $supplierApplication->meetingSlots()
                ->where('status', SupplierApplicationMeetingSlot::AVAILABLE)
                ->whereKeyNot($locked->id)
                ->count();
            abort_if($supplierApplication->status === SupplierApplication::STATUS_QUALIFIED_FOR_MEETING && $remainingOptions < 3, 422, 'At least three meeting options must remain available. Publish a replacement set instead.');
            $locked->update(['status' => SupplierApplicationMeetingSlot::CANCELLED]);

            AuditLogger::success('SUPPLIER_APPLICATION_MEETING_SLOT_CANCELLED', AuditLogger::MODULE_SUPPLIERS, [
                'actor' => $request->user(), 'resource' => $supplierApplication,
                'resource_label' => $supplierApplication->application_number,
                'metadata' => ['meeting_slot_id' => $locked->id],
            ]);
        });

        return response()->json(['message' => 'Meeting slot removed.']);
    }

    public function complete(
        Request $request,
        SupplierApplication $supplierApplication,
        SupplierApplicationMeetingSlot $meetingSlot,
    ): JsonResponse {
        abort_unless($request->user()->isAdmin(), 403);
        abort_unless($meetingSlot->supplier_application_id === $supplierApplication->id, 404);
        $validated = $request->validate([
            'overall_assessment' => ['required', Rule::in(SupplierApplicationMeetingSlot::ASSESSMENTS)],
            ...collect(SupplierApplicationMeetingSlot::EVALUATION_CHECKLIST)->mapWithKeys(fn (string $item) => [$item => ['sometimes', 'boolean']])->all(),
            'evaluation_notes' => ['nullable', 'string', 'max:5000'],
        ], ['overall_assessment.required' => 'Select an overall assessment before completing the meeting.']);
        // Checklist items are informative; unchecked items are stored as false.
        $evaluation = [
            ...collect(SupplierApplicationMeetingSlot::EVALUATION_CHECKLIST)->mapWithKeys(fn (string $item) => [$item => (bool) ($validated[$item] ?? false)])->all(),
            'overall_assessment' => $validated['overall_assessment'],
        ];

        DB::transaction(function () use ($request, $supplierApplication, $meetingSlot, $validated, $evaluation) {
            $application = SupplierApplication::query()->lockForUpdate()->findOrFail($supplierApplication->id);
            abort_unless($application->status === SupplierApplication::STATUS_MEETING_SCHEDULED, 422, 'Only a scheduled application meeting can be completed.');
            $locked = SupplierApplicationMeetingSlot::query()->lockForUpdate()->findOrFail($meetingSlot->id);
            abort_unless($locked->status === SupplierApplicationMeetingSlot::RESERVED, 422, 'Only a confirmed meeting can be marked completed.');
            abort_if(($locked->ends_at ?? $locked->starts_at ?? $locked->scheduled_at)->isFuture(), 422, 'A meeting cannot be marked completed before its scheduled end time.');
            $locked->update([
                'status' => SupplierApplicationMeetingSlot::COMPLETED,
                'completed_at' => now(),
                'completed_by_id' => $request->user()->id,
                'evaluation_notes' => filled($validated['evaluation_notes'] ?? null) ? trim($validated['evaluation_notes']) : null,
                'evaluation' => $evaluation,
            ]);
            $application->update(['status' => SupplierApplication::STATUS_MEETING_COMPLETED]);

            $application->events()->create([
                'event_type' => SupplierApplicationEvent::MEETING_COMPLETED,
                'title' => 'Meeting Completed',
                'description' => 'Your supplier evaluation meeting was completed. The application is awaiting final evaluation.',
                'occurred_at' => now(),
            ]);

            AuditLogger::success('SUPPLIER_APPLICATION_MEETING_COMPLETED', AuditLogger::MODULE_SUPPLIERS, [
                'actor' => $request->user(), 'resource' => $application,
                'resource_label' => $application->application_number,
                'metadata' => ['meeting_slot_id' => $locked->id, 'overall_assessment' => $evaluation['overall_assessment']],
            ]);
        });

        return response()->json(['message' => 'Meeting marked completed. The application is ready for a final decision.']);
    }
}
