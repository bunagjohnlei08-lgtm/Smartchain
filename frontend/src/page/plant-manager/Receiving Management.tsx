// src/page/plant-manager/ReceivingManagement.tsx
import React, { useState, useMemo } from 'react';
import {
  Package,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  MoreHorizontal,
  Search,
  Plus,
  FileText,
  Clock,
  Download,
  Printer,
  Check,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  FileImage,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

type ReceivingStatus =
  | 'Pending QA'
  | 'Passed'
  | 'Rejected'
  | 'Partial'
  | 'Ready for Stock In'
  | 'Completed';

interface ReceivingItem {
  id: string;
  receivingNo: string;
  poNumber: string;
  supplier: string;
  expectedDate: string;
  items: number;
  preparedBy: string;
  status: ReceivingStatus;
  referenceNo?: string;
  deliveryDate?: string;
  createdAt?: string;
  products?: ProductItem[];
  inspectionResult?: InspectionResult;
  notes?: Notes;
  attachments?: Attachment[];
  timeline?: TimelineItem[];
}

interface ProductItem {
  product: string;
  sku: string;
  orderedQty: number;
  deliveredQty: number;
  acceptedQty: number;
  rejectedQty: number;
  unit: string;
  barcode: string;
  inspectionStatus: 'Passed' | 'Rejected' | 'Partial' | 'Pending';
}

interface InspectionResult {
  inspector: string;
  inspectionDate: string;
  result: 'Passed' | 'Partial' | 'Rejected';
  remarks: string;
  overallDecision: 'Passed' | 'Partial' | 'Rejected';
}

interface Notes {
  plantManager?: string;
  qa?: string;
  admin?: string;
}

interface Attachment {
  name: string;
  type: string;
  size: string;
  url: string;
}

interface TimelineItem {
  status: string;
  date: string;
  time: string;
  performedBy: string;
}

// ============================================
// MOCK DATA
// ============================================

const mockReceivings: ReceivingItem[] = [
  {
    id: '1',
    receivingNo: 'RCV-00015',
    poNumber: 'PO-2026-001',
    supplier: 'ABC Industrial',
    expectedDate: 'Aug 10, 2026',
    items: 15,
    preparedBy: 'Plant Manager',
    status: 'Pending QA',
    referenceNo: 'DEL-98765',
    deliveryDate: 'Aug 10, 2026',
    createdAt: 'Aug 10, 2026 09:30 AM',
    products: [
      {
        product: 'Stainless Steel Pipe 2in',
        sku: 'PIP-SS-2IN',
        orderedQty: 30,
        deliveredQty: 30,
        acceptedQty: 30,
        rejectedQty: 0,
        unit: 'pcs',
        barcode: '1000001001',
        inspectionStatus: 'Pending',
      },
      {
        product: 'Industrial Valve DN50',
        sku: 'VAL-DN50',
        orderedQty: 10,
        deliveredQty: 10,
        acceptedQty: 10,
        rejectedQty: 0,
        unit: 'pcs',
        barcode: '1000001002',
        inspectionStatus: 'Pending',
      },
    ],
    timeline: [
      {
        status: 'Receiving Created',
        date: 'Aug 10, 2026',
        time: '09:30 AM',
        performedBy: 'Plant Manager',
      },
      {
        status: 'Pending QA Inspection',
        date: 'Aug 10, 2026',
        time: '09:31 AM',
        performedBy: 'System',
      },
    ],
  },
  {
    id: '2',
    receivingNo: 'RCV-00016',
    poNumber: 'PO-2026-002',
    supplier: 'Metro Supplies',
    expectedDate: 'Aug 11, 2026',
    items: 8,
    preparedBy: 'Plant Manager',
    status: 'Passed',
    referenceNo: 'DEL-98766',
    deliveryDate: 'Aug 11, 2026',
    createdAt: 'Aug 11, 2026 09:30 AM',
    products: [
      {
        product: 'Stainless Steel Pipe 2in',
        sku: 'PIP-SS-2IN',
        orderedQty: 30,
        deliveredQty: 30,
        acceptedQty: 30,
        rejectedQty: 0,
        unit: 'pcs',
        barcode: '1000001001',
        inspectionStatus: 'Passed',
      },
      {
        product: 'Industrial Valve DN50',
        sku: 'VAL-DN50',
        orderedQty: 10,
        deliveredQty: 10,
        acceptedQty: 10,
        rejectedQty: 0,
        unit: 'pcs',
        barcode: '1000001002',
        inspectionStatus: 'Passed',
      },
    ],
    timeline: [
      {
        status: 'Receiving Created',
        date: 'Aug 11, 2026',
        time: '09:30 AM',
        performedBy: 'Plant Manager',
      },
      {
        status: 'Pending QA Inspection',
        date: 'Aug 11, 2026',
        time: '09:31 AM',
        performedBy: 'System',
      },
      {
        status: 'QA Inspection Completed',
        date: 'Aug 11, 2026',
        time: '10:15 AM',
        performedBy: 'QA Inspector',
      },
      {
        status: 'Ready for Stock In',
        date: 'Aug 11, 2026',
        time: '10:16 AM',
        performedBy: 'System',
      },
    ],
    inspectionResult: {
      inspector: 'QA Inspector',
      inspectionDate: 'Aug 11, 2026 10:15 AM',
      result: 'Passed',
      remarks: 'All items passed quality check.',
      overallDecision: 'Passed',
    },
    notes: {
      plantManager: 'Received all items in good condition.',
      qa: 'Quality check passed.',
    },
    attachments: [
      {
        name: 'Delivery Receipt.pdf',
        type: 'pdf',
        size: '1.2 MB',
        url: '#',
      },
      {
        name: 'Purchase Order.pdf',
        type: 'pdf',
        size: '0.8 MB',
        url: '#',
      },
    ],
  },
  {
    id: '3',
    receivingNo: 'RCV-00017',
    poNumber: 'PO-2026-003',
    supplier: 'Northwind Trading',
    expectedDate: 'Aug 12, 2026',
    items: 20,
    preparedBy: 'Plant Manager',
    status: 'Rejected',
    referenceNo: 'DEL-98767',
    deliveryDate: 'Aug 12, 2026',
    createdAt: 'Aug 12, 2026 09:30 AM',
  },
  {
    id: '4',
    receivingNo: 'RCV-00018',
    poNumber: 'PO-2026-004',
    supplier: 'Prime Components',
    expectedDate: 'Aug 13, 2026',
    items: 6,
    preparedBy: 'Plant Manager',
    status: 'Partial',
    referenceNo: 'DEL-98768',
    deliveryDate: 'Aug 13, 2026',
    createdAt: 'Aug 13, 2026 09:30 AM',
  },
  {
    id: '5',
    receivingNo: 'RCV-00019',
    poNumber: 'PO-2026-005',
    supplier: 'ABC Industrial',
    expectedDate: 'Aug 14, 2026',
    items: 10,
    preparedBy: 'Plant Manager',
    status: 'Pending QA',
    referenceNo: 'DEL-98769',
    deliveryDate: 'Aug 14, 2026',
    createdAt: 'Aug 14, 2026 09:30 AM',
  },
];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: ReceivingStatus }> = ({ status }) => {
  const config: Record<
    ReceivingStatus,
    { color: string; bg: string; dotColor: string }
  > = {
    'Pending QA': {
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
      dotColor: 'bg-amber-400',
    },
    Passed: {
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      dotColor: 'bg-emerald-400',
    },
    Rejected: {
      color: 'text-red-400',
      bg: 'bg-red-500/10 border-red-500/20',
      dotColor: 'bg-red-400',
    },
    Partial: {
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      dotColor: 'bg-blue-400',
    },
    'Ready for Stock In': {
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10 border-cyan-500/20',
      dotColor: 'bg-cyan-400',
    },
    Completed: {
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      dotColor: 'bg-emerald-400',
    },
  };
  const matchedConfig = config[status] || {
    color: 'text-gray-400',
    bg: 'bg-gray-500/10 border-gray-500/20',
    dotColor: 'bg-gray-400',
  };
  const { color, bg, dotColor } = matchedConfig;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color} ${bg}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {status}
    </span>
  );
};

const KPICard: React.FC<{
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  color?: string;
}> = ({ label, value, icon, subtitle, color = 'text-blue-400' }) => {
  return (
    <div className="bg-[#111827] border border-[#1f2937] rounded-2xl p-5 hover:border-[#3b82f6]/30 transition-all duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">
            {label}
          </p>
          <p className="text-2xl font-bold text-white mt-1.5">{value}</p>
          {subtitle && <p className="text-slate-500 text-xs mt-1">{subtitle}</p>}
        </div>
        <div className={`p-2.5 bg-[#0b1220] rounded-lg ${color}`}>{icon}</div>
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const ReceivingManagement: React.FC = () => {
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('All Suppliers');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [dateFilter, setDateFilter] = useState('All Dates');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const [selectedReceivingId, setSelectedReceivingId] = useState<string | null>(
    mockReceivings[0]?.id || null
  );
  const [activeTab, setActiveTab] = useState<
    'products' | 'inspection' | 'notes' | 'attachments'
  >('products');

  const selectedReceiving = useMemo(() => {
    return mockReceivings.find((r) => r.id === selectedReceivingId) || null;
  }, [selectedReceivingId]);

  // Filter data
  const filteredReceivings = useMemo(() => {
    return mockReceivings.filter((r) => {
      const matchSearch =
        r.receivingNo.toLowerCase().includes(search.toLowerCase()) ||
        r.poNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.supplier.toLowerCase().includes(search.toLowerCase());
      const matchSupplier =
        supplierFilter === 'All Suppliers' || r.supplier === supplierFilter;
      const matchStatus =
        statusFilter === 'All Status' || r.status === statusFilter;
      return matchSearch && matchSupplier && matchStatus;
    });
  }, [search, supplierFilter, statusFilter]);

  // Pagination
  const totalItems = filteredReceivings.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, totalItems);
  const paginatedReceivings = filteredReceivings.slice(start - 1, end);

  // KPI data
  const totalDeliveries = mockReceivings.length;
  const pendingQA = mockReceivings.filter((r) => r.status === 'Pending QA').length;
  const passed = mockReceivings.filter((r) => r.status === 'Passed').length;
  const rejected = mockReceivings.filter((r) => r.status === 'Rejected').length;
  const partial = mockReceivings.filter((r) => r.status === 'Partial').length;

  // Handle row click
  const handleRowClick = (id: string) => {
    setSelectedReceivingId(id);
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6 bg-[#0b1220] text-slate-100 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Receiving Management</h1>
          <p className="text-slate-400 text-sm">
            Manage all incoming deliveries from suppliers.
          </p>
        </div>
        <button className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> Create Receiving
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard
          label="Total Deliveries"
          value={totalDeliveries}
          icon={<Package className="w-5 h-5" />}
          subtitle="All Receiving Records"
          color="text-blue-400"
        />
        <KPICard
          label="Pending QA"
          value={pendingQA}
          icon={<Clock className="w-5 h-5" />}
          subtitle="Awaiting Inspection"
          color="text-amber-400"
        />
        <KPICard
          label="Passed"
          value={passed}
          icon={<CheckCircle className="w-5 h-5" />}
          subtitle="Approved by QA"
          color="text-emerald-400"
        />
        <KPICard
          label="Rejected"
          value={rejected}
          icon={<XCircle className="w-5 h-5" />}
          subtitle="Rejected by QA"
          color="text-red-400"
        />
        <KPICard
          label="Partial"
          value={partial}
          icon={<AlertCircle className="w-5 h-5" />}
          subtitle="Partial Acceptance"
          color="text-blue-400"
        />
      </div>

      {/* Search & Filters */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search Receiving No., PO Number, Supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0b1220] border border-[#1f2937] rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          />
        </div>
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="bg-[#0b1220] border border-[#1f2937] rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer min-w-[130px]"
        >
          <option>All Suppliers</option>
          <option>ABC Industrial</option>
          <option>Metro Supplies</option>
          <option>Northwind Trading</option>
          <option>Prime Components</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[#0b1220] border border-[#1f2937] rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer min-w-[130px]"
        >
          <option>All Status</option>
          <option>Pending QA</option>
          <option>Passed</option>
          <option>Rejected</option>
          <option>Partial</option>
          <option>Ready for Stock In</option>
          <option>Completed</option>
        </select>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="bg-[#0b1220] border border-[#1f2937] rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer min-w-[130px]"
        >
          <option>All Dates</option>
          <option>Today</option>
          <option>This Week</option>
          <option>This Month</option>
        </select>
      </div>

      {/* Full-width Table */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-[#0b1220]/50 border-b border-[#1f2937]">
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Receiving No.
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  PO Number
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Supplier
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Expected Date
                </th>
                <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400">
                  Items
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Prepared By
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Status
                </th>
                <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedReceivings.map((record) => (
                <tr
                  key={record.id}
                  onClick={() => handleRowClick(record.id)}
                  className={`border-b border-[#1f2937] hover:bg-slate-800/30 transition-all cursor-pointer ${
                    selectedReceivingId === record.id
                      ? 'bg-slate-800/30'
                      : ''
                  }`}
                >
                  <td className="px-4 py-3.5 text-sm font-medium text-white">
                    {record.receivingNo}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">
                    {record.poNumber}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">
                    {record.supplier}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">
                    {record.expectedDate}
                  </td>
                  <td className="px-4 py-3.5 text-center text-sm text-slate-300">
                    {record.items}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">
                    {record.preparedBy}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={record.status} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleRowClick(record.id)}
                        className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-all">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedReceivings.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No receiving records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#1f2937] bg-[#0b1220]/30">
          <div className="text-sm text-slate-400">
            Showing {totalItems > 0 ? start : 0} to {end} of {totalItems} records
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-xl border border-[#1f2937] text-slate-400 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={`px-3 py-1 rounded-xl text-sm font-medium transition-all ${
                  currentPage === p
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() =>
                setCurrentPage(Math.min(totalPages, currentPage + 1))
              }
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-xl border border-[#1f2937] text-slate-400 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Section: Details & Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel: Receiving Details (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {selectedReceiving ? (
            <div className="bg-[#111827] border border-[#1f2937] rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="p-5 border-b border-[#1f2937] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-white">
                    Receiving Details
                  </h3>
                  <StatusBadge status={selectedReceiving.status} />
                </div>
                <div className="flex items-center gap-2">
                  {selectedReceiving.status === 'Passed' && (
                    <button className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5">
                      <Check className="w-4 h-4" /> Perform Stock In
                    </button>
                  )}
                  <button className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all">
                    <Download className="w-4 h-4" />
                  </button>
                  <button className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all">
                    <Printer className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Details Grid */}
              <div className="p-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-400">Receiving No.</p>
                  <p className="text-white font-medium">{selectedReceiving.receivingNo}</p>
                </div>
                <div>
                  <p className="text-slate-400">Purchase Order</p>
                  <p className="text-white font-medium">{selectedReceiving.poNumber}</p>
                </div>
                <div>
                  <p className="text-slate-400">Supplier</p>
                  <p className="text-white font-medium">{selectedReceiving.supplier}</p>
                </div>
                <div>
                  <p className="text-slate-400">Reference No.</p>
                  <p className="text-white font-medium">{selectedReceiving.referenceNo || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-400">Delivery Date</p>
                  <p className="text-white font-medium">{selectedReceiving.deliveryDate || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-400">Prepared By</p>
                  <p className="text-white font-medium">{selectedReceiving.preparedBy}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-slate-400">Created At</p>
                  <p className="text-white font-medium">{selectedReceiving.createdAt || '-'}</p>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-[#1f2937]">
                <div className="flex px-5">
                  {['products', 'inspection', 'notes', 'attachments'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab as typeof activeTab)}
                      className={`py-3 px-4 text-sm font-medium transition-all border-b-2 ${
                        activeTab === tab
                          ? 'border-cyan-500 text-white'
                          : 'border-transparent text-slate-400 hover:text-white'
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="p-5">
                {activeTab === 'products' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-[#1f2937]">
                        <tr className="text-left text-slate-400">
                          <th className="px-2 py-2 font-medium">Product</th>
                          <th className="px-2 py-2 font-medium">SKU</th>
                          <th className="px-2 py-2 font-medium text-center">
                            Delivered Qty
                          </th>
                          <th className="px-2 py-2 font-medium">Unit</th>
                          <th className="px-2 py-2 font-medium">Barcode</th>
                          <th className="px-2 py-2 font-medium">Inspection Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedReceiving.products?.map((p, idx) => (
                          <tr key={idx} className="border-b border-[#1f2937] hover:bg-slate-800/30">
                            <td className="px-2 py-2 text-white">{p.product}</td>
                            <td className="px-2 py-2 text-slate-300">{p.sku}</td>
                            <td className="px-2 py-2 text-center text-white">
                              {p.deliveredQty}
                            </td>
                            <td className="px-2 py-2 text-slate-300">{p.unit}</td>
                            <td className="px-2 py-2 font-mono text-slate-300">
                              {p.barcode}
                            </td>
                            <td className="px-2 py-2">
                              <StatusBadge
                                status={
                                  p.inspectionStatus === 'Pending'
                                    ? 'Pending QA'
                                    : (p.inspectionStatus as ReceivingStatus)
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {selectedReceiving.products && selectedReceiving.products.length > 5 && (
                      <button className="text-sm text-cyan-400 hover:text-cyan-300 mt-3">
                        View all {selectedReceiving.products.length} items
                      </button>
                    )}
                  </div>
                )}

                {activeTab === 'inspection' && (
                  <div className="space-y-4">
                    {selectedReceiving.inspectionResult ? (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-slate-400">QA Inspector</p>
                          <p className="text-white">{selectedReceiving.inspectionResult.inspector}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Inspection Date</p>
                          <p className="text-white">
                            {selectedReceiving.inspectionResult.inspectionDate}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400">Inspection Result</p>
                          <StatusBadge
                            status={
                              selectedReceiving.inspectionResult
                                .result as unknown as ReceivingStatus
                            }
                          />
                        </div>
                        <div>
                          <p className="text-slate-400">Overall Decision</p>
                          <StatusBadge
                            status={
                              selectedReceiving.inspectionResult
                                .overallDecision as unknown as ReceivingStatus
                            }
                          />
                        </div>
                        <div className="col-span-2">
                          <p className="text-slate-400">Remarks</p>
                          <p className="text-white">
                            {selectedReceiving.inspectionResult.remarks}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-400">No inspection performed yet.</p>
                    )}
                  </div>
                )}

                {activeTab === 'notes' && (
                  <div className="space-y-3 text-sm">
                    {selectedReceiving.notes?.plantManager && (
                      <div>
                        <p className="text-slate-400">Plant Manager Notes</p>
                        <p className="text-white bg-slate-800/30 p-3 rounded-lg border border-[#1f2937]">
                          {selectedReceiving.notes.plantManager}
                        </p>
                      </div>
                    )}
                    {selectedReceiving.notes?.qa && (
                      <div>
                        <p className="text-slate-400">QA Notes</p>
                        <p className="text-white bg-slate-800/30 p-3 rounded-lg border border-[#1f2937]">
                          {selectedReceiving.notes.qa}
                        </p>
                      </div>
                    )}
                    {selectedReceiving.notes?.admin && (
                      <div>
                        <p className="text-slate-400">Admin Notes</p>
                        <p className="text-white bg-slate-800/30 p-3 rounded-lg border border-[#1f2937]">
                          {selectedReceiving.notes.admin}
                        </p>
                      </div>
                    )}
                    {!selectedReceiving.notes?.plantManager &&
                      !selectedReceiving.notes?.qa &&
                      !selectedReceiving.notes?.admin && (
                        <p className="text-slate-400">No notes available.</p>
                      )}
                  </div>
                )}

                {activeTab === 'attachments' && (
                  <div className="space-y-3">
                    {selectedReceiving.attachments && selectedReceiving.attachments.length > 0 ? (
                      selectedReceiving.attachments.map((att, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-[#1f2937]"
                        >
                          <div className="flex items-center gap-3">
                            {att.type === 'pdf' ? (
                              <FileText className="w-5 h-5 text-red-400" />
                            ) : att.type === 'image' ? (
                              <FileImage className="w-5 h-5 text-blue-400" />
                            ) : (
                              <Paperclip className="w-5 h-5 text-slate-400" />
                            )}
                            <div>
                              <p className="text-white text-sm">{att.name}</p>
                              <p className="text-slate-400 text-xs">{att.size}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-all">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-all">
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400">No attachments.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[#111827] border border-[#1f2937] rounded-2xl p-6 text-center text-slate-400">
              Select a receiving record to view details.
            </div>
          )}
        </div>

        {/* Right Panel: Timeline (1/3 width) */}
        <div className="lg:col-span-1">
          <div className="bg-[#111827] border border-[#1f2937] rounded-2xl p-5 sticky top-6">
            <h3 className="text-lg font-semibold text-white mb-4">Timeline</h3>
            {selectedReceiving?.timeline && selectedReceiving.timeline.length > 0 ? (
              <div className="space-y-4 relative">
                {selectedReceiving.timeline.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 relative">
                    {idx < selectedReceiving.timeline!.length - 1 && (
                      <div className="absolute left-2.5 top-5 bottom-0 w-0.5 bg-slate-700" />
                    )}
                    <div className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-cyan-500" />
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="text-white font-medium">{item.status}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>{item.date}</span>
                        <span>•</span>
                        <span>{item.time}</span>
                        <span>•</span>
                        <span>by {item.performedBy}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400">No timeline events.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReceivingManagement;