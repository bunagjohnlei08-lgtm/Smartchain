// src/pages/admin/Reports.tsx
import React, { useState } from 'react';
import {
  FileText,
  Eye,
  Printer,
  Download,
  FileSpreadsheet,
  BarChart3,
  Clock,
  Calendar,
  ChevronRight,
  X,
  CheckCircle,
  RefreshCw,
  Plus,
  Search,
  Filter,
  ChevronDown,
  MoreVertical,
  AlertCircle,
  Package,
  Truck,
  Warehouse as WarehouseIcon,
  TrendingUp,
  LayoutGrid,
  Zap,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ============================================
// TYPES
// ============================================

interface ReportItem {
  id: string;
  name: string;
  description: string;
  category: string;
  lastGenerated: string;
  format: 'PDF' | 'Excel' | 'CSV';
  status: 'Generated' | 'Pending';
}

interface Category {
  id: string;
  name: string;
  icon: React.ReactNode;
}

// ============================================
// MOCK DATA
// ============================================

const reportCategories: Category[] = [
  { id: 'inventory', name: 'Inventory Reports', icon: <Package className="w-4 h-4" /> },
  { id: 'stock-movement', name: 'Stock Movement Reports', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'receiving', name: 'Receiving Reports', icon: <FileText className="w-4 h-4" /> },
  { id: 'shipment', name: 'Shipment Reports', icon: <Truck className="w-4 h-4" /> },
  { id: 'order', name: 'Order Reports', icon: <LayoutGrid className="w-4 h-4" /> },
  { id: 'procurement', name: 'Procurement Reports', icon: <Zap className="w-4 h-4" /> },
  { id: 'supplier', name: 'Supplier Reports', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'warehouse', name: 'Warehouse Reports', icon: <WarehouseIcon className="w-4 h-4" /> },
  { id: 'ai-forecast', name: 'AI Forecast Reports', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'system', name: 'System Reports', icon: <AlertCircle className="w-4 h-4" /> },
];

const mockReports: ReportItem[] = [
  {
    id: '1',
    name: 'Stock Movement Report',
    description: 'Detailed logs of stock in, out, transfers and adjustments.',
    category: 'Stock Movement Reports',
    lastGenerated: 'May 31, 2025 09:15 AM',
    format: 'PDF',
    status: 'Generated',
  },
  {
    id: '2',
    name: 'Receiving Report',
    description: 'Incoming deliveries, QA results, and receiving summary.',
    category: 'Receiving Reports',
    lastGenerated: 'May 31, 2025 08:45 AM',
    format: 'Excel',
    status: 'Generated',
  },
  {
    id: '3',
    name: 'Inventory Valuation Report',
    description: 'Stock value by cost method and warehouse.',
    category: 'Inventory Reports',
    lastGenerated: 'May 31, 2025 08:30 AM',
    format: 'PDF',
    status: 'Generated',
  },
  {
    id: '4',
    name: 'Shipment Report',
    description: 'Orders shipped, in transit, delivered and pending.',
    category: 'Shipment Reports',
    lastGenerated: 'May 31, 2025 07:55 AM',
    format: 'CSV',
    status: 'Generated',
  },
  {
    id: '5',
    name: 'Order Report',
    description: 'Customer orders summary and fulfillment status.',
    category: 'Order Reports',
    lastGenerated: 'May 31, 2025 07:30 AM',
    format: 'Excel',
    status: 'Pending',
  },
  {
    id: '6',
    name: 'Procurement Report',
    description: 'Replenishment, approvals, and procurement summary.',
    category: 'Procurement Reports',
    lastGenerated: 'May 31, 2025 06:40 AM',
    format: 'PDF',
    status: 'Generated',
  },
  {
    id: '7',
    name: 'Supplier Performance Report',
    description: 'Supplier rating, on-time delivery and acceptance rate.',
    category: 'Supplier Reports',
    lastGenerated: 'May 31, 2025 06:20 AM',
    format: 'Excel',
    status: 'Generated',
  },
  {
    id: '8',
    name: 'Low Stock Alert Report',
    description: 'List of items under minimum stock level.',
    category: 'Inventory Reports',
    lastGenerated: 'May 31, 2025 05:50 AM',
    format: 'PDF',
    status: 'Generated',
  },
  {
    id: '9',
    name: 'AI Demand Forecast Report',
    description: 'Forecasted demand, trends and recommended replenishment.',
    category: 'AI Forecast Reports',
    lastGenerated: 'May 31, 2025 05:10 AM',
    format: 'CSV',
    status: 'Generated',
  },
  {
    id: '10',
    name: 'Warehouse Utilization Report',
    description: 'Warehouse utilization and capacity overview.',
    category: 'Warehouse Reports',
    lastGenerated: 'May 31, 2025 04:30 AM',
    format: 'Excel',
    status: 'Generated',
  },
];

const warehouseData = [
  { name: 'Central Depot', value: 10.45, color: '#06b6d4' },
  { name: 'North Warehouse', value: 6.62, color: '#8b5cf6' },
  { name: 'South Warehouse', value: 4.12, color: '#f59e0b' },
  { name: 'East Warehouse', value: 3.59, color: '#10b981' },
];

const stockStatusData = [
  { name: 'Available', value: 6247, color: '#10b981' },
  { name: 'Reserved', value: 2183, color: '#3b82f6' },
  { name: 'In Transit', value: 1097, color: '#8b5cf6' },
  { name: 'Low Stock', value: 742, color: '#f59e0b' },
  { name: 'Out of Stock', value: 318, color: '#ef4444' },
];

const recentExports = [
  { name: 'Inventory_Report_May31.xlsx', format: 'Excel', date: 'May 31, 2025 10:30 AM', size: '2.4 MB' },
  { name: 'Shipment_Summary.pdf', format: 'PDF', date: 'May 31, 2025 08:45 AM', size: '1.1 MB' },
  { name: 'Stock_Movement_Export.csv', format: 'CSV', date: 'May 31, 2025 07:55 AM', size: '3.7 MB' },
  { name: 'Procurement_Report.pdf', format: 'PDF', date: 'May 31, 2025 03:00 AM', size: '0.8 MB' },
  { name: 'Supplier_Scorecard.xlsx', format: 'Excel', date: 'May 31, 2025 09:15 AM', size: '1.9 MB' },
];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: 'Generated' | 'Pending' }> = ({ status }) => {
  const styles = {
    Generated: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    Pending: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status]}`}>
      {status === 'Generated' ? <CheckCircle className="w-3 h-3 mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
      {status}
    </span>
  );
};

const FormatBadge: React.FC<{ format: 'PDF' | 'Excel' | 'CSV' }> = ({ format }) => {
  const styles = {
    PDF: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    Excel: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    CSV: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${styles[format]}`}>
      {format}
    </span>
  );
};

const CategoryBadge: React.FC<{ category: string }> = ({ category }) => {
  const colors: Record<string, string> = {
    'Inventory Reports': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    'Stock Movement Reports': 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    'Receiving Reports': 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    'Shipment Reports': 'text-green-400 bg-green-500/10 border-green-500/20',
    'Order Reports': 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    'Procurement Reports': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    'Supplier Reports': 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    'Warehouse Reports': 'text-teal-400 bg-teal-500/10 border-teal-500/20',
    'AI Forecast Reports': 'text-pink-400 bg-pink-500/10 border-pink-500/20',
    'System Reports': 'text-red-400 bg-red-500/10 border-red-500/20',
  };
  const color = colors[category] || 'text-slate-400 bg-slate-500/10 border-slate-500/20';
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
      {category}
    </span>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const Reports: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('inventory');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Filter reports based on category and search
  const filteredReports = mockReports.filter(report => {
    const categoryMatch = selectedCategory === 'all' || report.category === reportCategories.find(c => c.id === selectedCategory)?.name;
    const searchMatch = report.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        report.description.toLowerCase().includes(searchTerm.toLowerCase());
    return categoryMatch && searchMatch;
  });

  // Pagination
  const totalItems = filteredReports.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedReports = filteredReports.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  return (
    <div className="w-full min-h-screen bg-[#070a12] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 overflow-x-hidden">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Reports & Exports</h1>
          <p className="text-slate-400 text-sm mt-1">
            Generate printable reports, export warehouse data, monitor inventory analytics, and review operational performance.
          </p>
        </div>
        <div className="flex flex-row items-center gap-2.5 shrink-0">
          <button className="inline-flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-medium rounded-lg border border-slate-700 hover:bg-slate-800/50 text-slate-300 transition-colors whitespace-nowrap h-9">
            <Download className="w-4 h-4 shrink-0" />
            Export Data
          </button>
          <button className="inline-flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-medium rounded-lg border border-slate-700 hover:bg-slate-800/50 text-slate-300 transition-colors whitespace-nowrap h-9">
            <Calendar className="w-4 h-4 shrink-0" />
            Schedule Report
          </button>
          <button className="inline-flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-medium rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors whitespace-nowrap h-9">
            <Plus className="w-4 h-4 shrink-0" />
            Create Custom Report
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Reports', value: '28', subtitle: 'Available Reports', icon: <FileText className="w-4 h-4 text-blue-400" /> },
          { label: 'Exports Today', value: '14', subtitle: 'Excel / PDF / CSV', icon: <Download className="w-4 h-4 text-emerald-400" /> },
          { label: 'Pending Reports', value: '3', subtitle: 'Generating...', icon: <Clock className="w-4 h-4 text-amber-400" /> },
          { label: 'Generated Today', value: '21', subtitle: 'All Reports', icon: <CheckCircle className="w-4 h-4 text-cyan-400" /> },
          { label: 'Total Inventory Value', value: '₱24,780,450.00', subtitle: 'Across All Warehouses', icon: <BarChart3 className="w-4 h-4 text-purple-400" /> },
          { label: 'AI Forecast Accuracy', value: '87.6%', subtitle: 'This Month', icon: <TrendingUp className="w-4 h-4 text-rose-400" /> },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition-colors">
            <div className="flex items-start justify-between">
              <div className="p-2 rounded-lg border border-slate-700/50 bg-slate-800/50">
                {kpi.icon}
              </div>
            </div>
            <div className="mt-3">
              <p className="text-xl font-bold text-white">{kpi.value}</p>
              <p className="text-xs text-slate-400">{kpi.label}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{kpi.subtitle}</p>
            </div>
          </div>
        ))}
      </div>

      {/* MAIN BODY: CATEGORIES + TABLE */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* LEFT COLUMN: Categories */}
        <div className="lg:col-span-1 bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-cyan-400" />
            Report Categories
          </h3>
          {reportCategories.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-3 ${
                  isActive
                    ? 'border border-cyan-500/50 bg-cyan-950/20 text-cyan-400'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                {cat.icon}
                {cat.name}
              </button>
            );
          })}
        </div>

        {/* RIGHT COLUMN: Search, Filters & Table */}
        <div className="lg:col-span-3 space-y-4">
          {/* Top Controls */}
          <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search reports..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#070a12] border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>

              <select className="bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                <option>All Categories</option>
                {reportCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>

              <select className="bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                <option>All Warehouses</option>
                <option>Central Depot</option>
                <option>North Warehouse</option>
                <option>South Warehouse</option>
                <option>East Warehouse</option>
              </select>

              <div className="flex items-center gap-2 bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300">
                <Calendar className="w-4 h-4 text-slate-500" />
                <span>May 1, 2025 - May 31, 2025</span>
                <ChevronDown className="w-4 h-4 text-slate-500" />
              </div>

              <select className="bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                <option>All Status</option>
                <option>Generated</option>
                <option>Pending</option>
              </select>

              <button className="ml-auto px-4 py-2 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Export History
              </button>
            </div>
          </div>

          {/* Report Table */}
          <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl overflow-hidden">
            <div className="w-full overflow-x-auto rounded-lg">
              <table className="w-full table-auto text-left border-collapse text-sm">
                <thead className="bg-[#070a12] border-b border-slate-800/50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Report Name</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Description</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Category</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Last Generated</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Format</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                    <th className="px-3 py-3 text-right pr-4 min-w-[90px] text-xs font-medium uppercase tracking-wider text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {paginatedReports.map((report) => (
                    <tr key={report.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-3 py-3 font-medium text-white">{report.name}</td>
                      <td className="px-3 py-3 text-slate-400 max-w-[180px] truncate">{report.description}</td>
                      <td className="px-3 py-3"><CategoryBadge category={report.category} /></td>
                      <td className="px-3 py-3 text-slate-300 text-xs">{report.lastGenerated}</td>
                      <td className="px-3 py-3"><FormatBadge format={report.format} /></td>
                      <td className="px-3 py-3"><StatusBadge status={report.status} /></td>
                      <td className="px-3 py-3 text-right pr-4 min-w-[90px]">
                        <div className="flex items-center justify-end gap-1">
                          <button className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                            <Download className="w-4 h-4" />
                          </button>
                          <button className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                            <Printer className="w-4 h-4" />
                          </button>
                          <button className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedReports.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        No reports match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800/80 bg-[#070a12]/50">
              <div className="text-sm text-slate-400">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} reports
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === page
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM ANALYTICS & QUICK ACTIONS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Inventory Value by Warehouse - Donut Chart */}
        <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 flex flex-col">
          <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <WarehouseIcon className="w-4 h-4 text-cyan-400" />
            Inventory Value by Warehouse
          </h4>
          <div className="flex-1 min-h-[200px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', color: '#fff', fontSize: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', borderRadius: '8px', padding: '10px' }} />
                <Pie
                  data={warehouseData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  dataKey="value"
                  label={false}
                  labelLine={false}
                  isAnimationActive={true}
                  animationDuration={1200}
                  animationEasing="ease-out"
                >
                  {warehouseData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="#0b101d" strokeWidth={2} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-xs text-slate-400">Total Value</p>
                <p className="text-lg font-bold text-white">₱24.78M</p>
              </div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
            {warehouseData.map((item) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-slate-400 truncate">{item.name}</span>
                <span className="text-white ml-auto">₱{item.value.toFixed(2)}M</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stock Status Overview - Bar Chart */}
        <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 flex flex-col">
          <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            Stock Status Overview
          </h4>
          <div className="flex-1 min-h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockStatusData} layout="vertical" margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', color: '#fff', fontSize: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', borderRadius: '8px', padding: '10px' }} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} isAnimationActive={true} animationDuration={1500} animationEasing="ease-in-out">
                  {stockStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Exports */}
        <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              Recent Exports
            </h4>
            <button className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">View All</button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto max-h-[180px]">
            {recentExports.slice(0, 4).map((file, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs border-b border-slate-800/60 pb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 truncate">{file.name}</p>
                  <p className="text-slate-500">{file.date} · {file.size}</p>
                </div>
                <button className="ml-2 p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 flex flex-col">
          <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            Quick Actions
          </h4>
          <div className="space-y-2 flex-1">
            {[
              { label: 'Create Custom Report', icon: <Plus className="w-4 h-4" />, primary: true },
              { label: 'Schedule Report', icon: <Calendar className="w-4 h-4" />, primary: false },
              { label: 'Export Raw Data', icon: <Download className="w-4 h-4" />, primary: false },
              { label: 'Report Templates', icon: <FileText className="w-4 h-4" />, primary: false },
            ].map((action, idx) => (
              <button
                key={idx}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  action.primary
                    ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                    : 'border border-slate-700 hover:bg-slate-800/50 text-slate-300 hover:text-white'
                }`}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-800/60">
            <button className="w-full text-center text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
              Manage Report Templates →
            </button>
          </div>
        </div>
      </div>

      {/* Footer (optional) */}
      <div className="text-center text-xs text-slate-500 pt-4 border-t border-slate-800/60">
        © 2026 SmartChain. All rights reserved.
      </div>
    </div>
  );
};

export default Reports;