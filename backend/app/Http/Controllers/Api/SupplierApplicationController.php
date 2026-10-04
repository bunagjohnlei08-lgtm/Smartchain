<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use App\Models\SupplierApplication;
use App\Support\AuditLogger;
use App\Support\SupplierName;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

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
            'address' => trim((string) $request->input('address')),
            'contact_person' => trim((string) $request->input('contact_person')),
            'email' => mb_strtolower(trim((string) $request->input('email'))),
            'phone' => trim((string) $request->input('phone')),
            'business_type' => trim((string) $request->input('business_type')),
            'supply_category' => trim((string) $request->input('supply_category')),
            'products_services' => trim((string) $request->input('products_services')),
        ]);

        $validated = $request->validate([
            'company_name' => ['required', 'string', 'min:2', 'max:255'],
            'address' => ['required', 'string', 'min:5', 'max:2000'],
            'contact_person' => ['required', 'string', 'min:2', 'max:255'],
            'email' => ['required', 'email:rfc', 'max:255'],
            'phone' => ['required', 'string', 'regex:/^[0-9+() .-]+$/', 'max:30'],
            'business_type' => ['required', 'string', 'min:2', 'max:100'],
            'supply_category' => ['required', 'string', 'min:2', 'max:150'],
            'products_services' => ['required', 'string', 'min:10', 'max:5000'],
        ]);

        $companyName = $validated['company_name'];
        $email = $validated['email'];

        try {
            $application = DB::transaction(function () use ($validated, $companyName, $email) {
                $this->lockSupplierIdentityChecks();
                $this->ensureApplicantMaySubmit($email);

                return SupplierApplication::create([
                    ...$validated,
                    'application_number' => 'SUP-APP-'.now()->format('Y').'-'.Str::upper(Str::substr(Str::replace('-', '', (string) Str::uuid()), 0, 10)),
                    'company_name' => $companyName,
                    'normalized_company_name' => SupplierName::normalize($companyName),
                    'email' => $email,
                    'normalized_email' => $email,
                    'contact_person' => trim($validated['contact_person']),
                    'phone' => trim($validated['phone']),
                    'business_type' => trim($validated['business_type']),
                    'supply_category' => trim($validated['supply_category']),
                    'address' => trim($validated['address']),
                    'products_services' => trim($validated['products_services']),
                    'status' => SupplierApplication::STATUS_PENDING,
                    'submitted_at' => now(),
                ]);
            });
        } catch (QueryException $exception) {
            // The partial unique index is the final guard for simultaneous
            // requests that both passed an application-level pre-check.
            if ($this->hasActiveApplication($email)) {
                $this->throwAlreadyProcessingValidation();
            }

            throw $exception;
        }

        AuditLogger::success('SUPPLIER_APPLICATION_SUBMITTED', AuditLogger::MODULE_SUPPLIERS, [
            'resource' => $application,
            'resource_label' => $application->application_number,
            'details' => 'A public supplier application was submitted for Admin review.',
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

    private function lockSupplierIdentityChecks(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['smartchain_supplier_approval']);
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
