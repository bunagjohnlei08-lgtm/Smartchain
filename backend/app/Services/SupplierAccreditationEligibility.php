<?php

namespace App\Services;

use App\Models\Supplier;
use App\Models\SupplierAccreditationDocument;
use App\Models\SupplierAccreditationRequest;
use App\Models\SupplierApplication;
use App\Models\SupplierApplicationAttachment;
use Illuminate\Support\Collection;

class SupplierAccreditationEligibility
{
    private const DOCUMENT_TYPES = [SupplierApplicationAttachment::TYPE_BUSINESS_CERTIFICATE, SupplierApplicationAttachment::TYPE_BUSINESS_PERMIT];

    public function blockers(Supplier $supplier): array
    {
        $blockers = [];
        if ($supplier->status !== Supplier::STATUS_ACTIVE) $blockers[] = ['code'=>'ACCOUNT_INACTIVE','message'=>'The supplier account is not active.'];
        if ($supplier->accreditation_status !== 'ACTIVE') $blockers[] = ['code'=>'ACCREDITATION_INACTIVE','message'=>'Supplier accreditation is not active.'];
        if (!$supplier->accreditation_expires_on) $blockers[] = ['code'=>'ACCREDITATION_EXPIRY_MISSING','message'=>'The accreditation expiry has not been recorded by an administrator.'];
        elseif ($supplier->accreditation_expires_on->lt(today())) $blockers[] = ['code'=>'ACCREDITATION_EXPIRED','message'=>'Supplier accreditation has expired.'];
        if (collect(explode(',', (string)$supplier->supply_category))->map(fn ($value)=>trim($value))->filter()->isEmpty()) {
            $blockers[] = ['code'=>'APPROVED_CATEGORY_REQUIRED','message'=>'At least one Admin-approved supply category is required.'];
        }
        $application = $supplier->approvedApplication()->first();
        $legacy = $this->isLegacy($supplier);
        if (!$application) {
            if (!$legacy) $blockers[] = ['code'=>'APPROVED_APPLICATION_MISSING','message'=>'An approved supplier application is required.'];
            elseif (!$this->approvedLegacyRequests($supplier)->exists()) $blockers[] = ['code'=>'ACCREDITATION_EVIDENCE_REQUIRED','message'=>'Admin-approved accreditation completion or renewal is required. Submit your mandatory documents for review.'];
        }
        foreach ($this->effectiveDocuments($supplier) as $type=>$document) {
            if (!$this->documentIsCurrent($document, $legacy)) {
                $blockers[] = ['code'=>'DOCUMENT_VERIFICATION_REQUIRED','message'=>'A current verified '.str_replace('_',' ',strtolower($type)).' is required.'];
            }
        }
        return $blockers;
    }

    /** Final award/conversion checks run inside their existing transaction. */
    public function blockersForUpdate(Supplier $supplier): array
    {
        $applications = SupplierApplication::where('approved_supplier_id', $supplier->id)->lockForUpdate()->pluck('id');
        SupplierApplicationAttachment::whereIn('supplier_application_id', $applications)->where('is_current', true)->lockForUpdate()->get();
        $requests = SupplierAccreditationRequest::where('supplier_id', $supplier->id)->lockForUpdate()->pluck('id');
        SupplierAccreditationDocument::whereIn('supplier_accreditation_request_id', $requests)->lockForUpdate()->get();
        return $this->blockers($supplier);
    }

    public function eligible(Supplier $supplier): bool { return $this->blockers($supplier) === []; }

    /** A linked public application must complete its own approval workflow. */
    public function isLegacy(Supplier $supplier): bool
    {
        return !SupplierApplication::where('approved_supplier_id', $supplier->id)->exists();
    }

    private function approvedLegacyRequests(Supplier $supplier)
    {
        return SupplierAccreditationRequest::where('supplier_id', $supplier->id)
            ->where('status', SupplierAccreditationRequest::APPROVED)
            ->whereIn('request_type', [SupplierAccreditationRequest::COMPLETION, SupplierAccreditationRequest::RENEWAL])
            ->whereNotNull('reviewed_by_id')->whereNotNull('reviewed_at');
    }

    /** The same effective evidence is used by bidding, profile display and Admin renewals. */
    public function effectiveDocuments(Supplier $supplier): Collection
    {
        $application = $supplier->approvedApplication()->first();
        $legacy = $this->isLegacy($supplier);
        return collect(self::DOCUMENT_TYPES)->mapWithKeys(function ($type) use ($supplier, $application, $legacy) {
            if (!$legacy && !$application) return [$type=>null];
            $query = SupplierAccreditationDocument::where('document_type', $type)
                ->where('verification_status', SupplierAccreditationDocument::VERIFIED);
            if ($legacy) {
                $query->whereIn('supplier_accreditation_request_id', $this->approvedLegacyRequests($supplier)->select('id'))
                    ->whereNotNull('verified_by_id')->whereNotNull('verified_at')->whereNotNull('expires_on');
            } else {
                $query->whereHas('request', fn ($row)=>$row->where('supplier_id', $supplier->id)->where('status', SupplierAccreditationRequest::APPROVED));
            }
            $document = $query->orderByDesc('verified_at')->orderByDesc('id')->first();
            if (!$document && $application) {
                $documents = SupplierApplicationAttachment::where('supplier_application_id', $application->id)
                    ->where('is_current', true)->where('attachment_type', $type)->orderByDesc('id')->get();
                $document = $documents->first(fn ($doc)=>$this->documentIsCurrent($doc))
                    ?? $documents->firstWhere('verification_status', SupplierApplicationAttachment::STATUS_VERIFIED)
                    ?? $documents->first();
            }
            return [$type=>$document];
        });
    }

    public function documentIsCurrent($document, bool $requireExpiry = false): bool
    {
        if (!$document || $document->verification_status !== SupplierAccreditationDocument::VERIFIED) return false;
        if ($requireExpiry && !$document->expires_on) return false;
        if ($document->expires_on?->lt(today())) return false;
        if ($document instanceof SupplierAccreditationDocument && $document->valid_from?->gt(today())) return false;
        return true;
    }

    public function requiredDocuments(Supplier $supplier): array
    {
        return $this->effectiveDocuments($supplier)->map(function ($document, $type) {
            $status = $document?->verification_status ?? 'MISSING';
            if ($document?->expires_on?->lt(today())) $status = 'EXPIRED';
            elseif ($document instanceof SupplierAccreditationDocument && $document->valid_from?->gt(today())) $status = 'NOT_YET_VALID';
            return ['type'=>$type,'status'=>$status,'expires_on'=>$document?->expires_on?->toDateString(),'is_current'=>$document !== null];
        })->values()->all();
    }
}
