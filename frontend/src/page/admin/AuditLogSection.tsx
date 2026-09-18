import React, { useCallback, useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { ChevronLeft, ChevronRight, Eye, Filter, Loader2, Search, ShieldCheck, X } from 'lucide-react';
import { apiClient } from '../../lib/api';
import type { ApiAuditLog } from '../../types';

interface AuditLogPage {
  data: ApiAuditLog[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

interface AuditFilters {
  search: string;
  action: string;
  module: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: AuditFilters = { search: '', action: '', module: '', status: '', dateFrom: '', dateTo: '' };

const inputClass =
  'h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 placeholder-slate-500 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-600/30 dark:border-gray-700 dark:bg-gray-800/50 dark:text-white dark:placeholder-slate-400';

function errorMessage(error: unknown): string {
  const status = (error as AxiosError).response?.status;
  if (status === 401) return 'Session expired. Please log in again.';
  if (status === 403) return 'You do not have permission to view audit logs.';
  return 'Audit logs could not be loaded. Please try again.';
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function actorLabel(log: ApiAuditLog): string {
  return log.actor_name || log.actor_identifier || 'Unknown user';
}

function targetLabel(log: ApiAuditLog): string {
  return log.resource_label || (log.resource_type ? `${log.resource_type}${log.resource_id ? ` #${log.resource_id}` : ''}` : '—');
}

const StatusBadge: React.FC<{ status: ApiAuditLog['status'] }> = ({ status }) => (
  <span
    className={`admin-badge inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
      status === 'SUCCESS'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400'
        : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400'
    }`}
  >
    {status === 'SUCCESS' ? 'Success' : 'Failed'}
  </span>
);

const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="min-w-0">
    <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="mt-0.5 break-words text-xs text-slate-900 dark:text-white">{value || '—'}</dd>
  </div>
);

const AuditLogDetails: React.FC<{ log: ApiAuditLog; onClose: () => void }> = ({ log, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-log-details-title"
      className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-[#0d1322]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="audit-log-details-title" className="text-base font-semibold text-slate-900 dark:text-white">{log.action}</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">{formatDateTime(log.created_at)} · {log.module}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close audit log details"
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DetailRow label="User" value={actorLabel(log)} />
        <DetailRow label="Status" value={<StatusBadge status={log.status} />} />
        <DetailRow label="Target" value={targetLabel(log)} />
        <DetailRow label="IP address" value={log.ip_address} />
        <div className="sm:col-span-2"><DetailRow label="Details" value={log.details} /></div>
        <div className="sm:col-span-2"><DetailRow label="User agent" value={log.user_agent} /></div>
      </dl>
      {log.metadata && Object.keys(log.metadata).length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Additional data</p>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] text-slate-800 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200">
            {JSON.stringify(log.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  </div>
);

const AuditLogSection: React.FC = () => {
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuditLogPage | null>(null);
  const [options, setOptions] = useState<{ actions: string[]; modules: string[] }>({ actions: [], modules: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApiAuditLog | null>(null);

  // Debounce free-text search so typing does not issue a request per keystroke.
  useEffect(() => {
    if (search === filters.search) return undefined;
    const timer = window.setTimeout(() => {
      setFilters((current) => ({ ...current, search }));
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, filters.search]);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<AuditLogPage>('/admin/audit-logs', {
        params: {
          page,
          search: filters.search || undefined,
          action: filters.action || undefined,
          module: filters.module || undefined,
          status: filters.status || undefined,
          date_from: filters.dateFrom || undefined,
          date_to: filters.dateTo || undefined,
        },
      });
      setResult(response.data);
    } catch (e) {
      setError(errorMessage(e));
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    apiClient
      .get<{ actions: string[]; modules: string[] }>('/admin/audit-logs/options')
      .then((response) => setOptions(response.data))
      .catch(() => {
        // Filters still work with the "All" defaults if options fail to load.
      });
  }, []);

  const updateFilter = (key: keyof AuditFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const resetFilters = () => {
    setSearch('');
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const logs = result?.data ?? [];
  const lastPage = result?.last_page ?? 1;

  return (
    <section aria-labelledby="audit-logs-title" className="admin-audit-section space-y-3 border-t border-slate-200 pt-6 dark:border-slate-800">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-slate-100 p-2 text-slate-700 dark:bg-gray-800/50 dark:text-slate-300">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 id="audit-logs-title" className="text-lg font-bold tracking-tight text-slate-900 dark:text-white sm:text-xl">Audit Logs</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Authentication and administrative activity, newest first. Records are read-only.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-gray-800/50 dark:bg-[#0d1322]">
        <div className="relative min-w-[220px] flex-[2]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user, action, or resource..."
            aria-label="Search audit logs"
            className={`${inputClass} pl-8`}
          />
        </div>
        <select value={filters.action} onChange={(e) => updateFilter('action', e.target.value)} aria-label="Filter by action" className={`${inputClass} min-w-[130px] flex-1 cursor-pointer`}>
          <option value="">All Actions</option>
          {options.actions.map((action) => <option key={action} value={action}>{action}</option>)}
        </select>
        <select value={filters.module} onChange={(e) => updateFilter('module', e.target.value)} aria-label="Filter by module" className={`${inputClass} min-w-[130px] flex-1 cursor-pointer`}>
          <option value="">All Modules</option>
          {options.modules.map((module) => <option key={module} value={module}>{module}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)} aria-label="Filter by status" className={`${inputClass} min-w-[110px] flex-1 cursor-pointer`}>
          <option value="">All Status</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
        </select>
        <input type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(e) => updateFilter('dateFrom', e.target.value)} aria-label="From date" className={`${inputClass} min-w-[130px] flex-1`} />
        <input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(e) => updateFilter('dateTo', e.target.value)} aria-label="To date" className={`${inputClass} min-w-[130px] flex-1`} />
        <button
          type="button"
          onClick={resetFilters}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-600/50 dark:border-gray-700 dark:bg-gray-800/50 dark:text-white dark:hover:bg-gray-800"
        >
          <Filter className="h-3.5 w-3.5" /> Reset
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800/80 dark:bg-[#0b101d]">
        <div className="admin-audit-scroll w-full min-w-0 max-w-full overflow-x-auto custom-scrollbar">
          <table className="admin-audit-table w-full min-w-[980px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[128px]" />
              <col className="w-[150px]" />
              <col className="w-[150px]" />
              <col className="w-[130px]" />
              <col className="w-[120px]" />
              <col className="w-[84px]" />
              <col className="w-[112px]" />
              <col />
            </colgroup>
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-[#0b101d]">
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                <th className="whitespace-nowrap px-3 py-3">Date / Time</th>
                <th className="whitespace-nowrap px-3 py-3">User</th>
                <th className="whitespace-nowrap px-3 py-3">Action</th>
                <th className="whitespace-nowrap px-3 py-3">Module</th>
                <th className="whitespace-nowrap px-3 py-3">Target</th>
                <th className="whitespace-nowrap px-3 py-3">Status</th>
                <th className="whitespace-nowrap px-3 py-3">IP Address</th>
                <th className="whitespace-nowrap px-3 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="text-xs text-slate-700 dark:text-slate-300">
              {isLoading && logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading audit logs...</span>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-rose-600 dark:text-rose-400">{error}</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500 dark:text-slate-400">No audit records match your filters.</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className={`border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800/40 dark:hover:bg-slate-800/20 ${isLoading ? 'opacity-60' : ''}`}>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">{formatDateTime(log.created_at)}</td>
                    <td className="truncate px-3 py-2.5 font-medium text-slate-900 dark:text-white" title={actorLabel(log)}>{actorLabel(log)}</td>
                    <td className="truncate px-3 py-2.5 font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200" title={log.action}>{log.action}</td>
                    <td className="truncate px-3 py-2.5" title={log.module}>{log.module}</td>
                    <td className="truncate px-3 py-2.5 font-mono text-[11px]" title={targetLabel(log)}>{targetLabel(log)}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={log.status} /></td>
                    <td className="truncate px-3 py-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">{log.ip_address || '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 flex-1 truncate" title={log.details ?? undefined}>{log.details || '—'}</span>
                        <button
                          type="button"
                          onClick={() => setSelected(log)}
                          title="View details"
                          aria-label={`View details for ${log.action}`}
                          className="shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {result && result.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Showing <span className="font-medium text-slate-900 dark:text-white">{result.from}</span> to{' '}
              <span className="font-medium text-slate-900 dark:text-white">{result.to}</span> of{' '}
              <span className="font-medium text-slate-900 dark:text-white">{result.total}</span> records
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                aria-label="Previous page"
                className="rounded-lg border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-slate-400 dark:hover:bg-gray-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-slate-600 dark:text-slate-400">Page {result.current_page} of {lastPage}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                disabled={page >= lastPage || isLoading}
                aria-label="Next page"
                className="rounded-lg border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-slate-400 dark:hover:bg-gray-800"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selected && <AuditLogDetails log={selected} onClose={() => setSelected(null)} />}
    </section>
  );
};

export default AuditLogSection;
