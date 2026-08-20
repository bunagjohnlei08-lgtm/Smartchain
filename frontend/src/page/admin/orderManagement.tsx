// src/pages/admin/OrderManagement.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';
import {
  RotateCw,
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  X,
  CheckCircle,
  Clock,
  Package,
  Truck,
  User,
  Calendar,
  MapPin,
  Circle,
  Check,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

type OrderStatus =
  | 'New'
  | 'Assigned'
  | 'Preparing'
  | 'Ready for Stock Out'
  | 'Stock Out In Progress'
  | 'Stock Out Completed'
  | 'Ready for Shipment'
  | 'In Transit'
  | 'Delivered'
  | 'Cancelled';

interface OrderItem {
  id: string;
  productId: number | null;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  productReferenceRequired: boolean;
}

interface Order {
  id: string;
  orderNo: string;
  refNo: string;
  customer: string;
  address: string;
  contact: string;
  orderDate: string;
  requiredDelivery: string;
  items: OrderItem[];
  itemCount: number;
  totalAmount: number;
  status: OrderStatus;
  assignedTo: string | null;
  assignedDate: string | null;
  products: string[];
  hasInvalidProductReferences: boolean;
}

const statusLabels: Record<string, OrderStatus> = {
  NEW: 'New', ASSIGNED: 'Assigned', PREPARING: 'Preparing',
  READY_FOR_STOCK_OUT: 'Ready for Stock Out', STOCK_OUT_IN_PROGRESS: 'Stock Out In Progress', STOCK_OUT_COMPLETED: 'Stock Out Completed',
  READY_FOR_SHIPMENT: 'Ready for Shipment', IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
};

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '';

const mapOrder = (order: any): Order => ({
  id: String(order.id), orderNo: order.order_no, refNo: order.reference_no || '',
  customer: order.customer_name, address: order.customer_address || '', contact: order.customer_contact || '',
  orderDate: formatDate(order.order_date), requiredDelivery: formatDate(order.required_delivery_date),
  items: (order.items || []).map((item: any) => ({ id: String(item.id), productId: item.product_id ? Number(item.product_id) : null, name: item.product_name || 'Unnamed product', quantity: Number(item.quantity), unit: item.unit, unitPrice: Number(item.unit_price), subtotal: Number(item.subtotal), productReferenceRequired: Boolean(item.product_reference_required || !item.product_id) })),
  itemCount: Number(order.items_count ?? order.items?.length ?? 0),
  totalAmount: Number(order.total_amount), status: statusLabels[order.status],
  assignedTo: order.assigned_to?.name || null, assignedDate: formatDate(order.assigned_at) || null,
  products: order.products || (order.items || []).map((item: any) => item.product_name || 'Unnamed product'),
  hasInvalidProductReferences: Boolean(order.has_invalid_product_references),
});

// ============================================
// HELPER COMPONENTS
// ============================================

interface StatusConfig {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
}

const statusConfigs: Record<OrderStatus, StatusConfig> = {
  New: {
    label: 'New',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    icon: <Circle className="w-3 h-3 fill-blue-400 text-blue-400" />,
  },
  Assigned: {
    label: 'Assigned',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    icon: <User className="w-3 h-3 text-orange-400" />,
  },
  Preparing: {
    label: 'Preparing',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    icon: <Package className="w-3 h-3 text-purple-400" />,
  },
  'Ready for Stock Out': {
    label: 'Ready for Stock Out',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: <Package className="w-3 h-3 text-amber-400" />,
  },
  'Stock Out In Progress': {
    label: 'Stock Out In Progress',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    icon: <Package className="w-3 h-3 text-cyan-400" />,
  },
  'Stock Out Completed': {
    label: 'Stock Out Completed',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    icon: <Check className="w-3 h-3 text-violet-400" />,
  },
  'Ready for Shipment': {
    label: 'Ready for Shipment',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    icon: <Check className="w-3 h-3 text-green-400" />,
  },
  'In Transit': {
    label: 'In Transit',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    icon: <Truck className="w-3 h-3 text-cyan-400" />,
  },
  Delivered: {
    label: 'Delivered',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    icon: <CheckCircle className="w-3 h-3 text-emerald-400" />,
  },
  Cancelled: {
    label: 'Cancelled',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    icon: <X className="w-3 h-3 text-red-400" />,
  },
};

const StatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const config = statusConfigs[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${config.color} ${config.bg} ${config.border}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
};

const KpiCard: React.FC<{
  label: string;
  count: number;
  subtitle: string;
  color: string;
  bg: string;
}> = ({ label, count, subtitle, color, bg }) => {
  return (
    <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 flex flex-col hover:border-slate-700 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${bg} ${color}`}>
          <Package className="w-4 h-4" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-white">{count}</p>
        </div>
      </div>
      <p className={`text-xs font-medium mt-1 ${color}`}>{subtitle}</p>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const OrderManagement: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [plantManagers, setPlantManagers] = useState<Array<{ id: number; name: string; employee_id?: string }>>([]);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [managerId, setManagerId] = useState('');
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [assignmentError, setAssignmentError] = useState('');

  const loadOrders = useCallback(async () => {
    const [ordersResponse, summaryResponse] = await Promise.all([
      apiClient.get('/admin/orders', { params: { search: search || undefined, status: status || undefined, date_from: dateFrom || undefined, per_page: 100 } }),
      apiClient.get('/admin/orders/summary'),
    ]);
    setOrders(ordersResponse.data.data.map(mapOrder));
    setSummary(summaryResponse.data);
  }, [search, status, dateFrom]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const handleViewOrder = async (order: Order) => {
    const response = await apiClient.get(`/admin/orders/${order.id}`);
    setSelectedOrder(mapOrder(response.data));
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
  };

  const openAssignment = async () => {
    if (!selectedOrder) return;
    setAssignmentError('');
    const response = await apiClient.get('/admin/orders/plant-managers');
    setPlantManagers(response.data);
    setManagerId('');
    setAssignmentOpen(true);
  };

  const assignOrder = async () => {
    if (!selectedOrder || !managerId) return;
    setAssignmentBusy(true);
    setAssignmentError('');
    try {
      const response = await apiClient.patch(`/admin/orders/${selectedOrder.id}/assign`, { assigned_to: Number(managerId) });
      setSelectedOrder(mapOrder(response.data));
      setAssignmentOpen(false);
      await loadOrders();
    } catch (error: any) {
      setAssignmentError(error?.response?.data?.message || Object.values(error?.response?.data?.errors || {}).flat()[0] || 'Assignment could not be saved.');
    } finally {
      setAssignmentBusy(false);
    }
  };


  // KPI Data
  const kpis = [
    { label: 'NEW ORDERS', count: summary.NEW || 0, subtitle: 'Awaiting Review', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'ASSIGNED', count: summary.ASSIGNED || 0, subtitle: 'To Plant Managers', color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { label: 'PREPARING', count: summary.PREPARING || 0, subtitle: 'In Progress', color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'READY FOR SHIPMENT', count: summary.READY_FOR_SHIPMENT || 0, subtitle: 'Ready to Pickup', color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'IN TRANSIT', count: summary.IN_TRANSIT || 0, subtitle: 'With Logistics', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { label: 'DELIVERED', count: summary.DELIVERED || 0, subtitle: 'Completed', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'CANCELLED', count: summary.CANCELLED || 0, subtitle: 'Cancelled', color: 'text-red-400', bg: 'bg-red-500/10' },
  ];

  // Lifecycle steps for timeline
  const lifecycleSteps: OrderStatus[] = ['New', 'Assigned', 'Preparing', 'Ready for Stock Out', 'Stock Out In Progress', 'Stock Out Completed', 'Ready for Shipment', 'In Transit', 'Delivered'];

  return (
    <div className="w-full min-h-screen bg-[#070a12] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 overflow-x-hidden">
      {/* ============================================================
      HEADER
      ============================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Order Management</h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage and track customer orders from other groups. Assign to plant manager and monitor fulfillment.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => void loadOrders()} className="inline-flex items-center gap-2 px-4 py-2 border border-slate-700 hover:bg-slate-800/50 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            <RotateCw className="w-4 h-4" />
            Refresh
          </button>
          <button disabled title="External order import is not configured" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-blue-600/20">
            <Plus className="w-4 h-4" />
            Import Orders
          </button>
        </div>
      </div>

      {/* ============================================================
      KPI CARDS
      ============================================================ */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {kpis.map((kpi, idx) => (
          <KpiCard key={idx} {...kpi} />
        ))}
      </div>

      {/* ============================================================
      TABLE & SEARCH CONTROLS
      ============================================================ */}
      <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Order No., Customer, Product, Reference No..."
              className="w-full bg-[#070a12] border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <select value={status} onChange={(event) => setStatus(event.target.value)} className="bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40">
            <option value="">All Status</option>
            <option value="NEW">New</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="PREPARING">Preparing</option>
            <option value="READY_FOR_STOCK_OUT">Ready for Stock Out</option>
            <option value="STOCK_OUT_IN_PROGRESS">Stock Out In Progress</option>
            <option value="STOCK_OUT_COMPLETED">Stock Out Completed</option>
            <option value="READY_FOR_SHIPMENT">Ready for Shipment</option>
            <option value="IN_TRANSIT">In Transit</option>
            <option value="DELIVERED">Delivered</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <div className="relative">
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              aria-label="Order date from"
              className="bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 w-36"
            />
            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          </div>

          <button className="inline-flex items-center gap-2 px-4 py-2 border border-slate-700 hover:bg-slate-800/50 text-slate-300 rounded-lg text-sm font-medium transition-colors">
            <Filter className="w-4 h-4" />
            Filter
          </button>

          <button className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-sm font-medium transition-colors ml-auto">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>

        {/* Table */}
        <div className="w-full max-w-full overflow-x-auto overscroll-x-contain custom-scrollbar">
          <table className="table-auto w-full min-w-[1400px] border-separate border-spacing-0 text-sm [&_thead]:table-header-group [&_tbody]:table-row-group [&_tr]:table-row [&_th]:table-cell [&_td]:table-cell [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-slate-800/80 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-slate-800/60">
            <thead className="border-b border-slate-800/80">
              <tr>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Order No.</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Customer</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Order Date</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Required Delivery</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Products</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Items</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Total Amount</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Assigned To</th>
                <th className="text-right py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-800/20 transition-colors cursor-pointer" onClick={() => handleViewOrder(order)}>
                  <td className="py-3 px-3">
                    <p className="font-mono text-blue-400 hover:underline font-medium">{order.orderNo}</p>
                    <p className="text-xs text-slate-500">{order.refNo}</p>
                  </td>
                  <td className="py-3 px-3">
                    <p className="text-slate-200">{order.customer}</p>
                    <p className="text-xs text-slate-500">{order.address.split(',').slice(1).join(',').trim()}</p>
                  </td>
                  <td className="py-3 px-3 text-slate-300">{order.orderDate}</td>
                  <td className="py-3 px-3 text-slate-300">{order.requiredDelivery}</td>
                  <td className="max-w-56 py-3 px-3 text-slate-300">
                    {order.products.length ? order.products.map(product => <p key={product} className="text-slate-200">{product}</p>) : <p className="text-slate-500">No products</p>}
                  </td>
                  <td className="py-3 px-3 text-slate-300">{order.itemCount} items</td>
                  <td className="py-3 px-3 text-white font-medium">₱{order.totalAmount.toLocaleString()}</td>
                  <td className="py-3 px-3"><StatusBadge status={order.status} /></td>
                  <td className="py-3 px-3">
                    {order.assignedTo ? (
                      <div>
                        <p className="text-slate-200">{order.assignedTo}</p>
                        <p className="text-xs text-slate-500">Plant Manager</p>
                      </div>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleViewOrder(order); }}
                      className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================
      BOTTOM SECTION (TIMELINE & ITEMS PREVIEW)
      ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline Card */}
        <div className="lg:col-span-2 bg-[#0b101d] border border-slate-800/80 rounded-xl p-5">
          <h3 className="text-base font-semibold text-white mb-6 flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            Recent Order Timeline
          </h3>
          <div className="flex items-center justify-between w-full relative">
            {lifecycleSteps.map((step, idx) => {
              const currentStatusIndex = lifecycleSteps.indexOf(selectedOrder?.status || 'New');
              const isCompleted = idx <= currentStatusIndex;
              const isCurrent = idx === currentStatusIndex;
              return (
                <div key={step} className="flex-1 flex flex-col items-center relative">
                  {/* Connector Line */}
                  {idx < lifecycleSteps.length - 1 && (
                    <div className={`absolute top-4 left-[calc(50%+20px)] w-[calc(100%-40px)] h-0.5 ${isCompleted ? 'bg-cyan-500' : 'bg-slate-700'}`} />
                  )}
                  {/* Dot */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center border-2 z-10 ${
                      isCompleted
                        ? 'border-cyan-500 bg-cyan-500/20 text-cyan-500'
                        : isCurrent
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-500 animate-pulse'
                        : 'border-slate-600 bg-slate-800/50 text-slate-600'
                    }`}
                  >
                    {isCompleted ? <Check className="w-4 h-4" /> : <span className="text-xs font-bold">{idx + 1}</span>}
                  </div>
                  {/* Label */}
                  <p className={`text-xs font-medium mt-2 text-center ${isCompleted ? 'text-white' : 'text-slate-500'}`}>
                    {step}
                  </p>
                  <p className="text-[10px] text-slate-500 text-center">
                    {isCompleted && selectedOrder?.assignedDate ? selectedOrder.assignedDate : ''}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Order Items Preview Card */}
        <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-5">
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-cyan-400" />
            Order Items Preview
          </h3>
          {selectedOrder ? (
            <div className="space-y-3">
              {selectedOrder.items.slice(0, 4).map((item) => (
                <div key={item.id} className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                  <div>
                    <p className="text-sm text-slate-200">{item.name}</p>
                  </div>
                  <div className="text-sm text-slate-400 font-medium">
                    {item.quantity} {item.unit}
                  </div>
                </div>
              ))}
              {selectedOrder.items.length > 4 && (
                <button className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors mt-2">
                  View All Items ({selectedOrder.items.length})
                </button>
              )}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">Select an order to preview items.</p>
          )}
        </div>
      </div>

      {/* ============================================================
      RIGHT DRAWER: ORDER DETAILS
      ============================================================ */}
      {isDrawerOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="bg-black/60 backdrop-blur-sm w-full" onClick={handleCloseDrawer}></div>
          {/* Drawer */}
          <div className="bg-[#0b101d] border-l border-slate-800 w-full sm:w-96 h-full overflow-y-auto p-6 animate-in slide-in-from-right duration-300 flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  {selectedOrder.orderNo}
                </h2>
                <p className="text-sm text-slate-400">{selectedOrder.refNo}</p>
                <StatusBadge status={selectedOrder.status} />
              </div>
              <button onClick={handleCloseDrawer} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Order Date */}
            <div className="text-sm text-slate-400 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>Order Date: {selectedOrder.orderDate}</span>
            </div>

            {/* Customer Info */}
            <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700 space-y-2">
              <h4 className="text-sm font-semibold text-white">Customer Information</h4>
              <p className="text-slate-200 font-medium">{selectedOrder.customer}</p>
              <p className="text-slate-400 text-sm flex items-start gap-2">
                <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{selectedOrder.address}</span>
              </p>
              <p className="text-slate-400 text-sm flex items-center gap-2">
                <User className="w-4 h-4" />
                {selectedOrder.contact}
              </p>
            </div>

            {/* Order Summary */}
            <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700 space-y-2">
              <h4 className="text-sm font-semibold text-white">Order Summary</h4>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Items</span>
                <span className="text-white font-medium">{selectedOrder.itemCount} items</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Total Amount</span>
                <span className="text-white font-bold">₱{selectedOrder.totalAmount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Required Delivery</span>
                <span className="text-slate-200">{selectedOrder.requiredDelivery}</span>
              </div>
            </div>

            {/* Status & Assignment */}
            <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700 space-y-2">
              <h4 className="text-sm font-semibold text-white">Status & Assignment</h4>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Status</span>
                <StatusBadge status={selectedOrder.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Assigned To</span>
                <span className="text-white font-medium">{selectedOrder.assignedTo || 'Unassigned'}</span>
              </div>
              {selectedOrder.assignedDate && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Assigned Date</span>
                  <span className="text-slate-300">{selectedOrder.assignedDate}</span>
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white">Order Items</h4>
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full min-w-[620px] text-xs">
                  <thead className="bg-[#070a12] text-slate-400"><tr><th className="px-3 py-2 text-left">Product</th><th className="px-3 py-2 text-right">Ordered Quantity</th><th className="px-3 py-2 text-left">Unit</th><th className="px-3 py-2 text-right">Unit Price</th><th className="px-3 py-2 text-right">Subtotal</th></tr></thead>
                  <tbody className="divide-y divide-slate-800">{selectedOrder.items.map(item => <tr key={item.id}>
                    <td className="px-3 py-3 text-slate-200">{item.name}</td>
                    <td className="px-3 py-3 text-right text-white">{item.quantity}</td><td className="px-3 py-3 text-slate-300">{item.unit}</td><td className="px-3 py-3 text-right text-slate-300">₱{item.unitPrice.toLocaleString()}</td><td className="px-3 py-3 text-right text-white">₱{item.subtotal.toLocaleString()}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3 mt-auto pt-4 border-t border-slate-800">
              <h4 className="text-sm font-semibold text-white">Actions</h4>
              <button
                onClick={() => selectedOrder && void handleViewOrder(selectedOrder)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-600/20"
              >
                View Order Details
              </button>
              <button
                onClick={() => void openAssignment()}
                disabled={!['New', 'Assigned'].includes(selectedOrder.status)}
                className="w-full py-2.5 border border-orange-500/50 text-orange-400 hover:bg-orange-500/10 rounded-lg text-sm font-medium transition-colors"
              >
                {selectedOrder.status === 'Assigned' ? 'Reassign Plant Manager' : 'Assign to Plant Manager'}
              </button>
            </div>
          </div>
        </div>
      )}

      {assignmentOpen && selectedOrder && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="assignment-title">
        <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#0b101d] p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4"><div><h2 id="assignment-title" className="text-lg font-semibold text-white">Assign Plant Manager</h2><p className="mt-1 text-sm text-slate-400">{selectedOrder.orderNo} will remain the same order record.</p></div><button onClick={() => setAssignmentOpen(false)} aria-label="Close assignment dialog" className="min-h-11 min-w-11 cursor-pointer rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"><X className="mx-auto h-5 w-5" /></button></div>
          {assignmentError && <p role="alert" className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{assignmentError}</p>}
          <label className="mt-5 block text-sm text-slate-300">Available Plant Manager<select value={managerId} onChange={event => setManagerId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-[#070a12] px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"><option value="">Select a Plant Manager</option>{plantManagers.map(manager => <option key={manager.id} value={manager.id}>{manager.name}{manager.employee_id ? ` — ${manager.employee_id}` : ''}</option>)}</select></label>
          {!plantManagers.length && <p className="mt-2 text-sm text-amber-300">No active Plant Managers are available.</p>}
          <div className="mt-6 flex justify-end gap-3"><button onClick={() => setAssignmentOpen(false)} className="min-h-11 cursor-pointer rounded-lg border border-slate-700 px-4 text-slate-300 hover:bg-slate-800">Close</button><button onClick={() => void assignOrder()} disabled={!managerId || assignmentBusy} className="min-h-11 cursor-pointer rounded-lg bg-cyan-500 px-4 font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50">{assignmentBusy ? 'Assigning…' : 'Save Assignment'}</button></div>
        </div>
      </div>}

    </div>
  );
};

export default OrderManagement;
