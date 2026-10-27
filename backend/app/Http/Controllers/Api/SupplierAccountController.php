<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\{Supplier, SupplierApplication, SupplierApplicationAttachment};
use App\Services\SupplierAccreditationEligibility;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SupplierAccountController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $supplier = $request->user()->supplier;
        $blockers = app(SupplierAccreditationEligibility::class)->blockers($supplier);
        $application = SupplierApplication::where('approved_supplier_id',$supplier->id)->where('status',SupplierApplication::STATUS_APPROVED)->first();
        $documents = $application ? SupplierApplicationAttachment::where('supplier_application_id',$application->id)->where('is_current',true)->get() : collect();

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
                'required_documents' => collect([SupplierApplicationAttachment::TYPE_BUSINESS_CERTIFICATE, SupplierApplicationAttachment::TYPE_BUSINESS_PERMIT])->map(function ($type) use ($documents) {
                    $document=$documents->where('attachment_type',$type)->sortByDesc('id')->first();
                    return ['type'=>$type,'status'=>$document?->verification_status??'MISSING','expires_on'=>$document?->expires_on?->toDateString(),'is_current'=>(bool)$document?->is_current];
                }),
            ],
        ]])->header('Cache-Control', 'private, no-store');
    }

    private function accreditationBlockers(Supplier $supplier): array
    {
        $blockers = [];
        if ($supplier->status !== Supplier::STATUS_ACTIVE) $blockers[] = ['code'=>'ACCOUNT_INACTIVE','message'=>'The supplier account is not active.'];
        if ($supplier->accreditation_status !== 'ACTIVE') $blockers[] = ['code'=>'ACCREDITATION_INACTIVE','message'=>'Supplier accreditation is not active.'];
        if (! $supplier->accreditation_expires_on) $blockers[] = ['code'=>'ACCREDITATION_EXPIRY_MISSING','message'=>'The accreditation expiry has not been recorded by an administrator.'];
        elseif ($supplier->accreditation_expires_on->lt(today())) $blockers[] = ['code'=>'ACCREDITATION_EXPIRED','message'=>'Supplier accreditation has expired.'];
        $application = SupplierApplication::where('approved_supplier_id',$supplier->id)->where('status',SupplierApplication::STATUS_APPROVED)->first();
        if (! $application) $blockers[] = ['code'=>'APPROVED_APPLICATION_MISSING','message'=>'An approved supplier application is required.'];
        else {
            $documents = SupplierApplicationAttachment::where('supplier_application_id',$application->id)->where('is_current',true)->get();
            foreach ([SupplierApplicationAttachment::TYPE_BUSINESS_CERTIFICATE, SupplierApplicationAttachment::TYPE_BUSINESS_PERMIT] as $type) {
                if (! $documents->where('attachment_type',$type)->contains(fn ($document) => $document->verification_status===SupplierApplicationAttachment::STATUS_VERIFIED && ! $document->expires_on?->lt(today()))) $blockers[]=['code'=>'DOCUMENT_VERIFICATION_REQUIRED','message'=>'A current verified '.str_replace('_',' ',strtolower($type)).' is required.'];
            }
        }
        return $blockers;
    }
}
