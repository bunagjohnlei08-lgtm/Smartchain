// src/pages/plant-manager/OrderManagement.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../../lib/api';
import { usePlantManagerDetailOverlay } from '../../components/layout/PlantManagerDetailOverlayContext';
import {
  RefreshCw,
  Printer,
  Search,
  Eye,
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  FileText,
  Calendar,
  User,
  UserCheck,
  AlertTriangle,
  Layers,
  ListTodo,
  Check,
  Box,
  LayoutGrid,
  LayoutList,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

type OrderStatus =
  | 'Assigned'
  | 'Preparing'
  | 'Ready for Stock Out'
  | 'Stock Out Completed'
  | 'For Packing'
  | 'Packing'
  | 'Ready for Shipment'
  | 'Forwarded to Logistics'
  | 'In Transit'
  | 'Delivered'
  | 'Cancelled';

type Priority = 'High' | 'Medium' | 'Low';

type StockAllocationStatus = '100% Reserved' | 'Partial Stock' | 'No Stock' | 'Not Tracked';

interface OrderItem {
  id: string;
  productName: string;
  productReferenceRequired: boolean;
  requiredQty: number;
  availableQty: number; // in assigned warehouse
  allocatedQty: number;
  unit: string;
}

interface Order {
  id: string;
  orderNumber: string;
  customer: string;
  destination: string;
  contact: string;
  assignedDate: string;
  targetDelivery: string;
  assignedWarehouse: string;
  priority: Priority;
  status: OrderStatus;
  items: OrderItem[];
  totalItems: number;
  totalAmount: number;
  allocationStatus: StockAllocationStatus;
  createdAt: string;
  timeline: OrderTimelineEvent[];
}

interface OrderTimelineEvent {
  id: string;
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  performedBy: string | null;
  createdAt: string;
}

type TimelineStepState = 'completed' | 'current' | 'pending' | 'cancelled';

interface OrderSummary {
  assigned: number;
  preparing: number;
  readyForStockOut: number;
  inTransit: number;
  delivered: number;
  cancelled: number;
}

const statusLabels: Record<string, OrderStatus> = {
  ASSIGNED: 'Assigned',
  PREPARING: 'Preparing',
  READY_FOR_STOCK_OUT: 'Ready for Stock Out',
  STOCK_OUT_COMPLETED: 'Stock Out Completed',
  FOR_PACKING: 'For Packing',
  PACKING: 'Packing',
  READY_FOR_SHIPMENT: 'Ready for Shipment',
  FORWARDED_TO_LOGISTICS: 'Forwarded to Logistics',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const formatDate = (value?: string | null) => value
  ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(value))
  : '—';

const mapOrder = (order: any): Order => ({
  id: String(order.id),
  orderNumber: order.order_no,
  customer: order.customer_name,
  destination: order.customer_address || '—',
  contact: order.customer_contact || '—',
  assignedDate: formatDate(order.assigned_at),
  targetDelivery: formatDate(order.required_delivery_date),
  assignedWarehouse: order.warehouse?.name || 'Unassigned',
  priority: `${order.priority?.slice(0, 1)}${order.priority?.slice(1).toLowerCase()}` as Priority,
  status: statusLabels[order.status],
  items: (order.items || []).map((item: any) => ({
    id: String(item.id),
    productName: item.product_name,
    productReferenceRequired: Boolean(item.product_reference_required || !item.product_id),
    requiredQty: Number(item.required_quantity),
    availableQty: Number(item.available_quantity || 0),
    allocatedQty: Number(item.allocated_quantity || 0),
    unit: item.unit,
  })),
  totalItems: Number(order.items_count ?? order.items?.length ?? 0),
  totalAmount: Number(order.total_amount),
  allocationStatus: order.allocation_status === 'FULLY_RESERVED' ? '100% Reserved'
    : order.allocation_status === 'PARTIAL' ? 'Partial Stock'
      : order.allocation_status === 'NO_STOCK' ? 'No Stock' : 'Not Tracked',
  createdAt: order.created_at || order.order_date || '',
  timeline: (order.timeline || []).map((event: any) => ({
    id: String(event.id),
    action: event.action,
    previousStatus: event.previous_status,
    newStatus: event.new_status,
    performedBy: event.performed_by?.name || null,
    createdAt: event.created_at,
  })),
});

const workflowRank: Record<OrderStatus, number> = {
  Assigned: 1,
  Preparing: 2,
  'Ready for Stock Out': 3,
  'Stock Out Completed': 4,
  'For Packing': 5,
  Packing: 6,
  'Ready for Shipment': 7,
  'Forwarded to Logistics': 8,
  'In Transit': 9,
  Delivered: 10,
  Cancelled: 0,
};

const formatTimelineDate = (value?: string | null) => value
  ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : null;

const findTimelineEvent = (order: Order, statuses: string[]) =>
  [...order.timeline].reverse().find(event => event.newStatus && statuses.includes(event.newStatus));

// HELPER FUNCTIONS
// ============================================

const getStatusColor = (status: OrderStatus) => {
  switch (status) {
    case 'Assigned':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'Preparing':
      return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    case 'Ready for Stock Out':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'Stock Out Completed':
      return 'bg-violet-500/20 text-violet-400 border-violet-500/30';
    case 'For Packing':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'Packing':
      return 'bg-sky-500/20 text-sky-400 border-sky-500/30';
    case 'Ready for Shipment':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'In Transit':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'Delivered':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'Cancelled':
      return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    default:
      return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
};

// ============================================
// SUB-COMPONENTS
// ============================================

// Status Badge
const StatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  return (
    <span className={`plant-manager-badge inline-flex w-fit items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(status)}`}>
      {status}
    </span>
  );
};

// KPI Card
const KPICard: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  colorClass: string;
  onClick: () => void;
}> = ({ label, value, icon, colorClass, onClick }) => {
  const borderClass = colorClass.replace('text-', 'border-') + '/30';
  const bgClass = colorClass.replace('text-', 'bg-') + '/10';
  return (
    <button type="button" onClick={onClick} className="w-full cursor-pointer bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 flex flex-col text-left hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-colors">
      <div className="flex items-center gap-3 w-full mb-3">
        <div className={`border ${borderClass} ${bgClass} p-2 rounded-lg shrink-0`}>
          <span className={colorClass}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <span className="mobile-kpi-title text-[11px] font-bold tracking-wider text-slate-300 uppercase leading-snug truncate block">{label}</span>
        </div>
      </div>
      <div className="flex items-baseline gap-1.5 mt-auto">
        <span className="mobile-kpi-value text-2xl font-bold text-white">{value}</span>
        <span className="mobile-kpi-helper text-xs font-medium text-slate-400">orders</span>
      </div>
    </button>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const OrderManagement: React.FC = () => {
  // State for filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'All'>('All');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'All'>('All');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isSelectionLoading, setIsSelectionLoading] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  usePlantManagerDetailOverlay(isPanelOpen && selectedOrder !== null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<OrderSummary>({ assigned: 0, preparing: 0, readyForStockOut: 0, inTransit: 0, delivered: 0, cancelled: 0 });
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const selectionRequestRef = useRef(0);

  const loadOrders = useCallback(async () => {
    const [ordersResponse, summaryResponse] = await Promise.all([
      apiClient.get('/plant-manager/orders', { params: { per_page: 100 } }),
      apiClient.get('/plant-manager/orders/summary'),
    ]);
    setOrders(ordersResponse.data.data.map(mapOrder));
    setSummary(summaryResponse.data);
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  // Derived stats
  const assignedCount = summary.assigned;
  const preparingCount = summary.preparing;
  const readyCount = summary.readyForStockOut;
  const inTransitCount = summary.inTransit;
  const deliveredCount = summary.delivered;
  const cancelledCount = summary.cancelled;
  const warehouseOptions = useMemo(
    () => [...new Set(orders.map(order => order.assignedWarehouse).filter(name => name !== 'Unassigned'))],
    [orders],
  );

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch =
        order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.items.some(item => item.productName.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesStatus = statusFilter === 'All' || order.status === statusFilter;
      const matchesWarehouse = warehouseFilter === 'All' || order.assignedWarehouse === warehouseFilter;
      const matchesPriority = priorityFilter === 'All' || order.priority === priorityFilter;
      return matchesSearch && matchesStatus && matchesWarehouse && matchesPriority;
    });
  }, [orders, searchTerm, statusFilter, warehouseFilter, priorityFilter]);

  const selectOrder = useCallback(async (order: Order, openPanel = false) => {
    setActionError(null);
    setSelectedOrderId(order.id);
    setIsSelectionLoading(true);
    const requestId = ++selectionRequestRef.current;

    try {
      const response = await apiClient.get(`/plant-manager/orders/${order.id}`);
      if (requestId !== selectionRequestRef.current) return;
      setSelectedOrder(mapOrder(response.data));
      if (openPanel) setIsPanelOpen(true);
    } catch (error) {
      if (requestId !== selectionRequestRef.current) return;
      setSelectedOrderId(null);
      setSelectedOrder(null);
      setIsPanelOpen(false);
      setActionError('Unable to load the selected order details. Please try again.');
    } finally {
      if (requestId === selectionRequestRef.current) setIsSelectionLoading(false);
    }
  }, []);

  const visibleSelectedOrder = selectedOrder?.id === selectedOrderId && filteredOrders.some(order => order.id === selectedOrderId)
    ? selectedOrder
    : null;

  useEffect(() => {
    if (filteredOrders.length === 0) {
      selectionRequestRef.current += 1;
      setSelectedOrderId(null);
      setSelectedOrder(null);
      setIsSelectionLoading(false);
      setIsPanelOpen(false);
      return;
    }

    if (!filteredOrders.some(order => order.id === selectedOrderId)) {
      setIsPanelOpen(false);
      void selectOrder(filteredOrders[0]);
    }
  }, [filteredOrders, selectOrder, selectedOrderId]);

  const timelineSteps = useMemo(() => {
    if (!visibleSelectedOrder) return [];

    const order = visibleSelectedOrder;
    const rank = workflowRank[order.status];
    const cancelled = order.status === 'Cancelled';
    const assignmentEvent = findTimelineEvent(order, ['ASSIGNED']);
    const preparationEvent = findTimelineEvent(order, ['PREPARING', 'READY_FOR_STOCK_OUT']);
    const packingEvent = findTimelineEvent(order, ['STOCK_OUT_COMPLETED', 'FOR_PACKING', 'PACKING', 'READY_FOR_SHIPMENT']);
    const pickupEvent = findTimelineEvent(order, ['READY_FOR_SHIPMENT', 'FORWARDED_TO_LOGISTICS', 'IN_TRANSIT', 'DELIVERED']);
    const state = (completedAtRank: number, currentAtRank?: number): TimelineStepState => {
      if (cancelled && rank < completedAtRank) return 'cancelled';
      if (rank >= completedAtRank) return 'completed';
      if (currentAtRank !== undefined && rank >= currentAtRank) return 'current';
      return 'pending';
    };

    return [
      { step: 'Import Order', icon: <FileText className="h-4 w-4" />, state: 'completed' as TimelineStepState, date: formatTimelineDate(order.createdAt) },
      { step: 'Admin Assignment', icon: <User className="h-4 w-4" />, state: state(1), date: formatTimelineDate(assignmentEvent?.createdAt) || order.assignedDate },
      { step: 'Picking & Preparation', icon: <Package className="h-4 w-4" />, state: state(3, 2), date: formatTimelineDate(preparationEvent?.createdAt) },
      { step: 'Packing', icon: <Box className="h-4 w-4" />, state: state(7, 3), date: formatTimelineDate(packingEvent?.createdAt) },
      { step: 'Ready for Pickup', icon: <Truck className="h-4 w-4" />, state: state(7), date: formatTimelineDate(pickupEvent?.createdAt) },
    ];
  }, [visibleSelectedOrder]);

  // KPI data
  const kpiData = [
    { label: 'Assigned to Me', status: 'Assigned' as OrderStatus, value: assignedCount, icon: <UserCheck className="w-5 h-5" />, colorClass: 'text-orange-500' },
    { label: 'Preparing', status: 'Preparing' as OrderStatus, value: preparingCount, icon: <Package className="w-5 h-5" />, colorClass: 'text-purple-500' },
    { label: 'Ready for Stock Out', status: 'Ready for Stock Out' as OrderStatus, value: readyCount, icon: <Truck className="w-5 h-5" />, colorClass: 'text-green-500' },
    { label: 'In Transit', status: 'In Transit' as OrderStatus, value: inTransitCount, icon: <Truck className="w-5 h-5" />, colorClass: 'text-blue-500' },
    { label: 'Delivered', status: 'Delivered' as OrderStatus, value: deliveredCount, icon: <CheckCircle2 className="w-5 h-5" />, colorClass: 'text-emerald-500' },
    { label: 'Cancelled', status: 'Cancelled' as OrderStatus, value: cancelledCount, icon: <XCircle className="w-5 h-5" />, colorClass: 'text-red-500' },
  ];

  // Handlers
  const handleViewOrder = async (order: Order) => {
    await selectOrder(order, true);
  };

  const handleClosePanel = () => {
    setIsPanelOpen(false);
    setActionError(null);
  };

  const handleStartPreparation = async (orderId: string) => {
    await apiClient.post(`/plant-manager/orders/${orderId}/start-preparing`);
    await loadOrders();
    handleClosePanel();
  };

  const handleReadyForStockOut = async (orderId: string) => {
    setProcessingOrderId(orderId);
    setActionError(null);

    try {
      const response = await apiClient.post(`/plant-manager/orders/${orderId}/ready-for-stock-out`);
      setSelectedOrder(mapOrder(response.data));
      await loadOrders();
    } catch (error: any) {
      const validationErrors = error?.response?.data?.errors;
      const firstValidationError = validationErrors
        ? Object.values(validationErrors).flat().find((message): message is string => typeof message === 'string')
        : null;
      setActionError(firstValidationError || error?.response?.data?.message || 'Unable to mark this order ready for Stock Out.');
    } finally {
      setProcessingOrderId(null);
    }
  };

  const handleGeneratePickList = (orderId: string) => {
    alert(`Generating pick list for order ${orderId}`);
  };

  const handleFlagStockIssue = (orderId: string) => {
    alert(`Stock issue flagged for order ${orderId}`);
    handleClosePanel();
  };

  return (
    <div className="min-h-screen w-full min-w-0 max-w-full space-y-6 overflow-x-hidden bg-[#070a12] p-4 text-slate-100 sm:p-6 lg:p-8">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Order Fulfillment & Preparation</h1>
          <p className="text-slate-400 text-sm mt-1">
            Process assigned customer orders, check warehouse stock, and prepare shipments for logistics pickup.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => void loadOrders()} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-800 text-sm font-medium text-slate-300 hover:bg-slate-800/50 transition-colors">
            <RefreshCw className="w-4 h-4" />
            Refresh List
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 text-sm font-medium transition-colors">
            <Printer className="w-4 h-4" />
            Print Pick List
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {kpiData.map((kpi, idx) => (
          <KPICard
            key={idx}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            colorClass={kpi.colorClass}
            onClick={() => setStatusFilter(kpi.status)}
          />
        ))}
      </div>

      {/* FILTERS & CONTROLS */}
      <div className="rounded-xl border border-slate-800/80 bg-[#0b101d] p-3 sm:p-4">
        <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:gap-3">
          {/* Search */}
          <div className="relative col-span-2 min-w-0 sm:flex-1 sm:min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search Order #, Customer, or Product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-800 bg-[#070a12] pl-9 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:text-sm"
            />
          </div>

          {/* Filters */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'All')}
            className="h-10 min-w-0 w-full rounded-xl border border-slate-800 bg-[#070a12] px-2 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:w-auto sm:px-3 sm:text-sm"
          >
            <option value="All">All Status</option>
            <option value="Assigned">Assigned</option>
            <option value="Preparing">Preparing</option>
            <option value="Ready for Stock Out">Ready for Stock Out</option>
            <option value="Stock Out Completed">Stock Out Completed</option>
            <option value="For Packing">For Packing</option>
            <option value="Packing">Packing</option>
            <option value="Ready for Shipment">Ready for Shipment</option>
            <option value="In Transit">In Transit</option>
            <option value="Delivered">Delivered</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="h-10 min-w-0 w-full rounded-xl border border-slate-800 bg-[#070a12] px-2 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:w-auto sm:px-3 sm:text-sm"
          >
            <option value="All">All Warehouses</option>
            {warehouseOptions.map(warehouse => <option key={warehouse} value={warehouse}>{warehouse}</option>)}
          </select>

          <div className="col-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)_2.5rem_auto] items-center gap-2 sm:contents">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as Priority | 'All')}
              className="h-10 min-w-0 w-full rounded-xl border border-slate-800 bg-[#070a12] px-2 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:w-auto sm:px-3 sm:text-sm"
            >
              <option value="All">All Priorities</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>

            <button type="button" aria-label="Filter orders by date" title="Date filter" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-800 text-slate-400 transition-colors hover:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
              <Calendar className="w-4 h-4" />
            </button>

            <div className="flex h-10 shrink-0 items-center gap-1 rounded-lg border border-slate-700 bg-[#070a12] p-1 sm:ml-auto" aria-label="Order view"><button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} title="List view" className={`rounded-md p-1.5 ${viewMode === 'list' ? 'bg-slate-200 text-slate-900 dark:bg-[#092635] dark:text-white' : 'text-slate-400 hover:text-white'}`}><LayoutList className="h-4 w-4" /></button><button type="button" onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} title="Grid view" className={`rounded-md p-1.5 ${viewMode === 'grid' ? 'bg-slate-200 text-slate-900 dark:bg-[#092635] dark:text-white' : 'text-slate-400 hover:text-white'}`}><LayoutGrid className="h-4 w-4" /></button></div>
          </div>

          <button className="col-span-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 sm:col-span-1 sm:w-auto sm:justify-start sm:px-4 sm:text-sm">
            <FileText className="w-4 h-4" />
            Export Pick List
          </button>
        </div>
      </div>

      {/* ORDER TABLE */}
      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-800/80 bg-[#0b101d]">
        {viewMode === 'list' ? (
        <div
          className="pm-table-scroll custom-scrollbar min-w-0 max-w-full overflow-x-auto overscroll-x-contain pb-1 [scrollbar-gutter:stable]"
          role="region"
          aria-label="Order management table"
          tabIndex={0}
        >
          <table className="pm-status-table pm-order-status-table pm-responsive-table pm-cols-8 pm-sticky-1 w-full min-w-[1100px] text-sm">
            <thead className="bg-[#070a12] border-b border-slate-800/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Order No.</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Customer / Destination</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Products</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Items</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Assigned Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Target Delivery</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
              {filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => void selectOrder(order)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void selectOrder(order);
                    }
                  }}
                  tabIndex={0}
                  aria-selected={selectedOrderId === order.id}
                  className={`cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500/60 ${selectedOrderId === order.id ? 'bg-cyan-500/10' : 'hover:bg-slate-800/20'}`}
                >
                  <td className="px-4 py-3 font-mono font-medium text-white">{order.orderNumber}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-slate-200">{order.customer}</span>
                      <span className="text-xs text-slate-400 truncate max-w-[150px]">{order.destination}</span>
                    </div>
                  </td>
                  <td className="max-w-56 px-4 py-3">
                    <p className="truncate text-slate-200" title={order.items[0]?.productName}>
                      {order.items[0]?.productName || 'No products'}
                    </p>
                    {order.items.length > 1 && (
                      <p className="text-xs text-slate-500">+ {order.items.length - 1} more</p>
                    )}
                    {order.items.some(item => item.productReferenceRequired) && (
                      <p className="mt-1 text-xs text-amber-400">Product reference required</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{order.totalItems} items</td>
                  <td className="px-4 py-3 text-slate-300">{order.assignedDate}</td>
                  <td className="px-4 py-3 text-slate-300">{order.targetDelivery}</td>
                  <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleViewOrder(order);
                      }}
                      className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                      title="View / Process Order"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No orders match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        ) : filteredOrders.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">{filteredOrders.map((order) => <article key={order.id} onClick={() => void selectOrder(order)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void selectOrder(order); } }} tabIndex={0} aria-selected={selectedOrderId === order.id} className={`cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:bg-slate-800 ${selectedOrderId === order.id ? 'border-cyan-500/60 ring-1 ring-cyan-500/30' : 'border-slate-200 dark:border-slate-700'}`}><div className="flex items-start justify-between gap-3"><div><h3 className="font-mono font-semibold text-slate-900 dark:text-white">{order.orderNumber}</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{order.customer}</p></div><StatusBadge status={order.status} /></div><p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{order.destination}</p><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500 dark:text-slate-400">Products</dt><dd className="text-slate-900 dark:text-white">{order.items[0]?.productName || 'No products'}{order.items.length > 1 ? ` +${order.items.length - 1}` : ''}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Items</dt><dd className="text-slate-900 dark:text-white">{order.totalItems}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Assigned</dt><dd className="text-slate-900 dark:text-white">{order.assignedDate}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Target</dt><dd className="text-slate-900 dark:text-white">{order.targetDelivery}</dd></div></dl><div className="mt-4 flex justify-end border-t border-slate-200 pt-3 dark:border-slate-700"><button onClick={(event) => { event.stopPropagation(); void handleViewOrder(order); }} className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" title="View / Process Order"><Eye className="h-4 w-4" /></button></div></article>)}</div>
        ) : (
          <div className="px-4 py-8 text-center text-slate-400">No orders match your filters.</div>
        )}
      </div>

      {/* BOTTOM ANALYTICS & TIMELINE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fulfillment Steps Timeline */}
        <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-5">
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-cyan-400" />
            Fulfillment Steps & Timeline
          </h3>
          {visibleSelectedOrder ? <div className="space-y-4">
            <p className="-mt-2 text-xs text-slate-400">Showing {visibleSelectedOrder.orderNumber}</p>
            {timelineSteps.map((item, idx) => {
              const active = item.state === 'completed' || item.state === 'current';
              const label = item.state === 'completed' ? 'Completed' : item.state === 'current' ? 'In progress' : item.state === 'cancelled' ? 'Not reached — order cancelled' : 'Pending';
              return (
              <div key={idx} className="flex items-start gap-3">
                <div className="relative flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${active ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800/50 text-slate-500'}`}>
                    {item.icon}
                  </div>
                  {idx < 4 && (
                    <div className={`w-0.5 h-6 ${active ? 'bg-cyan-500/30' : 'bg-slate-700'}`} />
                  )}
                </div>
                <div>
                  <p className={`text-sm font-medium ${active ? 'text-white' : 'text-slate-500'}`}>
                    {item.step}
                  </p>
                  <p className="text-xs text-slate-400">
                    {label}{item.date ? ` · ${item.date}` : ''}
                  </p>
                </div>
              </div>
            );})}
          </div> : <p className="text-sm text-slate-400">{isSelectionLoading ? 'Loading selected order details…' : 'Select an order to view fulfillment details.'}</p>}
        </div>

        {/* Reserved Inventory Summary */}
        <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-5">
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Assigned Inventory Reserved Summary
          </h3>
          {visibleSelectedOrder ? <div className="space-y-3">
            <p className="-mt-2 text-xs text-slate-400">Showing {visibleSelectedOrder.orderNumber}</p>
            {visibleSelectedOrder.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                  <div>
                    <p className="text-sm text-slate-200">{item.productName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white">
                      {item.allocatedQty} / {item.requiredQty} {item.unit}
                    </p>
                    <p className="text-xs text-slate-400">
                      {item.requiredQty > 0 ? Math.round((item.allocatedQty / item.requiredQty) * 100) : 0}% allocated
                    </p>
                  </div>
                </div>
              ))}
            <p className="text-xs text-slate-500 mt-2">Reservation values are shown exactly as returned by the order detail API.</p>
          </div> : <p className="text-sm text-slate-400">{isSelectionLoading ? 'Loading selected order inventory…' : 'Select an order to view its inventory summary.'}</p>}
        </div>
      </div>

      {/* SLIDE-OVER PANEL */}
      {isPanelOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="min-w-0 flex-1 bg-black/60 backdrop-blur-sm" onClick={handleClosePanel}></div>
          {/* Panel */}
          <div className="h-full w-[96vw] shrink-0 overflow-x-hidden overflow-y-auto overscroll-y-contain border-l border-slate-800 bg-[#0b101d] p-3 animate-in slide-in-from-right duration-300 min-[400px]:w-[92vw] sm:w-[480px] sm:p-6">
            <div className="sticky top-0 z-10 -mx-3 -mt-3 mb-4 flex items-start justify-between gap-2 bg-[#0b101d] px-3 py-3 sm:static sm:mx-0 sm:mt-0 sm:mb-6 sm:items-center sm:bg-transparent sm:p-0">
              <h2 className="flex min-w-0 flex-wrap items-center gap-2 whitespace-nowrap text-base font-bold leading-tight text-white sm:text-xl">
                {selectedOrder.orderNumber}
                <StatusBadge status={selectedOrder.status} />
              </h2>
              <button aria-label="Close order details" onClick={handleClosePanel} className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 dark:hover:bg-slate-700 dark:hover:text-white sm:min-h-0 sm:min-w-0 sm:p-1.5">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Customer Info */}
            <div className="mb-4 rounded-xl border border-slate-700 bg-slate-800/30 p-3 sm:mb-6 sm:p-4">
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-slate-400 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-white font-medium">{selectedOrder.customer}</p>
                  <p className="break-words text-sm text-slate-400">{selectedOrder.destination}</p>
                  <p className="text-slate-400 text-sm">{selectedOrder.contact}</p>
                  <p className="text-slate-400 text-sm">Warehouse: {selectedOrder.assignedWarehouse}</p>
                </div>
              </div>
            </div>

            {/* Stock Allocation Checklist */}
            <div className="mb-4 sm:mb-6">
              <h3 className="text-sm font-semibold text-white mb-3">Stock Allocation Checklist</h3>
              <div className="space-y-3">
                {selectedOrder.items.map((item) => {
                  const isFullyAllocated = item.allocatedQty >= item.requiredQty;
                  const isPartial = item.allocatedQty > 0 && item.allocatedQty < item.requiredQty;
                  return (
                    <div key={item.id} className="bg-slate-800/30 rounded-xl p-3 border border-slate-700">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm text-white font-medium">{item.productName}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-white">
                            {item.allocatedQty} / {item.requiredQty} {item.unit}
                          </p>
                          <p className={`text-xs ${isFullyAllocated ? 'text-emerald-400' : isPartial ? 'text-amber-400' : 'text-rose-400'}`}>
                            {isFullyAllocated ? '✓ Fully Allocated' : isPartial ? '⚠ Partial Stock' : '✗ No Stock'}
                          </p>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-slate-700 rounded-full mt-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isFullyAllocated ? 'bg-emerald-500' : isPartial ? 'bg-amber-500' : 'bg-rose-500'}`}
                          style={{ width: `${Math.min((item.allocatedQty / item.requiredQty) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Workflow Actions */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-white">Plant Manager Actions</h3>
              {actionError && (
                <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                  {actionError}
                </p>
              )}
              <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap">
                {selectedOrder.status === 'Assigned' && (
                  <button
                    onClick={() => void handleStartPreparation(selectedOrder.id)}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 sm:flex-1 sm:px-4 sm:text-sm"
                  >
                    <Package className="w-4 h-4" />
                    Start Preparation
                  </button>
                )}
                {selectedOrder.status === 'Preparing' && (
                  <button
                    onClick={() => void handleReadyForStockOut(selectedOrder.id)}
                    disabled={processingOrderId === selectedOrder.id}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-medium text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-1 sm:px-4 sm:text-sm"
                  >
                    <Check className="w-4 h-4" />
                    {processingOrderId === selectedOrder.id ? 'Updating...' : 'Ready for Stock Out'}
                  </button>
                )}
                <button
                  onClick={() => handleGeneratePickList(selectedOrder.id)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 sm:flex-1 sm:px-4 sm:text-sm"
                >
                  <FileText className="w-4 h-4" />
                  Generate Pick List
                </button>
                <button
                  onClick={() => handleFlagStockIssue(selectedOrder.id)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-700 px-3 py-2 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-700/30 sm:flex-1 sm:px-4 sm:text-sm"
                >
                  <AlertTriangle className="w-4 h-4" />
                  Flag Stock Issue
                </button>
              </div>
            </div>

            {/* Additional Info */}
            <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-400">
              <p>Total Items: {selectedOrder.totalItems}</p>
              <p>Total Amount: ₱{selectedOrder.totalAmount.toLocaleString()}</p>
              <p>Target Delivery: {selectedOrder.targetDelivery}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderManagement;
