import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardCheck, Clock3, Hash, MinusCircle, Package, Paperclip, RefreshCcw, Search, UserRound, UsersRound, XCircle } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { formatStatusLabel, normalizeInspectionStatus } from './inspectionStatus';
import { EvidenceGallery, type QaAttachment } from './components/EvidenceGallery';

type DecisionStatus = 'Passed' | 'Partial' | 'Rejected';
type TimeFilter = 'Today' | 'This Week' | 'This Month';
type SortOrder = 'newest' | 'oldest';

interface InspectionHistoryApi {
  receiving_id: number; id: number; receiving_no: string; supplier: string; product: string | null;
  accepted_qty: number; rejected_qty: number; inspection_result: unknown; remarks: string | null;
  inspected_by: string | null; submitted_by: string | null; completed_at: string | null; attachments: QaAttachment[];
}

interface InspectionRecord {
  receivingId: number; id: string; product: string; supplier: string; inspector: string; completedAt: string;
  passed: number; rejected: number; receivingNo: string; status: unknown; normalizedStatus: DecisionStatus | null;
  remarks: string; attachments: QaAttachment[];
}

const timeFilters: TimeFilter[] = ['Today', 'This Week', 'This Month'];
const statusOptions: Array<'All decisions' | DecisionStatus> = ['All decisions', 'Passed', 'Partial'];
const statusStyles: Record<DecisionStatus, { accent: string; badge: string; icon: React.ReactNode }> = {
  Passed: { accent: 'bg-emerald-500', badge: 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300', icon: <CheckCircle2 className="h-3 w-3" /> },
  Partial: { accent: 'bg-amber-500', badge: 'border-amber-700 bg-amber-700 text-white dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300', icon: <MinusCircle className="h-3 w-3" /> },
  Rejected: { accent: 'bg-red-500', badge: 'border-red-700 bg-red-700 text-white dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300', icon: <XCircle className="h-3 w-3" /> },
};

const StatusBadge: React.FC<{ status: unknown }> = ({ status }) => {
  const normalized = normalizeInspectionStatus(status);
  const known = normalized && normalized in statusStyles ? normalized as DecisionStatus : null;
  const config = known ? statusStyles[known] : { badge: 'border-slate-700 bg-slate-700 text-white dark:border-slate-400/30 dark:bg-slate-500/10 dark:text-slate-300', icon: <AlertCircle className="h-3 w-3" /> };
  return <span className={`qa-badge inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold sm:text-xs ${known === 'Partial' ? 'qa-badge-attention' : ''} ${config.badge}`}>{config.icon}{known ?? formatStatusLabel(status)}</span>;
};

const isWithinTimeFilter = (value: string, filter: TimeFilter): boolean => {
  const completedAt = new Date(value);
  if (Number.isNaN(completedAt.getTime())) return false;
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (filter === 'This Week') start.setDate(start.getDate() - start.getDay());
  if (filter === 'This Month') start.setDate(1);
  return completedAt >= start && completedAt <= now;
};

const formatInspectionDate = (value: string): string => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
};

const InspectionHistory: React.FC = () => {
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [activeTimeFilter, setActiveTimeFilter] = useState<TimeFilter>('This Week');
  const [supplier, setSupplier] = useState('All suppliers');
  const [product, setProduct] = useState('All products');
  const [status, setStatus] = useState<'All decisions' | DecisionStatus>('All decisions');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await apiClient.get<{ data: InspectionHistoryApi[] }>('/qa/inspection-history');
      const history = (response.data.data ?? []).map((item) => {
        const normalized = normalizeInspectionStatus(item.inspection_result);
        return {
          id: String(item.id), receivingId: item.receiving_id, product: item.product ?? '-', supplier: item.supplier,
          inspector: item.submitted_by ?? item.inspected_by ?? '-', completedAt: item.completed_at ?? '', passed: item.accepted_qty,
          rejected: item.rejected_qty, receivingNo: item.receiving_no, status: item.inspection_result,
          normalizedStatus: normalized && ['Passed', 'Partial', 'Rejected'].includes(normalized) ? normalized as DecisionStatus : null,
          remarks: item.remarks?.trim() || '-', attachments: item.attachments ?? [],
        };
      });
      setRecords(history.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)));
    } catch { setError('Unable to load inspection history. Please try again.'); setRecords([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);
  const supplierOptions = useMemo(() => ['All suppliers', ...Array.from(new Set(records.map((item) => item.supplier))).sort()], [records]);
  const productOptions = useMemo(() => ['All products', ...Array.from(new Set(records.map((item) => item.product))).sort()], [records]);
  const summary = useMemo(() => ({
    total: records.length,
    passed: records.filter((item) => item.normalizedStatus === 'Passed').length,
    partial: records.filter((item) => item.normalizedStatus === 'Partial').length,
    rejected: records.filter((item) => item.normalizedStatus === 'Rejected').length,
  }), [records]);
  const filteredData = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return records.filter((item) =>
      (supplier === 'All suppliers' || item.supplier === supplier) &&
      (product === 'All products' || item.product === product) &&
      (status === 'All decisions' || item.normalizedStatus === status) &&
      isWithinTimeFilter(item.completedAt, activeTimeFilter) &&
      (!query || [item.supplier, item.product, item.receivingNo].some((value) => value.toLocaleLowerCase().includes(query)))
    ).sort((a, b) => sortOrder === 'newest' ? Date.parse(b.completedAt) - Date.parse(a.completedAt) : Date.parse(a.completedAt) - Date.parse(b.completedAt));
  }, [activeTimeFilter, product, records, searchQuery, sortOrder, status, supplier]);

  const clearFilters = () => { setSearchQuery(''); setActiveTimeFilter('This Week'); setSupplier('All suppliers'); setProduct('All products'); setStatus('All decisions'); setSortOrder('newest'); };
  const metricCards = [
    { label: 'Total inspections', value: summary.total, helper: 'Completed inspections', icon: ClipboardCheck, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-300' },
    { label: 'Passed', value: summary.passed, helper: summary.total ? `${Math.round(summary.passed / summary.total * 100)}% of total` : '0% of total', icon: CheckCircle2, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
    { label: 'Partial', value: summary.partial, helper: summary.total ? `${Math.round(summary.partial / summary.total * 100)}% of total` : '0% of total', icon: MinusCircle, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-300' },
    { label: 'Rejected', value: summary.rejected, helper: summary.total ? `${Math.round(summary.rejected / summary.total * 100)}% of total` : '0% of total', icon: XCircle, color: 'bg-red-500/10 text-red-600 dark:text-red-300' },
  ];
  const controlClass = 'h-9 w-full min-w-0 rounded-lg border border-(--border-color-strong) bg-(--bg-input) px-2.5 text-xs text-(--text-primary) outline-none transition-colors focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 md:h-10 md:text-sm';

  return <div className="w-full max-w-7xl mx-auto min-h-screen space-y-4 bg-(--bg-app) p-4 text-(--text-primary) md:space-y-6 md:p-6">
    <header><h1 className="text-[15px] font-bold text-(--text-primary) md:text-2xl">Inspection History</h1><p className="mt-1 text-[10px] text-(--text-muted) sm:text-[11px] md:text-sm">Review completed quality inspections and delivery decisions.</p></header>

    <section aria-label="Inspection summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metricCards.map(({ label, value, helper, icon: Icon, color }) => <article key={label} className="flex min-w-0 items-start justify-between gap-2 rounded-xl border border-(--border-color) bg-(--bg-surface) p-3 shadow-sm dark:shadow-none md:p-5">
        <div className="min-w-0"><p className="truncate text-[10px] font-semibold uppercase tracking-wide text-(--text-muted) md:text-xs">{label}</p><p className="mt-1 text-base font-bold tabular-nums md:text-2xl">{loading ? '—' : value.toLocaleString()}</p><p className="mt-0.5 truncate text-[10px] text-(--text-muted) md:text-xs">{helper}</p></div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg md:h-10 md:w-10 ${color}`}><Icon className="h-4 w-4 md:h-5 md:w-5" /></span>
      </article>)}
    </section>

    <section aria-label="Inspection history filters" className="rounded-xl border border-(--border-color) bg-(--bg-surface) p-3 shadow-sm dark:shadow-none md:p-4">
      <div className="grid min-w-0 grid-cols-2 gap-2 md:grid-cols-12 md:gap-3">
        <label className="relative col-span-2 block md:col-span-3"><span className="sr-only">Search supplier, product, or receiving number</span><Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-(--text-muted) md:h-4 md:w-4" /><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search supplier, product, or receiving #" className={`${controlClass} pl-8 md:pl-9`} /></label>
        <div className="col-span-2 flex min-w-0 gap-1 rounded-lg border border-(--border-color-strong) bg-(--bg-input) p-1 md:col-span-3" role="group" aria-label="Date range">
          {timeFilters.map((label) => <button key={label} type="button" onClick={() => setActiveTimeFilter(label)} aria-pressed={activeTimeFilter === label} className={`h-7 min-w-0 flex-1 cursor-pointer rounded-md px-1 text-[10px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-slate-950 dark:focus-visible:outline-cyan-500 md:h-8 md:text-xs ${activeTimeFilter === label ? 'bg-slate-950 text-white dark:bg-cyan-500 dark:text-slate-950' : 'bg-white text-slate-900 hover:bg-slate-950 hover:text-white dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'}`}>{label}</button>)}
        </div>
        <label className="min-w-0 md:col-span-2"><span className="sr-only">Supplier</span><select value={supplier} onChange={(event) => setSupplier(event.target.value)} className={controlClass}>{supplierOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label className="min-w-0 md:col-span-2"><span className="sr-only">Product</span><select value={product} onChange={(event) => setProduct(event.target.value)} className={controlClass}>{productOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
        <div className="col-span-2 flex min-w-0 gap-2 md:col-span-2 md:gap-3">
          <label className="min-w-0 flex-1"><span className="sr-only">Status</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className={controlClass}>{statusOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
          <button type="button" onClick={clearFilters} className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 text-(--text-secondary) transition-colors hover:bg-(--bg-hover) focus-visible:outline-2 focus-visible:outline-cyan-500 md:h-10 md:w-10 md:border md:border-(--border-color-strong)" aria-label="Clear all filters" title="Clear all filters"><RefreshCcw className="h-3 w-3 md:h-4 md:w-4" /></button>
        </div>
      </div>
    </section>

    {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-700 dark:text-rose-300 md:text-sm"><span>{error}</span><button type="button" onClick={fetchHistory} className="h-9 cursor-pointer rounded-lg border border-rose-500/30 px-3 font-medium hover:bg-rose-500/10 focus-visible:outline-2 focus-visible:outline-rose-500">Retry</button></div>}

    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] font-medium text-(--text-secondary) md:text-sm">{loading ? 'Loading inspections…' : `${filteredData.length.toLocaleString()} inspection${filteredData.length === 1 ? '' : 's'} found`}</p><label className="flex items-center gap-2 text-[11px] text-(--text-muted) md:text-xs"><span>Sort by</span><select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)} className="h-8 rounded-lg border border-(--border-color-strong) bg-(--bg-input) px-2 text-xs text-(--text-primary) outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 md:h-9"><option value="newest">Date (Newest first)</option><option value="oldest">Date (Oldest first)</option></select></label></div>

    <section aria-label="Inspection records" className="space-y-3 md:space-y-4">
      {loading ? <div className="grid gap-3" aria-label="Loading inspection history">{[0, 1, 2].map((item) => <div key={item} className="h-44 animate-pulse rounded-xl border border-(--border-color) bg-(--bg-surface) motion-reduce:animate-none" />)}</div>
      : filteredData.length === 0 ? <div className="rounded-xl border border-dashed border-(--border-color-strong) bg-(--bg-surface) px-4 py-12 text-center"><ClipboardCheck className="mx-auto h-8 w-8 text-(--text-muted)" /><h2 className="mt-3 text-sm font-semibold">No inspections found</h2><p className="mt-1 text-xs text-(--text-muted)">Try adjusting your filters.</p></div>
      : filteredData.map((record) => <article key={record.id} className="relative overflow-hidden rounded-xl border border-(--border-color) bg-(--bg-surface) shadow-sm dark:shadow-none">
        <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${record.normalizedStatus ? statusStyles[record.normalizedStatus].accent : 'bg-slate-500'}`} />
        <div className="space-y-4 p-4 pl-5 md:p-5 md:pl-6">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-[15px] font-semibold md:text-lg">{record.product}</h2><p className="mt-1 flex items-center gap-1.5 text-xs text-(--text-secondary) md:text-sm"><UsersRound className="h-3 w-3 shrink-0 text-(--text-muted) md:h-4 md:w-4" /><span className="truncate">{record.supplier}</span></p></div><StatusBadge status={record.status} /></div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-4 border-y border-(--border-color) py-4 md:grid-cols-5">
            <div className="col-span-2 min-w-0 md:col-span-1"><dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-(--text-muted) md:text-xs"><UserRound className="h-3 w-3" />Inspected by</dt><dd className="mt-1 truncate text-xs font-medium md:text-sm">{record.inspector}</dd></div>
            <div className="col-span-2 min-w-0 md:col-span-2"><dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-(--text-muted) md:text-xs"><Clock3 className="h-3 w-3" />Date &amp; time</dt><dd className="mt-1 text-xs font-medium md:text-sm">{formatInspectionDate(record.completedAt)}</dd></div>
            <div className="min-w-0"><dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-(--text-muted) md:text-xs"><Hash className="h-3 w-3" />Receiving</dt><dd className="mt-1 truncate font-mono text-xs font-semibold md:text-sm">{record.receivingNo}</dd></div>
            <div className="grid grid-cols-2 gap-2"><div><dt className="text-[10px] font-medium uppercase tracking-wide text-(--text-muted) md:text-xs">Accepted</dt><dd className="mt-1 text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400 md:text-sm">{record.passed.toLocaleString()}</dd></div><div><dt className="text-[10px] font-medium uppercase tracking-wide text-(--text-muted) md:text-xs">Rejected</dt><dd className="mt-1 text-xs font-bold tabular-nums text-red-600 dark:text-red-400 md:text-sm">{record.rejected.toLocaleString()}</dd></div></div>
          </dl>
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
            <div className="min-w-0 rounded-lg bg-(--bg-surface-alt) p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-(--text-muted) md:text-xs">Notes</p><p className="mt-1 break-words text-xs leading-5 text-(--text-secondary) md:text-sm">{record.remarks}</p></div>
            <details className="group min-w-0 rounded-lg border border-(--border-color) bg-(--bg-surface-alt) p-3"><summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-cyan-500 md:text-sm"><span className="flex min-w-0 items-center gap-2"><Paperclip className="h-3.5 w-3.5 shrink-0 text-cyan-600 dark:text-cyan-400" /><span className="truncate">Attachments ({record.attachments.length})</span></span><span className="text-[10px] font-normal text-(--text-muted) md:text-xs">{record.attachments.length ? `${record.attachments.length} file${record.attachments.length === 1 ? '' : 's'} attached` : 'No attachments'}</span></summary>{record.attachments.length > 0 && <div className="mt-3 border-t border-(--border-color) pt-3"><EvidenceGallery attachments={record.attachments} receivingId={record.receivingId} /></div>}</details>
          </div>
          <div className="flex flex-col justify-end gap-2 sm:flex-row sm:items-center"><span className="hidden items-center gap-1.5 text-xs text-(--text-muted) sm:flex"><Package className="h-3.5 w-3.5" />Completed inspection record</span><Link to={`../inspection?receiving=${record.receivingId}`} className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-950 bg-slate-950 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-slate-950 dark:border-cyan-600/40 dark:bg-transparent dark:text-cyan-300 dark:hover:bg-cyan-500/10 dark:focus-visible:outline-cyan-500 md:h-10 md:text-sm sm:ml-auto">View Full Inspection <ArrowRight className="h-3.5 w-3.5" /></Link></div>
        </div>
      </article>)}
    </section>
  </div>;
};

export default InspectionHistory;
