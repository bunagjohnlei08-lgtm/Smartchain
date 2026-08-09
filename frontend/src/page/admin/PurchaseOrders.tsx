// src/page/admin/PurchaseOrders.tsx
import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  ChevronRight,
  Download,
  Printer,
  RefreshCw,
  Save,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Trash2,
  Eye,
  MoreVertical,
  X,
  FileText,
  Send,
  Clock,
  CheckCircle,
  AlertCircle,
  Truck,
  Package,
  DollarSign,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Building,
  Edit,
  Link,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

type POStatus = 'Draft' | 'Pending' | 'Approved' | 'Sent to Supplier' | 'In Transit' | 'Completed' | 'Cancelled';
type PaymentStatus = 'Unpaid' | 'Partial' | 'Paid';

interface PurchaseOrderItem {
  sku: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplier: string;
  supplierContact: string;
  supplierPhone: string;
  supplierEmail: string;
  supplierAddress: string;
  expectedDelivery: string;
  items: PurchaseOrderItem[];
  totalAmount: number;
  paymentStatus: PaymentStatus;
  status: POStatus;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  preparedBy?: string;
  deliveryTerms: string;
  paymentTerms: string;
  destinationWarehouse: string;
  subtotal: number;
  vat: number;
  shippingFee: number;
  grandTotal: number;
  remarks?: string;
}

// ============================================
// MOCK DATA
// ============================================

const mockItems: PurchaseOrderItem[] = [
  { sku: 'RAW-ALU-006', description: 'Aluminium Profile 6m', quantity: 100, unit: 'bar', unitPrice: 500, amount: 50000 },
  { sku: 'PKG-BOX-004', description: 'Corrugated Box (60x40x40)', quantity: 200, unit: 'pcs', unitPrice: 30, amount: 6000 },
  { sku: 'RAW-STEEL-010', description: 'Steel Rod 10mm', quantity: 150, unit: 'pcs', unitPrice: 350, amount: 52500 },
  { sku: 'PKG-TAPE-002', description: 'Packaging Tape', quantity: 100, unit: 'roll', unitPrice: 25, amount: 2500 },
];

const mockPurchaseOrders: PurchaseOrder[] = [
  {
    id: '1',
    poNumber: 'PO-2026-0025',
    supplier: 'Northgate Trading Co.',
    supplierContact: 'Maria Santos',
    supplierPhone: '+63 912 345 6789',
    supplierEmail: 'purchasing@northgate.ph',
    supplierAddress: '123 Trade St., Quezon City',
    expectedDelivery: 'May 28, 2026',
    items: mockItems.slice(0, 2),
    totalAmount: 184500,
    paymentStatus: 'Unpaid',
    status: 'Approved',
    createdBy: 'A. Reyes',
    createdAt: '2026-05-20',
    approvedBy: 'B. Cruz',
    preparedBy: 'A. Reyes',
    deliveryTerms: 'FOB Destination',
    paymentTerms: '30 Days',
    destinationWarehouse: 'Central Depot',
    subtotal: 111000,
    vat: 13320,
    shippingFee: 0,
    grandTotal: 124320,
    remarks: 'Approved for production',
  },
  {
    id: '2',
    poNumber: 'PO-2026-0024',
    supplier: 'General El Organics',
    supplierContact: 'Luis Gomez',
    supplierPhone: '+63 917 555 1234',
    supplierEmail: 'orders@generalel.ph',
    supplierAddress: '456 Green Ave., Bulacan',
    expectedDelivery: 'May 30, 2026',
    items: mockItems.slice(1, 3),
    totalAmount: 62400,
    paymentStatus: 'Pending',
    status: 'Pending',
    createdBy: 'J. Santos',
    createdAt: '2026-05-21',
    deliveryTerms: 'CIF',
    paymentTerms: '15 Days',
    destinationWarehouse: 'Northgate',
    subtotal: 52000,
    vat: 6240,
    shippingFee: 4160,
    grandTotal: 62400,
  },
  {
    id: '3',
    poNumber: 'PO-2026-0023',
    supplier: 'Metro Textile Mills',
    supplierContact: 'Rosa Ramirez',
    supplierPhone: '+63 918 222 3344',
    supplierEmail: 'procurement@metrotex.ph',
    supplierAddress: '789 Industrial Ave., Pasig City',
    expectedDelivery: 'May 27, 2026',
    items: mockItems.slice(2, 4),
    totalAmount: 426000,
    paymentStatus: 'Paid',
    status: 'Completed',
    createdBy: 'A. Reyes',
    createdAt: '2026-05-19',
    approvedBy: 'B. Cruz',
    preparedBy: 'A. Reyes',
    deliveryTerms: 'DDP',
    paymentTerms: '60 Days',
    destinationWarehouse: 'Southpark',
    subtotal: 355000,
    vat: 42600,
    shippingFee: 28400,
    grandTotal: 426000,
  },
  {
    id: '4',
    poNumber: 'PO-2026-0022',
    supplier: 'Pack House Supply',
    supplierContact: 'Jose Garcia',
    supplierPhone: '+63 919 888 1122',
    supplierEmail: 'sales@packhouse.ph',
    supplierAddress: '101 Packaging St., Laguna',
    expectedDelivery: 'May 25, 2026',
    items: mockItems.slice(0, 3),
    totalAmount: 96000,
    paymentStatus: 'Partial',
    status: 'Approved',
    createdBy: 'L. Cruz',
    createdAt: '2026-05-18',
    approvedBy: 'B. Cruz',
    preparedBy: 'L. Cruz',
    deliveryTerms: 'FOB Shipping',
    paymentTerms: '30 Days',
    destinationWarehouse: 'Central Depot',
    subtotal: 80000,
    vat: 9600,
    shippingFee: 6400,
    grandTotal: 96000,
  },
  {
    id: '5',
    poNumber: 'PO-2026-0021',
    supplier: 'Cebu Logistics Co.',
    supplierContact: 'Anna Lim',
    supplierPhone: '+63 916 777 8899',
    supplierEmail: 'operations@cebologistics.ph',
    supplierAddress: '456 Cebu Business Park, Cebu City',
    expectedDelivery: 'May 29, 2026',
    items: mockItems.slice(1, 4),
    totalAmount: 75600,
    paymentStatus: 'Unpaid',
    status: 'In Transit',
    createdBy: 'A. Reyes',
    createdAt: '2026-05-17',
    approvedBy: 'B. Cruz',
    preparedBy: 'A. Reyes',
    deliveryTerms: 'CIF',
    paymentTerms: '45 Days',
    destinationWarehouse: 'Northgate',
    subtotal: 63000,
    vat: 7560,
    shippingFee: 5040,
    grandTotal: 75600,
  },
  {
    id: '6',
    poNumber: 'PO-2026-0020',
    supplier: 'Kraft Industrial',
    supplierContact: 'Mark Tan',
    supplierPhone: '+63 920 333 4455',
    supplierEmail: 'sales@kraftind.ph',
    supplierAddress: '789 Industrial Zone, Batangas',
    expectedDelivery: 'May 31, 2026',
    items: mockItems.slice(0, 4),
    totalAmount: 158750,
    paymentStatus: 'Paid',
    status: 'In Transit',
    createdBy: 'J. Santos',
    createdAt: '2026-05-16',
    approvedBy: 'B. Cruz',
    preparedBy: 'J. Santos',
    deliveryTerms: 'DAP',
    paymentTerms: '60 Days',
    destinationWarehouse: 'Southpark',
    subtotal: 132300,
    vat: 15876,
    shippingFee: 10584,
    grandTotal: 158760,
  },
];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: POStatus }> = ({ status }) => {
  const config: Record<POStatus, { color: string; bg: string; border: string }> = {
    Draft: { color: 'text-gray-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
    Pending: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
    Approved: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    'Sent to Supplier': { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    'In Transit': { color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
    Completed: { color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20' },
    Cancelled: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  };
  const normalizedStatus = status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : 'Draft';
  const { color, bg, border } = config[normalizedStatus] || config[status] || config['Draft'];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${color} ${bg} ${border}`}>
      {status}
    </span>
  );
};

const PaymentBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { label: string; color: string; bg: string; border: string }> = {
    Unpaid: { label: 'Unpaid', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    Partial: { label: 'Partial', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
    Paid: { label: 'Paid', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  };
  const normalizedStatus = status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : 'Unpaid';
  const badgeConfig = config[normalizedStatus] || config[status] || {
    label: status || 'Unknown',
    color: 'text-slate-400',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20'
  };
  const { label, color, bg, border } = badgeConfig;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${color} ${bg} ${border}`}>
      {label}
    </span>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const PurchaseOrders: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<POStatus | 'All'>('All');
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | 'All'>('All');
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return mockPurchaseOrders.filter((order) => {
      const matchSearch =
        order.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.items.some((item) => item.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchStatus = statusFilter === 'All' || order.status === statusFilter;
      const matchPayment = paymentFilter === 'All' || order.paymentStatus === paymentFilter;
      return matchSearch && matchStatus && matchPayment;
    });
  }, [searchQuery, statusFilter, paymentFilter]);

  // KPI counts
  const kpiCounts = {
    Pending: mockPurchaseOrders.filter((o) => o.status === 'Pending').length,
    Approved: mockPurchaseOrders.filter((o) => o.status === 'Approved').length,
    'In Transit': mockPurchaseOrders.filter((o) => o.status === 'In Transit').length,
    Completed: mockPurchaseOrders.filter((o) => o.status === 'Completed').length,
    Cancelled: mockPurchaseOrders.filter((o) => o.status === 'Cancelled').length,
  };

  const handleViewDetails = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setShowDetailsDrawer(true);
  };

  const handleCloseDrawer = () => {
    setShowDetailsDrawer(false);
    setSelectedOrder(null);
  };

  const handleAction = (action: string, order: PurchaseOrder) => {
    alert(`${action} triggered for ${order.poNumber}`);
  };

  return (
    <div className="w-full min-h-screen bg-[#0a0e17] text-slate-100 p-4 md:p-6 space-y-6 overflow-x-hidden">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span>Admin</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-100">Purchase Orders</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Purchase Order Management</h1>
          <p className="text-sm text-gray-400">
            Manage purchase orders, track deliveries, and monitor supplier payments.
          </p>
        </div>

      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-yellow-400">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Pending</span>
          </div>
          <p className="text-2xl font-bold text-white mt-1">{kpiCounts.Pending}</p>
          <p className="text-xs text-gray-400">Awaiting approval</p>
        </div>
        <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Approved</span>
          </div>
          <p className="text-2xl font-bold text-white mt-1">{kpiCounts.Approved}</p>
          <p className="text-xs text-gray-400">Ready for supplier</p>
        </div>
        <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-indigo-400">
            <Truck className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">In Transit</span>
          </div>
          <p className="text-2xl font-bold text-white mt-1">{kpiCounts['In Transit']}</p>
          <p className="text-xs text-gray-400">With supplier/on the way</p>
        </div>
        <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-teal-400">
            <Package className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Completed</span>
          </div>
          <p className="text-2xl font-bold text-white mt-1">{kpiCounts.Completed}</p>
          <p className="text-xs text-gray-400">Fully received</p>
        </div>
        <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-red-400">
            <X className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Cancelled</span>
          </div>
          <p className="text-2xl font-bold text-white mt-1">{kpiCounts.Cancelled}</p>
          <p className="text-xs text-gray-400">Cancelled orders</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search PO number, supplier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1e293b] border border-[#1f2937] rounded-xl pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as POStatus | 'All')}
          className="bg-[#1e293b] border border-[#1f2937] rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
        >
          <option value="All">All Status</option>
          <option value="Draft">Draft</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Sent to Supplier">Sent to Supplier</option>
          <option value="In Transit">In Transit</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value as PaymentStatus | 'All')}
          className="bg-[#1e293b] border border-[#1f2937] rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
        >
          <option value="All">All Payment</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Partial">Partial</option>
          <option value="Paid">Paid</option>
        </select>
        <div className="flex items-center gap-2 bg-[#1e293b] border border-[#1f2937] rounded-xl px-3 py-2 text-sm text-slate-300">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span>Date Range</span>
          <ChevronRightIcon className="w-4 h-4 text-gray-400" />
        </div>
        <button className="p-2 rounded-xl border border-[#1f2937] text-gray-400 hover:bg-slate-800/50 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
        <button className="p-2 rounded-xl border border-[#1f2937] text-gray-400 hover:bg-slate-800/50 transition-colors">
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>New PO</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead className="bg-[#1e293b]/50 border-b border-[#1f2937]">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">PO Number</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400 w-auto min-w-[200px]">Supplier</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Items</th>
                <th className="px-5 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Amount</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Expected Delivery</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-36">Status</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id} className="border-b border-[#1f2937] hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3.5 text-sm font-medium text-white">{order.poNumber}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-300 w-auto min-w-[200px]">{order.supplier}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-300">{order.items.length}</td>
                  <td className="px-5 py-3.5 text-right text-sm text-white">₱{order.totalAmount.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-300">{order.expectedDelivery}</td>
                  <td className="px-5 py-3.5"><PaymentBadge status={order.paymentStatus} /></td>
                  <td className="px-4 py-3 whitespace-nowrap w-36"><StatusBadge status={order.status} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-center w-28">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleViewDetails(order)}
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-gray-400 hover:text-white transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleAction('Download', order)}
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-gray-400 hover:text-white transition-colors"
                        title="Download PO"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleAction('Print', order)}
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-gray-400 hover:text-white transition-colors"
                        title="Print PO"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleAction('More', order)}
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-gray-400 hover:text-white transition-colors"
                        title="More options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-gray-400">
                    No purchase orders found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#1f2937] bg-[#0f172a]/30">
          <div className="text-sm text-gray-400">
            Showing <span className="text-white font-medium">1</span> to{' '}
            <span className="text-white font-medium">{filteredOrders.length}</span> of{' '}
            <span className="text-white font-medium">{mockPurchaseOrders.length}</span> entries
          </div>
          <div className="flex items-center gap-1">
            <button className="p-1.5 rounded-xl border border-[#1f2937] text-gray-400 hover:text-white hover:bg-[#1f2937] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="px-3 py-1 rounded-xl text-sm font-medium bg-cyan-500 text-slate-950">1</button>
            <button className="p-1.5 rounded-xl border border-[#1f2937] text-gray-400 hover:text-white hover:bg-[#1f2937] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* DETAILS DRAWER */}
      {/* ============================================ */}
      {showDetailsDrawer && selectedOrder && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="bg-black/60 backdrop-blur-sm w-full" onClick={handleCloseDrawer}></div>
          <div className="bg-[#0f172a] border-l border-[#1f2937] w-full sm:w-[600px] h-full overflow-y-auto p-6 animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-3">
                  {selectedOrder.poNumber}
                  <StatusBadge status={selectedOrder.status} />
                </h2>
                <p className="text-sm text-gray-400">Supplier: {selectedOrder.supplier}</p>
              </div>
              <button onClick={handleCloseDrawer} className="p-1.5 rounded-lg hover:bg-slate-700 text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* PO Info Grid */}
            <div className="grid grid-cols-2 gap-4 text-sm mb-6 p-4 bg-[#1e293b]/30 rounded-xl border border-[#1f2937]">
              <div><span className="text-gray-400">Expected Delivery</span><p className="text-white">{selectedOrder.expectedDelivery}</p></div>
              <div><span className="text-gray-400">Payment Terms</span><p className="text-white">{selectedOrder.paymentTerms}</p></div>
              <div><span className="text-gray-400">Delivery Terms</span><p className="text-white">{selectedOrder.deliveryTerms}</p></div>
              <div><span className="text-gray-400">Warehouse</span><p className="text-white">{selectedOrder.destinationWarehouse}</p></div>
              <div><span className="text-gray-400">Prepared By</span><p className="text-white">{selectedOrder.preparedBy}</p></div>
              <div><span className="text-gray-400">Approved By</span><p className="text-white">{selectedOrder.approvedBy || '—'}</p></div>
            </div>

            {/* Supplier Info */}
            <div className="bg-[#1e293b]/30 rounded-xl p-4 border border-[#1f2937] mb-6">
              <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                <Building className="w-4 h-4 text-cyan-400" /> Supplier Information
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-400">Contact</span><p className="text-white">{selectedOrder.supplierContact}</p></div>
                <div><span className="text-gray-400">Phone</span><p className="text-white">{selectedOrder.supplierPhone}</p></div>
                <div className="col-span-2"><span className="text-gray-400">Email</span><p className="text-white">{selectedOrder.supplierEmail}</p></div>
                <div className="col-span-2"><span className="text-gray-400">Address</span><p className="text-white">{selectedOrder.supplierAddress}</p></div>
              </div>
            </div>

            {/* Items Table */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-white mb-2">Items</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-[#1f2937]">
                    <tr className="text-gray-400 text-xs uppercase">
                      <th className="px-3 py-2 text-left">SKU</th>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-left">Unit</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items.map((item, idx) => (
                      <tr key={idx} className="border-b border-[#1f2937]">
                        <td className="px-3 py-2 text-gray-300 font-mono">{item.sku}</td>
                        <td className="px-3 py-2 text-gray-300">{item.description}</td>
                        <td className="px-3 py-2 text-right text-white">{item.quantity}</td>
                        <td className="px-3 py-2 text-gray-300">{item.unit}</td>
                        <td className="px-3 py-2 text-right text-white">₱{item.unitPrice.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-white">₱{item.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-[#1f2937] font-medium">
                    <tr><td colSpan={5} className="px-3 py-2 text-right text-gray-400">Subtotal</td><td className="px-3 py-2 text-right text-white">₱{selectedOrder.subtotal.toLocaleString()}</td></tr>
                    <tr><td colSpan={5} className="px-3 py-2 text-right text-gray-400">VAT (12%)</td><td className="px-3 py-2 text-right text-white">₱{selectedOrder.vat.toLocaleString()}</td></tr>
                    <tr><td colSpan={5} className="px-3 py-2 text-right text-gray-400">Shipping Fee</td><td className="px-3 py-2 text-right text-white">₱{selectedOrder.shippingFee.toLocaleString()}</td></tr>
                    <tr className="text-lg"><td colSpan={5} className="px-3 py-2 text-right text-white font-bold">Grand Total</td><td className="px-3 py-2 text-right text-cyan-400 font-bold">₱{selectedOrder.grandTotal.toLocaleString()}</td></tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 border-t border-[#1f2937] pt-4">
              <button className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                <Printer className="w-4 h-4" /> Print PO
              </button>
              <button className="flex-1 py-2 border border-[#1f2937] hover:bg-slate-800/50 text-gray-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                <Download className="w-4 h-4" /> Download PO (PDF)
              </button>
              <button className="flex-1 py-2 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                <Send className="w-4 h-4" /> Send PO to Supplier
              </button>
              <button className="flex-1 py-2 border border-[#1f2937] hover:bg-slate-800/50 text-gray-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                <Clock className="w-4 h-4" /> View History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* CREATE PO MODAL */}
      {/* ============================================ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-[#1f2937] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Create New Purchase Order</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Supplier *</label>
                  <input type="text" placeholder="Search or select supplier" className="w-full bg-[#1e293b] border border-[#1f2937] rounded-xl px-4 py-2 text-sm text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Expected Delivery *</label>
                  <input type="date" className="w-full bg-[#1e293b] border border-[#1f2937] rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/40" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Payment Terms</label>
                  <select className="w-full bg-[#1e293b] border border-[#1f2937] rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                    <option>30 Days</option>
                    <option>45 Days</option>
                    <option>60 Days</option>
                    <option>Immediate</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Warehouse</label>
                  <select className="w-full bg-[#1e293b] border border-[#1f2937] rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                    <option>Central Depot</option>
                    <option>Northgate</option>
                    <option>Southpark</option>
                  </select>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-2">Items</h3>
                <button className="text-cyan-400 text-sm hover:text-cyan-300 transition-colors flex items-center gap-1 mb-2">
                  <Plus className="w-4 h-4" /> Add Item
                </button>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-[#1f2937] text-gray-400 text-xs uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">SKU</th>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-left">Unit</th>
                        <th className="px-3 py-2 text-right">Unit Price</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-[#1f2937]">
                        <td className="px-3 py-2"><input type="text" placeholder="SKU" className="w-full bg-[#1e293b] border border-[#1f2937] rounded-lg px-2 py-1 text-sm text-slate-100" /></td>
                        <td className="px-3 py-2"><input type="text" placeholder="Description" className="w-full bg-[#1e293b] border border-[#1f2937] rounded-lg px-2 py-1 text-sm text-slate-100" /></td>
                        <td className="px-3 py-2"><input type="number" min="1" className="w-full bg-[#1e293b] border border-[#1f2937] rounded-lg px-2 py-1 text-sm text-slate-100 text-right" /></td>
                        <td className="px-3 py-2"><input type="text" placeholder="Unit" className="w-full bg-[#1e293b] border border-[#1f2937] rounded-lg px-2 py-1 text-sm text-slate-100" /></td>
                        <td className="px-3 py-2"><input type="number" step="0.01" className="w-full bg-[#1e293b] border border-[#1f2937] rounded-lg px-2 py-1 text-sm text-slate-100 text-right" /></td>
                        <td className="px-3 py-2 text-right text-white">—</td>
                        <td className="px-3 py-2 text-center"><button className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-[#1f2937]">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 border border-[#1f2937] rounded-xl text-sm font-medium text-gray-300 hover:bg-slate-800/50 transition-colors">Cancel</button>
              <button className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
                <Save className="w-4 h-4" /> Create PO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrders;