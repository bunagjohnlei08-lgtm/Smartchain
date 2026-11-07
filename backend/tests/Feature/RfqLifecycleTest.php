<?php

namespace Tests\Feature;

use App\Models\{Branch, Product, ReplenishmentRequest, Rfq, Role, User, Warehouse};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class RfqLifecycleTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_draft_persists_all_configuration_and_multiple_products(): void
    {
        [$admin, $requester, $warehouse] = $this->actors();
        $requirements = collect([
            $this->requirement($requester, $warehouse, 'SPIK N SPAN', 'PCS', 5),
            $this->requirement($requester, $warehouse, 'Industrial Solvent', 'DRUM', 2),
        ]);
        $payload = $this->payload($requirements);

        $response = $this->actingAs($admin)->postJson('/api/admin/procurement/rfqs', $payload)
            ->assertCreated()->assertJsonPath('data.status', Rfq::DRAFT);

        $rfq = Rfq::with('lines')->findOrFail($response->json('data.id'));
        $this->assertSame('Complete lifecycle test', $rfq->title);
        $this->assertSame(['Active accreditation'], $rfq->eligibility_criteria);
        $this->assertSame([['name' => 'Price', 'weight' => 100]], $rfq->evaluation_criteria);
        $this->assertCount(2, $rfq->lines);
        $this->assertSame([2, 5], $rfq->lines->pluck('required_quantity')->sort()->values()->all());
    }

    public function test_valid_submission_is_idempotent_and_incomplete_or_expired_drafts_are_rejected(): void
    {
        [$admin, $requester, $warehouse] = $this->actors();
        $rfq = $this->draft($admin, $this->requirement($requester, $warehouse));

        $url = "/api/admin/procurement/rfqs/{$rfq->id}/submit";
        $this->actingAs($admin)->postJson($url)->assertOk()->assertJsonPath('data.status', Rfq::PENDING_APPROVAL);
        $this->actingAs($admin)->postJson($url)->assertOk()->assertJsonPath('data.status', Rfq::PENDING_APPROVAL);
        $this->assertDatabaseCount('audit_logs', 1);

        $empty = Rfq::create($this->rfqAttributes($admin, 'RFQ-EMPTY'));
        $this->actingAs($admin)->postJson("/api/admin/procurement/rfqs/{$empty->id}/submit")->assertStatus(422);

        $expired = $this->draft($admin, $this->requirement($requester, $warehouse, 'Expired Item'), 'RFQ-EXPIRED');
        $expired->update(['opens_at' => now()->subHours(2), 'closes_at' => now()->subHour()]);
        $this->actingAs($admin)->postJson("/api/admin/procurement/rfqs/{$expired->id}/submit")
            ->assertStatus(422)->assertJsonPath('message', 'The RFQ deadline has passed. Update the draft with a future deadline before submitting or approving it.');
    }

    public function test_only_an_admin_can_approve_and_publication_requires_approval(): void
    {
        [$admin, $requester, $warehouse] = $this->actors();
        $rfq = $this->draft($admin, $this->requirement($requester, $warehouse));
        $rfq->update(['status' => Rfq::PENDING_APPROVAL]);

        $this->actingAs($requester)->postJson("/api/admin/procurement/rfqs/{$rfq->id}/approve")->assertForbidden();
        $this->actingAs($admin)->postJson("/api/admin/procurement/rfqs/{$rfq->id}/approve")
            ->assertOk()->assertJsonPath('data.status', Rfq::SCHEDULED);
        $this->assertNotNull($rfq->fresh()->approved_at);

        $unapproved = $this->draft($admin, $this->requirement($requester, $warehouse, 'Unapproved Item'), 'RFQ-UNAPPROVED');
        $this->actingAs($admin)->postJson("/api/admin/procurement/rfqs/{$unapproved->id}/publish")->assertStatus(422);
        $this->assertNull($unapproved->fresh()->published_at);
    }

    public function test_approved_rfq_can_be_published_and_is_visible_only_in_its_window(): void
    {
        Carbon::setTestNow('2026-10-26 12:00:00 UTC');
        [$admin, $requester, $warehouse] = $this->actors();
        $rfq = $this->draft($admin, $this->requirement($requester, $warehouse));
        $rfq->update(['status' => Rfq::SCHEDULED, 'approved_by' => $admin->id, 'approved_at' => now()]);

        $this->actingAs($admin)->postJson("/api/admin/procurement/rfqs/{$rfq->id}/publish")
            ->assertOk()->assertJsonPath('data.status', Rfq::SCHEDULED);
        $publishedAt = $rfq->fresh()->published_at;
        $this->actingAs($admin)->postJson("/api/admin/procurement/rfqs/{$rfq->id}/publish")
            ->assertUnprocessable()->assertJsonPath('message', 'Only a complete approved, unpublished RFQ can be published.');
        $this->assertTrue($publishedAt->equalTo($rfq->fresh()->published_at));
        $this->getJson('/api/public/rfqs')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.rfq_number', $rfq->rfq_number)
            ->assertJsonPath('data.0.lines.0.required_quantity', 5)
            ->assertJsonMissingPath('data.0.procurement_remarks')
            ->assertJsonMissingPath('data.0.lines.0.supplier_id');

        Carbon::setTestNow('2026-10-26 13:01:00 UTC');
        $this->getJson('/api/public/rfqs')->assertOk()->assertJsonPath('data.0.status', Rfq::OPEN)
            ->assertJsonPath('data.0.bidding_available', true);

        Carbon::setTestNow('2026-10-27 13:01:00 UTC');
        $this->getJson('/api/public/rfqs')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_draft_is_excluded_from_public_results(): void
    {
        [$admin, $requester, $warehouse] = $this->actors();
        $this->draft($admin, $this->requirement($requester, $warehouse));
        $this->getJson('/api/public/rfqs')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_resolved_destination_is_saved_for_single_and_multi_product_drafts_and_history_is_preserved(): void
    {
        [$admin, $requester, $warehouse] = $this->actors();
        $warehouse->update(['code'=>'WH-PAMP', 'address'=>'Original configured address', 'status'=>'Active']);
        foreach ([1, 2] as $lineCount) {
            $requirements = collect();
            for ($index = 0; $index < $lineCount; $index++) {
                $requirements->push($this->requirement($requester, $warehouse, "Destination item {$lineCount}-{$index}"));
            }
            $destination = $this->actingAs($admin)->getJson('/api/admin/procurement/rfq-requirements')
                ->assertOk()->json('delivery_destination.address');
            $payload = $this->payload($requirements);
            $payload['delivery_destination'] = $destination;
            $id = $this->postJson('/api/admin/procurement/rfqs', $payload)->assertCreated()
                ->assertJsonPath('data.delivery_destination', 'Original configured address')->json('data.id');
            $this->assertDatabaseHas('rfqs', ['id'=>$id, 'delivery_destination'=>'Original configured address']);
            $this->assertSame($lineCount, Rfq::findOrFail($id)->lines()->count());
        }
        $warehouse->update(['address'=>'New configured address']);
        $this->getJson('/api/admin/procurement/rfq-requirements')->assertOk()
            ->assertJsonPath('delivery_destination.address', 'New configured address');
        $this->getJson("/api/admin/procurement/rfqs/{$id}")->assertOk()
            ->assertJsonPath('data.delivery_destination', 'Original configured address');
        $payload['version'] = 1;
        $payload['title'] = 'Existing draft retains its destination';
        $this->putJson("/api/admin/procurement/rfqs/{$id}", $payload)->assertOk()
            ->assertJsonPath('data.delivery_destination', 'Original configured address');
        $this->assertSame(2, Rfq::where('delivery_destination', 'Original configured address')->count());
    }

    public function test_missing_destination_still_blocks_draft_creation(): void
    {
        [$admin, $requester, $warehouse] = $this->actors();
        $payload = $this->payload(collect([$this->requirement($requester, $warehouse)]));
        $payload['delivery_destination'] = '';
        $this->actingAs($admin)->postJson('/api/admin/procurement/rfqs', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('delivery_destination');
        $this->assertDatabaseCount('rfqs', 0);
    }

    public function test_package_unit_casing_is_canonical_at_rfq_boundaries_without_rewriting_catalog(): void
    {
        [$admin, $requester, $warehouse] = $this->actors();
        $units = ['PCS', 'pcs', 'SACK', 'sack', 'DRUM', 'drum'];
        $requirements = collect($units)->map(fn ($unit, $index) => $this->requirement($requester, $warehouse, 'Unit Product '.$index, $unit));
        $payload = $this->payload($requirements);
        $payload['lines'][0]['unit'] = ' pcs ';
        $this->actingAs($admin);
        $eligible = collect($this->getJson('/api/admin/procurement/rfq-requirements')->assertOk()->json('data'))->keyBy('id');
        foreach ($requirements as $requirement) {
            $this->assertSame(strtoupper($requirement->product->unit), $eligible[$requirement->id]['unit']);
        }
        $id = $this->postJson('/api/admin/procurement/rfqs', $payload)->assertCreated()
            ->assertJsonPath('data.status', Rfq::DRAFT)->json('data.id');
        $this->assertEqualsCanonicalizing(['PCS', 'PCS', 'SACK', 'SACK', 'DRUM', 'DRUM'], Rfq::findOrFail($id)->lines->pluck('unit')->all());
        foreach ($requirements as $index => $requirement) {
            $this->assertSame($units[$index], $requirement->product->fresh()->unit);
            $this->assertSame(5, (int) $requirement->fresh()->requested_qty);
        }
        $this->postJson('/api/admin/procurement/rfqs', $payload)->assertUnprocessable();
        $this->assertDatabaseCount('rfqs', 1);
        $payload['version'] = 1;
        $this->putJson("/api/admin/procurement/rfqs/{$id}", $payload)->assertOk()->assertJsonPath('data.status', Rfq::DRAFT);
        $this->assertDatabaseCount('rfqs', 1);
    }

    public function test_unit_mismatches_and_unrecognized_units_remain_rejected_with_no_draft(): void
    {
        [$admin, $requester, $warehouse] = $this->actors();
        $requirement = $this->requirement($requester, $warehouse, 'Authoritative PCS Product', 'PCS');
        foreach (['SACK', 'DRUM', 'KG', 'L', 'BULK'] as $wrongUnit) {
            $payload = $this->payload(collect([$requirement]));
            $payload['lines'][0]['unit'] = $wrongUnit;
            $response = $this->actingAs($admin)->postJson('/api/admin/procurement/rfqs', $payload)
                ->assertUnprocessable()->assertJsonValidationErrors('lines.0.unit');
            if ($wrongUnit !== 'BULK') {
                $this->assertStringContainsString('Expected PCS', $response->json('errors')['lines.0.unit'][0]);
                $this->assertStringContainsString($requirement->product->name, $response->json('errors')['lines.0.unit'][0]);
            }
        }
        $this->assertDatabaseCount('rfqs', 0);
        $this->assertSame('PCS', $requirement->product->fresh()->unit);
    }

    public function test_stale_catalog_and_legacy_units_cannot_be_converted_by_rfq_submission(): void
    {
        [$admin, $requester, $warehouse] = $this->actors();
        $this->actingAs($admin);
        foreach (['KG' => 'SACK', 'L' => 'DRUM'] as $catalogUnit => $submittedUnit) {
            $requirement = $this->requirement($requester, $warehouse, 'Legacy '.$catalogUnit, $catalogUnit);
            $payload = $this->payload(collect([$requirement]));
            $payload['lines'][0]['unit'] = $submittedUnit;
            $response = $this->postJson('/api/admin/procurement/rfqs', $payload)->assertUnprocessable()->assertJsonValidationErrors('lines.0.unit');
            $this->assertStringContainsString('Expected '.$catalogUnit, $response->json('errors')['lines.0.unit'][0]);
            $this->assertSame($catalogUnit, $requirement->product->fresh()->unit);
        }
        $requirement = $this->requirement($requester, $warehouse, 'Changed Catalog Product', 'PCS');
        $payload = $this->payload(collect([$requirement]));
        $requirement->product->update(['unit' => 'DRUM']);
        $response = $this->postJson('/api/admin/procurement/rfqs', $payload)->assertUnprocessable()->assertJsonValidationErrors('lines.0.unit');
        $this->assertStringContainsString('Expected DRUM', $response->json('errors')['lines.0.unit'][0]);
        $payload['lines'][0]['unit'] = 'DRUM';
        $payload['lines'][0]['required_quantity'] = 99;
        $this->postJson('/api/admin/procurement/rfqs', $payload)->assertUnprocessable()->assertJsonValidationErrors('lines.0.required_quantity');
        $this->assertDatabaseCount('rfqs', 0);
    }

    private function actors(): array
    {
        $adminRole = Role::firstOrCreate(['slug' => 'ADMIN'], ['name' => 'Admin']);
        $managerRole = Role::firstOrCreate(['slug' => 'PLANT_MANAGER'], ['name' => 'Plant Manager']);
        $admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        $requester = User::factory()->create(['role_id' => $managerRole->id, 'status' => 'ACTIVE']);
        $branch = Branch::create(['name' => 'Lifecycle Branch', 'code' => 'RFQLIFE']);
        $warehouse = Warehouse::create(['name' => 'Lifecycle Warehouse', 'code' => 'RFQ-LIFE-WH', 'branch_id' => $branch->id]);
        return [$admin, $requester, $warehouse];
    }

    private function requirement(User $requester, Warehouse $warehouse, string $name = 'SPIK N SPAN', string $unit = 'PCS', int $quantity = 5): ReplenishmentRequest
    {
        $product = Product::create(['name' => $name, 'category' => 'SUPPLIES', 'unit' => $unit, 'item_classification' => Product::RAW_MATERIAL]);
        return ReplenishmentRequest::create(['request_no' => 'RR-'.strtoupper(fake()->unique()->bothify('????####')), 'requested_by' => $requester->id, 'warehouse_id' => $warehouse->id, 'product_id' => $product->id, 'requested_qty' => $quantity, 'priority' => 'High', 'status' => ReplenishmentRequest::STATUS_FOR_PURCHASE_ORDER, 'sourcing_method' => ReplenishmentRequest::SOURCING_COMPETITIVE, 'submitted_at' => now(), 'reviewed_at' => now()]);
    }

    private function draft(User $admin, ReplenishmentRequest $requirement, string $number = 'RFQ-LIFECYCLE'): Rfq
    {
        $rfq = Rfq::create($this->rfqAttributes($admin, $number));
        $rfq->lines()->create(['replenishment_request_id' => $requirement->id, 'product_id' => $requirement->product_id, 'product_name' => $requirement->product->name, 'category' => $requirement->product->category, 'unit' => $requirement->product->unit, 'required_quantity' => $requirement->requested_qty, 'public_specification' => 'Factory sealed product', 'publish_reference_price' => false]);
        return $rfq;
    }

    private function rfqAttributes(User $admin, string $number): array
    {
        return ['rfq_number' => $number, 'title' => 'Complete lifecycle test', 'status' => Rfq::DRAFT, 'opens_at' => now()->addHour(), 'closes_at' => now()->addDay(), 'required_delivery_date' => now()->addDays(3)->toDateString(), 'delivery_destination' => 'Lifecycle Warehouse', 'partial_offers_allowed' => true, 'split_awards_allowed' => false, 'minimum_decrement' => '1.00', 'currency' => 'PHP', 'show_reference_price' => false, 'show_lowest_bid' => false, 'eligibility_criteria' => ['Active accreditation'], 'mandatory_compliance' => ['Exact specification'], 'evaluation_criteria' => [['name' => 'Price', 'weight' => 100]], 'procurement_remarks' => 'Internal only', 'created_by' => $admin->id];
    }

    private function payload($requirements): array
    {
        $first = $requirements->first();
        return [...collect($this->rfqAttributes(User::findOrFail($first->requested_by), 'unused'))->except(['rfq_number', 'status', 'created_by'])->all(), 'lines' => $requirements->map(fn (ReplenishmentRequest $requirement) => ['replenishment_request_id' => $requirement->id, 'product_id' => $requirement->product_id, 'unit' => $requirement->product->unit, 'required_quantity' => $requirement->requested_qty, 'public_specification' => 'Factory sealed product', 'reference_unit_price' => null, 'publish_reference_price' => false])->all()];
    }
}
