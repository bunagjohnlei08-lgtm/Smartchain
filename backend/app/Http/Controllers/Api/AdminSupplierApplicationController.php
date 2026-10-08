<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use App\Models\SupplierAlias;
use App\Models\SupplierApplication;
use App\Models\SupplierApplicationAttachment;
use App\Models\SupplierApplicationEvent;
use App\Support\AuditLogger;
use App\Support\SupplierName;
use App\Support\SupplierPortalNotifications;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminSupplierApplicationController extends Controller
{
    private const REVISION_REASON_CODES = [
        'BUSINESS_CERTIFICATE',
        'BUSINESS_PERMIT',
        'PRODUCT_SERVICE_IMAGE',
        'UNREADABLE_DOCUMENT',
        'INFORMATION_MISMATCH',
        'INCOMPLETE_INFORMATION',
        'OTHER',
    ];

    private const INITIAL_REJECTION_REASON_CODES = [
        'INELIGIBLE',
        'DOCUMENTS_CANNOT_BE_VALIDATED',
        'OUTSIDE_CURRENT_REQUIREMENTS',
        'COMPLIANCE_NOT_SATISFIED',
        'OTHER',
    ];

    private const FINAL_REJECTION_REASON_CODES = [
        'SUPPLIER_REQUIREMENTS_NOT_MET',
        'CAPABILITY_NOT_MET',
        'DELIVERY_CONCERNS',
        'COMMERCIAL_TERMS_UNACCEPTABLE',
        'COMPLIANCE_NOT_SATISFIED',
        'OTHER',
    ];

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', Rule::in(array_diff(SupplierApplication::STATUSES, [SupplierApplication::STATUS_REJECTED]))],
        ]);

        // Operational list only: rejected applications stay in the database (detail,
        // history, attachments, audit) but are not listed here.
        $query = SupplierApplication::query()->with(['reviewedBy:id,name', 'qualifiedBy:id,name', 'decidedBy:id,name', 'approvedSupplier:id,supplier_code,name'])
            ->where('status', '!=', SupplierApplication::STATUS_REJECTED)
            ->when($validated['search'] ?? null, function ($query, string $search) {
                $term = '%'.str_replace(['%', '_'], ['\\%', '\\_'], trim($search)).'%';
                $query->where(fn ($nested) => $nested
                    ->where('application_number', 'ilike', $term)
                    ->orWhere('company_name', 'ilike', $term)
                    ->orWhere('contact_person', 'ilike', $term)
                    ->orWhere('email', 'ilike', $term));
            })
            ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('status', $status));

        $counts = SupplierApplication::query()->selectRaw('status, COUNT(*) as aggregate')->groupBy('status')->pluck('aggregate', 'status');
        $applications = $query->orderByDesc('submitted_at')->paginate(50);

        return response()->json([
            'data' => $applications->items(),
            'meta' => [
                'current_page' => $applications->currentPage(),
                'last_page' => $applications->lastPage(),
                'total' => $applications->total(),
                'counts' => collect(SupplierApplication::STATUSES)->mapWithKeys(fn ($status) => [$status => (int) ($counts[$status] ?? 0)]),
                'pending_action' => (int) ($counts[SupplierApplication::STATUS_PENDING] ?? 0) + (int) ($counts[SupplierApplication::STATUS_UNDER_REVIEW] ?? 0),
            ],
        ]);
    }

    public function show(Request $request, SupplierApplication $supplierApplication): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);

        return response()->json(['data' => $this->applicationData($supplierApplication)]);
    }

    public function startReview(Request $request, SupplierApplication $supplierApplication): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);

        $application = DB::transaction(function () use ($request, $supplierApplication) {
            $locked = SupplierApplication::query()->lockForUpdate()->findOrFail($supplierApplication->id);
            abort_unless(in_array($locked->status, [SupplierApplication::STATUS_PENDING, SupplierApplication::STATUS_UNDER_REVIEW], true), 422, 'Only a pending application can enter review.');

            if ($locked->status === SupplierApplication::STATUS_PENDING) {
                $locked->update(['status' => SupplierApplication::STATUS_UNDER_REVIEW, 'reviewed_by_id' => $request->user()->id]);
                $locked->events()->create([
                    'event_type' => SupplierApplicationEvent::UNDER_REVIEW,
                    'title' => 'Application Under Review',
                    'description' => 'Your application is being reviewed by SmartChain.',
                    'occurred_at' => now(),
                ]);
                AuditLogger::success('SUPPLIER_APPLICATION_REVIEW_STARTED', AuditLogger::MODULE_SUPPLIERS, [
                    'actor' => $request->user(), 'resource' => $locked, 'resource_label' => $locked->application_number,
                ]);
            }

            return $locked->fresh(['reviewedBy:id,name', 'approvedSupplier:id,supplier_code,name', 'attachments']);
        });

        return response()->json(['data' => $this->applicationData($application)]);
    }

    public function qualify(Request $request, SupplierApplication $supplierApplication): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);

        return response()->json([
            'message' => 'Publish at least three meeting options to qualify this application.',
        ], 422);
    }

    public function requestRevision(Request $request, SupplierApplication $supplierApplication): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $validated = $request->validate([
            'reason_codes' => ['required', 'array', 'min:1'],
            'reason_codes.*' => ['required', 'string', 'distinct', Rule::in(self::REVISION_REASON_CODES)],
            'supplier_message' => ['required', 'string', 'min:3', 'max:2000'],
            'internal_note' => ['nullable', 'string', 'max:2000'],
        ]);

        $application = DB::transaction(function () use ($request, $supplierApplication, $validated) {
            $locked = SupplierApplication::query()->lockForUpdate()->findOrFail($supplierApplication->id);
            abort_unless($locked->status === SupplierApplication::STATUS_UNDER_REVIEW, 422, 'Only an application under review can be returned for revision.');

            $locked->update([
                'status' => SupplierApplication::STATUS_NEEDS_REVISION,
                'revision_reason_codes' => array_values($validated['reason_codes']),
                'supplier_message' => trim($validated['supplier_message']),
                'decision_reason' => filled($validated['internal_note'] ?? null) ? trim($validated['internal_note']) : null,
                'reviewed_at' => now(),
                'reviewed_by_id' => $request->user()->id,
            ]);
            $locked->events()->create([
                'event_type' => SupplierApplicationEvent::RETURNED_FOR_REVISION,
                'title' => 'Returned for Revision',
                'description' => $locked->supplier_message,
                'occurred_at' => now(),
            ]);
            AuditLogger::success('SUPPLIER_APPLICATION_RETURNED_FOR_REVISION', AuditLogger::MODULE_SUPPLIERS, [
                'actor' => $request->user(),
                'resource' => $locked,
                'resource_label' => $locked->application_number,
                'details' => 'Correctable application issues were returned to the applicant.',
                'metadata' => ['reason_codes' => $locked->revision_reason_codes],
            ]);

            return $locked->fresh();
        });

        SupplierPortalNotifications::sendStatus(
            $application,
            'Supplier Application Requires Corrections',
            'Action required',
            $application->supplier_message,
        );

        return response()->json([
            'message' => 'Application returned for revision.',
            'data' => $this->applicationData($application),
        ]);
    }

    public function approve(Request $request, SupplierApplication $supplierApplication): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);

        $result = DB::transaction(function () use ($request, $supplierApplication) {
            $application = SupplierApplication::query()->lockForUpdate()->findOrFail($supplierApplication->id);

            if ($application->status === SupplierApplication::STATUS_APPROVED && $application->approved_supplier_id) {
                return [$application->fresh(['reviewedBy:id,name', 'approvedSupplier:id,supplier_code,name', 'attachments']), false];
            }

            abort_if($application->status === SupplierApplication::STATUS_REJECTED, 422, 'A rejected application cannot be approved.');
            abort_if($application->status === SupplierApplication::STATUS_APPROVED, 409, 'The approved application no longer has its linked supplier. Resolve the official record before retrying.');
            abort_unless($application->status === SupplierApplication::STATUS_MEETING_COMPLETED, 422, 'Final supplier approval requires a completed meeting.');

            // Different applications have different row locks. This stable
            // transaction-scoped PostgreSQL lock serializes the duplicate check
            // and official Supplier insert without retaining an application lock.
            DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['smartchain_supplier_approval']);
            $this->guardAgainstDuplicateSupplier($application);

            $supplier = new Supplier([
                'name' => $application->company_name,
                'contact_person' => $application->contact_person,
                'email' => $application->email,
                'phone' => $application->phone,
                'address' => $application->address,
                'business_type' => $application->business_type,
                'supply_category' => $application->supply_category,
                'products_services' => $application->products_services,
                'status' => 'ACTIVE',
                'notes' => "Approved from {$application->application_number}.",
            ]);
            $supplier->forceFill(['supplier_code' => 'TMP-'.Str::uuid()])->save();
            $supplier->forceFill(['supplier_code' => $this->supplierCode($supplier)])->save();

            $application->update([
                'status' => SupplierApplication::STATUS_APPROVED,
                'reviewed_at' => now(),
                'reviewed_by_id' => $request->user()->id,
                'decided_at' => now(),
                'decided_by_id' => $request->user()->id,
                'decision_reason' => null,
                'supplier_message' => null,
                'decision_reason_codes' => null,
                'revision_reason_codes' => null,
                'approved_supplier_id' => $supplier->id,
            ]);
            $application->events()->create([
                'event_type' => SupplierApplicationEvent::APPROVED,
                'title' => 'Approved as Supplier',
                'description' => 'Your application completed the evaluation process and was approved as an official supplier.',
                'occurred_at' => now(),
            ]);

            AuditLogger::success('SUPPLIER_APPLICATION_APPROVED', AuditLogger::MODULE_SUPPLIERS, [
                'actor' => $request->user(), 'resource' => $application, 'resource_label' => $application->application_number,
                'details' => "Approved and created active supplier {$supplier->supplier_code}.",
                'metadata' => ['supplier_id' => $supplier->id],
            ]);

            return [$application->fresh(['reviewedBy:id,name', 'approvedSupplier:id,supplier_code,name', 'attachments']), true];
        });

        if ($result[1]) {
            SupplierPortalNotifications::sendStatus(
                $result[0],
                'Supplier Application Approved',
                'Application approved',
                'Your supplier application completed the evaluation process and was approved. Your company is now registered as an official supplier.',
            );
        }

        return response()->json([
            'message' => $result[1] ? 'Application approved and active supplier created.' : 'Application was already approved; no duplicate supplier was created.',
            'data' => $this->applicationData($result[0]),
        ]);
    }

    public function reject(Request $request, SupplierApplication $supplierApplication): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        $validated = $request->validate([
            'reason_codes' => ['required', 'array', 'min:1'],
            'reason_codes.*' => ['required', 'string', 'distinct'],
            'supplier_message' => ['required', 'string', 'min:3', 'max:2000'],
            'internal_note' => ['nullable', 'string', 'max:2000'],
        ]);

        [$application, $changed] = DB::transaction(function () use ($request, $supplierApplication, $validated) {
            $locked = SupplierApplication::query()->lockForUpdate()->findOrFail($supplierApplication->id);
            abort_unless(in_array($locked->status, [SupplierApplication::STATUS_UNDER_REVIEW, SupplierApplication::STATUS_MEETING_COMPLETED], true), 422, 'This application cannot be rejected at its current stage.');

            $allowedCodes = $locked->status === SupplierApplication::STATUS_MEETING_COMPLETED
                ? self::FINAL_REJECTION_REASON_CODES
                : self::INITIAL_REJECTION_REASON_CODES;
            $invalidCodes = array_diff($validated['reason_codes'], $allowedCodes);
            if ($invalidCodes !== []) {
                throw ValidationException::withMessages(['reason_codes' => ['One or more rejection reasons are invalid for this decision stage.']]);
            }

            $locked->update([
                'status' => SupplierApplication::STATUS_REJECTED,
                'reviewed_at' => now(),
                'reviewed_by_id' => $request->user()->id,
                'decided_at' => now(),
                'decided_by_id' => $request->user()->id,
                'decision_reason_codes' => array_values($validated['reason_codes']),
                'decision_reason' => filled($validated['internal_note'] ?? null) ? trim($validated['internal_note']) : null,
                'supplier_message' => trim($validated['supplier_message']),
            ]);
            $locked->events()->create([
                'event_type' => SupplierApplicationEvent::REJECTED,
                'title' => 'Application Rejected',
                'description' => $locked->supplier_message,
                'occurred_at' => now(),
            ]);
            AuditLogger::success('SUPPLIER_APPLICATION_REJECTED', AuditLogger::MODULE_SUPPLIERS, [
                'actor' => $request->user(), 'resource' => $locked, 'resource_label' => $locked->application_number,
                'details' => 'Supplier application rejected with structured supplier-safe reasons.',
                'metadata' => ['reason_codes' => $locked->decision_reason_codes],
            ]);

            return [$locked->fresh(['reviewedBy:id,name', 'approvedSupplier:id,supplier_code,name', 'attachments']), true];
        });

        if ($changed) {
            SupplierPortalNotifications::sendStatus(
                $application,
                $application->qualified_at ? 'Supplier Application Result' : 'Supplier Application Update',
                'Application not approved',
                $application->supplier_message,
            );
        }

        return response()->json(['message' => 'Application rejected.', 'data' => $this->applicationData($application)]);
    }

    public function previewAttachment(
        Request $request,
        SupplierApplication $supplierApplication,
        SupplierApplicationAttachment $attachment
    ): JsonResponse|StreamedResponse {
        return $this->attachmentResponse($request, $supplierApplication, $attachment, false);
    }

    public function downloadAttachment(
        Request $request,
        SupplierApplication $supplierApplication,
        SupplierApplicationAttachment $attachment
    ): JsonResponse|StreamedResponse {
        return $this->attachmentResponse($request, $supplierApplication, $attachment, true);
    }

    private function attachmentResponse(
        Request $request,
        SupplierApplication $application,
        SupplierApplicationAttachment $attachment,
        bool $download
    ): JsonResponse|StreamedResponse {
        abort_unless($request->user()->isAdmin(), 403);
        abort_unless($attachment->supplier_application_id === $application->id, 404);

        if (! Storage::disk('local')->exists($attachment->stored_path)) {
            return response()->json(['message' => 'Supplier application attachment not found.'], 404);
        }

        $filename = str_replace(['"', "\r", "\n"], '', basename($attachment->original_name));
        $headers = [
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store',
            'Content-Type' => $attachment->mime_type,
            'Content-Security-Policy' => "default-src 'none'; sandbox",
        ];

        if ($download) {
            return Storage::disk('local')->download($attachment->stored_path, $filename, $headers);
        }

        return Storage::disk('local')->response($attachment->stored_path, $filename, [
            ...$headers,
            'Content-Disposition' => 'inline; filename="'.$filename.'"',
        ]);
    }

    private function applicationData(SupplierApplication $application): array
    {
        $application->loadMissing([
            'reviewedBy:id,name', 'qualifiedBy:id,name', 'decidedBy:id,name',
            'approvedSupplier:id,supplier_code,name', 'attachments',
            'events', 'meetingSlots.createdBy:id,name', 'meetingSlots.completedBy:id,name',
            'offerings.mappedProduct:id,name',
        ]);
        $data = $application->toArray();
        $data['offerings'] = $application->offerings->map(fn ($offering) => [
            'id' => $offering->id,
            'type' => $offering->type,
            'name' => $offering->name,
            'category' => $offering->category,
            'description' => $offering->description,
            'mapped_product' => $offering->mappedProduct?->only(['id', 'name']),
            'mapped_at' => $offering->mapped_at,
        ])->values()->all();
        $data['attachments'] = $application->attachments->where('is_current', true)->map(fn (SupplierApplicationAttachment $attachment) => [
            'id' => $attachment->id,
            'attachment_type' => $attachment->attachment_type,
            'original_name' => $attachment->original_name,
            'mime_type' => $attachment->mime_type,
            'file_size' => $attachment->file_size,
            'preview_url' => "/admin/supplier-applications/{$application->id}/attachments/{$attachment->id}/preview",
            'download_url' => "/admin/supplier-applications/{$application->id}/attachments/{$attachment->id}/download",
            'created_at' => $attachment->created_at,
        ])->values()->all();

        return $data;
    }

    private function guardAgainstDuplicateSupplier(SupplierApplication $application): void
    {
        $duplicate = Supplier::query()->get(['id', 'supplier_code', 'name', 'email'])->first(fn (Supplier $supplier) => SupplierName::normalize($supplier->name) === $application->normalized_company_name
            || ($supplier->email && mb_strtolower(trim($supplier->email)) === $application->normalized_email)
        );
        $duplicate ??= SupplierAlias::query()->with('supplier:id,supplier_code,name,email')
            ->where('normalized_alias', $application->normalized_company_name)->first()?->supplier;

        if ($duplicate) {
            throw ValidationException::withMessages([
                'application' => ["A supplier with the same normalized company name or email already exists ({$duplicate->supplier_code}). Resolve the official supplier record before approving."],
            ]);
        }
    }

    private function supplierCode(Supplier $supplier): string
    {
        $base = 'SUP-'.str_pad((string) $supplier->id, 3, '0', STR_PAD_LEFT);
        $candidate = $base;
        for ($suffix = 2; Supplier::query()->where('supplier_code', $candidate)->whereKeyNot($supplier->id)->exists(); $suffix++) {
            $candidate = $base.'-'.$suffix;
        }

        return $candidate;
    }
}
