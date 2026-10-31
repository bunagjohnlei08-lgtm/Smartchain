<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use App\Models\SupplierAlias;
use App\Models\SupplierApplication;
use App\Models\SupplierApplicationAttachment;
use App\Models\SupplierApplicationEvent;
use App\Models\Role;
use App\Models\Product;
use App\Models\User;
use App\Support\AuditLogger;
use App\Support\SupplierName;
use App\Support\SupplierPortalNotifications;
use App\Support\UserInvitations;
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
        $validated = $request->validate([
            'supply_categories' => ['sometimes', 'array', 'min:1', 'max:20'],
            'supply_categories.*' => ['required', 'string', 'max:150', 'distinct'],
        ]);
        $approvedCategories = collect($validated['supply_categories'] ?? [])->map(fn ($category) => trim($category))->filter()->values();
        $catalogCategories = Product::query()->whereIn('category', $approvedCategories)->pluck('category')->unique()->values();
        if ($approvedCategories->isNotEmpty() && $catalogCategories->count() !== $approvedCategories->unique()->count()) {
            throw ValidationException::withMessages(['supply_categories' => ['Select only categories from the current Product Catalog.']]);
        }

        $result = DB::transaction(function () use ($request, $supplierApplication, $catalogCategories) {
            $application = SupplierApplication::query()->lockForUpdate()->findOrFail($supplierApplication->id);

            if ($application->status === SupplierApplication::STATUS_APPROVED && $application->approved_supplier_id) {
                return [$application->fresh(['reviewedBy:id,name', 'approvedSupplier:id,supplier_code,name', 'attachments']), false];
            }

            // Historical applications retain their recorded category assignment.
            // New applications submit an empty value and require an Admin catalog selection.
            $effectiveCategories = $catalogCategories->isNotEmpty()
                ? $catalogCategories
                : collect(explode(',', (string) $application->supply_category))->map(fn ($category) => trim($category))->filter()->values();
            if ($effectiveCategories->isEmpty()) {
                throw ValidationException::withMessages(['supply_categories' => ['Assign at least one Product Catalog category before approval.']]);
            }
            $approvedCategoryList = $effectiveCategories->sort()->join(', ');

            abort_if($application->status === SupplierApplication::STATUS_REJECTED, 422, 'A rejected application cannot be approved.');
            abort_if($application->status === SupplierApplication::STATUS_APPROVED, 409, 'The approved application no longer has its linked supplier. Resolve the official record before retrying.');
            abort_unless($application->status === SupplierApplication::STATUS_MEETING_COMPLETED, 422, 'Final supplier approval requires a completed meeting.');
            $eligibility = $this->approvalEligibility($application);
            if (! $eligibility['eligible']) {
                throw ValidationException::withMessages([
                    'application' => [$eligibility['message']],
                ]);
            }

            // Different applications have different row locks. This stable
            // transaction-scoped PostgreSQL lock serializes the duplicate check
            // and official Supplier insert without retaining an application lock.
            DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['smartchain_supplier_approval']);
            $this->guardAgainstDuplicateSupplier($application);

            $accreditationExpiresOn = $application->attachments()->where('is_current', true)
                ->where('verification_status', SupplierApplicationAttachment::STATUS_VERIFIED)
                ->whereIn('attachment_type', [SupplierApplicationAttachment::TYPE_BUSINESS_CERTIFICATE, SupplierApplicationAttachment::TYPE_BUSINESS_PERMIT])
                ->whereNotNull('expires_on')->min('expires_on');
            abort_unless($accreditationExpiresOn, 422, 'Verified required documents must have validity dates before supplier approval.');

            $supplier = new Supplier([
                'name' => $application->company_name,
                'contact_person' => $application->contact_person,
                'email' => $application->email,
                'phone' => $application->phone,
                'address' => $application->address,
                'business_type' => $application->business_type,
                'supply_category' => $approvedCategoryList,
                'products_services' => $application->products_services,
                'status' => 'ACTIVE',
                'accreditation_status' => 'ACTIVE',
                'accredited_at' => now(),
                'accreditation_expires_on' => $accreditationExpiresOn,
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
                'supply_category' => $approvedCategoryList,
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
                'metadata' => ['supplier_id' => $supplier->id, 'approved_categories' => $effectiveCategories->all()],
            ]);

            $supplierRole = Role::query()->where('slug', 'SUPPLIER')->lockForUpdate()->firstOrFail();
            $supplierUser = User::query()->where('email', $application->normalized_email)->lockForUpdate()->first();
            abort_if($supplierUser && $supplierUser->supplier_id && $supplierUser->supplier_id !== $supplier->id, 409, 'The authorized contact email is already linked to another supplier account.');
            abort_if($supplierUser && ! $supplierUser->isSupplier(), 409, 'The authorized contact email belongs to an internal user account. Resolve the account before approval.');
            $supplierUser ??= new User();
            $supplierUser->forceFill([
                'name' => $application->contact_person,
                'email' => $application->normalized_email,
                'password' => Str::random(64),
                'role_id' => $supplierRole->id,
                'supplier_id' => $supplier->id,
                'status' => 'PENDING',
                'employee_id' => null,
            ])->save();
            $interestRows = $application->biddingInterests()->pluck('rfq_lines.id')->map(fn ($lineId) => ['supplier_id'=>$supplier->id,'rfq_line_id'=>$lineId,'selected_by_user_id'=>$supplierUser->id,'created_at'=>now(),'updated_at'=>now()])->all();
            if ($interestRows !== []) DB::table('supplier_bidding_interests')->insertOrIgnore($interestRows);
            [$invitation, $token] = UserInvitations::issue($supplierUser, $request->user());

            return [$application->fresh(['reviewedBy:id,name', 'approvedSupplier:id,supplier_code,name', 'attachments']), true, $supplierUser, $invitation, $token];
        });

        $invitationAccepted = null;
        if ($result[1]) {
            SupplierPortalNotifications::sendStatus(
                $result[0],
                'Supplier Application Approved',
                'Application approved',
                'Your supplier application completed the evaluation process and was approved. Your company is now registered as an official supplier.',
            );
            $invitationAccepted = UserInvitations::send($result[2], $result[3], $result[4]);
            AuditLogger::log('SUPPLIER_ACCOUNT_INVITATION_SENT', AuditLogger::MODULE_SUPPLIERS, [
                'status' => $invitationAccepted ? 'SUCCESS' : 'FAILURE',
                'actor' => $request->user(), 'resource' => $result[2], 'resource_label' => $result[2]->email,
                'details' => $invitationAccepted ? 'Supplier activation invitation accepted by mail transport.' : 'Supplier activation invitation could not be sent.',
                'metadata' => ['supplier_id' => $result[2]->supplier_id],
            ]);
        }

        return response()->json([
            'message' => $result[1]
                ? ($invitationAccepted ? 'Application approved; the activation invitation was accepted by the mail service.' : 'Application approved, but the activation invitation could not be sent. Use Resend Invitation.')
                : 'Application was already approved; no duplicate supplier was created.',
            'account_invitation_status' => $result[1] ? ($invitationAccepted ? 'INVITATION_PENDING' : 'DELIVERY_FAILED') : null,
            'data' => $this->applicationData($result[0]),
        ]);
    }

    public function verifyAttachment(Request $request, SupplierApplication $supplierApplication, SupplierApplicationAttachment $attachment): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        abort_unless($attachment->supplier_application_id === $supplierApplication->id && $attachment->is_current, 404);
        $validated = $request->validate([
            'verification_status' => ['required', Rule::in(SupplierApplicationAttachment::VERIFICATION_STATUSES)],
            'valid_from' => ['nullable', 'date'],
            'expires_on' => ['nullable', 'date', 'after_or_equal:valid_from'],
            'reason' => ['nullable', 'string', 'max:2000', Rule::requiredIf(fn () => in_array($request->input('verification_status'), [SupplierApplicationAttachment::STATUS_CORRECTION_REQUIRED, SupplierApplicationAttachment::STATUS_REJECTED], true))],
            'document_updated_at' => ['nullable', 'date'],
            'document_verification_status' => ['nullable', Rule::in(SupplierApplicationAttachment::VERIFICATION_STATUSES)],
        ]);
        [$application, $reviewedAttachment, $status] = DB::transaction(function () use ($request, $supplierApplication, $attachment, $validated) {
            $application = SupplierApplication::query()->lockForUpdate()->findOrFail($supplierApplication->id);
            abort_if(in_array($application->status, [SupplierApplication::STATUS_APPROVED, SupplierApplication::STATUS_REJECTED], true), 409, 'Finalized applications are read-only. Use an authorized amendment process for later corrections.');
            $reviewedAttachment = SupplierApplicationAttachment::query()->lockForUpdate()->findOrFail($attachment->id);
            abort_unless($reviewedAttachment->supplier_application_id === $application->id && $reviewedAttachment->is_current, 404);
            if ((isset($validated['document_updated_at']) && ! $reviewedAttachment->updated_at->equalTo($validated['document_updated_at']))
                || (isset($validated['document_verification_status']) && $reviewedAttachment->verification_status !== $validated['document_verification_status'])) {
                abort(409, 'This document review changed in another session. Refresh the application before saving.');
            }
            $status = $validated['verification_status'];
            if (($validated['expires_on'] ?? null) && now()->startOfDay()->gt($validated['expires_on'])) {
                $status = SupplierApplicationAttachment::STATUS_EXPIRED;
            }
            $reviewedAttachment->update([
                'verification_status' => $status,
                'verified_by_id' => $request->user()->id,
                'verified_at' => now(),
                'valid_from' => $validated['valid_from'] ?? null,
                'expires_on' => $validated['expires_on'] ?? null,
                'verification_reason' => $validated['reason'] ?? null,
            ]);

            return [$application, $reviewedAttachment->fresh(), $status];
        });
        AuditLogger::success('SUPPLIER_DOCUMENT_REVIEWED', AuditLogger::MODULE_SUPPLIERS, [
            'actor' => $request->user(), 'resource' => $reviewedAttachment, 'resource_label' => $reviewedAttachment->original_name,
            'details' => "Supplier document marked {$status}.", 'metadata' => ['application_id' => $application->id],
        ]);
        return response()->json(['data' => $this->applicationData($application->fresh())]);
    }

    public function resendAccountInvitation(Request $request, SupplierApplication $supplierApplication): JsonResponse
    {
        abort_unless($request->user()->isAdmin(), 403);
        [$user, $invitation, $token] = DB::transaction(function () use ($request, $supplierApplication) {
            $application = SupplierApplication::query()->lockForUpdate()->findOrFail($supplierApplication->id);
            abort_unless($application->status === SupplierApplication::STATUS_APPROVED && $application->approved_supplier_id, 422, 'Only an approved supplier can receive an account invitation.');
            $user = User::query()->where('supplier_id', $application->approved_supplier_id)->lockForUpdate()->firstOrFail();
            abort_unless($user->status === 'PENDING', 422, 'This supplier account is already active or disabled.');
            [$invitation, $token] = UserInvitations::issue($user, $request->user());
            return [$user, $invitation, $token];
        });
        $accepted = UserInvitations::send($user, $invitation, $token);
        return response()->json([
            'message' => $accepted ? 'A new activation invitation was accepted by the mail service.' : 'The activation invitation could not be sent. Please try again.',
            'account_invitation_status' => $accepted ? 'INVITATION_PENDING' : 'DELIVERY_FAILED',
        ], $accepted ? 200 : 502);
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
            'verification_status' => $attachment->verification_status,
            'verified_at' => $attachment->verified_at,
            'valid_from' => $attachment->valid_from?->toDateString(),
            'expires_on' => $attachment->expires_on?->toDateString(),
            'verification_reason' => $attachment->verification_reason,
            'updated_at' => $attachment->updated_at,
        ])->values()->all();
        $data['attachment_history'] = $application->attachments->sortByDesc('created_at')->map(fn (SupplierApplicationAttachment $attachment) => [
            'id' => $attachment->id,
            'attachment_type' => $attachment->attachment_type,
            'original_name' => $attachment->original_name,
            'verification_status' => $attachment->verification_status,
            'is_current' => $attachment->is_current,
            'replaces_attachment_id' => $attachment->replaces_attachment_id,
            'verified_at' => $attachment->verified_at,
            'expires_on' => $attachment->expires_on?->toDateString(),
            'verification_reason' => $attachment->verification_reason,
            'created_at' => $attachment->created_at,
        ])->values()->all();
        $data['approval_eligibility'] = $this->approvalEligibility($application);
        $data['category_options'] = Product::query()->whereNotNull('category')->where('category', '!=', '')
            ->distinct()->orderBy('category')->pluck('category')->values()->all();

        return $data;
    }

    /**
     * Return the server-authoritative approval blockers without changing state.
     * A document remains valid throughout its expires_on calendar date.
     *
     * @return array{eligible: bool, message: string, documents: array<int, array{type: string, label: string, status: string}>}
     */
    private function approvalEligibility(SupplierApplication $application): array
    {
        $documents = $application->relationLoaded('attachments')
            ? $application->attachments->where('is_current', true)
            : $application->attachments()->where('is_current', true)->get();
        $requirements = [
            SupplierApplicationAttachment::TYPE_BUSINESS_CERTIFICATE => 'Business Registration Document',
            SupplierApplicationAttachment::TYPE_BUSINESS_PERMIT => 'Business Permit',
        ];
        $results = [];

        foreach ($requirements as $type => $label) {
            $candidates = $documents->where('attachment_type', $type);
            $verified = $candidates->first(fn (SupplierApplicationAttachment $document) =>
                $document->verification_status === SupplierApplicationAttachment::STATUS_VERIFIED
                && (! $document->expires_on || ! $document->expires_on->lt(today()))
            );
            if ($verified) {
                $status = SupplierApplicationAttachment::STATUS_VERIFIED;
            } elseif ($candidates->isEmpty()) {
                $status = 'MISSING';
            } else {
                $document = $candidates->sortByDesc('created_at')->first();
                $status = $document->expires_on && $document->expires_on->lt(today())
                    ? SupplierApplicationAttachment::STATUS_EXPIRED
                    : $document->verification_status;
            }
            $results[] = ['type' => $type, 'label' => $label, 'status' => $status];
        }

        $blocked = collect($results)->where('status', '!=', SupplierApplicationAttachment::STATUS_VERIFIED)->values();
        $eligible = $application->status === SupplierApplication::STATUS_MEETING_COMPLETED && $blocked->isEmpty();
        $message = $blocked->isNotEmpty()
            ? 'Approval unavailable: '.$blocked->map(fn (array $document) => "{$document['label']} is ".strtolower(str_replace('_', ' ', $document['status'])))->join('; ').'.'
            : ($application->status === SupplierApplication::STATUS_MEETING_COMPLETED
                ? 'All required business documents are verified and valid.'
                : 'Final supplier approval requires a completed meeting.');

        return ['eligible' => $eligible, 'message' => $message, 'documents' => $results];
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
