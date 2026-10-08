import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, BarChart3, CheckCircle, ChevronRight, Download, Eye, FileSpreadsheet, Package, Printer, RefreshCw, Search, TrendingDown, TrendingUp, Truck, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiClient } from '../../lib/api';
import CompactDatePicker from '../../components/ui/CompactDatePicker';
import { usePlantManagerDetailOverlay } from '../../components/layout/PlantManagerDetailOverlayContext';

type ReportFormat = 'preview' | 'print' | 'pdf' | 'excel';
type Row = Record<string, unknown>;
interface Metric { value: number | null; change_percentage?: number | null }
interface DashboardData {
  filters: { from: string | null; to: string | null; custom: boolean };
  kpis: { todays_deliveries: Metric; todays_stock_in: Metric; todays_stock_out: Metric; pending_qa: Metric; pending_shipment: Metric; warehouse_utilization: Metric };
  stock_movement_trend: Array<{ date: string; stock_in: number; stock_out: number }>;
  weekly_stock: Array<{ week: string; stock_in: number; stock_out: number }>;
  weekly_stock_period: { from: string; to: string; grouping: 'daily' | 'weekly' };
  inventory_status: Array<{ name: string; value: number }>;
  warehouse_capacity: { used: number; free: number | null; total: number | null; utilization_percentage: number | null };
}
interface GeneratedReport { type: string; title: string; generated_at: string; format: ReportFormat; filters: { from: string | null; to: string | null }; date_filter?: { supported: boolean; field: string | null; timezone: string }; columns: string[]; rows: Row[]; summary: Record<string, unknown> }
interface RecentReport { id: string | number; name: string; type?: string; category?: string; generated_at?: string; dateGenerated?: string; generated_by?: string; generatedBy?: string; format: string }
interface ReportCardData { type: string; title: string; description: string; icon: React.ReactNode }

const reportCards: ReportCardData[] = [
  { type: 'inventory', title: 'Inventory Report', description: 'Comprehensive inventory levels, valuation and aging.', icon: <Package className="w-5 h-5 text-blue-400" /> },
  { type: 'receiving', title: 'Receiving Report', description: 'Delivery receiving summary, QA results and inspection.', icon: <Truck className="w-5 h-5 text-emerald-400" /> },
  { type: 'stock-in', title: 'Stock In Report', description: 'Items received into warehouse and stock in summary.', icon: <ArrowUp className="w-5 h-5 text-cyan-400" /> },
  { type: 'stock-out', title: 'Stock Out Report', description: 'Released items, orders fulfilled and stock out summary.', icon: <ArrowDown className="w-5 h-5 text-rose-400" /> },
  { type: 'shipment', title: 'Shipment Report', description: 'Shipment performance, transit time and delivery status.', icon: <Truck className="w-5 h-5 text-purple-400" /> },
  { type: 'inventory-movement', title: 'Inventory Movement Report', description: 'All recorded stock-in and stock-out movements.', icon: <BarChart3 className="w-5 h-5 text-indigo-400" /> },
  { type: 'warehouse-utilization', title: 'Warehouse Utilization Report', description: 'Warehouse capacity, occupancy and utilization analysis.', icon: <BarChart3 className="w-5 h-5 text-yellow-400" /> },
  { type: 'low-stock', title: 'Low Stock Report', description: 'Items below minimum level and reorder suggestions.', icon: <AlertCircle className="w-5 h-5 text-amber-400" /> },
  { type: 'damage-waste', title: 'Damage & Waste Report', description: 'Rejected and damaged items recorded during QA.', icon: <X className="w-5 h-5 text-rose-400" /> },
  { type: 'order-fulfillment', title: 'Order Fulfillment Report', description: 'Orders received, fulfilled, shipped and delivered.', icon: <CheckCircle className="w-5 h-5 text-emerald-400" /> },
];
const colors: Record<string, string> = { Available: '#10b981', Reserved: '#8b5cf6', Backload: '#f59e0b' };
const num = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const show = (value: unknown) => value === null || value === undefined || value === '' ? '—' : String(value);
const heading = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const csvCell = (value: unknown) => `"${show(value).replaceAll('"', '""')}"`;
const dateTime = (value?: string) => value ? new Date(value).toLocaleString() : '—';
// Mobile preview column widths (px), keyed by report column so every report schema shares one map.
// Applied only by the mobile CSS through <colgroup>, so <th> and <td> always share one width.
const previewColumnWidths: Record<string, number> = {
  barcode: 130, product: 180, category: 160, warehouse: 140, available_stock: 110, reserved_stock: 110, backload: 90,
  receiving_no: 150, purchase_order: 150, supplier: 170, reference_no: 150, reference: 150, order_no: 140, customer_name: 150,
  type: 95, name: 170, code: 100, status: 150, inspection_result: 140, remarks: 220,
  quantity: 90, delivered_quantity: 140, rejected_quantity: 135, unit: 80, item_lines: 85, used: 90, free: 90, total: 90,
  total_amount: 115, utilization_percentage: 160,
  order_date: 125, delivery_date: 125, required_delivery_date: 160, stocked_in_at: 150, created_at: 150, updated_at: 150, occurred_at: 150, completed_at: 150,
};
// Inventory Report only: explicit geometry, also pinned on its <th>/<td> by the mobile CSS.
const inventoryPreviewColumnWidths: Record<string, number> = {
  barcode: 130, product: 180, category: 170, warehouse: 140, available_stock: 105, reserved_stock: 105, backload: 85, status: 110,
};
const previewColumnWidth = (column: string, type?: string) => (type === 'inventory' ? inventoryPreviewColumnWidths[column] : undefined) ?? previewColumnWidths[column] ?? 140;
const inventoryCellWidth = (type: string, column: string) => type === 'inventory' ? { '--pm-col-width': `${previewColumnWidth(column, type)}px` } as React.CSSProperties : undefined;
const errorMessage = (requestError: any, fallback: string) => { const validation = requestError?.response?.data?.errors; return validation ? Object.values(validation).flat().join(' ') : requestError?.response?.data?.message || fallback; };
// Describes which dates a generated report covers, so previews and prints never imply a filter that was not applied.
const reportPeriod = (report: GeneratedReport) => {
  if (report.date_filter && !report.date_filter.supported) return 'Current snapshot · date range does not apply to this report';
  const { from, to } = report.filters;
  const range = from && to ? `${from} to ${to}` : from ? `From ${from}` : to ? `Up to ${to}` : 'All dates';
  return report.date_filter?.field ? `${range} · by ${report.date_filter.field.toLowerCase()} (${report.date_filter.timezone})` : range;
};
const html = (value: unknown) => show(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character);

const Reports: React.FC = () => {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [recent, setRecent] = useState<RecentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [generating, setGenerating] = useState<string | null>(null);
  const [preview, setPreview] = useState<GeneratedReport | null>(null);
  usePlantManagerDetailOverlay(preview !== null);
  const latestRequest = useRef(0);
  // Same YYYY-MM-DD filter payload for the dashboard and every generated report.
  const dateParams = useMemo(() => ({ ...(from ? { from } : {}), ...(to ? { to } : {}) }), [from, to]);

  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    setLoading(true); setError('');
    try {
      const [dashboardResponse, recentResponse] = await Promise.all([
        apiClient.get<DashboardData>('/plant-manager/reports/dashboard', { params: dateParams }),
        apiClient.get<{ data: RecentReport[] }>('/plant-manager/reports/recent'),
      ]);
      if (request !== latestRequest.current) return;
      setDashboard(dashboardResponse.data);
      setRecent(Array.isArray(recentResponse.data.data) ? recentResponse.data.data : []);
    } catch (requestError: any) {
      if (request !== latestRequest.current) return;
      // Never leave charts from a previous range on screen next to a rejected one.
      setDashboard(null);
      setError(errorMessage(requestError, 'Reports could not be loaded. Please try again.'));
    } finally { if (request === latestRequest.current) setLoading(false); }
  }, [dateParams]);
  useEffect(() => { void load(); }, [load]);

  const downloadCsv = (report: GeneratedReport) => {
    const csv = [report.columns.map(csvCell).join(','), ...report.rows.map((row) => report.columns.map((column) => csvCell(row[column])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${report.type}-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  const printReport = (report: GeneratedReport, pdf: boolean) => {
    const popup = window.open('', '_blank');
    if (!popup) { setActionError('Allow pop-ups to print this report.'); return; }
    popup.opener = null;
    const headers = report.columns.map((column) => `<th>${html(heading(column))}</th>`).join('');
    const rows = report.rows.map((row) => `<tr>${report.columns.map((column) => `<td>${html(row[column])}</td>`).join('')}</tr>`).join('');
    popup.document.write(`<!doctype html><html><head><title>${html(report.title)}</title><style>body{font:14px Arial;padding:24px;color:#111}h1{margin-bottom:4px}p{color:#555}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{border:1px solid #ccc;padding:7px;text-align:left}th{background:#eee}@media print{button{display:none}}</style></head><body><h1>${html(report.title)}</h1><p>Generated ${html(dateTime(report.generated_at))} · ${html(reportPeriod(report))}${pdf ? ' · Choose Save as PDF in the print dialog.' : ''}</p><button onclick="window.print()">Print</button><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };
  const generate = async (type: string, format: ReportFormat) => {
    setGenerating(`${type}:${format}`); setActionError('');
    try {
      const response = await apiClient.get<{ report: GeneratedReport }>('/plant-manager/reports/generate', { params: { type, format, ...dateParams } });
      const report = response.data.report;
      if (format === 'preview') setPreview(report);
      else if (format === 'excel') downloadCsv(report);
      else printReport(report, format === 'pdf');
      const recentResponse = await apiClient.get<{ data: RecentReport[] }>('/plant-manager/reports/recent');
      setRecent(Array.isArray(recentResponse.data.data) ? recentResponse.data.data : []);
    } catch (requestError: any) {
      setActionError(errorMessage(requestError, 'Report generation failed.'));
    } finally { setGenerating(null); }
  };

  const movement = (dashboard?.stock_movement_trend ?? []).map((point) => ({ date: point.date.slice(5), stockIn: num(point.stock_in), stockOut: num(point.stock_out) }));
  const weekly = (dashboard?.weekly_stock ?? []).map((point) => ({ week: point.week, stockIn: num(point.stock_in), stockOut: num(point.stock_out) }));
  const inventory = (dashboard?.inventory_status ?? []).map((item) => ({ name: item.name, value: num(item.value), color: colors[item.name] ?? '#64748b' }));
  const capacity = dashboard?.warehouse_capacity;
  const capacityData = [{ name: 'Used Space', value: num(capacity?.used), color: '#06b6d4' }, { name: 'Free Space', value: num(capacity?.free), color: '#1e293b' }];
  const utilization = dashboard?.kpis.warehouse_utilization.value;
  const movementTitle = dashboard?.filters.custom ? 'Stock Movement Trend (Selected Period)' : 'Stock Movement Trend (30 Days)';
  const comparisonTitle = `Stock In vs Stock Out (${dashboard?.weekly_stock_period.grouping === 'daily' ? 'Daily' : 'Weekly'})`;
  const kpis = dashboard ? [
    ["Today's Deliveries", num(dashboard.kpis.todays_deliveries.value), 'Orders delivered', dashboard.kpis.todays_deliveries, <Truck key="deliveries" className="w-4 h-4 text-blue-400" />],
    ["Today's Stock In", num(dashboard.kpis.todays_stock_in.value), 'Accepted items received', dashboard.kpis.todays_stock_in, <ArrowUp key="stock-in" className="w-4 h-4 text-emerald-400" />],
    ["Today's Stock Out", num(dashboard.kpis.todays_stock_out.value), 'Items released', dashboard.kpis.todays_stock_out, <ArrowDown key="stock-out" className="w-4 h-4 text-rose-400" />],
    ['Pending QA', num(dashboard.kpis.pending_qa.value), 'Receivings awaiting QA', dashboard.kpis.pending_qa, <AlertCircle key="qa" className="w-4 h-4 text-yellow-400" />],
    ['Pending Shipment', num(dashboard.kpis.pending_shipment.value), 'Orders ready to ship', dashboard.kpis.pending_shipment, <Package key="shipment" className="w-4 h-4 text-purple-400" />],
    ['Warehouse Utilization', utilization === null || utilization === undefined ? '—' : `${num(utilization)}%`, 'Configured capacity used', dashboard.kpis.warehouse_utilization, <BarChart3 key="capacity" className="w-4 h-4 text-cyan-400" />],
  ] as Array<[string, number | string, string, Metric, React.ReactNode]> : [];
  const filtered = useMemo(() => recent.filter((report) => { const kind = report.category ?? report.type ?? ''; return `${report.name} ${kind} ${report.generated_by ?? report.generatedBy ?? ''}`.toLowerCase().includes(search.toLowerCase()) && (category === 'All' || kind === category); }), [recent, search, category]);

  return <div className="pm-reports w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
    <div className="flex items-center gap-2 text-sm text-slate-400"><span>Plant Manager</span><ChevronRight className="w-4 h-4" /><span className="text-slate-100">Reports</span></div>
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4"><div><h1 className="text-2xl font-bold text-white">Reports</h1><p className="text-sm text-slate-400">Operational reporting for warehouse, inventory, receiving, shipping and stock activities.</p></div><div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 md:flex md:flex-wrap md:items-end"><div className="text-xs text-slate-400"><span className="mb-1.5 block">From</span><CompactDatePicker label="Report from date" value={from} max={to || undefined} onChange={setFrom} className="min-[430px]:w-40" /></div><div className="text-xs text-slate-400"><span className="mb-1.5 block">To</span><CompactDatePicker label="Report to date" value={to} min={from || undefined} onChange={setTo} className="min-[430px]:w-40" /></div><button onClick={() => void load()} disabled={loading} className="min-h-11 cursor-pointer flex items-center justify-center gap-2 rounded-xl border border-[#1f2937] px-4 py-2 text-sm hover:bg-slate-800/50 focus:ring-2 focus:ring-cyan-500/40 disabled:opacity-50 min-[430px]:col-span-2 md:col-span-1"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div></div>
    {error && <Alert text={error}><button onClick={() => void load()} className="underline cursor-pointer">Retry</button></Alert>}{actionError && <Alert text={actionError} warning />}

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4" aria-busy={loading}>{loading ? Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-32 animate-pulse bg-[#111827] border border-[#1f2937] rounded-xl" />) : kpis.map(([name, value, subtitle, metric, icon]) => { const change = num(metric.change_percentage); return <div key={name} className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 hover:border-gray-600 transition-colors"><div className="flex justify-between"><div><p className="mobile-kpi-title text-xs font-medium text-slate-400 uppercase tracking-wider">{name}</p><p className="mobile-kpi-value text-2xl font-bold text-white mt-1">{value}</p></div><div className="p-2 h-fit rounded-lg bg-slate-800/30">{icon}</div></div><p className="mobile-kpi-helper text-xs text-slate-400 mt-1">{subtitle}</p>{metric.change_percentage === null && <p className="mobile-kpi-helper text-xs mt-1 text-slate-400">No previous data</p>}{metric.change_percentage !== undefined && metric.change_percentage !== null && <p className={`mobile-kpi-helper text-xs mt-1 flex gap-1 ${change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{change > 0 ? '+' : ''}{change}% vs yesterday</p>}</div>; })}</div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Chart title={movementTitle} empty={!movement.length}><ResponsiveContainer width="100%" height={200}><LineChart data={movement}><CartesianGrid strokeDasharray="3 3" stroke="var(--report-grid-stroke)" className="[--report-grid-stroke:#e2e8f0] dark:[--report-grid-stroke:#1e293b]" /><XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} /><YAxis stroke="#64748b" tick={{ fontSize: 10 }} /><Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} /><Legend /><Line type="monotone" dataKey="stockIn" stroke="#3b82f6" name="Stock In" strokeWidth={2} /><Line type="monotone" dataKey="stockOut" stroke="#ef4444" name="Stock Out" strokeWidth={2} /></LineChart></ResponsiveContainer></Chart>
      <Chart title={comparisonTitle} empty={!weekly.length}><ResponsiveContainer width="100%" height={200}><BarChart data={weekly}><CartesianGrid strokeDasharray="3 3" stroke="var(--report-grid-stroke)" className="[--report-grid-stroke:#e2e8f0] dark:[--report-grid-stroke:#1e293b]" /><XAxis dataKey="week" stroke="#64748b" tick={{ fontSize: 10 }} /><YAxis stroke="#64748b" tick={{ fontSize: 10 }} /><Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} /><Legend /><Bar dataKey="stockIn" fill="#3b82f6" name="Stock In" radius={[6, 6, 0, 0]} /><Bar dataKey="stockOut" fill="#ef4444" name="Stock Out" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></Chart>
      <Chart title="Inventory Status Overview" empty={!inventory.some((item) => item.value > 0)}><Donut data={inventory} /></Chart>
      <Chart title="Warehouse Capacity" empty={num(capacity?.total) === 0}><Donut data={capacityData} /><p className="text-center text-xs text-slate-400">{capacity?.utilization_percentage === null || capacity?.utilization_percentage === undefined ? 'Capacity not configured' : `${num(capacity.utilization_percentage)}% used`} · {num(capacity?.used).toLocaleString()} used · {capacity?.free === null || capacity?.free === undefined ? '—' : num(capacity.free).toLocaleString()} free</p></Chart>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{reportCards.map((report) => <div key={report.type} className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 flex flex-col hover:border-gray-600 transition-colors"><div className="flex gap-3"><div className="p-2 h-fit rounded-lg bg-slate-800/30">{report.icon}</div><div><h4 className="text-sm font-semibold text-white">{report.title}</h4><p className="text-xs text-slate-400">Real-time database records</p></div></div><p className="text-xs text-slate-400 mt-2 flex-1">{report.description}</p><div className="grid grid-cols-2 gap-2 mt-3">{(['preview', 'print', 'pdf', 'excel'] as ReportFormat[]).map((format) => { const busy = generating === `${report.type}:${format}`; const Icon = format === 'preview' ? Eye : format === 'print' ? Printer : format === 'excel' ? FileSpreadsheet : Download; return <button key={format} onClick={() => void generate(report.type, format)} disabled={generating !== null} className="min-h-11 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-inherit transition-colors disabled:opacity-50 flex items-center justify-center gap-1 cursor-pointer focus:ring-2 focus:ring-cyan-500/40"><Icon className={`w-3.5 h-3.5 ${busy ? 'animate-pulse' : ''}`} />{busy ? 'Working…' : format[0].toUpperCase() + format.slice(1)}</button>; })}</div></div>)}</div>

    <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"><h3 className="text-sm font-semibold text-white">Recent Generated Reports</h3><div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap"><div className="relative w-full min-w-0 sm:w-auto"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" /><input aria-label="Search recent reports" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reports..." className="w-full min-w-0 bg-[#0f172a] border border-[#1f2937] rounded-lg pl-8 pr-3 py-2 text-sm sm:w-auto" /></div><select aria-label="Filter report category" value={category} onChange={(event) => setCategory(event.target.value)} className="w-full min-w-0 bg-[#0f172a] border border-[#1f2937] rounded-lg px-2 py-2 text-sm sm:w-auto"><option value="All">All Categories</option>{reportCards.map((report) => <option key={report.type} value={report.type}>{report.title}</option>)}</select></div></div><div className="max-w-full overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[#0f172a]"><tr>{['Report Name', 'Category', 'Date Generated', 'Generated By', 'Format'].map((title) => <th key={title} className="px-3 py-2 text-left text-xs uppercase text-slate-400">{title}</th>)}</tr></thead><tbody>{filtered.map((report) => <tr key={report.id} className="border-b border-[#1f2937]"><td className="px-3 py-2 text-white">{report.name}</td><td className="px-3 py-2">{report.category ?? report.type}</td><td className="px-3 py-2">{dateTime(report.generated_at ?? report.dateGenerated)}</td><td className="px-3 py-2">{report.generated_by ?? report.generatedBy ?? '—'}</td><td className="px-3 py-2">{report.format}</td></tr>)}{!filtered.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No generated report history is available.</td></tr>}</tbody></table></div></div>
    <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4"><h3 className="text-sm font-semibold text-white">Report Notes</h3><ul className="text-xs text-slate-400 mt-2 space-y-1 list-disc list-inside"><li>Reports use current database data when generated.</li><li>From/To filters the charts and dated reports by Asia/Manila business day; today's cards, pending counts, inventory and capacity always show current data.</li><li>Excel exports are CSV-compatible files.</li><li>PDF uses the browser Save as PDF workflow.</li></ul></div>
    {preview && <Preview report={preview} close={() => setPreview(null)} />}
  </div>;
};

const Alert = ({ text, warning, children }: { text: string; warning?: boolean; children?: React.ReactNode }) => <div role="alert" className={`flex justify-between gap-4 rounded-xl border p-4 text-sm ${warning ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}><span>{text}</span>{children}</div>;
const Chart = ({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) => <div className="relative bg-[#111827] border border-[#1f2937] rounded-xl p-4"><h3 className="text-sm font-semibold text-white mb-2">{title}</h3>{children}{empty && <div className="absolute inset-x-4 top-12 bottom-4 flex items-center justify-center bg-[#111827]/80 text-sm text-slate-400 pointer-events-none">No data available</div>}</div>;
const Donut = ({ data }: { data: Array<{ name: string; value: number; color: string }> }) => <ResponsiveContainer width="100%" height={200}><PieChart><Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={70} dataKey="value">{data.map((entry) => <Cell key={entry.name} fill={entry.color} stroke="var(--report-segment-stroke)" strokeWidth={2} className="[--report-segment-stroke:none] dark:[--report-segment-stroke:#111827]" />)}</Pie><Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} /><Legend /></PieChart></ResponsiveContainer>;
const Preview = ({ report, close }: { report: GeneratedReport; close: () => void }) => <div className="pm-report-preview fixed inset-0 z-50 bg-black/70 p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="preview-title"><div className="pm-report-preview-panel flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[#334155] bg-[#111827]"><div className="flex shrink-0 justify-between border-b border-[#1f2937] bg-white p-4 dark:bg-[#111827]"><div><h2 id="preview-title" className="text-lg font-semibold">{report.title}</h2><p className="text-xs text-slate-400">Generated {dateTime(report.generated_at)} · {report.rows.length.toLocaleString()} {report.rows.length === 1 ? 'record' : 'records'}</p><p className="text-xs text-slate-400">{reportPeriod(report)}</p></div><button aria-label="Close report preview" onClick={close} className="min-w-11 min-h-11 flex items-center justify-center rounded-lg hover:bg-slate-800 cursor-pointer focus:ring-2 focus:ring-cyan-500/40"><X className="w-5 h-5" /></button></div><div className="pm-report-preview-scroll min-h-0 flex-1 overflow-auto p-4"><table className="pm-report-table w-full text-xs" data-report={report.type} style={{ '--pm-report-min-width': `${report.columns.reduce((total, column) => total + previewColumnWidth(column, report.type), 0)}px` } as React.CSSProperties}><colgroup>{report.columns.map((column) => <col key={column} style={{ '--pm-col-width': `${previewColumnWidth(column, report.type)}px` } as React.CSSProperties} />)}</colgroup><thead className="sticky top-0 z-10 bg-white dark:bg-[#0f172a]"><tr>{report.columns.map((column) => <th key={column} className="px-3 py-2 text-left whitespace-nowrap" style={inventoryCellWidth(report.type, column)}>{heading(column)}</th>)}</tr></thead><tbody>{report.rows.map((row, index) => <tr key={index} className="border-b border-[#1f2937]">{report.columns.map((column) => <td key={column} className="px-3 py-2 whitespace-nowrap text-slate-300" style={inventoryCellWidth(report.type, column)}>{show(row[column])}</td>)}</tr>)}{!report.rows.length && <tr><td colSpan={Math.max(1, report.columns.length)} className="p-8 text-center text-slate-400">No records match these filters.</td></tr>}</tbody></table></div></div></div>;

export default Reports;
