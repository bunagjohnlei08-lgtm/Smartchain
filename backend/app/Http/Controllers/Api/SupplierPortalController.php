<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SupplierApplication;
use App\Models\SupplierApplicationAccess;
use App\Models\SupplierApplicationEvent;
use App\Models\SupplierApplicationMeetingSlot;
use App\Models\User;
use App\Notifications\WorkflowNotification;
use App\Support\AuditLogger;
use App\Support\BusinessTime;
use App\Support\SupplierApplicationOfferings;
use App\Support\SupplierPortalAccess;
use App\Support\SupplierPortalNotifications;
use App\Support\WorkflowNotificationSender;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class SupplierPortalController extends Controller
{
    public function exchange(Request $request): JsonResponse
    {
        $validated = $request->validate(['access_token' => ['required', 'string', 'size:64']]);
        $exchange = DB::transaction(function () use ($validated) {
            $access = SupplierApplicationAccess::query()
                ->where('link_token_hash', SupplierPortalAccess::hash($validated['access_token']))
                ->lockForUpdate()
                ->first();

            if (! $access || $access->revoked_at || $access->link_consumed_at) {
                return ['error' => 'This application access link is invalid or has already been used.', 'status' => 401];
            }

            if ($access->link_expires_at->isPast()) {
                return ['error' => 'This application access link has expired.', 'status' => 410];
            }

            $session = SupplierPortalAccess::issueSession($access);
            $access->forceFill(['link_consumed_at' => now()])->save();

            return ['access' => $access, 'session' => $session];
        });

        if (isset($exchange['error'])) {
            return response()->json(['message' => $exchange['error']], $exchange['status']);
        }

        /** @var SupplierApplicationAccess $access */
        $access = $exchange['access'];
        $session = $exchange['session'];

        AuditLogger::success('SUPPLIER_PORTAL_ACCESSED', AuditLogger::MODULE_SUPPLIERS, [
            'actor_identifier' => 'Supplier applicant',
            'resource' => $access->application,
            'resource_label' => $access->application->application_number,
            'details' => 'A valid temporary supplier portal link was exchanged for an application-scoped session.',
        ]);

        return response()->json([
            'session_token' => $session['token'],
            'expires_at' => $session['expires_at'],
        ]);
    }

    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->portalData($this->application($request))]);
    }

    public function selectMeeting(Request $request, int $meetingSlot): JsonResponse
    {
        $application = $this->application($request);

        try {
            $slot = DB::transaction(function () use ($application, $meetingSlot) {
                $lockedApplication = SupplierApplication::query()->lockForUpdate()->findOrFail($application->id);
                abort_unless($lockedApplication->status === SupplierApplication::STATUS_QUALIFIED_FOR_MEETING, 422, 'Meeting selection is not available at the current application stage.');
                $locked = SupplierApplicationMeetingSlot::query()
                    ->where('supplier_application_id', $lockedApplication->id)
                    ->lockForUpdate()
                    ->find($meetingSlot);

                abort_unless($locked, 404);

                if ($locked->status !== SupplierApplicationMeetingSlot::AVAILABLE || ($locked->starts_at ?? $locked->scheduled_at)->isPast()) {
                    abort(409, 'This meeting slot is no longer available. Please select another schedule.');
                }

                $alreadySelected = SupplierApplicationMeetingSlot::query()
                    ->where('supplier_application_id', $lockedApplication->id)
                    ->where('status', SupplierApplicationMeetingSlot::RESERVED)
                    ->lockForUpdate()
                    ->exists();
                abort_if($alreadySelected, 422, 'A meeting schedule has already been confirmed for this application.');

                if ($locked->created_by_id) {
                    if (DB::getDriverName() === 'pgsql') {
                        DB::select('SELECT pg_advisory_xact_lock(?)', [$locked->created_by_id]);
                    }
                    $hasConflict = SupplierApplicationMeetingSlot::query()
                        ->where('created_by_id', $locked->created_by_id)
                        ->where('status', SupplierApplicationMeetingSlot::RESERVED)
                        ->whereKeyNot($locked->id)
                        ->where('starts_at', '<', $locked->ends_at->toIso8601String())
                        ->where('ends_at', '>', $locked->starts_at->toIso8601String())
                        ->lockForUpdate()
                        ->exists();
                    abort_if($hasConflict, 409, 'This meeting option is no longer available because it conflicts with another confirmed meeting.');
                }

                $locked->update([
                    'status' => SupplierApplicationMeetingSlot::RESERVED,
                    'selected_at' => now(),
                ]);
                $lockedApplication->meetingSlots()
                    ->whereKeyNot($locked->id)
                    ->where('status', SupplierApplicationMeetingSlot::AVAILABLE)
                    ->update(['status' => SupplierApplicationMeetingSlot::CANCELLED]);
                $lockedApplication->update(['status' => SupplierApplication::STATUS_MEETING_SCHEDULED]);
                $lockedApplication->events()->create([
                    'event_type' => SupplierApplicationEvent::MEETING_SELECTED,
                    'title' => 'Meeting Schedule Confirmed',
                    'description' => 'The applicant selected an available meeting schedule.',
                    'occurred_at' => now(),
                ]);

                AuditLogger::success('SUPPLIER_APPLICATION_MEETING_SELECTED', AuditLogger::MODULE_SUPPLIERS, [
                    'actor_identifier' => 'Supplier applicant',
                    'resource' => $lockedApplication,
                    'resource_label' => $lockedApplication->application_number,
                    'metadata' => [
                        'meeting_slot_id' => $locked->id,
                        'starts_at' => ($locked->starts_at ?? $locked->scheduled_at)->toISOString(),
                        'ends_at' => $locked->ends_at?->toISOString(),
                    ],
                ]);

                return $locked->fresh();
            });
        } catch (QueryException $exception) {
            if ((string) $exception->getCode() === '23505') {
                return response()->json(['message' => 'This meeting slot is no longer available. Please select another schedule.'], 409);
            }

            throw $exception;
        }

        SupplierPortalNotifications::sendMeetingConfirmation($application, $slot);
        $admins = User::query()->where('status', 'ACTIVE')
            ->whereHas('role', fn ($query) => $query->where('slug', 'ADMIN'))->get();
        $startsAt = $slot->starts_at ?? $slot->scheduled_at;
        $endsAt = $slot->ends_at ?? $startsAt->copy()->addHour();
        WorkflowNotificationSender::send($admins, new WorkflowNotification(
            'Supplier Meeting Confirmed',
            "{$application->company_name} selected ".BusinessTime::meetingRange($startsAt, $endsAt).' (Asia/Manila).',
            'success',
            $application->application_number,
            'Supplier Applications',
            [
                'supplier_application_id' => $application->id,
                'application_reference' => $application->application_number,
                'meeting_slot_id' => $slot->id,
                'starts_at' => $startsAt->toISOString(),
                'ends_at' => $endsAt->toISOString(),
            ],
        ));

        return response()->json([
            'message' => 'Meeting schedule confirmed.',
            'data' => $this->portalData($application->fresh()),
        ]);
    }

    public function requestAnotherSchedule(Request $request): JsonResponse
    {
        $application = $this->application($request);
        $validated = $request->validate([
            'message' => ['required', 'string', 'min:3', 'max:2000'],
        ]);

        $application = DB::transaction(function () use ($application, $validated) {
            $locked = SupplierApplication::query()->lockForUpdate()->findOrFail($application->id);
            abort_unless($locked->status === SupplierApplication::STATUS_QUALIFIED_FOR_MEETING, 422, 'Another schedule can only be requested while meeting options are available.');
            abort_if($locked->alternative_schedule_requested_at, 422, 'Another meeting schedule has already been requested.');

            $locked->update([
                'alternative_schedule_message' => trim($validated['message']),
                'alternative_schedule_requested_at' => now(),
            ]);
            $locked->events()->create([
                'event_type' => SupplierApplicationEvent::ALTERNATIVE_SCHEDULE_REQUESTED,
                'title' => 'Alternative Schedule Requested',
                'description' => 'You requested another meeting schedule. SmartChain will provide updated options.',
                'occurred_at' => now(),
            ]);
            AuditLogger::success('SUPPLIER_APPLICATION_ALTERNATIVE_SCHEDULE_REQUESTED', AuditLogger::MODULE_SUPPLIERS, [
                'actor_identifier' => 'Supplier applicant',
                'resource' => $locked,
                'resource_label' => $locked->application_number,
                'details' => 'The applicant requested another meeting schedule.',
            ]);

            return $locked->fresh();
        });

        $this->notifyAdmins(
            $application,
            'Supplier Requested Another Meeting Schedule',
            "{$application->company_name} could not attend the currently offered schedules and requested another meeting option.",
            'warning',
        );

        return response()->json([
            'message' => 'Your request was sent. SmartChain will provide updated meeting options.',
            'data' => $this->portalData($application),
        ]);
    }

    public function resubmit(Request $request): JsonResponse
    {
        $application = $this->application($request);
        if ($request->has('offerings')) {
            $request->merge(['offerings' => SupplierApplicationOfferings::trimInput($request->input('offerings'))]);
        }
        $validated = $request->validate([
            ...SupplierApplicationOfferings::rules(false),
            'owner_name' => ['nullable', 'string', 'min:2', 'max:255'],
            'address' => ['nullable', 'string', 'min:5', 'max:2000'],
            'contact_person' => ['nullable', 'string', 'min:2', 'max:255'],
            'phone' => ['nullable', 'string', 'regex:/^[0-9]+$/', 'max:30'],
            'business_type' => ['nullable', 'string', 'min:2', 'max:100'],
            'supply_category' => ['nullable', 'string', 'min:2', 'max:150'],
            'products_services' => ['nullable', 'string', 'max:5000'],
            'business_certificate' => ['nullable', 'array', 'min:1', 'max:2'],
            'business_certificate.*' => ['file', 'mimes:pdf,jpg,jpeg,png', 'mimetypes:application/pdf,image/jpeg,image/png', 'extensions:pdf,jpg,jpeg,png', 'max:5120'],
            'business_permit' => ['nullable', 'array', 'min:1', 'max:2'],
            'business_permit.*' => ['file', 'mimes:pdf,jpg,jpeg,png', 'mimetypes:application/pdf,image/jpeg,image/png', 'extensions:pdf,jpg,jpeg,png', 'max:5120'],
            'product_service_image' => ['nullable', 'array', 'min:1', 'max:5'],
            'product_service_image.*' => ['file', 'image', 'mimes:jpg,jpeg,png', 'mimetypes:image/jpeg,image/png', 'extensions:jpg,jpeg,png', 'max:5120'],
        ], SupplierApplicationOfferings::messages());
        $offerings = array_key_exists('offerings', $validated)
            ? SupplierApplicationOfferings::normalize($validated['offerings'])
            : null;

        $storedPaths = [];
        try {
            $application = DB::transaction(function () use ($request, $application, $validated, $offerings, &$storedPaths) {
                $locked = SupplierApplication::query()->lockForUpdate()->findOrFail($application->id);
                abort_unless($locked->status === SupplierApplication::STATUS_NEEDS_REVISION, 422, 'Corrections can only be submitted when the application requires revision.');

                $reasons = $locked->revision_reason_codes ?? [];
                $informationAllowed = array_intersect($reasons, ['INFORMATION_MISMATCH', 'INCOMPLETE_INFORMATION', 'OTHER']) !== [];
                $informationFields = ['owner_name', 'address', 'contact_person', 'phone', 'business_type', 'supply_category', 'products_services'];
                $informationUpdates = [];
                foreach ($informationFields as $field) {
                    if (array_key_exists($field, $validated)) {
                        abort_unless($informationAllowed, 422, 'Information fields were not requested for revision.');
                        $newValue = trim((string) $validated[$field]);
                        if ($newValue !== (string) $locked->{$field}) {
                            $informationUpdates[$field] = $newValue;
                        }
                    }
                }

                $offeringsChanged = false;
                if ($offerings !== null) {
                    abort_unless($informationAllowed, 422, 'Information fields were not requested for revision.');
                    $current = $locked->offerings()->get()->map(fn ($offering) => [$offering->type, $offering->name, $offering->category, $offering->description])->all();
                    $offeringsChanged = $current !== array_map(fn (array $row) => [$row['type'], $row['name'], $row['category'], $row['description']], $offerings);
                }

                $attachmentMap = [
                    'business_certificate' => ['BUSINESS_CERTIFICATE', 'BUSINESS_CERTIFICATE'],
                    'business_permit' => ['BUSINESS_PERMIT', 'BUSINESS_PERMIT'],
                    'product_service_image' => ['PRODUCT_SERVICE_IMAGE', 'PRODUCT_SERVICE_IMAGE'],
                ];
                $replacementFields = array_values(array_filter(array_keys($attachmentMap), fn (string $field) => $request->hasFile($field)));
                foreach ($replacementFields as $field) {
                    [$reasonCode] = $attachmentMap[$field];
                    abort_unless(in_array($reasonCode, $reasons, true) || in_array('UNREADABLE_DOCUMENT', $reasons, true) || in_array('OTHER', $reasons, true), 422, 'That attachment was not requested for revision.');
                }
                abort_if($informationUpdates === [] && ! $offeringsChanged && $replacementFields === [], 422, 'Submit at least one requested correction.');

                $replacedTypes = collect($replacementFields)->map(fn (string $field) => $attachmentMap[$field][1])->all();
                $seenHashes = $locked->attachments()->where('is_current', true)
                    ->when($replacedTypes !== [], fn ($query) => $query->whereNotIn('attachment_type', $replacedTypes))
                    ->whereNotNull('file_sha256')->pluck('file_sha256')->flip()->all();
                $uploads = [];
                foreach ($replacementFields as $field) {
                    foreach ($request->file($field, []) as $upload) {
                        $path = $upload->getRealPath();
                        $hash = is_string($path) ? hash_file('sha256', $path) : false;
                        if (! is_string($hash)) {
                            throw ValidationException::withMessages([$field => ['One of the uploaded files could not be read.']]);
                        }
                        if (isset($seenHashes[$hash])) {
                            throw ValidationException::withMessages([$field => ['The same file cannot be submitted more than once.']]);
                        }
                        $seenHashes[$hash] = true;
                        $uploads[$field][] = [$upload, $hash];
                    }
                }

                foreach ($replacementFields as $field) {
                    [, $type] = $attachmentMap[$field];
                    $locked->attachments()->where('attachment_type', $type)->where('is_current', true)
                        ->update(['is_current' => false, 'replaced_at' => now()->toIso8601String()]);
                    foreach ($uploads[$field] as [$upload, $hash]) {
                        $storedPath = Storage::disk('local')->putFile("supplier-applications/{$locked->id}", $upload);
                        if (! $storedPath) {
                            throw new \RuntimeException('Supplier application attachment storage failed.');
                        }
                        $storedPaths[] = $storedPath;
                        $locked->attachments()->create([
                            'attachment_type' => $type,
                            'original_name' => Str::limit(basename($upload->getClientOriginalName()), 255, ''),
                            'stored_path' => $storedPath,
                            'mime_type' => (string) $upload->getMimeType(),
                            'file_size' => $upload->getSize(),
                            'file_sha256' => $hash,
                            'is_current' => true,
                        ]);
                    }
                }

                if ($offeringsChanged) {
                    // Applications needing revision are never approved, so no offering is mapped yet.
                    $locked->offerings()->delete();
                    $locked->offerings()->createMany($offerings);
                }
                $locked->update([
                    ...$informationUpdates,
                    'status' => SupplierApplication::STATUS_UNDER_REVIEW,
                    'revision_reason_codes' => null,
                    'supplier_message' => null,
                    'decision_reason' => null,
                ]);
                $locked->events()->create([
                    'event_type' => SupplierApplicationEvent::CORRECTIONS_SUBMITTED,
                    'title' => 'Corrections Submitted',
                    'description' => 'Your corrections were submitted successfully.',
                    'occurred_at' => now(),
                ]);
                $locked->events()->create([
                    'event_type' => SupplierApplicationEvent::UNDER_REVIEW,
                    'title' => 'Application Under Review',
                    'description' => 'Your corrected application is being reviewed by SmartChain.',
                    'occurred_at' => now()->addMicrosecond(),
                ]);
                AuditLogger::success('SUPPLIER_APPLICATION_CORRECTIONS_SUBMITTED', AuditLogger::MODULE_SUPPLIERS, [
                    'actor_identifier' => 'Supplier applicant',
                    'resource' => $locked,
                    'resource_label' => $locked->application_number,
                    'metadata' => ['replaced_attachment_types' => $replacedTypes, 'updated_fields' => [...array_keys($informationUpdates), ...($offeringsChanged ? ['offerings'] : [])]],
                ]);

                return $locked->fresh();
            });
        } catch (Throwable $exception) {
            foreach ($storedPaths as $path) {
                Storage::disk('local')->delete($path);
            }
            throw $exception;
        }

        $this->notifyAdmins(
            $application,
            'Supplier Corrections Resubmitted',
            "{$application->company_name} submitted corrections for {$application->application_number}.",
            'info',
        );
        SupplierPortalNotifications::sendStatus(
            $application,
            'Supplier Application Corrections Received',
            'Corrections received',
            'Your corrections were received and your application is under review again.',
        );

        return response()->json([
            'message' => 'Corrections submitted successfully.',
            'data' => $this->portalData($application),
        ]);
    }

    private function application(Request $request): SupplierApplication
    {
        /** @var SupplierApplicationAccess $access */
        $access = $request->attributes->get('supplier_portal_access');

        return $access->application;
    }

    private function portalData(SupplierApplication $application): array
    {
        $application->loadMissing(['attachments', 'events', 'meetingSlots', 'offerings']);
        $reserved = $application->meetingSlots->firstWhere('status', SupplierApplicationMeetingSlot::RESERVED)
            ?? $application->meetingSlots->firstWhere('status', SupplierApplicationMeetingSlot::COMPLETED);

        return [
            'application_number' => $application->application_number,
            'company_name' => $application->company_name,
            'contact_person' => $application->contact_person,
            'email' => $application->email,
            'business_type' => $application->business_type,
            'supply_category' => $application->supply_category,
            'products_services' => $application->products_services,
            'offerings' => SupplierApplicationOfferings::present($application->offerings),
            'submitted_at' => $application->submitted_at,
            'status' => $application->status,
            'supplier_message' => $application->supplier_message,
            'revision_reason_codes' => $application->revision_reason_codes,
            'alternative_schedule_requested' => (bool) $application->alternative_schedule_requested_at,
            'attachments' => $application->attachments->where('is_current', true)->map(fn ($attachment) => [
                'attachment_type' => $attachment->attachment_type,
                'original_name' => $attachment->original_name,
                'mime_type' => $attachment->mime_type,
                'file_size' => $attachment->file_size,
            ])->values(),
            'history' => $application->events->map(fn ($event) => [
                'event_type' => $event->event_type,
                'title' => $event->title,
                'description' => $event->description,
                'occurred_at' => $event->occurred_at,
            ])->values(),
            'available_meeting_slots' => $reserved ? [] : $application->meetingSlots
                ->where('status', SupplierApplicationMeetingSlot::AVAILABLE)
                ->filter(fn ($slot) => ($slot->starts_at ?? $slot->scheduled_at)->isFuture())
                ->map(fn ($slot) => [
                    'id' => $slot->id,
                    'starts_at' => $slot->starts_at ?? $slot->scheduled_at,
                    'ends_at' => $slot->ends_at ?? ($slot->starts_at ?? $slot->scheduled_at)->copy()->addHour(),
                ])
                ->values(),
            'confirmed_meeting' => $reserved ? [
                'id' => $reserved->id,
                'starts_at' => $reserved->starts_at ?? $reserved->scheduled_at,
                'ends_at' => $reserved->ends_at ?? ($reserved->starts_at ?? $reserved->scheduled_at)->copy()->addHour(),
                'status' => $reserved->status === SupplierApplicationMeetingSlot::COMPLETED ? 'COMPLETED' : 'CONFIRMED',
            ] : null,
        ];
    }

    private function notifyAdmins(
        SupplierApplication $application,
        string $title,
        string $message,
        string $type,
    ): void {
        $admins = User::query()->where('status', 'ACTIVE')
            ->whereHas('role', fn ($query) => $query->where('slug', 'ADMIN'))->get();
        WorkflowNotificationSender::send($admins, new WorkflowNotification(
            $title,
            $message,
            $type,
            $application->application_number,
            'Supplier Applications',
            [
                'supplier_application_id' => $application->id,
                'application_reference' => $application->application_number,
                'application_status' => $application->status,
            ],
        ));
    }
}
