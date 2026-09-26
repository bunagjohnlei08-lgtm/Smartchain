// src/pages/admin/Reports.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Ban,
  RotateCw,
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
import ReportPreviewDrawer from './reports/ReportPreviewDrawer';
import ReportExportModal, { type ExportMode } from './reports/ReportExportModal';
import ReportScheduleModal from './reports/ReportScheduleModal';
import { StatusPill } from './reports/ReportTable';
import {
  downloadReport, errorMessage, formatBytes, formatDateTime, FORMAT_LABELS,
  type ReportDefinition, type ReportFormat, type ReportHistoryItem, type ReportOptions, type SchedulerState,
} from './reports/reportApi';

// ============================================
// TYPES
// ============================================

interface Category {
  id: string;
  name: string;
  icon: React.ReactNode;
}

interface ReportsDashboardResponse {
  metrics: {
    total_reports_available: number;
    total_report_definitions: number;
    exports_today: number;
    pending_reports: number;
    generated_today: number;
    last_generated_at: string | null;
    warehouse_capacity: { used: number; total: number | null; utilization_percentage: number | null };
    total_stock_units: number;
    ai_forecast_accuracy: number | null;
  };
  reports_list: ReportDefinition[];
  warehouse_capacity_overview: Array<{ name: string; code: string; used: number; capacity: number | null; available: number | null; utilization_percentage: number | null; alert_level: string; color: string }>;
  stock_status_overview: Array<{ name: string; value: number; color: string }>;
  recent_exports: ReportHistoryItem[];
  scheduler: SchedulerState;
}

type WarehouseCapacityItem = ReportsDashboardResponse['warehouse_capacity_overview'][number];
type StockStatusItem = ReportsDashboardResponse['stock_status_overview'][number];
type DefinitionStatus = 'all' | 'Available' | 'Scheduled' | 'Unavailable';

// ============================================
// CATEGORIES
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
const categoryOptions = reportCategories.map((category) => ({ id: category.id, label: category.name }));

// ============================================
// HELPER COMPONENTS
// ============================================

const definitionStatus = (report: ReportDefinition): Exclude<DefinitionStatus, 'all'> =>
  !report.available ? 'Unavailable' : report.active_schedules > 0 ? 'Scheduled' : 'Available';

const StatusBadge: React.FC<{ status: Exclude<DefinitionStatus, 'all'> }> = ({ status }) => {
  const styles = {
    Available: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    Scheduled: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
    Unavailable: 'border-slate-500/20 bg-slate-500/10 text-slate-500 dark:text-slate-400',
  };
  const Icon = status === 'Unavailable' ? Ban : status === 'Scheduled' ? Calendar : CheckCircle;
  return (
    <span className={`admin-badge inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium sm:text-[11px] ${styles[status]}`}>
      <Icon className="mr-1 h-3 w-3" />
      {status}
    </span>
  );
};

const FormatBadge: React.FC<{ format: ReportFormat }> = ({ format }) => {
  const styles: Record<ReportFormat, string> = {
    PDF: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    XLSX: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    CSV: 'text-white dark:text-slate-400 bg-slate-500/10 border-slate-500/20',
  };
  return (
    <span className={`admin-badge admin-report-format-badge inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium border ${styles[format]}`}>
      {FORMAT_LABELS[format]}
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
    // The column is already titled "Category", so the " Reports" suffix is dropped to fit the badge.
    <span title={category} className={`admin-badge inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium border ${color}`}>
      {category.replace(/ Reports$/, '')}
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
  const [statusFilter, setStatusFilter] = useState<DefinitionStatus>('all');
  const [formatFilter, setFormatFilter] = useState<'all' | ReportFormat>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [warehouseChartData, setWarehouseChartData] = useState<WarehouseCapacityItem[]>([]);
  const [stockChartData, setStockChartData] = useState<StockStatusItem[]>([]);
  const [recentExports, setRecentExports] = useState<ReportHistoryItem[]>([]);
  const [metrics, setMetrics] = useState<ReportsDashboardResponse['metrics'] | null>(null);
  const [options, setOptions] = useState<ReportOptions | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [previewReport, setPreviewReport] = useState<ReportDefinition | null>(null);
  const [exportModal, setExportModal] = useState<{ mode: ExportMode; reportKey?: string } | null>(null);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
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

  useAdminDetailOverlay(previewReport !== null || exportModal !== null || isScheduleOpen);

  const fetchDashboard = useCallback(async (signal?: AbortSignal, silent = false) => {
    if (!silent) setDashboardLoading(true);
    try {
      const { data } = await apiClient.get<ReportsDashboardResponse>('/admin/reports/dashboard', { signal });
      setMetrics(data.metrics);
      setReports(data.reports_list);
      setWarehouseChartData(data.warehouse_capacity_overview);
      setStockChartData(data.stock_status_overview);
      setRecentExports(data.recent_exports);
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
    apiClient.get<ReportOptions>('/admin/reports/options', { signal: controller.signal })
      .then(({ data }) => setOptions(data))
      .catch(() => { /* filters fall back to "All"; the preview still works */ });
    return () => controller.abort();
  }, [fetchDashboard]);

  useEffect(() => { setCurrentPage(1); }, [selectedCategory, searchTerm, statusFilter, formatFilter]);

  const handleGenerated = useCallback((message: string | null) => {
    if (message) setActionMessage({ type: 'success', text: message });
    void fetchDashboard(undefined, true);
  }, [fetchDashboard]);

  const quickDownload = async (report: ReportDefinition) => {
    const format = report.formats[0];
    if (!format || downloadingKey) return;
    setDownloadingKey(report.key);
    setActionMessage(null);
    try {
      const result = await downloadReport({ report_key: report.key, format });
      handleGenerated(`${result.filename} downloaded${Number.isFinite(result.rows) ? ` (${result.rows.toLocaleString()} records)` : ''}.`);
    } catch (error) {
      setActionMessage({ type: 'error', text: await errorMessage(error, 'Unable to export report data.') });
      handleGenerated(null);
    } finally {
      setDownloadingKey(null);
    }
  };

  const regenerate = async (item: ReportHistoryItem) => {
    if (!item.format || downloadingKey) return;
    setDownloadingKey(`history-${item.id}`);
    setActionMessage(null);
    try {
      const result = await downloadReport({ report_key: item.report_key, format: item.format, ...item.filters });
      handleGenerated(`${result.filename} regenerated with the same filters.`);
    } catch (error) {
      setActionMessage({ type: 'error', text: await errorMessage(error, 'Unable to regenerate this export.') });
      handleGenerated(null);
    } finally {
      setDownloadingKey(null);
    }
  };

  const categoryCounts = useMemo(() => reports.reduce<Record<string, number>>((counts, report) => {
    counts[report.category] = (counts[report.category] ?? 0) + 1;
    return counts;
  }, {}), [reports]);

  const filteredReports = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return reports.filter((report) => {
      const categoryMatch = selectedCategory === 'all' || report.category === selectedCategory;
      const searchMatch = !term || [report.name, report.description, report.category_label].some((value) => value.toLowerCase().includes(term));
      const status = definitionStatus(report);
      const statusMatch = statusFilter === 'all' || status === statusFilter;
      const formatMatch = formatFilter === 'all' || report.formats.includes(formatFilter);
      return categoryMatch && searchMatch && statusMatch && formatMatch;
    });
  }, [reports, selectedCategory, searchTerm, statusFilter, formatFilter]);

  const totalItems = filteredReports.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const paginatedReports = filteredReports.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const historyAvailable = (item: ReportHistoryItem) => reports.some((report) => report.key === item.report_key && report.available && item.format !== null && report.formats.includes(item.format));

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  return (
    <div className="w-full min-w-0 min-h-screen bg-[#070a12] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 overflow-x-hidden">

      {/* HEADER */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold text-white tracking-tight">Reports & Exports</h1>
          <p className="text-slate-400 text-sm mt-1">
            Preview and export live SmartChain data by category, schedule recurring reports, and review generation history.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button onClick={() => setExportModal({ mode: 'STANDARD' })} className="inline-flex min-h-11 cursor-pointer items-center gap-2 px-4 py-2 text-xs md:text-sm font-medium rounded-lg border border-slate-700 hover:bg-slate-800/50 text-slate-300 transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
            <Download className="w-4 h-4 shrink-0" />
            Export Data
          </button>
          <button onClick={() => setIsScheduleOpen(true)} className="inline-flex min-h-11 cursor-pointer items-center gap-2 px-4 py-2 text-xs md:text-sm font-medium rounded-lg border border-slate-700 hover:bg-slate-800/50 text-slate-300 transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
            <Calendar className="w-4 h-4 shrink-0" />
            Schedule Report
          </button>
          <button
            onClick={() => setExportModal({ mode: 'CUSTOM' })}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 px-4 py-2 text-xs md:text-sm font-medium rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
          >
            <Plus className="w-4 h-4 shrink-0" />
            Create Custom Report
          </button>
        </div>
      </div>

      {actionMessage && <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${actionMessage.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'}`}>{actionMessage.text}</div>}

      {/* KPI CARDS */}
      {dashboardError && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{dashboardError}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {[
          { label: 'Total Reports', value: metrics?.total_reports_available ?? 'N/A', subtitle: metrics ? `${metrics.total_reports_available} available of ${metrics.total_report_definitions} definitions` : 'Report definitions', icon: <FileText className="w-4 h-4 text-blue-400" /> },
          { label: 'Exports Today', value: metrics?.exports_today ?? 'N/A', subtitle: 'Successful file downloads today', icon: <Download className="w-4 h-4 text-emerald-400" /> },
          { label: 'Pending Reports', value: metrics?.pending_reports ?? 'N/A', subtitle: 'Active schedules awaiting next run', icon: <Clock className="w-4 h-4 text-amber-400" /> },
          { label: 'Generated Today', value: metrics?.generated_today ?? 'N/A', subtitle: metrics?.last_generated_at ? `Last generated ${formatDateTime(metrics.last_generated_at)}` : 'No reports generated yet', icon: <CheckCircle className="w-4 h-4 text-cyan-400" /> },
          { label: metrics?.warehouse_capacity.total ? 'Warehouse Capacity' : 'Total Stock Units', value: metrics?.warehouse_capacity.total ? `${metrics.warehouse_capacity.utilization_percentage}%` : (metrics?.total_stock_units ?? 'N/A'), subtitle: metrics?.warehouse_capacity.total ? `${metrics.warehouse_capacity.used.toLocaleString()} / ${metrics.warehouse_capacity.total.toLocaleString()} units` : 'Capacity configuration unavailable', icon: <WarehouseIcon className="w-4 h-4 text-purple-400" /> },
          { label: 'AI Forecast Accuracy', value: metrics?.ai_forecast_accuracy === null || metrics?.ai_forecast_accuracy === undefined ? 'N/A' : `${metrics.ai_forecast_accuracy}%`, subtitle: metrics?.ai_forecast_accuracy == null ? 'No measured forecast results' : 'Measured forecast performance', icon: <TrendingUp className="w-4 h-4 text-rose-400" /> },
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
        <nav aria-label="Report categories" className="min-w-0 xl:col-span-1 bg-[#0b101d] border border-slate-800/80 rounded-xl p-5 space-y-2 self-start">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-cyan-400" />
            Report Categories
          </h3>
          {[{ id: 'all', name: 'All Reports', icon: <FileText className="w-4 h-4" /> }, ...reportCategories].map((cat) => {
            const isActive = selectedCategory === cat.id;
            const count = cat.id === 'all' ? reports.length : (categoryCounts[cat.id] ?? 0);
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                aria-current={isActive ? 'true' : undefined}
                className={`w-full min-h-11 cursor-pointer text-left px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
                  isActive
                    ? 'border border-slate-200 bg-slate-200 text-slate-900 dark:border-cyan-500/60 dark:bg-cyan-500/10 dark:text-cyan-300'
                    : 'border border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                {cat.icon}
                <span className="min-w-0 flex-1 truncate">{cat.name}</span>
                <span className="shrink-0 text-xs tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </nav>

        {/* RIGHT COLUMN: Search, Filters & Table */}
        <div className="xl:col-span-3 space-y-5 min-w-0">
          {/* Top Controls */}
          <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 items-center gap-3">
              <div className="relative sm:col-span-2 xl:col-span-5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="search"
                  aria-label="Search reports"
                  placeholder="Search reports..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full min-h-11 bg-[#070a12] border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>

              <select aria-label="Report category" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="min-h-11 xl:col-span-3 bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                <option value="all">All Categories</option>
                {reportCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>

              <select aria-label="Export format" value={formatFilter} onChange={(event) => setFormatFilter(event.target.value as 'all' | ReportFormat)} className="min-h-11 xl:col-span-2 bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                <option value="all">All Formats</option>
                {(['CSV', 'XLSX', 'PDF'] as ReportFormat[]).map((format) => <option key={format} value={format}>{FORMAT_LABELS[format]}</option>)}
              </select>

              <select aria-label="Report availability" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as DefinitionStatus)} className="min-h-11 sm:col-span-2 xl:col-span-2 bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                <option value="all">All Status</option>
                <option value="Available">Available</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Unavailable">Unavailable</option>
              </select>
            </div>
          </div>

          {selectedCategory === 'ai-forecast' && (
            <div role="note" className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">AI Forecast Reports</p>
                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">No forecast results are available yet. Status: <strong>Unavailable / Not generated</strong>. Preview and export stay disabled until the forecasting service persists real results.</p>
              </div>
            </div>
          )}

          {/* Report Table */}
          <div className="admin-reports-table-shell bg-[#0b101d] border border-slate-800/80 rounded-xl overflow-hidden">
            <div className="admin-table-scroll w-full max-w-full overflow-x-auto overscroll-x-contain">
              <table className="admin-reports-table admin-sticky-1 w-full min-w-[830px] table-fixed text-left border-collapse">
                <colgroup>
                  <col /><col className="w-[144px]" /><col className="w-[176px]" /><col className="w-[110px]" /><col className="w-[112px]" /><col className="w-[88px]" />
                </colgroup>
                <thead className="bg-[#070a12] border-b border-slate-800/50">
                  <tr>
                    {['Report', 'Category', 'Last Generated', 'Formats', 'Status'].map((heading) => (
                      <th key={heading} scope="col" className="whitespace-nowrap px-4 py-3 text-left text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-300">{heading}</th>
                    ))}
                    <th scope="col" className="px-4 py-3 text-center text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {dashboardLoading && reports.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">Loading reports…</td></tr> : paginatedReports.map((report) => {
                    const status = definitionStatus(report);
                    return (
                      <tr key={report.key} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="truncate text-xs font-medium text-white md:text-sm" title={report.name}>{report.name}</p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-400 md:text-xs" title={report.unavailable_reason ?? report.description}>{report.unavailable_reason ?? report.description}</p>
                        </td>
                        <td className="px-4 py-3"><CategoryBadge category={report.category_label} /></td>
                        <td className="truncate whitespace-nowrap px-4 py-3 text-xs text-slate-300" title={report.last_generated_at ? formatDateTime(report.last_generated_at) : undefined}>{report.available ? (report.last_generated_at ? formatDateTime(report.last_generated_at) : 'Not generated') : 'Not generated'}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {report.formats.length === 0 ? <span className="text-xs text-slate-500">—</span> : report.formats.map((format) => <FormatBadge key={format} format={format} />)}
                          </div>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={status} /></td>
                        <td className="px-2 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setPreviewReport(report)} disabled={!report.available} aria-label={`Preview ${report.name}`} title={report.available ? 'Preview with filters' : report.unavailable_reason ?? 'Unavailable'} className="min-w-9 min-h-9 cursor-pointer p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-40">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => void quickDownload(report)} disabled={!report.available || downloadingKey !== null} aria-label={`Download ${report.name}${report.formats[0] ? ` as ${FORMAT_LABELS[report.formats[0]]}` : ''}`} title={report.available ? `Download ${FORMAT_LABELS[report.formats[0]]} (all records)` : report.unavailable_reason ?? 'Unavailable'} className="min-w-9 min-h-9 cursor-pointer p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-40">
                              {downloadingKey === report.key ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!dashboardLoading && paginatedReports.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">
                        No reports match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="admin-reports-pagination flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-4 border-t border-slate-800/80 bg-[#070a12]/50">
              <div className="text-xs sm:text-sm text-slate-400">
                {totalItems === 0 ? 'No reports' : `Showing ${((currentPage - 1) * itemsPerPage) + 1} to ${Math.min(currentPage * itemsPerPage, totalItems)} of ${totalItems} reports`}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                  className="min-h-9 min-w-9 cursor-pointer p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="mx-auto w-4 h-4 rotate-180" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    aria-current={currentPage === page ? 'page' : undefined}
                    className={`min-h-9 min-w-9 cursor-pointer px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
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
                  aria-label="Next page"
                  className="min-h-9 min-w-9 cursor-pointer p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="mx-auto w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM ANALYTICS & QUICK ACTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Warehouse Capacity Overview */}
        <div className="min-w-0 min-h-[320px] bg-[#0b101d] border border-slate-800/80 rounded-xl p-5 flex flex-col">
          <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <WarehouseIcon className="w-4 h-4 text-cyan-400" />
            Warehouse Capacity Overview
          </h4>
          <p className="mb-5 text-xs text-slate-500">Physical stock uses available plus reserved quantities for active warehouses.</p>
          <div className="flex-1 space-y-5" aria-live="polite">
            {dashboardLoading && warehouseChartData.length === 0 && <div className="flex h-full items-center justify-center text-xs text-slate-500">Loading warehouse capacity…</div>}
            {!dashboardLoading && warehouseChartData.length === 0 && <div className="flex h-full items-center justify-center text-xs text-slate-500">No active warehouses found.</div>}
            {warehouseChartData.map((item) => (
              <div key={item.code}>
                <div className="mb-2 flex items-start justify-between gap-4 text-xs">
                  <div className="min-w-0"><p className="truncate font-medium text-slate-200">{item.name}</p><p className="flex items-center gap-2 text-slate-500">{item.code}{item.alert_level !== 'NORMAL' && <StatusPill value={item.alert_level} />}</p></div>
                  <div className="shrink-0 text-right"><p className="font-semibold text-white">{item.utilization_percentage === null ? 'Capacity N/A' : `${item.utilization_percentage}%`}</p><p className="text-slate-500">{item.used.toLocaleString()} used{item.capacity === null ? '' : ` / ${item.capacity.toLocaleString()}`}</p></div>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="img" aria-label={`${item.name}: ${item.utilization_percentage === null ? 'capacity not configured' : `${item.utilization_percentage}% utilized`}`}>
                  <div className={`h-full rounded-full transition-[width] duration-500 ${item.alert_level === 'FULL' ? 'bg-red-500' : item.alert_level === 'WARNING' ? 'bg-amber-500' : 'bg-cyan-500'}`} style={{ width: `${item.utilization_percentage ?? 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stock Status Overview - Bar Chart */}
        <div className="min-w-0 min-h-[320px] bg-[#0b101d] border border-slate-800/80 rounded-xl p-5 flex flex-col">
          <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            Stock Status Overview
          </h4>
          <p className="mb-3 text-xs text-slate-500">Inventory records by reorder level: out of stock at zero, low stock at or below the reorder level.</p>
          <div className="flex-1 min-h-[200px]">
            {!dashboardLoading && stockChartData.every((item) => item.value === 0) && <div className="h-full flex items-center justify-center text-xs text-slate-500">No stock data.</div>}
            {stockChartData.some((item) => item.value > 0) && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockChartData} layout="vertical" margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} horizontal={false} />
                <XAxis type="number" allowDecimals={false} stroke={chartAxisColor} tick={{ fill: chartAxisColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" stroke={chartAxisColor} tick={{ fill: chartAxisColor, fontSize: 10 }} axisLine={false} tickLine={false} width={72} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="value" name="Inventory records" fill="#3b82f6" radius={[0, 4, 4, 0]} isAnimationActive={true} animationDuration={800} animationEasing="ease-in-out">
                  {stockChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            {stockChartData.map((item) => (
              <div key={item.name} className="rounded-lg border border-slate-800/80 bg-[#070a12] px-2 py-1.5">
                <dt className="flex items-center justify-center gap-1.5 text-slate-500"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />{item.name}</dt>
                <dd className="font-semibold tabular-nums text-white">{item.value.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Recent Exports */}
        <div className="min-w-0 min-h-[280px] bg-[#0b101d] border border-slate-800/80 rounded-xl p-5 flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              Recent Exports
            </h4>
            <span className="text-[11px] text-slate-500">Newest first</span>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto max-h-[300px] pr-1">
            {recentExports.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 text-xs border-b border-slate-800/60 pb-3">
                <div className="flex-1 min-w-0">
                  <p className="flex items-center gap-2 text-slate-200">
                    <span className="truncate" title={item.file_name ?? item.report_name}>{item.file_name ?? item.report_name}</span>
                    {item.format && <FormatBadge format={item.format} />}
                  </p>
                  <p className="mt-0.5 text-slate-500">
                    {formatDateTime(item.generated_at)} · {item.status === 'SUCCESS' ? `${(item.row_count ?? 0).toLocaleString()} records · ${formatBytes(item.file_size)}` : <span className="text-red-500">{item.error_message ?? 'Failed'}</span>}
                    {item.generated_by && ` · ${item.generated_by}`}
                  </p>
                </div>
                {item.status === 'FAILED' && <StatusPill value="FAILED" />}
                <button onClick={() => void regenerate(item)} disabled={!historyAvailable(item) || downloadingKey !== null} aria-label={`Download ${item.report_name} again with the same filters`} title="Regenerates the export with the same filters using current data" className="min-h-9 min-w-9 shrink-0 cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-700 dark:hover:text-white">
                  {downloadingKey === `history-${item.id}` ? <RotateCw className="mx-auto w-3.5 h-3.5 animate-spin" /> : <Download className="mx-auto w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
            {!dashboardLoading && recentExports.length === 0 && <p className="py-6 text-center text-xs text-slate-500">No exports yet. Downloaded reports appear here.</p>}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="min-w-0 min-h-[280px] bg-[#0b101d] border border-slate-800/80 rounded-xl p-5 flex flex-col">
          <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            Quick Actions
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button onClick={() => setExportModal({ mode: 'CUSTOM' })} className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"><Plus className="h-4 w-4" />Create Custom Report</button>
            <button onClick={() => setIsScheduleOpen(true)} className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border border-slate-700 px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/50 hover:text-white"><Calendar className="h-4 w-4" />Schedule Report</button>
            <button onClick={() => setExportModal({ mode: 'RAW' })} className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border border-slate-700 px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/50 hover:text-white"><Download className="h-4 w-4" />Export Raw Data</button>
          </div>
          {/* Scheduler infrastructure warning intentionally hidden from Admin UI.
              Restore here if scheduled delivery is enabled/configured in production. */}
        </div>
      </div>

      {previewReport && (
        <ReportPreviewDrawer definition={previewReport} options={options} onClose={() => setPreviewReport(null)} onGenerated={handleGenerated} />
      )}
      {exportModal && (
        <ReportExportModal
          mode={exportModal.mode}
          definitions={reports}
          categories={categoryOptions}
          options={options}
          initialCategory={selectedCategory}
          initialReportKey={exportModal.reportKey}
          onClose={() => setExportModal(null)}
          onGenerated={handleGenerated}
        />
      )}
      {isScheduleOpen && (
        <ReportScheduleModal
          definitions={reports}
          categories={categoryOptions}
          options={options}
          initialCategory={selectedCategory}
          onClose={() => setIsScheduleOpen(false)}
          onChanged={() => void fetchDashboard(undefined, true)}
        />
      )}

      <div className="text-center text-xs text-slate-500 pt-4 border-t border-slate-800/60">
        © 2026 SmartChain. All rights reserved.
      </div>
    </div>
  );
};

export default Reports;
