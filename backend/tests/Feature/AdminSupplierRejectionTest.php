<?php

namespace Tests\Feature;

use App\Mail\SupplierRejectionMail;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\QaInspection;
use App\Models\QaInspectionAttachment;
use App\Models\QaInspectionItem;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierAlias;
use App\Models\SupplierRejectionCase;
use App\Models\User;
use App\Support\PurchaseOrderSupplier;
use App\Support\SupplierRejectionPdf;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AdminSupplierRejectionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $qa;
    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $qaRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $this->admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE']);
        $this->qa = User::factory()->create(['role_id' => $qaRole->id, 'status' => 'ACTIVE']);
        $this->manager = User::factory()->create(['role_id' => $managerRole->id, 'status' => 'ACTIVE']);
    }

    private function rejectedCase(bool $registeredSupplier = true): SupplierRejectionCase
    {
        $supplier = $registeredSupplier
            ? Supplier::create(['supplier_code' => 'SUP-001', 'name' => 'Original Supplier', 'email' => 'supplier@example.com', 'status' => 'ACTIVE'])
            : null;
        $po = PurchaseOrder::create([
            'po_number' => 'PO-2026-0099', 'supplier_id' => $supplier?->id, 'supplier_name' => 'Original Supplier',
            'delivery_details' => 'Main warehouse', 'expected_delivery_date' => now()->addDay()->toDateString(),
            'total_amount' => 100, 'status' => 'Sent to Supplier', 'approved_by' => $this->admin->id,
        ]);
        $product = Product::create(['name' => 'Damaged Product', 'unit' => 'pcs', 'cost_price' => 100]);
        $receiving = Receiving::create([
            'receiving_no' => 'RCV-CASE-1', 'purchase_order_id' => $po->id, 'purchase_order' => $po->po_number,
            'supplier' => 'Untrusted Snapshot Name', 'delivery_date' => now()->toDateString(), 'status' => 'Partial',
            'assigned_qa_user_id' => $this->qa->id, 'prepared_by_id' => $this->manager->id,
        ]);
        $receivingItem = ReceivingItem::create([
            'receiving_id' => $receiving->id, 'product_id' => $product->id, 'product_name' => $product->name,
            'delivered_quantity' => 5, 'unit' => 'pcs', 'inspection_status' => 'Partial',
        ]);
        $inspection = QaInspection::create([
            'receiving_id' => $receiving->id, 'status' => 'Partial', 'started_at' => now()->subHour(),
            'completed_at' => now(), 'inspected_by_id' => $this->qa->id, 'submitted_by_id' => $this->qa->id,
        ]);
        $item = QaInspectionItem::create([
            'qa_inspection_id' => $inspection->id, 'receiving_item_id' => $receivingItem->id,
            'accepted_quantity' => 3, 'rejected_quantity' => 2, 'inspection_result' => 'Partial',
            'remarks' => 'Outer casing cracked.',
        ]);
        return SupplierRejectionCase::create(['qa_inspection_item_id' => $item->id]);
    }

    public function test_admin_list_backfills_completed_rejections_and_uses_original_po_supplier(): void
    {
        $case = $this->rejectedCase();
        $case->delete();
        $this->actingAs($this->admin)->getJson('/api/admin/rejected-items')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.supplier.name', 'Original Supplier')
            ->assertJsonPath('data.0.registered_supplier.email', 'supplier@example.com')
            ->assertJsonPath('data.0.purchase_order.number', 'PO-2026-0099')
            ->assertJsonMissingPath('data.0.attachments.0.stored_path');
    }

    public function test_zero_rejection_does_not_appear_and_sync_does_not_duplicate_cases(): void
    {
        $case = $this->rejectedCase();
        $case->inspectionItem->update(['rejected_quantity' => 0, 'accepted_quantity' => 5, 'inspection_result' => 'Passed']);
        $case->delete();
        $this->actingAs($this->admin)->getJson('/api/admin/rejected-items')->assertOk()->assertJsonCount(0, 'data');
        $case->inspectionItem->update(['rejected_quantity' => 2, 'accepted_quantity' => 3, 'inspection_result' => 'Partial']);
        $this->actingAs($this->admin)->getJson('/api/admin/rejected-items')->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($this->admin)->getJson('/api/admin/rejected-items')->assertOk()->assertJsonCount(1, 'data');
        $this->assertDatabaseCount('supplier_rejection_cases', 1);
    }

    public function test_guest_qa_and_plant_manager_cannot_access_admin_cases(): void
    {
        $case = $this->rejectedCase();
        $this->getJson('/api/admin/rejected-items')->assertUnauthorized();
        $this->actingAs($this->qa)->getJson('/api/admin/rejected-items')->assertForbidden();
        $this->actingAs($this->manager)->getJson("/api/admin/rejected-items/{$case->id}")->assertForbidden();
        $this->actingAs($this->qa)->postJson("/api/admin/rejected-items/{$case->id}/send")->assertForbidden();
        $this->actingAs($this->manager)->postJson("/api/admin/rejected-items/{$case->id}/resolve", ['resolution_notes' => 'No'])->assertForbidden();
    }

    public function test_send_ignores_request_recipient_and_emails_registered_original_supplier(): void
    {
        Mail::fake();
        $case = $this->rejectedCase();
        $this->actingAs($this->admin)->postJson("/api/admin/rejected-items/{$case->id}/send", [
            'email' => 'attacker@example.com', 'supplier_id' => 999999,
        ])->assertOk()->assertJsonPath('data.status', 'SENT');
        Mail::assertSent(SupplierRejectionMail::class, fn ($mail) => $mail->hasTo('supplier@example.com'));
        Mail::assertNotSent(SupplierRejectionMail::class, fn ($mail) => $mail->hasTo('attacker@example.com'));
        $this->assertDatabaseHas('supplier_rejection_cases', ['id' => $case->id, 'status' => 'SENT', 'sent_by_id' => $this->admin->id, 'send_attempts' => 1]);
    }

    public function test_normalized_unique_name_resolves_but_ambiguous_name_is_not_guessed(): void
    {
        $case = $this->rejectedCase();
        $po = $case->inspectionItem->inspection->receiving->purchaseOrder;
        $po->update(['supplier_id' => null, 'supplier_name' => '  ORIGINAL   SUPPLIER  ']);
        $this->actingAs($this->admin)->getJson("/api/admin/rejected-items/{$case->id}")
            ->assertOk()->assertJsonPath('data.supplier.email', 'supplier@example.com');

        Supplier::create(['supplier_code' => 'SUP-002', 'name' => ' original supplier ', 'email' => 'other@example.com', 'status' => 'ACTIVE']);
        $this->actingAs($this->admin)->postJson("/api/admin/rejected-items/{$case->id}/send")
            ->assertUnprocessable()->assertJsonPath('message', 'Original Purchase Order supplier could not be resolved to a registered Supplier. Update the Supplier aliases or Purchase Order supplier information in Supplier Management / Purchase Orders.');
    }

    public function test_alias_resolves_to_authoritative_supplier_email_for_rejection_send(): void
    {
        Mail::fake();
        $case = $this->rejectedCase();
        $supplier = Supplier::query()->sole();
        $case->inspectionItem->inspection->receiving->purchaseOrder->update(['supplier_id' => null, 'supplier_name' => 'Joey Odon Pangasinan Odon']);
        SupplierAlias::create([
            'supplier_id' => $supplier->id,
            'alias' => 'joey odon pangasinan odon',
            'normalized_alias' => 'joey odon pangasinan odon',
        ]);

        $this->actingAs($this->admin)->postJson("/api/admin/rejected-items/{$case->id}/send", ['email' => 'attacker@example.com'])
            ->assertOk()->assertJsonPath('data.supplier.email', 'supplier@example.com');
        Mail::assertSent(SupplierRejectionMail::class, fn ($mail) => $mail->hasTo('supplier@example.com') && ! $mail->hasTo('attacker@example.com'));
    }

    public function test_rejected_items_has_no_supplier_linking_endpoint(): void
    {
        $case = $this->rejectedCase();
        $supplier = Supplier::query()->sole();
        $case->inspectionItem->inspection->receiving->purchaseOrder->update(['supplier_id' => null, 'supplier_name' => 'Legacy Supplier Legal Name']);

        $this->actingAs($this->admin)->postJson("/api/admin/rejected-items/{$case->id}/link-supplier", ['supplier_id' => $supplier->id])
            ->assertNotFound();
        $this->assertDatabaseMissing('supplier_aliases', ['normalized_alias' => 'legacy supplier legal name']);
    }

    public function test_send_fails_safely_when_original_supplier_cannot_be_resolved(): void
    {
        Mail::fake();
        $case = $this->rejectedCase(false);
        $this->actingAs($this->admin)->postJson("/api/admin/rejected-items/{$case->id}/send")
            ->assertUnprocessable()->assertJsonPath('message', 'Original Purchase Order supplier could not be resolved to a registered Supplier. Update the Supplier aliases or Purchase Order supplier information in Supplier Management / Purchase Orders.');
        Mail::assertNothingSent();
    }

    public function test_missing_supplier_email_fails_without_marking_sent(): void
    {
        $case = $this->rejectedCase();
        Supplier::query()->update(['email' => null]);
        $this->actingAs($this->admin)->postJson("/api/admin/rejected-items/{$case->id}/send")
            ->assertUnprocessable()->assertJsonPath('message', 'Supplier email is unavailable.');
        $this->assertDatabaseHas('supplier_rejection_cases', ['id' => $case->id, 'status' => 'PENDING_REVIEW', 'send_attempts' => 0]);
    }

    public function test_rapid_repeat_send_is_rejected(): void
    {
        Mail::fake();
        $case = $this->rejectedCase();
        $this->actingAs($this->admin)->postJson("/api/admin/rejected-items/{$case->id}/send")->assertOk();
        $this->actingAs($this->admin)->postJson("/api/admin/rejected-items/{$case->id}/send")->assertStatus(429);
        Mail::assertSentCount(1);
    }

    public function test_failed_mail_delivery_does_not_mark_case_sent_and_remains_retryable(): void
    {
        $case = $this->rejectedCase();
        Mail::shouldReceive('to')->once()->andThrow(new \RuntimeException('provider unavailable'));

        $this->actingAs($this->admin)->postJson("/api/admin/rejected-items/{$case->id}/send")
            ->assertStatus(502);

        $case->refresh();
        $this->assertSame('FAILED', $case->status);
        $this->assertNull($case->sent_at);
        $this->assertSame(1, $case->send_attempts);
    }

    public function test_admin_can_resolve_once_with_required_notes(): void
    {
        $case = $this->rejectedCase();
        $case->update(['status' => 'SENT', 'sent_at' => now()->subMinutes(5), 'sent_by_id' => $this->admin->id]);
        $this->actingAs($this->admin)->postJson("/api/admin/rejected-items/{$case->id}/resolve", ['resolution_type' => 'NO_REPLACEMENT', 'resolution_notes' => 'Supplier issued credit.'])
            ->assertOk()->assertJsonPath('data.status', 'RESOLVED');
        $this->actingAs($this->admin)->postJson("/api/admin/rejected-items/{$case->id}/resolve", ['resolution_type' => 'NO_REPLACEMENT', 'resolution_notes' => 'Again'])
            ->assertUnprocessable();
        $this->actingAs($this->admin)->postJson("/api/admin/rejected-items/{$case->id}/send")->assertUnprocessable();
    }

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    private function attachEvidence(SupplierRejectionCase $case, string $originalName, string $storedPath, string $mime, ?string $bytes): void
    {
        if ($bytes !== null) Storage::disk('local')->put($storedPath, $bytes);
        QaInspectionAttachment::create([
            'qa_inspection_id' => $case->inspectionItem->qa_inspection_id, 'original_name' => $originalName,
            'stored_path' => $storedPath, 'mime_type' => $mime, 'file_size' => 430000, 'uploaded_by' => $this->qa->id,
        ]);
    }

    private function reportHtml(SupplierRejectionCase $case): string
    {
        $case = $case->fresh();
        $evidence = app(SupplierRejectionPdf::class)->evidenceFor($case);
        return view('pdf.supplier-rejection', ['case' => $case, 'supplier' => Supplier::query()->sole(), 'evidence' => $evidence])->render();
    }

    public function test_report_embeds_actual_image_evidence_with_original_filenames_only(): void
    {
        Storage::fake('local');
        $case = $this->rejectedCase();
        $this->attachEvidence($case, 'Damage-front.png', 'qa-attachments/Xk9aG3generatedA.png', 'image/png', base64_decode(self::PNG));
        $this->attachEvidence($case, 'damaged-item-side.png', 'qa-attachments/Zq7bH2generatedB.png', 'image/png', base64_decode(self::PNG));

        $html = $this->reportHtml($case);

        $this->assertSame(2, substr_count($html, 'src="data:image/png;base64,'));
        $this->assertStringContainsString('Damage-front.png', $html);
        $this->assertStringContainsString('damaged-item-side.png', $html);
        $this->assertStringContainsString('0.41 MB', $html);
        $this->assertStringNotContainsString('qa-attachments', $html);
        $this->assertStringNotContainsString('generatedA', $html);
        $this->assertStringNotContainsString('/storage/', $html);
        $this->assertStringStartsWith('%PDF', app(SupplierRejectionPdf::class)->render($case->fresh(), Supplier::query()->sole()));
    }

    public function test_missing_evidence_file_and_pdf_evidence_render_safely(): void
    {
        Storage::fake('local');
        Log::spy();
        $case = $this->rejectedCase();
        $this->attachEvidence($case, 'lost-photo.png', 'qa-attachments/missingGenerated.png', 'image/png', null);
        $this->attachEvidence($case, 'inspection-document.pdf', 'qa-attachments/docGenerated.pdf', 'application/pdf', "%PDF-1.4\n%%EOF");

        $html = $this->reportHtml($case);

        $this->assertStringContainsString('Evidence unavailable', $html);
        $this->assertStringContainsString('lost-photo.png', $html);
        $this->assertStringContainsString('PDF Evidence', $html);
        $this->assertStringContainsString('inspection-document.pdf', $html);
        $this->assertStringNotContainsString('data:image', $html);
        $this->assertStringNotContainsString('qa-attachments', $html);
        Log::shouldHaveReceived('warning')->withArgs(fn ($message, $context = []) => str_contains($message, 'unavailable')
            && ! str_contains((string) json_encode($context), 'qa-attachments'))->once();
        $this->assertStringStartsWith('%PDF', app(SupplierRejectionPdf::class)->render($case->fresh(), Supplier::query()->sole()));
    }

    public function test_sent_email_attaches_generated_report_containing_the_evidence(): void
    {
        Storage::fake('local');
        Mail::fake();
        $case = $this->rejectedCase();
        $this->attachEvidence($case, 'Damage-front.png', 'qa-attachments/generated.png', 'image/png', base64_decode(self::PNG));

        $this->actingAs($this->admin)->postJson("/api/admin/rejected-items/{$case->id}/send")->assertOk();

        Mail::assertSent(SupplierRejectionMail::class, function (SupplierRejectionMail $mail) use ($case) {
            $attachments = $mail->attachments();
            if (count($attachments) !== 1 || $attachments[0]->as !== SupplierRejectionPdf::filename($case)) return false;
            $bytes = $attachments[0]->attachWith(fn () => null, fn ($data) => $data());
            return str_starts_with($bytes, '%PDF') && $mail->hasTo('supplier@example.com');
        });
    }

    public function test_detail_resolves_recipient_from_po_supplier_id_not_snapshot_name(): void
    {
        $case = $this->rejectedCase();
        $case->inspectionItem->inspection->receiving->purchaseOrder->update(['supplier_name' => 'Old Snapshot Name Inc']);

        $this->actingAs($this->admin)->getJson("/api/admin/rejected-items/{$case->id}")->assertOk()
            ->assertJsonPath('data.original_supplier_name', 'Old Snapshot Name Inc')
            ->assertJsonPath('data.registered_supplier', ['name' => 'Original Supplier', 'code' => 'SUP-001', 'email' => 'supplier@example.com'])
            ->assertJsonPath('data.can_send', true)
            ->assertJsonMissingPath('data.supplier_options');
    }

    public function test_unresolved_supplier_blocks_send_without_offering_a_chooser(): void
    {
        $case = $this->rejectedCase(false);
        $this->actingAs($this->admin)->getJson("/api/admin/rejected-items/{$case->id}")->assertOk()
            ->assertJsonPath('data.can_send', false)
            ->assertJsonPath('data.registered_supplier', null)
            ->assertJsonPath('data.supplier.email', null)
            ->assertJsonMissingPath('data.supplier_options');
    }

    public function test_supplier_id_backfill_links_only_unique_exact_matches(): void
    {
        $joey = Supplier::create(['supplier_code' => 'SUP-010', 'name' => 'joey odon', 'email' => 'joey@example.com', 'status' => 'ACTIVE']);
        SupplierAlias::create(['supplier_id' => $joey->id, 'alias' => 'joey odon pangasinan odon', 'normalized_alias' => 'joey odon pangasinan odon']);
        Supplier::create(['supplier_code' => 'SUP-011', 'name' => 'Twin Corp', 'email' => 'a@example.com', 'status' => 'ACTIVE']);
        Supplier::create(['supplier_code' => 'SUP-012', 'name' => ' twin  corp ', 'email' => 'b@example.com', 'status' => 'ACTIVE']);

        $make = fn (string $number, string $name) => PurchaseOrder::create([
            'po_number' => $number, 'supplier_name' => $name, 'delivery_details' => 'Main warehouse',
            'expected_delivery_date' => now()->addDay()->toDateString(), 'total_amount' => 1, 'status' => 'Sent to Supplier', 'approved_by' => $this->admin->id,
        ]);
        $exact = $make('PO-B-1', '  JOEY   ODON ');
        $alias = $make('PO-B-2', 'Joey Odon Pangasinan Odon');
        $partial = $make('PO-B-3', 'joey');
        $superset = $make('PO-B-4', 'joey odon trading');
        $ambiguous = $make('PO-B-5', 'twin corp');
        $unknown = $make('PO-B-6', 'Nobody Supplies');

        $resolver = app(PurchaseOrderSupplier::class);
        $this->assertSame(2, $resolver->backfillMissingSupplierIds());
        $this->assertSame(0, $resolver->backfillMissingSupplierIds());

        $this->assertSame($joey->id, $exact->fresh()->supplier_id);
        $this->assertSame('  JOEY   ODON ', $exact->fresh()->supplier_name);
        $this->assertSame($joey->id, $alias->fresh()->supplier_id);
        foreach ([$partial, $superset, $ambiguous, $unknown] as $order) {
            $this->assertNull($order->fresh()->supplier_id);
        }
    }
}
