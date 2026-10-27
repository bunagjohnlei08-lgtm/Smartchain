<?php

namespace App\Services;

use App\Models\Supplier;
use App\Models\SupplierAccreditationDocument;
use App\Models\SupplierAccreditationRequest;
use App\Models\SupplierApplication;
use App\Models\SupplierApplicationAttachment;

class SupplierAccreditationEligibility
{
    public function blockers(Supplier $supplier): array
    {
        $blockers=[];
        if($supplier->status!==Supplier::STATUS_ACTIVE)$blockers[]=['code'=>'ACCOUNT_INACTIVE','message'=>'The supplier account is not active.'];
        if($supplier->accreditation_status!=='ACTIVE')$blockers[]=['code'=>'ACCREDITATION_INACTIVE','message'=>'Supplier accreditation is not active.'];
        if(!$supplier->accreditation_expires_on)$blockers[]=['code'=>'ACCREDITATION_EXPIRY_MISSING','message'=>'The accreditation expiry has not been recorded by an administrator.'];
        elseif($supplier->accreditation_expires_on->lt(today()))$blockers[]=['code'=>'ACCREDITATION_EXPIRED','message'=>'Supplier accreditation has expired.'];
        $application=SupplierApplication::where('approved_supplier_id',$supplier->id)->where('status',SupplierApplication::STATUS_APPROVED)->first();
        if(!$application)$blockers[]=['code'=>'APPROVED_APPLICATION_MISSING','message'=>'An approved supplier application is required.'];
        else foreach([SupplierApplicationAttachment::TYPE_BUSINESS_CERTIFICATE,SupplierApplicationAttachment::TYPE_BUSINESS_PERMIT]as$type)if(!$this->hasCurrentVerifiedDocument($supplier,$application->id,$type))$blockers[]=['code'=>'DOCUMENT_VERIFICATION_REQUIRED','message'=>'A current verified '.str_replace('_',' ',strtolower($type)).' is required.'];
        return$blockers;
    }

    public function eligible(Supplier $supplier):bool{return$this->blockers($supplier)===[];}

    private function hasCurrentVerifiedDocument(Supplier $supplier,int $applicationId,string $type):bool
    {
        $renewal=SupplierAccreditationDocument::where('document_type',$type)->where('verification_status',SupplierAccreditationDocument::VERIFIED)->whereHas('request',fn($q)=>$q->where('supplier_id',$supplier->id)->where('status',SupplierAccreditationRequest::APPROVED))->latest('verified_at')->first();
        if($renewal)return!$renewal->expires_on?->lt(today());
        return SupplierApplicationAttachment::where('supplier_application_id',$applicationId)->where('is_current',true)->where('attachment_type',$type)->where('verification_status',SupplierApplicationAttachment::STATUS_VERIFIED)->get()->contains(fn($document)=>!$document->expires_on?->lt(today()));
    }
}
