<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierAccreditationRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SupplierAccreditationManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_supplier_can_submit_category_expansion_and_admin_approval_grants_only_catalog_category(): void
    {
        [$admin,$supplierUser,$supplier]=$this->actors();
        Product::create(['name'=>'Wood preservative','category'=>'WOOD PRESERVATIVE PRODUCTS','unit'=>'PCS','item_classification'=>Product::RAW_MATERIAL]);

        $response=$this->actingAs($supplierUser)->postJson('/api/supplier-account/accreditation-requests',[
            'request_type'=>SupplierAccreditationRequest::CATEGORY_EXPANSION,
            'reason'=>'We distribute this catalog category and can provide supporting evidence.',
            'requested_categories'=>['WOOD PRESERVATIVE PRODUCTS'],
        ])->assertCreated()->assertJsonPath('data.status',SupplierAccreditationRequest::PENDING);

        $request=SupplierAccreditationRequest::findOrFail($response->json('data.id'));
        $this->actingAs($admin)->postJson("/api/admin/accreditation-requests/{$request->id}/decision",[
            'decision'=>SupplierAccreditationRequest::APPROVED,'reason'=>'Catalog category and submitted capability were reviewed and approved.','lock_version'=>1,
        ])->assertOk()->assertJsonPath('data.status',SupplierAccreditationRequest::APPROVED);

        $this->assertSame('Tools, WOOD PRESERVATIVE PRODUCTS',$supplier->fresh()->supply_category);
        $this->assertDatabaseHas('audit_logs',['action'=>'SUPPLIER_ACCREDITATION_REQUEST_APPROVED','resource_id'=>(string)$request->id]);
    }

    public function test_unknown_category_and_supplier_self_approval_are_blocked(): void
    {
        [, $supplierUser]=$this->actors();
        $this->actingAs($supplierUser)->postJson('/api/supplier-account/accreditation-requests',[
            'request_type'=>SupplierAccreditationRequest::CATEGORY_EXPANSION,'reason'=>'Request unsupported category.','requested_categories'=>['NOT A CATALOG CATEGORY'],
        ])->assertUnprocessable()->assertJsonValidationErrors('requested_categories');

        $this->actingAs($supplierUser)->postJson('/api/admin/accreditation-requests/1/decision',[
            'decision'=>SupplierAccreditationRequest::APPROVED,'reason'=>'Unauthorized approval attempt.','lock_version'=>1,
        ])->assertForbidden();

        $this->assertDatabaseCount('supplier_accreditation_requests', 0);
        $this->assertDatabaseCount('supplier_accreditation_events', 0);
        $this->assertDatabaseMissing('audit_logs', ['action'=>'SUPPLIER_ACCREDITATION_REQUEST_APPROVED']);
    }

    public function test_uploaded_evidence_is_private_and_owned_by_the_supplier(): void
    {
        Storage::fake('local');
        [, $supplierUser]=$this->actors();
        [, $otherUser]=$this->actors('SUP-TEST-2','other-supplier@example.test');
        $response=$this->actingAs($supplierUser)->post('/api/supplier-account/accreditation-requests',[
            'request_type'=>SupplierAccreditationRequest::RENEWAL,'reason'=>'Annual accreditation renewal evidence.','business_certificate'=>UploadedFile::fake()->create('certificate.pdf',20,'application/pdf'),
        ])->assertCreated();
        $documentId=$response->json('data.documents.0.id');
        $this->actingAs($otherUser)->get("/api/supplier-account/accreditation-documents/{$documentId}")->assertNotFound();
        $this->actingAs($supplierUser)->get("/api/supplier-account/accreditation-documents/{$documentId}")->assertOk()->assertHeader('x-content-type-options','nosniff');
    }

    private function actors(string $code='SUP-TEST-1',string $email='supplier@example.test'): array
    {
        $adminRole=Role::firstOrCreate(['slug'=>'ADMIN'],['name'=>'Admin']);
        $supplierRole=Role::firstOrCreate(['slug'=>'SUPPLIER'],['name'=>'Supplier']);
        $admin=User::factory()->create(['role_id'=>$adminRole->id,'status'=>'ACTIVE']);
        $supplier=Supplier::create(['supplier_code'=>$code,'name'=>$code,'email'=>$email,'status'=>'ACTIVE','supply_category'=>'Tools','accreditation_status'=>'ACTIVE']);
        $supplierUser=User::factory()->create(['role_id'=>$supplierRole->id,'supplier_id'=>$supplier->id,'status'=>'ACTIVE','email'=>$email]);
        return[$admin,$supplierUser,$supplier];
    }
}
