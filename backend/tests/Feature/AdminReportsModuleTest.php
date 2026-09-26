<?php

namespace Tests\Feature;

use App\Mail\ScheduledReportMail;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Inventory;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use App\Models\Product;
use App\Models\PurchaseOrder;
use App\Models\QaInspection;
use App\Models\QaInspectionItem;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\ReceivingTimeline;
use App\Models\ReplenishmentRequest;
use App\Models\ReportExport;
use App\Models\ReportSchedule;
use App\Models\Role;
use App\Models\StockOutTransaction;
use App\Models\Supplier;
use App\Models\SupplierRejectionCase;
use App\Models\User;
use App\Models\Warehouse;
use App\Reports\Writers\XlsxReportWriter;
use App\Support\WarehouseCapacity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;
use ZipArchive;

class AdminReportsModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $manager;
    private User $qa;
    private Warehouse $main;
    private Warehouse $second;
    private Product $healthy;
    private Product $low;
    private Product $out;
    private Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();
        $branch = Branch::create(['name' => 'Main Branch', 'code' => 'MAIN']);
        $this->main = Warehouse::create(['name' => 'Main Warehouse', 'code' => 'WH-MAIN', 'branch_id' => $branch->id, 'capacity' => 100, 'status' => 'Active']);
        $this->second = Warehouse::create(['name' => 'North Warehouse', 'code' => 'WH-NORTH', 'branch_id' => $branch->id, 'capacity' => 20, 'status' => 'Active']);
        $this->admin = $this->user('ADMIN');
        $this->manager = $this->user('PLANT_MANAGER', ['warehouse_id' => $this->main->id]);
        $this->qa = $this->user('QA_SUPERVISOR');
        $this->healthy = Product::create(['name' => 'Healthy Resin', 'category' => 'Chemicals', 'brand' => 'Acme', 'unit' => 'kg', 'cost_price' => 10, 'reorder_level' => 5]);
        $this->low = Product::create(['name' => 'Low Solvent', 'category' => 'Chemicals', 'unit' => 'L', 'cost_price' => 10, 'reorder_level' => 10]);
        $this->out = Product::create(['name' => 'Empty Pigment', 'category' => 'Pigments', 'unit' => 'kg', 'cost_price' => 10, 'reorder_level' => 3]);
        Inventory::create(['barcode' => 'INV-HEALTHY', 'product_id' => $this->healthy->id, 'warehouse_id' => $this->main->id, 'available_stock' => 50, 'reserved_stock' => 5, 'status' => 'Available']);
        Inventory::create(['barcode' => 'INV-LOW', 'product_id' => $this->low->id, 'warehouse_id' => $this->main->id, 'available_stock' => 4, 'status' => 'Low Stock']);
        Inventory::create(['barcode' => 'INV-OUT', 'product_id' => $this->out->id, 'warehouse_id' => $this->second->id, 'available_stock' => 0, 'status' => 'Out of Stock']);
        $this->supplier = Supplier::create(['supplier_code' => 'SUP-001', 'name' => 'Acme Chemicals', 'contact_person' => 'Juan', 'email' => 'acme@example.com', 'phone' => '0917', 'address' => 'Makati', 'payment_terms' => 'Net 30', 'status' => 'ACTIVE']);
    }

    private function user(string $slug, array $attributes = []): User
    {
        $role = Role::firstOrCreate(['slug' => $slug], ['name' => $slug]);

        return User::factory()->create(['role_id' => $role->id, 'status' => 'ACTIVE'] + $attributes);
    }

    private function preview(string $key, array $filters = [], ?User $as = null)
    {
        return $this->actingAs($as ?? $this->admin)->getJson('/api/admin/reports/preview?'.http_build_query(['report_key' => $key] + $filters));
    }

    private function rows(string $key, array $filters = []): array
    {
        return $this->preview($key, $filters + ['per_page' => 100])->assertOk()->json('rows');
    }

    private function purchaseOrder(string $number = 'PO-2026-0001', string $status = 'Completed'): PurchaseOrder
    {
        $po = PurchaseOrder::create([
            'po_number' => $number, 'supplier_id' => $this->supplier->id, 'supplier_name' => 'Acme Chemicals (snapshot)',
            'delivery_details' => 'Main warehouse', 'expected_delivery_date' => '2026-09-30', 'total_amount' => 1000,
            'status' => $status, 'approved_by' => $this->admin->id,
        ]);
        $po->items()->create(['product_name' => $this->healthy->name, 'ordered_quantity' => 30, 'unit_price' => 10, 'total_price' => 300]);

        return $po;
    }

    /** A QA-completed partial receiving with its rejection case. */
    private function inspectedReceiving(bool $stockedIn = true): array
    {
        $po = $this->purchaseOrder();
        $receiving = Receiving::create([
            'receiving_no' => 'RCV-00001', 'purchase_order_id' => $po->id, 'purchase_order' => $po->po_number, 'supplier' => 'Acme Chemicals',
            'reference_no' => 'DR-77', 'delivery_date' => '2026-09-10', 'status' => 'Partial',
            'prepared_by_id' => $this->manager->id, 'assigned_qa_user_id' => $this->qa->id,
        ]);
        $item = ReceivingItem::create([
            'receiving_id' => $receiving->id, 'product_id' => $this->healthy->id, 'warehouse_id' => $stockedIn ? $this->main->id : null,
            'product_name' => $this->healthy->name, 'ordered_quantity' => 30, 'delivered_quantity' => 30, 'unit' => 'kg',
            'inspection_status' => 'Partial', 'stocked_in_at' => $stockedIn ? '2026-09-11 08:30:00' : null,
        ]);
        $inspection = QaInspection::create(['receiving_id' => $receiving->id, 'status' => 'Partial', 'started_at' => '2026-09-10 09:00:00', 'completed_at' => '2026-09-10 10:00:00', 'inspected_by_id' => $this->qa->id]);
        $qaItem = QaInspectionItem::create(['qa_inspection_id' => $inspection->id, 'receiving_item_id' => $item->id, 'accepted_quantity' => 25, 'rejected_quantity' => 5, 'inspection_result' => 'Partial', 'remarks' => 'Torn bags']);
        if ($stockedIn) ReceivingTimeline::create(['receiving_id' => $receiving->id, 'status' => 'Stock In Completed', 'performed_by' => $this->manager->name, 'occurred_at' => '2026-09-11 08:30:00']);
        $case = SupplierRejectionCase::create(['qa_inspection_item_id' => $qaItem->id, 'status' => 'SENT', 'sent_at' => '2026-09-10 12:00:00', 'sent_by_id' => $this->admin->id]);

        return [$po, $receiving, $case];
    }

    private function replacementFor(SupplierRejectionCase $case, PurchaseOrder $po): Receiving
    {
        $case->update(['status' => 'REPLACEMENT_PENDING', 'resolution_type' => 'REPLACEMENT', 'routed_to_receiving_at' => now(), 'routed_by_id' => $this->admin->id]);
        $replacement = Receiving::create([
            'receiving_no' => 'RCV-00002', 'purchase_order_id' => $po->id, 'replacement_for_rejection_case_id' => $case->id,
            'purchase_order' => $po->po_number, 'supplier' => 'Acme Chemicals', 'delivery_date' => '2026-09-12',
            'status' => Receiving::STATUS_AWAITING_REPLACEMENT, 'prepared_by_id' => $this->manager->id,
        ]);
        ReceivingItem::create([
            'receiving_id' => $replacement->id, 'product_id' => $this->healthy->id, 'product_name' => $this->healthy->name,
            'ordered_quantity' => 5, 'delivered_quantity' => 0, 'unit' => 'kg', 'inspection_status' => Receiving::STATUS_AWAITING_REPLACEMENT,
        ]);

        return $replacement;
    }

    private function order(string $number, string $status, string $orderDate = '2026-09-15 09:00:00', array $history = []): Order
    {
        $order = Order::create([
            'order_no' => $number, 'customer_name' => "Customer {$number}", 'customer_address' => 'Quezon City',
            'order_date' => $orderDate, 'required_delivery_date' => '2026-09-20 17:00:00', 'status' => $status,
            'assigned_to' => $this->manager->id, 'assigned_at' => $orderDate, 'created_by' => $this->admin->id,
        ]);
        $order->items()->create(['product_id' => $this->healthy->id, 'product_name' => $this->healthy->name, 'quantity' => 3, 'unit' => 'kg', 'unit_price' => 10, 'subtotal' => 30]);
        foreach ($history as $newStatus => $at) {
            $entry = OrderStatusHistory::make(['new_status' => $newStatus, 'action' => 'STATUS_CHANGED', 'performed_by' => $this->admin->id]);
            $entry->order()->associate($order);
            $entry->created_at = $at;
            $entry->save();
        }

        return $order;
    }

    private function stockOut(Order $order, int $quantity, string $at): StockOutTransaction
    {
        $inventory = Inventory::query()->where('barcode', 'INV-HEALTHY')->sole();
        $transaction = StockOutTransaction::create([
            'reference_no' => (string) Str::uuid(), 'idempotency_key' => (string) Str::uuid(), 'order_id' => $order->id,
            'order_item_id' => $order->items()->first()->id, 'inventory_id' => $inventory->id, 'product_id' => $this->healthy->id,
            'warehouse_id' => $this->main->id, 'barcode' => 'INV-HEALTHY', 'quantity' => $quantity, 'unit' => 'kg', 'performed_by' => $this->manager->id,
        ]);
        $transaction->forceFill(['created_at' => $at])->save();

        return $transaction;
    }

    // ---------------------------------------------------------------- access

    public function test_admin_can_list_report_definitions_for_every_category(): void
    {
        $response = $this->actingAs($this->admin)->getJson('/api/admin/reports/definitions')->assertOk();

        $categories = collect($response->json('data'))->pluck('category')->unique()->values()->all();
        $this->assertEqualsCanonicalizing(['inventory', 'stock-movement', 'receiving', 'shipment', 'order', 'procurement', 'supplier', 'warehouse', 'ai-forecast', 'system'], $categories);
        $keys = collect($response->json('data'))->pluck('key');
        foreach (['inventory.summary', 'inventory.low_stock', 'inventory.out_of_stock', 'stock.stock_in', 'stock.stock_out', 'stock.movement_summary', 'receiving.replacements', 'shipment.in_transit', 'orders.fulfillment', 'procurement.purchase_orders', 'suppliers.rejections', 'warehouse.capacity', 'system.audit_logs', 'system.user_activity'] as $key) {
            $this->assertTrue($keys->contains($key), "Missing {$key}");
        }
    }

    public function test_plant_manager_qa_and_guest_are_blocked_from_every_report_endpoint(): void
    {
        $schedule = ReportSchedule::create(['report_key' => 'inventory.summary', 'format' => 'CSV', 'frequency' => 'DAILY', 'run_time' => '08:00', 'recipient_user_id' => $this->admin->id, 'status' => 'ACTIVE']);
        $requests = [
            ['GET', '/api/admin/reports/dashboard'], ['GET', '/api/admin/reports/definitions'], ['GET', '/api/admin/reports/options'],
            ['GET', '/api/admin/reports/preview?report_key=inventory.summary'], ['POST', '/api/admin/reports/export', ['report_key' => 'inventory.summary', 'format' => 'CSV']],
            ['GET', '/api/admin/reports/history'], ['GET', '/api/admin/reports/schedules'], ['POST', '/api/admin/reports/schedules', []],
            ['PATCH', "/api/admin/reports/schedules/{$schedule->id}", ['status' => 'PAUSED']], ['DELETE', "/api/admin/reports/schedules/{$schedule->id}"],
        ];

        foreach ($requests as $request) {
            [$method, $uri] = $request;
            $data = $request[2] ?? [];
            $this->json($method, $uri, $data)->assertUnauthorized();
        }
        foreach ([$this->manager, $this->qa] as $user) {
            foreach ($requests as $request) {
            [$method, $uri] = $request;
            $data = $request[2] ?? [];
                $this->actingAs($user)->json($method, $uri, $data)->assertForbidden();
            }
        }
        $this->assertDatabaseCount('report_exports', 0);
        $this->assertSame('ACTIVE', $schedule->fresh()->status);
    }

    public function test_unsupported_report_keys_are_rejected(): void
    {
        foreach (['users', '../users', 'inventory.summary; DROP TABLE users', 'inventories'] as $key) {
            $this->preview($key)->assertUnprocessable()->assertJsonValidationErrors('report_key');
            $this->actingAs($this->admin)->postJson('/api/admin/reports/export', ['report_key' => $key, 'format' => 'CSV'])
                ->assertUnprocessable()->assertJsonValidationErrors('report_key');
        }
    }

    public function test_export_cannot_override_table_columns_model_or_recipient(): void
    {
        foreach (['table' => 'users', 'columns' => ['password'], 'model' => 'App\\Models\\User', 'recipient' => 'attacker@example.com', 'sql' => 'select 1', 'path' => '../../.env'] as $key => $value) {
            $this->actingAs($this->admin)->postJson('/api/admin/reports/export', ['report_key' => 'inventory.summary', 'format' => 'CSV', $key => $value])
                ->assertUnprocessable()->assertJsonValidationErrors($key);
            $this->preview('inventory.summary', [$key => is_array($value) ? 'password' : $value])->assertUnprocessable()->assertJsonValidationErrors($key);
        }
        // Filters a definition does not declare are refused rather than ignored.
        $this->preview('suppliers.directory', ['warehouse_id' => $this->main->id])->assertUnprocessable()->assertJsonValidationErrors('warehouse_id');
        // The title can only shape a sanitized filename.
        $this->actingAs($this->admin)->postJson('/api/admin/reports/export', ['report_key' => 'inventory.summary', 'format' => 'CSV', 'title' => '../../etc/passwd'])
            ->assertUnprocessable()->assertJsonValidationErrors('title');
        $this->assertDatabaseCount('report_exports', 0);
    }

    // ------------------------------------------------------------- inventory

    public function test_inventory_summary_uses_real_inventory_records(): void
    {
        $rows = collect($this->rows('inventory.summary'))->keyBy('barcode');

        $this->assertCount(3, $rows);
        $this->assertSame(50, $rows['INV-HEALTHY']['available']);
        $this->assertSame(5, $rows['INV-HEALTHY']['reserved']);
        $this->assertSame(55, $rows['INV-HEALTHY']['total_stock']);
        $this->assertSame('Healthy', $rows['INV-HEALTHY']['stock_status']);
        $this->assertSame('Main Warehouse', $rows['INV-HEALTHY']['warehouse']);
        $this->assertSame('Chemicals', $rows['INV-HEALTHY']['category']);
        $this->assertSame('Acme', $rows['INV-HEALTHY']['brand']);
        $this->assertArrayNotHasKey('cost_price', $rows['INV-HEALTHY']);

        $this->assertSame(['INV-OUT'], collect($this->rows('inventory.summary', ['category' => 'Pigments']))->pluck('barcode')->all());
    }

    public function test_low_stock_and_out_of_stock_follow_reorder_level_rules(): void
    {
        $low = $this->rows('inventory.low_stock');
        $this->assertSame(['INV-LOW'], array_column($low, 'barcode'));
        $this->assertSame(6, $low[0]['shortfall']);

        $this->assertSame(['INV-OUT'], array_column($this->rows('inventory.out_of_stock'), 'barcode'));
        $this->assertSame(['INV-LOW'], array_column($this->rows('inventory.summary', ['status' => 'Low Stock']), 'barcode'));

        $this->actingAs($this->admin)->getJson('/api/admin/reports/dashboard')->assertOk()
            ->assertJsonPath('stock_status_overview.0.value', 1)
            ->assertJsonPath('stock_status_overview.1.value', 1)
            ->assertJsonPath('stock_status_overview.2.value', 1);
    }

    public function test_warehouse_filter_applies_to_inventory_and_stock_reports(): void
    {
        $this->assertSame(['INV-OUT'], array_column($this->rows('inventory.summary', ['warehouse_id' => $this->second->id]), 'barcode'));
        $byWarehouse = collect($this->rows('inventory.by_warehouse'))->keyBy('code');
        $this->assertSame(2, $byWarehouse['WH-MAIN']['inventory_records']);
        $this->assertSame(59, $byWarehouse['WH-MAIN']['total_stock']);
        $this->assertSame(1, $byWarehouse['WH-NORTH']['out_of_stock_items']);

        $order = $this->order('ORD-1', 'READY_FOR_SHIPMENT');
        $this->stockOut($order, 3, '2026-09-16 10:00:00');
        $this->assertCount(1, $this->rows('stock.stock_out', ['warehouse_id' => $this->main->id]));
        $this->assertCount(0, $this->rows('stock.stock_out', ['warehouse_id' => $this->second->id]));
    }

    // -------------------------------------------------------- stock movement

    public function test_stock_in_report_uses_stocked_in_receiving_lines(): void
    {
        $this->inspectedReceiving(stockedIn: true);
        $rows = $this->rows('stock.stock_in');

        $this->assertCount(1, $rows);
        $this->assertSame(25, $rows[0]['quantity']); // accepted QA quantity, not delivered
        $this->assertSame('INV-HEALTHY', $rows[0]['barcode']);
        $this->assertSame('RCV-00001', $rows[0]['reference']);
        $this->assertSame('PO-2026-0001', $rows[0]['po_no']);
        $this->assertSame($this->manager->name, $rows[0]['performed_by']);
        $this->assertSame('Stock In', $rows[0]['movement_type']);
    }

    public function test_stock_in_excludes_lines_not_yet_stocked(): void
    {
        $this->inspectedReceiving(stockedIn: false);

        $this->assertSame([], $this->rows('stock.stock_in'));
    }

    public function test_stock_out_report_and_movement_summary_use_real_transactions(): void
    {
        $this->inspectedReceiving(stockedIn: true);
        $order = $this->order('ORD-9', 'READY_FOR_SHIPMENT');
        $this->stockOut($order, 3, '2026-09-16 10:00:00');
        $this->stockOut($order, 2, '2026-09-17 10:00:00');

        $out = $this->rows('stock.stock_out');
        $this->assertSame([2, 3], array_column($out, 'quantity')); // newest first
        $this->assertSame('ORD-9', $out[0]['reference']);
        $this->assertSame($this->manager->name, $out[0]['performed_by']);

        $summary = $this->rows('stock.movement_summary');
        $this->assertCount(1, $summary);
        $this->assertSame(25, $summary[0]['stock_in_total']);
        $this->assertSame(5, $summary[0]['stock_out_total']);
        $this->assertSame(20, $summary[0]['net_movement']);
        $this->assertSame(3, $summary[0]['transactions']);

        $this->assertSame(['Stock Out', 'Stock Out'], array_column($this->rows('stock.movement_ledger', ['movement_type' => 'STOCK_OUT']), 'movement_type'));
        $this->assertCount(3, $this->rows('stock.movement_ledger'));
    }

    public function test_date_filters_restrict_transaction_reports(): void
    {
        $order = $this->order('ORD-2', 'READY_FOR_SHIPMENT');
        $this->stockOut($order, 3, '2026-09-01 10:00:00');
        $this->stockOut($order, 4, '2026-09-15 23:59:00');
        $this->stockOut($order, 5, '2026-09-16 00:00:00');

        $this->assertSame([4], array_column($this->rows('stock.stock_out', ['date_from' => '2026-09-10', 'date_to' => '2026-09-15']), 'quantity'));
        $this->assertSame([5, 4], array_column($this->rows('stock.stock_out', ['date_from' => '2026-09-15']), 'quantity'));
        $this->assertSame([3], array_column($this->rows('stock.stock_out', ['date_to' => '2026-09-01']), 'quantity'));
        $this->assertSame(['ORD-2'], array_column($this->rows('orders.summary', ['date_from' => '2026-09-15', 'date_to' => '2026-09-15']), 'order_no'));
        $this->assertSame([], $this->rows('orders.summary', ['date_from' => '2026-09-16']));
    }

    public function test_invalid_date_range_is_rejected(): void
    {
        $this->preview('stock.stock_out', ['date_from' => '2026-09-20', 'date_to' => '2026-09-01'])
            ->assertUnprocessable()->assertJsonValidationErrors('date_to');
        $this->actingAs($this->admin)->postJson('/api/admin/reports/export', ['report_key' => 'stock.stock_out', 'format' => 'CSV', 'date_from' => '2026-09-20', 'date_to' => '2026-09-01'])
            ->assertUnprocessable()->assertJsonValidationErrors('date_to');
        $this->preview('stock.stock_out', ['date_from' => '20-09-2026'])->assertUnprocessable()->assertJsonValidationErrors('date_from');
    }

    // ------------------------------------------------------------- receiving

    public function test_receiving_report_uses_real_receiving_data(): void
    {
        [, $receiving] = $this->inspectedReceiving();
        $rows = $this->rows('receiving.summary');

        $this->assertCount(1, $rows);
        $this->assertSame('RCV-00001', $rows[0]['receiving_no']);
        $this->assertSame('PO-2026-0001', $rows[0]['po_no']);
        $this->assertSame('DR-77', $rows[0]['reference_no']);
        $this->assertSame(30, $rows[0]['delivered_qty']);
        $this->assertSame(25, $rows[0]['accepted_qty']);
        $this->assertSame(5, $rows[0]['rejected_qty']);
        $this->assertSame('Completed', $rows[0]['qa_status']);
        $this->assertSame($this->qa->name, $rows[0]['qa_assignee']);
        $this->assertSame('2026-09-10', $rows[0]['delivery_date']);
        $this->assertSame('No', $rows[0]['is_replacement']);
        $this->assertSame(['RCV-00001'], array_column($this->rows('receiving.completed'), 'receiving_no'));
        $this->assertSame([], $this->rows('receiving.pending'));
        $this->assertSame(['RCV-00001'], array_column($this->rows('receiving.summary', ['supplier_id' => $this->supplier->id]), 'receiving_no'));
    }

    public function test_replacement_receiving_appears_linked_and_is_not_counted_as_received(): void
    {
        [$po, , $case] = $this->inspectedReceiving();
        $this->replacementFor($case, $po);

        $replacements = $this->rows('receiving.replacements');
        $this->assertCount(1, $replacements);
        $this->assertSame('RCV-00002', $replacements[0]['receiving_no']);
        $this->assertSame('Yes', $replacements[0]['is_replacement']);
        $this->assertSame(sprintf('RJ-%06d', $case->id), $replacements[0]['original_case']);
        $this->assertSame('RCV-00001', $replacements[0]['original_receiving']);
        $this->assertSame('Awaiting Replacement', $replacements[0]['status']);
        $this->assertSame('Awaiting Delivery', $replacements[0]['qa_status']);
        $this->assertSame(5, $replacements[0]['expected_qty']);
        $this->assertSame(0, $replacements[0]['delivered_qty']);
        $this->assertSame(0, $replacements[0]['stocked_in_qty']);
        $this->assertSame('REPLACEMENT_PENDING', $replacements[0]['case_status']);

        $this->assertSame(['RCV-00002'], array_column($this->rows('receiving.pending'), 'receiving_no'));
        // Expected replacement never becomes Stock In or inventory.
        $this->assertCount(1, $this->rows('stock.stock_in'));
        $this->assertSame(25, $this->rows('stock.movement_summary')[0]['stock_in_total']);

        $rejection = $this->rows('suppliers.rejections')[0];
        $this->assertSame('RCV-00002', $rejection['replacement_receiving']);
        $this->assertSame('Awaiting Replacement', $rejection['replacement_status']);
        $this->assertSame('Replacement requested', $rejection['resolution']);
    }

    // --------------------------------------------------- shipment and orders

    public function test_shipment_reports_use_order_statuses_and_recorded_history(): void
    {
        $this->order('ORD-READY', 'READY_FOR_SHIPMENT', history: ['READY_FOR_SHIPMENT' => '2026-09-15 12:00:00']);
        $this->order('ORD-TRANSIT', 'IN_TRANSIT', history: ['READY_FOR_SHIPMENT' => '2026-09-15 12:00:00', 'IN_TRANSIT' => '2026-09-16 08:00:00']);
        $this->order('ORD-DONE', 'DELIVERED', history: ['READY_FOR_SHIPMENT' => '2026-09-15 12:00:00', 'DELIVERED' => '2026-09-18 15:00:00']);
        $this->order('ORD-CANCEL-SHIP', 'CANCELLED', history: ['READY_FOR_SHIPMENT' => '2026-09-15 12:00:00', 'CANCELLED' => '2026-09-16 12:00:00']);
        $this->order('ORD-CANCEL-EARLY', 'CANCELLED', history: ['CANCELLED' => '2026-09-15 12:00:00']);
        $this->order('ORD-NEW', 'NEW');

        $this->assertEqualsCanonicalizing(['ORD-READY', 'ORD-TRANSIT', 'ORD-DONE'], array_column($this->rows('shipment.summary'), 'shipment_no'));
        $this->assertSame(['ORD-READY'], array_column($this->rows('shipment.ready'), 'shipment_no'));
        $transit = $this->rows('shipment.in_transit');
        $this->assertSame(['ORD-TRANSIT'], array_column($transit, 'shipment_no'));
        $this->assertNotNull($transit[0]['in_transit_at']);
        $this->assertNull($transit[0]['delivered_at']); // never invented
        $delivered = $this->rows('shipment.delivered');
        $this->assertSame(['ORD-DONE'], array_column($delivered, 'shipment_no'));
        $this->assertStringStartsWith('2026-09-18T15:00:00', $delivered[0]['delivered_at']);
        $this->assertSame(['ORD-CANCEL-SHIP'], array_column($this->rows('shipment.cancelled'), 'shipment_no'));
        $this->assertSame('Main Warehouse', $delivered[0]['warehouse']);

        $orders = collect($this->rows('orders.summary'))->keyBy('order_no');
        $this->assertCount(6, $orders);
        $this->assertSame('Logistics', $orders['ORD-TRANSIT']['fulfillment_stage']);
        $this->assertSame('Order Intake', $orders['ORD-NEW']['fulfillment_stage']);
        $this->assertSame(['ORD-DONE'], array_column($this->rows('orders.completed'), 'order_no'));
        $this->assertEqualsCanonicalizing(['ORD-READY', 'ORD-TRANSIT', 'ORD-NEW'], array_column($this->rows('orders.active'), 'order_no'));
        $fulfillment = collect($this->rows('orders.fulfillment'))->keyBy('status');
        $this->assertSame(2, $fulfillment['CANCELLED']['orders']);
        $this->assertSame(1, $fulfillment['NEW']['orders']);
    }

    // ----------------------------------------------------------- procurement

    public function test_procurement_reports_use_real_requests_and_purchase_orders(): void
    {
        $request = ReplenishmentRequest::create([
            'request_no' => 'RR-0001', 'requested_by' => $this->manager->id, 'warehouse_id' => $this->main->id, 'product_id' => $this->low->id,
            'requested_qty' => 40, 'priority' => 'High', 'status' => ReplenishmentRequest::STATUS_PO_CREATED, 'submitted_at' => '2026-09-05 09:00:00',
        ]);
        ReplenishmentRequest::create([
            'request_no' => 'RR-0002', 'requested_by' => $this->manager->id, 'warehouse_id' => $this->main->id, 'product_id' => $this->out->id,
            'requested_qty' => 10, 'priority' => 'Critical', 'status' => ReplenishmentRequest::STATUS_PENDING, 'submitted_at' => '2026-09-06 09:00:00',
        ]);
        $po = $this->purchaseOrder('PO-2026-0009', 'Sent to Supplier');
        $po->update(['replenishment_request_id' => $request->id, 'sent_at' => '2026-09-07 10:00:00']);

        $requests = collect($this->rows('procurement.replenishment'))->keyBy('request_no');
        $this->assertSame(40, $requests['RR-0001']['quantity']);
        $this->assertSame('PO Created', $requests['RR-0001']['status']);
        $this->assertSame('PO-2026-0009', $requests['RR-0001']['linked_po']);
        $this->assertSame($this->manager->name, $requests['RR-0001']['requester']);
        $this->assertSame(['RR-0002'], array_column($this->rows('procurement.replenishment', ['status' => 'pending']), 'request_no'));

        $orders = $this->rows('procurement.purchase_orders');
        $this->assertCount(1, $orders);
        $this->assertSame('Acme Chemicals (snapshot)', $orders[0]['supplier_name']); // snapshot preserved
        $this->assertSame('SUP-001', $orders[0]['supplier_code']);
        $this->assertSame(30, $orders[0]['quantity']);
        $this->assertSame('RR-0001', $orders[0]['linked_request']);
        $this->assertNotNull($orders[0]['sent_at']);
        $this->assertArrayNotHasKey('total_amount', $orders[0]);

        $status = collect($this->rows('procurement.status'))->map(fn ($row) => "{$row['record_type']}|{$row['status']}|{$row['records']}|{$row['total_quantity']}")->all();
        $this->assertEqualsCanonicalizing(['Replenishment Request|PO Created|1|40', 'Replenishment Request|Pending|1|10', 'Purchase Order|Sent to Supplier|1|30'], $status);
    }

    // ------------------------------------------------------------- suppliers

    public function test_supplier_reports_use_registered_suppliers_and_real_activity(): void
    {
        Supplier::create(['supplier_code' => 'SUP-002', 'name' => 'Idle Supplier', 'status' => 'INACTIVE']);
        $this->inspectedReceiving();

        $directory = collect($this->rows('suppliers.directory'))->keyBy('supplier_code');
        $this->assertCount(2, $directory);
        $this->assertSame('Juan', $directory['SUP-001']['contact_person']);
        $this->assertSame('Makati', $directory['SUP-001']['location']);
        $this->assertSame('Net 30', $directory['SUP-001']['payment_terms']);
        $this->assertSame(['SUP-002'], array_column($this->rows('suppliers.directory', ['status' => 'INACTIVE']), 'supplier_code'));

        $activity = collect($this->rows('suppliers.activity'))->keyBy('supplier_code');
        $this->assertSame(1, $activity['SUP-001']['po_count']);
        $this->assertSame(1, $activity['SUP-001']['completed_po_count']);
        $this->assertSame(1, $activity['SUP-001']['receiving_count']);
        $this->assertSame(30, $activity['SUP-001']['delivered_qty']);
        $this->assertSame(25, $activity['SUP-001']['accepted_qty']);
        $this->assertSame(5, $activity['SUP-001']['rejected_qty']);
        $this->assertSame(1, $activity['SUP-001']['rejection_cases']);
        $this->assertSame(0, $activity['SUP-002']['po_count']);
        $this->assertArrayNotHasKey('rating', $activity['SUP-001']);
    }

    public function test_supplier_rejection_report_uses_real_rejection_cases(): void
    {
        [, , $case] = $this->inspectedReceiving();
        $rows = $this->rows('suppliers.rejections');

        $this->assertCount(1, $rows);
        $this->assertSame(sprintf('RJ-%06d', $case->id), $rows[0]['case_no']);
        $this->assertSame('RCV-00001', $rows[0]['receiving_no']);
        $this->assertSame('PO-2026-0001', $rows[0]['po_no']);
        $this->assertSame('Acme Chemicals', $rows[0]['supplier']);
        $this->assertSame([30, 25, 5], [$rows[0]['delivered'], $rows[0]['accepted'], $rows[0]['rejected']]);
        $this->assertSame('Partial', $rows[0]['qa_result']);
        $this->assertSame('Sent', $rows[0]['status']);
        $this->assertStringStartsWith('2026-09-10T12:00:00', $rows[0]['sent_at']);
        $this->assertSame([], $this->rows('suppliers.rejections', ['status' => 'RESOLVED']));
    }

    // ------------------------------------------------------------- warehouse

    public function test_warehouse_capacity_report_uses_the_shared_capacity_service(): void
    {
        Inventory::query()->where('barcode', 'INV-OUT')->update(['available_stock' => 19]);
        $rows = collect($this->rows('warehouse.capacity'))->keyBy('code');

        foreach ([$this->main, $this->second] as $warehouse) {
            $snapshot = WarehouseCapacity::snapshot($warehouse->fresh());
            $this->assertSame($snapshot['utilized'], $rows[$warehouse->code]['used']);
            $this->assertSame($snapshot['available'], $rows[$warehouse->code]['available_capacity']);
            $this->assertEquals($snapshot['utilization_percentage'], $rows[$warehouse->code]['utilization']);
            $this->assertSame(strtoupper($snapshot['capacity_state']), $rows[$warehouse->code]['alert_level']);
        }
        $this->assertSame(59, $rows['WH-MAIN']['used']);
        $this->assertSame('WARNING', $rows['WH-NORTH']['alert_level']);
        $this->assertSame(['WH-NORTH'], array_column($this->rows('warehouse.capacity_alerts'), 'code'));

        $this->actingAs($this->admin)->getJson('/api/admin/reports/dashboard')->assertOk()
            ->assertJsonPath('warehouse_capacity_overview.0.code', 'WH-MAIN')
            ->assertJsonPath('warehouse_capacity_overview.0.used', 59)
            ->assertJsonPath('metrics.warehouse_capacity.used', 78)
            ->assertJsonPath('metrics.warehouse_capacity.total', 120);
    }

    // ---------------------------------------------------------------- system

    public function test_audit_log_report_excludes_sensitive_fields(): void
    {
        AuditLog::create([
            'actor_user_id' => $this->admin->id, 'actor_name' => $this->admin->name, 'action' => 'LOGIN', 'module' => 'Authentication',
            'status' => 'SUCCESS', 'details' => 'Signed in', 'ip_address' => '10.0.0.5', 'user_agent' => 'SecretAgent/1.0',
            'metadata' => ['otp_code' => '123456', 'token' => 'plain-token', 'password' => 'hunter2'],
        ]);
        AuditLog::create(['actor_identifier' => 'nobody@example.com', 'action' => 'LOGIN_FAILED', 'module' => 'Authentication', 'status' => 'FAILED', 'ip_address' => '10.0.0.6']);

        $response = $this->preview('system.audit_logs', ['per_page' => 100])->assertOk();
        $rows = $response->json('rows');
        $this->assertSame(['created_at', 'user', 'action', 'module', 'resource', 'status', 'ip_address', 'details'], array_keys($rows[0]));
        foreach (['123456', 'plain-token', 'hunter2', 'SecretAgent'] as $secret) {
            $this->assertStringNotContainsString($secret, $response->getContent());
        }
        $this->assertSame(['LOGIN_FAILED'], array_column($this->rows('system.audit_logs', ['status' => 'FAILED']), 'action'));

        $export = $this->actingAs($this->admin)->postJson('/api/admin/reports/export', ['report_key' => 'system.audit_logs', 'format' => 'CSV'])->assertOk();
        $csv = file_get_contents($export->baseResponse->getFile()->getPathname());
        foreach (['123456', 'plain-token', 'hunter2', 'SecretAgent'] as $secret) {
            $this->assertStringNotContainsString($secret, $csv);
        }

        $activity = collect($this->rows('system.user_activity'))->keyBy('user');
        $this->assertSame(1, $activity[$this->admin->name]['logins']);
    }

    // --------------------------------------------------------------- exports

    public function test_csv_export_returns_actual_rows_and_records_history(): void
    {
        $response = $this->actingAs($this->admin)->postJson('/api/admin/reports/export', ['report_key' => 'inventory.summary', 'format' => 'CSV', 'warehouse_id' => $this->main->id]);

        $response->assertOk()->assertHeader('X-Report-Rows', '2');
        $this->assertStringStartsWith('text/csv', $response->headers->get('Content-Type'));
        $this->assertMatchesRegularExpression('/Inventory_Summary_Report_\d{4}-\d{2}-\d{2}_\d{6}\.csv/', $response->headers->get('Content-Disposition'));
        $csv = file_get_contents($response->baseResponse->getFile()->getPathname());
        $lines = array_values(array_filter(explode("\n", trim(ltrim($csv, "\xEF\xBB\xBF")))));
        $this->assertCount(3, $lines);
        $this->assertStringStartsWith('Product,Barcode,Category', $lines[0]);
        $this->assertStringContainsString('INV-HEALTHY', $csv);
        $this->assertStringContainsString('INV-LOW', $csv);
        $this->assertStringNotContainsString('INV-OUT', $csv);

        $history = ReportExport::query()->sole();
        $this->assertSame(['EXPORT', 'SUCCESS', 'CSV', 2, 'inventory.summary', $this->admin->id], [$history->action, $history->status, $history->format, $history->row_count, $history->report_key, $history->user_id]);
        $this->assertSame(['warehouse_id' => $this->main->id], $history->filters);
        $this->assertGreaterThan(0, $history->file_size);
        $this->assertDatabaseHas('audit_logs', ['action' => 'REPORT_EXPORTED', 'module' => 'Reports', 'status' => 'SUCCESS', 'resource_id' => 'inventory.summary']);

        $dashboard = $this->actingAs($this->admin)->getJson('/api/admin/reports/dashboard')->assertOk();
        $dashboard->assertJsonPath('metrics.exports_today', 1)
            ->assertJsonPath('metrics.generated_today', 1)
            ->assertJsonPath('recent_exports.0.report_key', 'inventory.summary')
            ->assertJsonPath('recent_exports.0.status', 'SUCCESS')
            ->assertJsonPath('recent_exports.0.row_count', 2);
        $this->assertNotNull($dashboard->json('metrics.last_generated_at'));
        $definition = collect($dashboard->json('reports_list'))->firstWhere('key', 'inventory.summary');
        $this->assertNotNull($definition['last_generated_at']);
    }

    public function test_csv_export_neutralizes_formula_values(): void
    {
        $this->healthy->update(['name' => '=HYPERLINK("http://x")']);
        $response = $this->actingAs($this->admin)->postJson('/api/admin/reports/export', ['report_key' => 'inventory.summary', 'format' => 'CSV'])->assertOk();

        $this->assertStringContainsString("'=HYPERLINK", file_get_contents($response->baseResponse->getFile()->getPathname()));
    }

    public function test_excel_and_pdf_exports_are_real_files_and_only_offered_where_supported(): void
    {
        $xlsx = $this->actingAs($this->admin)->postJson('/api/admin/reports/export', ['report_key' => 'inventory.summary', 'format' => 'XLSX'])->assertOk();
        $this->assertSame('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', $xlsx->headers->get('Content-Type'));
        $zip = new ZipArchive();
        $this->assertTrue($zip->open($xlsx->baseResponse->getFile()->getPathname()) === true);
        $sheet = $zip->getFromName('xl/worksheets/sheet1.xml');
        $zip->close();
        $this->assertStringContainsString('INV-HEALTHY', $sheet);
        $this->assertStringContainsString('<v>50</v>', $sheet);

        $pdf = $this->actingAs($this->admin)->postJson('/api/admin/reports/export', ['report_key' => 'inventory.summary', 'format' => 'PDF'])->assertOk();
        $this->assertSame('application/pdf', $pdf->headers->get('Content-Type'));
        $this->assertStringStartsWith('%PDF', file_get_contents($pdf->baseResponse->getFile()->getPathname()));

        $this->actingAs($this->admin)->postJson('/api/admin/reports/export', ['report_key' => 'inventory.summary', 'format' => 'DOCX'])
            ->assertUnprocessable()->assertJsonValidationErrors('format');
        $this->actingAs($this->admin)->postJson('/api/admin/reports/export', ['report_key' => 'ai.forecast', 'format' => 'CSV'])
            ->assertUnprocessable()->assertJsonValidationErrors('report_key');

        $definitions = collect($this->actingAs($this->admin)->getJson('/api/admin/reports/definitions')->json('data'))->keyBy('key');
        $this->assertSame(['CSV', 'XLSX', 'PDF'], $definitions['inventory.summary']['formats']);
        $this->assertSame([], $definitions['ai.forecast']['formats']);
        $this->assertSame(2, ReportExport::query()->where('status', 'SUCCESS')->count());
    }

    public function test_pdf_export_refuses_reports_beyond_the_pdf_row_limit(): void
    {
        $order = $this->order('ORD-BULK', 'READY_FOR_SHIPMENT');
        $item = $order->items()->first();
        $inventory = Inventory::query()->where('barcode', 'INV-HEALTHY')->sole();
        $rows = collect(range(1, 1001))->map(fn () => [
            'reference_no' => (string) Str::uuid(), 'idempotency_key' => (string) Str::uuid(), 'order_id' => $order->id, 'order_item_id' => $item->id,
            'inventory_id' => $inventory->id, 'product_id' => $this->healthy->id, 'warehouse_id' => $this->main->id, 'barcode' => 'INV-HEALTHY',
            'quantity' => 1, 'unit' => 'kg', 'created_at' => now(), 'updated_at' => now(),
        ]);
        StockOutTransaction::insert($rows->all());

        $this->actingAs($this->admin)->postJson('/api/admin/reports/export', ['report_key' => 'stock.stock_out', 'format' => 'PDF'])
            ->assertUnprocessable()->assertJsonValidationErrors('format');
        $this->actingAs($this->admin)->postJson('/api/admin/reports/export', ['report_key' => 'stock.stock_out', 'format' => 'CSV'])
            ->assertOk()->assertHeader('X-Report-Rows', '1001');
    }

    public function test_failed_export_is_recorded_without_leaking_internals(): void
    {
        $this->mock(XlsxReportWriter::class)->shouldReceive('write')->andThrow(new RuntimeException('disk /var/secret full'));

        $response = $this->actingAs($this->admin)->postJson('/api/admin/reports/export', ['report_key' => 'inventory.summary', 'format' => 'XLSX']);

        $response->assertStatus(500)->assertJsonPath('message', 'The report could not be generated. Please try again.');
        $this->assertStringNotContainsString('/var/secret', $response->getContent());
        $history = ReportExport::query()->sole();
        $this->assertSame(['FAILED', 'XLSX', 'Report generation failed.'], [$history->status, $history->format, $history->error_message]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'REPORT_EXPORT_FAILED', 'status' => 'FAILED']);
        $this->actingAs($this->admin)->getJson('/api/admin/reports/dashboard')
            ->assertJsonPath('metrics.exports_today', 0)
            ->assertJsonPath('recent_exports.0.status', 'FAILED');
    }

    public function test_preview_is_paginated_and_recorded_once_per_generation(): void
    {
        $first = $this->preview('inventory.summary', ['per_page' => 5])->assertOk()
            ->assertJsonPath('total', 3)->assertJsonPath('page', 1)->assertJsonPath('report.key', 'inventory.summary');
        $this->assertNotEmpty($first->json('generated_at'));
        $this->assertSame('Product', $first->json('report.columns.0.label'));
        $this->preview('inventory.summary', ['per_page' => 5, 'page' => 2])->assertOk()->assertJsonCount(0, 'rows');
        $this->preview('stock.stock_out', ['warehouse_id' => $this->main->id, 'date_from' => '2026-09-01'])->assertOk()
            ->assertJsonPath('filters_applied.0', 'Transaction date from 2026-09-01')
            ->assertJsonPath('filters_applied.1', 'Warehouse: Main Warehouse');

        $this->assertSame(2, ReportExport::query()->where('action', 'PREVIEW')->count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'REPORT_PREVIEWED', 'resource_id' => 'inventory.summary']);
        $this->actingAs($this->admin)->getJson('/api/admin/reports/dashboard')
            ->assertJsonPath('metrics.generated_today', 2)->assertJsonPath('metrics.exports_today', 0);
    }

    public function test_history_is_newest_first(): void
    {
        $this->actingAs($this->admin)->postJson('/api/admin/reports/export', ['report_key' => 'inventory.summary', 'format' => 'CSV'])->assertOk();
        $this->travel(1)->minutes();
        $this->actingAs($this->admin)->postJson('/api/admin/reports/export', ['report_key' => 'suppliers.directory', 'format' => 'CSV'])->assertOk();

        $this->actingAs($this->admin)->getJson('/api/admin/reports/history?action=EXPORT')->assertOk()
            ->assertJsonPath('data.0.report_key', 'suppliers.directory')
            ->assertJsonPath('data.1.report_key', 'inventory.summary');
    }

    // ------------------------------------------------------------ AI forecast

    public function test_ai_forecast_reports_do_not_fabricate_data(): void
    {
        $definitions = collect($this->actingAs($this->admin)->getJson('/api/admin/reports/definitions')->json('data'))->where('category', 'ai-forecast');
        $this->assertNotEmpty($definitions);
        foreach ($definitions as $definition) {
            $this->assertFalse($definition['available']);
            $this->assertSame([], $definition['formats']);
            $this->assertStringContainsString('No', $definition['unavailable_reason']);
            $this->preview($definition['key'])->assertUnprocessable()->assertJsonValidationErrors('report_key');
        }
        $this->actingAs($this->admin)->getJson('/api/admin/reports/dashboard')->assertOk()->assertJsonPath('metrics.ai_forecast_accuracy', null);
        $this->assertDatabaseCount('report_exports', 0);
    }

    // -------------------------------------------------------------- schedules

    public function test_schedule_is_persisted_for_admin_recipients_only(): void
    {
        $payload = ['report_key' => 'stock.stock_out', 'format' => 'CSV', 'frequency' => 'WEEKLY', 'run_time' => '07:30', 'day_of_week' => 1, 'date_window' => 'LAST_7_DAYS', 'warehouse_id' => $this->main->id];

        $this->actingAs($this->admin)->postJson('/api/admin/reports/schedules', $payload + ['recipient_user_id' => $this->manager->id])
            ->assertUnprocessable()->assertJsonValidationErrors('recipient_user_id');
        $this->actingAs($this->admin)->postJson('/api/admin/reports/schedules', $payload + ['recipient_user_id' => $this->admin->id, 'recipient' => 'attacker@example.com'])
            ->assertUnprocessable()->assertJsonValidationErrors('recipient');
        $this->actingAs($this->admin)->postJson('/api/admin/reports/schedules', ['date_window' => 'LAST_7_DAYS', 'report_key' => 'suppliers.directory'] + $payload + ['recipient_user_id' => $this->admin->id])
            ->assertUnprocessable();
        $this->actingAs($this->admin)->postJson('/api/admin/reports/schedules', ['report_key' => 'ai.forecast', 'format' => 'CSV', 'frequency' => 'DAILY', 'run_time' => '07:30', 'recipient_user_id' => $this->admin->id])
            ->assertUnprocessable()->assertJsonValidationErrors('report_key');

        $response = $this->actingAs($this->admin)->postJson('/api/admin/reports/schedules', $payload + ['recipient_user_id' => $this->admin->id])->assertCreated()
            ->assertJsonPath('data.status', 'ACTIVE')->assertJsonPath('data.recipient.id', $this->admin->id)
            ->assertJsonPath('scheduler.last_run_at', null)->assertJsonPath('scheduler.running', false);
        $schedule = ReportSchedule::query()->sole();
        $this->assertSame(1, $schedule->next_run_at->dayOfWeek);
        $this->assertSame('07:30', $schedule->next_run_at->format('H:i'));
        $this->assertTrue($schedule->next_run_at->isFuture());
        $this->assertSame(['warehouse_id' => $this->main->id], $schedule->filters);
        $this->assertDatabaseHas('audit_logs', ['action' => 'REPORT_SCHEDULE_CREATED']);
        $this->actingAs($this->admin)->getJson('/api/admin/reports/dashboard')->assertJsonPath('metrics.pending_reports', 1);

        $this->actingAs($this->admin)->patchJson("/api/admin/reports/schedules/{$response->json('data.id')}", ['status' => 'PAUSED'])->assertOk()->assertJsonPath('data.next_run_at', null);
        $this->actingAs($this->admin)->getJson('/api/admin/reports/dashboard')->assertJsonPath('metrics.pending_reports', 0);
        $this->actingAs($this->admin)->deleteJson("/api/admin/reports/schedules/{$response->json('data.id')}")->assertOk();
        $this->assertDatabaseCount('report_schedules', 0);
    }

    public function test_scheduler_command_delivers_due_reports_and_records_history(): void
    {
        Mail::fake();
        $schedule = ReportSchedule::create([
            'created_by' => $this->admin->id, 'report_key' => 'inventory.low_stock', 'format' => 'CSV', 'frequency' => 'DAILY', 'run_time' => '06:00',
            'date_window' => 'ALL', 'recipient_user_id' => $this->admin->id, 'status' => 'ACTIVE', 'next_run_at' => now()->subMinute(),
        ]);
        $notDue = ReportSchedule::create([
            'created_by' => $this->admin->id, 'report_key' => 'inventory.summary', 'format' => 'CSV', 'frequency' => 'DAILY', 'run_time' => '06:00',
            'recipient_user_id' => $this->admin->id, 'status' => 'ACTIVE', 'next_run_at' => now()->addHour(),
        ]);

        $this->artisan('reports:run-scheduled')->assertSuccessful();

        Mail::assertSent(ScheduledReportMail::class, fn (ScheduledReportMail $mail) => $mail->hasTo($this->admin->email) && $mail->rowCount === 1);
        Mail::assertSentCount(1);
        $schedule->refresh();
        $this->assertSame('SUCCESS', $schedule->last_status);
        $this->assertTrue($schedule->next_run_at->isFuture());
        $this->assertNull($notDue->fresh()->last_run_at);
        $this->assertDatabaseHas('report_exports', ['source' => 'SCHEDULED', 'status' => 'SUCCESS', 'report_schedule_id' => $schedule->id, 'row_count' => 1]);

        $this->actingAs($this->admin)->getJson('/api/admin/reports/schedules')->assertOk()->assertJsonPath('scheduler.running', true);

        // A second run does not resend a schedule that is no longer due.
        $this->artisan('reports:run-scheduled')->assertSuccessful();
        Mail::assertSentCount(1);
    }

    public function test_scheduler_does_not_deliver_to_a_demoted_recipient(): void
    {
        Mail::fake();
        $recipient = $this->user('ADMIN');
        $schedule = ReportSchedule::create([
            'created_by' => $this->admin->id, 'report_key' => 'inventory.summary', 'format' => 'CSV', 'frequency' => 'DAILY', 'run_time' => '06:00',
            'recipient_user_id' => $recipient->id, 'status' => 'ACTIVE', 'next_run_at' => now()->subMinute(),
        ]);
        $recipient->update(['status' => 'SUSPENDED']);

        $this->artisan('reports:run-scheduled')->assertSuccessful();

        Mail::assertNothingSent();
        $this->assertSame('FAILED', $schedule->fresh()->last_status);
        $this->assertDatabaseHas('audit_logs', ['action' => 'REPORT_SCHEDULE_DELIVERY_FAILED']);
    }

    // ------------------------------------------------------------ regression

    public function test_reports_are_read_only_and_existing_modules_keep_working(): void
    {
        $this->inspectedReceiving();
        $before = Inventory::query()->orderBy('id')->get(['id', 'available_stock', 'reserved_stock', 'status', 'updated_at'])->toArray();

        foreach (collect($this->actingAs($this->admin)->getJson('/api/admin/reports/definitions')->json('data'))->where('available', true) as $definition) {
            $this->preview($definition['key'])->assertOk();
        }

        $this->assertSame($before, Inventory::query()->orderBy('id')->get(['id', 'available_stock', 'reserved_stock', 'status', 'updated_at'])->toArray());
        $this->assertSame('SENT', SupplierRejectionCase::query()->sole()->status);
        $this->actingAs($this->admin)->getJson('/api/inventory')->assertOk()->assertJsonCount(3, 'data');
        $this->actingAs($this->admin)->getJson('/api/admin/rejected-items')->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($this->manager)->getJson('/api/plant-manager/reports/generate?type=inventory&format=preview')->assertOk();
    }
}
