<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\QaInspection;
use App\Models\QaInspectionAttachment;
use App\Models\QaInspectionItem;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class QaRejectedItemsTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_returns_only_rejected_quantities_from_completed_inspections(): void
    {
        $role = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $qa = User::factory()->create(['role_id' => $role->id]);
        $product = Product::create(['name' => 'Inspected Product', 'unit' => 'pcs', 'cost_price' => 100]);
        $receiving = Receiving::create([
            'receiving_no' => 'RCV-REJECTED',
            'purchase_order' => 'PO-1',
            'supplier' => 'Existing Supplier',
            'delivery_date' => now()->toDateString(),
            'status' => 'Partial',
            'assigned_qa_user_id' => $qa->id,
        ]);
        $receivingItem = ReceivingItem::create([
            'receiving_id' => $receiving->id,
            'product_id' => $product->id,
            'product_name' => $product->name,
            'delivered_quantity' => 5,
            'unit' => 'pcs',
            'inspection_status' => 'Partial',
        ]);
        $inspection = QaInspection::create([
            'receiving_id' => $receiving->id,
            'status' => 'Partial',
            'started_at' => now()->subHour(),
            'completed_at' => now(),
            'inspected_by_id' => $qa->id,
            'submitted_by_id' => $qa->id,
        ]);
        QaInspectionItem::create([
            'qa_inspection_id' => $inspection->id,
            'receiving_item_id' => $receivingItem->id,
            'accepted_quantity' => 3,
            'rejected_quantity' => 2,
            'inspection_result' => 'Partial',
            'remarks' => 'Two units failed inspection.',
        ]);
        QaInspectionAttachment::create([
            'qa_inspection_id' => $inspection->id,
            'original_name' => 'damage-front.jpg',
            'stored_path' => 'qa-attachments/private-damage-front.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 123,
            'uploaded_by' => $qa->id,
        ]);
        QaInspectionAttachment::create([
            'qa_inspection_id' => $inspection->id,
            'original_name' => 'delivery-document.pdf',
            'stored_path' => 'qa-attachments/private-delivery-document.pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 456,
            'uploaded_by' => $qa->id,
        ]);

        $response = $this->actingAs($qa)->getJson('/api/qa/rejected-items');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.receiving_no', 'RCV-REJECTED')
            ->assertJsonPath('data.0.supplier', 'Existing Supplier')
            ->assertJsonPath('data.0.product', 'Inspected Product')
            ->assertJsonPath('data.0.rejected_qty', 2)
            ->assertJsonPath('data.0.reason', 'Two units failed inspection.')
            ->assertJsonCount(2, 'data.0.attachments')
            ->assertJsonPath('data.0.attachments.0.original_name', 'damage-front.jpg')
            ->assertJsonPath('data.0.attachments.1.original_name', 'delivery-document.pdf')
            ->assertJsonMissingPath('data.0.attachments.0.stored_path')
            ->assertJsonMissingPath('data.0.barcode');
    }

    public function test_non_qa_user_cannot_read_rejected_items(): void
    {
        $this->actingAs(User::factory()->create())
            ->getJson('/api/qa/rejected-items')
            ->assertForbidden();
    }

    public function test_evidence_access_preserves_assigned_qa_scope_and_role_boundaries(): void
    {
        Storage::fake('local');
        $qaRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $adminRole = Role::create(['name' => 'Admin', 'slug' => 'ADMIN']);
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $assignedQa = User::factory()->create(['role_id' => $qaRole->id]);
        $otherQa = User::factory()->create(['role_id' => $qaRole->id]);
        $admin = User::factory()->create(['role_id' => $adminRole->id]);
        $manager = User::factory()->create(['role_id' => $managerRole->id]);
        $product = Product::create(['name' => 'Scoped Product', 'unit' => 'pcs', 'cost_price' => 100]);
        $receiving = Receiving::create([
            'receiving_no' => 'RCV-SCOPED', 'purchase_order' => 'PO-2', 'supplier' => 'Scoped Supplier',
            'delivery_date' => now()->toDateString(), 'status' => 'Rejected', 'assigned_qa_user_id' => $assignedQa->id,
        ]);
        $receivingItem = ReceivingItem::create([
            'receiving_id' => $receiving->id, 'product_id' => $product->id, 'product_name' => $product->name,
            'delivered_quantity' => 1, 'unit' => 'pcs', 'inspection_status' => 'Rejected',
        ]);
        $inspection = QaInspection::create([
            'receiving_id' => $receiving->id, 'status' => 'Rejected', 'started_at' => now()->subHour(),
            'completed_at' => now(), 'inspected_by_id' => $assignedQa->id, 'submitted_by_id' => $assignedQa->id,
        ]);
        $inspectionItem = QaInspectionItem::create([
            'qa_inspection_id' => $inspection->id, 'receiving_item_id' => $receivingItem->id,
            'accepted_quantity' => 0, 'rejected_quantity' => 1, 'inspection_result' => 'Rejected',
        ]);
        $path = 'qa-attachments/scoped.jpg';
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
        Storage::disk('local')->put($path, $png);
        $attachment = QaInspectionAttachment::create([
            'qa_inspection_id' => $inspection->id, 'original_name' => 'scoped.png', 'stored_path' => $path,
            'mime_type' => 'image/png', 'file_size' => strlen($png), 'uploaded_by' => $assignedQa->id,
        ]);
        foreach (range(2, 4) as $number) {
            $imagePath = "qa-attachments/scoped-{$number}.png";
            Storage::disk('local')->put($imagePath, $png);
            QaInspectionAttachment::create([
                'qa_inspection_id' => $inspection->id, 'original_name' => "scoped-{$number}.png",
                'stored_path' => $imagePath, 'mime_type' => 'image/png', 'file_size' => strlen($png),
                'uploaded_by' => $assignedQa->id,
            ]);
        }
        $pdfPath = 'qa-attachments/scoped-document.pdf';
        Storage::disk('local')->put($pdfPath, '%PDF-1.4 test');
        QaInspectionAttachment::create([
            'qa_inspection_id' => $inspection->id, 'original_name' => 'scoped-document.pdf',
            'stored_path' => $pdfPath, 'mime_type' => 'application/pdf', 'file_size' => 13,
            'uploaded_by' => $assignedQa->id,
        ]);
        $url = "/api/qa/inspections/{$receiving->id}/attachments/{$attachment->id}";
        $exportUrl = "/api/qa/rejected-items/export.xlsx?ids={$inspectionItem->id}";

        $this->actingAs($assignedQa)->getJson('/api/qa/rejected-items')->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($assignedQa)->get($url)->assertOk();
        $export = $this->actingAs($assignedQa)->get($exportUrl);
        $export->assertOk()
            ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            ->assertDownload();
        $exportPath = $export->baseResponse->getFile()->getPathname();
        $zip = new \ZipArchive();
        $this->assertTrue($zip->open($exportPath) === true);
        $this->assertNotFalse($zip->locateName('xl/media/evidence-1.png'));
        $this->assertNotFalse($zip->locateName('xl/media/evidence-4.png'));
        $sheet = $zip->getFromName('xl/worksheets/sheet1.xml');
        $this->assertIsString($sheet);
        $this->assertStringContainsString('[PDF] scoped-document.pdf', $sheet);
        $this->assertStringNotContainsString('qa-attachments/', $sheet);
        $this->assertStringNotContainsString($path, $sheet);
        $zip->close();
        @unlink($exportPath);
        $this->actingAs($otherQa)->getJson('/api/qa/rejected-items')->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($otherQa)->get($url)->assertNotFound();
        $foreignExport = $this->actingAs($otherQa)->get($exportUrl);
        $foreignExport->assertOk();
        $foreignPath = $foreignExport->baseResponse->getFile()->getPathname();
        $foreignZip = new \ZipArchive();
        $this->assertTrue($foreignZip->open($foreignPath) === true);
        $foreignSheet = $foreignZip->getFromName('xl/worksheets/sheet1.xml');
        $this->assertIsString($foreignSheet);
        $this->assertStringNotContainsString('scoped.png', $foreignSheet);
        $foreignZip->close();
        @unlink($foreignPath);
        $this->actingAs($admin)->getJson('/api/qa/rejected-items')->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($admin)->get($url)->assertOk();
        $adminExport = $this->actingAs($admin)->get($exportUrl);
        $adminExport->assertOk()->assertDownload();
        @unlink($adminExport->baseResponse->getFile()->getPathname());
        $this->actingAs($manager)->getJson('/api/qa/rejected-items')->assertForbidden();
        $this->actingAs($manager)->get($url)->assertForbidden();
        $this->actingAs($manager)->get($exportUrl)->assertForbidden();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/qa/rejected-items')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);
        $this->get($url)
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);
        $this->getJson($url)
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);
        $this->get($exportUrl)
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);
    }
}
