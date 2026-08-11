// src/page/plant-manager/StockIn.tsx
import React, { useState } from 'react';
import {
  ChevronRight,
  Search,
  Download,
  Package,
  Clock,
  Calendar,
  Check,
  X,
  AlertCircle,
  Plus,
  MoreVertical,
  Eye,
  Filter,
  RefreshCw,
  Printer,
  FileText,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  PackageCheck,
  ArrowDownToLine,
  Box,
  QrCode,
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

type QaStatus = 'Pending QA' | 'QA Passed' | 'Rejected';
type ReceivingStatus = 'Pending QA' | 'Ready for Stock In' | 'Completed' | 'Rejected';

interface ReceivingItem {
  id: string;
  receivingNo: string;
  supplier: string;
  receivingDate: string;
  refNo: string;
  qaStatus: QaStatus;
  status: ReceivingStatus;
  delivered: number;
  total: number;
  receivedValue: number;
}

interface ReceivingDetail {
  supplier: string;
  warehouse: string;
  totalItems: number;
  referenceNo: string;
  receivingArea: string;
  totalProducts: number;
  deliveryDate: string;
  receivedBy: string;
  receivedValue: number;
  preparedBy: string;
  qaInspector: string;
  remarks: string;
}

// ============================================
// MOCK DATA
// ============================================

const mockReceivings: ReceivingItem[] = [
  {
    id: '1',
    receivingNo: 'RCV-2025-0058',
    supplier: 'Northwind Traders',
    receivingDate: '2025-05-21 09:15',
    refNo: 'PO-2058',
    qaStatus: 'Pending QA',
    status: 'Pending QA',
    delivered: 16,
    total: 16,
    receivedValue: 245000,
  },
  {
    id: '2',
    receivingNo: 'RCV-2025-0057',
    supplier: 'Cebu Logistics Co.',
    receivingDate: '2025-05-20 14:30',
    refNo: 'PO-2055',
    qaStatus: 'QA Passed',
    status: 'Ready for Stock In',
    delivered: 11,
    total: 11,
    receivedValue: 89750,
  },
  {
    id: '3',
    receivingNo: 'RCV-2025-0056',
    supplier: 'Kraft Industrial',
    receivingDate: '2025-05-19 10:00',
    refNo: 'PO-2051',
    qaStatus: 'Rejected',
    status: 'Rejected',
    delivered: 0,
    total: 8,
    receivedValue: 0,
  },
  {
    id: '4',
    receivingNo: 'RCV-2025-0055',
    supplier: 'Apex Components',
    receivingDate: '2025-05-18 08:45',
    refNo: 'PO-2050',
    qaStatus: 'QA Passed',
    status: 'Completed',
    delivered: 18,
    total: 18,
    receivedValue: 132500,
  },
  {
    id: '5',
    receivingNo: 'RCV-2025-0054',
    supplier: 'Meridian Supply',
    receivingDate: '2025-05-17 11:20',
    refNo: 'PO-2048',
    qaStatus: 'Pending QA',
    status: 'Pending QA',
    delivered: 4,
    total: 4,
    receivedValue: 28600,
  },
];

const mockDetail: ReceivingDetail = {
  supplier: 'Northwind Traders',
  warehouse: 'Central Depot',
  totalItems: 16,
  referenceNo: 'PO-2058',
  receivingArea: 'Dock 2',
  totalProducts: 8,
  deliveryDate: 'May 21, 2025 09:15 AM',
  receivedBy: 'Juan Dela Cruz',
  receivedValue: 245000,
  preparedBy: 'Maria Santos',
  qaInspector: 'Rosa Ramirez',
  remarks: 'All items accounted for, pending QA inspection.',
};

// Timeline steps for selected receiving
const timelineSteps = [
  { label: 'Receiving Created', time: 'May 21, 2025 09:00 AM' },
  { label: 'Truck Arrived', time: 'May 21, 2025 09:15 AM' },
  { label: 'Receiving Started', time: 'May 21, 2025 09:30 AM' },
  { label: 'QA Inspection', time: 'In Progress' },
  { label: 'QA Passed', time: 'Pending' },
  { label: 'Stock In Completed', time: 'Pending' },
  { label: 'Inventory Updated', time: 'Pending' },
];

// ============================================
// HELPER COMPONENTS
// ============================================

const QaStatusBadge: React.FC<{ status: QaStatus }> = ({ status }) => {
  const config = {
    'Pending QA': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'QA Passed': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'Rejected': 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${config[status]}`}>
      {status === 'QA Passed' && <Check className="w-3 h-3 mr-1" />}
      {status === 'Pending QA' && <Clock className="w-3 h-3 mr-1" />}
      {status === 'Rejected' && <X className="w-3 h-3 mr-1" />}
      {status}
    </span>
  );
};

const ReceivingStatusBadge: React.FC<{ status: ReceivingStatus }> = ({ status }) => {
  const config = {
    'Pending QA': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'Ready for Stock In': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    'Completed': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'Rejected': 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${config[status]}`}>
      {status}
    </span>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const StockIn: React.FC = () => {
  // State
  const [search, setSearch] = useState('');
  const [selectedReceiving, setSelectedReceiving] = useState<ReceivingItem | null>(mockReceivings[0]);
  const [activeTab, setActiveTab] = useState<'info' | 'items' | 'attachments' | 'history'>('info');

  // Filtered receivings
  const filteredReceivings = mockReceivings.filter(r =>
    r.receivingNo.toLowerCase().includes(search.toLowerCase()) ||
    r.supplier.toLowerCase().includes(search.toLowerCase()) ||
    r.refNo.toLowerCase().includes(search.toLowerCase())
  );

  // KPI calculations (using mockReceivings as today's data)
  const totalDeliveries = mockReceivings.length;
  const totalItemsReceived = mockReceivings.reduce((sum, r) => sum + r.delivered, 0);
  const pendingQa = mockReceivings.filter(r => r.qaStatus === 'Pending QA').length;
  const qaPassed = mockReceivings.filter(r => r.qaStatus === 'QA Passed').length;
  const rejected = mockReceivings.filter(r => r.qaStatus === 'Rejected').length;
  const totalValue = mockReceivings.reduce((sum, r) => sum + r.receivedValue, 0);

  // KPI data
  const kpiData = [
    { label: "Today's Stock In", value: totalDeliveries, subtitle: 'Deliveries completed', change: '+18% vs yesterday', trend: 'up' },
    { label: 'Received Today', value: totalItemsReceived, subtitle: 'Items received', change: '+22% vs yesterday', trend: 'up' },
    { label: 'Pending QA', value: pendingQa, subtitle: 'Awaiting inspection', change: '-5% vs yesterday', trend: 'down' },
    { label: 'QA Passed', value: qaPassed, subtitle: 'Ready for stock in', change: '+12% vs yesterday', trend: 'up' },
    { label: 'Rejected', value: rejected, subtitle: 'Deliveries rejected', change: '-33% vs yesterday', trend: 'down' },
    { label: 'Total Received Value', value: `₱${totalValue.toLocaleString()}`, subtitle: "Today's value", change: '+16% vs yesterday', trend: 'up' },
  ];

  // Determine if "Perform Stock In" should be enabled
  const canPerformStockIn = selectedReceiving?.qaStatus === 'QA Passed';

  // Pie chart data for Items Summary
  const pieData = [
    { name: 'Accepted', value: 85, color: '#10b981' },
    { name: 'Rejected', value: 10, color: '#ef4444' },
    { name: 'Pending', value: 5, color: '#f59e0b' },
  ];

  return (
    <div className="w-full min-h-screen bg-[#070a12] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 overflow-x-hidden">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span>Plant Manager</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-100">Stock In</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Stock In</h1>
          <p className="text-slate-400 text-sm mt-1">
            Inbound receiving against approved purchase and transfer deliveries.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-slate-700 hover:bg-slate-800/50 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            <QrCode className="w-4 h-4" />
            Scan Barcode
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-slate-700 hover:bg-slate-800/50 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-slate-700 hover:bg-slate-800/50 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            New Receiving
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiData.map((kpi, idx) => {
          const trendIcon = kpi.trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />;
          const trendColor = kpi.trend === 'up' ? 'text-emerald-400' : 'text-rose-400';
          const accentClasses = [
            'text-blue-400 bg-blue-500/10 border border-blue-500/20',
            'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20',
            'text-amber-400 bg-amber-500/10 border border-amber-500/20',
            'text-cyan-400 bg-cyan-500/10 border border-cyan-500/20',
            'text-rose-400 bg-rose-500/10 border border-rose-500/20',
            'text-teal-400 bg-teal-500/10 border border-teal-500/20',
          ];
          return (
            <div key={idx} className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 hover:border-slate-700 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{kpi.label}</p>
                  <p className="text-2xl font-bold text-white mt-1">{kpi.value}</p>
                </div>
                <div className={`p-2.5 rounded-lg flex items-center justify-center ${accentClasses[idx]}`}>
                  {idx === 0 && <Box className="w-5 h-5" />}
                  {idx === 1 && <PackageCheck className="w-5 h-5" />}
                  {idx === 2 && <Clock className="w-5 h-5" />}
                  {idx === 3 && <CheckCircle className="w-5 h-5" />}
                  {idx === 4 && <XCircle className="w-5 h-5" />}
                  {idx === 5 && <FileText className="w-5 h-5" />}
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-1">{kpi.subtitle}</p>
              <p className={`text-xs font-medium mt-1 flex items-center gap-1 ${trendColor}`}>
                {trendIcon} {kpi.change}
              </p>
            </div>
          );
        })}
      </div>

      {/* ============================================
          FULL-WIDTH TABLE SECTION
          ============================================ */}
      <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 space-y-4 w-full">
        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search receiving no., supplier, or reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#070a12] border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
          </div>
          <select className="bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
            <option>All Status</option>
            <option>Pending QA</option>
            <option>Ready for Stock In</option>
            <option>Completed</option>
            <option>Rejected</option>
          </select>
          <select className="bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
            <option>All QA Status</option>
            <option>Pending QA</option>
            <option>QA Passed</option>
            <option>Rejected</option>
          </select>
          <select className="bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
            <option>All Warehouses</option>
            <option>Central Depot</option>
            <option>Northgate</option>
            <option>Southpark</option>
            <option>Eastside</option>
          </select>
          <div className="flex items-center gap-2 bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span>Date Range</span>
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </div>
          <button className="p-2 rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-800/50 transition-colors">
            <Filter className="w-4 h-4" />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#070a12] border-b border-slate-800/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Receiving No.</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Receiving Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Ref. No.</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">QA Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-400">Items</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Received Value</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredReceivings.map((rec) => (
                <tr key={rec.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-blue-400 hover:underline font-medium">{rec.receivingNo}</td>
                  <td className="px-4 py-3 text-slate-300">{rec.supplier}</td>
                  <td className="px-4 py-3 text-slate-300">{rec.receivingDate}</td>
                  <td className="px-4 py-3 text-slate-400">{rec.refNo}</td>
                  <td className="px-4 py-3"><QaStatusBadge status={rec.qaStatus} /></td>
                  <td className="px-4 py-3"><ReceivingStatusBadge status={rec.status} /></td>
                  <td className="px-4 py-3 text-center text-white">{rec.delivered} / {rec.total}</td>
                  <td className="px-4 py-3 text-right text-white">₱{rec.receivedValue.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        onClick={() => setSelectedReceiving(rec)}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredReceivings.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    No receiving records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================
          BOTTOM DASHBOARD SECTION
          ============================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* LEFT COLUMN (2/3 span): Receiving Details + Pending Deliveries */}
        <div className="lg:col-span-2 space-y-6">
          {/* Receiving Details Card */}
          {selectedReceiving && (
            <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-semibold text-white">Receiving Details</h3>
                <div className="flex items-center gap-2">
                  <button className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-4 border-b border-slate-800">
                {['info', 'items', 'attachments', 'history'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`pb-2 text-sm font-medium capitalize transition-colors border-b-2 ${
                      activeTab === tab
                        ? 'border-cyan-500 text-white'
                        : 'border-transparent text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    {tab} {tab === 'items' && <span className="ml-1 text-xs bg-slate-700 px-2 py-0.5 rounded-full">14</span>}
                    {tab === 'attachments' && <span className="ml-1 text-xs bg-slate-700 px-2 py-0.5 rounded-full">2</span>}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {activeTab === 'info' && (
                  <>
                    <div><span className="text-slate-400">Supplier</span> <p className="text-white">{mockDetail.supplier}</p></div>
                    <div><span className="text-slate-400">Warehouse</span> <p className="text-white">{mockDetail.warehouse}</p></div>
                    <div><span className="text-slate-400">Total Items</span> <p className="text-white">{mockDetail.totalItems}</p></div>
                    <div><span className="text-slate-400">Reference No.</span> <p className="text-white">{mockDetail.referenceNo}</p></div>
                    <div><span className="text-slate-400">Receiving Area</span> <p className="text-white">{mockDetail.receivingArea}</p></div>
                    <div><span className="text-slate-400">Total Products</span> <p className="text-white">{mockDetail.totalProducts}</p></div>
                    <div><span className="text-slate-400">Delivery Date</span> <p className="text-white">{mockDetail.deliveryDate}</p></div>
                    <div><span className="text-slate-400">Received By</span> <p className="text-white">{mockDetail.receivedBy}</p></div>
                    <div><span className="text-slate-400">Received Value</span> <p className="text-white">₱{mockDetail.receivedValue.toLocaleString()}</p></div>
                    <div><span className="text-slate-400">Prepared By</span> <p className="text-white">{mockDetail.preparedBy}</p></div>
                    <div><span className="text-slate-400">QA Inspector</span> <p className="text-white">{mockDetail.qaInspector}</p></div>
                    <div className="col-span-2"><span className="text-slate-400">Remarks</span> <p className="text-white">{mockDetail.remarks}</p></div>
                  </>
                )}
                {activeTab === 'items' && (
                  <div className="col-span-2 text-center text-slate-400 py-4">Items list will appear here</div>
                )}
                {activeTab === 'attachments' && (
                  <div className="col-span-2 text-center text-slate-400 py-4">Attachments list</div>
                )}
                {activeTab === 'history' && (
                  <div className="col-span-2 text-center text-slate-400 py-4">History timeline</div>
                )}
              </div>
            </div>
          )}

          {/* Pending Deliveries (Horizontal Cards) */}
          <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              Pending Deliveries
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {mockReceivings.slice(0, 4).map((rec) => (
                <div
                  key={rec.id}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedReceiving?.id === rec.id
                      ? 'border-cyan-500/50 bg-cyan-500/10'
                      : 'border-slate-800/60 hover:border-slate-600'
                  }`}
                  onClick={() => setSelectedReceiving(rec)}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-sm font-semibold text-white">{rec.receivingNo}</span>
                    <QaStatusBadge status={rec.qaStatus} />
                  </div>
                  <p className="text-sm text-slate-300 mt-1">{rec.supplier}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Expected: {rec.receivingDate}
                  </p>
                  <p className="text-xs text-slate-400">
                    {rec.total} Products · {rec.delivered} Items
                  </p>
                  <button className="w-full mt-2 py-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/10 rounded-lg transition-colors">
                    View Receiving
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (1/3 span): Timeline, Items Summary, Quick Actions */}
        <div className="lg:col-span-1 space-y-4">
          {/* Receiving Timeline */}
          <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              Receiving Timeline
            </h3>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {timelineSteps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="relative flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full border-2 ${
                      idx < 3 ? 'bg-cyan-500 border-cyan-500' : 'bg-slate-700 border-slate-600'
                    }`} />
                    {idx < timelineSteps.length - 1 && (
                      <div className={`w-0.5 h-6 ${idx < 3 ? 'bg-cyan-500' : 'bg-slate-700'}`} />
                    )}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${idx < 3 ? 'text-white' : 'text-slate-500'}`}>{step.label}</p>
                    <p className="text-xs text-slate-400">{step.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Items Summary (Donut Chart) */}
          <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <Package className="w-4 h-4 text-cyan-400" />
              Items Summary
            </h3>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={50}
                    dataKey="value"
                    label={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 text-xs">
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Accepted 85%</div>
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Rejected 10%</div>
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> Pending 5%</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Quick Actions</h3>
            <button className="w-full py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800/50 transition-colors">
              View Receiving Checklist
            </button>
            <button className="w-full py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800/50 transition-colors">
              Print Receiving Slip
            </button>
            <button className="w-full py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800/50 transition-colors">
              Upload Attachments
            </button>
            <button
              disabled={!canPerformStockIn}
              className={`w-full py-2.5 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                canPerformStockIn
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                  : 'bg-slate-700/50 text-slate-500 cursor-not-allowed opacity-50'
              }`}
            >
              <ArrowDownToLine className="w-4 h-4" />
              Perform Stock In
              {!canPerformStockIn && <AlertCircle className="w-4 h-4 ml-1" />}
            </button>
            {!canPerformStockIn && (
              <p className="text-xs text-amber-400 text-center">QA status must be "QA Passed" to enable stock in.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockIn;