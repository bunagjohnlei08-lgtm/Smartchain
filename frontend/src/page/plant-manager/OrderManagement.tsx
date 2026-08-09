// src/pages/plant-manager/OrderManagement.tsx
import React, { useState, useMemo } from 'react';
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
  | 'Ready for Shipment'
  | 'In Transit'
  | 'Delivered'
  | 'Cancelled';

type Priority = 'High' | 'Medium' | 'Low';

type StockAllocationStatus = '100% Reserved' | 'Partial Stock' | 'No Stock';

interface OrderItem {
  id: string;
  productName: string;
  sku: string;
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

// ============================================
// MOCK DATA
// ============================================

const mockOrders: Order[] = [
  {
    id: '1',
    orderNumber: 'SO-2025-0717',
    customer: 'BuildRight Corp.',
    destination: '789 Ayala Ave, Makati City, Metro Manila, 1200',
    contact: '+63 912 345 6789',
    assignedDate: '2025-07-17',
    targetDelivery: '2025-07-24',
    assignedWarehouse: 'Central Depot',
    priority: 'High',
    status: 'Assigned',
    items: [
      {
        id: 'i1',
        productName: 'Industrial LED Panel 400W',
        sku: 'LED-PNL-400W',
        requiredQty: 20,
        availableQty: 35,
        allocatedQty: 20,
        unit: 'pcs',
      },
      {
        id: 'i2',
        productName: 'Corrugated Box 60x40x40',
        sku: 'CBX-60X40',
        requiredQty: 50,
        availableQty: 92,
        allocatedQty: 50,
        unit: 'pcs',
      },
    ],
    totalItems: 2,
    totalAmount: 184500,
    allocationStatus: '100% Reserved',
  },
  {
    id: '2',
    orderNumber: 'SO-2025-0716',
    customer: 'Prime Structures',
    destination: '456 Bonifacio Ave, Taguig City, Metro Manila, 1630',
    contact: '+63 987 654 3210',
    assignedDate: '2025-07-16',
    targetDelivery: '2025-07-23',
    assignedWarehouse: 'Northgate',
    priority: 'High',
    status: 'Preparing',
    items: [
      {
        id: 'i3',
        productName: 'Stainless Steel Sheet 2mm',
        sku: 'SS-SHEET-2MM',
        requiredQty: 10,
        availableQty: 8,
        allocatedQty: 8,
        unit: 'sheets',
      },
      {
        id: 'i4',
        productName: 'Safety Helmet Class E',
        sku: 'SH-CLASS-E',
        requiredQty: 6,
        availableQty: 64,
        allocatedQty: 6,
        unit: 'pcs',
      },
    ],
    totalItems: 2,
    totalAmount: 62400,
    allocationStatus: 'Partial Stock',
  },
  {
    id: '3',
    orderNumber: 'SO-2025-0715',
    customer: 'Metro Textile Mills',
    destination: '123 Pioneer St, Pasig City, Metro Manila, 1600',
    contact: '+63 917 555 1234',
    assignedDate: '2025-07-15',
    targetDelivery: '2025-07-22',
    assignedWarehouse: 'Southpark',
    priority: 'Medium',
    status: 'Ready for Shipment',
    items: [
      {
        id: 'i5',
        productName: 'Industrial Sewing Machine',
        sku: 'SM-IND-01',
        requiredQty: 2,
        availableQty: 2,
        allocatedQty: 2,
        unit: 'units',
      },
    ],
    totalItems: 1,
    totalAmount: 428000,
    allocationStatus: '100% Reserved',
  },
  {
    id: '4',
    orderNumber: 'SO-2025-0709',
    customer: 'Peak Health Supply',
    destination: '678 San Miguel Ave, Ortigas Center, Pasig City, 1605',
    contact: '+63 918 222 3344',
    assignedDate: '2025-07-09',
    targetDelivery: '2025-07-16',
    assignedWarehouse: 'Eastside',
    priority: 'Low',
    status: 'In Transit',
    items: [
      {
        id: 'i6',
        productName: 'Medical Grade Gloves',
        sku: 'MG-GLOVES',
        requiredQty: 100,
        availableQty: 100,
        allocatedQty: 100,
        unit: 'boxes',
      },
    ],
    totalItems: 1,
    totalAmount: 96700,
    allocationStatus: '100% Reserved',
  },
  {
    id: '5',
    orderNumber: 'SO-2025-0710',
    customer: 'Bayview Home Goods',
    destination: '901 Seaside Blvd, Pasay City, 1300',
    contact: '+63 916 777 8899',
    assignedDate: '2025-07-10',
    targetDelivery: '2025-07-17',
    assignedWarehouse: 'Central Depot',
    priority: 'Low',
    status: 'Delivered',
    items: [
      {
        id: 'i7',
        productName: 'Decorative Vases Set',
        sku: 'DV-SET-01',
        requiredQty: 12,
        availableQty: 12,
        allocatedQty: 12,
        unit: 'sets',
      },
    ],
    totalItems: 1,
    totalAmount: 18900,
    allocationStatus: '100% Reserved',
  },
  {
    id: '6',
    orderNumber: 'SO-2025-0712',
    customer: 'Steel Works Ph',
    destination: '567 Industrial Ave, Bulacan, 3000',
    contact: '+63 919 888 1122',
    assignedDate: '2025-07-12',
    targetDelivery: '2025-07-19',
    assignedWarehouse: 'Southpark',
    priority: 'High',
    status: 'Cancelled',
    items: [
      {
        id: 'i8',
        productName: 'Steel I-Beam 6m',
        sku: 'SB-IB-6M',
        requiredQty: 8,
        availableQty: 8,
        allocatedQty: 0,
        unit: 'pcs',
      },
    ],
    totalItems: 1,
    totalAmount: 320000,
    allocationStatus: 'No Stock',
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

const getStatusColor = (status: OrderStatus) => {
  switch (status) {
    case 'Assigned':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'Preparing':
      return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
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

const getPriorityColor = (priority: Priority) => {
  switch (priority) {
    case 'High':
      return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    case 'Medium':
      return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    case 'Low':
      return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    default:
      return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
  }
};

const getStockAllocationColor = (status: StockAllocationStatus) => {
  switch (status) {
    case '100% Reserved':
      return 'text-emerald-400';
    case 'Partial Stock':
      return 'text-amber-400';
    case 'No Stock':
      return 'text-rose-400';
    default:
      return 'text-slate-400';
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

// Priority Badge
const PriorityBadge: React.FC<{ priority: Priority }> = ({ priority }) => {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getPriorityColor(priority)}`}>
      {priority}
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

  // Derived stats
  const orders = mockOrders;
  const assignedCount = orders.filter(o => o.status === 'Assigned').length;
  const preparingCount = orders.filter(o => o.status === 'Preparing').length;
  const readyCount = orders.filter(o => o.status === 'Ready for Shipment').length;
  const inTransitCount = orders.filter(o => o.status === 'In Transit').length;
  const deliveredCount = orders.filter(o => o.status === 'Delivered').length;
  const cancelledCount = orders.filter(o => o.status === 'Cancelled').length;
  const totalOrders = orders.length;

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch =
        order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.items.some(item => item.sku.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesStatus = statusFilter === 'All' || order.status === statusFilter;
      const matchesWarehouse = warehouseFilter === 'All' || order.assignedWarehouse === warehouseFilter;
      const matchesPriority = priorityFilter === 'All' || order.priority === priorityFilter;
      return matchesSearch && matchesStatus && matchesWarehouse && matchesPriority;
    });
  }, [searchTerm, statusFilter, warehouseFilter, priorityFilter]);

  // KPI data
  const kpiData = [
    { label: 'Assigned to Me', value: assignedCount, icon: <UserCheck className="w-5 h-5" />, colorClass: 'text-orange-500' },
    { label: 'Preparing', value: preparingCount, icon: <Package className="w-5 h-5" />, colorClass: 'text-purple-500' },
    { label: 'Ready for Shipment', value: readyCount, icon: <Truck className="w-5 h-5" />, colorClass: 'text-green-500' },
    { label: 'In Transit', value: inTransitCount, icon: <Truck className="w-5 h-5" />, colorClass: 'text-blue-500' },
    { label: 'Delivered', value: deliveredCount, icon: <CheckCircle2 className="w-5 h-5" />, colorClass: 'text-emerald-500' },
    { label: 'Cancelled', value: cancelledCount, icon: <XCircle className="w-5 h-5" />, colorClass: 'text-red-500' },
  ];

  // Handlers
  const handleViewOrder = (order: Order) => {
    setSelectedOrder(order);
    setIsPanelOpen(true);
  };

  const handleClosePanel = () => {
    setIsPanelOpen(false);
    setSelectedOrder(null);
  };

  const handleStartPreparation = (orderId: string) => {
    // In real app, update status to 'Preparing'
    alert(`Started preparation for order ${orderId}`);
    // For demo, we just close panel
    handleClosePanel();
  };

  const handleMarkReady = (orderId: string) => {
    alert(`Order ${orderId} marked as Ready for Shipment`);
    handleClosePanel();
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
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-800 text-sm font-medium text-slate-300 hover:bg-slate-800/50 transition-colors">
            <RefreshCw className="w-4 h-4" />
            Refresh List
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-medium transition-colors">
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
              placeholder="Search Order #, Customer, or SKU..."
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
            <option value="Central Depot">Central Depot</option>
            <option value="Northgate">Northgate</option>
            <option value="Southpark">Southpark</option>
            <option value="Eastside">Eastside</option>
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

          <button className="ml-auto px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Export Pick List
          </button>
        </div>
      </div>

      {/* ORDER TABLE */}
      <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#070a12] border-b border-slate-800/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Order No.</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Customer / Destination</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Assigned Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Target Delivery</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Warehouse</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Allocation</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-white">{order.orderNumber}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-slate-200">{order.customer}</span>
                      <span className="text-xs text-slate-400 truncate max-w-[150px]">{order.destination}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{order.assignedDate}</td>
                  <td className="px-4 py-3 text-slate-300">{order.targetDelivery}</td>
                  <td className="px-4 py-3 text-slate-300">{order.assignedWarehouse}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${getStockAllocationColor(order.allocationStatus)}`}>
                      {order.allocationStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3"><PriorityBadge priority={order.priority} /></td>
                  <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleViewOrder(order)}
                      className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                      title="View / Process Order"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
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
            {mockOrders
              .filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled')
              .flatMap(o => o.items)
              .reduce((acc, item) => {
                const existing = acc.find(i => i.sku === item.sku);
                if (existing) {
                  existing.totalRequired += item.requiredQty;
                  existing.totalAllocated += item.allocatedQty;
                } else {
                  acc.push({
                    sku: item.sku,
                    productName: item.productName,
                    totalRequired: item.requiredQty,
                    totalAllocated: item.allocatedQty,
                    unit: item.unit,
                  });
                }
                return acc;
              }, [] as { sku: string; productName: string; totalRequired: number; totalAllocated: number; unit: string; }[])
              .slice(0, 5)
              .map((item, idx) => (
                <div key={idx} className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                  <div>
                    <p className="text-sm text-slate-200">{item.productName}</p>
                    <p className="text-xs text-slate-400">{item.sku}</p>
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
            <p className="text-xs text-slate-500 mt-2">Showing top 5 reserved SKUs</p>
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
              <button onClick={handleClosePanel} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
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
                          <p className="text-xs text-slate-400">SKU: {item.sku}</p>
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
              <div className="flex flex-wrap gap-2">
                {selectedOrder.status === 'Assigned' && (
                  <button
                    onClick={() => handleStartPreparation(selectedOrder.id)}
                    className="flex-1 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Package className="w-4 h-4" />
                    Start Preparation
                  </button>
                )}
                {selectedOrder.status === 'Preparing' && (
                  <button
                    onClick={() => handleMarkReady(selectedOrder.id)}
                    className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Mark Ready for Shipment
                  </button>
                )}
                <button
                  onClick={() => handleGeneratePickList(selectedOrder.id)}
                  className="flex-1 px-4 py-2 border border-slate-700 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
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