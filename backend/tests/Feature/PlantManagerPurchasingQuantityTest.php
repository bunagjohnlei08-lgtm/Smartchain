<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\ReplenishmentRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierApplication;
use App\Models\SupplierApplicationAttachment;
use App\Models\SupplierProductPurchasingTerm;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlantManagerPurchasingQuantityTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private User $admin;
    private Warehouse $warehouse;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $branch = Branch::create(['name' => 'Main', 'code' => 'MAIN']);
        $this->warehouse = Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id]);
        $this->manager = User::factory()->create(['role_id' => $managerRole->id, 'warehouse_id' => $this->warehouse->id, 'status' => 'ACTIVE']);
        $this->admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        $this->product = $this->product('MOQ Product', 'DRUM');
    }

    public function test_unique_verified_agreement_exposes_and_enforces_minimum_and_maximum(): void
    {
        $term = $this->term($this->product, $this->supplier('SUP-ONE'), 20, null, 100);

        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/options')->assertOk()
            ->assertJsonPath('data.0.purchasingRule.mode', 'unique_agreement')
            ->assertJsonPath('data.0.purchasingRule.term_id', $term->id)
            ->assertJsonPath('data.0.purchasingRule.minimum_order_quantity', 20)
            ->assertJsonPath('data.0.purchasingRule.maximum_order_quantity', 100)
            ->assertJsonPath('data.0.purchasingRule.unit', 'DRUM');

        $this->submit(19, $term->id)->assertUnprocessable()->assertJsonValidationErrors('requested_qty');
        $this->submit(101, $term->id)->assertUnprocessable()->assertJsonValidationErrors('requested_qty');
        $created = $this->submit(20, $term->id)->assertCreated()->assertJsonPath('requested_qty', 20);
        ReplenishmentRequest::findOrFail($created->json('id'))->update(['status' => ReplenishmentRequest::STATUS_REJECTED]);
        $created = $this->submit(50, $term->id)->assertCreated()->assertJsonPath('requested_qty', 50);
        ReplenishmentRequest::findOrFail($created->json('id'))->update(['status' => ReplenishmentRequest::STATUS_REJECTED]);
        $this->submit(100, $term->id)->assertCreated()->assertJsonPath('requested_qty', 100);
    }

    public function test_order_multiple_and_open_maximum_are_enforced_without_inventing_a_cap(): void
    {
        $term = $this->term($this->product, $this->supplier('SUP-MULTIPLE'), 20, 5, null);

        $this->submit(21, $term->id)->assertUnprocessable()->assertJsonValidationErrors('requested_qty');
        $this->submit(125, $term->id)->assertCreated()->assertJsonPath('requested_qty', 125);
    }

    public function test_no_commercial_limits_preserves_positive_whole_quantity_validation(): void
    {
        $term = $this->term($this->product, $this->supplier('SUP-OPEN'), null, null, null);

        $this->submit(0, $term->id)->assertUnprocessable()->assertJsonValidationErrors('requested_qty');
        $this->submit(-1, $term->id)->assertUnprocessable()->assertJsonValidationErrors('requested_qty');
        $this->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => $this->product->id, 'warehouse_id' => $this->warehouse->id,
            'requested_qty' => 1.5, 'purchasing_term_id' => $term->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('requested_qty');
        $this->submit(7, $term->id)->assertCreated()->assertJsonPath('requested_qty', 7);
        $this->assertDatabaseHas('replenishment_requests', [
            'product_id' => $this->product->id,
            'warehouse_id' => $this->warehouse->id,
            'requested_qty' => 7,
        ]);
    }

    public function test_multiple_eligible_supplier_agreements_do_not_apply_arbitrary_limits(): void
    {
        $this->term($this->product, $this->supplier('SUP-A'), 20, null, 100);
        $this->term($this->product, $this->supplier('SUP-B'), 50, 10, 200);

        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/options')->assertOk()
            ->assertJsonPath('data.0.purchasingRule.mode', 'admin_validation')
            ->assertJsonPath('data.0.purchasingRule.eligible_supplier_count', 2);
        $this->submit(1)->assertCreated()->assertJsonPath('requested_qty', 1);
    }

    public function test_bulk_products_keep_independent_units_and_rules(): void
    {
        $sack = $this->product('Sack Product', 'SACK');
        $pcs = $this->product('Piece Product', 'PCS');
        $drumTerm = $this->term($this->product, $this->supplier('SUP-DRUM'), 20, null, null);
        $sackTerm = $this->term($sack, $this->supplier('SUP-SACK'), 10, 5, 50);
        $pcsTerm = $this->term($pcs, $this->supplier('SUP-PCS'), 2, null, 10);

        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests/bulk', ['items' => [
            ['product_id' => $this->product->id, 'requested_qty' => 20, 'purchasing_term_id' => $drumTerm->id],
            ['product_id' => $sack->id, 'requested_qty' => 15, 'purchasing_term_id' => $sackTerm->id],
            ['product_id' => $pcs->id, 'requested_qty' => 2, 'purchasing_term_id' => $pcsTerm->id],
        ]])->assertCreated()->assertJsonCount(3, 'data');
    }

    public function test_no_eligible_agreement_preserves_existing_quantity_rules(): void
    {
        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/options')->assertOk()
            ->assertJsonPath('data.0.purchasingRule.mode', 'admin_validation')
            ->assertJsonPath('data.0.purchasingRule.eligible_supplier_count', 0);

        $this->submit(3)->assertCreated()->assertJsonPath('requested_qty', 3);
    }

    public function test_inactive_expired_and_ineligible_arrangements_are_not_authoritative(): void
    {
        $inactive = $this->term($this->product, $this->supplier('SUP-INACTIVE-TERM'), 20, null, 100);
        $inactive->update(['status' => SupplierProductPurchasingTerm::STATUS_INACTIVE]);
        $expired = $this->term($this->product, $this->supplier('SUP-EXPIRED-TERM'), 30, null, 100);
        $expired->update(['effective_until' => today()->subDay()]);
        $ineligibleSupplier = $this->supplier('SUP-INELIGIBLE');
        $ineligibleSupplier->update(['accreditation_expires_on' => today()->subDay()]);
        $this->term($this->product, $ineligibleSupplier, 40, null, 100);

        $this->actingAs($this->manager)->getJson('/api/plant-manager/procurement/options')->assertOk()
            ->assertJsonPath('data.0.purchasingRule.mode', 'admin_validation')
            ->assertJsonPath('data.0.purchasingRule.eligible_supplier_count', 0);
        $this->submit(1)->assertCreated()->assertJsonPath('requested_qty', 1);
    }

    public function test_stale_or_foreign_frontend_term_cannot_override_current_server_rule(): void
    {
        $supplier = $this->supplier('SUP-CURRENT');
        $old = $this->term($this->product, $supplier, 5, null, null);
        $old->update(['status' => SupplierProductPurchasingTerm::STATUS_INACTIVE]);
        $current = $this->term($this->product, $supplier, 20, null, null);

        $this->submit(5, $old->id)->assertUnprocessable()->assertJsonValidationErrors('requested_qty');
        $this->submit(5, $current->id)->assertUnprocessable()->assertJsonValidationErrors('requested_qty');
        $this->submit(20, $current->id)->assertCreated()->assertJsonPath('requested_qty', 20);
    }

    public function test_bulk_validation_is_transactional_when_one_product_is_invalid(): void
    {
        $sack = $this->product('Transactional Sack', 'SACK');
        $drumTerm = $this->term($this->product, $this->supplier('SUP-TX-DRUM'), 20, null, null);
        $sackTerm = $this->term($sack, $this->supplier('SUP-TX-SACK'), 10, null, null);

        $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests/bulk', ['items' => [
            ['product_id' => $this->product->id, 'requested_qty' => 20, 'purchasing_term_id' => $drumTerm->id],
            ['product_id' => $sack->id, 'requested_qty' => 9, 'purchasing_term_id' => $sackTerm->id],
        ]])->assertUnprocessable();

        $this->assertDatabaseCount('replenishment_requests', 0);
    }

    public function test_existing_ongoing_request_still_blocks_an_equivalent_duplicate(): void
    {
        $term = $this->term($this->product, $this->supplier('SUP-DUPLICATE'), 1, null, null);
        $this->submit(4, $term->id)->assertCreated();

        $this->submit(4, $term->id)->assertUnprocessable()->assertJsonValidationErrors('product_id');
        $this->assertDatabaseCount('replenishment_requests', 1);
    }

    private function submit(int $quantity, ?int $termId = null): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->manager)->postJson('/api/plant-manager/procurement/requests', [
            'product_id' => $this->product->id, 'warehouse_id' => $this->warehouse->id,
            'requested_qty' => $quantity, 'purchasing_term_id' => $termId,
        ]);
    }

    private function product(string $name, string $unit): Product
    {
        $product = Product::create(['name' => $name, 'unit' => $unit]);
        Inventory::create(['barcode' => 'INV-'.str_replace(' ', '-', strtoupper($name)), 'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'available_stock' => 0]);
        return $product;
    }

    private function term(Product $product, Supplier $supplier, ?int $minimum, ?int $multiple, ?int $maximum): SupplierProductPurchasingTerm
    {
        if (! $product->suppliers()->whereKey($supplier->id)->exists()) {
            $product->suppliers()->attach($supplier->id, ['is_primary' => ! $product->suppliers()->wherePivot('is_primary', true)->exists()]);
        }
        return SupplierProductPurchasingTerm::create([
            'supplier_id' => $supplier->id, 'product_id' => $product->id, 'unit' => $product->unit,
            'agreed_unit_price' => '200.00', 'currency' => 'PHP', 'delivery_lead_time_days' => 7,
            'lead_time_basis' => SupplierProductPurchasingTerm::CALENDAR_DAYS,
            'lead_time_start_event' => SupplierProductPurchasingTerm::START_PO_APPROVAL,
            'minimum_order_quantity' => $minimum, 'order_multiple' => $multiple, 'maximum_order_quantity' => $maximum,
            'effective_from' => today()->subDay(), 'effective_until' => null,
            'status' => SupplierProductPurchasingTerm::STATUS_ACTIVE, 'agreement_reference' => null,
            'verified_by' => $this->admin->id, 'verified_at' => now(),
        ]);
    }

    private function supplier(string $code): Supplier
    {
        $supplier = Supplier::create([
            'supplier_code' => $code, 'name' => $code, 'status' => Supplier::STATUS_ACTIVE, 'supply_category' => 'Chemicals',
            'accreditation_status' => 'ACTIVE', 'accredited_at' => now()->subDay(), 'accreditation_expires_on' => now()->addYear(),
        ]);
        $application = SupplierApplication::create([
            'application_number' => 'APP-'.$code, 'company_name' => $code, 'normalized_company_name' => strtolower($code),
            'address' => 'Manila', 'contact_person' => 'Contact', 'email' => strtolower($code).'@example.test',
            'normalized_email' => strtolower($code).'@example.test', 'phone' => '09170000000',
            'business_type' => 'Corporation', 'supply_category' => 'Chemicals',
            'status' => SupplierApplication::STATUS_APPROVED, 'submitted_at' => now(), 'approved_supplier_id' => $supplier->id,
        ]);
        foreach ([SupplierApplicationAttachment::TYPE_BUSINESS_CERTIFICATE, SupplierApplicationAttachment::TYPE_BUSINESS_PERMIT] as $type) {
            $application->attachments()->create([
                'attachment_type' => $type, 'original_name' => strtolower($type).'.pdf', 'stored_path' => "tests/{$supplier->id}/{$type}.pdf",
                'mime_type' => 'application/pdf', 'file_size' => 10, 'is_current' => true,
                'verification_status' => SupplierApplicationAttachment::STATUS_VERIFIED, 'verified_at' => now(), 'expires_on' => now()->addYear(),
            ]);
        }
        return $supplier;
    }
}
