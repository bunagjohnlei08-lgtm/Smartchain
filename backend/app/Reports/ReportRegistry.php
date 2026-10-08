<?php

namespace App\Reports;

use App\Models\AuditLog;
use App\Models\Order;
use App\Models\ReplenishmentRequest;
use App\Models\Supplier;
use App\Models\Warehouse;
use App\Support\WarehouseCapacity;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\Query\JoinClause;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Central registry of every Admin report. Each definition owns its fixed
 * column set and a query over the existing SmartChain tables; nothing here is
 * driven by client-supplied table or column names.
 */
class ReportRegistry
{
    public const CATEGORIES = [
        'inventory' => 'Inventory Reports',
        'stock-movement' => 'Stock Movement Reports',
        'receiving' => 'Receiving Reports',
        'shipment' => 'Shipment Reports',
        'order' => 'Order Reports',
        'procurement' => 'Procurement Reports',
        'supplier' => 'Supplier Reports',
        'warehouse' => 'Warehouse Reports',
        'ai-forecast' => 'AI Forecast Reports',
        'system' => 'System Reports',
    ];

    /** Same classification as the Stock Status Overview: zero, at/below reorder level, above it. */
    public const STOCK_STATUS_SQL = "CASE WHEN inventories.available_stock = 0 THEN 'Out of Stock' WHEN inventories.available_stock <= products.reorder_level THEN 'Low Stock' ELSE 'Healthy' END";

    public const STOCK_STATUSES = ['Healthy' => 'Healthy', 'Low Stock' => 'Low Stock', 'Out of Stock' => 'Out of Stock'];

    public const RECEIVING_STATUSES = [
        'Pending QA' => 'Pending QA', 'Awaiting Replacement' => 'Awaiting Replacement',
        'Passed' => 'Passed', 'Partial' => 'Partial', 'Rejected' => 'Rejected',
    ];

    public const SHIPMENT_STATUSES = ['FOR_PACKING', 'PACKING', 'READY_FOR_SHIPMENT', 'FORWARDED_TO_LOGISTICS', 'IN_TRANSIT', 'DELIVERED'];

    /** Groups the existing order statuses into the Order Management workflow stages. */
    public const FULFILLMENT_STAGES = [
        'NEW' => 'Order Intake',
        'ASSIGNED' => 'Preparation', 'PREPARING' => 'Preparation',
        'READY_FOR_STOCK_OUT' => 'Stock Out', 'STOCK_OUT_IN_PROGRESS' => 'Stock Out',
        'FOR_PACKING' => 'Packing', 'PACKING' => 'Packing',
        'STOCK_OUT_COMPLETED' => 'Ready for Shipment', 'READY_FOR_SHIPMENT' => 'Ready for Shipment',
        'FORWARDED_TO_LOGISTICS' => 'Logistics', 'IN_TRANSIT' => 'Logistics',
        'DELIVERED' => 'Delivered', 'CANCELLED' => 'Cancelled',
    ];

    public const REPLENISHMENT_STATUSES = [
        ReplenishmentRequest::STATUS_DRAFT => 'Draft',
        ReplenishmentRequest::STATUS_PENDING => 'Pending',
        ReplenishmentRequest::STATUS_APPROVED => 'Approved',
        ReplenishmentRequest::STATUS_REJECTED => 'Rejected',
        ReplenishmentRequest::STATUS_PO_CREATED => 'PO Created',
    ];

    public const PURCHASE_ORDER_STATUSES = ['Pending Approval', 'Approved', 'Sent to Supplier', 'Completed', 'Cancelled'];
    public const SUPPLIER_STATUSES = [
        Supplier::STATUS_ACTIVE => 'Active',
        Supplier::STATUS_ON_HOLD => 'On Hold',
        Supplier::STATUS_INACTIVE => 'Inactive',
        Supplier::STATUS_PENDING_REMOVAL => 'Recently Removed',
        Supplier::STATUS_ARCHIVED => 'Archived',
    ];
    public const REJECTION_STATUSES = [
        'PENDING_REVIEW' => 'Pending Review', 'SENDING' => 'Sending', 'SENT' => 'Sent', 'FAILED' => 'Send Failed',
        'REPLACEMENT_PENDING' => 'Replacement Pending', 'RESOLVED' => 'Resolved',
    ];
    public const WAREHOUSE_STATUSES = ['Active' => 'Active', 'Inactive' => 'Inactive'];

    /** @var array<string, ReportDefinition>|null */
    private ?array $definitions = null;

    /** @return array<string, ReportDefinition> */
    public function all(): array
    {
        return $this->definitions ??= collect($this->build())->keyBy('key')->all();
    }

    public function find(string $key): ?ReportDefinition
    {
        return $this->all()[$key] ?? null;
    }

    public function keys(): array
    {
        return array_keys($this->all());
    }

    /** @return list<ReportDefinition> */
    private function build(): array
    {
        $inventoryColumns = [
            'product' => ['Product', 'text'], 'barcode' => ['Barcode', 'text'], 'category' => ['Category', 'text'],
            'brand' => ['Brand', 'text'], 'warehouse' => ['Warehouse', 'text'], 'available' => ['Available', 'number'],
            'reserved' => ['Reserved', 'number'], 'total_stock' => ['Total Stock', 'number'], 'unit' => ['Unit', 'text'],
            'stock_status' => ['Stock Status', 'status'], 'recorded_status' => ['Recorded Status', 'status'],
            'reorder_level' => ['Reorder Level', 'number'], 'last_updated' => ['Last Updated', 'datetime'],
        ];
        $inventoryFilters = ['date', 'warehouse', 'product', 'category'];
        $stockInColumns = [
            'occurred_at' => ['Date / Time', 'datetime'], 'movement_type' => ['Movement', 'status'], 'product' => ['Product', 'text'],
            'barcode' => ['Barcode', 'text'], 'quantity' => ['Quantity', 'number'], 'unit' => ['Unit', 'text'],
            'warehouse' => ['Warehouse', 'text'], 'reference' => ['Receiving No.', 'text'], 'po_no' => ['PO No.', 'text'],
            'supplier' => ['Supplier', 'text'], 'performed_by' => ['Performed By', 'text'], 'status' => ['Status', 'status'],
        ];
        $stockOutColumns = [
            'occurred_at' => ['Date / Time', 'datetime'], 'movement_type' => ['Movement', 'status'], 'product' => ['Product', 'text'],
            'barcode' => ['Barcode', 'text'], 'quantity' => ['Quantity', 'number'], 'unit' => ['Unit', 'text'],
            'warehouse' => ['Warehouse', 'text'], 'reference' => ['Order No.', 'text'], 'customer' => ['Customer', 'text'],
            'transaction_ref' => ['Transaction Ref.', 'text'], 'performed_by' => ['Performed By', 'text'], 'order_status' => ['Order Status', 'status'],
        ];
        $receivingColumns = [
            'receiving_no' => ['Receiving No.', 'text'], 'po_no' => ['PO No.', 'text'], 'supplier' => ['Supplier', 'text'],
            'reference_no' => ['Delivery Ref. No.', 'text'], 'product' => ['Product', 'text'], 'expected_qty' => ['Expected Qty', 'number'],
            'delivered_qty' => ['Delivered Qty', 'number'], 'accepted_qty' => ['Accepted Qty', 'number'], 'rejected_qty' => ['Rejected Qty', 'number'],
            'stocked_in_qty' => ['Stocked-In Qty', 'number'], 'unit' => ['Unit', 'text'], 'warehouse' => ['Stock-In Warehouse', 'text'],
            'prepared_by' => ['Prepared By', 'text'], 'delivery_date' => ['Delivery Date', 'date'], 'status' => ['Status', 'status'],
            'qa_assignee' => ['QA Assignee', 'text'], 'qa_status' => ['QA Status', 'status'], 'is_replacement' => ['Replacement', 'text'],
            'original_case' => ['Rejection Case', 'text'], 'original_receiving' => ['Original Receiving', 'text'],
        ];
        $receivingFilters = ['date', 'warehouse', 'product', 'supplier', 'status'];
        $shipmentColumns = [
            'shipment_no' => ['Shipment / Order No.', 'text'], 'reference_no' => ['Reference No.', 'text'], 'customer' => ['Customer', 'text'],
            'destination' => ['Destination', 'text'], 'products' => ['Products', 'text'], 'item_count' => ['Items', 'number'],
            'total_quantity' => ['Total Qty', 'number'], 'warehouse' => ['Warehouse', 'text'], 'prepared_by' => ['Prepared By', 'text'],
            'assigned_at' => ['Assigned Date', 'datetime'], 'ready_at' => ['Ready for Shipment', 'datetime'],
            'forwarded_at' => ['Forwarded to Logistics', 'datetime'], 'in_transit_at' => ['In Transit Since', 'datetime'],
            'target_delivery' => ['Target Delivery', 'datetime'], 'delivered_at' => ['Delivered Date', 'datetime'], 'status' => ['Status', 'status'],
        ];
        $orderColumns = [
            'order_no' => ['Order No.', 'text'], 'reference_no' => ['Reference No.', 'text'], 'customer' => ['Customer', 'text'],
            'destination' => ['Destination', 'text'], 'products' => ['Products', 'text'], 'item_count' => ['Items', 'number'],
            'order_date' => ['Order Date', 'datetime'], 'assigned_at' => ['Assigned Date', 'datetime'], 'target_delivery' => ['Target Delivery', 'datetime'],
            'warehouse' => ['Warehouse', 'text'], 'assigned_to' => ['Assigned To', 'text'], 'status' => ['Status', 'status'],
            'fulfillment_stage' => ['Fulfillment Stage', 'status'],
        ];
        $orderStatuses = collect(Order::STATUSES)->mapWithKeys(fn (string $status) => [$status => $status])->all();
        $capacityColumns = [
            'warehouse' => ['Warehouse', 'text'], 'code' => ['Code', 'text'], 'warehouse_status' => ['Active Status', 'status'],
            'capacity' => ['Capacity', 'number'], 'used' => ['Used Qty', 'number'], 'available_capacity' => ['Available Capacity', 'number'],
            'utilization' => ['Utilization', 'percent'], 'alert_level' => ['Capacity Alert', 'status'],
        ];

        return [
            // ---------------- Inventory ----------------
            new ReportDefinition('inventory.summary', 'Inventory Summary Report', 'Current stock per product and warehouse with reorder-based stock status.', 'inventory',
                $inventoryColumns, [...$inventoryFilters, 'status'], self::STOCK_STATUSES, dateLabel: 'Last updated',
                source: fn (ReportFilters $f) => $this->inventoryItems($f)),
            new ReportDefinition('inventory.low_stock', 'Low Stock Alert Report', 'Products with stock above zero but at or below their reorder level.', 'inventory',
                ['shortfall' => ['Shortfall to Reorder Level', 'number']] + $inventoryColumns, $inventoryFilters, dateLabel: 'Last updated',
                source: fn (ReportFilters $f) => $this->inventoryItems($f, 'Low Stock')->reorder()
                    ->orderByDesc('shortfall')->orderBy('products.name')->orderBy('inventories.id')),
            new ReportDefinition('inventory.out_of_stock', 'Out of Stock Report', 'Inventory records whose available quantity is zero.', 'inventory',
                $inventoryColumns, $inventoryFilters, dateLabel: 'Last updated',
                source: fn (ReportFilters $f) => $this->inventoryItems($f, 'Out of Stock')),
            new ReportDefinition('inventory.by_warehouse', 'Inventory by Warehouse Report', 'Stock totals and stock-status counts aggregated per warehouse.', 'inventory',
                [
                    'warehouse' => ['Warehouse', 'text'], 'code' => ['Code', 'text'], 'warehouse_status' => ['Active Status', 'status'],
                    'inventory_records' => ['Inventory Records', 'number'], 'available' => ['Available', 'number'], 'reserved' => ['Reserved', 'number'],
                    'total_stock' => ['Total Stock', 'number'], 'healthy_items' => ['Healthy', 'number'], 'low_stock_items' => ['Low Stock', 'number'],
                    'out_of_stock_items' => ['Out of Stock', 'number'],
                ], ['warehouse'],
                source: fn (ReportFilters $f) => $this->inventoryByWarehouse($f)),

            // ---------------- Stock movement ----------------
            new ReportDefinition('stock.stock_in', 'Stock In Report', 'Accepted receiving quantities posted to inventory through Stock In.', 'stock-movement',
                $stockInColumns, ['date', 'warehouse', 'product'], dateLabel: 'Stock-in date',
                source: fn (ReportFilters $f) => $this->stockInQuery($f)->orderByDesc('ri.stocked_in_at')->orderByDesc('ri.id')),
            new ReportDefinition('stock.stock_out', 'Stock Out Report', 'Recorded Stock Out transactions released against customer orders.', 'stock-movement',
                $stockOutColumns, ['date', 'warehouse', 'product'], dateLabel: 'Transaction date',
                source: fn (ReportFilters $f) => $this->stockOutQuery($f)->orderByDesc('sot.created_at')->orderByDesc('sot.id')),
            new ReportDefinition('stock.movement_ledger', 'Stock Movement Ledger', 'Combined Stock In and Stock Out transactions, newest first.', 'stock-movement',
                [
                    'occurred_at' => ['Date / Time', 'datetime'], 'movement_type' => ['Movement', 'status'], 'product' => ['Product', 'text'],
                    'barcode' => ['Barcode', 'text'], 'quantity' => ['Quantity', 'number'], 'unit' => ['Unit', 'text'],
                    'warehouse' => ['Warehouse', 'text'], 'reference' => ['Receiving / Order Ref.', 'text'], 'performed_by' => ['Performed By', 'text'],
                ], ['date', 'warehouse', 'product', 'movement_type'], dateLabel: 'Transaction date',
                source: fn (ReportFilters $f) => DB::query()->fromSub($this->movementUnion($f, false), 'm')
                    ->orderByDesc('occurred_at')->orderBy('movement_type')->orderByDesc('row_id')),
            new ReportDefinition('stock.movement_summary', 'Stock Movement Summary', 'Stock In, Stock Out and net movement totals per product and warehouse.', 'stock-movement',
                [
                    'product' => ['Product', 'text'], 'warehouse' => ['Warehouse', 'text'], 'stock_in_total' => ['Stock In Total', 'number'],
                    'stock_out_total' => ['Stock Out Total', 'number'], 'net_movement' => ['Net Movement', 'number'],
                    'transactions' => ['Transactions', 'number'], 'last_movement' => ['Last Movement', 'datetime'],
                ], ['date', 'warehouse', 'product', 'movement_type'], dateLabel: 'Transaction date',
                source: fn (ReportFilters $f) => $this->movementSummary($f)),

            // ---------------- Receiving ----------------
            new ReportDefinition('receiving.summary', 'Receiving Summary', 'Every receiving line with PO, supplier, quantities, QA state and replacement links.', 'receiving',
                $receivingColumns, $receivingFilters, self::RECEIVING_STATUSES, dateLabel: 'Delivery date',
                source: fn (ReportFilters $f) => $this->receivingQuery($f)),
            new ReportDefinition('receiving.pending', 'Pending Receiving', 'Receivings awaiting QA or an expected supplier replacement delivery.', 'receiving',
                $receivingColumns, $receivingFilters, ['Pending QA' => 'Pending QA', 'Awaiting Replacement' => 'Awaiting Replacement'], dateLabel: 'Delivery date',
                source: fn (ReportFilters $f) => $this->receivingQuery($f)->whereIn('r.status', ['Pending QA', 'Awaiting Replacement'])),
            new ReportDefinition('receiving.completed', 'Completed Receiving', 'Receivings whose QA inspection has been completed.', 'receiving',
                $receivingColumns, $receivingFilters, ['Passed' => 'Passed', 'Partial' => 'Partial', 'Rejected' => 'Rejected'], dateLabel: 'Delivery date',
                source: fn (ReportFilters $f) => $this->receivingQuery($f)->whereNotNull('qi.completed_at')),
            new ReportDefinition('receiving.replacements', 'Replacement Receiving Report', 'Supplier replacement receivings linked to their original rejection case and receiving.', 'receiving',
                $receivingColumns + ['case_status' => ['Rejection Case Status', 'status']], $receivingFilters, self::RECEIVING_STATUSES, dateLabel: 'Delivery date',
                source: fn (ReportFilters $f) => $this->receivingQuery($f)->whereNotNull('r.replacement_for_rejection_case_id')
                    ->addSelect(DB::raw('src.status as case_status'))),

            // ---------------- Shipment ----------------
            new ReportDefinition('shipment.summary', 'Shipment Summary', 'Orders that reached the shipment stage, with recorded status timestamps.', 'shipment',
                $shipmentColumns, ['date', 'warehouse', 'status'], array_combine(self::SHIPMENT_STATUSES, self::SHIPMENT_STATUSES), dateLabel: 'Order date',
                source: fn (ReportFilters $f) => $this->orderQuery($f)->whereIn('o.status', self::SHIPMENT_STATUSES)),
            new ReportDefinition('shipment.ready', 'Ready for Shipment', 'Orders packed and waiting to be forwarded to Logistics.', 'shipment',
                $shipmentColumns, ['date', 'warehouse'], dateLabel: 'Order date',
                source: fn (ReportFilters $f) => $this->orderQuery($f)->where('o.status', 'READY_FOR_SHIPMENT')),
            new ReportDefinition('shipment.in_transit', 'In Transit Shipments', 'Shipments currently marked In Transit.', 'shipment',
                $shipmentColumns, ['date', 'warehouse'], dateLabel: 'Order date',
                source: fn (ReportFilters $f) => $this->orderQuery($f)->where('o.status', 'IN_TRANSIT')),
            new ReportDefinition('shipment.delivered', 'Delivered Shipments', 'Shipments marked Delivered, with the recorded delivery timestamp.', 'shipment',
                $shipmentColumns, ['date', 'warehouse'], dateLabel: 'Order date',
                source: fn (ReportFilters $f) => $this->orderQuery($f)->where('o.status', 'DELIVERED')),
            new ReportDefinition('shipment.cancelled', 'Cancelled Shipments', 'Cancelled orders that had already reached the shipment stage.', 'shipment',
                $shipmentColumns + ['cancelled_at' => ['Cancelled Date', 'datetime']], ['date', 'warehouse'], dateLabel: 'Order date',
                source: fn (ReportFilters $f) => $this->orderQuery($f)->where('o.status', 'CANCELLED')
                    ->whereExists(fn (Builder $q) => $q->selectRaw('1')->from('order_status_histories as h')
                        ->whereColumn('h.order_id', 'o.id')->whereIn('h.new_status', ['FOR_PACKING', 'PACKING', 'READY_FOR_SHIPMENT', 'FORWARDED_TO_LOGISTICS', 'IN_TRANSIT']))),

            // ---------------- Orders ----------------
            new ReportDefinition('orders.summary', 'Order Summary', 'All customer orders with assignment, target delivery and fulfillment stage.', 'order',
                $orderColumns, ['date', 'warehouse', 'status'], $orderStatuses, dateLabel: 'Order date',
                source: fn (ReportFilters $f) => $this->orderQuery($f)),
            new ReportDefinition('orders.fulfillment', 'Order Fulfillment Status', 'Order counts per status and fulfillment stage, including overdue orders.', 'order',
                [
                    'fulfillment_stage' => ['Fulfillment Stage', 'status'], 'status' => ['Status', 'status'], 'orders' => ['Orders', 'number'],
                    'overdue' => ['Past Target Delivery', 'number'], 'next_target' => ['Earliest Target Delivery', 'datetime'],
                ], ['date', 'warehouse'], dateLabel: 'Order date',
                source: fn (ReportFilters $f) => $this->orderFulfillment($f)),
            new ReportDefinition('orders.completed', 'Completed Orders', 'Orders marked Delivered.', 'order',
                $orderColumns + ['delivered_at' => ['Delivered Date', 'datetime']], ['date', 'warehouse'], dateLabel: 'Order date',
                source: fn (ReportFilters $f) => $this->orderQuery($f)->where('o.status', 'DELIVERED')),
            new ReportDefinition('orders.active', 'Pending / Active Orders', 'Orders that are not yet delivered or cancelled.', 'order',
                $orderColumns, ['date', 'warehouse', 'status'], array_diff_key($orderStatuses, ['DELIVERED' => 1, 'CANCELLED' => 1]), dateLabel: 'Order date',
                source: fn (ReportFilters $f) => $this->orderQuery($f)->whereNotIn('o.status', ['DELIVERED', 'CANCELLED'])),

            // ---------------- Procurement ----------------
            new ReportDefinition('procurement.replenishment', 'Replenishment Request Report', 'Plant Manager replenishment requests and their Admin decisions.', 'procurement',
                [
                    'request_no' => ['Request No.', 'text'], 'requester' => ['Requester', 'text'], 'product' => ['Product', 'text'],
                    'warehouse' => ['Warehouse', 'text'], 'quantity' => ['Quantity', 'number'], 'unit' => ['Unit', 'text'],
                    'priority' => ['Priority', 'status'], 'status' => ['Status', 'status'], 'submitted_at' => ['Submitted Date', 'datetime'],
                    'reviewed_by' => ['Reviewed By', 'text'], 'reviewed_at' => ['Reviewed Date', 'datetime'], 'linked_po' => ['Linked PO', 'text'],
                ], ['date', 'warehouse', 'product', 'status'], self::REPLENISHMENT_STATUSES, dateLabel: 'Created date',
                source: fn (ReportFilters $f) => $this->replenishmentQuery($f)),
            new ReportDefinition('procurement.purchase_orders', 'Purchase Order Report', 'Purchase Orders with supplier snapshot, registered supplier code and linked request.', 'procurement',
                [
                    'po_no' => ['PO No.', 'text'], 'supplier_name' => ['Supplier (PO)', 'text'], 'supplier_code' => ['Supplier Code', 'text'],
                    'products' => ['Products', 'text'], 'quantity' => ['Total Qty', 'number'], 'status' => ['Status', 'status'],
                    'created_at' => ['Created Date', 'datetime'], 'sent_at' => ['Sent Date', 'datetime'],
                    'expected_delivery' => ['Expected Delivery', 'date'], 'linked_request' => ['Linked Request', 'text'],
                    'receivings' => ['Receivings', 'number'], 'approved_by' => ['Approved By', 'text'],
                ], ['date', 'supplier', 'status'], array_combine(self::PURCHASE_ORDER_STATUSES, self::PURCHASE_ORDER_STATUSES), dateLabel: 'Created date',
                source: fn (ReportFilters $f) => $this->purchaseOrderQuery($f)),
            new ReportDefinition('procurement.status', 'Procurement Status Report', 'Replenishment request and Purchase Order counts grouped by status.', 'procurement',
                [
                    'record_type' => ['Record Type', 'text'], 'status' => ['Status', 'status'], 'records' => ['Records', 'number'],
                    'total_quantity' => ['Total Qty', 'number'], 'latest_activity' => ['Latest Activity', 'datetime'],
                ], ['date'], dateLabel: 'Created date',
                source: fn (ReportFilters $f) => $this->procurementStatus($f)),

            // ---------------- Suppliers ----------------
            new ReportDefinition('suppliers.directory', 'Supplier Directory', 'Registered suppliers and their contact details.', 'supplier',
                [
                    'supplier_code' => ['Supplier Code', 'text'], 'name' => ['Supplier Name', 'text'], 'contact_person' => ['Contact Person', 'text'],
                    'email' => ['Email', 'text'], 'phone' => ['Phone', 'text'], 'location' => ['Location', 'text'],
                    'payment_terms' => ['Payment Terms', 'text'], 'status' => ['Status', 'status'], 'created_at' => ['Registered', 'datetime'],
                ], ['supplier', 'status'], self::SUPPLIER_STATUSES,
                source: fn (ReportFilters $f) => $this->supplierBase($f)->orderBy('s.name')->orderBy('s.id')->select([
                    's.supplier_code', 's.name', 's.contact_person', 's.email', 's.phone', 's.address as location', 's.payment_terms',
                    's.status', 's.created_at',
                ])),
            new ReportDefinition('suppliers.activity', 'Supplier Activity Report', 'Counts and quantities derived from linked POs, receivings, QA results and rejection cases.', 'supplier',
                [
                    'supplier_code' => ['Supplier Code', 'text'], 'name' => ['Supplier Name', 'text'], 'status' => ['Status', 'status'],
                    'po_count' => ['Linked POs', 'number'], 'completed_po_count' => ['Completed POs', 'number'], 'receiving_count' => ['Receivings', 'number'],
                    'delivered_qty' => ['Delivered Qty', 'number'], 'accepted_qty' => ['Accepted Qty', 'number'], 'rejected_qty' => ['Rejected Qty', 'number'],
                    'rejection_cases' => ['Rejection Cases', 'number'],
                ], ['supplier', 'status'], self::SUPPLIER_STATUSES,
                source: fn (ReportFilters $f) => $this->supplierActivity($f)),
            new ReportDefinition('suppliers.rejections', 'Supplier Rejection Report', 'Supplier Rejection Cases with QA quantities, report delivery and replacement status.', 'supplier',
                [
                    'case_no' => ['Rejection Case No.', 'text'], 'receiving_no' => ['Receiving No.', 'text'], 'po_no' => ['PO No.', 'text'],
                    'supplier' => ['Supplier', 'text'], 'product' => ['Product', 'text'], 'delivered' => ['Delivered', 'number'],
                    'accepted' => ['Accepted', 'number'], 'rejected' => ['Rejected', 'number'], 'unit' => ['Unit', 'text'],
                    'qa_result' => ['QA Result', 'status'], 'status' => ['Rejection Status', 'status'], 'sent_at' => ['Report Sent', 'datetime'],
                    'replacement_receiving' => ['Replacement Receiving', 'text'], 'replacement_status' => ['Replacement Status', 'status'],
                    'resolution' => ['Resolution', 'text'], 'resolved_at' => ['Resolved Date', 'datetime'],
                ], ['date', 'product', 'supplier', 'status'], self::REJECTION_STATUSES, dateLabel: 'Case created date',
                source: fn (ReportFilters $f) => $this->rejectionQuery($f)),

            // ---------------- Warehouse ----------------
            new ReportDefinition('warehouse.capacity', 'Warehouse Capacity Report', 'Capacity, used quantity and alert level per warehouse (shared capacity calculation).', 'warehouse',
                $capacityColumns, ['warehouse', 'status'], self::WAREHOUSE_STATUSES,
                source: fn (ReportFilters $f) => $this->warehouseCapacity($f)),
            new ReportDefinition('warehouse.inventory', 'Warehouse Inventory Report', 'Inventory records listed by warehouse.', 'warehouse',
                ['warehouse_code' => ['Warehouse Code', 'text']] + $inventoryColumns, ['warehouse', 'product', 'category', 'status'], self::STOCK_STATUSES,
                source: fn (ReportFilters $f) => $this->inventoryItems($f)->reorder()
                    ->orderBy('warehouses.name')->orderBy('products.name')->orderBy('inventories.id')
                    ->addSelect('warehouses.code as warehouse_code')),
            new ReportDefinition('warehouse.capacity_alerts', 'Capacity Alert Report', 'Warehouses currently at the WARNING or FULL capacity level.', 'warehouse',
                $capacityColumns, ['warehouse'],
                source: fn (ReportFilters $f) => $this->warehouseCapacity($f)->where('alert_level', '!=', WarehouseCapacity::NORMAL)->values()),

            // ---------------- AI forecast ----------------
            new ReportDefinition('ai.forecast', 'AI Demand Forecast Report', 'Persisted AI demand forecast results.', 'ai-forecast',
                [], [], formats: [],
                unavailableReason: 'No forecast results are available yet. The forecasting service does not persist forecast results.'),
            new ReportDefinition('ai.forecast_accuracy', 'AI Forecast Accuracy Report', 'Measured forecast accuracy against actual demand.', 'ai-forecast',
                [], [], formats: [],
                unavailableReason: 'No measured forecast results. Accuracy requires generated forecasts to compare against actual demand.'),

            // ---------------- System ----------------
            new ReportDefinition('system.audit_logs', 'Audit Log Report', 'Recorded audit events (metadata, user agents and credentials excluded).', 'system',
                [
                    'created_at' => ['Date / Time', 'datetime'], 'user' => ['User', 'text'], 'action' => ['Action', 'text'],
                    'module' => ['Module', 'text'], 'resource' => ['Resource', 'text'], 'status' => ['Result', 'status'],
                    'ip_address' => ['IP Address', 'text'], 'details' => ['Details', 'text'],
                ], ['date', 'status'], array_combine(AuditLog::STATUSES, AuditLog::STATUSES), dateLabel: 'Event date',
                source: fn (ReportFilters $f) => $this->auditLogQuery($f)),
            new ReportDefinition('system.user_activity', 'User Activity Report', 'Per-user activity derived from recorded audit and login events.', 'system',
                [
                    'user' => ['User', 'text'], 'role' => ['Role', 'text'], 'account_status' => ['Account Status', 'status'],
                    'events' => ['Events', 'number'], 'logins' => ['Logins', 'number'], 'logouts' => ['Logouts', 'number'],
                    'failed_events' => ['Failed / Blocked', 'number'], 'last_login' => ['Last Login', 'datetime'], 'last_activity' => ['Last Activity', 'datetime'],
                ], ['date'], dateLabel: 'Event date',
                source: fn (ReportFilters $f) => $this->userActivity($f)),
        ];
    }

    // ------------------------------------------------------------------ helpers

    private function dateRange(Builder $query, string $column, ReportFilters $filters): Builder
    {
        if ($filters->dateFrom) $query->where($column, '>=', $filters->dateFrom->copy()->startOfDay());
        if ($filters->dateTo) $query->where($column, '<', $filters->dateTo->copy()->addDay()->startOfDay());

        return $query;
    }

    private function inventoryItems(ReportFilters $f, ?string $forcedStatus = null): Builder
    {
        $query = DB::table('inventories')
            ->join('products', 'products.id', '=', 'inventories.product_id')
            ->join('warehouses', 'warehouses.id', '=', 'inventories.warehouse_id')
            ->select([
                'products.name as product', 'inventories.barcode', 'products.category', 'products.brand', 'warehouses.name as warehouse',
                'inventories.available_stock as available', 'inventories.reserved_stock as reserved',
                DB::raw('inventories.available_stock + inventories.reserved_stock as total_stock'), 'products.unit',
                DB::raw(self::STOCK_STATUS_SQL.' as stock_status'), 'inventories.status as recorded_status',
                'products.reorder_level', 'inventories.updated_at as last_updated',
                DB::raw('GREATEST(products.reorder_level - inventories.available_stock, 0) as shortfall'),
            ])
            ->orderBy('products.name')->orderBy('warehouses.name')->orderBy('inventories.id');

        if ($f->warehouseId) $query->where('inventories.warehouse_id', $f->warehouseId);
        if ($f->productId) $query->where('inventories.product_id', $f->productId);
        if ($f->category) $query->where('products.category', $f->category);
        $status = $forcedStatus ?? $f->status;
        if ($status) $query->whereRaw(self::STOCK_STATUS_SQL.' = ?', [$status]);

        return $this->dateRange($query, 'inventories.updated_at', $f);
    }

    private function inventoryByWarehouse(ReportFilters $f): Builder
    {
        $status = self::STOCK_STATUS_SQL;

        return DB::table('warehouses')
            ->leftJoin('inventories', 'inventories.warehouse_id', '=', 'warehouses.id')
            ->leftJoin('products', 'products.id', '=', 'inventories.product_id')
            ->when($f->warehouseId, fn (Builder $q, int $id) => $q->where('warehouses.id', $id))
            ->groupBy('warehouses.id', 'warehouses.name', 'warehouses.code', 'warehouses.status')
            ->select(['warehouses.name as warehouse', 'warehouses.code', 'warehouses.status as warehouse_status'])
            ->selectRaw('COUNT(inventories.id) as inventory_records')
            ->selectRaw('COALESCE(SUM(inventories.available_stock), 0) as available')
            ->selectRaw('COALESCE(SUM(inventories.reserved_stock), 0) as reserved')
            ->selectRaw('COALESCE(SUM(inventories.available_stock + inventories.reserved_stock), 0) as total_stock')
            ->selectRaw("SUM(CASE WHEN inventories.id IS NOT NULL AND {$status} = 'Healthy' THEN 1 ELSE 0 END) as healthy_items")
            ->selectRaw("SUM(CASE WHEN inventories.id IS NOT NULL AND {$status} = 'Low Stock' THEN 1 ELSE 0 END) as low_stock_items")
            ->selectRaw("SUM(CASE WHEN inventories.id IS NOT NULL AND {$status} = 'Out of Stock' THEN 1 ELSE 0 END) as out_of_stock_items")
            ->orderBy('warehouses.name')->orderBy('warehouses.id');
    }

    /** Stock In = accepted QA quantity (or delivered when uninspected) of stocked-in receiving lines, as in Stock In history. */
    private function stockInQuery(ReportFilters $f): Builder
    {
        $query = DB::table('receiving_items as ri')
            ->join('receivings as r', 'r.id', '=', 'ri.receiving_id')
            ->leftJoin('qa_inspection_items as qii', 'qii.receiving_item_id', '=', 'ri.id')
            ->leftJoin('warehouses as w', 'w.id', '=', 'ri.warehouse_id')
            ->leftJoin('purchase_orders as po', 'po.id', '=', 'r.purchase_order_id')
            ->whereNotNull('ri.stocked_in_at')
            ->select([
                'ri.id as row_id', 'ri.stocked_in_at as occurred_at', DB::raw("'Stock In' as movement_type"), 'ri.product_name as product',
                DB::raw('(SELECT i.barcode FROM inventories i WHERE i.product_id = ri.product_id AND i.warehouse_id = ri.warehouse_id ORDER BY i.id LIMIT 1) as barcode'),
                DB::raw('COALESCE(qii.accepted_quantity, ri.delivered_quantity) as quantity'), 'ri.unit', 'w.name as warehouse',
                'r.receiving_no as reference', DB::raw('COALESCE(po.po_number, r.purchase_order) as po_no'), 'r.supplier',
                DB::raw("(SELECT t.performed_by FROM receiving_timelines t WHERE t.receiving_id = r.id AND t.status = 'Stock In Completed' ORDER BY t.id LIMIT 1) as performed_by"),
                DB::raw("'Completed' as status"),
            ]);

        if ($f->warehouseId) $query->where('ri.warehouse_id', $f->warehouseId);
        if ($f->productId) $query->where('ri.product_id', $f->productId);

        return $this->dateRange($query, 'ri.stocked_in_at', $f);
    }

    private function stockOutQuery(ReportFilters $f): Builder
    {
        $query = DB::table('stock_out_transactions as sot')
            ->join('products as p', 'p.id', '=', 'sot.product_id')
            ->join('warehouses as w', 'w.id', '=', 'sot.warehouse_id')
            ->join('orders as o', 'o.id', '=', 'sot.order_id')
            ->leftJoin('users as u', 'u.id', '=', 'sot.performed_by')
            ->select([
                'sot.id as row_id', 'sot.created_at as occurred_at', DB::raw("'Stock Out' as movement_type"), 'p.name as product',
                'sot.barcode', 'sot.quantity', 'sot.unit', 'w.name as warehouse', 'o.order_no as reference', 'o.customer_name as customer',
                'sot.reference_no as transaction_ref', 'u.name as performed_by', 'o.status as order_status',
            ]);

        if ($f->warehouseId) $query->where('sot.warehouse_id', $f->warehouseId);
        if ($f->productId) $query->where('sot.product_id', $f->productId);

        return $this->dateRange($query, 'sot.created_at', $f);
    }

    private function movementUnion(ReportFilters $f, bool $withIds): Builder
    {
        $columns = ['row_id', 'occurred_at', 'movement_type', 'product', 'barcode', 'quantity', 'unit', 'warehouse', 'reference', 'performed_by'];
        $in = DB::query()->fromSub($this->stockInQuery($f)->addSelect(['ri.product_id', 'ri.warehouse_id']), 'si')
            ->select([...$columns, ...($withIds ? ['product_id', 'warehouse_id'] : [])]);
        $out = DB::query()->fromSub($this->stockOutQuery($f)->addSelect(['sot.product_id', 'sot.warehouse_id']), 'so')
            ->select([...$columns, ...($withIds ? ['product_id', 'warehouse_id'] : [])]);

        return match ($f->movementType) {
            'STOCK_IN' => $in,
            'STOCK_OUT' => $out,
            default => $in->unionAll($out),
        };
    }

    private function movementSummary(ReportFilters $f): Builder
    {
        return DB::query()->fromSub($this->movementUnion($f, true), 'm')
            ->groupBy('product_id', 'product', 'warehouse_id', 'warehouse')
            ->select(['product', 'warehouse'])
            ->selectRaw("COALESCE(SUM(CASE WHEN movement_type = 'Stock In' THEN quantity ELSE 0 END), 0) as stock_in_total")
            ->selectRaw("COALESCE(SUM(CASE WHEN movement_type = 'Stock Out' THEN quantity ELSE 0 END), 0) as stock_out_total")
            ->selectRaw("COALESCE(SUM(CASE WHEN movement_type = 'Stock In' THEN quantity ELSE -quantity END), 0) as net_movement")
            ->selectRaw('COUNT(*) as transactions')
            ->selectRaw('MAX(occurred_at) as last_movement')
            ->orderByDesc('last_movement')->orderBy('product')->orderBy('warehouse_id');
    }

    private function receivingQuery(ReportFilters $f): Builder
    {
        $query = DB::table('receiving_items as ri')
            ->join('receivings as r', 'r.id', '=', 'ri.receiving_id')
            ->leftJoin('purchase_orders as po', 'po.id', '=', 'r.purchase_order_id')
            ->leftJoin('warehouses as w', 'w.id', '=', 'ri.warehouse_id')
            ->leftJoin('users as prep', 'prep.id', '=', 'r.prepared_by_id')
            ->leftJoin('users as qa', 'qa.id', '=', 'r.assigned_qa_user_id')
            ->leftJoin('qa_inspections as qi', 'qi.receiving_id', '=', 'r.id')
            ->leftJoin('qa_inspection_items as qii', fn (JoinClause $join) => $join->on('qii.receiving_item_id', '=', 'ri.id')->on('qii.qa_inspection_id', '=', 'qi.id'))
            ->leftJoin('supplier_rejection_cases as src', 'src.id', '=', 'r.replacement_for_rejection_case_id')
            ->leftJoin('qa_inspection_items as oqii', 'oqii.id', '=', 'src.qa_inspection_item_id')
            ->leftJoin('qa_inspections as oqi', 'oqi.id', '=', 'oqii.qa_inspection_id')
            ->leftJoin('receivings as orig', 'orig.id', '=', 'oqi.receiving_id')
            ->select([
                'r.receiving_no', DB::raw('COALESCE(po.po_number, r.purchase_order) as po_no'), 'r.supplier', 'r.reference_no',
                'ri.product_name as product', 'ri.ordered_quantity as expected_qty', 'ri.delivered_quantity as delivered_qty',
                'qii.accepted_quantity as accepted_qty', 'qii.rejected_quantity as rejected_qty',
                // An expected replacement is not inventory: only posted Stock In counts as received stock.
                DB::raw('CASE WHEN ri.stocked_in_at IS NOT NULL THEN COALESCE(qii.accepted_quantity, ri.delivered_quantity) ELSE 0 END as stocked_in_qty'),
                'ri.unit', 'w.name as warehouse', 'prep.name as prepared_by', 'r.delivery_date', 'r.status', 'qa.name as qa_assignee',
                DB::raw("CASE WHEN qi.completed_at IS NOT NULL THEN 'Completed' WHEN qi.id IS NOT NULL THEN 'In Progress' WHEN r.status = 'Awaiting Replacement' THEN 'Awaiting Delivery' ELSE 'Pending' END as qa_status"),
                DB::raw("CASE WHEN r.replacement_for_rejection_case_id IS NOT NULL THEN 'Yes' ELSE 'No' END as is_replacement"),
                DB::raw("CASE WHEN src.id IS NOT NULL THEN 'RJ-' || LPAD(src.id::text, 6, '0') END as original_case"),
                'orig.receiving_no as original_receiving',
            ])
            ->orderByDesc('r.delivery_date')->orderByDesc('r.id')->orderBy('ri.id');

        if ($f->warehouseId) $query->where('ri.warehouse_id', $f->warehouseId);
        if ($f->productId) $query->where('ri.product_id', $f->productId);
        if ($f->supplierId) $query->where('po.supplier_id', $f->supplierId);
        if ($f->status) $query->where('r.status', $f->status);

        return $this->dateRange($query, 'r.delivery_date', $f);
    }

    private function historyAt(string $status, string $alias, string $aggregate = 'MIN'): \Illuminate\Contracts\Database\Query\Expression
    {
        // $status is always a server-side constant.
        return DB::raw("(SELECT {$aggregate}(h.created_at) FROM order_status_histories h WHERE h.order_id = o.id AND h.new_status = '{$status}') as {$alias}");
    }

    private function orderQuery(ReportFilters $f): Builder
    {
        $stage = 'CASE o.status '.collect(self::FULFILLMENT_STAGES)->map(fn ($label, $status) => "WHEN '{$status}' THEN '{$label}'")->implode(' ').' ELSE o.status END';

        $query = DB::table('orders as o')
            ->leftJoin('users as a', 'a.id', '=', 'o.assigned_to')
            ->leftJoin('warehouses as w', 'w.id', '=', 'a.warehouse_id')
            ->select([
                'o.order_no', 'o.order_no as shipment_no', 'o.reference_no', 'o.customer_name as customer', 'o.customer_address as destination',
                DB::raw("(SELECT string_agg(oi.product_name, ', ' ORDER BY oi.id) FROM order_items oi WHERE oi.order_id = o.id) as products"),
                DB::raw('(SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count'),
                DB::raw('(SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id) as total_quantity'),
                'o.order_date', 'o.assigned_at', 'o.required_delivery_date as target_delivery', 'w.name as warehouse',
                'a.name as assigned_to', 'a.name as prepared_by', 'o.status', DB::raw("{$stage} as fulfillment_stage"),
                $this->historyAt('READY_FOR_SHIPMENT', 'ready_at'), $this->historyAt('FORWARDED_TO_LOGISTICS', 'forwarded_at'),
                $this->historyAt('IN_TRANSIT', 'in_transit_at', 'MAX'), $this->historyAt('DELIVERED', 'delivered_at', 'MAX'),
                $this->historyAt('CANCELLED', 'cancelled_at', 'MAX'),
            ])
            ->orderByDesc('o.order_date')->orderByDesc('o.id');

        if ($f->warehouseId) $query->where('a.warehouse_id', $f->warehouseId);
        if ($f->status) $query->where('o.status', $f->status);

        return $this->dateRange($query, 'o.order_date', $f);
    }

    private function orderFulfillment(ReportFilters $f): Builder
    {
        $stage = 'CASE o.status '.collect(self::FULFILLMENT_STAGES)->map(fn ($label, $status) => "WHEN '{$status}' THEN '{$label}'")->implode(' ').' ELSE o.status END';
        $sequence = 'CASE o.status '.collect(Order::STATUSES)->map(fn ($status, $index) => "WHEN '{$status}' THEN {$index}")->implode(' ').' ELSE 99 END';

        $query = DB::table('orders as o')
            ->leftJoin('users as a', 'a.id', '=', 'o.assigned_to')
            ->groupBy('o.status')
            ->select([DB::raw("{$stage} as fulfillment_stage"), 'o.status'])
            ->selectRaw('COUNT(*) as orders')
            ->selectRaw("SUM(CASE WHEN o.required_delivery_date < ? AND o.status NOT IN ('DELIVERED', 'CANCELLED') THEN 1 ELSE 0 END) as overdue", [now()])
            ->selectRaw("MIN(CASE WHEN o.status NOT IN ('DELIVERED', 'CANCELLED') THEN o.required_delivery_date END) as next_target")
            ->orderByRaw("MIN({$sequence})");

        if ($f->warehouseId) $query->where('a.warehouse_id', $f->warehouseId);

        return $this->dateRange($query, 'o.order_date', $f);
    }

    private function replenishmentQuery(ReportFilters $f): Builder
    {
        $status = 'CASE rr.status '.collect(self::REPLENISHMENT_STATUSES)->map(fn ($label, $value) => "WHEN '{$value}' THEN '{$label}'")->implode(' ').' ELSE rr.status END';

        $query = DB::table('replenishment_requests as rr')
            ->join('users as req', 'req.id', '=', 'rr.requested_by')
            ->join('products as p', 'p.id', '=', 'rr.product_id')
            ->join('warehouses as w', 'w.id', '=', 'rr.warehouse_id')
            ->leftJoin('users as rev', 'rev.id', '=', 'rr.reviewed_by')
            ->leftJoin('purchase_orders as po', 'po.replenishment_request_id', '=', 'rr.id')
            ->select([
                'rr.request_no', 'req.name as requester', 'p.name as product', 'w.name as warehouse', 'rr.requested_qty as quantity',
                'p.unit', 'rr.priority', DB::raw("{$status} as status"), 'rr.submitted_at', 'rev.name as reviewed_by', 'rr.reviewed_at',
                'po.po_number as linked_po',
            ])
            ->orderByDesc('rr.created_at')->orderByDesc('rr.id');

        if ($f->warehouseId) $query->where('rr.warehouse_id', $f->warehouseId);
        if ($f->productId) $query->where('rr.product_id', $f->productId);
        if ($f->status) $query->where('rr.status', $f->status);

        return $this->dateRange($query, 'rr.created_at', $f);
    }

    private function purchaseOrderQuery(ReportFilters $f): Builder
    {
        $query = DB::table('purchase_orders as po')
            ->leftJoin('suppliers as s', 's.id', '=', 'po.supplier_id')
            ->leftJoin('replenishment_requests as rr', 'rr.id', '=', 'po.replenishment_request_id')
            ->leftJoin('users as ap', 'ap.id', '=', 'po.approved_by')
            ->select([
                'po.po_number as po_no', 'po.supplier_name', 's.supplier_code',
                DB::raw("(SELECT string_agg(i.product_name, ', ' ORDER BY i.id) FROM purchase_order_items i WHERE i.purchase_order_id = po.id) as products"),
                DB::raw('(SELECT COALESCE(SUM(i.ordered_quantity), 0) FROM purchase_order_items i WHERE i.purchase_order_id = po.id) as quantity'),
                'po.status', 'po.created_at', 'po.sent_at', 'po.expected_delivery_date as expected_delivery', 'rr.request_no as linked_request',
                DB::raw('(SELECT COUNT(*) FROM receivings rc WHERE rc.purchase_order_id = po.id AND rc.replacement_for_rejection_case_id IS NULL) as receivings'),
                'ap.name as approved_by',
            ])
            ->orderByDesc('po.created_at')->orderByDesc('po.id');

        if ($f->supplierId) $query->where('po.supplier_id', $f->supplierId);
        if ($f->status) $query->where('po.status', $f->status);

        return $this->dateRange($query, 'po.created_at', $f);
    }

    private function procurementStatus(ReportFilters $f): Builder
    {
        $label = 'CASE rr.status '.collect(self::REPLENISHMENT_STATUSES)->map(fn ($text, $value) => "WHEN '{$value}' THEN '{$text}'")->implode(' ').' ELSE rr.status END';
        $requests = $this->dateRange(DB::table('replenishment_requests as rr'), 'rr.created_at', $f)
            ->groupBy('rr.status')
            ->select([DB::raw("'Replenishment Request' as record_type"), DB::raw("{$label} as status")])
            ->selectRaw('COUNT(*) as records, COALESCE(SUM(rr.requested_qty), 0) as total_quantity, MAX(rr.updated_at) as latest_activity');
        $itemTotals = DB::table('purchase_order_items')->select('purchase_order_id')
            ->selectRaw('SUM(ordered_quantity) as quantity')->groupBy('purchase_order_id');
        $orders = $this->dateRange(DB::table('purchase_orders as po'), 'po.created_at', $f)
            ->leftJoinSub($itemTotals, 'poi', 'poi.purchase_order_id', '=', 'po.id')
            ->groupBy('po.status')
            ->select([DB::raw("'Purchase Order' as record_type"), 'po.status'])
            ->selectRaw('COUNT(*) as records')
            ->selectRaw('COALESCE(SUM(poi.quantity), 0) as total_quantity')
            ->selectRaw('MAX(po.updated_at) as latest_activity');

        return DB::query()->fromSub($requests->unionAll($orders), 'ps')->orderByDesc('record_type')->orderBy('status');
    }

    private function supplierBase(ReportFilters $f): Builder
    {
        return DB::table('suppliers as s')
            ->when($f->supplierId, fn (Builder $q, int $id) => $q->where('s.id', $id))
            ->when($f->status, fn (Builder $q, string $status) => $q->where('s.status', $status));
    }

    private function supplierActivity(ReportFilters $f): Builder
    {
        $receivingLines = 'FROM receiving_items ri JOIN receivings r ON r.id = ri.receiving_id JOIN purchase_orders po ON po.id = r.purchase_order_id WHERE po.supplier_id = s.id';

        return $this->supplierBase($f)
            ->select(['s.supplier_code', 's.name', 's.status'])
            ->selectRaw('(SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = s.id) as po_count')
            ->selectRaw("(SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = s.id AND po.status = 'Completed') as completed_po_count")
            ->selectRaw('(SELECT COUNT(*) FROM receivings r JOIN purchase_orders po ON po.id = r.purchase_order_id WHERE po.supplier_id = s.id) as receiving_count')
            ->selectRaw("(SELECT COALESCE(SUM(ri.delivered_quantity), 0) {$receivingLines}) as delivered_qty")
            ->selectRaw("(SELECT COALESCE(SUM(qii.accepted_quantity), 0) FROM qa_inspection_items qii JOIN receiving_items ri ON ri.id = qii.receiving_item_id JOIN receivings r ON r.id = ri.receiving_id JOIN purchase_orders po ON po.id = r.purchase_order_id WHERE po.supplier_id = s.id) as accepted_qty")
            ->selectRaw("(SELECT COALESCE(SUM(qii.rejected_quantity), 0) FROM qa_inspection_items qii JOIN receiving_items ri ON ri.id = qii.receiving_item_id JOIN receivings r ON r.id = ri.receiving_id JOIN purchase_orders po ON po.id = r.purchase_order_id WHERE po.supplier_id = s.id) as rejected_qty")
            ->selectRaw('(SELECT COUNT(*) FROM supplier_rejection_cases c JOIN qa_inspection_items qii ON qii.id = c.qa_inspection_item_id JOIN receiving_items ri ON ri.id = qii.receiving_item_id JOIN receivings r ON r.id = ri.receiving_id JOIN purchase_orders po ON po.id = r.purchase_order_id WHERE po.supplier_id = s.id) as rejection_cases')
            ->orderBy('s.name')->orderBy('s.id');
    }

    private function rejectionQuery(ReportFilters $f): Builder
    {
        $status = 'CASE c.status '.collect(self::REJECTION_STATUSES)->map(fn ($label, $value) => "WHEN '{$value}' THEN '{$label}'")->implode(' ').' ELSE c.status END';

        $query = DB::table('supplier_rejection_cases as c')
            ->join('qa_inspection_items as qii', 'qii.id', '=', 'c.qa_inspection_item_id')
            ->join('receiving_items as ri', 'ri.id', '=', 'qii.receiving_item_id')
            ->join('qa_inspections as qi', 'qi.id', '=', 'qii.qa_inspection_id')
            ->join('receivings as r', 'r.id', '=', 'qi.receiving_id')
            ->leftJoin('purchase_orders as po', 'po.id', '=', 'r.purchase_order_id')
            ->leftJoin('suppliers as s', 's.id', '=', 'po.supplier_id')
            ->leftJoin('receivings as rep', 'rep.replacement_for_rejection_case_id', '=', 'c.id')
            ->select([
                DB::raw("'RJ-' || LPAD(c.id::text, 6, '0') as case_no"), 'r.receiving_no', DB::raw('COALESCE(po.po_number, r.purchase_order) as po_no'),
                DB::raw('COALESCE(s.name, po.supplier_name, r.supplier) as supplier'), 'ri.product_name as product',
                'ri.delivered_quantity as delivered', 'qii.accepted_quantity as accepted', 'qii.rejected_quantity as rejected', 'ri.unit',
                'qii.inspection_result as qa_result', DB::raw("{$status} as status"), 'c.sent_at', 'rep.receiving_no as replacement_receiving',
                'rep.status as replacement_status',
                DB::raw("CASE c.resolution_type WHEN 'REPLACEMENT' THEN 'Replacement requested' WHEN 'REPLACEMENT_RECEIVED' THEN 'Replacement received' WHEN 'NO_REPLACEMENT' THEN 'Closed without replacement' ELSE NULL END as resolution"),
                'c.resolved_at',
            ])
            ->orderByDesc('c.created_at')->orderByDesc('c.id');

        if ($f->productId) $query->where('ri.product_id', $f->productId);
        if ($f->supplierId) $query->where('po.supplier_id', $f->supplierId);
        if ($f->status) $query->where('c.status', $f->status);

        return $this->dateRange($query, 'c.created_at', $f);
    }

    /** Reuses WarehouseCapacity::snapshot so reports never diverge from the operational capacity formula. */
    private function warehouseCapacity(ReportFilters $f): Collection
    {
        return Warehouse::query()
            ->when($f->warehouseId, fn ($q, int $id) => $q->whereKey($id))
            ->when($f->status, fn ($q, string $status) => $q->where('status', $status))
            ->orderBy('name')->orderBy('id')
            ->get()
            ->map(function (Warehouse $warehouse) {
                $snapshot = WarehouseCapacity::snapshot($warehouse);

                return (object) [
                    'warehouse' => $warehouse->name, 'code' => $warehouse->code, 'warehouse_status' => $warehouse->status,
                    'capacity' => $snapshot['capacity'], 'used' => $snapshot['utilized'], 'available_capacity' => $snapshot['available'],
                    'utilization' => $snapshot['utilization_percentage'], 'alert_level' => strtoupper($snapshot['capacity_state']),
                ];
            })
            ->values();
    }

    private function auditLogQuery(ReportFilters $f): Builder
    {
        // Metadata and user agents are never selected; details are app-authored summaries.
        $query = DB::table('audit_logs as al')
            ->select([
                'al.created_at', DB::raw('COALESCE(al.actor_name, al.actor_identifier) as "user"'), 'al.action', 'al.module',
                DB::raw("COALESCE(al.resource_label, al.resource_type) as resource"), 'al.status', 'al.ip_address', 'al.details',
            ])
            ->orderByDesc('al.created_at')->orderByDesc('al.id');

        if ($f->status) $query->where('al.status', $f->status);

        return $this->dateRange($query, 'al.created_at', $f);
    }

    private function userActivity(ReportFilters $f): Builder
    {
        $query = DB::table('audit_logs as al')
            ->join('users as u', 'u.id', '=', 'al.actor_user_id')
            ->leftJoin('roles as ro', 'ro.id', '=', 'u.role_id')
            ->groupBy('u.id', 'u.name', 'ro.name', 'u.status')
            ->select(['u.name as user', 'ro.name as role', 'u.status as account_status'])
            ->selectRaw('COUNT(*) as events')
            ->selectRaw("SUM(CASE WHEN al.action = 'LOGIN' THEN 1 ELSE 0 END) as logins")
            ->selectRaw("SUM(CASE WHEN al.action = 'LOGOUT' THEN 1 ELSE 0 END) as logouts")
            ->selectRaw("SUM(CASE WHEN al.status <> 'SUCCESS' THEN 1 ELSE 0 END) as failed_events")
            ->selectRaw("MAX(CASE WHEN al.action = 'LOGIN' THEN al.created_at END) as last_login")
            ->selectRaw('MAX(al.created_at) as last_activity')
            ->orderByDesc('last_activity')->orderBy('u.id');

        return $this->dateRange($query, 'al.created_at', $f);
    }
}
