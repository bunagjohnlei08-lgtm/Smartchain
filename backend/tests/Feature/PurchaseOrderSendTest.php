<?php

namespace Tests\Feature;

use App\Mail\PurchaseOrderMail;
use App\Models\AuditLog;
use App\Models\PurchaseOrder;
use App\Models\Product;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Support\BrevoTransactionalMail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;
use Throwable;

class PurchaseOrderSendTest extends TestCase
{
    use RefreshDatabase;

    private const FAKE_KEY = 'test-brevo-key-not-a-real-secret';

    private User $admin;
    private Supplier $supplier;
    private PurchaseOrder $order;

    protected function setUp(): void
    {
        parent::setUp();

        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $this->admin = User::factory()->create(['role_id' => $adminRole->id, 'status' => 'ACTIVE', 'name' => 'Ada Admin']);

        $this->supplier = Supplier::create([
            'supplier_code' => 'SUP-900', 'name' => 'Acme Chemicals', 'email' => 'orders@acme.test', 'status' => 'ACTIVE',
        ]);
        Product::create(['name' => 'TOMAHAWK EC', 'unit' => 'pcs', 'cost_price' => 250]);
        $this->order = $this->purchaseOrder('PO-2026-0019', 'Acme Chemicals');
    }

    private function purchaseOrder(string $number, string $supplierName, string $status = 'Approved'): PurchaseOrder
    {
        $order = PurchaseOrder::create([
            'po_number' => $number,
            'supplier_id' => $supplierName === $this->supplier->name ? $this->supplier->id : null,
            'supplier_name' => $supplierName,
            'delivery_details' => 'Deliver to Main Warehouse',
            'expected_delivery_date' => now()->addWeek()->toDateString(),
            'total_amount' => 2500,
            'status' => $status,
            'approved_by' => $this->admin->id,
        ]);
        $order->items()->create(['product_name' => 'TOMAHAWK EC', 'ordered_quantity' => 10, 'unit_price' => 250, 'total_price' => 2500]);

        return $order;
    }

    private function send(?PurchaseOrder $order = null, array $body = [])
    {
        return $this->actingAs($this->admin)->patchJson('/api/purchase-orders/'.($order ?? $this->order)->id.'/send', $body);
    }

    private function attachmentData(Attachment $attachment): string
    {
        return $attachment->attachWith(fn () => null, fn ($data) => $data());
    }

    /** A real PDF whose document title (stored UTF-16BE by dompdf) is the PO number. */
    private function assertPdfForOrder(string $pdf, string $poNumber): void
    {
        $this->assertStringStartsWith('%PDF-', $pdf);
        $this->assertStringContainsString('/Title ('."\xFE\xFF".mb_convert_encoding($poNumber, 'UTF-16BE', 'UTF-8').')', $pdf);
    }

    private function useBrevo(): void
    {
        config([
            'mail.default' => 'brevo',
            'services.brevo.api_key' => self::FAKE_KEY,
            'services.brevo.sender_email' => 'no-reply@smartchain.test',
        ]);
        Mail::purge('brevo');
    }

    public function test_admin_sends_po_to_the_supplier_email_with_its_pdf_attached(): void
    {
        Mail::fake();

        $this->send()
            ->assertOk()
            ->assertJsonPath('status', 'Sent to Supplier')
            ->assertJsonPath('message', 'Purchase order sent to supplier successfully.');

        Mail::assertSent(PurchaseOrderMail::class, function (PurchaseOrderMail $mail) {
            $this->assertTrue($mail->hasTo('orders@acme.test'));
            $this->assertCount(1, $mail->to);
            $this->assertSame('SmartChain Purchase Order PO-2026-0019', $mail->envelope()->subject);

            $attachments = $mail->attachments();
            $this->assertCount(1, $attachments);
            $this->assertSame('PO-2026-0019.pdf', $attachments[0]->as);
            $this->assertSame('application/pdf', $attachments[0]->mime);
            $this->assertPdfForOrder($this->attachmentData($attachments[0]), 'PO-2026-0019');

            $html = $mail->render();
            $this->assertStringContainsString('Hello Acme Chemicals', $html);
            $this->assertStringContainsString('Purchase Order PO-2026-0019 from Archon Nell Incorporated', $html);

            return true;
        });

        $this->order->refresh();
        $this->assertSame('Sent to Supplier', $this->order->status);
        $this->assertNotNull($this->order->sent_at);

        $log = AuditLog::query()->where('action', 'PO_SENT_TO_SUPPLIER')->sole();
        $this->assertSame(AuditLog::STATUS_SUCCESS, $log->status);
        $this->assertSame('PO-2026-0019', $log->resource_label);
        $this->assertSame($this->supplier->id, $log->metadata['supplier_id']);
    }

    public function test_request_cannot_choose_the_recipient(): void
    {
        Mail::fake();

        $this->send(body: ['email' => 'attacker@evil.test', 'to' => 'attacker@evil.test', 'supplier_email' => 'attacker@evil.test'])->assertOk();

        Mail::assertSent(PurchaseOrderMail::class, fn (PurchaseOrderMail $mail) => $mail->hasTo('orders@acme.test')
            && ! $mail->hasTo('attacker@evil.test') && count($mail->to) === 1);
    }

    public function test_new_purchase_order_stores_authoritative_supplier_id_and_name_snapshot(): void
    {
        $response = $this->actingAs($this->admin)->postJson('/api/purchase-orders', [
            'supplier_id' => $this->supplier->id,
            'supplier_name' => 'Forged Supplier Name',
            'delivery_details' => 'Main warehouse',
            'expected_delivery_date' => now()->addDay()->toDateString(),
            'items' => [['product_name' => 'TOMAHAWK EC', 'ordered_quantity' => 2, 'unit_price' => 250]],
        ]);

        $response->assertUnprocessable()->assertJsonValidationErrors('supplier_name');

        $this->actingAs($this->admin)->postJson('/api/purchase-orders', [
            'supplier_id' => $this->supplier->id,
            'delivery_details' => 'Main warehouse',
            'expected_delivery_date' => now()->addDay()->toDateString(),
            'items' => [['product_name' => 'TOMAHAWK EC', 'ordered_quantity' => 2, 'unit_price' => 250]],
        ])->assertCreated()->assertJsonPath('supplier_id', $this->supplier->id)
            ->assertJsonPath('supplier_name', 'Acme Chemicals');

        $this->assertDatabaseHas('purchase_orders', [
            'supplier_id' => $this->supplier->id,
            'supplier_name' => 'Acme Chemicals',
        ]);
    }

    public function test_shared_resolver_uses_conservative_normalized_name_matching(): void
    {
        Mail::fake();
        $this->order->update(['supplier_id' => null]);
        $this->order->update(['supplier_name' => '  ACME   CHEMICALS  ']);

        $this->send()->assertOk();

        Mail::assertSent(PurchaseOrderMail::class, fn (PurchaseOrderMail $mail) => $mail->hasTo('orders@acme.test'));
    }

    public function test_the_attachment_is_the_same_document_as_the_download(): void
    {
        $response = $this->actingAs($this->admin)->get('/api/purchase-orders/'.$this->order->id.'/pdf')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringContainsString('filename="PO-2026-0019.pdf"', $response->headers->get('Content-Disposition'));
        $this->assertPdfForOrder($response->getContent(), 'PO-2026-0019');
    }

    public function test_supplier_without_email_returns_safe_failure(): void
    {
        Mail::fake();
        $this->supplier->update(['email' => null]);

        $this->send()->assertUnprocessable()->assertJsonPath('message', 'This supplier does not have a valid email address.');

        $this->supplier->update(['email' => 'not-an-email']);
        $this->send()->assertUnprocessable()->assertJsonPath('message', 'This supplier does not have a valid email address.');

        Mail::assertNothingSent();
        $this->assertSame('Approved', $this->order->fresh()->status);
        $this->assertNull($this->order->fresh()->sent_at);
    }

    public function test_po_without_a_single_matching_supplier_cannot_send(): void
    {
        Mail::fake();

        $orphan = $this->purchaseOrder('PO-2026-0020', 'Unknown Supplier');
        $this->send($orphan)->assertUnprocessable()->assertJsonPath('message', 'This Purchase Order is not linked to a registered supplier.');

        Supplier::create(['supplier_code' => 'SUP-901', 'name' => 'Acme Chemicals', 'email' => 'other@acme.test', 'status' => 'ACTIVE']);
        $this->order->update(['supplier_id' => null]);
        $this->send()->assertUnprocessable();

        Mail::assertNothingSent();
    }

    public function test_nonexistent_or_closed_po_cannot_send(): void
    {
        Mail::fake();

        $this->actingAs($this->admin)->patchJson('/api/purchase-orders/999999/send')->assertNotFound();
        $this->send($this->purchaseOrder('PO-2026-0021', 'Acme Chemicals', 'Completed'))->assertUnprocessable();
        $this->send($this->purchaseOrder('PO-2026-0022', 'Acme Chemicals', 'Cancelled'))->assertUnprocessable();

        Mail::assertNothingSent();
    }

    public function test_non_admins_and_guests_cannot_send_or_download(): void
    {
        Mail::fake();
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $manager = User::factory()->create(['role_id' => $managerRole->id, 'status' => 'ACTIVE']);

        $this->actingAs($manager)->patchJson('/api/purchase-orders/'.$this->order->id.'/send')->assertForbidden();
        $this->actingAs($manager)->getJson('/api/purchase-orders/'.$this->order->id.'/pdf')->assertForbidden();

        Mail::assertNothingSent();
        $this->assertNull($this->order->fresh()->sent_at);
    }

    public function test_guest_cannot_send(): void
    {
        $this->patchJson('/api/purchase-orders/'.$this->order->id.'/send')->assertUnauthorized();
        $this->getJson('/api/purchase-orders/'.$this->order->id.'/pdf')->assertUnauthorized();
    }

    public function test_pdf_is_delivered_to_brevo_as_an_attachment(): void
    {
        $this->useBrevo();
        Http::fake([BrevoTransactionalMail::ENDPOINT => Http::response(['messageId' => '<po@brevo>'], 201)]);

        $this->send()->assertOk();

        Http::assertSent(function (Request $request) {
            $body = $request->data();

            $this->assertSame([['email' => 'orders@acme.test', 'name' => 'Acme Chemicals']], $body['to']);
            $this->assertSame('SmartChain Purchase Order PO-2026-0019', $body['subject']);
            $this->assertCount(1, $body['attachment']);
            $this->assertSame('PO-2026-0019.pdf', $body['attachment'][0]['name']);
            $this->assertPdfForOrder(base64_decode($body['attachment'][0]['content'], true), 'PO-2026-0019');

            return true;
        });
    }

    public function test_brevo_failure_is_not_reported_as_success_and_logs_no_secrets(): void
    {
        $this->useBrevo();
        Http::fake([BrevoTransactionalMail::ENDPOINT => Http::response(['code' => 'unauthorized', 'message' => 'Key not found'], 401)]);

        $logged = [];
        Event::listen(MessageLogged::class, function (MessageLogged $event) use (&$logged) {
            $context = $event->context;
            $exception = $context['exception'] ?? null;
            unset($context['exception']);
            $logged[] = $event->message.' '.json_encode($context).' '.($exception instanceof Throwable ? (string) $exception : '');
        });

        $this->send()
            ->assertStatus(502)
            ->assertJsonPath('message', 'The Purchase Order could not be emailed to the supplier. Please try again.');

        $this->order->refresh();
        $this->assertSame('Approved', $this->order->status);
        $this->assertNull($this->order->sent_at);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'PO_SENT_TO_SUPPLIER', 'status' => AuditLog::STATUS_SUCCESS]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'PO_SENT_TO_SUPPLIER', 'status' => AuditLog::STATUS_FAILED]);

        $this->assertNotEmpty($logged);
        $flat = implode("\n", $logged);
        $this->assertStringNotContainsString(self::FAKE_KEY, $flat);
        $this->assertStringNotContainsString(substr(self::FAKE_KEY, 0, 15), $flat);
        $this->assertStringNotContainsString(base64_encode('%PDF-'), $flat);
        $this->assertStringNotContainsString('JVBERi', $flat);
        $this->assertStringNotContainsString('%PDF-', $flat);
    }
}
