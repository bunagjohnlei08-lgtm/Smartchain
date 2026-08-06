// src/page/qa/QualityInspection.tsx
import React, { useState, useMemo } from 'react';
import {
  Search,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Eye,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Package,
  FileText,
  User,
  Download,
  Save,
  ScanLine,
  Send,
  MessageSquare,
  Paperclip,
  Image as ImageIcon,
  Link,
  Plus,
  Minus,
  Edit,
  Trash2,
  ArrowRight,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

type InspectionStatus = 'Pending' | 'In Progress' | 'Passed' | 'Rejected' | 'Partial';

interface ReceivingProduct {
  id: string;
  product: string;
  sku: string;
  orderedQty: number;
  deliveredQty: number;
  acceptedQty: number;
  rejectedQty: number;
  unit: string;
  inspectionResult: InspectionStatus;
  remarks?: string;
}

interface ReceivingItem {
  id: string;
  receivingNo: string;
  poNumber: string;
  supplier: string;
  deliveryDate: string;
  items: number;
  preparedBy: string;
  inspectionStatus: InspectionStatus;
  referenceNo?: string;
  products: ReceivingProduct[];
  timeline: {
    status: string;
    date: string;
    time: string;
    performedBy: string;
  }[];
  totalOrdered: number;
  totalDelivered: number;
  totalAccepted: number;
  totalRejected: number;
}

// ============================================
// MOCK DATA
// ============================================

const mockReceivings: ReceivingItem[] = [
  {
    id: '1',
    receivingNo: 'RCV-00016',
    poNumber: 'PO-2026-00123',
    supplier: 'Metro Supplies',
    deliveryDate: 'Aug 11, 2026',
    items: 8,
    preparedBy: 'Plant Manager',
    inspectionStatus: 'Pending',
    referenceNo: 'DEL-98765',
    products: [
      {
        id: 'p1',
        product: 'Stainless Steel Pipe 2in',
        sku: 'PIP-SS-2IN',
        orderedQty: 30,
        deliveredQty: 30,
        acceptedQty: 30,
        rejectedQty: 0,
        unit: 'pcs',
        inspectionResult: 'Pending',
      },
      {
        id: 'p2',
        product: 'Industrial Valve DN50',
        sku: 'VAL-DN50',
        orderedQty: 10,
        deliveredQty: 10,
        acceptedQty: 10,
        rejectedQty: 0,
        unit: 'pcs',
        inspectionResult: 'Pending',
      },
      {
        id: 'p3',
        product: 'Steel Angle Bar 50x50',
        sku: 'STL-ANG-50',
        orderedQty: 12,
        deliveredQty: 12,
        acceptedQty: 12,
        rejectedQty: 0,
        unit: 'pcs',
        inspectionResult: 'Pending',
      },
      {
        id: 'p4',
        product: 'Galvanized Pipe 3/4"',
        sku: 'GAL-PIP-034',
        orderedQty: 8,
        deliveredQty: 8,
        acceptedQty: 8,
        rejectedQty: 0,
        unit: 'pcs',
        inspectionResult: 'Pending',
      },
      {
        id: 'p5',
        product: 'Hex Bolt M12',
        sku: 'BLT-HX-M12',
        orderedQty: 50,
        deliveredQty: 50,
        acceptedQty: 50,
        rejectedQty: 0,
        unit: 'pcs',
        inspectionResult: 'Pending',
      },
      {
        id: 'p6',
        product: 'Nylon Lock Nut M12',
        sku: 'NUT-NYL-M12',
        orderedQty: 50,
        deliveredQty: 48,
        acceptedQty: 48,
        rejectedQty: 0,
        unit: 'pcs',
        inspectionResult: 'Pending',
      },
      {
        id: 'p7',
        product: 'Rubber Gasket 2"',
        sku: 'GSK-RUB-2IN',
        orderedQty: 40,
        deliveredQty: 40,
        acceptedQty: 40,
        rejectedQty: 0,
        unit: 'pcs',
        inspectionResult: 'Pending',
      },
      {
        id: 'p8',
        product: 'PVC Pipe 4" x 3m',
        sku: 'PVC-PIP-4M',
        orderedQty: 50,
        deliveredQty: 50,
        acceptedQty: 50,
        rejectedQty: 0,
        unit: 'pcs',
        inspectionResult: 'Pending',
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
        status: 'Inspection Started',
        date: 'Aug 11, 2026',
        time: '10:00 AM',
        performedBy: 'QA Inspector',
      },
      {
        status: 'Inspection Completed',
        date: '',
        time: '',
        performedBy: '',
      },
      {
        status: 'Submitted to Plant Manager',
        date: '',
        time: '',
        performedBy: '',
      },
      {
        status: 'Ready for Stock In',
        date: '',
        time: '',
        performedBy: '',
      },
    ],
    totalOrdered: 250,
    totalDelivered: 248,
    totalAccepted: 248,
    totalRejected: 0,
  },
  {
    id: '2',
    receivingNo: 'RCV-00017',
    poNumber: 'PO-2026-00124',
    supplier: 'Northwind Trading',
    deliveryDate: 'Aug 12, 2026',
    items: 20,
    preparedBy: 'Plant Manager',
    inspectionStatus: 'Pending',
    referenceNo: 'DEL-98766',
    products: [],
    timeline: [],
    totalOrdered: 0,
    totalDelivered: 0,
    totalAccepted: 0,
    totalRejected: 0,
  },
  {
    id: '3',
    receivingNo: 'RCV-00018',
    poNumber: 'PO-2026-00125',
    supplier: 'Prime Components',
    deliveryDate: 'Aug 13, 2026',
    items: 6,
    preparedBy: 'Plant Manager',
    inspectionStatus: 'In Progress',
    referenceNo: 'DEL-98767',
    products: [],
    timeline: [],
    totalOrdered: 0,
    totalDelivered: 0,
    totalAccepted: 0,
    totalRejected: 0,
  },
  {
    id: '4',
    receivingNo: 'RCV-00019',
    poNumber: 'PO-2026-00126',
    supplier: 'ABC Industrial',
    deliveryDate: 'Aug 14, 2026',
    items: 10,
    preparedBy: 'Plant Manager',
    inspectionStatus: 'Pending',
    referenceNo: 'DEL-98768',
    products: [],
    timeline: [],
    totalOrdered: 0,
    totalDelivered: 0,
    totalAccepted: 0,
    totalRejected: 0,
  },
  {
    id: '5',
    receivingNo: 'RCV-00012',
    poNumber: 'PO-2026-00119',
    supplier: 'Global Materials',
    deliveryDate: 'Aug 08, 2026',
    items: 12,
    preparedBy: 'Plant Manager',
    inspectionStatus: 'Passed',
    referenceNo: 'DEL-98769',
    products: [],
    timeline: [],
    totalOrdered: 0,
    totalDelivered: 0,
    totalAccepted: 0,
    totalRejected: 0,
  },
  {
    id: '6',
    receivingNo: 'RCV-00011',
    poNumber: 'PO-2026-00118',
    supplier: 'Kraft Industrial',
    deliveryDate: 'Aug 07, 2026',
    items: 5,
    preparedBy: 'Plant Manager',
    inspectionStatus: 'Rejected',
    referenceNo: 'DEL-98770',
    products: [],
    timeline: [],
    totalOrdered: 0,
    totalDelivered: 0,
    totalAccepted: 0,
    totalRejected: 0,
  },
  {
    id: '7',
    receivingNo: 'RCV-00010',
    poNumber: 'PO-2026-00117',
    supplier: 'Cebu Supply Co.',
    deliveryDate: 'Aug 06, 2026',
    items: 9,
    preparedBy: 'Plant Manager',
    inspectionStatus: 'Partial',
    referenceNo: 'DEL-98771',
    products: [],
    timeline: [],
    totalOrdered: 0,
    totalDelivered: 0,
    totalAccepted: 0,
    totalRejected: 0,
  },
];

// ============================================
// CONSTANTS
// ============================================

const supplierOptions = [
  'All Suppliers',
  'Metro Supplies',
  'Northwind Trading',
  'Prime Components',
  'ABC Industrial',
  'Global Materials',
  'Kraft Industrial',
  'Cebu Supply Co.',
];
const statusOptions = ['All Status', 'Pending', 'In Progress', 'Passed', 'Rejected', 'Partial'];
const dateOptions = ['All Dates', 'Today', 'This Week', 'This Month'];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: InspectionStatus }> = ({ status }) => {
  const config: Record<
    InspectionStatus,
    { color: string; bg: string; dotColor: string }
  > = {
    Pending: {
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
      dotColor: 'bg-amber-400',
    },
    'In Progress': {
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      dotColor: 'bg-blue-400',
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
      color: 'text-purple-400',
      bg: 'bg-purple-500/10 border-purple-500/20',
      dotColor: 'bg-purple-400',
    },
  };
  const { color, bg, dotColor } = config[status];
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
  subtitle: string;
  color?: string;
}> = ({ label, value, icon, subtitle, color = 'text-blue-400' }) => {
  return (
    <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 hover:border-gray-700 transition-all duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">
            {label}
          </p>
          <p className="text-2xl font-bold text-white mt-1.5">{value}</p>
          <p className="text-slate-500 text-xs mt-1">{subtitle}</p>
        </div>
        <div className={`p-2.5 bg-[#090d16] rounded-lg ${color}`}>{icon}</div>
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const QualityInspection: React.FC = () => {
  // State for filters
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('All Suppliers');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [dateFilter, setDateFilter] = useState('All Dates');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;

  // Selected receiving for details panel
  const [selectedReceivingId, setSelectedReceivingId] = useState<string | null>(
    mockReceivings[0]?.id || null
  );
  const [activeTab, setActiveTab] = useState<
    'products' | 'summary' | 'notes' | 'attachments' | 'timeline'
  >('products');

  const selectedReceiving = useMemo(() => {
    return mockReceivings.find((r) => r.id === selectedReceivingId) || null;
  }, [selectedReceivingId]);

  // Filtered data
  const filteredData = useMemo(() => {
    return mockReceivings.filter((r) => {
      const matchSearch =
        r.receivingNo.toLowerCase().includes(search.toLowerCase()) ||
        r.poNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.supplier.toLowerCase().includes(search.toLowerCase());
      const matchSupplier =
        supplierFilter === 'All Suppliers' || r.supplier === supplierFilter;
      const matchStatus =
        statusFilter === 'All Status' || r.inspectionStatus === statusFilter;
      // Date filter would need real date logic; skip for mock
      return matchSearch && matchSupplier && matchStatus;
    });
  }, [search, supplierFilter, statusFilter]);

  // Pagination
  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const currentItems = filteredData.slice(startIndex, endIndex);

  // KPI counts
  const pending = mockReceivings.filter((r) => r.inspectionStatus === 'Pending').length;
  const inspectedToday = mockReceivings.filter(
    (r) => r.inspectionStatus === 'Passed' || r.inspectionStatus === 'Rejected' || r.inspectionStatus === 'Partial'
  ).length; // simplified
  const passed = mockReceivings.filter((r) => r.inspectionStatus === 'Passed').length;
  const rejected = mockReceivings.filter((r) => r.inspectionStatus === 'Rejected').length;
  const partial = mockReceivings.filter((r) => r.inspectionStatus === 'Partial').length;

  const handleRowClick = (id: string) => {
    setSelectedReceivingId(id);
  };

  // Helper to render action button based on status
  const renderActionButton = (status: InspectionStatus) => {
    if (status === 'Pending') {
      return (
        <button className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-medium transition-all">
          Start Inspection
        </button>
      );
    }
    if (status === 'In Progress') {
      return (
        <button className="px-3 py-1.5 bg-blue-500 hover:bg-blue-400 text-white rounded-lg text-xs font-medium transition-all">
          Continue
        </button>
      );
    }
    return (
      <button className="px-3 py-1.5 border border-gray-700 hover:bg-gray-800 text-slate-300 rounded-lg text-xs font-medium transition-all">
        View
      </button>
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Quality Inspection</h1>
          <p className="text-sm text-slate-400">
            Inspect incoming deliveries before warehouse stock-in.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          label="Pending Inspection"
          value={pending}
          subtitle="Awaiting QA Review"
          icon={<Clock className="w-5 h-5 text-amber-400" />}
          color="text-amber-400"
        />
        <KPICard
          label="Inspected Today"
          value={inspectedToday}
          subtitle="Completed Today"
          icon={<CheckCircle className="w-5 h-5 text-emerald-400" />}
          color="text-emerald-400"
        />
        <KPICard
          label="Passed Deliveries"
          value={passed}
          subtitle="Approved"
          icon={<CheckCircle className="w-5 h-5 text-emerald-400" />}
          color="text-emerald-400"
        />
        <KPICard
          label="Rejected Deliveries"
          value={rejected}
          subtitle="Rejected"
          icon={<XCircle className="w-5 h-5 text-red-400" />}
          color="text-red-400"
        />
        <KPICard
          label="Partial Acceptance"
          value={partial}
          subtitle="Needs Review"
          icon={<AlertCircle className="w-5 h-5 text-purple-400" />}
          color="text-purple-400"
        />
      </div>

      {/* Filter Toolbar */}
      <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search receiving no., PO no., supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#090d16] border border-gray-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          />
        </div>
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="bg-[#090d16] border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer min-w-[130px]"
        >
          {supplierOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[#090d16] border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer min-w-[130px]"
        >
          {statusOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="bg-[#090d16] border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer min-w-[130px]"
        >
          {dateOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <button className="px-3.5 py-2.5 border border-gray-700 rounded-xl text-slate-400 hover:text-white hover:bg-gray-800 transition-all flex items-center gap-1.5 text-sm">
          <Filter className="w-4 h-4" /> Filters
        </button>
      </div>

      {/* Inspection Queue Table */}
      <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-[#090d16]/50 border-b border-gray-800">
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
                  Delivery Date
                </th>
                <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400">
                  Items
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Prepared By
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Inspection Status
                </th>
                <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {currentItems.map((receiving) => (
                <tr
                  key={receiving.id}
                  onClick={() => handleRowClick(receiving.id)}
                  className={`border-b border-gray-800 hover:bg-gray-800/30 transition-all cursor-pointer ${
                    selectedReceivingId === receiving.id
                      ? 'bg-gray-800/30'
                      : ''
                  }`}
                >
                  <td className="px-4 py-3.5 text-sm font-medium text-white">
                    {receiving.receivingNo}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">
                    {receiving.poNumber}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">
                    {receiving.supplier}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">
                    {receiving.deliveryDate}
                  </td>
                  <td className="px-4 py-3.5 text-center text-sm text-slate-300">
                    {receiving.items} Items
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">
                    {receiving.preparedBy}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={receiving.inspectionStatus} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-2">
                      {renderActionButton(receiving.inspectionStatus)}
                      <button className="p-1.5 rounded hover:bg-gray-700 text-slate-400 hover:text-white transition-all">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {currentItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No inspection records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 bg-[#090d16]/30">
          <div className="text-sm text-slate-400">
            Showing {totalItems > 0 ? startIndex + 1 : 0} to {endIndex} of {totalItems} records
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-xl border border-gray-700 text-slate-400 hover:text-white hover:bg-gray-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let page = i + 1;
              if (totalPages > 5 && currentPage > 3) {
                page = currentPage - 3 + i + (currentPage > totalPages - 3 ? totalPages - 4 : 0);
              }
              if (page > totalPages) return null;
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded-xl text-sm font-medium transition-all ${
                    currentPage === page
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-xl border border-gray-700 text-slate-400 hover:text-white hover:bg-gray-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Section: Details & Timeline */}
      {selectedReceiving && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Inspection Details */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="p-5 border-b border-gray-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-white">Inspection Details</h3>
                  <StatusBadge status={selectedReceiving.inspectionStatus} />
                </div>
                <div className="flex items-center gap-2">
                  <button className="px-3 py-1.5 border border-gray-700 hover:bg-gray-800 text-slate-300 rounded-lg text-sm font-medium transition-all">
                    <Save className="w-4 h-4 inline mr-1.5" /> Save Draft
                  </button>
                  <button className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5">
                    <Send className="w-4 h-4" /> Submit Inspection
                  </button>
                  <button className="p-2 rounded-lg hover:bg-gray-800 text-slate-400 hover:text-white transition-all">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Meta Info */}
              <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-slate-400">Receiving No.</p>
                  <p className="text-white font-medium">{selectedReceiving.receivingNo}</p>
                </div>
                <div>
                  <p className="text-slate-400">PO Number</p>
                  <p className="text-white font-medium">{selectedReceiving.poNumber}</p>
                </div>
                <div>
                  <p className="text-slate-400">Supplier</p>
                  <p className="text-white font-medium">{selectedReceiving.supplier}</p>
                </div>
                <div>
                  <p className="text-slate-400">Delivery Date</p>
                  <p className="text-white font-medium">{selectedReceiving.deliveryDate}</p>
                </div>
                <div>
                  <p className="text-slate-400">Reference No.</p>
                  <p className="text-white font-medium">{selectedReceiving.referenceNo || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-400">Prepared By</p>
                  <p className="text-white font-medium">{selectedReceiving.preparedBy}</p>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-800">
                <div className="flex px-5 overflow-x-auto">
                  {['products', 'summary', 'notes', 'attachments', 'timeline'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab as typeof activeTab)}
                      className={`py-3 px-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
                        activeTab === tab
                          ? 'border-cyan-500 text-white'
                          : 'border-transparent text-slate-400 hover:text-white'
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      {tab === 'products' && ` (${selectedReceiving.products?.length || 0})`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="p-5">
                {activeTab === 'products' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-800">
                        <tr className="text-left text-slate-400">
                          <th className="px-2 py-2 font-medium">Product</th>
                          <th className="px-2 py-2 font-medium">SKU</th>
                          <th className="px-2 py-2 font-medium text-center">Ordered Qty</th>
                          <th className="px-2 py-2 font-medium text-center">Delivered Qty</th>
                          <th className="px-2 py-2 font-medium text-center">Accepted Qty</th>
                          <th className="px-2 py-2 font-medium text-center">Rejected Qty</th>
                          <th className="px-2 py-2 font-medium">Unit</th>
                          <th className="px-2 py-2 font-medium">Inspection Result</th>
                          <th className="px-2 py-2 font-medium">Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedReceiving.products?.map((p) => (
                          <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/30">
                            <td className="px-2 py-2 text-white">{p.product}</td>
                            <td className="px-2 py-2 text-slate-300">{p.sku}</td>
                            <td className="px-2 py-2 text-center text-white">{p.orderedQty}</td>
                            <td className="px-2 py-2 text-center text-white">{p.deliveredQty}</td>
                            <td className="px-2 py-2 text-center text-emerald-400">{p.acceptedQty}</td>
                            <td className="px-2 py-2 text-center text-red-400">{p.rejectedQty}</td>
                            <td className="px-2 py-2 text-slate-300">{p.unit}</td>
                            <td className="px-2 py-2">
                              <select
                                value={p.inspectionResult}
                                className="bg-[#090d16] border border-gray-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                              >
                                <option value="Pending">Pending</option>
                                <option value="Passed">Passed</option>
                                <option value="Rejected">Rejected</option>
                                <option value="Partial">Partial</option>
                              </select>
                            </td>
                            <td className="px-2 py-2">
                              <button className="text-slate-400 hover:text-white transition-all">
                                <MessageSquare className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* Summary Footer */}
                    <div className="mt-4 p-3 bg-[#090d16] border border-gray-800 rounded-lg flex flex-wrap items-center justify-between text-sm">
                      <span className="text-slate-400">Total Items: <span className="text-white font-medium">{selectedReceiving.products?.length || 0}</span></span>
                      <div className="flex flex-wrap gap-4">
                        <span className="text-slate-400">Ordered: <span className="text-white font-medium">{selectedReceiving.totalOrdered}</span></span>
                        <span className="text-slate-400">Delivered: <span className="text-white font-medium">{selectedReceiving.totalDelivered}</span></span>
                        <span className="text-slate-400">Accepted: <span className="text-emerald-400 font-medium">{selectedReceiving.totalAccepted}</span></span>
                        <span className="text-slate-400">Rejected: <span className="text-red-400 font-medium">{selectedReceiving.totalRejected}</span></span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'summary' && (
                  <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-slate-400">QA Inspector</p>
                        <p className="text-white">—</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Inspection Date</p>
                        <p className="text-white">—</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Overall Decision</p>
                        <StatusBadge status={selectedReceiving.inspectionStatus} />
                      </div>
                      <div>
                        <p className="text-slate-400">Remarks</p>
                        <p className="text-white">—</p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'notes' && (
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-slate-400">Plant Manager Notes</p>
                      <p className="text-white bg-[#090d16] p-3 rounded-lg border border-gray-800">—</p>
                    </div>
                    <div>
                      <p className="text-slate-400">QA Notes</p>
                      <p className="text-white bg-[#090d16] p-3 rounded-lg border border-gray-800">—</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Admin Notes</p>
                      <p className="text-white bg-[#090d16] p-3 rounded-lg border border-gray-800">—</p>
                    </div>
                  </div>
                )}

                {activeTab === 'attachments' && (
                  <div className="space-y-3 text-sm">
                    <p className="text-slate-400">No attachments uploaded.</p>
                  </div>
                )}

                {activeTab === 'timeline' && (
                  <div className="space-y-4 relative">
                    {selectedReceiving.timeline?.map((item, idx) => (
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
                            <span>{item.date || '—'}</span>
                            <span>•</span>
                            <span>{item.time || '—'}</span>
                            <span>•</span>
                            <span>by {item.performedBy || '—'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Inspection Timeline */}
          <div className="lg:col-span-1">
            <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 sticky top-6">
              <h3 className="text-lg font-semibold text-white mb-4">Inspection Timeline</h3>
              <div className="space-y-4 relative">
                {selectedReceiving.timeline?.map((item, idx) => (
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
                        <span>{item.date || '—'}</span>
                        <span>•</span>
                        <span>{item.time || '—'}</span>
                        <span>•</span>
                        <span>by {item.performedBy || '—'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QualityInspection;