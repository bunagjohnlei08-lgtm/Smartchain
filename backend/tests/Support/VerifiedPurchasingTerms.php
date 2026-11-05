<?php

namespace Tests\Support;

use App\Models\{Product, Supplier, SupplierApplication, SupplierApplicationAttachment, SupplierProductPurchasingTerm, User};

trait VerifiedPurchasingTerms
{
    private function verifiedPurchasingTerm(Supplier $supplier, Product $product, User $admin, string $price, int $days = 1): SupplierProductPurchasingTerm
    {
        $supplier->update(['accreditation_status'=>'ACTIVE', 'supply_category'=>'Chemicals',
            'accredited_at'=>now(), 'accreditation_expires_on'=>today()->addYear()]);
        $supplier->products()->syncWithoutDetaching([$product->id]);
        $application = SupplierApplication::firstOrCreate(['approved_supplier_id'=>$supplier->id], [
            'application_number'=>'APP-TEST-'.$supplier->id, 'company_name'=>$supplier->name,
            'normalized_company_name'=>strtolower($supplier->name), 'address'=>'Fixture address', 'contact_person'=>'Fixture contact',
            'email'=>'supplier-'.$supplier->id.'@example.test', 'normalized_email'=>'supplier-'.$supplier->id.'@example.test',
            'phone'=>'09170000000', 'business_type'=>'Corporation', 'supply_category'=>'Chemicals',
            'status'=>SupplierApplication::STATUS_APPROVED, 'submitted_at'=>now(),
        ]);
        foreach ([SupplierApplicationAttachment::TYPE_BUSINESS_CERTIFICATE, SupplierApplicationAttachment::TYPE_BUSINESS_PERMIT] as $type) {
            $application->attachments()->firstOrCreate(['attachment_type'=>$type, 'is_current'=>true], [
                'original_name'=>$type.'.pdf', 'stored_path'=>'fixtures/'.$type.'.pdf', 'mime_type'=>'application/pdf', 'file_size'=>10,
                'verification_status'=>SupplierApplicationAttachment::STATUS_VERIFIED, 'verified_at'=>now(), 'expires_on'=>today()->addYear(),
            ]);
        }
        return SupplierProductPurchasingTerm::create(['supplier_id'=>$supplier->id, 'product_id'=>$product->id, 'unit'=>$product->unit,
            'agreed_unit_price'=>$price, 'currency'=>'PHP', 'delivery_lead_time_days'=>$days, 'lead_time_basis'=>'CALENDAR_DAYS',
            'lead_time_start_event'=>'PO_APPROVAL', 'effective_from'=>today()->subDay(), 'status'=>'ACTIVE', 'verified_by'=>$admin->id, 'verified_at'=>now()]);
    }
}
