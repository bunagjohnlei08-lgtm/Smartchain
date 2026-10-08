<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use App\Models\SupplierApplication;
use App\Models\SupplierApplicationAttachment;
use App\Models\SupplierApplicationEvent;
use App\Models\User;
use App\Notifications\WorkflowNotification;
use App\Support\AuditLogger;
use App\Support\SupplierApplicationOfferings;
use App\Support\SupplierName;
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

class SupplierApplicationController extends Controller
{
    private const ALREADY_PROCESSING_MESSAGE = 'An application with these details is already being processed. Please contact the company if you need assistance.';

    public function store(Request $request): JsonResponse
    {
        if (filled($request->input('website'))) {
            return response()->json([
                'message' => 'We could not submit your application. Please review the form and try again.',
            ], 422);
        }

        $request->merge([
            'company_name' => SupplierName::display((string) $request->input('company_name')),
            'owner_name' => trim((string) $request->input('owner_name')),
            'address' => trim((string) $request->input('address')),
            'contact_person' => trim((string) $request->input('contact_person')),
            'email' => mb_strtolower(trim((string) $request->input('email'))),
            'phone' => trim((string) $request->input('phone')),
            'business_type' => trim((string) $request->input('business_type')),
            'supply_category' => trim((string) $request->input('supply_category')),
            'products_services' => trim((string) $request->input('products_services')),
            'offerings' => SupplierApplicationOfferings::trimInput($request->input('offerings')),
        ]);

        $validated = $request->validate([
            'company_name' => ['required', 'string', 'min:2', 'max:255'],
            'owner_name' => ['required', 'string', 'min:2', 'max:255'],
            'address' => ['required', 'string', 'min:5', 'max:2000'],
            'contact_person' => ['required', 'string', 'min:2', 'max:255'],
            'email' => ['required', 'email:rfc', 'max:255'],
            'phone' => ['required', 'string', 'regex:/^[0-9]+$/', 'max:30'],
            'business_type' => ['required', 'string', 'min:2', 'max:100'],
            'supply_category' => ['required', 'string', 'min:2', 'max:150'],
            'products_services' => ['nullable', 'string', 'max:5000'],
            ...SupplierApplicationOfferings::rules(),
            'business_certificate' => ['required', 'array', 'min:1', 'max:2'],
            'business_certificate.*' => [
                'required', 'file', 'mimes:pdf,jpg,jpeg,png',
                'mimetypes:application/pdf,image/jpeg,image/png',
                'extensions:pdf,jpg,jpeg,png', 'max:5120',
            ],
            'business_permit' => ['required', 'array', 'min:1', 'max:2'],
            'business_permit.*' => [
                'required', 'file', 'mimes:pdf,jpg,jpeg,png',
                'mimetypes:application/pdf,image/jpeg,image/png',
                'extensions:pdf,jpg,jpeg,png', 'max:5120',
            ],
            'product_service_image' => ['required', 'array', 'min:1', 'max:5'],
            'product_service_image.*' => [
                'required', 'file', 'image', 'mimes:jpg,jpeg,png',
                'mimetypes:image/jpeg,image/png', 'extensions:jpg,jpeg,png', 'max:5120',
            ],
        ], [
            ...SupplierApplicationOfferings::messages(),
            'owner_name.required' => 'Owner name is required.',
            'phone.regex' => 'Phone number must contain numbers only.',
            'business_certificate.required' => 'At least one Business Certificate is required.',
            'business_certificate.array' => 'The Business Certificate files must be uploaded as a collection.',
            'business_certificate.min' => 'At least one Business Certificate is required.',
            'business_certificate.max' => 'You may upload a maximum of 2 Business Certificate files.',
            'business_certificate.*.mimes' => 'Each Business Certificate must be a PDF, JPG, or PNG file.',
            'business_certificate.*.mimetypes' => 'Each Business Certificate must be a PDF, JPG, or PNG file.',
            'business_certificate.*.extensions' => 'Each Business Certificate must be a PDF, JPG, or PNG file.',
            'business_certificate.*.max' => 'Each Business Certificate must not exceed 5 MB.',
            'business_permit.required' => 'At least one Business Permit is required.',
            'business_permit.array' => 'The Business Permit files must be uploaded as a collection.',
            'business_permit.min' => 'At least one Business Permit is required.',
            'business_permit.max' => 'You may upload a maximum of 2 Business Permit files.',
            'business_permit.*.mimes' => 'Each Business Permit must be a PDF, JPG, or PNG file.',
            'business_permit.*.mimetypes' => 'Each Business Permit must be a PDF, JPG, or PNG file.',
            'business_permit.*.extensions' => 'Each Business Permit must be a PDF, JPG, or PNG file.',
            'business_permit.*.max' => 'Each Business Permit must not exceed 5 MB.',
            'product_service_image.required' => 'At least one Product / Service Image is required.',
            'product_service_image.array' => 'The Product / Service Images must be uploaded as a collection.',
            'product_service_image.min' => 'At least one Product / Service Image is required.',
            'product_service_image.max' => 'You may upload a maximum of 5 Product / Service Images.',
            'product_service_image.*.image' => 'Each Product / Service Image must be a JPG or PNG image.',
            'product_service_image.*.mimes' => 'Each Product / Service Image must be a JPG or PNG image.',
            'product_service_image.*.mimetypes' => 'Each Product / Service Image must be a JPG or PNG image.',
            'product_service_image.*.extensions' => 'Each Product / Service Image must be a JPG or PNG image.',
            'product_service_image.*.max' => 'Each Product / Service Image must not exceed 5 MB.',
        ]);

        $companyName = $validated['company_name'];
        $email = $validated['email'];
        $offerings = SupplierApplicationOfferings::normalize($validated['offerings']);
        $attachmentHashes = $this->validateUniqueAttachmentContents($request);

        $storedPaths = [];

        try {
            $application = DB::transaction(function () use ($validated, $companyName, $email, $offerings, $request, $attachmentHashes, &$storedPaths) {
                $this->lockSupplierIdentityChecks();
                $this->ensureApplicantMaySubmit($email);

                $application = SupplierApplication::create([
                    'application_number' => 'SUP-APP-'.now()->format('Y').'-'.Str::upper(Str::substr(Str::replace('-', '', (string) Str::uuid()), 0, 10)),
                    'company_name' => $companyName,
                    'owner_name' => trim($validated['owner_name']),
                    'normalized_company_name' => SupplierName::normalize($companyName),
                    'email' => $email,
                    'normalized_email' => $email,
                    'contact_person' => trim($validated['contact_person']),
                    'phone' => trim($validated['phone']),
                    'business_type' => trim($validated['business_type']),
                    'supply_category' => trim($validated['supply_category']),
                    'address' => trim($validated['address']),
                    'products_services' => filled($validated['products_services'] ?? null) ? trim($validated['products_services']) : null,
                    'status' => SupplierApplication::STATUS_PENDING,
                    'submitted_at' => now(),
                ]);

                $application->offerings()->createMany($offerings);
                $this->storeAttachments($application, $request, $attachmentHashes, $storedPaths);
                $application->events()->create([
                    'event_type' => SupplierApplicationEvent::SUBMITTED,
                    'title' => 'Application Submitted',
                    'description' => 'Your supplier application was received for review.',
                    'occurred_at' => now(),
                ]);

                return $application;
            });
        } catch (Throwable $exception) {
            $this->cleanupFiles($storedPaths);

            // The partial unique index is the final guard for simultaneous
            // requests that both passed an application-level pre-check.
            if ($exception instanceof QueryException && $this->hasActiveApplication($email)) {
                $this->throwAlreadyProcessingValidation();
            }

            throw $exception;
        }

        AuditLogger::success('SUPPLIER_APPLICATION_SUBMITTED', AuditLogger::MODULE_SUPPLIERS, [
            'resource' => $application,
            'resource_label' => $application->application_number,
            'details' => 'A public supplier application was submitted for Admin review.',
            'metadata' => ['attachment_count' => count($storedPaths)],
        ]);

        $this->notifyAdmins($application);
        SupplierPortalNotifications::sendStatus(
            $application,
            'Supplier Application Received',
            'Application received',
            'Your supplier application was received and is pending Admin review. Use the secure link below to track its status.',
        );

        AuditLogger::success('SUPPLIER_PORTAL_ACCESS_CREATED', AuditLogger::MODULE_SUPPLIERS, [
            'resource' => $application,
            'resource_label' => $application->application_number,
            'details' => 'Temporary supplier portal access was created. No access token was recorded in the audit log.',
        ]);

        return response()->json([
            'message' => 'Application submitted successfully. Keep your reference number for your records.',
            'data' => [
                'application_number' => $application->application_number,
                'status' => $application->status,
                'submitted_at' => $application->submitted_at,
            ],
        ], 201);
    }

    private function notifyAdmins(SupplierApplication $application): void
    {
        $admins = User::query()
            ->where('status', 'ACTIVE')
            ->whereHas('role', fn ($query) => $query->where('slug', 'ADMIN'))
            ->get();

        WorkflowNotificationSender::send($admins, new WorkflowNotification(
            'New Supplier Application',
            "{$application->company_name} submitted a new supplier application for review.",
            'info',
            $application->application_number,
            'Supplier Applications',
            [
                'supplier_application_id' => $application->id,
                'application_reference' => $application->application_number,
                'company_name' => $application->company_name,
                'application_status' => $application->status,
                'created_at' => $application->created_at?->toISOString(),
            ],
        ));
    }

    private function lockSupplierIdentityChecks(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['smartchain_supplier_approval']);
        }
    }

    private function validateUniqueAttachmentContents(Request $request): array
    {
        $hashes = [];
        $seenHashes = [];

        foreach (['business_certificate', 'business_permit', 'product_service_image'] as $field) {
            foreach ($request->file($field, []) as $index => $upload) {
                $temporaryPath = $upload->getRealPath();
                $hash = is_string($temporaryPath) ? hash_file('sha256', $temporaryPath) : false;

                if (! is_string($hash)) {
                    throw ValidationException::withMessages([
                        $field => ['One of the uploaded files could not be read. Please select it again.'],
                    ]);
                }

                if (isset($seenHashes[$hash])) {
                    throw ValidationException::withMessages([
                        $field => ['The same file cannot be submitted more than once.'],
                    ]);
                }

                $seenHashes[$hash] = true;
                $hashes[$field][$index] = $hash;
            }
        }

        return $hashes;
    }

    private function storeAttachments(SupplierApplication $application, Request $request, array $attachmentHashes, array &$storedPaths): void
    {
        $attachmentTypes = [
            'business_certificate' => SupplierApplicationAttachment::TYPE_BUSINESS_CERTIFICATE,
            'business_permit' => SupplierApplicationAttachment::TYPE_BUSINESS_PERMIT,
            'product_service_image' => SupplierApplicationAttachment::TYPE_PRODUCT_SERVICE_IMAGE,
        ];

        foreach ($attachmentTypes as $field => $type) {
            foreach ($request->file($field, []) as $index => $upload) {
                $storedPath = Storage::disk('local')->putFile("supplier-applications/{$application->id}", $upload);
                if (! $storedPath) {
                    throw new \RuntimeException('Supplier application attachment storage failed.');
                }

                $storedPaths[] = $storedPath;
                $application->attachments()->create([
                    'attachment_type' => $type,
                    'original_name' => Str::limit(basename($upload->getClientOriginalName()), 255, ''),
                    'stored_path' => $storedPath,
                    'mime_type' => (string) $upload->getMimeType(),
                    'file_size' => $upload->getSize(),
                    'file_sha256' => $attachmentHashes[$field][$index],
                ]);
            }
        }
    }

    private function cleanupFiles(array $paths): void
    {
        foreach ($paths as $path) {
            if (! preg_match('~^supplier-applications/\d+/[A-Za-z0-9]+\.(?:jpe?g|png|pdf)$~', $path)) {
                continue;
            }

            try {
                if (! Storage::disk('local')->delete($path)) {
                    report(new \RuntimeException('Supplier application attachment cleanup failed.'));
                }
            } catch (Throwable $exception) {
                report($exception);
            }
        }
    }

    private function ensureApplicantMaySubmit(string $normalizedEmail): void
    {
        $officialSupplierExists = Supplier::query()
            ->whereNotNull('email')
            ->whereRaw('LOWER(TRIM(email)) = ?', [$normalizedEmail])
            ->exists();

        if ($officialSupplierExists || $this->hasActiveApplication($normalizedEmail)) {
            $this->throwAlreadyProcessingValidation();
        }
    }

    private function hasActiveApplication(string $normalizedEmail): bool
    {
        return SupplierApplication::query()
            ->where('normalized_email', $normalizedEmail)
            ->whereIn('status', SupplierApplication::ACTIVE_STATUSES)
            ->exists();
    }

    private function throwAlreadyProcessingValidation(): never
    {
        throw ValidationException::withMessages([
            'email' => [self::ALREADY_PROCESSING_MESSAGE],
        ]);
    }
}
