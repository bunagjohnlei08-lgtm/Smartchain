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
use Tests\TestCase;

class QaQualityReportTest extends TestCase
{
    use RefreshDatabase;

    private function completedInspection(User $qa, string $number, string $supplier, string $status, int $accepted, int $rejected, string $completedAt): QaInspection
    {
        $product = Product::firstOrCreate(['name' => 'Report Product'], ['unit' => 'pcs', 'cost_price' => 100]);
        $receiving = Receiving::create(['receiving_no' => $number, 'purchase_order' => 'PO-1', 'supplier' => $supplier, 'delivery_date' => now()->toDateString(), 'status' => $status, 'assigned_qa_user_id' => $qa->id]);
        $receivingItem = ReceivingItem::create(['receiving_id' => $receiving->id, 'product_id' => $product->id, 'product_name' => $product->name, 'delivered_quantity' => $accepted + $rejected, 'unit' => 'pcs', 'inspection_status' => $status]);
        $inspection = QaInspection::create(['receiving_id' => $receiving->id, 'status' => $status, 'started_at' => now()->subHour(), 'completed_at' => $completedAt, 'inspected_by_id' => $qa->id, 'submitted_by_id' => $qa->id]);
        QaInspectionItem::create(['qa_inspection_id' => $inspection->id, 'receiving_item_id' => $receivingItem->id, 'accepted_quantity' => $accepted, 'rejected_quantity' => $rejected, 'inspection_result' => $status]);

        return $inspection;
    }

    public function test_report_aggregates_completed_inspection_data(): void
    {
        $role = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $qa = User::factory()->create(['role_id' => $role->id]);
        $this->completedInspection($qa, 'RCV-PASS', 'Supplier A', 'Passed', 10, 0, '2026-08-23 10:00:00');
        $this->completedInspection($qa, 'RCV-PARTIAL', 'Supplier A', 'Partial', 3, 2, '2026-08-24 10:00:00');
        $rejectedInspection = $this->completedInspection($qa, 'RCV-REJECT', 'Supplier B', 'Rejected', 0, 5, '2026-08-24 11:00:00');
        QaInspectionAttachment::create(['qa_inspection_id' => $rejectedInspection->id, 'original_name' => 'damage.jpg', 'stored_path' => 'qa-attachments/damage.jpg', 'mime_type' => 'image/jpeg', 'file_size' => 100, 'uploaded_by' => $qa->id]);

        $response = $this->actingAs($qa)->getJson('/api/qa/quality-reports');

        $response->assertOk()
            ->assertJsonPath('data.summary.completed_inspections', 3)
            ->assertJsonPath('data.summary.passed_count', 1)
            // Rates are unit-based: 13 accepted and 7 rejected of 20 inspected units.
            ->assertJsonPath('data.summary.passed_rate', 65)
            ->assertJsonPath('data.summary.rejected_count', 1)
            ->assertJsonPath('data.summary.rejected_rate', 35)
            ->assertJsonPath('data.summary.passed_units', 13)
            ->assertJsonPath('data.summary.rejected_units', 7)
            ->assertJsonPath('data.summary.total_inspected_units', 20)
            ->assertJsonPath('data.summary.rejected_quantity', 7)
            ->assertJsonCount(2, 'data.distribution')
            ->assertJsonPath('data.top_rejected_products.0.product', 'Report Product')
            ->assertJsonPath('data.top_rejected_products.0.quantity', 7)
            ->assertJsonPath('data.supplier_quality.0.name', 'Supplier A')
            ->assertJsonPath('data.supplier_quality.0.pass_rate', 86.7)
            ->assertJsonPath('data.inspection_evidence.0.receiving_no', 'RCV-REJECT')
            ->assertJsonPath('data.inspection_evidence.0.attachments.0.original_name', 'damage.jpg')
            ->assertJsonPath('data.inspection_evidence.1.receiving_no', 'RCV-PARTIAL')
            ->assertJsonPath('data.inspection_evidence.2.receiving_no', 'RCV-PASS');
        $response->assertJsonStructure(['data' => ['production_inspections', 'inventory_audits', 'pending_workload', 'operational_summary' => [
            'production_inspections', 'production_accepted_quantity', 'production_rejected_quantity', 'inventory_audits', 'pending_workload',
        ]]]);
    }

    public function test_inspection_evidence_uses_id_as_a_deterministic_newest_first_tie_breaker(): void
    {
        $role = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $qa = User::factory()->create(['role_id' => $role->id]);
        $olderId = $this->completedInspection($qa, 'RCV-SAME-1', 'Supplier A', 'Passed', 1, 0, '2026-08-24 10:00:00');
        $newerId = $this->completedInspection($qa, 'RCV-SAME-2', 'Supplier A', 'Passed', 1, 0, '2026-08-24 10:00:00');

        $response = $this->actingAs($qa)->getJson('/api/qa/quality-reports');

        $response->assertOk()
            ->assertJsonPath('data.inspection_evidence.0.inspection_id', $newerId->id)
            ->assertJsonPath('data.inspection_evidence.1.inspection_id', $olderId->id);
    }

    public function test_evidence_report_keeps_cycle_metadata_files_and_private_access_separate(): void
    {
        \Illuminate\Support\Facades\Storage::fake('local');
        $role = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $qa = User::factory()->create(['role_id' => $role->id]);
        $otherQa = User::factory()->create(['role_id' => $role->id]);
        $first = $this->completedInspection($qa, 'RCV-CYCLES', 'Cycle Supplier', 'Partial', 8, 2, '2026-09-15 10:00:00');
        $first->receiving->update(['purchase_order' => 'PO-CYCLES']);
        $second = QaInspection::create(['receiving_id' => $first->receiving_id, 'cycle_number' => 2,
            'status' => 'Passed', 'completed_at' => '2026-09-16 10:00:00', 'inspected_by_id' => $qa->id]);
        $files = [];
        foreach ([$first, $second] as $index => $inspection) {
            $path = 'qa-attachments/cycle'.($index + 1).'.pdf';
            \Illuminate\Support\Facades\Storage::disk('local')->put($path, "%PDF-1.4\n%%EOF\n");
            $files[] = $inspection->attachments()->create(['original_name' => 'cycle-'.($index + 1).'.pdf',
                'stored_path' => $path, 'mime_type' => 'application/pdf', 'file_size' => 15, 'uploaded_by' => $qa->id]);
        }
        $response = $this->actingAs($qa)->getJson('/api/qa/quality-reports')->assertOk()
            ->assertJsonCount(2, 'data.inspection_evidence')
            ->assertJsonPath('data.inspection_evidence.0.inspection_id', $second->id)
            ->assertJsonPath('data.inspection_evidence.0.cycle_number', 2)
            ->assertJsonPath('data.inspection_evidence.0.status', 'Passed')
            ->assertJsonPath('data.inspection_evidence.0.purchase_order', 'PO-CYCLES')
            ->assertJsonPath('data.inspection_evidence.0.inspected_by', $qa->name)
            ->assertJsonCount(1, 'data.inspection_evidence.0.attachments')
            ->assertJsonPath('data.inspection_evidence.0.attachments.0.id', $files[1]->id)
            ->assertJsonPath('data.inspection_evidence.1.cycle_number', 1)
            ->assertJsonPath('data.inspection_evidence.1.status', 'Partial')
            ->assertJsonCount(1, 'data.inspection_evidence.1.attachments')
            ->assertJsonPath('data.inspection_evidence.1.attachments.0.id', $files[0]->id);
        foreach ($response->json('data.inspection_evidence') as $row) {
            $url = '/api'.$row['attachments'][0]['view_url'];
            $this->actingAs($qa)->get($url)->assertOk()->assertHeader('Cache-Control', 'no-store, private');
            $this->actingAs($otherQa)->get($url)->assertNotFound();
        }
    }

    public function test_date_filters_apply_to_summary_percentages_trend_and_evidence_with_inclusive_boundaries(): void
    {
        $role = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $qa = User::factory()->create(['role_id' => $role->id]);
        $this->completedInspection($qa, 'RCV-EARLY', 'Supplier A', 'Passed', 10, 0, '2026-09-01 08:00:00');
        $sameDayFirst = $this->completedInspection($qa, 'RCV-RANGE-1', 'Supplier B', 'Partial', 3, 2, '2026-09-15 00:00:00');
        $sameDayLast = $this->completedInspection($qa, 'RCV-RANGE-2', 'Supplier C', 'Rejected', 0, 5, '2026-09-15 23:59:59');
        $this->completedInspection($qa, 'RCV-LATE', 'Supplier D', 'Passed', 7, 0, '2026-09-16 00:00:00');

        $this->actingAs($qa)->getJson('/api/qa/quality-reports?from_date=2026-09-15')
            ->assertOk()
            ->assertJsonPath('data.summary.completed_inspections', 3)
            ->assertJsonMissing(['receiving_no' => 'RCV-EARLY']);

        $this->actingAs($qa)->getJson('/api/qa/quality-reports?to_date=2026-09-15')
            ->assertOk()
            ->assertJsonPath('data.summary.completed_inspections', 3)
            ->assertJsonMissing(['receiving_no' => 'RCV-LATE']);

        $response = $this->actingAs($qa)->getJson('/api/qa/quality-reports?from_date=2026-09-15&to_date=2026-09-15');

        $response->assertOk()
            ->assertJsonPath('data.report_period.from_date', '2026-09-15')
            ->assertJsonPath('data.report_period.to_date', '2026-09-15')
            ->assertJsonPath('data.report_period.is_custom', true)
            ->assertJsonPath('data.summary.completed_inspections', 2)
            ->assertJsonPath('data.summary.passed_units', 3)
            ->assertJsonPath('data.summary.rejected_units', 7)
            ->assertJsonPath('data.summary.passed_rate', 30)
            ->assertJsonPath('data.summary.rejected_rate', 70)
            ->assertJsonCount(1, 'data.trend')
            ->assertJsonPath('data.trend.0.date', '2026-09-15')
            ->assertJsonCount(2, 'data.inspection_evidence')
            ->assertJsonPath('data.inspection_evidence.0.inspection_id', $sameDayLast->id)
            ->assertJsonPath('data.inspection_evidence.1.inspection_id', $sameDayFirst->id)
            ->assertJsonMissing(['receiving_no' => 'RCV-EARLY'])
            ->assertJsonMissing(['receiving_no' => 'RCV-LATE']);
    }

    public function test_date_filters_reject_invalid_and_reversed_ranges(): void
    {
        $role = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $qa = User::factory()->create(['role_id' => $role->id]);

        $this->actingAs($qa)->getJson('/api/qa/quality-reports?from_date=not-a-date')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('from_date');

        $this->actingAs($qa)->getJson('/api/qa/quality-reports?from_date=2026-09-16&to_date=2026-09-15')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('to_date');
    }

    public function test_date_filters_preserve_role_and_assigned_qa_scope(): void
    {
        $qaRole = Role::create(['name' => 'QA Supervisor', 'slug' => 'QA_SUPERVISOR']);
        $managerRole = Role::create(['name' => 'Plant Manager', 'slug' => 'PLANT_MANAGER']);
        $qa = User::factory()->create(['role_id' => $qaRole->id]);
        $otherQa = User::factory()->create(['role_id' => $qaRole->id]);
        $manager = User::factory()->create(['role_id' => $managerRole->id]);
        $this->completedInspection($qa, 'RCV-OWN', 'Supplier A', 'Passed', 1, 0, '2026-09-15 10:00:00');
        $this->completedInspection($otherQa, 'RCV-OTHER', 'Supplier B', 'Rejected', 0, 1, '2026-09-15 11:00:00');
        $url = '/api/qa/quality-reports?from_date=2026-09-01&to_date=2026-09-30';

        $this->getJson($url)->assertUnauthorized();

        $this->actingAs($qa)->getJson($url)
            ->assertOk()
            ->assertJsonPath('data.summary.completed_inspections', 1)
            ->assertJsonPath('data.inspection_evidence.0.receiving_no', 'RCV-OWN')
            ->assertJsonMissing(['receiving_no' => 'RCV-OTHER']);

        $this->actingAs($manager)->getJson($url)->assertForbidden();
    }
}
