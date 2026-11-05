<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;

use App\Services\SupplierAccreditationEligibility;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SupplierAccountController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $supplier = $request->user()->supplier;
        $eligibility = app(SupplierAccreditationEligibility::class);
        $blockers = $eligibility->blockers($supplier);

        return response()->json(['data' => [
            'account_status' => $request->user()->status,
            'supplier' => [
                'id' => $supplier->id,
                'supplier_code' => $supplier->supplier_code,
                'name' => $supplier->name,
                'contact_person' => $supplier->contact_person,
                'email' => $supplier->email,
                'status' => $supplier->status,
                'accreditation_status' => $supplier->accreditation_status,
                'accredited_at' => $supplier->accredited_at?->toIso8601String(),
                'accreditation_expires_on' => $supplier->accreditation_expires_on?->toDateString(),
                'approved_categories' => collect(explode(',', (string) $supplier->supply_category))->map(fn ($value) => trim($value))->filter()->values(),
                'bidding_eligibility' => ['eligible' => $blockers === [], 'blockers' => $blockers],
                'required_documents' => $eligibility->requiredDocuments($supplier),
            ],
        ]])->header('Cache-Control', 'private, no-store');
    }

}
