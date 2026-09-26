<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use App\Models\Product;
use App\Models\QaInspection;
use App\Models\QaInspectionItem;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\StockOutTransaction;
use App\Models\SupplierRejectionCase;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Plant Manager → Reports. Business days are Asia/Manila (UTC+8); timestamps are stored in UTC,
 * so "2026-09-26" in Manila spans 2026-09-25 16:00:00 → 2026-09-26 15:59:59 UTC.
 */
class PlantManagerReportsTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;
    private User $admin;
    private Warehouse $main;
    private Product $product;
    private Inventory $inventory;
    private int $sequence = 0;

    protected function setUp(): void
    {
        parent::setUp();
        // 2026-09-26 10:00 in Manila.
        $this->travelTo(Carbon::parse('2026-09-26 02:00:00', 'UTC'));
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $this->main = Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id, 'capacity' => 1000, 'status' => 'Active']);
        $this->admin = $this->user('ADMIN');
        $this->manager = $this->user('PLANT_MANAGER', ['warehouse_id' => $this->main->id]);
        $this->product = Product::create(['name' => 'Resin', 'unit' => 'kg', 'cost_price' => 10, 'reorder_level' => 5]);
        $this->inventory = Inventory::create(['barcode' => 'INV-RESIN', 'product_id' => $this->product->id, 'warehouse_id' => $this->main->id, 'available_stock' => 300, 'reserved_stock' => 50, 'backload' => 10, 'status' => 'Available']);
    }

    private function user(string $slug, array $attributes = []): User
    {
        $role = Role::firstOrCreate(['slug' => $slug], ['name' => $slug]);

        return User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE'] + $attributes);
    }

    private function dashboard(array $query = [])
    {
        return $this->actingAs($this->manager)->getJson('/api/plant-manager/reports/dashboard?'.http_build_query($query));
    }

    private function generate(string $type, array $query = [], string $format = 'preview')
    {
        return $this->actingAs($this->manager)->getJson('/api/plant-manager/reports/generate?'.http_build_query(['type' => $type, 'format' => $format] + $query));
    }

    private function receiving(string $status, array $attributes = []): Receiving
    {
        $this->sequence++;

        return Receiving::create([
            'receiving_no' => sprintf('RCV-%05d', $this->sequence), 'purchase_order' => 'PO-1', 'supplier' => 'Acme',
            'delivery_date' => '2026-09-20', 'status' => $status, 'prepared_by_id' => $this->manager->id,
        ] + $attributes);
    }

    /** A receiving line with a QA line; stocked when $stockedInAt (UTC) is given. */
    private function inspectedLine(int $delivered, int $accepted, ?string $stockedInAt, ?string $completedAt = '2026-09-20 01:00:00', string $status = 'Partial'): QaInspectionItem
    {
        $receiving = $this->receiving($status);
        $item = ReceivingItem::create([
            'receiving_id' => $receiving->id, 'product_id' => $this->product->id, 'warehouse_id' => $stockedInAt ? $this->main->id : null,
            'product_name' => 'Resin', 'ordered_quantity' => $delivered, 'delivered_quantity' => $delivered, 'unit' => 'kg',
            'inspection_status' => $accepted === $delivered ? 'Passed' : 'Partial', 'stocked_in_at' => $stockedInAt,
        ]);
        $inspection = QaInspection::create(['receiving_id' => $receiving->id, 'status' => $status, 'started_at' => '2026-09-20 00:00:00', 'completed_at' => $completedAt]);

        return QaInspectionItem::create(['qa_inspection_id' => $inspection->id, 'receiving_item_id' => $item->id, 'accepted_quantity' => $accepted, 'rejected_quantity' => $delivered - $accepted, 'inspection_result' => 'Partial']);
    }

    private function order(string $status, array $history = []): Order
    {
        $this->sequence++;
        $order = Order::create([
            'order_no' => sprintf('ORD-%05d', $this->sequence), 'customer_name' => 'Customer', 'order_date' => '2026-09-15 09:00:00',
            'required_delivery_date' => '2026-09-30 17:00:00', 'status' => $status, 'assigned_to' => $this->manager->id,
            'assigned_at' => '2026-09-15 09:00:00', 'created_by' => $this->admin->id,
        ]);
        $order->items()->create(['product_id' => $this->product->id, 'product_name' => 'Resin', 'quantity' => 40, 'unit' => 'kg', 'unit_price' => 10, 'subtotal' => 400]);
        foreach ($history as [$newStatus, $at]) {
            $entry = OrderStatusHistory::make(['new_status' => $newStatus, 'action' => 'STATUS_CHANGED', 'performed_by' => $this->admin->id]);
            $entry->order()->associate($order);
            $entry->created_at = $at;
            $entry->save();
        }

        return $order;
    }

    private function stockOut(int $quantity, string $at): StockOutTransaction
    {
        $order = $this->order('STOCK_OUT_IN_PROGRESS');
        $transaction = StockOutTransaction::create([
            'reference_no' => (string) Str::uuid(), 'idempotency_key' => (string) Str::uuid(), 'order_id' => $order->id,
            'order_item_id' => $order->items()->first()->id, 'inventory_id' => $this->inventory->id, 'product_id' => $this->product->id,
            'warehouse_id' => $this->main->id, 'barcode' => 'INV-RESIN', 'quantity' => $quantity, 'unit' => 'kg', 'performed_by' => $this->manager->id,
        ]);
        $transaction->forceFill(['created_at' => $at])->save();

        return $transaction;
    }

    private function point(array $series, string $key, string $date): array
    {
        return collect($series)->firstWhere($key, $date);
    }

    // ------------------------------------------------------------------ access

    public function test_reports_endpoints_remain_plant_manager_only(): void
    {
        $urls = ['/api/plant-manager/reports/dashboard', '/api/plant-manager/reports/generate?type=inventory&format=preview', '/api/plant-manager/reports/recent'];
        foreach ($urls as $url) {
            $this->getJson($url)->assertUnauthorized();
        }
        $qa = $this->user('QA_SUPERVISOR');
        foreach ($urls as $url) {
            $this->actingAs($this->admin)->getJson($url)->assertForbidden();
            $this->actingAs($qa)->getJson($url)->assertForbidden();
            $this->actingAs($this->manager)->getJson($url)->assertOk();
        }
    }

    // -------------------------------------------------------------- summary cards

    public function test_todays_deliveries_count_only_delivered_orders_once_by_delivery_time(): void
    {
        // 2026-09-25 17:30 UTC is 01:30 on 2026-09-26 in Manila, so it is today.
        $this->order('DELIVERED', [['IN_TRANSIT', '2026-09-24 01:00:00'], ['DELIVERED', '2026-09-25 17:30:00']]);
        // Duplicate Delivered history rows must not double count the order.
        $this->order('DELIVERED', [['DELIVERED', '2026-09-26 01:00:00'], ['DELIVERED', '2026-09-26 01:05:00']]);
        // Delivered yesterday (Manila) — 2026-09-25 15:59 UTC is 23:59 on the 25th.
        $this->order('DELIVERED', [['DELIVERED', '2026-09-25 15:59:00']]);
        // Not delivered: shipment stages, and a target delivery date that is today.
        $this->order('READY_FOR_SHIPMENT', [['READY_FOR_SHIPMENT', '2026-09-26 01:00:00']]);
        $this->order('IN_TRANSIT', [['IN_TRANSIT', '2026-09-26 01:00:00']]);
        $this->order('FORWARDED_TO_LOGISTICS', [['FORWARDED_TO_LOGISTICS', '2026-09-26 01:00:00']]);

        $this->dashboard()->assertOk()
            ->assertJsonPath('kpis.todays_deliveries.value', 2)
            ->assertJsonPath('kpis.todays_deliveries.change_percentage', 100);
    }

    public function test_todays_stock_in_uses_completed_stock_in_quantities_only(): void
    {
        // Stocked today: accepted 25 of 30 delivered — the stocked quantity is 25.
        $this->inspectedLine(30, 25, '2026-09-26 01:00:00');
        // QA accepted but not stocked in yet.
        $this->inspectedLine(40, 40, null);
        // Delivered and awaiting QA.
        $pending = $this->receiving('Pending QA');
        ReceivingItem::create(['receiving_id' => $pending->id, 'product_id' => $this->product->id, 'product_name' => 'Resin', 'ordered_quantity' => 50, 'delivered_quantity' => 50, 'unit' => 'kg', 'inspection_status' => 'Pending QA']);
        // Stocked yesterday.
        $this->inspectedLine(10, 10, '2026-09-25 03:00:00');

        $this->dashboard()->assertOk()
            ->assertJsonPath('kpis.todays_stock_in.value', 25)
            ->assertJsonPath('kpis.todays_stock_in.change_percentage', 150);
    }

    public function test_todays_stock_out_uses_released_transactions_not_ordered_quantity(): void
    {
        $this->order('READY_FOR_STOCK_OUT'); // 40 ordered, nothing released.
        $this->stockOut(7, '2026-09-26 00:30:00');
        $this->stockOut(3, '2026-09-25 16:00:00'); // Manila 00:00 today — start of day is inclusive.

        $this->dashboard()->assertOk()
            ->assertJsonPath('kpis.todays_stock_out.value', 10)
            ->assertJsonPath('kpis.todays_stock_out.change_percentage', null);
    }

    public function test_pending_qa_matches_the_qa_queue_and_skips_unconfirmed_replacements(): void
    {
        $this->receiving('Pending QA'); // Waiting, no inspection.
        $inProgress = $this->receiving('Pending QA');
        QaInspection::create(['receiving_id' => $inProgress->id, 'status' => 'In Progress', 'started_at' => '2026-09-26 00:00:00']);
        $done = $this->receiving('Pending QA');
        QaInspection::create(['receiving_id' => $done->id, 'status' => 'Passed', 'started_at' => '2026-09-26 00:00:00', 'completed_at' => '2026-09-26 01:00:00']);
        $this->receiving('Completed');
        $this->receiving('Rejected');

        $qaItem = $this->inspectedLine(30, 25, null);
        $case = SupplierRejectionCase::create(['qa_inspection_item_id' => $qaItem->id, 'status' => 'REPLACEMENT_PENDING', 'resolution_type' => 'REPLACEMENT']);
        $this->receiving(Receiving::STATUS_AWAITING_REPLACEMENT, ['replacement_for_rejection_case_id' => $case->id]);

        $this->dashboard()->assertOk()->assertJsonPath('kpis.pending_qa.value', 2);

        // Once the replacement delivery is confirmed it enters the QA queue.
        Receiving::query()->where('status', Receiving::STATUS_AWAITING_REPLACEMENT)->update(['status' => 'Pending QA']);
        $this->dashboard()->assertOk()->assertJsonPath('kpis.pending_qa.value', 3);
    }

    public function test_pending_shipment_counts_only_ready_for_shipment_orders(): void
    {
        $this->order('READY_FOR_SHIPMENT');
        $this->order('READY_FOR_SHIPMENT');
        foreach (['DELIVERED', 'CANCELLED', 'IN_TRANSIT', 'FORWARDED_TO_LOGISTICS', 'STOCK_OUT_IN_PROGRESS'] as $status) {
            $this->order($status);
        }

        $this->dashboard()->assertOk()->assertJsonPath('kpis.pending_shipment.value', 2);
    }

    public function test_warehouse_utilization_matches_the_warehouse_page(): void
    {
        $warehouse = $this->actingAs($this->manager)->getJson('/api/plant-manager/warehouse')->assertOk();
        $report = $this->dashboard()->assertOk();

        $this->assertSame(35, $warehouse->json('utilization_percentage'));
        $report->assertJsonPath('kpis.warehouse_utilization.value', $warehouse->json('utilization_percentage'))
            ->assertJsonPath('warehouse_capacity.used', $warehouse->json('utilized'))
            ->assertJsonPath('warehouse_capacity.free', $warehouse->json('available'))
            ->assertJsonPath('warehouse_capacity.total', $warehouse->json('capacity'))
            ->assertJsonMissingPath('kpis.warehouse_utilization.change_percentage');

        // Date filters never alter current capacity.
        $this->dashboard(['from' => '2026-01-01', 'to' => '2026-01-31'])->assertOk()
            ->assertJsonPath('warehouse_capacity.used', 350)
            ->assertJsonPath('kpis.warehouse_utilization.value', 35);
    }

    public function test_inventory_status_uses_current_stock_buckets_and_ignores_dates(): void
    {
        $expected = [['name' => 'Available', 'value' => 300], ['name' => 'Reserved', 'value' => 50], ['name' => 'Backload', 'value' => 10]];

        $this->dashboard()->assertOk()->assertJsonPath('inventory_status', $expected);
        $this->dashboard(['from' => '2026-01-01', 'to' => '2026-01-05'])->assertOk()->assertJsonPath('inventory_status', $expected);
    }

    // ------------------------------------------------------------------ charts

    public function test_default_range_is_last_30_days_and_five_calendar_weeks(): void
    {
        $this->stockOut(5, '2026-08-28 02:00:00'); // Aug 28 — first trend day.
        $this->stockOut(9, '2026-08-27 02:00:00'); // Aug 27 — outside the 30-day trend, inside Week 1.

        $response = $this->dashboard()->assertOk()
            ->assertJsonPath('filters.custom', false)
            ->assertJsonPath('stock_movement_period', ['from' => '2026-08-28', 'to' => '2026-09-26'])
            ->assertJsonPath('weekly_stock_period.from', '2026-08-24')
            ->assertJsonPath('weekly_stock_period.grouping', 'weekly');

        $trend = $response->json('stock_movement_trend');
        $this->assertCount(30, $trend);
        $this->assertSame(['date' => '2026-08-28', 'stock_in' => 0, 'stock_out' => 5], $trend[0]);
        $this->assertSame('2026-09-26', $trend[29]['date']);
        $this->assertCount(5, $response->json('weekly_stock'));
        $this->assertSame(14, $response->json('weekly_stock.0.stock_out'));
    }

    public function test_custom_range_filters_trend_inclusively_and_keeps_empty_days(): void
    {
        $this->stockOut(1, '2026-08-31 15:59:59'); // Aug 31 23:59:59 Manila — excluded.
        $this->stockOut(2, '2026-08-31 16:00:00'); // Sep 1 00:00:00 Manila — included (start).
        $this->stockOut(4, '2026-09-10 15:59:59'); // Sep 10 23:59:59 Manila — included (end).
        $this->stockOut(8, '2026-09-10 16:00:00'); // Sep 11 00:00:00 Manila — excluded.
        $this->inspectedLine(30, 20, '2026-09-03 01:00:00');
        $this->inspectedLine(30, 30, '2026-09-20 01:00:00'); // Outside the range.

        $response = $this->dashboard(['from' => '2026-09-01', 'to' => '2026-09-10'])->assertOk()
            ->assertJsonPath('filters', ['from' => '2026-09-01', 'to' => '2026-09-10', 'custom' => true, 'timezone' => 'Asia/Manila'])
            ->assertJsonPath('stock_movement_period', ['from' => '2026-09-01', 'to' => '2026-09-10']);

        $trend = $response->json('stock_movement_trend');
        $this->assertSame(array_map(fn ($day) => sprintf('2026-09-%02d', $day), range(1, 10)), array_column($trend, 'date'));
        $this->assertSame(['date' => '2026-09-01', 'stock_in' => 0, 'stock_out' => 2], $this->point($trend, 'date', '2026-09-01'));
        $this->assertSame(['date' => '2026-09-02', 'stock_in' => 0, 'stock_out' => 0], $this->point($trend, 'date', '2026-09-02'));
        $this->assertSame(['date' => '2026-09-03', 'stock_in' => 20, 'stock_out' => 0], $this->point($trend, 'date', '2026-09-03'));
        $this->assertSame(['date' => '2026-09-10', 'stock_in' => 0, 'stock_out' => 4], $this->point($trend, 'date', '2026-09-10'));
        $this->assertSame(20, array_sum(array_column($trend, 'stock_in')));
        $this->assertSame(6, array_sum(array_column($trend, 'stock_out')));
    }

    public function test_custom_range_filters_stock_in_vs_stock_out_by_week(): void
    {
        $this->stockOut(1, '2026-08-31 15:00:00'); // Aug 31 Manila — before range.
        $this->stockOut(3, '2026-09-01 02:00:00'); // Tue Sep 1.
        $this->stockOut(5, '2026-09-07 02:00:00'); // Mon Sep 7.
        $this->inspectedLine(12, 12, '2026-09-26 15:00:00'); // Sat Sep 26 23:00 Manila — last day, included.
        $this->inspectedLine(12, 12, '2026-09-26 16:00:00'); // Sep 27 Manila — after range.

        $weeks = $this->dashboard(['from' => '2026-09-01', 'to' => '2026-09-26'])->assertOk()
            ->assertJsonPath('weekly_stock_period', ['from' => '2026-09-01', 'to' => '2026-09-26', 'grouping' => 'weekly'])
            ->json('weekly_stock');

        $this->assertSame(['2026-09-01', '2026-09-07', '2026-09-14', '2026-09-21'], array_column($weeks, 'start'));
        $this->assertSame(['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-26'], array_column($weeks, 'end'));
        $this->assertSame([3, 5, 0, 0], array_column($weeks, 'stock_out'));
        $this->assertSame([0, 0, 0, 12], array_column($weeks, 'stock_in'));
        $this->assertSame('Sep 1 – Sep 6', $weeks[0]['week']);
    }

    public function test_short_custom_range_groups_comparison_daily(): void
    {
        $this->stockOut(6, '2026-09-02 02:00:00');

        $weeks = $this->dashboard(['from' => '2026-09-01', 'to' => '2026-09-03'])->assertOk()
            ->assertJsonPath('weekly_stock_period.grouping', 'daily')->json('weekly_stock');

        $this->assertSame(['Sep 1', 'Sep 2', 'Sep 3'], array_column($weeks, 'week'));
        $this->assertSame([0, 6, 0], array_column($weeks, 'stock_out'));
    }

    public function test_partial_ranges_are_anchored_on_the_given_date(): void
    {
        $this->dashboard(['from' => '2026-09-20'])->assertOk()
            ->assertJsonPath('stock_movement_period', ['from' => '2026-09-20', 'to' => '2026-09-26']);
        $this->dashboard(['to' => '2026-09-10'])->assertOk()
            ->assertJsonPath('stock_movement_period', ['from' => '2026-08-12', 'to' => '2026-09-10']);
    }

    public function test_invalid_ranges_are_rejected(): void
    {
        $this->dashboard(['from' => '2026-09-26', 'to' => '2026-09-01'])->assertStatus(422)->assertJsonValidationErrors('to');
        $this->generate('stock-out', ['from' => '2026-09-26', 'to' => '2026-09-01'])->assertStatus(422)->assertJsonValidationErrors('to');
        $this->dashboard(['from' => '26/09/2026'])->assertStatus(422)->assertJsonValidationErrors('from');
        $this->dashboard(['from' => '2024-01-01', 'to' => '2026-09-26'])->assertStatus(422)->assertJsonValidationErrors('from');
    }

    // ----------------------------------------------------------------- exports

    public function test_generated_reports_apply_the_same_inclusive_range_in_every_format(): void
    {
        $this->stockOut(1, '2026-08-31 15:59:59');
        $this->stockOut(2, '2026-08-31 16:00:00');
        $this->stockOut(4, '2026-09-10 15:59:59');
        $this->stockOut(8, '2026-09-10 16:00:00');

        foreach (['preview', 'print', 'pdf', 'excel'] as $format) {
            $report = $this->generate('stock-out', ['from' => '2026-09-01', 'to' => '2026-09-10'], $format)->assertOk()
                ->assertJsonPath('report.filters', ['from' => '2026-09-01', 'to' => '2026-09-10'])
                ->assertJsonPath('report.date_filter.supported', true)
                ->json('report');
            $this->assertSame([4, 2], array_column($report['rows'], 'quantity'), $format);
            $this->assertSame(6, $report['summary']['quantity']);
            // Timestamps are shown in business time, matching the filter.
            $this->assertSame(['2026-09-10 23:59:59', '2026-09-01 00:00:00'], array_column($report['rows'], 'created_at'));
        }

        $this->generate('stock-out', ['to' => '2026-09-01'])->assertOk()->assertJsonPath('report.summary.quantity', 3);
        $this->generate('stock-out')->assertOk()->assertJsonPath('report.summary.quantity', 15);
    }

    public function test_stock_in_and_movement_reports_respect_the_range(): void
    {
        $this->inspectedLine(30, 25, '2026-09-03 01:00:00');
        $this->inspectedLine(30, 30, '2026-09-20 01:00:00');
        $this->stockOut(4, '2026-09-04 01:00:00');

        $this->generate('stock-in', ['from' => '2026-09-01', 'to' => '2026-09-10'])->assertOk()
            ->assertJsonPath('report.summary', ['records' => 1, 'quantity' => 25]);
        $this->generate('inventory-movement', ['from' => '2026-09-01', 'to' => '2026-09-10'])->assertOk()
            ->assertJsonPath('report.summary', ['records' => 2, 'stock_in_quantity' => 25, 'stock_out_quantity' => 4]);
    }

    public function test_shipment_report_filters_on_the_ready_for_shipment_transition(): void
    {
        $inRange = $this->order('IN_TRANSIT', [['READY_FOR_SHIPMENT', '2026-09-05 02:00:00'], ['IN_TRANSIT', '2026-09-22 02:00:00']]);
        $this->order('READY_FOR_SHIPMENT', [['READY_FOR_SHIPMENT', '2026-09-20 02:00:00']]);

        $rows = $this->generate('shipment', ['from' => '2026-09-01', 'to' => '2026-09-10'])->assertOk()->json('report.rows');

        $this->assertSame([$inRange->order_no], array_column($rows, 'order_no'));
        $this->assertSame('2026-09-05 10:00:00', $rows[0]['ready_for_shipment_at']);
    }

    public function test_current_state_reports_declare_that_dates_do_not_apply(): void
    {
        foreach (['inventory', 'low-stock', 'warehouse-utilization'] as $type) {
            $this->generate($type, ['from' => '2026-09-01', 'to' => '2026-09-10'])->assertOk()
                ->assertJsonPath('report.date_filter.supported', false);
        }
        $this->generate('warehouse-utilization')->assertOk()
            ->assertJsonPath('report.rows.0.used', 350)
            ->assertJsonPath('report.rows.0.utilization_percentage', 35);
    }
}
