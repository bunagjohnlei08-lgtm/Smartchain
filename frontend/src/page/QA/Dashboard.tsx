import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { AxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, ClipboardCheck, CheckCircle2, XCircle, Gauge, ArrowRight, History, RefreshCw } from 'lucide-react';
import { apiClient } from '../../lib/api';

interface DashboardActivity {
  id: number; user: string | null; status: 'Passed' | 'Rejected' | 'Partial';
  receiving_no: string | null; product: string | null; completed_at: string | null;
}

interface DashboardQueueItem {
  id: number; receiving_no: string; purchase_order: string; supplier: string;
  product: string | null; quantity: number; delivery_date: string | null; status: 'Pending' | 'In Progress';
}

interface DashboardResponse {
  todays_inspections: number; pending_inspection: number; approved_products: number;
  rejected_products: number; inspection_rate: number;
  recent_activities: DashboardActivity[]; inspection_queue: DashboardQueueItem[];
}

const emptyDashboard: DashboardResponse = {
  todays_inspections: 0, pending_inspection: 0, approved_products: 0,
  rejected_products: 0, inspection_rate: 0, recent_activities: [], inspection_queue: [],
};

function apiErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError<{ message?: string }>;
  if (axiosError.response?.status === 401) return 'Session expired. Please log in again.';
  if (axiosError.response?.status === 403) return 'You do not have permission to view the QA Dashboard.';
  return axiosError.response?.data?.message || 'Unable to load dashboard data. Please try again.';
}

function relativeTime(value: string | null): string {
  if (!value) return '-';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '-';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

const StatusBadge: React.FC<{ status: DashboardQueueItem['status'] }> = ({ status }) => {
  const style = status === 'In Progress'
    ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
    : 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  return <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${style}`}>{status}</span>;
};

const QADashboard: React.FC = () => {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardResponse>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<DashboardResponse>('/qa/dashboard');
      setDashboard(response.data);
    } catch (requestError) {
      setDashboard(emptyDashboard);
      setError(apiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const firstName = useMemo(() => {
    try {
      const raw = sessionStorage.getItem('user');
      const name = raw ? (JSON.parse(raw) as { name?: string }).name?.trim() : '';
      return name ? name.split(/\s+/)[0] : 'User';
    } catch { return 'User'; }
  }, []);

  const dateLabel = useMemo(() => new Intl.DateTimeFormat('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date()), []);

  const metrics = [
    { label: "TODAY'S INSPECTIONS", value: dashboard.todays_inspections, subtitle: 'Completed today', icon: ClipboardList, bg: 'bg-teal-500/10', color: 'text-teal-400' },
    { label: 'PENDING INSPECTION', value: dashboard.pending_inspection, subtitle: 'Awaiting QA action', icon: ClipboardCheck, bg: 'bg-amber-500/10', color: 'text-amber-400' },
    { label: 'APPROVED PRODUCTS', value: dashboard.approved_products, subtitle: 'Total accepted quantity', icon: CheckCircle2, bg: 'bg-emerald-500/10', color: 'text-emerald-400' },
    { label: 'REJECTED PRODUCTS', value: dashboard.rejected_products, subtitle: 'Total rejected quantity', icon: XCircle, bg: 'bg-red-500/10', color: 'text-red-400' },
    { label: 'INSPECTION RATE', value: `${dashboard.inspection_rate}%`, subtitle: 'Passed completed inspections', icon: Gauge, bg: 'bg-emerald-500/10', color: 'text-emerald-400' },
  ];

  return (
    <div className="w-full min-w-0 max-w-7xl mx-auto p-4 md:p-6 space-y-6 overflow-x-hidden bg-[#090d16] text-slate-100 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-white">Good afternoon, {firstName}</h1><p className="text-sm text-slate-400">{dateLabel} — receiving inspection summary.</p></div>
        <button onClick={() => navigate('/qa/inspection')} className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 bg-[#092635] hover:opacity-90 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:hover:opacity-100 dark:text-slate-950 font-semibold"><ClipboardCheck className="w-4 h-4" /> Start Inspection</button>
      </div>

      {error && <div className="flex items-center justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300"><span>{error}</span><button onClick={loadDashboard} className="inline-flex items-center gap-2 text-red-200 hover:text-white"><RefreshCw className="h-4 w-4" /> Retry</button></div>}

      <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return <div key={metric.label} className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 hover:border-gray-700 transition-all"><div className="flex items-start justify-between"><div><p className="text-xs font-medium uppercase tracking-wider text-slate-400">{metric.label}</p><p className="text-2xl font-bold text-white mt-1.5">{loading ? '—' : metric.value}</p><p className="text-xs text-slate-500 mt-1">{metric.subtitle}</p></div><div className={`p-2.5 rounded-full ${metric.bg} ${metric.color}`}><Icon className="w-6 h-6" /></div></div></div>;
        })}
      </div>

      <div className="flex min-w-0 flex-col xl:flex-row gap-6">
        <div className="w-full min-w-0 xl:w-1/3"><div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 h-full"><h3 className="text-lg font-semibold text-white">Quick Actions</h3><p className="text-sm text-slate-400 mb-4">Jump straight into your daily QA tasks.</p><div className="space-y-2">
          <button onClick={() => navigate('/qa/inspection')} className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 text-slate-200"><span className="flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-cyan-400" />Start Inspection</span><ArrowRight className="w-4 h-4 text-slate-400" /></button>
          <button onClick={() => navigate('/qa/history')} className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 text-slate-200"><span className="flex items-center gap-2"><History className="w-4 h-4 text-amber-400" />Inspection History</span><ArrowRight className="w-4 h-4 text-slate-400" /></button>
        </div></div></div>

        <div className="w-full min-w-0 xl:w-2/3"><div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 h-full"><h3 className="text-lg font-semibold text-white">Recent Activities</h3><p className="text-sm text-slate-400 mb-4">Latest completed quality inspections.</p>
          {loading ? <p className="text-sm text-slate-500">Loading recent activities…</p> : dashboard.recent_activities.length === 0 ? <p className="rounded-xl bg-slate-800/30 p-4 text-sm text-slate-500">No recent QA activities.</p> : <div className="space-y-3">{dashboard.recent_activities.map((activity) => <div key={activity.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800/50"><span className={`mt-1 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${activity.status === 'Passed' ? 'bg-emerald-400' : activity.status === 'Rejected' ? 'bg-red-400' : 'bg-purple-400'}`} /><div className="min-w-0 flex-1"><p className="text-sm text-slate-200"><span className="font-medium text-white">{activity.user || 'QA Supervisor'}</span> completed <span className="text-slate-300">{activity.receiving_no || 'an inspection'} — {activity.status}{activity.product ? ` (${activity.product})` : ''}</span></p><p className="mt-0.5 text-xs text-slate-500">{relativeTime(activity.completed_at)}</p></div></div>)}</div>}
        </div></div>
      </div>

      <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5"><div className="flex flex-col items-start justify-between gap-3 mb-4 sm:flex-row sm:items-center"><div><h3 className="text-lg font-semibold text-white">Inspection Queue</h3><p className="text-sm text-slate-400">Deliveries waiting for QA action.</p></div><button onClick={() => navigate('/qa/inspection')} className="text-sm text-cyan-400 hover:text-cyan-300">View all</button></div>
        {loading ? <p className="text-sm text-slate-500">Loading inspection queue…</p> : dashboard.inspection_queue.length === 0 ? <p className="rounded-xl bg-slate-800/30 p-4 text-sm text-slate-500">No receiving records are waiting for QA inspection.</p> : <div className="space-y-3">{dashboard.inspection_queue.map((item) => <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 border border-gray-800/30"><div><p className="text-sm font-medium text-white">{item.product || 'Receiving products'}</p><p className="text-xs text-slate-400">{item.supplier} • {item.purchase_order} • {item.receiving_no}</p><p className="text-xs text-slate-500 mt-1">{item.quantity.toLocaleString()} delivered units</p></div><div className="flex items-center gap-3 mt-2 sm:mt-0"><StatusBadge status={item.status} /><button onClick={() => navigate('/qa/inspection')} className="px-3 py-1.5 rounded-lg bg-[#092635] hover:opacity-90 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:hover:opacity-100 dark:text-slate-950 text-xs font-medium">Inspect</button></div></div>)}</div>}
      </div>
    </div>
  );
};

export default QADashboard;
