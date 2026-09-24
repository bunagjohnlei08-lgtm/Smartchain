import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardList, FileSpreadsheet, FileText, Printer, XCircle } from 'lucide-react';
import { CartesianGrid, Cell, Legend as ChartLegend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { apiClient } from '../../lib/api';
import { EvidenceGallery, type QaAttachment } from './components/EvidenceGallery';

interface QualityReportData {
  report_period: {
    from_date: string | null;
    to_date: string | null;
    label: string;
    is_custom: boolean;
  };
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
  inspection_evidence: { inspection_id: number; receiving_id: number; receiving_no: string; supplier: string; status: string; completed_at: string; attachments: QaAttachment[] }[];
}

const distributionColors: Record<string, string> = { Passed: '#22C55E', Rejected: '#EF4444' };
const escapeCsv = (value: string | number): string => `"${String(value).replace(/"/g, '""')}"`;
const escapeHtml = (value: string | number): string => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const evidenceFiles = (attachments: QaAttachment[]): string => attachments.map((item) => item.original_name).join('; ');
const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
const printEvidence = async (attachments: QaAttachment[]): Promise<string> => {
  if (attachments.length === 0) return '<span class="muted">No evidence</span>';
  return (await Promise.all(attachments.map(async (attachment) => {
    if (!attachment.mime_type.startsWith('image/')) return `<span class="file">PDF: ${escapeHtml(attachment.original_name)}</span>`;
    try {
      const response = await apiClient.get<Blob>(attachment.view_url, { responseType: 'blob' });
      return `<figure><img src="${await blobToDataUrl(response.data)}" alt=""><figcaption>${escapeHtml(attachment.original_name)}</figcaption></figure>`;
    } catch { return `<span class="file">Image: ${escapeHtml(attachment.original_name)}</span>`; }
  }))).join('');
};

const KpiCard: React.FC<{ label: string; value: string | number; subtext: string; icon: React.ReactNode; iconBg: string; iconColor: string }> = ({ label, value, subtext, icon, iconBg, iconColor }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322] dark:shadow-none">
    <div className="flex items-start justify-between"><div><p className="mobile-kpi-title text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400">{label}</p><p className="mobile-kpi-value mt-1.5 text-2xl font-bold text-slate-900 dark:text-white">{value}</p><p className="mobile-kpi-helper mt-1 text-xs text-slate-500">{subtext}</p></div><div className={`p-2.5 rounded-full ${iconBg} ${iconColor}`}>{icon}</div></div>
  </div>
);

const EmptyChart: React.FC<{ message: string }> = ({ message }) => <div className="h-[300px] flex items-center justify-center text-sm text-slate-500">{message}</div>;

const QualityReports: React.FC = () => {
  const { theme } = useTheme();
  const [report, setReport] = useState<QualityReportData | null>(null);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [appliedRange, setAppliedRange] = useState({ fromDate: '', toDate: '' });
  const [dateError, setDateError] = useState<string | null>(null);

  const fetchReport = useCallback(async (range: { fromDate: string; toDate: string }) => {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const response = await apiClient.get<{ data: QualityReportData }>('/qa/quality-reports', {
        params: {
          days: 30,
          ...(range.fromDate ? { from_date: range.fromDate } : {}),
          ...(range.toDate ? { to_date: range.toDate } : {}),
        },
      });
      setReport(response.data.data);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to load quality reports. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setMounted(true); void fetchReport({ fromDate: '', toDate: '' }); }, [fetchReport]);

  const applyDateRange = () => {
    if (fromDate && toDate && fromDate > toDate) {
      setDateError('From date cannot be later than To date.');
      return;
    }

    const range = { fromDate, toDate };
    setDateError(null);
    setAppliedRange(range);
    void fetchReport(range);
  };

  const clearDateRange = () => {
    const range = { fromDate: '', toDate: '' };
    setFromDate('');
    setToDate('');
    setDateError(null);
    setAppliedRange(range);
    void fetchReport(range);
  };

  const exportExcel = () => {
    if (!report) return;
    const rows: Array<Array<string | number>> = [
      ['Quality Reports'],
      ['Generated', new Date().toLocaleString()],
      ['Report Period', report.report_period.label],
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
      [], ['Inspection Evidence', 'Supplier', 'Completed At', 'Evidence Count', 'Evidence Files'],
      ...report.inspection_evidence.map((item) => [item.receiving_no, item.supplier, item.completed_at, item.attachments.length, evidenceFiles(item.attachments)]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `qa-quality-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printReport = async () => {
    if (!report) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setError('The report window was blocked. Allow pop-ups and try again.'); return; }
    printWindow.opener = null;
    const trendRows = report.trend.map((item) => `<tr><td>${escapeHtml(item.date)}</td><td>${item.passed}</td><td>${item.rejected}</td></tr>`).join('');
    const productRows = report.top_rejected_products.map((item) => `<tr><td>${escapeHtml(item.product)}</td><td>${item.quantity}</td></tr>`).join('');
    const supplierRows = report.supplier_quality.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.inspections}</td><td>${item.accepted_quantity}</td><td>${item.rejected_quantity}</td><td>${item.pass_rate}%</td></tr>`).join('');
    const evidenceRows = (await Promise.all(report.inspection_evidence.map(async (item) => `<tr><td>${escapeHtml(item.receiving_no)}</td><td>${escapeHtml(item.supplier)}</td><td>${escapeHtml(new Date(item.completed_at).toLocaleString())}</td><td><strong>Evidence (${item.attachments.length})</strong><div class="evidence">${await printEvidence(item.attachments)}</div></td></tr>`))).join('');
    printWindow.document.write(`<!doctype html><html><head><title>QA Quality Report</title><style>body{font-family:Arial,sans-serif;color:#111;padding:24px}h1{font-size:22px;margin-bottom:4px}h2{font-size:15px;margin-top:24px}p{color:#555}table{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px}th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top}th{background:#eee}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.card{border:1px solid #bbb;padding:10px}.value{font-size:18px;font-weight:bold}.evidence{display:flex;flex-wrap:wrap;gap:6px;margin-top:5px}.evidence figure{width:100px;margin:0}.evidence img{width:100px;height:70px;object-fit:contain;border:1px solid #ddd}.evidence figcaption,.file{display:block;max-width:120px;font-size:8px;overflow-wrap:anywhere}.muted{color:#666}@media print{body{padding:0}}</style></head><body><h1>QA Quality Report</h1><p>Generated ${escapeHtml(new Date().toLocaleString())}</p><p><strong>Report Period:</strong> ${escapeHtml(report.report_period.label)}</p><div class="summary"><div class="card">Completed<div class="value">${report.summary.completed_inspections}</div></div><div class="card">Passed<div class="value">${report.summary.passed_rate}%</div></div><div class="card">Rejected<div class="value">${report.summary.rejected_rate}%</div></div></div><h2>Inspection Trend</h2><table><thead><tr><th>Date</th><th>Passed</th><th>Rejected</th></tr></thead><tbody>${trendRows}</tbody></table><h2>Top Rejected Products</h2><table><thead><tr><th>Product</th><th>Rejected Quantity</th></tr></thead><tbody>${productRows}</tbody></table><h2>Supplier Quality Rating</h2><table><thead><tr><th>Supplier</th><th>Inspections</th><th>Accepted</th><th>Rejected</th><th>Pass Rate</th></tr></thead><tbody>${supplierRows}</tbody></table><h2>Inspection Evidence</h2><table><thead><tr><th>Receiving No.</th><th>Supplier</th><th>Completed</th><th>Evidence</th></tr></thead><tbody>${evidenceRows}</tbody></table></body></html>`);
    printWindow.document.close(); printWindow.focus(); printWindow.print();
  };

  const summary = report?.summary;
  const hasCustomRange = Boolean(appliedRange.fromDate || appliedRange.toDate);
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

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322] dark:shadow-none" aria-labelledby="quality-report-period-heading">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 id="quality-report-period-heading" className="text-sm font-semibold text-slate-900 dark:text-white">Reporting period</h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Filter completed QA inspections using their completion date.</p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 min-[430px]:grid-cols-2 lg:flex lg:items-end">
            <label className="min-w-0 text-xs font-medium text-slate-700 dark:text-slate-300"><span className="mb-1.5 block">From Date</span><input type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setDateError(null); }} className="min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none [color-scheme:light] focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 dark:border-slate-700 dark:bg-[#090d16] dark:text-slate-100 dark:[color-scheme:dark] lg:w-40" /></label>
            <label className="min-w-0 text-xs font-medium text-slate-700 dark:text-slate-300"><span className="mb-1.5 block">To Date</span><input type="date" value={toDate} onChange={(event) => { setToDate(event.target.value); setDateError(null); }} className="min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none [color-scheme:light] focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 dark:border-slate-700 dark:bg-[#090d16] dark:text-slate-100 dark:[color-scheme:dark] lg:w-40" /></label>
            <div className="flex gap-2 min-[430px]:col-span-2 lg:col-span-1">
              <button type="button" onClick={applyDateRange} disabled={loading} className="min-h-11 flex-1 cursor-pointer rounded-xl bg-[#092635] px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 lg:flex-none">Apply Filter</button>
              <button type="button" onClick={clearDateRange} disabled={loading || (!fromDate && !toDate && !hasCustomRange)} className="min-h-11 flex-1 cursor-pointer rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 lg:flex-none">Clear</button>
            </div>
          </div>
        </div>
        {dateError && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{dateError}</p>}
        {report?.report_period && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Report Period: <span className="font-medium text-slate-700 dark:text-slate-200">{report.report_period.label}</span></p>}
      </section>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 flex items-center justify-between gap-3"><span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</span><button onClick={() => void fetchReport(appliedRange)} className="cursor-pointer rounded-lg border border-rose-300 px-3 py-1.5 hover:bg-rose-100 dark:border-rose-400/30 dark:hover:bg-rose-500/10 focus:outline-none focus:ring-2 focus:ring-rose-400">Retry</button></div>}
      {loading && <div className="h-24 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322] dark:shadow-none flex items-center justify-center text-sm text-slate-600 dark:text-slate-400">Loading quality report...</div>}

      {!loading && report && <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><KpiCard label="INSPECTION SUMMARY" value={summary?.completed_inspections ?? 0} subtext="Inspections completed" icon={<ClipboardList className="w-6 h-6" />} iconBg="bg-blue-50 dark:bg-blue-500/10" iconColor="text-blue-600 dark:text-blue-400" /><KpiCard label="PASSED" value={`${summary?.passed_rate ?? 0}%`} subtext={`${summary?.passed_count ?? 0} batches`} icon={<CheckCircle2 className="w-6 h-6" />} iconBg="bg-emerald-50 dark:bg-emerald-500/10" iconColor="text-emerald-600 dark:text-emerald-400" /><KpiCard label="REJECTED" value={`${summary?.rejected_rate ?? 0}%`} subtext={`${summary?.rejected_count ?? 0} batches • ${summary?.rejected_quantity ?? 0} units`} icon={<XCircle className="w-6 h-6" />} iconBg="bg-red-50 dark:bg-red-500/10" iconColor="text-red-600 dark:text-red-400" /></div>

        {!hasData && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600 shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322] dark:text-slate-400 dark:shadow-none">{hasCustomRange ? 'No completed inspections found for this period.' : 'No completed QA inspections are available for reporting.'}</div>}

        <div className="grid min-w-0 grid-cols-1 xl:grid-cols-12 gap-6"><div className="min-w-0 xl:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322] dark:shadow-none"><h3 className="text-lg font-semibold text-slate-900 dark:text-white">Inspection Trend</h3><p className="mb-4 text-sm text-slate-600 dark:text-slate-400">{hasCustomRange ? 'Daily Passed and Rejected QA inspections for the selected period.' : 'Daily Passed and Rejected QA inspections for the last 30 days.'}</p>{report.trend.length === 0 ? <EmptyChart message="No completed inspection trend data." /> : <ResponsiveContainer width="100%" height={300}><LineChart data={report.trend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} /><XAxis dataKey="date" stroke={chartAxisColor} tick={{ fill: chartAxisColor }} /><YAxis allowDecimals={false} stroke={chartAxisColor} tick={{ fill: chartAxisColor }} /><Tooltip contentStyle={tooltipStyle} /><ChartLegend iconType="circle" /><Line type="monotone" dataKey="passed" stroke="#22C55E" strokeWidth={2} name="Passed" isAnimationActive={mounted} /><Line type="monotone" dataKey="rejected" stroke="#EF4444" strokeWidth={2} name="Rejected" isAnimationActive={mounted} /></LineChart></ResponsiveContainer>}</div>
          <div className="min-w-0 xl:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322] dark:shadow-none"><h3 className="text-lg font-semibold text-slate-900 dark:text-white">Pass vs Reject</h3><p className="mb-4 text-sm text-slate-600 dark:text-slate-400">Distribution of completed Passed and Rejected outcomes.</p>{donutData.length === 0 ? <EmptyChart message="No Passed or Rejected outcome data." /> : <><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={donutData} cx="50%" cy="50%" innerRadius="60%" outerRadius="85%" paddingAngle={4} dataKey="value" isAnimationActive={mounted}>{donutData.map((entry) => <Cell key={entry.name} fill={entry.color} stroke={isDark ? '#0d1322' : '#FFFFFF'} strokeWidth={2} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart></ResponsiveContainer><div className="flex flex-wrap items-center justify-center gap-5 mt-4">{donutData.map((entry) => <span key={entry.name} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 font-medium"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />{entry.name} {entry.percentage}%</span>)}</div></>}</div></div>

        <div className="grid min-w-0 grid-cols-1 xl:grid-cols-2 gap-6"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322] dark:shadow-none"><h3 className="text-lg font-semibold text-slate-900 dark:text-white">Top Rejected Products</h3><p className="mb-4 text-sm text-slate-600 dark:text-slate-400">Sum of actual rejected quantity by product.</p>{report.top_rejected_products.length === 0 ? <EmptyChart message="No rejected quantities recorded." /> : <div className="max-h-[320px] space-y-1 overflow-y-auto pr-2 custom-scrollbar">{report.top_rejected_products.map((item, index) => { const maximum = report.top_rejected_products[0]?.quantity || 1; const width = Math.max(4, (item.quantity / maximum) * 100); return <div key={item.product} className="border-b border-slate-200 px-1 py-3 last:border-b-0 dark:border-slate-800/80"><div className="mb-2 flex items-start justify-between gap-4"><div className="min-w-0 flex-1"><span className="mr-2 text-xs font-semibold text-slate-500">{index + 1}</span><span className="break-words text-sm leading-5 text-slate-700 dark:text-slate-200">{item.product}</span></div><span className="shrink-0 text-sm font-semibold tabular-nums text-cyan-600 dark:text-cyan-400">{item.quantity.toLocaleString()}</span></div><div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="img" aria-label={`${item.product}: ${item.quantity} rejected`}><div className="h-full rounded-full bg-cyan-500 transition-[width] duration-700" style={{ width: mounted ? `${width}%` : '0%' }} /></div></div>; })}</div>}</div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322] dark:shadow-none"><h3 className="text-lg font-semibold text-slate-900 dark:text-white">Supplier Quality Rating</h3><p className="mb-4 text-sm text-slate-600 dark:text-slate-400">Accepted quantity as a share of inspected quantity.</p>{report.supplier_quality.length === 0 ? <EmptyChart message="No supplier inspection data." /> : <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">{report.supplier_quality.map((item) => <div key={item.name}><div className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-700 dark:text-slate-200 truncate">{item.name}</span><span className="text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap">{item.pass_rate}% • {item.inspections} insp.</span></div><div className="w-full h-1.5 bg-slate-200 dark:bg-gray-800 rounded-full mt-1 overflow-hidden"><div className="h-full rounded-full bg-cyan-500" style={{ width: mounted ? `${item.pass_rate}%` : '0%', transition: 'width 1s ease-out 0.4s' }} /></div></div>)}</div>}</div></div>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322] dark:shadow-none">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Inspection Evidence</h3>
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">Evidence retained with completed inspections.</p>
          <div className="space-y-3">{report.inspection_evidence.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">{hasCustomRange ? 'No completed inspections found for this period.' : 'No completed inspection evidence is available.'}</p> : report.inspection_evidence.map((inspection) => <details key={inspection.inspection_id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-cyan-500"><span className="mr-2">{inspection.receiving_no}</span><span className="text-slate-500">{inspection.supplier} • Evidence: {inspection.attachments.length} files</span></summary><div className="mt-3"><EvidenceGallery attachments={inspection.attachments} receivingId={inspection.receiving_id} /></div></details>)}</div>
        </section>
      </>}
    </div>
  );
};

export default QualityReports;
