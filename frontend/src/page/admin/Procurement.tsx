import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  X,
  Clock as ClockIcon,
  CheckCircle as CheckCircleIcon,
  XCircle,
  FileText,
  RefreshCw,
  LayoutGrid,
  Rows3,
  Eye,
  ChevronRight,
  Search,
} from 'lucide-react';
import { apiClient } from '../../lib/api';
import { useNavigate } from 'react-router-dom';

// ============================================
// TYPES
// ============================================

type Priority = 'Low' | 'Medium' | 'High' | 'Critical';
type RequestStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'for_purchase_order';

/**
 * A replenishment request raised by the Plant Manager. Admin Procurement only
 * reviews it — supplier, unit price, totals and delivery belong to the Purchase
 * Order workflow, so they are deliberately absent here.
 */
interface ReplenishmentRequest {
  id: number;
  request_no: string;
  product_id: number | null;
  product_name: string;
  warehouse_id: number | null;
  warehouse_name: string;
  requested_qty: number;
  priority: Priority;
  status: RequestStatus;
  requested_by: string | null;
  submitted_date: string | null;
  reviewed_by: string | null;
  approved_date: string | null;
  admin_decision: string | null;
}

interface ProcurementSummary {
  total_requests: number;
  pending_approval: number;
  approved: number;
  rejected: number;
  po_created: number;
  draft: number;
  for_purchase_order: number;
}

const emptySummary: ProcurementSummary = {
  total_requests: 0,
  pending_approval: 0,
  approved: 0,
  rejected: 0,
  po_created: 0,
  draft: 0,
  for_purchase_order: 0,
};

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<
    string,
    { color: string; bg: string; border: string; dotColor: string }
  > = {
    draft: {
      color: 'text-slate-700 dark:text-slate-300',
      bg: 'bg-slate-100 dark:bg-slate-500/10',
      border: 'border dark:border-slate-500/20 border-slate-200',
      dotColor: 'bg-slate-400',
    },
    pending: {
      color: 'text-amber-800 dark:text-amber-400',
      bg: 'bg-amber-100 dark:bg-amber-500/10',
      border: 'border dark:border-amber-500/20 border-amber-200',
      dotColor: 'bg-amber-500',
    },
    approved: {
      color: 'text-emerald-800 dark:text-emerald-400',
      bg: 'bg-emerald-100 dark:bg-emerald-500/10',
      border: 'border dark:border-emerald-500/20 border-emerald-200',
      dotColor: 'bg-emerald-500',
    },
    rejected: {
      color: 'text-red-800 dark:text-red-400',
      bg: 'bg-red-100 dark:bg-red-500/10',
      border: 'border dark:border-red-500/20 border-red-200',
      dotColor: 'bg-red-500',
    },
    for_purchase_order: {
      color: 'text-sky-800 dark:text-sky-400',
      bg: 'bg-sky-100 dark:bg-sky-500/10',
      border: 'border dark:border-sky-500/20 border-sky-200',
      dotColor: 'bg-sky-500',
    },
  };
  const labels: Record<string, string> = { draft: 'Draft', pending: 'Pending Approval', approved: 'Approved', rejected: 'Rejected', for_purchase_order: 'For Purchase Order' };
  const { color, bg, border, dotColor } = config[status] || config.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${color} ${bg} ${border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {labels[status] || status}
    </span>
  );
};

const PriorityBadge: React.FC<{ priority: Priority }> = ({ priority }) => {
  const config: Record<Priority, string> = {
    Low: 'text-blue-800 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20',
    Medium:
      'text-amber-800 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20',
    High: 'text-orange-800 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20',
    Critical:
      'text-red-800 dark:text-red-400 bg-red-100 dark:bg-red-500/10 border-red-200 dark:border-red-500/20',
  };
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${
        config[priority] || config.Medium
      }`}
    >
      {priority}
    </span>
  );
};

const KPICard: React.FC<{
  label: string;
  value: string | number;
  indicator: string;
  icon: React.ReactNode;
}> = ({ label, value, indicator, icon }) => {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-xl p-5 flex items-start justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </p>
        <p className="text-2xl font-bold text-[var(--text-primary)] mt-2">
          {value}
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-2">{indicator}</p>
      </div>
      <div className="p-2.5 bg-[var(--bg-hover)] rounded-lg">{icon}</div>
    </div>
  );
};

const SummaryStat: React.FC<{ label: string; value: number; accent: string }> = ({
  label,
  value,
  accent,
}) => (
  <div className="bg-[var(--bg-surface-alt)] border border-[var(--border-color)] rounded-lg p-4">
    <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
      {label}
    </p>
    <p className={`text-2xl font-bold mt-2 ${accent}`}>{value}</p>
  </div>
);

// ============================================
// MAIN COMPONENT
// ============================================

const Procurement: React.FC = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<ReplenishmentRequest[]>([]);
  const [summary, setSummary] = useState<ProcurementSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [pendingView, setPendingView] = useState<'cards' | 'table'>('cards');
  const [selectedRequest, setSelectedRequest] = useState<ReplenishmentRequest | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');

  const loadProcurement = useCallback(async () => {
    setLoading(true);
    try {
      const [requestsResponse, summaryResponse] = await Promise.all([
        apiClient.get('/admin/procurement/requests', { params: { per_page: 200 } }),
        apiClient.get('/admin/procurement/summary'),
      ]);
      setRequests(requestsResponse.data?.data ?? []);
      setSummary({ ...emptySummary, ...(summaryResponse.data ?? {}) });
      setLoadError('');
    } catch (error: any) {
      setLoadError(
        error?.response?.data?.message || 'Replenishment requests could not be loaded.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProcurement();
  }, [loadProcurement]);

  /** Records the Admin decision on the request; the Purchase Order is created later. */
  const handleDecision = async (request: ReplenishmentRequest, action: 'approve' | 'decline') => {
    setDecidingId(request.id);
    setActionError('');
    try {
      await apiClient.post(`/admin/procurement/requests/${request.id}/${action}`);
      await loadProcurement();
    } catch (error: any) {
      setActionError(
        error?.response?.data?.message ||
          (Object.values(error?.response?.data?.errors || {}).flat()[0] as string) ||
          `${request.request_no} could not be updated.`
      );
    } finally {
      setDecidingId(null);
    }
  };

  const handleGeneratePo = (request: ReplenishmentRequest) => {
    navigate('/admin/purchase-orders', {
      state: {
        replenishmentRequest: {
          id: request.id,
          requestNo: request.request_no,
          productName: request.product_name,
          orderedQuantity: request.requested_qty,
          warehouseLocation: request.warehouse_name,
        },
      },
    });
  };

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending'),
    [requests]
  );

  const approvedRequests = useMemo(
    () => requests.filter((request) => request.status === 'approved'),
    [requests]
  );

  const recentlyApproved = useMemo(
    () =>
      [...approvedRequests]
        .sort((a, b) => (b.approved_date ?? '').localeCompare(a.approved_date ?? ''))
        .slice(0, 5),
    [approvedRequests]
  );

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();
    return requests.filter((request) => {
      const matchesSearch = !query || [
        request.request_no,
        request.product_name,
        request.warehouse_name,
        request.requested_by ?? '',
      ].some((value) => value.toLowerCase().includes(query));
      const matchesStatus = statusFilter === 'All Status' || request.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [requests, search, statusFilter]);

  return (
    <div className="min-h-screen w-full bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors duration-200 p-6 space-y-6">
      {/* Breadcrumb & Header Row */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>SmartChain</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-[var(--text-primary)] font-medium">Procurement</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Procurement</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Review replenishment requests and prepare approved requests for purchasing.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void loadProcurement()}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] text-[var(--text-secondary)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] transition-all flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              onClick={() => setShowExportModal(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] text-[var(--text-secondary)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] transition-all flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Export summary
            </button>
          </div>
        </div>
      </div>

      {(loadError || actionError) && (
        <p
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-300"
        >
          {loadError || actionError}
        </p>
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Pending Requests"
          value={summary.pending_approval}
          indicator="Awaiting your approval"
          icon={<ClockIcon className="w-5 h-5 text-amber-500" />}
        />
        <KPICard
          label="Approved Requests"
          value={summary.approved}
          indicator="Approved replenishment requests"
          icon={<CheckCircleIcon className="w-5 h-5 text-emerald-500" />}
        />
        <KPICard
          label="For Purchase Order"
          value={summary.for_purchase_order}
          indicator="Approved, no PO yet"
          icon={<FileText className="w-5 h-5 text-cyan-500" />}
        />
        <KPICard
          label="Rejected Requests"
          value={summary.rejected}
          indicator="Declined by Admin"
          icon={<XCircle className="w-5 h-5 text-red-500" />}
        />
      </div>

      {/* All replenishment requests from the shared backend source */}
      <section className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-xl p-6">
        <div className="flex flex-col gap-4 mb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Replenishment Requests</h2>
            <p className="text-xs text-[var(--text-muted)]">Review and track requests submitted by Plant Managers.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="relative min-w-64">
              <span className="sr-only">Search replenishment requests</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search request, product, warehouse..."
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-600/50"
              />
            </label>
            <label>
              <span className="sr-only">Filter requests by status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-600/50"
              >
                <option value="All Status">All Status</option>
                <option value="pending">Pending Approval</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="for_purchase_order">For Purchase Order</option>
              </select>
            </label>
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="border-b border-[var(--border-color)]">
              <tr>
                {['Request No.', 'Requested By', 'Warehouse', 'Product', 'Requested Qty', 'Priority', 'Status', 'Date'].map((heading) => (
                  <th key={heading} className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{heading}</th>
                ))}
                <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((request) => (
                <tr key={request.id} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-surface-alt)] transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-[var(--text-primary)]">{request.request_no}</td>
                  <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{request.requested_by ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{request.warehouse_name}</td>
                  <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{request.product_name}</td>
                  <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{request.requested_qty.toLocaleString()}</td>
                  <td className="px-4 py-3"><PriorityBadge priority={request.priority} /></td>
                  <td className="px-4 py-3"><StatusBadge status={request.status} /></td>
                  <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{request.submitted_date ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => setSelectedRequest(request)} className="min-h-9 rounded-lg border border-[var(--border-color)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors">View</button>
                      {request.status === 'pending' && (
                        <>
                          <button onClick={() => void handleDecision(request, 'decline')} disabled={decidingId === request.id} className="min-h-9 rounded-lg border border-[var(--border-color)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50 transition-colors">Decline</button>
                          <button onClick={() => void handleDecision(request, 'approve')} disabled={decidingId === request.id} className="min-h-9 rounded-lg bg-[#00a3c4] px-3 text-xs font-semibold text-white hover:bg-[#008ca8] disabled:cursor-not-allowed disabled:opacity-50 transition-colors">Approve</button>
                        </>
                      )}
                      {request.status === 'approved' && (
                        <button onClick={() => handleGeneratePo(request)} className="min-h-9 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 transition-colors">Generate PO</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filteredRequests.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">No replenishment requests match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Main Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side - Pending Requests */}
        <div className="lg:col-span-2">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  Pending Requests
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Replenishment requests submitted by Plant Managers
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface-alt)]">
                <button
                  onClick={() => setPendingView('cards')}
                  className={`p-1.5 rounded-md transition-all ${
                    pendingView === 'cards'
                      ? 'bg-slate-900 text-white shadow-sm dark:bg-cyan-500 dark:text-slate-950'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                  title="Card view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPendingView('table')}
                  className={`p-1.5 rounded-md transition-all ${
                    pendingView === 'table'
                      ? 'bg-slate-900 text-white shadow-sm dark:bg-cyan-500 dark:text-slate-950'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                  title="Table view"
                >
                  <Rows3 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {loading && (
              <p className="text-sm text-[var(--text-muted)] py-6 text-center">
                Loading replenishment requests...
              </p>
            )}

            {!loading && pendingRequests.length === 0 && (
              <p className="text-sm text-[var(--text-muted)] py-6 text-center">
                No replenishment requests are waiting for approval.
              </p>
            )}

            {!loading && pendingRequests.length > 0 && pendingView === 'cards' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="bg-[var(--bg-surface-alt)] border border-[var(--border-color)] rounded-lg p-4 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="text-sm font-semibold text-[var(--text-primary)] leading-tight">
                          {request.product_name}
                        </h4>
                        <StatusBadge status={request.status} />
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mb-3">
                        {request.request_no} · {request.warehouse_name}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--text-secondary)] mb-3">
                        <span>Requested Qty: {request.requested_qty.toLocaleString()}</span>
                        <PriorityBadge priority={request.priority} />
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mb-4">
                        Requested by {request.requested_by ?? '—'} · {request.submitted_date ?? '—'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={() => setSelectedRequest(request)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-color)] text-[var(--text-secondary)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] transition-all"
                      >
                        View
                      </button>
                      <button
                        onClick={() => void handleDecision(request, 'decline')}
                        disabled={decidingId === request.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-color)] text-[var(--text-secondary)] bg-[var(--bg-hover)] hover:bg-[var(--bg-surface-alt)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => void handleDecision(request, 'approve')}
                        disabled={decidingId === request.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#00a3c4] hover:bg-[#008ca8] text-white shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && pendingRequests.length > 0 && pendingView === 'table' && (
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead className="border-b border-[var(--border-color)]">
                    <tr>
                      {[
                        'Request No.',
                        'Requested By',
                        'Warehouse',
                        'Product',
                        'Requested Qty',
                        'Priority',
                        'Status',
                        'Date',
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]"
                        >
                          {heading}
                        </th>
                      ))}
                      <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRequests.map((request) => (
                      <tr
                        key={request.id}
                        className="border-b border-[var(--border-color)] hover:bg-[var(--bg-surface-alt)] transition-all"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-[var(--text-primary)]">
                          {request.request_no}
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                          {request.requested_by ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                          {request.warehouse_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                          {request.product_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                          {request.requested_qty.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <PriorityBadge priority={request.priority} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={request.status} />
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                          {request.submitted_date ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setSelectedRequest(request)}
                              className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
                              title="View"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => void handleDecision(request, 'decline')}
                              disabled={decidingId === request.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-color)] text-[var(--text-secondary)] bg-[var(--bg-hover)] hover:bg-[var(--bg-surface-alt)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Decline
                            </button>
                            <button
                              onClick={() => void handleDecision(request, 'approve')}
                              disabled={decidingId === request.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#00a3c4] hover:bg-[#008ca8] text-white shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Approve
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Recently Approved Requests */}
        <div className="lg:col-span-1">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-xl p-6 h-full">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  Recently Approved Requests
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Latest approvals from Procurement
                </p>
              </div>
            </div>

            {recentlyApproved.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] py-4">
                No approved requests yet.
              </p>
            ) : (
              <div className="space-y-5">
                {recentlyApproved.map((request, index) => (
                  <div key={request.id} className="relative pl-5">
                    {index < recentlyApproved.length - 1 && (
                      <div className="absolute left-1.5 top-5 bottom-0 w-px bg-[var(--border-color)]" />
                    )}
                    <div className="absolute left-0 top-1.5 w-3 h-3 rounded-full bg-emerald-500" />
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {request.request_no} · {request.product_name}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mb-1.5">
                          {request.warehouse_name} · Qty{' '}
                          {request.requested_qty.toLocaleString()}
                        </p>
                        <StatusBadge status={request.status} />
                      </div>
                      <span className="text-xs font-medium text-[var(--text-muted)] whitespace-nowrap">
                        {request.approved_date ?? '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Approved Requests - ready for the Purchase Order module */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Approved Requests
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Approved replenishment requests ready for Purchase Order processing.
            </p>
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-[var(--border-color)]">
              <tr>
                {[
                  'Request No.',
                  'Product',
                  'Warehouse',
                  'Requested Qty',
                  'Priority',
                  'Approved Date',
                  'Status',
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]"
                  >
                    {heading}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {approvedRequests.map((request) => (
                <tr
                  key={request.id}
                  className="border-b border-[var(--border-color)] hover:bg-[var(--bg-surface-alt)] transition-all"
                >
                  <td className="px-4 py-3 text-sm font-medium text-[var(--text-primary)]">
                    {request.request_no}
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                    {request.product_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                    {request.warehouse_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                    {request.requested_qty.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={request.priority} />
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                    {request.approved_date ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={request.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setSelectedRequest(request)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-color)] text-[var(--text-secondary)] bg-[var(--bg-hover)] hover:bg-[var(--bg-surface-alt)] transition-all"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleGeneratePo(request)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 transition-colors"
                      >
                        Generate PO
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {approvedRequests.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                    {loading
                      ? 'Loading approved requests...'
                      : 'No approved requests waiting for a Purchase Order.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Procurement Request Summary */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Procurement Request Summary
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Replenishment request records handled by Procurement
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <SummaryStat
            label="Total Requests"
            value={summary.total_requests}
            accent="text-[var(--text-primary)]"
          />
          <SummaryStat
            label="Pending Approval"
            value={summary.pending_approval}
            accent="text-amber-600 dark:text-amber-400"
          />
          <SummaryStat
            label="Approved"
            value={summary.approved}
            accent="text-emerald-600 dark:text-emerald-400"
          />
          <SummaryStat
            label="Rejected"
            value={summary.rejected}
            accent="text-red-600 dark:text-red-400"
          />
          <SummaryStat
            label="PO Created"
            value={summary.po_created}
            accent="text-sky-600 dark:text-sky-400"
          />
        </div>
      </div>

      {/* Request Details Modal */}
      {selectedRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelectedRequest(null)}
        >
          <div
            className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">
                  {selectedRequest.request_no}
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Replenishment request from Plant Manager
                </p>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-[var(--text-muted)]">Product</dt>
                <dd className="text-[var(--text-primary)] font-medium">
                  {selectedRequest.product_name}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">Warehouse</dt>
                <dd className="text-[var(--text-primary)] font-medium">
                  {selectedRequest.warehouse_name}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">Requested Qty</dt>
                <dd className="text-[var(--text-primary)] font-medium">
                  {selectedRequest.requested_qty.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">Priority</dt>
                <dd className="mt-0.5">
                  <PriorityBadge priority={selectedRequest.priority} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">Requested By</dt>
                <dd className="text-[var(--text-primary)] font-medium">
                  {selectedRequest.requested_by ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">Date Submitted</dt>
                <dd className="text-[var(--text-primary)] font-medium">
                  {selectedRequest.submitted_date ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">Status</dt>
                <dd className="mt-0.5">
                  <StatusBadge status={selectedRequest.status} />
                </dd>
              </div>
              {selectedRequest.admin_decision && (
                <div className="col-span-2">
                  <dt className="text-xs text-[var(--text-muted)]">Admin Decision</dt>
                  <dd className="text-[var(--text-secondary)]">
                    {selectedRequest.admin_decision}
                    {selectedRequest.reviewed_by ? ` · ${selectedRequest.reviewed_by}` : ''}
                  </dd>
                </div>
              )}
            </dl>

            <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-[var(--border-color)]">
              {selectedRequest.status === 'pending' && (
                <>
                  <button
                    onClick={() => {
                      void handleDecision(selectedRequest, 'decline');
                      setSelectedRequest(null);
                    }}
                    className="px-4 py-2 rounded-lg text-xs font-medium border border-[var(--border-color)] text-[var(--text-secondary)] bg-[var(--bg-hover)] hover:bg-[var(--bg-surface-alt)]"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => {
                      void handleDecision(selectedRequest, 'approve');
                      setSelectedRequest(null);
                    }}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#00a3c4] hover:bg-[#008ca8] text-white shadow-none"
                  >
                    Approve
                  </button>
                </>
              )}
              <button
                onClick={() => setSelectedRequest(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium border border-[var(--border-color)] text-[var(--text-secondary)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowExportModal(false)}
        >
          <div
            className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Export Summary
              </h2>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1 text-[var(--text-muted)]">
                  Export Format
                </label>
                  <select className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-600/50">
                    <option>PDF Document</option>
                    <option>Excel Spreadsheet</option>
                    <option>CSV File</option>
                  </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-[var(--text-muted)]">
                  Date Range
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-600/50"
                  />
                  <input
                    type="date"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-600/50"
                  />
                </div>
              </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium border border-[var(--border-color)] text-[var(--text-secondary)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 shadow-none flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Export
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Procurement;
