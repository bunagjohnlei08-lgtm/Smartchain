<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\ReplenishmentRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierApplication;
use App\Models\SupplierApplicationOffering;
use App\Models\User;
use App\Models\Warehouse;
use App\Notifications\WorkflowNotification;
use App\Support\SupplierPortalAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SupplierCatalogMappingTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $manager;
    private Warehouse $warehouse;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Mail::fake();
        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $this->warehouse = Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id, 'status' => 'Active']);
        $this->admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        $this->manager = User::factory()->create(['role_id' => $managerRole->id, 'status' => 'ACTIVE', 'warehouse_id' => $this->warehouse->id]);
    }

    private function application(string $status = SupplierApplication::STATUS_APPROVED, array $offerings = [], ?Supplier $supplier = null): SupplierApplication
    {
        $application = SupplierApplication::create([
            'application_number' => 'SUP-APP-2026-'.strtoupper(substr(md5((string) microtime(true)), 0, 8)),
            'company_name' => 'Novaplaza', 'normalized_company_name' => 'novaplaza',
            'address' => '1 Supplier Road', 'contact_person' => 'Nova Contact',
            'email' => 'sales@novaplaza.test', 'normalized_email' => 'sales@novaplaza.test',
            'phone' => '639170000000', 'business_type' => 'Corporation', 'supply_category' => 'Construction Chemicals',
            'products_services' => 'Legacy free-text description of construction chemicals.',
            'status' => $status, 'submitted_at' => now(), 'approved_supplier_id' => $supplier?->id,
        ]);
        foreach (array_values($offerings) as $index => $offering) {
            $application->offerings()->create([
                'type' => $offering['type'] ?? 'PRODUCT', 'name' => $offering['name'],
                'normalized_name' => SupplierApplicationOffering::normalizeName($offering['name']),
                'category' => $offering['category'] ?? 'Construction Chemicals', 'sort_order' => $index,
            ]);
        }

        return $application;
    }

    private function approvedOffering(string $name = 'MegaAdd P4 (Powder)', string $supplierStatus = Supplier::STATUS_ACTIVE): SupplierApplicationOffering
    {
        $supplier = Supplier::create(['supplier_code' => 'SUP-'.random_int(100, 999), 'name' => 'Novaplaza', 'status' => $supplierStatus]);

        return $this->application(SupplierApplication::STATUS_APPROVED, [['name' => $name]], $supplier)->offerings()->sole();
    }

    private function publicPayload(array $offerings): array
    {
        return [
            'company_name' => 'Atlas Industrial', 'owner_name' => 'Andrea Reyes', 'address' => '123 Manufacturing Avenue',
            'contact_person' => 'Maria Santos', 'email' => 'sales@atlas.test', 'phone' => '639171234567',
            'business_type' => 'Corporation', 'supply_category' => 'Construction Chemicals',
            'offerings' => $offerings,
            'business_certificate' => [UploadedFile::fake()->create('certificate.pdf', 20, 'application/pdf')],
            'business_permit' => [UploadedFile::fake()->image('permit.jpg')],
            'product_service_image' => [UploadedFile::fake()->image('catalog.png')],
        ];
    }

    // TEST 1
    public function test_historical_application_with_only_free_text_still_loads(): void
    {
        $application = $this->application(SupplierApplication::STATUS_UNDER_REVIEW);

        $this->actingAs($this->admin)->getJson("/api/admin/supplier-applications/{$application->id}")->assertOk()
            ->assertJsonPath('data.products_services', 'Legacy free-text description of construction chemicals.')
            ->assertJsonPath('data.offerings', []);

        $link = SupplierPortalAccess::issueLink($application);
        $session = $this->postJson('/api/supplier-portal/access', ['access_token' => $link['token']])->assertOk()->json('session_token');
        $this->withHeaders(['X-Supplier-Portal-Session' => $session])->getJson('/api/supplier-portal/application')
            ->assertOk()->assertJsonPath('data.offerings', [])
            ->assertJsonPath('data.products_services', 'Legacy free-text description of construction chemicals.');
    }

    // TEST 2: products only; type is not supplier input and defaults to PRODUCT.
    public function test_applicant_submits_multiple_structured_offerings(): void
    {
        $this->post('/api/supplier-applications', $this->publicPayload([
            ['name' => '  MegaAdd   P4 (Powder) ', 'category' => 'Construction Chemicals', 'description' => 'Admixture'],
            ['name' => 'MegaFlow MP', 'category' => 'Construction Chemicals'],
            ['type' => 'PRODUCT', 'name' => 'MegaAdd SAL', 'category' => 'Construction Chemicals'],
        ]), ['Accept' => 'application/json'])->assertCreated();

        $application = SupplierApplication::query()->sole();
        $this->assertNull($application->products_services);
        $this->assertSame(
            [['PRODUCT', 'MegaAdd P4 (Powder)'], ['PRODUCT', 'MegaFlow MP'], ['PRODUCT', 'MegaAdd SAL']],
            $application->offerings->map(fn ($offering) => [$offering->type, $offering->name])->all(),
        );
        $this->assertDatabaseCount('products', 0);
    }

    public function test_offering_validation_rejects_bad_type_missing_product_category_duplicates_and_unknown_keys(): void
    {
        $this->post('/api/supplier-applications', $this->publicPayload([['type' => 'OTHER', 'name' => 'X1', 'category' => 'Chemicals']]), ['Accept' => 'application/json'])
            ->assertUnprocessable()->assertJsonValidationErrors('offerings.0.type');
        $this->post('/api/supplier-applications', $this->publicPayload([['type' => 'SERVICE', 'name' => 'Consulting', 'category' => 'Services']]), ['Accept' => 'application/json'])
            ->assertUnprocessable()->assertJsonValidationErrors('offerings.0.type');
        $this->post('/api/supplier-applications', $this->publicPayload([['name' => 'MegaAdd SAL']]), ['Accept' => 'application/json'])
            ->assertUnprocessable()->assertJsonValidationErrors('offerings.0.category');
        $this->post('/api/supplier-applications', $this->publicPayload([
            ['type' => 'PRODUCT', 'name' => 'MegaAdd SAL', 'category' => 'Chemicals'],
            ['type' => 'PRODUCT', 'name' => 'megaadd  sal', 'category' => 'Chemicals'],
        ]), ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('offerings.1.name');
        $this->post('/api/supplier-applications', $this->publicPayload([
            ['type' => 'PRODUCT', 'name' => 'MegaAdd SAL', 'category' => 'Chemicals', 'mapped_product_id' => 1],
        ]), ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('offerings.0');

        $this->assertDatabaseCount('supplier_applications', 0);
        $this->assertDatabaseCount('supplier_application_offerings', 0);
    }

    // TEST 3 + TEST 4
    public function test_final_approval_creates_one_supplier_and_no_catalog_records(): void
    {
        $application = $this->application(SupplierApplication::STATUS_MEETING_COMPLETED, [['name' => 'MegaAdd P4 (Powder)'], ['name' => 'MegaFlow MP']]);

        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/approve")->assertOk();
        $this->postJson("/api/admin/supplier-applications/{$application->id}/approve")->assertOk();

        $this->assertDatabaseCount('suppliers', 1);
        $this->assertDatabaseCount('products', 0);
        $this->assertDatabaseCount('product_supplier', 0);
        $this->assertDatabaseCount('inventories', 0);
        $this->getJson('/api/admin/catalog-mapping/offerings')->assertOk()->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.supplier.name', 'Novaplaza');
    }

    public function test_services_and_unapproved_offerings_are_not_pending_catalog_mapping(): void
    {
        $supplier = Supplier::create(['supplier_code' => 'SUP-200', 'name' => 'Novaplaza', 'status' => 'ACTIVE']);
        $this->application(SupplierApplication::STATUS_APPROVED, [['name' => 'Consulting', 'type' => 'SERVICE']], $supplier);
        $this->application(SupplierApplication::STATUS_UNDER_REVIEW, [['name' => 'Pending Product']]);

        $this->actingAs($this->admin)->getJson('/api/admin/catalog-mapping/offerings')->assertOk()->assertJsonCount(0, 'data');
    }

    // TEST 5
    public function test_admin_links_offering_to_existing_product_without_duplicates(): void
    {
        $offering = $this->approvedOffering('MegaAdd P4 (Powder)');
        $product = Product::create(['name' => 'MegaAdd P4 (powder)', 'category' => 'Construction Chemicals']);

        $this->actingAs($this->admin)->getJson('/api/admin/catalog-mapping/offerings')->assertOk()
            ->assertJsonPath('data.0.suggested_product.id', $product->id);
        // A suggestion is not a link.
        $this->assertDatabaseCount('product_supplier', 0);

        $this->postJson("/api/admin/catalog-mapping/offerings/{$offering->id}/link", ['product_id' => $product->id])->assertOk();
        $this->postJson("/api/admin/catalog-mapping/offerings/{$offering->id}/link", ['product_id' => $product->id])
            ->assertUnprocessable()->assertJsonValidationErrors('offering');

        $this->assertDatabaseCount('products', 1);
        $this->assertDatabaseCount('product_supplier', 1);
        $this->assertDatabaseHas('product_supplier', ['product_id' => $product->id, 'is_primary' => true]);
        $this->assertSame($product->id, $offering->fresh()->mapped_product_id);
        $this->assertDatabaseHas('audit_logs', ['action' => 'SUPPLIER_OFFERING_MAPPED']);
        $this->getJson('/api/admin/catalog-mapping/offerings')->assertJsonCount(0, 'data');
    }

    // TEST 6 + TEST 10 + TEST 12
    public function test_admin_creates_procurement_ready_product_from_offering(): void
    {
        Notification::fake();
        $offering = $this->approvedOffering('QEMI DF 230 FG');

        $this->actingAs($this->admin)->postJson("/api/admin/catalog-mapping/offerings/{$offering->id}/create-product", [
            'name' => $offering->name, 'category' => $offering->category, 'warehouse_id' => $this->warehouse->id, 'unit' => 'pcs',
        ])->assertCreated()->assertJsonPath('data.product.unit', 'PCS');

        $product = Product::query()->sole();
        $this->assertSame(['QEMI DF 230 FG', 'Construction Chemicals', 'PCS'], [$product->name, $product->category, $product->unit]);
        $this->assertDatabaseHas('product_supplier', ['product_id' => $product->id, 'is_primary' => true]);
        $this->assertDatabaseHas('inventories', ['product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'available_stock' => 0]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'PRODUCT_CREATED_FROM_OFFERING']);

        $this->getJson('/api/admin/products')->assertOk()
            ->assertJsonPath('data.0.supplier', 'Novaplaza')->assertJsonPath('data.0.warehouses.0', 'Main Warehouse')
            ->assertJsonPath('data.0.status', 'OUT OF STOCK');

        Notification::assertSentTo($this->manager, WorkflowNotification::class, fn (WorkflowNotification $notification) => $notification->title === 'New Product Added'
            && str_contains($notification->message, 'QEMI DF 230 FG has been added to Main Warehouse and assigned to Novaplaza.')
            && str_contains($notification->message, 'requires replenishment'));
        Notification::assertNotSentTo($this->admin, WorkflowNotification::class);

        // TEST 10 + TEST 11: appears as a Critical, not-submitted candidate; reading creates nothing.
        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/options')->assertOk()
            ->assertJsonPath('data.0.productId', $product->id)->assertJsonPath('data.0.priority', 'Critical')
            ->assertJsonPath('data.0.requestStatus', 'not_submitted')->assertJsonPath('data.0.canRequest', true)
            ->assertJsonPath('data.0.primarySupplier.name', 'Novaplaza')->assertJsonPath('data.0.supplierWarning', null);
        $this->assertDatabaseCount('replenishment_requests', 0);
    }

    public function test_create_from_offering_refuses_duplicate_name_inactive_supplier_and_rolls_back(): void
    {
        $offering = $this->approvedOffering('MegaFlow MP');
        Product::create(['name' => 'megaflow  mp']);
        $this->actingAs($this->admin)->postJson("/api/admin/catalog-mapping/offerings/{$offering->id}/create-product", [
            'name' => 'MegaFlow MP', 'warehouse_id' => $this->warehouse->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('name');

        $inactive = $this->approvedOffering('Inactive Supplier Product', Supplier::STATUS_ON_HOLD);
        $this->postJson("/api/admin/catalog-mapping/offerings/{$inactive->id}/create-product", [
            'name' => 'Inactive Supplier Product', 'warehouse_id' => $this->warehouse->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('offering');

        $inactiveWarehouse = Warehouse::create(['name' => 'Old Warehouse', 'code' => 'WH-OLD', 'branch_id' => $this->warehouse->branch_id, 'status' => 'Inactive']);
        $other = $this->approvedOffering('Brand New Product');
        $this->postJson("/api/admin/catalog-mapping/offerings/{$other->id}/create-product", [
            'name' => 'Brand New Product', 'warehouse_id' => $inactiveWarehouse->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('warehouse_id');

        $this->assertDatabaseCount('products', 1);
        $this->assertDatabaseCount('product_supplier', 0);
        $this->assertDatabaseCount('inventories', 0);
        $this->assertNull($other->fresh()->mapped_product_id);
    }

    // TEST 7
    public function test_unit_defaults_to_pcs_and_rejects_other_units(): void
    {
        $supplier = Supplier::create(['supplier_code' => 'SUP-UNIT', 'name' => 'Unit Supplier', 'status' => 'ACTIVE']);
        $this->actingAs($this->admin)->postJson('/api/admin/products', ['name' => 'Default Unit', 'supplier_id' => $supplier->id, 'warehouse_id' => $this->warehouse->id])
            ->assertCreated()->assertJsonPath('unit', 'PCS');
        $this->postJson('/api/admin/products', ['name' => 'Kg Unit', 'unit' => 'kg'])
            ->assertUnprocessable()->assertJsonValidationErrors('unit');
    }

    // TEST 8 + TEST 9
    public function test_setup_required_is_distinct_from_real_out_of_stock(): void
    {
        $unassigned = Product::create(['name' => 'A Unassigned Product']);
        $zero = Product::create(['name' => 'B Zero Stock Product']);
        Inventory::create(['barcode' => 'ZERO-1', 'product_id' => $zero->id, 'warehouse_id' => $this->warehouse->id, 'available_stock' => 0]);
        $healthy = Product::create(['name' => 'C Healthy Product']);
        Inventory::create(['barcode' => 'OK-1', 'product_id' => $healthy->id, 'warehouse_id' => $this->warehouse->id, 'available_stock' => 31]);

        $this->actingAs($this->admin)->getJson('/api/admin/products?sort_by=name')->assertOk()
            ->assertJsonPath('data.0.status', 'SETUP REQUIRED')->assertJsonPath('data.0.warehouses', [])
            ->assertJsonPath('data.0.supplier', null)
            ->assertJsonPath('data.1.status', 'OUT OF STOCK')->assertJsonPath('data.2.status', 'IN STOCK')
            ->assertJsonPath('summary.setup_required', 1)->assertJsonPath('summary.out_of_stock', 1);
        $this->getJson('/api/admin/products?status=SETUP+REQUIRED')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $unassigned->id);
    }

    // TEST 13
    public function test_candidate_without_active_supplier_is_flagged_but_can_still_be_forwarded(): void
    {
        $product = Product::create(['name' => 'Unmapped Product']);
        $onHold = Supplier::create(['supplier_code' => 'SUP-300', 'name' => 'Paused Supplier', 'status' => Supplier::STATUS_ON_HOLD]);
        $product->suppliers()->attach($onHold->id, ['is_primary' => true]);
        Inventory::create(['barcode' => 'UNMAPPED-1', 'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'available_stock' => 4]);

        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/options')->assertOk()
            ->assertJsonPath('data.0.supplierWarning', 'NO_ACTIVE_SUPPLIER')->assertJsonPath('data.0.primarySupplier', null)
            ->assertJsonPath('data.0.canRequest', true);
        $this->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'requested_qty' => 20,
        ])->assertCreated();

        // Admin is never handed the inactive supplier for PO preselection.
        $request = ReplenishmentRequest::query()->sole();
        $this->actingAs($this->admin)->getJson("/api/admin/procurement/requests/{$request->id}")->assertOk()
            ->assertJsonPath('primary_supplier', null);
    }

    public function test_admin_procurement_exposes_active_primary_supplier_for_po_preselection(): void
    {
        $product = Product::create(['name' => 'Mapped Product']);
        $supplier = Supplier::create(['supplier_code' => 'SUP-301', 'name' => 'Novaplaza', 'status' => 'ACTIVE']);
        $product->suppliers()->attach($supplier->id, ['is_primary' => true]);
        $request = ReplenishmentRequest::create([
            'request_no' => 'RR-MAPPED', 'requested_by' => $this->manager->id, 'warehouse_id' => $this->warehouse->id,
            'product_id' => $product->id, 'requested_qty' => 10, 'priority' => 'Critical', 'status' => 'pending', 'submitted_at' => now(),
        ]);

        $this->actingAs($this->admin)->getJson("/api/admin/procurement/requests/{$request->id}")->assertOk()
            ->assertJsonPath('primary_supplier.id', $supplier->id);
    }

    // TEST 14
    public function test_bulk_legacy_supplier_mapping_never_duplicates_links_or_guesses(): void
    {
        $supplier = Supplier::create(['supplier_code' => 'SUP-400', 'name' => 'Novaplaza', 'status' => 'ACTIVE']);
        $first = Product::create(['name' => 'MegaAdd P4', 'category' => 'Construction Chemicals']);
        $second = Product::create(['name' => 'MegaAdd SAL', 'category' => 'Construction Chemicals']);
        $untouched = Product::create(['name' => 'MegaFlow MP', 'category' => 'Construction Chemicals']);

        $payload = ['product_ids' => [$first->id, $second->id], 'supplier_id' => $supplier->id];
        $this->actingAs($this->admin)->postJson('/api/admin/products/bulk-supplier', $payload)->assertOk()->assertJsonPath('data.new_links', 2);
        $this->postJson('/api/admin/products/bulk-supplier', $payload)->assertOk()->assertJsonPath('data.new_links', 0)->assertJsonPath('data.already_linked', 2);

        $this->assertDatabaseCount('product_supplier', 2);
        $this->assertDatabaseMissing('product_supplier', ['product_id' => $untouched->id]);
        $this->assertDatabaseCount('inventories', 0);

        $inactive = Supplier::create(['supplier_code' => 'SUP-401', 'name' => 'Paused', 'status' => 'INACTIVE']);
        $this->postJson('/api/admin/products/bulk-supplier', ['product_ids' => [$untouched->id], 'supplier_id' => $inactive->id])
            ->assertUnprocessable()->assertJsonValidationErrors('supplier_id');
        $this->postJson('/api/admin/products/bulk-supplier', ['product_ids' => [$first->id, $first->id], 'supplier_id' => $supplier->id])
            ->assertUnprocessable();
    }

    public function test_primary_supplier_switch_keeps_a_single_primary(): void
    {
        $product = Product::create(['name' => 'Switchable']);
        $old = Supplier::create(['supplier_code' => 'SUP-500', 'name' => 'Old', 'status' => 'ACTIVE']);
        $new = Supplier::create(['supplier_code' => 'SUP-501', 'name' => 'New', 'status' => 'ACTIVE']);
        $this->actingAs($this->admin)->postJson('/api/admin/products/bulk-supplier', ['product_ids' => [$product->id], 'supplier_id' => $old->id])->assertOk();
        $this->postJson('/api/admin/products/bulk-supplier', ['product_ids' => [$product->id], 'supplier_id' => $new->id])->assertOk();
        $this->assertSame([$old->id], DB::table('product_supplier')->where('is_primary', true)->pluck('supplier_id')->all());

        $this->postJson('/api/admin/products/bulk-supplier', ['product_ids' => [$product->id], 'supplier_id' => $new->id, 'make_primary' => true])->assertOk();
        $this->assertSame([$new->id], DB::table('product_supplier')->where('is_primary', true)->pluck('supplier_id')->all());
        $this->assertDatabaseHas('audit_logs', ['action' => 'PRODUCT_PRIMARY_SUPPLIER_CHANGED']);
    }

    public function test_legacy_warehouse_assignment_is_explicit_and_idempotent(): void
    {
        Notification::fake();
        $product = Product::create(['name' => 'Legacy Product']);
        $supplier = Supplier::create(['supplier_code' => 'SUP-600', 'name' => 'Novaplaza', 'status' => 'ACTIVE']);
        $product->suppliers()->attach($supplier->id, ['is_primary' => true]);

        $this->actingAs($this->admin)->postJson("/api/admin/products/{$product->id}/warehouse", ['warehouse_id' => $this->warehouse->id])
            ->assertOk()->assertJsonPath('status', 'OUT OF STOCK');
        $this->postJson("/api/admin/products/{$product->id}/warehouse", ['warehouse_id' => $this->warehouse->id])->assertOk();

        $this->assertDatabaseCount('inventories', 1);
        Notification::assertSentToTimes($this->manager, WorkflowNotification::class, 1);
    }

    public function test_manual_inventory_creation_rejects_a_second_row_for_the_same_product_and_warehouse(): void
    {
        $product = Product::create(['name' => 'Single Row Product']);
        Inventory::create(['barcode' => 'SINGLE-1', 'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'available_stock' => 5]);

        $this->actingAs($this->admin)->postJson('/api/inventory', [
            'barcode' => 'SINGLE-2', 'product' => $product->name, 'warehouse_id' => $this->warehouse->id,
            'available_stock' => 1, 'reserved_stock' => 0, 'backload' => 0, 'status' => 'Available',
        ])->assertUnprocessable()->assertJsonValidationErrors('warehouse_id');
        $this->assertDatabaseCount('inventories', 1);
    }

    // TEST 15
    public function test_plant_manager_cannot_perform_admin_catalog_mapping(): void
    {
        $offering = $this->approvedOffering();
        $product = Product::create(['name' => 'Any Product']);
        $supplier = Supplier::query()->firstOrFail();

        $this->actingAs($this->manager)->getJson('/api/admin/catalog-mapping/offerings')->assertForbidden();
        $this->postJson("/api/admin/catalog-mapping/offerings/{$offering->id}/link", ['product_id' => $product->id])->assertForbidden();
        $this->postJson("/api/admin/catalog-mapping/offerings/{$offering->id}/create-product", ['name' => 'X', 'warehouse_id' => $this->warehouse->id])->assertForbidden();
        $this->postJson('/api/admin/products/bulk-supplier', ['product_ids' => [$product->id], 'supplier_id' => $supplier->id])->assertForbidden();
        $this->postJson("/api/admin/products/{$product->id}/warehouse", ['warehouse_id' => $this->warehouse->id])->assertForbidden();

        $this->assertDatabaseCount('product_supplier', 0);
        $this->assertDatabaseCount('inventories', 0);
        $this->assertNull($offering->fresh()->mapped_product_id);
    }

    // TEST 16
    public function test_supplier_portal_session_cannot_create_catalog_or_inventory_records(): void
    {
        $application = $this->application(SupplierApplication::STATUS_UNDER_REVIEW, [['name' => 'Original Product']]);
        $link = SupplierPortalAccess::issueLink($application);
        $session = $this->postJson('/api/supplier-portal/access', ['access_token' => $link['token']])->assertOk()->json('session_token');
        $headers = ['X-Supplier-Portal-Session' => $session, 'Accept' => 'application/json'];

        $this->withHeaders($headers)->postJson('/api/admin/products', ['name' => 'Injected'])->assertUnauthorized();
        $this->withHeaders($headers)->getJson('/api/admin/catalog-mapping/offerings')->assertUnauthorized();
        $this->withHeaders($headers)->postJson('/api/plant-manager/procurement/requests', [])->assertUnauthorized();

        $this->actingAs($this->admin)->postJson("/api/admin/supplier-applications/{$application->id}/revision", [
            'reason_codes' => ['INCOMPLETE_INFORMATION'], 'supplier_message' => 'Please list your products clearly.',
        ])->assertOk();
        $this->app['auth']->forgetGuards();

        $this->withHeaders($headers)->post('/api/supplier-portal/resubmit', [
            'offerings' => [['type' => 'PRODUCT', 'name' => 'Corrected Product', 'category' => 'Chemicals', 'mapped_product_id' => 99]],
        ])->assertUnprocessable()->assertJsonValidationErrors('offerings.0');

        $this->withHeaders($headers)->post('/api/supplier-portal/resubmit', [
            'offerings' => [['type' => 'PRODUCT', 'name' => 'Corrected Product', 'category' => 'Chemicals']],
            'warehouse_id' => $this->warehouse->id, 'available_stock' => 500,
        ])->assertOk()->assertJsonPath('data.offerings.0.name', 'Corrected Product');

        $this->assertSame(['Corrected Product'], $application->offerings()->pluck('name')->all());
        $this->assertDatabaseCount('products', 0);
        $this->assertDatabaseCount('inventories', 0);
        $this->assertDatabaseCount('product_supplier', 0);
    }
}
