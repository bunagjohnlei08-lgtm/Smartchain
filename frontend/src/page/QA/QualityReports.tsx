import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardList, FileSpreadsheet, FileText, Printer, XCircle } from 'lucide-react';
import { CartesianGrid, Cell, Legend as ChartLegend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { apiClient } from '../../lib/api';

interface QualityReportData {
  summary: {
    completed_inspections: number;
    passed_count: number;
    passed_rate: number;
    rejected_count: number;
    rejected_rate: number;
    rejected_quantity: number;
  };
  trend: { date: string; passed: number; rejected: number }[];
  distribution: { name: 'Passed' | 'Rejected'; count: number; percentage: number }[];
  top_rejected_products: { product: string; quantity: number }[];
  supplier_quality: { name: string; inspections: number; accepted_quantity: number; rejected_quantity: number; pass_rate: number }[];
}

const distributionColors: Record<string, string> = { Passed: '#22C55E', Rejected: '#EF4444' };
const escapeCsv = (value: string | number): string => `"${String(value).replace(/"/g, '""')}"`;
const escapeHtml = (value: string | number): string => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const KpiCard: React.FC<{ label: string; value: string | number; subtext: string; icon: React.ReactNode; iconBg: string; iconColor: string }> = ({ label, value, subtext, icon, iconBg, iconColor }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322] dark:shadow-none">
    <div className="flex items-start justify-between"><div><p className="text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400">{label}</p><p className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white">{value}</p><p className="mt-1 text-xs text-slate-500">{subtext}</p></div><div className={`p-2.5 rounded-full ${iconBg} ${iconColor}`}>{icon}</div></div>
  </div>
);

const EmptyChart: React.FC<{ message: string }> = ({ message }) => <div className="h-[300px] flex items-center justify-center text-sm text-slate-500">{message}</div>;

const QualityReports: React.FC = () => {
  const { theme } = useTheme();
  const [report, setReport] = useState<QualityReportData | null>(null);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<{ data: QualityReportData }>('/qa/quality-reports', {
        params: { days: 30 },
      });
      setReport(response.data.data);
    } catch {
      setReport(null);
      setError('Unable to load quality reports. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setMounted(true); fetchReport(); }, [fetchReport]);

  const exportExcel = () => {
    if (!report) return;
    const rows: Array<Array<string | number>> = [
      ['Quality Reports'],
      ['Generated', new Date().toLocaleString()],
      [],
      ['Summary', 'Count', 'Rate'],
      ['Completed Inspections', report.summary.completed_inspections, ''],
      ['Passed', report.summary.passed_count, `${report.summary.passed_rate}%`],
      ['Rejected', report.summary.rejected_count, `${report.summary.rejected_rate}%`],
      ['Rejected Quantity', report.summary.rejected_quantity, ''],
      [], ['Inspection Trend', 'Passed', 'Rejected'],
      ...report.trend.map((item) => [item.date, item.passed, item.rejected]),
      [], ['Top Rejected Products', 'Rejected Quantity'],
      ...report.top_rejected_products.map((item) => [item.product, item.quantity]),
      [], ['Supplier Quality Rating', 'Inspections', 'Accepted Quantity', 'Rejected Quantity', 'Pass Rate'],
      ...report.supplier_quality.map((item) => [item.name, item.inspections, item.accepted_quantity, item.rejected_quantity, `${item.pass_rate}%`]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `qa-quality-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    if (!report) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setError('The report window was blocked. Allow pop-ups and try again.'); return; }
    printWindow.opener = null;
    const trendRows = report.trend.map((item) => `<tr><td>${escapeHtml(item.date)}</td><td>${item.passed}</td><td>${item.rejected}</td></tr>`).join('');
    const productRows = report.top_rejected_products.map((item) => `<tr><td>${escapeHtml(item.product)}</td><td>${item.quantity}</td></tr>`).join('');
    const supplierRows = report.supplier_quality.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.inspections}</td><td>${item.accepted_quantity}</td><td>${item.rejected_quantity}</td><td>${item.pass_rate}%</td></tr>`).join('');
    printWindow.document.write(`<!doctype html><html><head><title>QA Quality Report</title><style>body{font-family:Arial,sans-serif;color:#111;padding:24px}h1{font-size:22px;margin-bottom:4px}h2{font-size:15px;margin-top:24px}p{color:#555}table{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#eee}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.card{border:1px solid #bbb;padding:10px}.value{font-size:18px;font-weight:bold}@media print{body{padding:0}}</style></head><body><h1>QA Quality Report</h1><p>Generated ${escapeHtml(new Date().toLocaleString())}</p><div class="summary"><div class="card">Completed<div class="value">${report.summary.completed_inspections}</div></div><div class="card">Passed<div class="value">${report.summary.passed_rate}%</div></div><div class="card">Rejected<div class="value">${report.summary.rejected_rate}%</div></div></div><h2>Inspection Trend</h2><table><thead><tr><th>Date</th><th>Passed</th><th>Rejected</th></tr></thead><tbody>${trendRows}</tbody></table><h2>Top Rejected Products</h2><table><thead><tr><th>Product</th><th>Rejected Quantity</th></tr></thead><tbody>${productRows}</tbody></table><h2>Supplier Quality Rating</h2><table><thead><tr><th>Supplier</th><th>Inspections</th><th>Accepted</th><th>Rejected</th><th>Pass Rate</th></tr></thead><tbody>${supplierRows}</tbody></table></body></html>`);
    printWindow.document.close(); printWindow.focus(); printWindow.print();
  };

  const summary = report?.summary;
  const donutData = report?.distribution.filter((item) => item.count > 0).map((item) => ({ ...item, value: item.count, color: distributionColors[item.name] })) ?? [];
  const hasData = Boolean(summary?.completed_inspections);
  const isDark = theme === 'dark';
  const chartGridColor = isDark ? '#1e293b' : '#E2E8F0';
  const chartAxisColor = isDark ? '#94a3b8' : '#64748B';
  const tooltipStyle = {
    backgroundColor: isDark ? '#0f172a' : '#FFFFFF',
    borderColor: isDark ? '#1e293b' : '#CBD5E1',
    color: isDark ? '#f1f5f9' : '#0F172A',
    borderRadius: isDark ? undefined : '0.75rem',
    boxShadow: isDark ? undefined : '0 4px 12px rgb(15 23 42 / 0.08)',
  };

  return (
    <div className="min-h-screen w-full max-w-7xl mx-auto space-y-6 bg-slate-50 p-4 text-slate-900 dark:bg-[#090d16] dark:text-slate-100 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Quality Reports</h1><p className="text-sm text-slate-600 dark:text-slate-400">Aggregated quality performance from completed QA inspections.</p></div><div className="flex flex-wrap items-center gap-3"><button onClick={printReport} disabled={!report || loading} className="cursor-pointer border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 dark:border-gray-700 dark:bg-[#0d1322] dark:hover:bg-gray-800 dark:text-white font-medium px-4 py-2 rounded-xl flex items-center gap-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"><FileText className="w-4 h-4" /> Export PDF</button><button onClick={exportExcel} disabled={!report || loading} className="cursor-pointer border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 dark:border-gray-700 dark:bg-[#0d1322] dark:hover:bg-gray-800 dark:text-white font-medium px-4 py-2 rounded-xl flex items-center gap-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"><FileSpreadsheet className="w-4 h-4" /> Export Excel</button><button onClick={printReport} disabled={!report || loading} className="cursor-pointer bg-[#092635] hover:opacity-90 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:hover:opacity-100 dark:text-black font-semibold px-4 py-2 rounded-xl flex items-center gap-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed"><Printer className="w-4 h-4" /> Print</button></div></div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 flex items-center justify-between gap-3"><span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</span><button onClick={fetchReport} className="cursor-pointer rounded-lg border border-rose-300 px-3 py-1.5 hover:bg-rose-100 dark:border-rose-400/30 dark:hover:bg-rose-500/10 focus:outline-none focus:ring-2 focus:ring-rose-400">Retry</button></div>}
      {loading && <div className="h-24 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322] dark:shadow-none flex items-center justify-center text-sm text-slate-600 dark:text-slate-400">Loading quality report...</div>}

      {!loading && report && <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><KpiCard label="INSPECTION SUMMARY" value={summary?.completed_inspections ?? 0} subtext="Inspections completed" icon={<ClipboardList className="w-6 h-6" />} iconBg="bg-blue-50 dark:bg-blue-500/10" iconColor="text-blue-600 dark:text-blue-400" /><KpiCard label="PASSED" value={`${summary?.passed_rate ?? 0}%`} subtext={`${summary?.passed_count ?? 0} batches`} icon={<CheckCircle2 className="w-6 h-6" />} iconBg="bg-emerald-50 dark:bg-emerald-500/10" iconColor="text-emerald-600 dark:text-emerald-400" /><KpiCard label="REJECTED" value={`${summary?.rejected_rate ?? 0}%`} subtext={`${summary?.rejected_count ?? 0} batches • ${summary?.rejected_quantity ?? 0} units`} icon={<XCircle className="w-6 h-6" />} iconBg="bg-red-50 dark:bg-red-500/10" iconColor="text-red-600 dark:text-red-400" /></div>

        {!hasData && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600 shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322] dark:text-slate-400 dark:shadow-none">No completed QA inspections are available for reporting.</div>}

        <div className="grid min-w-0 grid-cols-1 xl:grid-cols-12 gap-6"><div className="min-w-0 xl:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322] dark:shadow-none"><h3 className="text-lg font-semibold text-slate-900 dark:text-white">Inspection Trend</h3><p className="mb-4 text-sm text-slate-600 dark:text-slate-400">Daily Passed and Rejected QA inspections for the last 30 days.</p>{report.trend.length === 0 ? <EmptyChart message="No completed inspection trend data." /> : <ResponsiveContainer width="100%" height={300}><LineChart data={report.trend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} /><XAxis dataKey="date" stroke={chartAxisColor} tick={{ fill: chartAxisColor }} /><YAxis allowDecimals={false} stroke={chartAxisColor} tick={{ fill: chartAxisColor }} /><Tooltip contentStyle={tooltipStyle} /><ChartLegend iconType="circle" /><Line type="monotone" dataKey="passed" stroke="#22C55E" strokeWidth={2} name="Passed" isAnimationActive={mounted} /><Line type="monotone" dataKey="rejected" stroke="#EF4444" strokeWidth={2} name="Rejected" isAnimationActive={mounted} /></LineChart></ResponsiveContainer>}</div>
          <div className="min-w-0 xl:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322] dark:shadow-none"><h3 className="text-lg font-semibold text-slate-900 dark:text-white">Pass vs Reject</h3><p className="mb-4 text-sm text-slate-600 dark:text-slate-400">Distribution of completed Passed and Rejected outcomes.</p>{donutData.length === 0 ? <EmptyChart message="No Passed or Rejected outcome data." /> : <><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={donutData} cx="50%" cy="50%" innerRadius="60%" outerRadius="85%" paddingAngle={4} dataKey="value" isAnimationActive={mounted}>{donutData.map((entry) => <Cell key={entry.name} fill={entry.color} stroke={isDark ? '#0d1322' : '#FFFFFF'} strokeWidth={2} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart></ResponsiveContainer><div className="flex flex-wrap items-center justify-center gap-5 mt-4">{donutData.map((entry) => <span key={entry.name} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 font-medium"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />{entry.name} {entry.percentage}%</span>)}</div></>}</div></div>

        <div className="grid min-w-0 grid-cols-1 xl:grid-cols-2 gap-6"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322] dark:shadow-none"><h3 className="text-lg font-semibold text-slate-900 dark:text-white">Top Rejected Products</h3><p className="mb-4 text-sm text-slate-600 dark:text-slate-400">Sum of actual rejected quantity by product.</p>{report.top_rejected_products.length === 0 ? <EmptyChart message="No rejected quantities recorded." /> : <div className="max-h-[320px] space-y-1 overflow-y-auto pr-2 custom-scrollbar">{report.top_rejected_products.map((item, index) => { const maximum = report.top_rejected_products[0]?.quantity || 1; const width = Math.max(4, (item.quantity / maximum) * 100); return <div key={item.product} className="border-b border-slate-200 px-1 py-3 last:border-b-0 dark:border-slate-800/80"><div className="mb-2 flex items-start justify-between gap-4"><div className="min-w-0 flex-1"><span className="mr-2 text-xs font-semibold text-slate-500">{index + 1}</span><span className="break-words text-sm leading-5 text-slate-700 dark:text-slate-200">{item.product}</span></div><span className="shrink-0 text-sm font-semibold tabular-nums text-cyan-600 dark:text-cyan-400">{item.quantity.toLocaleString()}</span></div><div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="img" aria-label={`${item.product}: ${item.quantity} rejected`}><div className="h-full rounded-full bg-cyan-500 transition-[width] duration-700" style={{ width: mounted ? `${width}%` : '0%' }} /></div></div>; })}</div>}</div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322] dark:shadow-none"><h3 className="text-lg font-semibold text-slate-900 dark:text-white">Supplier Quality Rating</h3><p className="mb-4 text-sm text-slate-600 dark:text-slate-400">Accepted quantity as a share of inspected quantity.</p>{report.supplier_quality.length === 0 ? <EmptyChart message="No supplier inspection data." /> : <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">{report.supplier_quality.map((item) => <div key={item.name}><div className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-700 dark:text-slate-200 truncate">{item.name}</span><span className="text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap">{item.pass_rate}% • {item.inspections} insp.</span></div><div className="w-full h-1.5 bg-slate-200 dark:bg-gray-800 rounded-full mt-1 overflow-hidden"><div className="h-full rounded-full bg-cyan-500" style={{ width: mounted ? `${item.pass_rate}%` : '0%', transition: 'width 1s ease-out 0.4s' }} /></div></div>)}</div>}</div></div>
      </>}
    </div>
  );
};

export default QualityReports;
