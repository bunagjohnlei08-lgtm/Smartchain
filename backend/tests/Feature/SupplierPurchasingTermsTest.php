<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Product;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierApplication;
use App\Models\SupplierApplicationAttachment;
use App\Models\SupplierProductPurchasingTerm;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SupplierPurchasingTermsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $manager;
    private Supplier $supplier;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        Branch::create(['name' => 'Main', 'code' => 'MAIN']);
        $this->admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        $this->manager = User::factory()->create(['role_id' => $managerRole->id, 'status' => 'ACTIVE']);
        $this->supplier = $this->eligibleSupplier('SUP-TERMS', 'Terms Supplier');
        $this->product = Product::create(['name' => 'Agreement Product', 'category' => 'Chemicals', 'unit' => 'DRUM', 'cost_price' => '999.99']);
        $this->product->suppliers()->attach($this->supplier->id, ['is_primary' => true]);
    }

    public function test_admin_manages_terms_without_changing_payment_terms_or_catalog_cost(): void
    {
        $this->supplier->update(['payment_terms' => 'Net 15']);
        $payload = $this->payload();
        $created = $this->actingAs($this->admin)->postJson("/api/suppliers/{$this->supplier->id}/purchasing-terms", $payload)
            ->assertCreated()->assertJsonPath('data.unit', 'DRUM')->assertJsonPath('data.agreed_unit_price', '125.50')
            ->assertJsonPath('data.product.name', 'Agreement Product');
        $termId = $created->json('data.id');

        $this->getJson("/api/suppliers/{$this->supplier->id}/purchasing-terms")->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('product_options.0.id', $this->product->id);
        $this->assertSame('Net 15', $this->supplier->fresh()->payment_terms);
        $this->assertSame('999.99', $this->product->fresh()->cost_price);

        $this->putJson("/api/suppliers/{$this->supplier->id}/purchasing-terms/{$termId}", [...$payload, 'agreed_unit_price' => '130.00'])
            ->assertOk()->assertJsonPath('data.agreed_unit_price', '130.00');
        $this->patchJson("/api/suppliers/{$this->supplier->id}/purchasing-terms/{$termId}/deactivate")
            ->assertOk()->assertJsonPath('data.status', 'INACTIVE');
    }

    public function test_terms_require_admin_mapping_valid_values_and_non_overlapping_periods(): void
    {
        $this->actingAs($this->manager)->postJson("/api/suppliers/{$this->supplier->id}/purchasing-terms", $this->payload())->assertForbidden();
        $other = Product::create(['name' => 'Unmapped', 'unit' => 'PCS']);
        $this->actingAs($this->admin)->postJson("/api/suppliers/{$this->supplier->id}/purchasing-terms", [...$this->payload(), 'product_id' => $other->id])
            ->assertUnprocessable()->assertJsonValidationErrors('product_id');
        $this->postJson("/api/suppliers/{$this->supplier->id}/purchasing-terms", [...$this->payload(), 'agreed_unit_price' => '-1'])
            ->assertUnprocessable()->assertJsonValidationErrors('agreed_unit_price');
        $this->postJson("/api/suppliers/{$this->supplier->id}/purchasing-terms", [...$this->payload(), 'maximum_order_quantity' => 10])
            ->assertUnprocessable()->assertJsonValidationErrors('maximum_order_quantity');
        $this->postJson("/api/suppliers/{$this->supplier->id}/purchasing-terms", $this->payload())->assertCreated();
        $this->postJson("/api/suppliers/{$this->supplier->id}/purchasing-terms", $this->payload())
            ->assertUnprocessable()->assertJsonValidationErrors('effective_from');
    }

    public function test_scalar_contract_accepts_supported_values_and_optional_fields(): void
    {
        $this->actingAs($this->admin);

        $created = $this->postJson("/api/suppliers/{$this->supplier->id}/purchasing-terms", [
            ...$this->payload(),
            'agreed_unit_price' => '200',
            'delivery_lead_time_days' => 7,
            'minimum_order_quantity' => null,
            'order_multiple' => null,
            'maximum_order_quantity' => null,
            'status' => SupplierProductPurchasingTerm::STATUS_INACTIVE,
            'agreement_reference' => null,
        ])->assertCreated()
            ->assertJsonPath('data.product_id', $this->product->id)
            ->assertJsonPath('data.agreed_unit_price', '200.00')
            ->assertJsonPath('data.currency', 'PHP')
            ->assertJsonPath('data.delivery_lead_time_days', 7)
            ->assertJsonPath('data.lead_time_basis', SupplierProductPurchasingTerm::CALENDAR_DAYS)
            ->assertJsonPath('data.lead_time_start_event', SupplierProductPurchasingTerm::START_PO_APPROVAL)
            ->assertJsonPath('data.agreement_reference', null)
            ->assertJsonPath('data.status', SupplierProductPurchasingTerm::STATUS_INACTIVE);

        $termId = $created->json('data.id');
        $this->putJson("/api/suppliers/{$this->supplier->id}/purchasing-terms/{$termId}", [
            ...$this->payload(),
            'agreed_unit_price' => '200.00',
            'lead_time_basis' => SupplierProductPurchasingTerm::BUSINESS_DAYS,
            'minimum_order_quantity' => null,
            'order_multiple' => null,
            'maximum_order_quantity' => null,
            'status' => SupplierProductPurchasingTerm::STATUS_INACTIVE,
            'agreement_reference' => null,
        ])->assertOk()
            ->assertJsonPath('data.agreed_unit_price', '200.00')
            ->assertJsonPath('data.lead_time_basis', SupplierProductPurchasingTerm::BUSINESS_DAYS);

        $this->postJson('/api/purchase-orders/purchasing-options', ['items' => [
            ['product_id' => $this->product->id, 'ordered_quantity' => 1],
        ]])->assertOk()->assertJsonCount(0, 'data.suppliers');
    }

    public function test_options_only_return_suppliers_eligible_for_all_products_and_preserve_primary(): void
    {
        $this->term();
        $otherProduct = Product::create(['name' => 'Second Product', 'unit' => 'DRUM']);
        $this->supplier->products()->attach($otherProduct->id, ['is_primary' => false]);
        $this->term(['product_id' => $otherProduct->id, 'agreement_reference' => 'AGR-SECOND']);
        $unrelated = $this->eligibleSupplier('SUP-OTHER', 'Unrelated Supplier');

        $this->actingAs($this->admin)->postJson('/api/purchase-orders/purchasing-options', ['items' => [
            ['product_id' => $this->product->id, 'ordered_quantity' => 25],
            ['product_id' => $otherProduct->id, 'ordered_quantity' => 25],
        ]])->assertOk()->assertJsonCount(1, 'data.suppliers')->assertJsonPath('data.suppliers.0.id', $this->supplier->id)
            ->assertJsonPath('data.preferred_supplier_id', $this->supplier->id);
        $this->assertNotSame($unrelated->id, $this->supplier->id);
    }

    public function test_direct_po_uses_verified_price_date_and_snapshots_and_rejects_tampering(): void
    {
        $term = $this->term();
        $date = today(Supplier::BUSINESS_TIMEZONE)->addDays(5)->toDateString();
        $payload = $this->poPayload($term, $date);

        $this->actingAs($this->admin)->postJson('/api/purchase-orders', [...$payload, 'items' => [[...$payload['items'][0], 'unit_price' => '1.00']]])
            ->assertUnprocessable()->assertJsonValidationErrors('items');
        $created = $this->postJson('/api/purchase-orders', $payload)->assertCreated()
            ->assertJsonPath('supplier_id', $this->supplier->id)->assertJsonPath('expected_delivery_date', $date)
            ->assertJsonPath('items.0.unit_price', 125.5)->assertJsonPath('items.0.total_price', 3137.5);
        $itemId = $created->json('items.0.id');
        $this->assertDatabaseHas('purchase_order_items', ['id' => $itemId, 'supplier_product_purchasing_term_id' => $term->id, 'price_source' => 'SUPPLIER_AGREEMENT', 'unit_price' => '125.50', 'agreement_reference' => 'AGR-001']);

        $this->putJson("/api/suppliers/{$this->supplier->id}/purchasing-terms/{$term->id}", [...$this->payload(), 'agreed_unit_price' => '140.00'])
            ->assertUnprocessable()->assertJsonValidationErrors('agreement');

        $term->update(['agreed_unit_price' => '140.00', 'status' => SupplierProductPurchasingTerm::STATUS_INACTIVE]);
        $this->assertDatabaseHas('purchase_order_items', ['id' => $itemId, 'unit_price' => '125.50']);
    }

    public function test_quantity_rules_expiry_inactive_supplier_and_stale_date_are_blocked(): void
    {
        $term = $this->term();
        $this->actingAs($this->admin)->postJson('/api/purchase-orders/purchasing-options', ['items' => [['product_id' => $this->product->id, 'ordered_quantity' => 21]]])
            ->assertOk()->assertJsonPath('data.suppliers.0.can_create', false);

        $payload = $this->poPayload($term, today()->addDays(99)->toDateString());
        $this->postJson('/api/purchase-orders', $payload)->assertUnprocessable()->assertJsonValidationErrors('expected_delivery_date');
        $term->update(['effective_until' => today()->subDay()]);
        $this->postJson('/api/purchase-orders/purchasing-options', ['items' => [['product_id' => $this->product->id, 'ordered_quantity' => 25]]])
            ->assertOk()->assertJsonCount(0, 'data.suppliers');
        $term->update(['effective_until' => null]);
        $this->supplier->update(['status' => Supplier::STATUS_ON_HOLD]);
        $this->postJson('/api/purchase-orders/purchasing-options', ['items' => [['product_id' => $this->product->id, 'ordered_quantity' => 25]]])
            ->assertOk()->assertJsonCount(0, 'data.suppliers');
    }

    public function test_business_days_and_multi_line_delivery_conflict_are_explicit(): void
    {
        $term = $this->term(['lead_time_basis' => SupplierProductPurchasingTerm::BUSINESS_DAYS, 'delivery_lead_time_days' => 1]);
        $friday = \Illuminate\Support\Carbon::parse('2026-11-06', Supplier::BUSINESS_TIMEZONE);
        $this->assertSame('2026-11-09', app(\App\Services\PurchasingTermResolver::class)->expectedDate($term, $friday));

        $other = Product::create(['name' => 'Different Lead Product', 'unit' => 'DRUM']);
        $this->supplier->products()->attach($other->id, ['is_primary' => false]);
        $this->term(['product_id' => $other->id, 'delivery_lead_time_days' => 7, 'agreement_reference' => 'AGR-DIFFERENT']);
        $this->actingAs($this->admin)->postJson('/api/purchase-orders/purchasing-options', ['items' => [
            ['product_id' => $this->product->id, 'ordered_quantity' => 25], ['product_id' => $other->id, 'ordered_quantity' => 25],
        ]])->assertOk()->assertJsonPath('data.suppliers.0.can_create', false)
            ->assertJsonPath('data.suppliers.0.validation_message', 'Selected products have different contractual delivery dates. Create separate supplier-specific Purchase Orders.');
    }

    private function payload(): array
    {
        return ['product_id' => $this->product->id, 'agreed_unit_price' => '125.50', 'currency' => 'PHP',
            'delivery_lead_time_days' => 5, 'lead_time_basis' => 'CALENDAR_DAYS', 'lead_time_start_event' => 'PO_APPROVAL',
            'minimum_order_quantity' => 20, 'order_multiple' => 5, 'maximum_order_quantity' => 100,
            'effective_from' => today()->subDay()->toDateString(), 'effective_until' => null, 'status' => 'ACTIVE', 'agreement_reference' => 'AGR-001'];
    }

    private function term(array $overrides = []): SupplierProductPurchasingTerm
    {
        $values = [...$this->payload(), ...$overrides];
        $product = Product::findOrFail($values['product_id']);
        return SupplierProductPurchasingTerm::create([...$values, 'supplier_id' => $this->supplier->id, 'unit' => $product->unit, 'verified_by' => $this->admin->id, 'verified_at' => now()]);
    }

    private function poPayload(SupplierProductPurchasingTerm $term, string $date): array
    {
        return ['supplier_id' => $this->supplier->id, 'expected_delivery_date' => $date, 'delivery_details' => 'Main warehouse',
            'items' => [['product_id' => $this->product->id, 'product_name' => $this->product->name, 'ordered_quantity' => 25, 'unit_price' => '125.50', 'purchasing_term_id' => $term->id]]];
    }

    private function eligibleSupplier(string $code, string $name): Supplier
    {
        $supplier = Supplier::create(['supplier_code' => $code, 'name' => $name, 'status' => Supplier::STATUS_ACTIVE, 'payment_terms' => 'Net 15',
            'accreditation_status' => 'ACTIVE', 'supply_category' => 'Chemicals', 'accredited_at' => now()->subDay(), 'accreditation_expires_on' => now()->addYear()]);
        $application = SupplierApplication::create(['application_number' => 'APP-'.$code, 'company_name' => $name, 'normalized_company_name' => strtolower($name),
            'address' => 'Manila', 'contact_person' => 'Contact', 'email' => strtolower($code).'@example.test', 'normalized_email' => strtolower($code).'@example.test',
            'phone' => '09170000000', 'business_type' => 'Corporation', 'supply_category' => 'Chemicals', 'status' => SupplierApplication::STATUS_APPROVED,
            'submitted_at' => now(), 'approved_supplier_id' => $supplier->id]);
        foreach ([SupplierApplicationAttachment::TYPE_BUSINESS_CERTIFICATE, SupplierApplicationAttachment::TYPE_BUSINESS_PERMIT] as $type) {
            $application->attachments()->create(['attachment_type' => $type, 'original_name' => strtolower($type).'.pdf', 'stored_path' => "tests/{$supplier->id}/{$type}.pdf",
                'mime_type' => 'application/pdf', 'file_size' => 10, 'is_current' => true, 'verification_status' => SupplierApplicationAttachment::STATUS_VERIFIED,
                'verified_at' => now(), 'expires_on' => now()->addYear()]);
        }
        return $supplier;
    }
}
