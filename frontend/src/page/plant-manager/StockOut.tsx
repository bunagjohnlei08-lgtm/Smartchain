// src/page/plant-manager/StockOut.tsx
import React, { useState } from 'react';
import {
  ChevronRight,
  Search,
  Package,
  Clock,
  X,
  QrCode,
  ClipboardList,
  PackageMinus,
  Eye,
  Filter,
  Printer,
  FileText,
  ChevronRight as ChevronRightIcon,
  Plus,
  AlertCircle,
  CheckCircle,
  Truck,
  Calendar,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ============================================
// TYPES
// ============================================

type ReleaseStatus = 'Ready for Picking' | 'Picking' | 'Ready for Shipment' | 'Waiting Logistics' | 'Released';
type Priority = 'High' | 'Medium' | 'Low';

interface ReleaseOrder {
  id: string;
  orderNo: string;
  customer: string;
  destination: string;
  warehouse: string;
  location: string;
  orderDate: string;
  requiredDelivery: string;
  totalProducts: number;
  totalUnits: number;
  orderValue: number;
  priority: Priority;
  status: ReleaseStatus;
  assignedPicker: string | null;
  qaStatus: 'QA Cleared' | 'QA Pending' | 'QA Failed';
  items: ReleaseItem[];
}

interface ReleaseItem {
  id: string;
  barcode: string;
  sku: string;
  product: string;
  orderedQty: number;
  pickedQty: number;
  unit: string;
  batchLot: string | null;
  expiryDate: string | null;
  location: string;
  status: 'Pending' | 'Picked' | 'Short';
}

// ============================================
// MOCK DATA
// ============================================

const mockOrders: ReleaseOrder[] = [
  {
    id: '1',
    orderNo: 'ORD-2025-1041',
    customer: 'ABC Construction Inc.',
    destination: '1234 Industrial Rd., Cebu City, Cebu 6000',
    warehouse: 'Warehouse A',
    location: 'Aisle 3, Bay 12',
    orderDate: '2025-05-20',
    requiredDelivery: '2025-05-25',
    totalProducts: 15,
    totalUnits: 200,
    orderValue: 120000,
    priority: 'High',
    status: 'Ready for Picking',
    assignedPicker: 'Juan Dela Cruz',
    qaStatus: 'QA Cleared',
    items: [
      { id: 'i1', barcode: '8801234500011', sku: 'LED-PNL-400W', product: 'Industrial LED Panel 400W', orderedQty: 30, pickedQty: 28, unit: 'pcs', batchLot: 'BCH-2405-001', expiryDate: null, location: 'A-04-12', status: 'Picked' },
      { id: 'i2', barcode: '8801234500028', sku: 'CBX-60X40', product: 'Corrugated Box 60x40x40', orderedQty: 50, pickedQty: 50, unit: 'pcs', batchLot: 'BCH-2405-002', expiryDate: null, location: 'B-02-07', status: 'Picked' },
      { id: 'i3', barcode: '8801234500035', sku: 'SS-SHEET-2MM', product: 'Stainless Steel Sheet 2mm', orderedQty: 20, pickedQty: 20, unit: 'sheets', batchLot: 'SS-2404-098', expiryDate: null, location: 'C-06-01', status: 'Picked' },
      { id: 'i4', barcode: '8801234500042', sku: 'IDR-18V', product: 'Cordless Impact Driver', orderedQty: 100, pickedQty: 77, unit: 'pcs', batchLot: 'TL-2405-010', expiryDate: null, location: 'D-08-03', status: 'Short' },
    ],
  },
  {
    id: '2',
    orderNo: 'ORD-2025-1040',
    customer: 'BuildWell Solutions',
    destination: '567 Construction Ave., Mandaluyong City, 1550',
    warehouse: 'Warehouse B',
    location: 'Aisle 5, Bay 8',
    orderDate: '2025-05-19',
    requiredDelivery: '2025-05-24',
    totalProducts: 8,
    totalUnits: 120,
    orderValue: 65650,
    priority: 'Medium',
    status: 'Picking',
    assignedPicker: 'Maria Santos',
    qaStatus: 'QA Pending',
    items: [
      { id: 'i5', barcode: '8801234500059', sku: 'SH-CLASS-E', product: 'Safety Helmet Class E', orderedQty: 60, pickedQty: 60, unit: 'pcs', batchLot: 'SH-2405-005', expiryDate: null, location: 'C-01-09', status: 'Picked' },
      { id: 'i6', barcode: '8801234500066', sku: 'LBL-4X6', product: 'Thermal Label Roll 4x6', orderedQty: 60, pickedQty: 30, unit: 'rolls', batchLot: 'LB-2405-032', expiryDate: null, location: 'A-02-14', status: 'Short' },
    ],
  },
  {
    id: '3',
    orderNo: 'ORD-2025-1038',
    customer: 'Mega Builders',
    destination: '890 Mega Ave., Pasig City, 1600',
    warehouse: 'Warehouse C',
    location: 'Aisle 2, Bay 5',
    orderDate: '2025-05-18',
    requiredDelivery: '2025-05-23',
    totalProducts: 10,
    totalUnits: 90,
    orderValue: 65400,
    priority: 'High',
    status: 'Ready for Shipment',
    assignedPicker: 'Pedro Gonzales',
    qaStatus: 'QA Cleared',
    items: [
      { id: 'i7', barcode: '8801234500073', sku: 'CBL-3C-16', product: '3-Core Cable 16mm²', orderedQty: 30, pickedQty: 30, unit: 'm', batchLot: null, expiryDate: null, location: 'E-03-11', status: 'Picked' },
      { id: 'i8', barcode: '8801234500080', sku: 'SWT-16A', product: '16A Wall Switch', orderedQty: 60, pickedQty: 60, unit: 'pcs', batchLot: null, expiryDate: null, location: 'F-07-02', status: 'Picked' },
    ],
  },
  {
    id: '4',
    orderNo: 'ORD-2025-1035',
    customer: 'Steel Works Ph',
    destination: '456 Industrial Ave., Bulacan, 3000',
    warehouse: 'Warehouse A',
    location: 'Aisle 1, Bay 3',
    orderDate: '2025-05-16',
    requiredDelivery: '2025-05-22',
    totalProducts: 5,
    totalUnits: 45,
    orderValue: 28750,
    priority: 'Low',
    status: 'Waiting Logistics',
    assignedPicker: 'Rosa Ramirez',
    qaStatus: 'QA Cleared',
    items: [
      { id: 'i9', barcode: '8801234500097', sku: 'AB-2X2', product: 'Angle Bar 2"x2"', orderedQty: 45, pickedQty: 45, unit: 'pcs', batchLot: null, expiryDate: null, location: 'B-05-06', status: 'Picked' },
    ],
  },
  {
    id: '5',
    orderNo: 'ORD-2025-1032',
    customer: 'Prime Structures',
    destination: '789 Prime Road, Taguig City, 1630',
    warehouse: 'Warehouse B',
    location: 'Aisle 6, Bay 2',
    orderDate: '2025-05-15',
    requiredDelivery: '2025-05-21',
    totalProducts: 3,
    totalUnits: 30,
    orderValue: 18900,
    priority: 'Low',
    status: 'Released',
    assignedPicker: 'Luis Reyes',
    qaStatus: 'QA Cleared',
    items: [
      { id: 'i10', barcode: '8801234500103', sku: 'DV-SET-01', product: 'Decorative Vases Set', orderedQty: 30, pickedQty: 30, unit: 'sets', batchLot: null, expiryDate: null, location: 'D-09-04', status: 'Picked' },
    ],
  },
];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: ReleaseStatus }> = ({ status }) => {
  const config = {
    'Ready for Picking': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'Picking': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    'Ready for Shipment': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    'Waiting Logistics': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'Released': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap border ${config[status]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0"></span>
      {status}
    </span>
  );
};

const PriorityBadge: React.FC<{ priority: Priority }> = ({ priority }) => {
  const config = {
    High: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    Medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    Low: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${config[priority]}`}>
      {priority}
    </span>
  );
};

const QaStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: { [key: string]: string } = {
    'QA Cleared': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    'QA Pending': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    'QA Failed': 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${config[status] || config['QA Pending']}`}>
      {status}
    </span>
  );
};

const ItemStatusBadge: React.FC<{ status: 'Pending' | 'Picked' | 'Short' }> = ({ status }) => {
  const config = {
    Pending: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    Picked: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    Short: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config[status]}`}>
      {status}
    </span>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const StockOut: React.FC = () => {
  // State
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<ReleaseOrder | null>(mockOrders[0]);
  const [activeTab, setActiveTab] = useState<'items' | 'info' | 'checklist' | 'attachments' | 'history'>('items');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('All');
  const [dateRange, setDateRange] = useState('May 1, 2025 - May 31, 2025');
  const [qaStatus, setQaStatus] = useState<'QA Cleared' | 'QA Pending' | 'QA Failed'>('QA Cleared'); // simulate

  // Filtered orders
  const filteredOrders = mockOrders.filter(order => {
    const matchSearch = order.orderNo.toLowerCase().includes(search.toLowerCase()) ||
                        order.customer.toLowerCase().includes(search.toLowerCase()) ||
                        order.items.some(i => i.sku.toLowerCase().includes(search.toLowerCase()) ||
                                                i.barcode.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = statusFilter === 'All' || order.status === statusFilter;
    const matchPriority = priorityFilter === 'All' || order.priority === priorityFilter;
    const matchWarehouse = warehouseFilter === 'All' || order.warehouse === warehouseFilter;
    return matchSearch && matchStatus && matchPriority && matchWarehouse;
  });

  // KPI calculations
  const ordersReady = mockOrders.filter(o => o.status === 'Ready for Picking').length;
  const pickingToday = mockOrders.filter(o => o.status === 'Picking').length;
  const readyForShipment = mockOrders.filter(o => o.status === 'Ready for Shipment').length;
  const waitingLogistics = mockOrders.filter(o => o.status === 'Waiting Logistics').length;
  const releasedToday = mockOrders.filter(o => o.status === 'Released').length;
  const totalItemsReleased = mockOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.pickedQty, 0), 0);
  const totalValueReleased = mockOrders.reduce((sum, o) => sum + o.orderValue, 0);

  const kpis = [
    { label: 'Orders Ready', value: ordersReady, color: 'text-blue-400 bg-blue-500/10 border border-blue-500/20', icon: <Package className="w-5 h-5" /> },
    { label: 'Picking Today', value: pickingToday, color: 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20', icon: <ClipboardList className="w-5 h-5" /> },
    { label: 'Ready for Shipment', value: readyForShipment, color: 'text-purple-400 bg-purple-500/10 border border-purple-500/20', icon: <Truck className="w-5 h-5" /> },
    { label: 'Waiting Logistics', value: waitingLogistics, color: 'text-amber-400 bg-amber-500/10 border border-amber-500/20', icon: <Clock className="w-5 h-5" /> },
    { label: 'Released Today', value: releasedToday, color: 'text-cyan-400 bg-cyan-500/10 border border-cyan-500/20', icon: <CheckCircle className="w-5 h-5" /> },
    { label: 'Items Released', value: totalItemsReleased, color: 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20', icon: <PackageMinus className="w-5 h-5" /> },
    { label: 'Value Released', value: `₱${totalValueReleased.toLocaleString()}`, color: 'text-teal-400 bg-teal-500/10 border border-teal-500/20', icon: <FileText className="w-5 h-5" /> },
  ];

  // Determine if "Release Inventory" is enabled
  const canRelease = selectedOrder?.qaStatus === 'QA Cleared' && 
                      selectedOrder?.items.every(i => i.status === 'Picked') &&
                      selectedOrder?.status !== 'Released';

  // Pie data for summary
  const selectedOrderPieData = selectedOrder ? [
    { name: 'Picked', value: selectedOrder.items.reduce((sum, i) => sum + i.pickedQty, 0), color: '#10b981' },
    { name: 'Remaining', value: selectedOrder.items.reduce((sum, i) => sum + (i.orderedQty - i.pickedQty), 0), color: '#f59e0b' },
  ] : [];

  // Handler for action buttons
  const handleAction = (action: string) => {
    alert(`${action} triggered for ${selectedOrder?.orderNo}`);
  };

  return (
    <div className="w-full min-h-screen bg-[#070a12] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 overflow-x-hidden">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span>Plant Manager</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-100">Stock Out</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Stock Out</h1>
          <p className="text-slate-400 text-sm mt-1">
            Outbound picking and release workflow.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-slate-700 hover:bg-slate-800/50 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            <QrCode className="w-4 h-4" />
            Scan Barcode
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-slate-700 hover:bg-slate-800/50 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            <FileText className="w-4 h-4" />
            Generate Packing Slip
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-slate-700 hover:bg-slate-800/50 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            <Printer className="w-4 h-4" />
            Print Shipping Label
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            New Release
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="p-4 rounded-xl border border-slate-800/60 bg-slate-900/40 flex flex-col justify-between h-28">
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">{kpi.label}</p>
              <div className={`p-2 rounded-lg flex items-center justify-center ${kpi.color}`}>
                {kpi.icon}
              </div>
            </div>
            <p className="text-2xl font-bold text-white mt-2">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* ============================================
          FULL-WIDTH TABLE SECTION
          ============================================ */}
      <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 space-y-4 w-full">
        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search order no., customer, SKU, barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#070a12] border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          >
            <option value="All">All Status</option>
            <option value="Ready for Picking">Ready for Picking</option>
            <option value="Picking">Picking</option>
            <option value="Ready for Shipment">Ready for Shipment</option>
            <option value="Waiting Logistics">Waiting Logistics</option>
            <option value="Released">Released</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          >
            <option value="All">All Priority</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          >
            <option value="All">All Warehouses</option>
            <option value="Warehouse A">Warehouse A</option>
            <option value="Warehouse B">Warehouse B</option>
            <option value="Warehouse C">Warehouse C</option>
          </select>
          <div className="flex items-center gap-2 bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span>{dateRange}</span>
            <ChevronRightIcon className="w-4 h-4 text-slate-500" />
          </div>
          <button className="p-2 rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-800/50 transition-colors">
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setSearch('');
              setStatusFilter('All');
              setPriorityFilter('All');
              setWarehouseFilter('All');
              setDateRange('May 1, 2025 - May 31, 2025');
            }}
            className="px-4 py-2 rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-800/50 transition-colors text-sm"
          >
            Reset
          </button>
        </div>

        {/* Table */}
        <div className="w-full overflow-x-auto rounded-lg">
          <table className="w-full text-left border-collapse table-auto text-sm">
            <thead className="bg-[#070a12] border-b border-slate-800/80">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Order No.</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Customer / Destination</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Warehouse / Location</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Order Date</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Required Delivery</th>
                <th className="px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-400">Products / Units</th>
                <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Order Value</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Priority</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                <th className="text-center px-3 py-3 w-16 text-xs font-medium uppercase tracking-wider text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-800/20 transition-colors cursor-pointer" onClick={() => setSelectedOrder(order)}>
                  <td className="px-3 py-3 font-mono text-blue-400 hover:underline font-medium">{order.orderNo}</td>
                  <td className="px-3 py-3">
                    <p className="text-slate-200">{order.customer}</p>
                    <p className="text-xs text-slate-500 truncate max-w-[140px]">{order.destination}</p>
                  </td>
                  <td className="px-3 py-3 text-slate-300">
                    <p>{order.warehouse}</p>
                    <p className="text-xs text-slate-500">{order.location}</p>
                  </td>
                  <td className="px-3 py-3 text-slate-300">{order.orderDate}</td>
                  <td className="px-3 py-3 text-slate-300">{order.requiredDelivery}</td>
                  <td className="px-3 py-3 text-center text-slate-300">{order.totalProducts} / {order.totalUnits}</td>
                  <td className="px-3 py-3 text-right text-white">₱{order.orderValue.toLocaleString()}</td>
                  <td className="px-3 py-3"><PriorityBadge priority={order.priority} /></td>
                  <td className="px-3 py-3"><StatusBadge status={order.status} /></td>
                  <td className="text-center px-3 py-3 w-16">
                    <button className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors" onClick={(e) => { e.stopPropagation(); handleAction('View Details'); }}>
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">No orders found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================
          BOTTOM DASHBOARD SECTION
          ============================================ */}
      {selectedOrder && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* LEFT COLUMN (2 spans): Details & Pending Releases */}
          <div className="lg:col-span-2 space-y-6">
            {/* Card A: Release / Shipment Details */}
            <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-semibold text-white">{selectedOrder.orderNo}</h3>
                  <StatusBadge status={selectedOrder.status} />
                  <span className="text-sm text-slate-400">{selectedOrder.totalProducts} products · {selectedOrder.totalUnits} units</span>
                </div>
                <span className="text-sm font-medium text-white">₱{selectedOrder.orderValue.toLocaleString()}</span>
              </div>

              {/* Customer Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-400">Customer</span> <p className="text-white">{selectedOrder.customer}</p></div>
                <div><span className="text-slate-400">Destination</span> <p className="text-white">{selectedOrder.destination}</p></div>
                <div><span className="text-slate-400">Delivery Date</span> <p className="text-white">{selectedOrder.requiredDelivery}</p></div>
                <div><span className="text-slate-400">Warehouse</span> <p className="text-white">{selectedOrder.warehouse} · {selectedOrder.location}</p></div>
                <div><span className="text-slate-400">Prepared By</span> <p className="text-white">{selectedOrder.assignedPicker || 'Unassigned'}</p></div>
                <div><span className="text-slate-400">QA Status</span> <QaStatusBadge status={selectedOrder.qaStatus} /></div>
              </div>

              {/* Tabs */}
              <div className="flex gap-4 border-b border-slate-800">
                {['items', 'info', 'checklist', 'attachments', 'history'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`pb-2 text-sm font-medium capitalize transition-colors border-b-2 ${
                      activeTab === tab
                        ? 'border-cyan-500 text-white'
                        : 'border-transparent text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div>
                {activeTab === 'items' && (
                  <div className="space-y-4">
                    {/* Progress */}
                    <div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">Picking Progress</span>
                        <span className="text-white font-medium">
                          {selectedOrder.items.reduce((sum, i) => sum + i.pickedQty, 0)} / {selectedOrder.items.reduce((sum, i) => sum + i.orderedQty, 0)} units picked
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-700 rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${(selectedOrder.items.reduce((sum, i) => sum + i.pickedQty, 0) / selectedOrder.items.reduce((sum, i) => sum + i.orderedQty, 0)) * 100}%` }}
                        />
                      </div>
                    </div>
                    {/* Items table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-[#070a12] border-b border-slate-800">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-slate-400">Barcode</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-400">SKU</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-400">Product</th>
                            <th className="px-3 py-2 text-center font-medium text-slate-400">Ordered Qty</th>
                            <th className="px-3 py-2 text-center font-medium text-slate-400">Picked Qty</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-400">Unit</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-400">Batch/Lot</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-400">Expiry</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-400">Location</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-400">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedOrder.items.map((item) => (
                            <tr key={item.id} className="border-b border-slate-800/60 hover:bg-slate-800/20">
                              <td className="px-3 py-2 font-mono text-slate-300">{item.barcode}</td>
                              <td className="px-3 py-2 font-mono text-slate-300">{item.sku}</td>
                              <td className="px-3 py-2 text-slate-200">{item.product}</td>
                              <td className="px-3 py-2 text-center text-white">{item.orderedQty}</td>
                              <td className="px-3 py-2 text-center text-white">{item.pickedQty}</td>
                              <td className="px-3 py-2 text-slate-300">{item.unit}</td>
                              <td className="px-3 py-2 text-slate-300">{item.batchLot || '—'}</td>
                              <td className="px-3 py-2 text-slate-300">{item.expiryDate || '—'}</td>
                              <td className="px-3 py-2 text-slate-300">{item.location}</td>
                              <td className="px-3 py-2"><ItemStatusBadge status={item.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {activeTab === 'checklist' && (
                  <div className="space-y-2 py-2">
                    {['All items picked', 'Quantities verified', 'Barcode scanned', 'Packaging complete', 'Shipment label printed', 'Ready for logistics pickup'].map((task, idx) => (
                      <label key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/30 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-700 bg-[#090d16] text-cyan-500 focus:ring-cyan-500" />
                        <span className="text-sm text-slate-300">{task}</span>
                      </label>
                    ))}
                  </div>
                )}
                {activeTab === 'info' && (
                  <div className="grid grid-cols-2 gap-3 text-sm py-2">
                    <div><span className="text-slate-400">Order Date</span> <p className="text-white">{selectedOrder.orderDate}</p></div>
                    <div><span className="text-slate-400">Required Delivery</span> <p className="text-white">{selectedOrder.requiredDelivery}</p></div>
                    <div><span className="text-slate-400">Warehouse</span> <p className="text-white">{selectedOrder.warehouse}</p></div>
                    <div><span className="text-slate-400">Location</span> <p className="text-white">{selectedOrder.location}</p></div>
                    <div><span className="text-slate-400">Assigned Picker</span> <p className="text-white">{selectedOrder.assignedPicker || 'Unassigned'}</p></div>
                    <div><span className="text-slate-400">Shipping Method</span> <p className="text-white">Standard</p></div>
                    <div className="col-span-2"><span className="text-slate-400">Notes</span> <p className="text-white">—</p></div>
                  </div>
                )}
                {activeTab === 'attachments' && <p className="text-slate-400 text-sm py-2">No attachments available.</p>}
                {activeTab === 'history' && <p className="text-slate-400 text-sm py-2">History timeline will appear here.</p>}
              </div>
            </div>

            {/* Card B: Pending Releases Grid */}
            <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                Pending Releases
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {mockOrders.filter(o => o.status !== 'Released' && o.id !== selectedOrder.id).slice(0, 4).map((order) => (
                  <div key={order.id} className="p-3 rounded-xl border border-slate-800/60 hover:border-slate-600 transition-all cursor-pointer" onClick={() => setSelectedOrder(order)}>
                    <div className="flex items-start justify-between">
                      <span className="text-sm font-semibold text-white">{order.orderNo}</span>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-sm text-slate-300 mt-1 truncate">{order.customer}</p>
                    <p className="text-xs text-slate-400">{order.totalProducts} items · {order.totalUnits} units</p>
                    <div className="flex gap-2 mt-2">
                      <button className="flex-1 py-1 text-xs font-medium text-cyan-400 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/10 transition-colors" onClick={(e) => { e.stopPropagation(); handleAction('Prepare Shipment'); }}>Prepare Shipment</button>
                      <button className="flex-1 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/10 transition-colors" onClick={(e) => { e.stopPropagation(); handleAction('Continue Picking'); }}>Continue Picking</button>
                      <button className="flex-1 py-1 text-xs font-medium text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors" onClick={(e) => { e.stopPropagation(); handleAction('Release Inventory'); }}>Release</button>
                    </div>
                  </div>
                ))}
              </div>
              <button className="mt-3 text-xs text-cyan-400 hover:text-cyan-300 transition-colors">View All Pending Releases →</button>
            </div>
          </div>

          {/* RIGHT COLUMN (1 span): Summary, Timeline, Actions */}
          <div className="lg:col-span-1 space-y-4">
            {/* Card A: Release Summary & QA */}
            <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-cyan-400" />
                Release Summary
              </h3>
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={selectedOrderPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={25}
                      outerRadius={40}
                      dataKey="value"
                    >
                      {selectedOrderPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-around text-xs">
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Picked {selectedOrderPieData[0]?.value || 0}</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> Remaining {selectedOrderPieData[1]?.value || 0}</div>
              </div>

              <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">QA / Inspection Status</span>
                  <QaStatusBadge status={selectedOrder.qaStatus} />
                </div>
                <p className="text-xs text-slate-400 mt-1">Inspector: Rosa Ramirez · May 21, 2025</p>
                <p className="text-xs text-slate-400">Remarks: All items passed quality inspection.</p>
              </div>
            </div>

            {/* Card B: Release Timeline */}
            <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                Release Timeline
              </h3>
              <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                {[
                  { label: 'Order Approved', time: 'May 20, 2025 08:00' },
                  { label: 'Picking Started', time: 'May 20, 2025 09:30' },
                  { label: 'Picking Completed', time: 'In Progress' },
                  { label: 'Ready for Shipment', time: 'Pending' },
                  { label: 'Stock Out Released', time: 'Pending' },
                ].map((step, idx) => {
                  const isActive = idx < 2;
                  return (
                    <div key={idx} className="flex items-start gap-3">
                      <div className="relative flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full border-2 ${isActive ? 'bg-cyan-500 border-cyan-500' : 'bg-slate-700 border-slate-600'}`} />
                        {idx < 4 && <div className={`w-0.5 h-6 ${isActive ? 'bg-cyan-500' : 'bg-slate-700'}`} />}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${isActive ? 'text-white' : 'text-slate-500'}`}>{step.label}</p>
                        <p className="text-xs text-slate-400">{step.time}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Card C: Quick Actions */}
            <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-white">Quick Actions</h3>
              <button className="w-full py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-2">
                <FileText className="w-4 h-4" /> Generate Packing Slip
              </button>
              <button className="w-full py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-2">
                <Printer className="w-4 h-4" /> Print Shipping Label
              </button>
              <button className="w-full py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-2">
                <Eye className="w-4 h-4" /> View Shipment
              </button>
              <button className="w-full py-2 text-sm font-medium border border-rose-700 rounded-lg text-rose-400 hover:bg-rose-700/20 transition-colors flex items-center justify-center gap-2">
                <X className="w-4 h-4" /> Cancel Release
              </button>
              <button
                disabled={!canRelease}
                className={`w-full py-2.5 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                  canRelease
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                    : 'bg-slate-700/50 text-slate-500 cursor-not-allowed opacity-50'
                }`}
                onClick={() => handleAction('Release Inventory')}
              >
                <PackageMinus className="w-4 h-4" />
                Release Inventory
                {!canRelease && <AlertCircle className="w-4 h-4 ml-1" />}
              </button>
              {!canRelease && (
                <p className="text-xs text-amber-400 text-center">QA must be "QA Cleared" and all items picked.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockOut;