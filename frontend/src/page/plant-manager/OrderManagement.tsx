// src/pages/plant-manager/OrderManagement.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../lib/api';
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
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

type OrderStatus =
  | 'Assigned'
  | 'Preparing'
  | 'Ready for Stock Out'
  | 'Stock Out Completed'
  | 'Ready for Shipment'
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
}

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
  READY_FOR_SHIPMENT: 'Ready for Shipment',
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
});

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
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(status)}`}>
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
}> = ({ label, value, icon, colorClass }) => {
  const borderClass = colorClass.replace('text-', 'border-') + '/30';
  const bgClass = colorClass.replace('text-', 'bg-') + '/10';
  return (
    <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 flex flex-col hover:border-slate-700 transition-colors">
      <div className="flex items-center gap-3 w-full mb-3">
        <div className={`border ${borderClass} ${bgClass} p-2 rounded-lg shrink-0`}>
          <span className={colorClass}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[11px] font-bold tracking-wider text-slate-300 uppercase leading-snug truncate block">{label}</span>
        </div>
      </div>
      <div className="flex items-baseline gap-1.5 mt-auto">
        <span className="text-2xl font-bold text-white">{value}</span>
        <span className="text-xs font-medium text-slate-400">orders</span>
      </div>
      <div className="mt-2">
        <span className="text-xs text-cyan-400 hover:underline cursor-pointer">View all</span>
      </div>
    </div>
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
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<OrderSummary>({ assigned: 0, preparing: 0, readyForStockOut: 0, inTransit: 0, delivered: 0, cancelled: 0 });
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  // KPI data
  const kpiData = [
    { label: 'Assigned to Me', value: assignedCount, icon: <UserCheck className="w-5 h-5" />, colorClass: 'text-orange-500' },
    { label: 'Preparing', value: preparingCount, icon: <Package className="w-5 h-5" />, colorClass: 'text-purple-500' },
    { label: 'Ready for Stock Out', value: readyCount, icon: <Truck className="w-5 h-5" />, colorClass: 'text-green-500' },
    { label: 'In Transit', value: inTransitCount, icon: <Truck className="w-5 h-5" />, colorClass: 'text-blue-500' },
    { label: 'Delivered', value: deliveredCount, icon: <CheckCircle2 className="w-5 h-5" />, colorClass: 'text-emerald-500' },
    { label: 'Cancelled', value: cancelledCount, icon: <XCircle className="w-5 h-5" />, colorClass: 'text-red-500' },
  ];

  // Handlers
  const handleViewOrder = async (order: Order) => {
    setActionError(null);
    const response = await apiClient.get(`/plant-manager/orders/${order.id}`);
    setSelectedOrder(mapOrder(response.data));
    setIsPanelOpen(true);
  };

  const handleClosePanel = () => {
    setIsPanelOpen(false);
    setSelectedOrder(null);
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
    <div className="w-full min-h-screen bg-[#070a12] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 overflow-x-hidden">
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiData.map((kpi, idx) => (
          <KPICard
            key={idx}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            colorClass={kpi.colorClass}
          />
        ))}
      </div>

      {/* FILTERS & CONTROLS */}
      <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search Order #, Customer, or Product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#070a12] border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
          </div>

          {/* Filters */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'All')}
            className="bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          >
            <option value="All">All Status</option>
            <option value="Assigned">Assigned</option>
            <option value="Preparing">Preparing</option>
            <option value="Ready for Stock Out">Ready for Stock Out</option>
            <option value="Stock Out Completed">Stock Out Completed</option>
            <option value="Ready for Shipment">Ready for Shipment</option>
            <option value="In Transit">In Transit</option>
            <option value="Delivered">Delivered</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          >
            <option value="All">All Warehouses</option>
            {warehouseOptions.map(warehouse => <option key={warehouse} value={warehouse}>{warehouse}</option>)}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as Priority | 'All')}
            className="bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          >
            <option value="All">All Priorities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <button className="px-3 py-2 border border-slate-800 rounded-xl text-sm text-slate-400 hover:bg-slate-800/50 transition-colors">
            <Calendar className="w-4 h-4" />
          </button>

          <button className="ml-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Export Pick List
          </button>
        </div>
      </div>

      {/* ORDER TABLE */}
      <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
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
                <tr key={order.id} className="hover:bg-slate-800/20 transition-colors">
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
                      onClick={() => void handleViewOrder(order)}
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
      </div>

      {/* BOTTOM ANALYTICS & TIMELINE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fulfillment Steps Timeline */}
        <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-5">
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-cyan-400" />
            Fulfillment Steps & Timeline
          </h3>
          <div className="space-y-4">
            {[
              { step: 'Import Order', icon: <FileText className="w-4 h-4" />, active: true },
              { step: 'Admin Assignment', icon: <User className="w-4 h-4" />, active: true },
              { step: 'Picking & Preparation', icon: <Package className="w-4 h-4" />, active: true },
              { step: 'Packing', icon: <Box className="w-4 h-4" />, active: false },
              { step: 'Ready for Pickup', icon: <Truck className="w-4 h-4" />, active: false },
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <div className="relative flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${item.active ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800/50 text-slate-500'}`}>
                    {item.icon}
                  </div>
                  {idx < 4 && (
                    <div className={`w-0.5 h-6 ${item.active ? 'bg-cyan-500/30' : 'bg-slate-700'}`} />
                  )}
                </div>
                <div>
                  <p className={`text-sm font-medium ${item.active ? 'text-white' : 'text-slate-500'}`}>
                    {item.step}
                  </p>
                  <p className="text-xs text-slate-400">
                    {item.active ? 'Completed' : 'Pending'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reserved Inventory Summary */}
        <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-5">
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Assigned Inventory Reserved Summary
          </h3>
          <div className="space-y-3">
            {orders
              .filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled')
              .flatMap(o => o.items)
              .reduce((acc, item) => {
                const existing = acc.find(i => i.productName === item.productName && i.unit === item.unit);
                if (existing) {
                  existing.totalRequired += item.requiredQty;
                  existing.totalAllocated += item.allocatedQty;
                } else {
                  acc.push({
                    productName: item.productName,
                    totalRequired: item.requiredQty,
                    totalAllocated: item.allocatedQty,
                    unit: item.unit,
                  });
                }
                return acc;
              }, [] as { productName: string; totalRequired: number; totalAllocated: number; unit: string; }[])
              .slice(0, 5)
              .map((item, idx) => (
                <div key={idx} className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                  <div>
                    <p className="text-sm text-slate-200">{item.productName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white">
                      {item.totalAllocated} / {item.totalRequired} {item.unit}
                    </p>
                    <p className="text-xs text-slate-400">
                      {Math.round((item.totalAllocated / item.totalRequired) * 100)}% allocated
                    </p>
                  </div>
                </div>
              ))}
            <p className="text-xs text-slate-500 mt-2">Showing top 5 reserved products</p>
          </div>
        </div>
      </div>

      {/* SLIDE-OVER PANEL */}
      {isPanelOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="bg-black/60 backdrop-blur-sm w-full" onClick={handleClosePanel}></div>
          {/* Panel */}
          <div className="bg-[#0b101d] border-l border-slate-800 w-full sm:w-[480px] h-full overflow-y-auto p-6 animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                {selectedOrder.orderNumber}
                <StatusBadge status={selectedOrder.status} />
              </h2>
              <button onClick={handleClosePanel} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Customer Info */}
            <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700 mb-6">
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-white font-medium">{selectedOrder.customer}</p>
                  <p className="text-slate-400 text-sm">{selectedOrder.destination}</p>
                  <p className="text-slate-400 text-sm">{selectedOrder.contact}</p>
                  <p className="text-slate-400 text-sm">Warehouse: {selectedOrder.assignedWarehouse}</p>
                </div>
              </div>
            </div>

            {/* Stock Allocation Checklist */}
            <div className="mb-6">
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
              <div className="flex flex-wrap gap-2">
                {selectedOrder.status === 'Assigned' && (
                  <button
                    onClick={() => void handleStartPreparation(selectedOrder.id)}
                    className="flex-1 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Package className="w-4 h-4" />
                    Start Preparation
                  </button>
                )}
                {selectedOrder.status === 'Preparing' && (
                  <button
                    onClick={() => void handleReadyForStockOut(selectedOrder.id)}
                    disabled={processingOrderId === selectedOrder.id}
                    className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 text-slate-950 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    {processingOrderId === selectedOrder.id ? 'Updating...' : 'Ready for Stock Out'}
                  </button>
                )}
                <button
                  onClick={() => handleGeneratePickList(selectedOrder.id)}
                  className="flex-1 px-4 py-2 border border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Generate Pick List
                </button>
                <button
                  onClick={() => handleFlagStockIssue(selectedOrder.id)}
                  className="flex-1 px-4 py-2 border border-rose-700 hover:bg-rose-700/30 text-rose-400 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
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
