// src/pages/admin/OrderManagement.tsx
import React, { useState } from 'react';
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
  | 'Ready for Shipment'
  | 'In Transit'
  | 'Delivered'
  | 'Cancelled';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
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
  totalAmount: number;
  status: OrderStatus;
  assignedTo: string | null;
  assignedDate: string | null;
}

// ============================================
// MOCK DATA
// ============================================

const mockOrders: Order[] = [
  {
    id: '1',
    orderNo: 'SO-2025-0717',
    refNo: 'ORD-88870',
    customer: 'BuildRight Corp.',
    address: '789 Ayala Ave., Makati City, Metro Manila, 1200',
    contact: '+63 912 345 6789',
    orderDate: 'Jul 17, 2025 02:15 PM',
    requiredDelivery: 'Jul 24, 2025 05:00 PM',
    items: [
      { id: 'i1', name: 'GI Pipe 2" x 6m', quantity: 30, unit: 'pcs' },
      { id: 'i2', name: 'Steel Plate 4\' x 8\'', quantity: 10, unit: 'pcs' },
      { id: 'i3', name: 'Welding Rod 3.2mm', quantity: 20, unit: 'kg' },
      { id: 'i4', name: 'Angle Bar 2" x 2"', quantity: 15, unit: 'pcs' },
    ],
    totalAmount: 89450,
    status: 'Assigned',
    assignedTo: 'Juan Dela Cruz',
    assignedDate: 'Jul 18, 2025',
  },
  {
    id: '2',
    orderNo: 'SO-2025-0718',
    refNo: 'ORD-88871',
    customer: 'Prime Structures Inc.',
    address: '456 Bonifacio Ave., Taguig City, Metro Manila, 1630',
    contact: '+63 987 654 3210',
    orderDate: 'Jul 18, 2025 09:00 AM',
    requiredDelivery: 'Jul 25, 2025 02:00 PM',
    items: [
      { id: 'i5', name: 'Cement 40kg', quantity: 50, unit: 'bags' },
      { id: 'i6', name: 'Rebar 16mm', quantity: 100, unit: 'pcs' },
    ],
    totalAmount: 125750,
    status: 'Preparing',
    assignedTo: 'Maria Santos',
    assignedDate: 'Jul 19, 2025',
  },
  {
    id: '3',
    orderNo: 'SO-2025-0719',
    refNo: 'ORD-88872',
    customer: 'Metro Textile Mills',
    address: '123 Pioneer St., Pasig City, Metro Manila, 1600',
    contact: '+63 917 555 1234',
    orderDate: 'Jul 19, 2025 11:30 AM',
    requiredDelivery: 'Jul 26, 2025 04:30 PM',
    items: [
      { id: 'i7', name: 'Industrial Sewing Machine', quantity: 2, unit: 'units' },
      { id: 'i8', name: 'Thread Spools', quantity: 100, unit: 'boxes' },
    ],
    totalAmount: 428000,
    status: 'Ready for Shipment',
    assignedTo: 'Pedro Gonzales',
    assignedDate: 'Jul 20, 2025',
  },
  {
    id: '4',
    orderNo: 'SO-2025-0720',
    refNo: 'ORD-88873',
    customer: 'Peak Health Supply',
    address: '678 San Miguel Ave., Ortigas Center, Pasig City, 1605',
    contact: '+63 918 222 3344',
    orderDate: 'Jul 20, 2025 08:00 AM',
    requiredDelivery: 'Jul 27, 2025 12:00 PM',
    items: [
      { id: 'i9', name: 'Medical Grade Gloves', quantity: 100, unit: 'boxes' },
      { id: 'i10', name: 'Surgical Masks', quantity: 200, unit: 'boxes' },
    ],
    totalAmount: 96700,
    status: 'In Transit',
    assignedTo: 'Rosa Ramirez',
    assignedDate: 'Jul 21, 2025',
  },
  {
    id: '5',
    orderNo: 'SO-2025-0721',
    refNo: 'ORD-88874',
    customer: 'Bayview Home Goods',
    address: '901 Seaside Blvd., Pasay City, 1300',
    contact: '+63 916 777 8899',
    orderDate: 'Jul 21, 2025 01:45 PM',
    requiredDelivery: 'Jul 28, 2025 03:00 PM',
    items: [
      { id: 'i11', name: 'Decorative Vases Set', quantity: 12, unit: 'sets' },
      { id: 'i12', name: 'Canvas Wall Art', quantity: 24, unit: 'pcs' },
    ],
    totalAmount: 18900,
    status: 'Delivered',
    assignedTo: 'Luis Reyes',
    assignedDate: 'Jul 22, 2025',
  },
  {
    id: '6',
    orderNo: 'SO-2025-0722',
    refNo: 'ORD-88875',
    customer: 'Steel Works Ph',
    address: '567 Industrial Ave., Bulacan, 3000',
    contact: '+63 919 888 1122',
    orderDate: 'Jul 22, 2025 10:20 AM',
    requiredDelivery: 'Jul 29, 2025 01:00 PM',
    items: [
      { id: 'i13', name: 'Steel I-Beam 6m', quantity: 8, unit: 'pcs' },
    ],
    totalAmount: 320000,
    status: 'New',
    assignedTo: null,
    assignedDate: null,
  },
];

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
  const [orders] = useState<Order[]>(mockOrders);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(mockOrders[0]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleViewOrder = (order: Order) => {
    setSelectedOrder(order);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
  };

  const handleAction = (action: string) => {
    alert(`${action} action triggered for ${selectedOrder?.orderNo}`);
  };

  // KPI Data
  const kpis = [
    { label: 'NEW ORDERS', count: orders.filter(o => o.status === 'New').length, subtitle: '+3 today', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'ASSIGNED', count: orders.filter(o => o.status === 'Assigned').length, subtitle: 'To Plant Managers', color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { label: 'PREPARING', count: orders.filter(o => o.status === 'Preparing').length, subtitle: 'In Progress', color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'READY FOR SHIPMENT', count: orders.filter(o => o.status === 'Ready for Shipment').length, subtitle: 'Ready to Pickup', color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'IN TRANSIT', count: orders.filter(o => o.status === 'In Transit').length, subtitle: 'With Logistics', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { label: 'DELIVERED', count: orders.filter(o => o.status === 'Delivered').length, subtitle: 'Completed', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'CANCELLED', count: orders.filter(o => o.status === 'Cancelled').length, subtitle: 'Cancelled', color: 'text-red-400', bg: 'bg-red-500/10' },
  ];

  // Lifecycle steps for timeline
  const lifecycleSteps: OrderStatus[] = ['New', 'Assigned', 'Preparing', 'Ready for Shipment', 'In Transit', 'Delivered'];

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
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-slate-700 hover:bg-slate-800/50 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            <RotateCw className="w-4 h-4" />
            Refresh
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-blue-600/20">
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
              placeholder="Search Order No., Customer, Product, Reference No..."
              className="w-full bg-[#070a12] border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <select className="bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40">
            <option>All Status</option>
            <option>New</option>
            <option>Assigned</option>
            <option>Preparing</option>
            <option>Ready for Shipment</option>
            <option>In Transit</option>
            <option>Delivered</option>
            <option>Cancelled</option>
          </select>

          <div className="relative">
            <input
              type="text"
              placeholder="All Dates"
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800/80">
              <tr>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Order No.</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Customer</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Order Date</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Required Delivery</th>
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
                  <td className="py-3 px-3 text-slate-300">{order.items.length} items</td>
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
              const isUpcoming = idx > currentStatusIndex;

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
                <span className="text-white font-medium">{selectedOrder.items.length} items</span>
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

            {/* Actions */}
            <div className="space-y-3 mt-auto pt-4 border-t border-slate-800">
              <h4 className="text-sm font-semibold text-white">Actions</h4>
              <button
                onClick={() => handleAction('View Order Details')}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-600/20"
              >
                View Order Details
              </button>
              <button
                onClick={() => handleAction('Assign to Plant Manager')}
                className="w-full py-2.5 border border-orange-500/50 text-orange-400 hover:bg-orange-500/10 rounded-lg text-sm font-medium transition-colors"
              >
                Assign to Plant Manager
              </button>
              <button
                onClick={() => handleAction('Mark as Ready for Shipment')}
                className="w-full py-2.5 border border-green-500/50 text-green-400 hover:bg-green-500/10 rounded-lg text-sm font-medium transition-colors"
              >
                Mark as Ready for Shipment
              </button>
              <button
                onClick={() => handleAction('Cancel Order')}
                className="w-full py-2.5 border border-red-500/50 text-red-400 hover:bg-red-500/10 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderManagement;