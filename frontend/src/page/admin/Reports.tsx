// src/pages/admin/Reports.tsx
import React, { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';
import {
  FileText,
  Eye,
  Printer,
  Download,
  BarChart3,
  Clock,
  Calendar,
  ChevronRight,
  CheckCircle,
  Plus,
  Search,
  ChevronDown,
  MoreVertical,
  AlertCircle,
  Package,
  Truck,
  Warehouse as WarehouseIcon,
  TrendingUp,
  LayoutGrid,
  Zap,
  X,
  RefreshCw,
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
  fileSize: string;
  parameters: string;
}

interface Category {
  id: string;
  name: string;
  icon: React.ReactNode;
}

interface ReportsDashboardResponse {
  metrics: { total_reports_available:number; exports_today:number; pending_reports:number; generated_today:number; total_inventory_value:number; ai_forecast_accuracy:number };
  reports_list: Array<{ id:string; name:string; description:string; category:string; last_generated:string|null; format:'PDF'|'Excel'|'CSV'; status:'Generated'|'Pending'; file_size:string; parameters:string }>;
  inventory_value_by_warehouse: Array<{ name:string; value:number; color:string }>;
  stock_status_overview: Array<{ name:string; value:number; color:string }>;
  recent_exports: Array<{ filename:string; date:string; size:string; format:'PDF'|'Excel'|'CSV' }>;
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

const mockReportsData: ReportItem[] = [
  {
    id: '1',
    name: 'Stock Movement Report',
    description: 'Detailed logs of stock in, out, transfers and adjustments.',
    category: 'Stock Movement Reports',
    lastGenerated: 'May 31, 2025 09:15 AM',
    format: 'PDF',
    status: 'Generated',
    fileSize: '2.4 MB',
    parameters: 'Date Range: May 1 - May 31, 2025',
  },
  {
    id: '2',
    name: 'Receiving Report',
    description: 'Incoming deliveries, QA results, and receiving summary.',
    category: 'Receiving Reports',
    lastGenerated: 'May 31, 2025 08:45 AM',
    format: 'Excel',
    status: 'Generated',
    fileSize: '1.1 MB',
    parameters: 'Date Range: May 1 - May 31, 2025',
  },
  {
    id: '3',
    name: 'Inventory Valuation Report',
    description: 'Stock value by cost method and warehouse.',
    category: 'Inventory Reports',
    lastGenerated: 'May 31, 2025 08:30 AM',
    format: 'PDF',
    status: 'Generated',
    fileSize: '3.7 MB',
    parameters: 'Cost Method: FIFO, Warehouse: All',
  },
  {
    id: '4',
    name: 'Shipment Report',
    description: 'Orders shipped, in transit, delivered and pending.',
    category: 'Shipment Reports',
    lastGenerated: 'May 31, 2025 07:55 AM',
    format: 'CSV',
    status: 'Generated',
    fileSize: '1.8 MB',
    parameters: 'Date Range: May 1 - May 31, 2025',
  },
  {
    id: '5',
    name: 'Order Report',
    description: 'Customer orders summary and fulfillment status.',
    category: 'Order Reports',
    lastGenerated: 'May 31, 2025 07:30 AM',
    format: 'Excel',
    status: 'Pending',
    fileSize: '0.9 MB',
    parameters: 'Date Range: May 1 - May 31, 2025',
  },
  {
    id: '6',
    name: 'Procurement Report',
    description: 'Replenishment, approvals, and procurement summary.',
    category: 'Procurement Reports',
    lastGenerated: 'May 31, 2025 06:40 AM',
    format: 'PDF',
    status: 'Generated',
    fileSize: '2.1 MB',
    parameters: 'Date Range: May 1 - May 31, 2025',
  },
  {
    id: '7',
    name: 'Supplier Performance Report',
    description: 'Supplier rating, on-time delivery and acceptance rate.',
    category: 'Supplier Reports',
    lastGenerated: 'May 31, 2025 06:20 AM',
    format: 'Excel',
    status: 'Generated',
    fileSize: '1.5 MB',
    parameters: 'Period: Q2 2025',
  },
  {
    id: '8',
    name: 'Low Stock Alert Report',
    description: 'List of items under minimum stock level.',
    category: 'Inventory Reports',
    lastGenerated: 'May 31, 2025 05:50 AM',
    format: 'PDF',
    status: 'Generated',
    fileSize: '0.6 MB',
    parameters: 'Threshold: Min Stock Level',
  },
  {
    id: '9',
    name: 'AI Demand Forecast Report',
    description: 'Forecasted demand, trends and recommended replenishment.',
    category: 'AI Forecast Reports',
    lastGenerated: 'May 31, 2025 05:10 AM',
    format: 'CSV',
    status: 'Generated',
    fileSize: '4.2 MB',
    parameters: 'Model: Prophet, Horizon: 30 days',
  },
  {
    id: '10',
    name: 'Warehouse Utilization Report',
    description: 'Warehouse utilization and capacity overview.',
    category: 'Warehouse Reports',
    lastGenerated: 'May 31, 2025 04:30 AM',
    format: 'Excel',
    status: 'Generated',
    fileSize: '1.3 MB',
    parameters: 'Warehouse: All, Capacity: 100%',
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
  const [reports, setReports] = useState<(typeof mockReportsData)[number][]>([]);
  const [warehouseChartData, setWarehouseChartData] = useState<(typeof warehouseData)[number][]>([]);
  const [stockChartData, setStockChartData] = useState<(typeof stockStatusData)[number][]>([]);
  const [exportFiles, setExportFiles] = useState<(typeof recentExports)[number][]>([]);
  const [metrics, setMetrics] = useState({ total_reports_available:0, exports_today:0, pending_reports:0, generated_today:0, total_inventory_value:0, ai_forecast_accuracy:0 });
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const itemsPerPage = 10;

  const [isCustomReportOpen, setIsCustomReportOpen] = useState(false);
  const [reportTitle, setReportTitle] = useState('');
  const [reportCategory, setReportCategory] = useState('inventory');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportFormat, setExportFormat] = useState<'PDF' | 'Excel' | 'CSV'>('PDF');
  const [reportNotes, setReportNotes] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [isViewDrawerOpen, setIsViewDrawerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient.get<ReportsDashboardResponse>('/admin/reports/dashboard')
      .then(({ data }) => {
        if (!active) return;
        setMetrics(data.metrics);
        setReports(data.reports_list.map((report) => ({ id:report.id, name:report.name, description:report.description, category:report.category, lastGenerated:report.last_generated ? new Date(report.last_generated).toLocaleString() : 'Not generated', format:report.format, status:report.status, fileSize:report.file_size, parameters:report.parameters })));
        setWarehouseChartData(data.inventory_value_by_warehouse);
        setStockChartData(data.stock_status_overview);
        setExportFiles(data.recent_exports.map((file) => ({ name:file.filename, format:file.format, date:new Date(file.date).toLocaleString(), size:file.size })));
        setDashboardError(null);
      })
      .catch((error) => { if (active) setDashboardError(error?.response?.data?.message || 'Unable to load reports dashboard.'); })
      .finally(() => { if (active) setDashboardLoading(false); });
    return () => { active = false; };
  }, []);

  const currency = (value:number) => new Intl.NumberFormat('en-PH', { style:'currency', currency:'PHP' }).format(value);

  const openDrawer = (report: ReportItem) => {
    setSelectedReport(report);
    setIsViewDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsViewDrawerOpen(false);
    setSelectedReport(null);
  };

  const categoryLabelMap: Record<string, string> = {
    inventory: 'Inventory Reports',
    'stock-movement': 'Stock Movement Reports',
    receiving: 'Receiving Reports',
    shipment: 'Shipment Reports',
    order: 'Order Reports',
    procurement: 'Procurement Reports',
  };

  const generateReport = () => {
    if (!reportTitle.trim() || !startDate || !endDate) return;
    setIsGenerating(true);
    setTimeout(() => {
      const newReport: ReportItem = {
        id: Date.now().toString(),
        name: reportTitle,
        description: reportNotes || `Custom ${categoryLabelMap[reportCategory] || 'Report'}`,
        category: categoryLabelMap[reportCategory] || 'System Reports',
        lastGenerated: new Date().toLocaleString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }),
        format: exportFormat,
        status: 'Generated',
        fileSize: 'N/A',
        parameters: `Date Range: ${startDate} - ${endDate}`,
      };
      setReports(prev => [newReport, ...prev]);
      setReportTitle('');
      setReportCategory('inventory');
      setStartDate('');
      setEndDate('');
      setExportFormat('PDF');
      setReportNotes('');
      setIsGenerating(false);
      setIsCustomReportOpen(false);
    }, 1200);
  };

  const resetForm = () => {
    setReportTitle('');
    setReportCategory('inventory');
    setStartDate('');
    setEndDate('');
    setExportFormat('PDF');
    setReportNotes('');
  };

  // Filter reports based on category and search
  const filteredReports = reports.filter(report => {
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
          <button
            onClick={() => setIsCustomReportOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-medium rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors whitespace-nowrap h-9"
          >
            <Plus className="w-4 h-4 shrink-0" />
            Create Custom Report
          </button>
        </div>
      </div>

      {/* CUSTOM REPORT MODAL */}
      {isCustomReportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0b101d] border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-800/60">
              <h2 className="text-lg font-semibold text-white">Create Custom Report</h2>
              <button
                onClick={() => { setIsCustomReportOpen(false); resetForm(); }}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Report Title */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Report Title</label>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder="e.g. Monthly Inventory Summary"
                  className="w-full bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>

              {/* Category Dropdown */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Category</label>
                <select
                  value={reportCategory}
                  onChange={(e) => setReportCategory(e.target.value)}
                  className="w-full bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                >
                  <option value="inventory">Inventory</option>
                  <option value="stock-movement">Stock Movement</option>
                  <option value="receiving">Receiving</option>
                  <option value="shipment">Shipment</option>
                  <option value="order">Order</option>
                  <option value="procurement">Procurement</option>
                </select>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                </div>
              </div>

              {/* Export Format */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Export Format</label>
                <div className="flex items-center gap-4">
                  {['PDF', 'Excel', 'CSV'].map((fmt) => (
                    <label key={fmt} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="exportFormat"
                        value={fmt}
                        checked={exportFormat === fmt}
                        onChange={() => setExportFormat(fmt as 'PDF' | 'Excel' | 'CSV')}
                        className="accent-cyan-500"
                      />
                      <span className="text-sm text-slate-300">{fmt}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Notes / File Description</label>
                <textarea
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  placeholder="Optional description or notes for this report..."
                  rows={3}
                  className="w-full bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800/60">
              <button
                onClick={() => { setIsCustomReportOpen(false); resetForm(); }}
                disabled={isGenerating}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={generateReport}
                disabled={isGenerating}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isGenerating ? (
                  <svg className="animate-spin h-4 w-4 text-slate-950" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : null}
                {isGenerating ? 'Generating...' : 'Generate Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI CARDS */}
      {dashboardError && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{dashboardError}</div>}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Reports', value: metrics.total_reports_available, subtitle: 'Available Reports', icon: <FileText className="w-4 h-4 text-blue-400" /> },
          { label: 'Exports Today', value: metrics.exports_today, subtitle: 'Excel / PDF / CSV', icon: <Download className="w-4 h-4 text-emerald-400" /> },
          { label: 'Pending Reports', value: metrics.pending_reports, subtitle: 'Awaiting data', icon: <Clock className="w-4 h-4 text-amber-400" /> },
          { label: 'Generated Today', value: metrics.generated_today, subtitle: 'All Reports', icon: <CheckCircle className="w-4 h-4 text-cyan-400" /> },
          { label: 'Total Inventory Value', value: currency(metrics.total_inventory_value), subtitle: 'Across All Warehouses', icon: <BarChart3 className="w-4 h-4 text-purple-400" /> },
          { label: 'AI Forecast Accuracy', value: `${metrics.ai_forecast_accuracy}%`, subtitle: 'This Month', icon: <TrendingUp className="w-4 h-4 text-rose-400" /> },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition-colors">
            <div className="flex items-start justify-between">
              <div className="p-2 rounded-lg border border-slate-700/50 bg-slate-800/50">
                {kpi.icon}
              </div>
            </div>
            <div className="mt-3">
              <p className="text-xl font-bold text-white">{dashboardLoading ? '—' : kpi.value}</p>
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
                {warehouseChartData.map((warehouse) => <option key={warehouse.name}>{warehouse.name}</option>)}
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
                  {dashboardLoading ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading reports…</td></tr> : paginatedReports.map((report) => (
                    <tr key={report.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-3 py-3 font-medium text-white">{report.name}</td>
                      <td className="px-3 py-3 text-slate-400 max-w-[180px] truncate">{report.description}</td>
                      <td className="px-3 py-3"><CategoryBadge category={report.category} /></td>
                      <td className="px-3 py-3 text-slate-300 text-xs">{report.lastGenerated}</td>
                      <td className="px-3 py-3"><FormatBadge format={report.format} /></td>
                      <td className="px-3 py-3"><StatusBadge status={report.status} /></td>
                      <td className="px-3 py-3 text-right pr-4 min-w-[90px]">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openDrawer(report)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
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
                  {!dashboardLoading && paginatedReports.length === 0 && (
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
            {!dashboardLoading && warehouseChartData.length === 0 && <div className="absolute inset-0 z-10 flex items-center justify-center text-xs text-slate-500">No warehouse inventory data.</div>}
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', color: '#fff', fontSize: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', borderRadius: '8px', padding: '10px' }} />
                <Pie
                  data={warehouseChartData}
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
                  {warehouseChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="#0b101d" strokeWidth={2} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-xs text-slate-400">Total Value</p>
                <p className="text-lg font-bold text-white">{currency(metrics.total_inventory_value)}</p>
              </div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
            {warehouseChartData.map((item) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-slate-400 truncate">{item.name}</span>
                <span className="text-white ml-auto">{currency(item.value)}</span>
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
            {!dashboardLoading && stockChartData.every((item) => item.value === 0) && <div className="h-full flex items-center justify-center text-xs text-slate-500">No stock data.</div>}
            {(dashboardLoading || stockChartData.some((item) => item.value > 0)) && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockChartData} layout="vertical" margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', color: '#fff', fontSize: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', borderRadius: '8px', padding: '10px' }} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} isAnimationActive={true} animationDuration={1500} animationEasing="ease-in-out">
                  {stockChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            )}
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
            {exportFiles.slice(0, 4).map((file, idx) => (
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
            {!dashboardLoading && exportFiles.length === 0 && <p className="py-6 text-center text-xs text-slate-500">No recent exports.</p>}
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

      {/* VIEW REPORT DRAWER */}
      {isViewDrawerOpen && selectedReport && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={closeDrawer} />
          <div className="relative ml-auto h-full w-full max-w-lg bg-[#0b101d] border-l border-slate-700/80 shadow-2xl flex flex-col">
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800/60 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="text-lg font-semibold text-white truncate">{selectedReport.name}</h2>
                <StatusBadge status={selectedReport.status} />
              </div>
              <button
                onClick={closeDrawer}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Key Information Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#070a12] border border-slate-800/80 rounded-xl p-3">
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Category</p>
                  <p className="text-sm text-slate-200 truncate">{selectedReport.category}</p>
                </div>
                <div className="bg-[#070a12] border border-slate-800/80 rounded-xl p-3">
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Format</p>
                  <div className="mt-1">
                    <FormatBadge format={selectedReport.format} />
                  </div>
                </div>
                <div className="bg-[#070a12] border border-slate-800/80 rounded-xl p-3">
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Last Generated</p>
                  <p className="text-sm text-slate-200">{selectedReport.lastGenerated}</p>
                </div>
                <div className="bg-[#070a12] border border-slate-800/80 rounded-xl p-3">
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">File Size</p>
                  <p className="text-sm text-slate-200">{selectedReport.fileSize}</p>
                </div>
                <div className="col-span-2 bg-[#070a12] border border-slate-800/80 rounded-xl p-3">
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Description</p>
                  <p className="text-sm text-slate-300">{selectedReport.description}</p>
                </div>
                <div className="col-span-2 bg-[#070a12] border border-slate-800/80 rounded-xl p-3">
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Parameters</p>
                  <p className="text-sm text-slate-300">{selectedReport.parameters}</p>
                </div>
              </div>

              {/* Report History / Summary */}
              <div className="bg-[#070a12] border border-slate-800/80 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">Report History</h3>
                <div className="space-y-2">
                  {[
                    { time: selectedReport.lastGenerated, action: 'Generated', user: 'System', status: 'Success' },
                    { time: 'May 30, 2025 08:15 AM', action: 'Downloaded', user: 'Admin', status: 'Success' },
                    { time: 'May 29, 2025 07:45 AM', action: 'Generated', user: 'System', status: 'Success' },
                    { time: 'May 28, 2025 06:20 AM', action: 'Printed', user: 'Manager', status: 'Success' },
                    { time: 'May 27, 2025 09:00 AM', action: 'Regenerated', user: 'Admin', status: 'Success' },
                  ].map((log, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-b-0">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-slate-800/60 text-slate-400">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-200">{log.action}</p>
                          <p className="text-[10px] text-slate-500">by {log.user}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400">{log.time}</p>
                        <p className="text-[10px] text-emerald-400">{log.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-5 border-t border-slate-800/60 flex items-center gap-3 shrink-0">
              <button className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-medium transition-colors">
                <Download className="w-4 h-4" />
                Download File
              </button>
              <button className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors">
                <Printer className="w-4 h-4" />
                Print Report
              </button>
              <button className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors">
                <RefreshCw className="w-4 h-4" />
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer (optional) */}
      <div className="text-center text-xs text-slate-500 pt-4 border-t border-slate-800/60">
        © 2026 SmartChain. All rights reserved.
      </div>
    </div>
  );
};

export default Reports;
