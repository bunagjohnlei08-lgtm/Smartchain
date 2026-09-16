// src/pages/admin/Reports.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';
import { useTheme } from '../../context/ThemeContext';
import { useAdminDetailOverlay } from '../../components/layout/AdminDetailOverlayContext';
import {
  FileText,
  Eye,
  Download,
  BarChart3,
  Clock,
  Calendar,
  ChevronRight,
  CheckCircle,
  Plus,
  Search,
  AlertCircle,
  Package,
  Truck,
  Warehouse as WarehouseIcon,
  TrendingUp,
  LayoutGrid,
  Zap,
  X,
} from 'lucide-react';
import {
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
  status: 'Available';
  fileSize: string;
  parameters: string;
}

interface Category {
  id: string;
  name: string;
  icon: React.ReactNode;
}

interface ReportsDashboardResponse {
  metrics: { total_reports_available:number; exports_today:number|null; pending_reports:number|null; generated_today:number|null; warehouse_capacity:{ used:number; total:number|null; utilization_percentage:number|null }; total_stock_units:number; ai_forecast_accuracy:number|null };
  reports_list: Array<{ id:string; name:string; description:string; category:string; last_generated:string|null; format:'PDF'|'Excel'|'CSV'; status:'Available'; file_size:string; parameters:string }>;
  warehouse_capacity_overview: Array<{ name:string; code:string; used:number; capacity:number|null; utilization_percentage:number|null; color:string }>;
  stock_status_overview: Array<{ name:string; value:number; color:string }>;
  recent_exports: Array<{ filename:string; date:string; size:string; format:'PDF'|'Excel'|'CSV' }>;
}

type WarehouseCapacityItem = ReportsDashboardResponse['warehouse_capacity_overview'][number];
type StockStatusItem = ReportsDashboardResponse['stock_status_overview'][number];
type ExportItem = { name:string; format:'PDF'|'Excel'|'CSV'; date:string; size:string };

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


// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: 'Available' }> = ({ status }) => {
  return (
    <span className="admin-badge inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
      <CheckCircle className="mr-1 h-3 w-3" />
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
    <span className={`admin-badge admin-report-format-badge inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${styles[format]}`}>
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
    <span className={`admin-badge inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
      {category}
    </span>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const Reports: React.FC = () => {
  const { theme } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<string>('inventory');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Available'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [warehouseChartData, setWarehouseChartData] = useState<WarehouseCapacityItem[]>([]);
  const [stockChartData, setStockChartData] = useState<StockStatusItem[]>([]);
  const [exportFiles, setExportFiles] = useState<ExportItem[]>([]);
  const [metrics, setMetrics] = useState<ReportsDashboardResponse['metrics'] | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type:'success'|'error'; text:string } | null>(null);
  const [isScheduleInfoOpen, setIsScheduleInfoOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const itemsPerPage = 10;
  const isDark = theme === 'dark';
  const chartGridColor = isDark ? '#1e293b' : '#E2E8F0';
  const chartAxisColor = '#64748B';
  const chartTooltipStyle = {
    backgroundColor: isDark ? '#0f172a' : '#FFFFFF',
    border: `1px solid ${isDark ? '#1e293b' : '#CBD5E1'}`,
    color: isDark ? '#fff' : '#0F172A',
    fontSize: '12px',
    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    borderRadius: '8px',
    padding: '10px',
  };

  const [isCustomReportOpen, setIsCustomReportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'raw' | 'custom'>('raw');
  const [reportTitle, setReportTitle] = useState('');
  const [reportCategory, setReportCategory] = useState('inventory');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportFormat, setExportFormat] = useState<'CSV'>('CSV');
  const [isGenerating, setIsGenerating] = useState(false);

  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [isViewDrawerOpen, setIsViewDrawerOpen] = useState(false);
  useAdminDetailOverlay(isViewDrawerOpen && selectedReport !== null);

  const fetchDashboard = useCallback(async (signal?: AbortSignal) => {
    setDashboardLoading(true);
    try {
      const { data } = await apiClient.get<ReportsDashboardResponse>('/admin/reports/dashboard', { signal });
      setMetrics(data.metrics);
      setReports(data.reports_list.map((report) => ({ id:report.id, name:report.name, description:report.description, category:report.category, lastGenerated:report.last_generated ? new Date(report.last_generated).toLocaleString() : 'Not generated', format:report.format, status:report.status, fileSize:report.file_size, parameters:report.parameters })));
      setWarehouseChartData(data.warehouse_capacity_overview);
      setStockChartData(data.stock_status_overview);
      setExportFiles(data.recent_exports.map((file) => ({ name:file.filename, format:file.format, date:new Date(file.date).toLocaleString(), size:file.size })));
      setDashboardError(null);
    } catch (error: any) {
      if (error?.code !== 'ERR_CANCELED') setDashboardError(error?.response?.data?.message || 'Unable to load reports dashboard.');
    } finally {
      if (!signal?.aborted) setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchDashboard(controller.signal);
    return () => controller.abort();
  }, [fetchDashboard]);

  const openDrawer = (report: ReportItem) => {
    setSelectedReport(report);
    setIsViewDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsViewDrawerOpen(false);
    setSelectedReport(null);
  };

  const openExportModal = (mode: 'raw' | 'custom') => {
    setExportMode(mode);
    setActionMessage(null);
    setIsCustomReportOpen(true);
  };

  const downloadReport = async (report: Pick<ReportItem, 'id' | 'name'>, options?: { startDate?:string; endDate?:string; name?:string }) => {
    if (downloadingId) return false;
    setDownloadingId(report.id);
    setActionMessage(null);
    try {
      const response = await apiClient.post('/admin/reports/export', {
        report_id: report.id,
        format: 'CSV',
        name: options?.name || report.name,
        start_date: options?.startDate || undefined,
        end_date: options?.endDate || undefined,
      }, { responseType: 'blob' });
      const disposition = String(response.headers['content-disposition'] ?? '');
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `${report.id}-${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setActionMessage({ type:'success', text:`${filename} downloaded.` });
      await fetchDashboard();
      return true;
    } catch (error: any) {
      setActionMessage({ type:'error', text:error?.response?.data?.message || 'Unable to export report data.' });
      return false;
    } finally {
      setDownloadingId(null);
    }
  };

  const generateReport = async () => {
    if (exportMode === 'custom' && !reportTitle.trim()) {
      setActionMessage({ type:'error', text:'Enter a report title.' });
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setActionMessage({ type:'error', text:'End date must be on or after the start date.' });
      return;
    }
    setIsGenerating(true);
    const reportIdMap: Record<string,string> = { inventory:'inventory-summary', 'stock-movement':'stock-movement', receiving:'receiving', shipment:'shipment', order:'order', procurement:'procurement' };
    const reportId = reportIdMap[reportCategory];
    try {
      const selectedDefinition = reports.find((report) => report.id === reportId);
      const exportName = exportMode === 'custom' ? reportTitle.trim() : (selectedDefinition?.name ?? reportId);
      const exported = await downloadReport({ id:reportId, name:exportName }, { name:exportName, startDate, endDate });
      if (!exported) return;
      setReportTitle('');
      setReportCategory('inventory');
      setStartDate('');
      setEndDate('');
      setExportFormat('CSV');
      setIsGenerating(false);
      setIsCustomReportOpen(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const resetForm = () => {
    setReportTitle('');
    setReportCategory('inventory');
    setStartDate('');
    setEndDate('');
    setExportFormat('CSV');
  };

  // Filter reports based on category and search
  const filteredReports = reports.filter(report => {
    const categoryMatch = selectedCategory === 'all' || report.category === reportCategories.find(c => c.id === selectedCategory)?.name;
    const searchMatch = report.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        report.description.toLowerCase().includes(searchTerm.toLowerCase());
    const statusMatch = statusFilter === 'all' || report.status === statusFilter;
    return categoryMatch && searchMatch && statusMatch;
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
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold text-white tracking-tight">Reports & Exports</h1>
          <p className="text-slate-400 text-sm mt-1">
            Generate printable reports, export warehouse data, monitor inventory analytics, and review operational performance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button onClick={() => openExportModal('raw')} className="inline-flex min-h-11 items-center gap-2 px-4 py-2 text-xs md:text-sm font-medium rounded-lg border border-slate-700 hover:bg-slate-800/50 text-slate-300 transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
            <Download className="w-4 h-4 shrink-0" />
            Export Data
          </button>
          <button onClick={() => setIsScheduleInfoOpen(true)} className="inline-flex min-h-11 items-center gap-2 px-4 py-2 text-xs md:text-sm font-medium rounded-lg border border-slate-700 hover:bg-slate-800/50 text-slate-300 transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
            <Calendar className="w-4 h-4 shrink-0" />
            Schedule Report
          </button>
          <button
            onClick={() => openExportModal('custom')}
            className="inline-flex min-h-11 items-center gap-2 px-4 py-2 text-xs md:text-sm font-medium rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
          >
            <Plus className="w-4 h-4 shrink-0" />
            Create Custom Report
          </button>
        </div>
      </div>

      {/* CUSTOM REPORT MODAL */}
      {isCustomReportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700/80 bg-white shadow-2xl dark:bg-[#0b101d]">
            <div className="flex items-center justify-between p-5 border-b border-slate-800/60">
              <h2 id="export-dialog-title" className="text-lg font-semibold text-slate-900 dark:text-white">{exportMode === 'custom' ? 'Create Custom Report' : 'Export Data'}</h2>
              <button
                onClick={() => { setIsCustomReportOpen(false); resetForm(); }}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {exportMode === 'custom' && <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Report Title</label>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder="e.g. Monthly Inventory Summary"
                  className="w-full bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>}

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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  {['CSV'].map((fmt) => (
                    <label key={fmt} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="exportFormat"
                        value={fmt}
                        checked={exportFormat === fmt}
                        onChange={() => setExportFormat(fmt as 'CSV')}
                        className="accent-cyan-500"
                      />
                      <span className="text-sm text-slate-300">{fmt}</span>
                    </label>
                  ))}
                </div>
              </div>

            </div>
            {actionMessage?.type === 'error' && <p role="alert" className="mx-5 mb-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{actionMessage.text}</p>}
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
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isGenerating ? (
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : null}
                {isGenerating ? 'Exporting...' : exportMode === 'custom' ? 'Generate & Download CSV' : 'Export CSV'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isScheduleInfoOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="schedule-info-title"><div className="w-full max-w-md rounded-2xl border border-slate-700 bg-white p-5 shadow-2xl dark:bg-[#0b101d]"><div className="flex items-start justify-between gap-3"><div><h2 id="schedule-info-title" className="font-semibold text-slate-900 dark:text-white">Scheduled reports unavailable</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">This project has no scheduled-report storage, queue job, scheduler command, or delivery service. No schedule was created.</p></div><button onClick={() => setIsScheduleInfoOpen(false)} aria-label="Close schedule information" className="min-h-11 min-w-11 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="mx-auto h-5 w-5" /></button></div></div></div>}

      {actionMessage && <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${actionMessage.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'}`}>{actionMessage.text}</div>}

      {/* KPI CARDS */}
      {dashboardError && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{dashboardError}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {[
          { label: 'Total Reports', value: metrics?.total_reports_available ?? 'N/A', subtitle: 'Available report definitions', icon: <FileText className="w-4 h-4 text-blue-400" /> },
          { label: 'Exports Today', value: metrics?.exports_today ?? 'N/A', subtitle: metrics?.exports_today === null ? 'Export history is not recorded' : 'Excel / PDF / CSV', icon: <Download className="w-4 h-4 text-emerald-400" /> },
          { label: 'Pending Reports', value: metrics?.pending_reports ?? 'N/A', subtitle: metrics?.pending_reports === null ? 'No scheduling workflow configured' : 'Awaiting generation', icon: <Clock className="w-4 h-4 text-amber-400" /> },
          { label: 'Generated Today', value: metrics?.generated_today ?? 'N/A', subtitle: metrics?.generated_today === null ? 'Generation history is not recorded' : 'All reports', icon: <CheckCircle className="w-4 h-4 text-cyan-400" /> },
          { label: metrics?.warehouse_capacity.total ? 'Warehouse Capacity' : 'Total Stock Units', value: metrics?.warehouse_capacity.total ? `${metrics.warehouse_capacity.utilization_percentage}%` : (metrics?.total_stock_units ?? 'N/A'), subtitle: metrics?.warehouse_capacity.total ? `${metrics.warehouse_capacity.used.toLocaleString()} / ${metrics.warehouse_capacity.total.toLocaleString()} units` : 'Capacity configuration unavailable', icon: <WarehouseIcon className="w-4 h-4 text-purple-400" /> },
          { label: 'AI Forecast Accuracy', value: metrics?.ai_forecast_accuracy === null || metrics?.ai_forecast_accuracy === undefined ? 'N/A' : `${metrics.ai_forecast_accuracy}%`, subtitle: metrics?.ai_forecast_accuracy === null ? 'No measured forecast results' : 'Measured forecast performance', icon: <TrendingUp className="w-4 h-4 text-rose-400" /> },
        ].map((kpi, idx) => (
          <div key={idx} className="min-h-32 bg-[#0b101d] border border-slate-800/80 rounded-xl p-5 flex flex-col justify-between hover:border-slate-700 transition-colors">
            <div className="flex items-start justify-between">
              <div className="p-2 rounded-lg border border-slate-700/50 bg-slate-800/50">
                {kpi.icon}
              </div>
            </div>
            <div className="mt-4">
              <p className="admin-kpi-value text-xl font-bold text-white">{dashboardLoading ? '—' : kpi.value}</p>
              <p className="admin-kpi-title mt-1 text-xs font-medium uppercase tracking-wider text-slate-300">{kpi.label}</p>
              <p className="admin-kpi-helper text-xs text-slate-500 mt-1">{kpi.subtitle}</p>
            </div>
          </div>
        ))}
      </div>

      {/* MAIN BODY: CATEGORIES + TABLE */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* LEFT COLUMN: Categories */}
        <div className="xl:col-span-1 bg-[#0b101d] border border-slate-800/80 rounded-xl p-5 space-y-2 self-start">
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
                className={`w-full min-h-11 text-left px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
                  isActive
                    ? 'border border-slate-200 bg-slate-200 text-slate-900 dark:border-cyan-500/60 dark:bg-cyan-500/10 dark:text-cyan-300'
                    : 'border border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                {cat.icon}
                {cat.name}
              </button>
            );
          })}
        </div>

        {/* RIGHT COLUMN: Search, Filters & Table */}
        <div className="xl:col-span-3 space-y-5 min-w-0">
          {/* Top Controls */}
          <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 items-center gap-3">
              {/* Search */}
              <div className="relative sm:col-span-2 xl:col-span-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search reports..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full min-h-11 bg-[#070a12] border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>

              <select aria-label="Report category" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="min-h-11 xl:col-span-2 bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                <option value="all">All Categories</option>
                {reportCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>

              <select aria-label="Warehouse" disabled title="Report definitions are not warehouse-specific" className="min-h-11 xl:col-span-2 bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-60">
                <option>All Warehouses</option>
                {warehouseChartData.map((warehouse) => <option key={warehouse.name}>{warehouse.name}</option>)}
              </select>

              <div title="Generation history is not recorded" className="min-h-11 sm:col-span-2 xl:col-span-4 flex items-center justify-between gap-2 bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-500">
                <Calendar className="w-4 h-4 text-slate-500" />
                <span>Generation dates unavailable</span>
                <AlertCircle className="w-4 h-4 text-slate-500" />
              </div>

              <select aria-label="Report status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | 'Available')} className="min-h-11 xl:col-span-2 bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                <option value="all">All Status</option>
                <option value="Available">Available</option>
              </select>

            </div>
          </div>

          {/* Report Table */}
          <div className="admin-reports-table-shell bg-[#0b101d] border border-slate-800/80 rounded-xl overflow-hidden">
            <div className="admin-table-scroll w-full">
              <table className="admin-reports-table admin-responsive-table admin-cols-7 admin-sticky-1 w-full min-w-[1050px] table-auto text-left border-collapse text-sm">
                <thead className="bg-[#070a12] border-b border-slate-800/50">
                  <tr>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-300">Report Name</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-300">Description</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-300">Category</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-300">Last Generated</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-300">Format</th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-300">Status</th>
                    <th className="w-28 min-w-28 px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {dashboardLoading ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading reports…</td></tr> : paginatedReports.map((report) => (
                    <tr key={report.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-4 font-medium text-white">{report.name}</td>
                      <td className="px-4 py-4 text-slate-400 max-w-[220px] truncate">{report.description}</td>
                      <td className="px-4 py-4"><CategoryBadge category={report.category} /></td>
                      <td className="px-4 py-4 text-slate-300 text-xs whitespace-nowrap">{report.lastGenerated}</td>
                      <td className="px-4 py-4"><FormatBadge format={report.format} /></td>
                      <td className="px-4 py-4"><StatusBadge status={report.status} /></td>
                      <td className="w-28 min-w-28 px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => openDrawer(report)} aria-label={`View ${report.name}`} className="min-w-9 min-h-9 p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button onClick={() => void downloadReport(report)} disabled={downloadingId !== null} aria-label={`Download ${report.name}`} className="min-w-9 min-h-9 p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-50">
                            <Download className="w-4 h-4" />
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
            <div className="admin-reports-pagination flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-4 border-t border-slate-800/80 bg-[#070a12]/50">
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
                        ? 'bg-slate-200 text-slate-900 dark:bg-cyan-500 dark:text-slate-950'
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Warehouse Capacity Overview */}
        <div className="min-h-[320px] bg-[#0b101d] border border-slate-800/80 rounded-xl p-5 flex flex-col">
          <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <WarehouseIcon className="w-4 h-4 text-cyan-400" />
            Warehouse Capacity Overview
          </h4>
          <p className="mb-5 text-xs text-slate-500">Physical stock uses available plus reserved quantities for active warehouses.</p>
          <div className="flex-1 space-y-5" aria-live="polite">
            {dashboardLoading && <div className="flex h-full items-center justify-center text-xs text-slate-500">Loading warehouse capacity…</div>}
            {!dashboardLoading && warehouseChartData.length === 0 && <div className="flex h-full items-center justify-center text-xs text-slate-500">No active warehouses found.</div>}
            {!dashboardLoading && warehouseChartData.map((item) => (
              <div key={item.code}>
                <div className="mb-2 flex items-start justify-between gap-4 text-xs">
                  <div className="min-w-0"><p className="truncate font-medium text-slate-200">{item.name}</p><p className="text-slate-500">{item.code}</p></div>
                  <div className="shrink-0 text-right"><p className="font-semibold text-white">{item.utilization_percentage === null ? 'Capacity N/A' : `${item.utilization_percentage}%`}</p><p className="text-slate-500">{item.used.toLocaleString()} used{item.capacity === null ? '' : ` / ${item.capacity.toLocaleString()}`}</p></div>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="img" aria-label={`${item.name}: ${item.utilization_percentage === null ? 'capacity not configured' : `${item.utilization_percentage}% utilized`}`}>
                  <div className="h-full rounded-full bg-cyan-500 transition-[width] duration-500" style={{ width: `${item.utilization_percentage ?? 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stock Status Overview - Bar Chart */}
        <div className="min-h-[320px] bg-[#0b101d] border border-slate-800/80 rounded-xl p-5 flex flex-col">
          <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            Stock Status Overview
          </h4>
          <div className="flex-1 min-h-[240px]">
            {!dashboardLoading && stockChartData.every((item) => item.value === 0) && <div className="h-full flex items-center justify-center text-xs text-slate-500">No stock data.</div>}
            {(dashboardLoading || stockChartData.some((item) => item.value > 0)) && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockChartData} layout="vertical" margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} horizontal={false} />
                <XAxis type="number" stroke={chartAxisColor} tick={{ fill: chartAxisColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" stroke={chartAxisColor} tick={{ fill: chartAxisColor, fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip contentStyle={chartTooltipStyle} />
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
        <div className="min-h-[280px] bg-[#0b101d] border border-slate-800/80 rounded-xl p-5 flex flex-col">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              Recent Exports
            </h4>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto max-h-[240px] pr-1">
            {exportFiles.slice(0, 4).map((file, idx) => (
              <div key={idx} className="flex items-center justify-between gap-3 text-xs border-b border-slate-800/60 pb-3">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 truncate">{file.name}</p>
                  <p className="text-slate-500">{file.date} · {file.size}</p>
                </div>
                <button className="ml-2 p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {!dashboardLoading && exportFiles.length === 0 && <p className="py-6 text-center text-xs text-slate-500">No recent exports.</p>}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="min-h-[280px] bg-[#0b101d] border border-slate-800/80 rounded-xl p-5 flex flex-col">
          <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            Quick Actions
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
            <button onClick={() => openExportModal('custom')} className="flex w-full items-center gap-3 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"><Plus className="h-4 w-4" />Create Custom Report</button>
            <button onClick={() => setIsScheduleInfoOpen(true)} className="flex w-full items-center gap-3 rounded-lg border border-slate-700 px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/50 hover:text-white"><Calendar className="h-4 w-4" />Schedule Report</button>
            <button onClick={() => openExportModal('raw')} className="flex w-full items-center gap-3 rounded-lg border border-slate-700 px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/50 hover:text-white"><Download className="h-4 w-4" />Export Raw Data</button>
          </div>
        </div>
      </div>

      {/* VIEW REPORT DRAWER */}
      {isViewDrawerOpen && selectedReport && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={closeDrawer} />
          <div className="admin-report-details-drawer relative ml-auto h-full w-full max-w-lg bg-[#0b101d] border-l border-slate-700/80 shadow-2xl flex flex-col">
            {/* Drawer Header */}
            <div className="admin-report-details-header flex items-center justify-between p-5 border-b border-slate-800/60 shrink-0">
              <div className="admin-report-details-heading flex items-center gap-3 min-w-0">
                <h2 className="admin-report-details-title text-lg font-semibold text-white truncate">{selectedReport.name}</h2>
                <span className="admin-report-details-status"><StatusBadge status={selectedReport.status} /></span>
              </div>
              <button
                onClick={closeDrawer}
                aria-label="Close report details"
                className="admin-report-details-close p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="admin-report-details-body flex-1 overflow-y-auto p-5 space-y-5">
              {/* Key Information Grid */}
              <div className="admin-report-details-grid grid grid-cols-2 gap-4">
                <div className="admin-report-details-card bg-[#070a12] border border-slate-800/80 rounded-xl p-3">
                  <p className="admin-report-details-label text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Category</p>
                  <p className="admin-report-details-value text-sm text-slate-200 truncate">{selectedReport.category}</p>
                </div>
                <div className="admin-report-details-card bg-[#070a12] border border-slate-800/80 rounded-xl p-3">
                  <p className="admin-report-details-label text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Format</p>
                  <div className="admin-report-details-format mt-1">
                    <FormatBadge format={selectedReport.format} />
                  </div>
                </div>
                <div className="admin-report-details-card bg-[#070a12] border border-slate-800/80 rounded-xl p-3">
                  <p className="admin-report-details-label text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Last Generated</p>
                  <p className="admin-report-details-value text-sm text-slate-200">{selectedReport.lastGenerated}</p>
                </div>
                <div className="admin-report-details-card bg-[#070a12] border border-slate-800/80 rounded-xl p-3">
                  <p className="admin-report-details-label text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">File Size</p>
                  <p className="admin-report-details-value text-sm text-slate-200">{selectedReport.fileSize}</p>
                </div>
                <div className="admin-report-details-card col-span-2 bg-[#070a12] border border-slate-800/80 rounded-xl p-3">
                  <p className="admin-report-details-label text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Description</p>
                  <p className="admin-report-details-value text-sm text-slate-300">{selectedReport.description}</p>
                </div>
                <div className="admin-report-details-card col-span-2 bg-[#070a12] border border-slate-800/80 rounded-xl p-3">
                  <p className="admin-report-details-label text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Parameters</p>
                  <p className="admin-report-details-value text-sm text-slate-300">{selectedReport.parameters}</p>
                </div>
              </div>

              {/* Report History / Summary */}
              <div className="admin-report-details-history-row">
                <div className="admin-report-details-history bg-[#070a12] border border-slate-800/80 rounded-xl p-4">
                  <h3 className="admin-report-details-label text-xs font-semibold text-white uppercase tracking-wider mb-3">Report History</h3>
                  <p className="admin-report-details-history-text text-xs leading-5 text-slate-500">Generation, download, and print events are not currently recorded by the reporting service.</p>
                </div>
                <button onClick={() => void downloadReport(selectedReport)} disabled={downloadingId !== null} className="admin-report-details-download admin-report-details-mobile-action hidden inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50">
                  <Download className="w-4 h-4" />
                  {downloadingId === selectedReport.id ? 'Generating…' : 'Download CSV'}
                </button>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="admin-report-details-footer p-5 border-t border-slate-800/60 flex items-center gap-3 shrink-0">
              <button onClick={() => void downloadReport(selectedReport)} disabled={downloadingId !== null} className="admin-report-details-download flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50">
                <Download className="w-4 h-4" />
                {downloadingId === selectedReport.id ? 'Generating…' : 'Download CSV'}
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
