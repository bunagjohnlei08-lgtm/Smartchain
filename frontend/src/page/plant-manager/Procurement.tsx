import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  Clock,
  Eye,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  X,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../../lib/api';
import { usePlantManagerDetailOverlay } from '../../components/layout/PlantManagerDetailOverlayContext';

type Priority = 'Low' | 'Medium' | 'High' | 'Critical';
type RequestStatus = 'not_submitted' | 'draft' | 'pending' | 'approved' | 'rejected' | 'for_purchase_order' | 'po_created' | 'completed' | 'cancelled';

interface RequestRecord {
  id: number;
  request_no: string;
  requested_by: string;
  warehouse_id: number;
  warehouse_name: string;
  product_id: number;
  product_name: string;
  requested_qty: number;
  priority: Priority;
  current_priority: Priority;
  status: Exclude<RequestStatus, 'not_submitted'>;
  submitted_date: string | null;
  admin_decision?: string | null;
  linked_purchase_order?: { number: string; status: string } | null;
  current_fulfillment_stage?: string;
  current_fulfillment_stage_label?: string;
  fulfillment?: {
    purchase_order: { number: string; status: string } | null;
    receiving: { number: string; status: string } | null;
    qa_status: string | null;
    replacement: { case_status: string; receiving_number: string | null; receiving_status: string | null } | null;
  };
  timeline?: TimelineStep[];
}

type TimelineStep = { key: string; label: string; state: 'done' | 'current' | 'failed' | 'upcoming' };

interface Candidate {
  id: string;
  productId: number;
  warehouseId: number;
  name: string;
  sku: string;
  warehouse: string;
  currentStock: number;
  recommendedReorderQty: number;
  priority: Priority;
  requestStatus: RequestStatus;
  canRequest: boolean;
  request: RequestRecord | null;
  primarySupplier?: { id: number; name: string } | null;
  supplierWarning?: string | null;
}

interface Warehouse {
  id: number;
  name: string;
}

const PAGE_SIZE = 10;
const MAX_REQUESTED_QTY = 100000;

const statusLabels: Record<RequestStatus, string> = {
  not_submitted: 'Not Submitted',
  draft: 'Draft',
  pending: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  for_purchase_order: 'For Purchase Order',
  po_created: 'PO Created',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const statusStyles: Record<RequestStatus, string> = {
  not_submitted: 'border-slate-700 bg-slate-700 text-slate-950 dark:border-slate-500/25 dark:bg-slate-500/10 dark:text-[var(--text-secondary)]',
  draft: 'border-slate-700 bg-slate-700 text-white dark:border-slate-500/25 dark:bg-slate-500/10 dark:text-slate-300',
  pending: 'border-amber-700 bg-amber-700 text-white dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-400',
  approved: 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-400',
  rejected: 'border-red-700 bg-red-700 text-white dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400',
  for_purchase_order: 'border-blue-700 bg-blue-700 text-white dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-400',
  po_created: 'border-violet-700 bg-violet-700 text-white dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-400',
  completed: 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-400',
  cancelled: 'border-slate-700 bg-slate-700 text-white dark:border-slate-500/25 dark:bg-slate-500/10 dark:text-slate-300',
};

const priorityStyles: Record<Priority, string> = {
  Low: 'border-blue-700 bg-blue-700 text-white dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-400',
  Medium: 'border-amber-700 bg-amber-700 text-white dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-400',
  High: 'border-orange-700 bg-orange-700 text-white dark:border-orange-500/25 dark:bg-orange-500/10 dark:text-orange-400',
  Critical: 'border-red-700 bg-red-700 text-white dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400',
};

function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={'inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ' + statusStyles[status]}>
      {statusLabels[status]}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ' + priorityStyles[priority]}>
      {priority}
    </span>
  );
}

const replacementLabels: Record<string, string> = {
  PENDING_REVIEW: 'Pending Admin review',
  SENDING: 'Sending report to supplier',
  SENT: 'Reported to supplier',
  FAILED: 'Supplier report failed to send',
  REPLACEMENT_PENDING: 'Replacement pending',
  RESOLVED: 'Resolved',
};

function SupplierWarning() {
  return (
    <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> No Active Supplier Assigned
    </p>
  );
}

function StageHint({ request }: { request: RequestRecord | null }) {
  if (!request?.current_fulfillment_stage_label) return null;
  const stage = request.current_fulfillment_stage;
  if (stage === request.status || (request.status === 'pending' && stage === 'pending_admin_approval')) return null;
  return <p className="mt-1 text-xs text-[var(--text-muted)]">Stage: {request.current_fulfillment_stage_label}</p>;
}

function Timeline({ steps }: { steps: TimelineStep[] }) {
  const icon = (state: TimelineStep['state']) => {
    if (state === 'done') return <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />;
    if (state === 'failed') return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />;
    if (state === 'current') return <CircleDot className="h-4 w-4 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />;
    return <Circle className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />;
  };
  const stateText: Record<TimelineStep['state'], string> = { done: 'completed', failed: 'failed', current: 'current step', upcoming: 'upcoming' };
  return (
    <ol className="mt-3 space-y-2">
      {steps.map((step) => (
        <li key={step.key} aria-current={step.state === 'current' ? 'step' : undefined} className="flex items-center gap-2.5 text-sm">
          {icon(step.state)}
          <span className={step.state === 'upcoming' ? 'text-[var(--text-muted)]' : step.state === 'current' ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>{step.label}</span>
          <span className="sr-only">({stateText[step.state]})</span>
        </li>
      ))}
    </ol>
  );
}

function getErrorMessage(error: unknown): string {
  const response = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response;
  const validationMessage = response?.data?.errors
    ? Object.values(response.data.errors).flat()[0]
    : undefined;
  return validationMessage || response?.data?.message || 'Something went wrong. Please try again.';
}

function formatDate(value: string | null): string {
  if (!value) return 'Not submitted';
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(value + 'T00:00:00'),
  );
}

const ReplenishmentPlanning: React.FC = () => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [recentActivity, setRecentActivity] = useState<RequestRecord[]>([]);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [requestCandidates, setRequestCandidates] = useState<Candidate[]>([]);
  // Raw input per candidate; the Plant Manager enters every quantity (nothing is pre-calculated).
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [quantityErrors, setQuantityErrors] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<RequestRecord | null>(null);
  const [detailStock, setDetailStock] = useState<number | null>(null);
  const openDetail = (request: RequestRecord, currentStock: number | null = null) => {
    setDetailStock(currentStock);
    setDetail(request);
  };
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  usePlantManagerDetailOverlay(requestCandidates.length > 0 || detail !== null);

  const loadPlanning = useCallback(async () => {
    setLoading(true);
    try {
      const [optionsResponse, activityResponse] = await Promise.all([
        apiClient.get('/plant-manager/procurement/options'),
        apiClient.get('/plant-manager/procurement/requests?scope=history'),
      ]);
      setCandidates(optionsResponse.data?.data ?? []);
      setWarehouse(optionsResponse.data?.warehouse ?? null);
      setRecentActivity(activityResponse.data?.data ?? []);
    } catch (error: unknown) {
      setToast({ message: getErrorMessage(error), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlanning();
  }, [loadPlanning]);

  const filteredCandidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return candidates.filter((candidate) => {
      const matchesSearch = !term
        || candidate.name.toLowerCase().includes(term)
        || candidate.sku.toLowerCase().includes(term)
        || candidate.warehouse.toLowerCase().includes(term);
      const matchesPriority = priorityFilter === 'all' || candidate.priority === priorityFilter;
      const matchesStatus = statusFilter === 'all' || candidate.requestStatus === statusFilter;
      return matchesSearch && matchesPriority && matchesStatus;
    });
  }, [candidates, priorityFilter, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleCandidates = filteredCandidates.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selectableVisibleIds = visibleCandidates
    .filter((candidate) => candidate.canRequest)
    .map((candidate) => candidate.id);
  const allVisibleSelected = selectableVisibleIds.length > 0
    && selectableVisibleIds.every((id) => selectedIds.includes(id));

  const summary = useMemo(() => ({
    needing: candidates.length,
    critical: candidates.filter((candidate) => candidate.priority === 'Critical').length,
    pending: candidates.filter((candidate) => candidate.requestStatus === 'pending').length,
    forPo: candidates.filter((candidate) => candidate.requestStatus === 'for_purchase_order').length,
  }), [candidates]);

  const openRequestDialog = (items: Candidate[]) => {
    setQuantities(Object.fromEntries(items.map((candidate) => [candidate.id, ''])));
    setQuantityErrors({});
    setRequestCandidates(items);
  };

  const quantityError = (value: string | undefined): string => {
    const trimmed = (value ?? '').trim();
    if (!trimmed) return 'Enter a requested quantity.';
    if (!/^\d+$/.test(trimmed)) return 'Enter a whole number (no decimals or negative values).';
    const quantity = Number(trimmed);
    if (quantity < 1) return 'Requested quantity must be greater than zero.';
    if (quantity > MAX_REQUESTED_QTY) return `Requested quantity cannot exceed ${MAX_REQUESTED_QTY.toLocaleString()}.`;
    return '';
  };

  const normalizeQuantity = (value: string | undefined): string => {
    const trimmed = (value ?? '').trim();
    return quantityError(trimmed) === '' ? String(Number(trimmed)) : trimmed;
  };

  const canForward = requestCandidates.length > 0
    && requestCandidates.every((candidate) => quantityError(quantities[candidate.id]) === '');

  const submitRequests = async () => {
    if (!warehouse || requestCandidates.length === 0) return;
    const errors = Object.fromEntries(requestCandidates.map((candidate) => [candidate.id, quantityError(quantities[candidate.id])]).filter(([, message]) => message));
    setQuantityErrors(errors);
    if (Object.keys(errors).length > 0) {
      requestAnimationFrame(() => document.getElementById(`requested-qty-${Object.keys(errors)[0]}`)?.focus());
      return;
    }

    const normalizedQuantities = Object.fromEntries(requestCandidates.map((candidate) => [
      candidate.id,
      normalizeQuantity(quantities[candidate.id]),
    ]));
    setQuantities(normalizedQuantities);

    setSubmitting(true);
    try {
      if (requestCandidates.length === 1) {
        const candidate = requestCandidates[0];
        await apiClient.post('/plant-manager/procurement/requests', {
          product_id: candidate.productId,
          warehouse_id: warehouse.id,
          requested_qty: Number(normalizedQuantities[candidate.id]),
          status: 'pending',
        });
      } else {
        await apiClient.post('/plant-manager/procurement/requests/bulk', {
          items: requestCandidates.map((candidate) => ({
            product_id: candidate.productId,
            requested_qty: Number(normalizedQuantities[candidate.id]),
          })),
        });
      }
      setToast({
        message: requestCandidates.length === 1
          ? 'Replenishment request submitted for Admin approval.'
          : requestCandidates.length + ' replenishment requests submitted for Admin approval.',
        type: 'success',
      });
      setRequestCandidates([]);
      setSelectedIds([]);
      await loadPlanning();
    } catch (error: unknown) {
      setToast({ message: getErrorMessage(error), type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCandidate = (candidate: Candidate) => {
    if (!candidate.canRequest) return;
    setSelectedIds((current) => (
      current.includes(candidate.id)
        ? current.filter((id) => id !== candidate.id)
        : [...current, candidate.id]
    ));
  };

  const setFilterAndResetPage = (setter: () => void) => {
    setter();
    setPage(1);
  };

  const selectedCandidates = candidates.filter((candidate) => selectedIds.includes(candidate.id));

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-6 p-4 pb-10 sm:p-6 sm:pb-10 lg:p-8 lg:pb-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-cyan-400">
            Plant Manager · Procurement
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">Replenishment Planning</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
            Inventory at or below 30 units is identified automatically. Review live priority and submit only the items that need procurement.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadPlanning()}
          disabled={loading}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-slate-950 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[var(--border-color)] dark:bg-[var(--bg-card)] dark:text-[var(--text-primary)] dark:hover:bg-[var(--bg-surface-alt)] dark:focus-visible:outline-cyan-500"
        >
          <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />
          Refresh
        </button>
      </header>

      <section aria-label="Replenishment summary" className="grid min-w-0 grid-cols-1 gap-3 min-[390px]:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Needing Replenishment', value: summary.needing, icon: AlertTriangle, color: 'text-amber-500' },
          { label: 'Critical', value: summary.critical, icon: XCircle, color: 'text-red-500' },
          { label: 'Pending Approval', value: summary.pending, icon: Clock, color: 'text-amber-500' },
          { label: 'For PO', value: summary.forPo, icon: ShoppingCart, color: 'text-sky-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <article key={label} className="min-w-0 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
                <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{value}</p>
              </div>
              <span className="rounded-xl bg-[var(--bg-surface-alt)] p-2.5"><Icon className={'h-5 w-5 ' + color} /></span>
            </div>
          </article>
        ))}
      </section>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-sm">
        <div className="border-b border-[var(--border-color)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Inventory candidates</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Live stock priority is separate from the lifecycle status of any submitted request.
              </p>
            </div>
            <div className="grid w-full min-w-0 gap-2 sm:grid-cols-3 xl:max-w-[680px] xl:flex-1">
              <label className="relative min-w-0">
                <span className="sr-only">Search candidates</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  value={search}
                  onChange={(event) => setFilterAndResetPage(() => setSearch(event.target.value))}
                  placeholder="Search product, SKU, warehouse"
                  className="min-h-11 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] pl-10 pr-3 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </label>
              <label className="min-w-0">
                <span className="sr-only">Filter by priority</span>
                <select
                  value={priorityFilter}
                  onChange={(event) => setFilterAndResetPage(() => setPriorityFilter(event.target.value as 'all' | Priority))}
                  className="min-h-11 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-cyan-500/40"
                >
                  <option value="all">All priorities</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                </select>
              </label>
              <label className="min-w-0">
                <span className="sr-only">Filter by request status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setFilterAndResetPage(() => setStatusFilter(event.target.value as RequestStatus | 'all'))}
                  className="min-h-11 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-cyan-500/40"
                >
                  <option value="all">All request statuses</option>
                  <option value="not_submitted">Not Submitted</option>
                  <option value="pending">Pending Approval</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="for_purchase_order">For Purchase Order</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-cyan-500/20 dark:bg-cyan-500/5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {selectedIds.length} eligible item{selectedIds.length === 1 ? '' : 's'} selected
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelectedIds([])} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-alt)]">
                Clear
              </button>
              <button type="button" onClick={() => openRequestDialog(selectedCandidates)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-slate-950 dark:bg-cyan-600 dark:hover:bg-cyan-500 dark:focus-visible:outline-cyan-500">
                <Send className="h-4 w-4" />
                Forward Selected to Admin
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-[var(--text-secondary)]">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading live inventory…
          </div>
        ) : candidates.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <CheckCircle className="h-10 w-10 text-emerald-500" />
            <h3 className="mt-4 font-semibold text-[var(--text-primary)]">No replenishment needed</h3>
            <p className="mt-2 max-w-md text-sm text-[var(--text-secondary)]">
              All inventory items are currently above the replenishment threshold.
            </p>
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
            <Search className="h-9 w-9 text-[var(--text-muted)]" />
            <h3 className="mt-3 font-semibold text-[var(--text-primary)]">No matching candidates</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Clear or adjust the current search and filters.</p>
          </div>
        ) : (
          <>
            <div className="pm-procurement-table-scroll hidden w-full min-w-0 max-w-full overscroll-x-contain md:block">
              <table className="w-full min-w-[980px] table-fixed text-left">
                <thead className="bg-[var(--bg-surface-alt)] text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all eligible candidates on this page"
                        checked={allVisibleSelected}
                        disabled={selectableVisibleIds.length === 0}
                        onChange={() => setSelectedIds((current) => (
                          allVisibleSelected
                            ? current.filter((id) => !selectableVisibleIds.includes(id))
                            : Array.from(new Set([...current, ...selectableVisibleIds]))
                        ))}
                        className="h-4 w-4 rounded border-[var(--border-color)] accent-cyan-600"
                      />
                    </th>
                    <th className="w-56 px-4 py-3">Product</th>
                    <th className="w-36 px-4 py-3">Available stock</th>
                    <th className="w-28 px-4 py-3">Priority</th>
                    <th className="w-44 px-4 py-3">Request status</th>
                    <th className="w-44 px-4 py-3">Warehouse</th>
                    <th className="w-40 px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {visibleCandidates.map((candidate) => (
                    <tr key={candidate.id} className="text-sm hover:bg-[var(--bg-surface-alt)]/60">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          aria-label={'Select ' + candidate.name}
                          checked={selectedIds.includes(candidate.id)}
                          disabled={!candidate.canRequest}
                          onChange={() => toggleCandidate(candidate)}
                          className="h-4 w-4 rounded border-[var(--border-color)] accent-cyan-600 disabled:cursor-not-allowed disabled:opacity-35"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <p className="break-words font-semibold text-[var(--text-primary)]">{candidate.name}</p>
                        <p className="mt-1 break-all text-xs text-[var(--text-muted)]">{candidate.sku}</p>
                        {candidate.supplierWarning && <SupplierWarning />}
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-semibold text-[var(--text-primary)]">{candidate.currentStock}</span>
                        {candidate.currentStock < 0 && <span className="ml-2 text-xs font-semibold text-red-500">Invalid stock</span>}
                      </td>
                      <td className="px-4 py-4"><PriorityBadge priority={candidate.priority} /></td>
                      <td className="px-4 py-4"><StatusBadge status={candidate.requestStatus} /><StageHint request={candidate.request} /></td>
                      <td className="break-words px-4 py-4 text-[var(--text-secondary)]">{candidate.warehouse}</td>
                      <td className="px-4 py-4 text-right">
                        {candidate.request ? (
                          <button type="button" onClick={() => candidate.request && openDetail(candidate.request, candidate.currentStock)} aria-label="View replenishment request details" title="View details" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)]">
                            <Eye className="h-4 w-4" />
                          </button>
                        ) : (
                          <button type="button" onClick={() => openRequestDialog([candidate])} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-slate-950 dark:bg-cyan-600 dark:hover:bg-cyan-500 dark:focus-visible:outline-cyan-500">
                            <Send className="h-4 w-4" /> Forward to Admin
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-[var(--border-color)] md:hidden">
              {visibleCandidates.map((candidate) => (
                <article key={candidate.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={'Select ' + candidate.name}
                      checked={selectedIds.includes(candidate.id)}
                      disabled={!candidate.canRequest}
                      onChange={() => toggleCandidate(candidate)}
                      className="mt-1 h-5 w-5 rounded border-[var(--border-color)] accent-cyan-600 disabled:opacity-35"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-[var(--text-primary)]">{candidate.name}</p>
                      <p className="mt-1 break-words text-xs text-[var(--text-muted)]">{candidate.sku} · {candidate.warehouse}</p>
                      {candidate.supplierWarning && <SupplierWarning />}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <PriorityBadge priority={candidate.priority} />
                        <StatusBadge status={candidate.requestStatus} />
                      </div>
                      <StageHint request={candidate.request} />
                      <p className="mt-3 text-sm text-[var(--text-secondary)]">
                        Available stock: <strong className="text-[var(--text-primary)]">{candidate.currentStock}</strong>
                        {candidate.currentStock < 0 && <span className="ml-2 font-semibold text-red-500">Invalid stock</span>}
                      </p>
                      <button
                        type="button"
                        onClick={() => candidate.request
                          ? openDetail(candidate.request, candidate.currentStock)
                          : openRequestDialog([candidate])}
                        aria-label={candidate.request ? 'View replenishment request details' : 'Forward to Admin'}
                        title={candidate.request ? 'View details' : 'Forward to Admin'}
                        className={'mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold ' + (candidate.request ? 'min-w-11 border border-slate-300 bg-white px-3 text-slate-950 hover:bg-slate-100 dark:border-[var(--border-color)] dark:bg-[var(--bg-surface-alt)] dark:text-[var(--text-primary)]' : 'w-full bg-slate-950 px-4 text-white hover:bg-slate-800 dark:bg-cyan-600 dark:hover:bg-cyan-500')}
                      >
                        {candidate.request ? <Eye className="h-4 w-4" /> : <><Send className="h-4 w-4" /> Forward to Admin</>}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="flex flex-col gap-3 border-t border-[var(--border-color)] bg-[var(--bg-surface-alt)] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[var(--text-secondary)]">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredCandidates.length)} of {filteredCandidates.length}
              </p>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Previous page" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--border-color)] text-[var(--text-primary)] disabled:opacity-35">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 font-medium text-[var(--text-primary)]">Page {safePage} of {totalPages}</span>
                <button type="button" aria-label="Next page" disabled={safePage === totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[var(--border-color)] text-[var(--text-primary)] disabled:opacity-35">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="min-w-0 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-sm sm:p-5">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Recent replenishment activity</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Your five most recently submitted requests.</p>
          </div>
          <Link to="/plant-manager/reports" className="whitespace-nowrap text-sm font-semibold text-cyan-600 hover:text-cyan-500 dark:text-cyan-400">
            View full report →
          </Link>
        </div>
        {recentActivity.length === 0 ? (
          <p className="mt-5 rounded-xl bg-[var(--bg-surface-alt)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
            No recent replenishment activity.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-[var(--border-color)]">
            {recentActivity.map((item) => (
              <button key={item.id} type="button" onClick={() => openDetail(item)} className="flex min-h-16 w-full min-w-0 items-start justify-between gap-3 py-3 text-left hover:bg-[var(--bg-surface-alt)] sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{item.product_name}</p>
                  <p className="mt-1 break-words text-xs text-[var(--text-muted)]">{item.request_no} · {formatDate(item.submitted_date)}</p>
                </div>
                <StatusBadge status={item.status} />
              </button>
            ))}
          </div>
        )}
      </section>

      {requestCandidates.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="request-dialog-title">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl sm:max-w-2xl sm:rounded-2xl">
            <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-[var(--border-color)] bg-[var(--bg-card)] p-5">
              <div>
                <h2 id="request-dialog-title" className="text-lg font-semibold text-[var(--text-primary)]">
                  {requestCandidates.length === 1 ? 'Forward Replenishment Request' : 'Forward Bulk Replenishment Request'}
                </h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Enter the requested quantity for every item before forwarding to Admin.</p>
              </div>
              <button type="button" aria-label="Close request dialog" onClick={() => setRequestCandidates([])} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-surface-alt)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              {requestCandidates.map((candidate) => (
                <div key={candidate.id} className="grid gap-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface-alt)] p-4 sm:grid-cols-[1fr_170px] sm:items-end">
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">{candidate.name}</p>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                      <dt className="text-[var(--text-muted)]">Available stock</dt><dd className="font-medium text-[var(--text-primary)]">{candidate.currentStock}</dd>
                      <dt className="text-[var(--text-muted)]">Priority</dt><dd><PriorityBadge priority={candidate.priority} /></dd>
                      <dt className="text-[var(--text-muted)]">Assigned supplier</dt><dd className="font-medium text-[var(--text-primary)]">{candidate.primarySupplier?.name ?? <span className="text-amber-600 dark:text-amber-400">No Active Supplier Assigned</span>}</dd>
                    </dl>
                    {candidate.supplierWarning && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Admin will select an active supplier when creating the Purchase Order.</p>}
                    {candidate.requestStatus === 'rejected' && candidate.request?.admin_decision && (
                      <p className="mt-2 text-xs text-red-500">Previous decision: {candidate.request.admin_decision}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor={`requested-qty-${candidate.id}`} className="text-sm font-medium text-[var(--text-primary)]">
                      Requested quantity <span aria-hidden="true" className="text-red-500">*</span>
                    </label>
                    <input
                      id={`requested-qty-${candidate.id}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_REQUESTED_QTY}
                      step={1}
                      required
                      placeholder="0"
                      value={quantities[candidate.id] ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        setQuantities((current) => ({ ...current, [candidate.id]: value }));
                        setQuantityErrors((current) => ({ ...current, [candidate.id]: '' }));
                      }}
                      onBlur={() => setQuantities((current) => ({
                        ...current,
                        [candidate.id]: normalizeQuantity(current[candidate.id]),
                      }))}
                      aria-invalid={Boolean(quantityErrors[candidate.id])}
                      aria-describedby={quantityErrors[candidate.id] ? `requested-qty-${candidate.id}-error` : undefined}
                      className={'mt-2 min-h-11 w-full rounded-xl border bg-[var(--bg-input)] px-3 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-cyan-500/40 ' + (quantityErrors[candidate.id] ? 'border-red-500' : 'border-[var(--border-color)]')}
                    />
                    {quantityErrors[candidate.id] && <p id={`requested-qty-${candidate.id}-error`} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{quantityErrors[candidate.id]}</p>}
                  </div>
                </div>
              ))}
            </div>
            <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-[var(--border-color)] bg-[var(--bg-card)] p-5 sm:flex-row sm:justify-end">
              <button type="button" disabled={submitting} onClick={() => setRequestCandidates([])} className="min-h-11 rounded-xl border border-[var(--border-color)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)] disabled:opacity-50">
                Cancel
              </button>
              <button type="button" disabled={submitting || !canForward} onClick={() => void submitRequests()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-slate-950 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-cyan-600 dark:hover:bg-cyan-500 dark:focus-visible:outline-cyan-500">
                {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Forward to Admin
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="detail-dialog-title">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-cyan-400">{detail.request_no}</p>
                <h2 id="detail-dialog-title" className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{detail.product_name}</h2>
              </div>
              <button type="button" aria-label="Close request details" onClick={() => setDetail(null)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-surface-alt)]"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                ['Warehouse', detail.warehouse_name],
                ...(detailStock !== null ? [['Current available stock', String(detailStock)]] : []),
                ['Requested quantity', String(detail.requested_qty)],
                ['Submitted', formatDate(detail.submitted_date)],
                ['Requested by', detail.requested_by],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-[var(--bg-surface-alt)] p-3">
                  <p className="text-xs text-[var(--text-muted)]">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <PriorityBadge priority={detail.current_priority} />
              <StatusBadge status={detail.status} />
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">Current stock priority, request status, and fulfillment stage are shown separately.</p>
            {detail.current_fulfillment_stage_label && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-cyan-500/30 dark:bg-cyan-500/5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Current fulfillment stage</p>
                <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">{detail.current_fulfillment_stage_label}</p>
              </div>
            )}
            {(() => {
              const fulfillment = detail.fulfillment;
              const purchaseOrder = fulfillment?.purchase_order ?? detail.linked_purchase_order ?? null;
              const rows = [
                purchaseOrder && ['Purchase Order', purchaseOrder.number, purchaseOrder.status],
                fulfillment?.receiving && ['Receiving', fulfillment.receiving.number, fulfillment.receiving.status],
                fulfillment?.qa_status && ['QA', fulfillment.qa_status, null],
                fulfillment?.replacement && ['Replacement', replacementLabels[fulfillment.replacement.case_status] ?? fulfillment.replacement.case_status, fulfillment.replacement.receiving_number ? `${fulfillment.replacement.receiving_number} · ${fulfillment.replacement.receiving_status ?? ''}` : null],
              ].filter(Boolean) as [string, string, string | null][];
              if (!rows.length) return null;
              return (
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  {rows.map(([label, value, sub]) => (
                    <div key={label} className="min-w-0 rounded-xl border border-[var(--border-color)] p-3">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</dt>
                      <dd className="mt-1 break-words text-sm font-semibold text-[var(--text-primary)]">{value}</dd>
                      {sub && <dd className="mt-0.5 break-words text-xs text-[var(--text-secondary)]">{sub}</dd>}
                    </div>
                  ))}
                </dl>
              );
            })()}
            {detail.timeline && detail.timeline.length > 0 && (
              <div className="mt-4 rounded-xl border border-[var(--border-color)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Timeline</p>
                <Timeline steps={detail.timeline} />
              </div>
            )}
            {detail.admin_decision && (
              <div className="mt-4 rounded-xl border border-[var(--border-color)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Admin decision</p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{detail.admin_decision}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[60] flex max-w-sm items-start gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-primary)] shadow-2xl" role="status">
          {toast.type === 'success' ? <CheckCircle className="h-5 w-5 shrink-0 text-emerald-500" /> : <XCircle className="h-5 w-5 shrink-0 text-red-500" />}
          <span>{toast.message}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setToast(null)} className="ml-auto text-[var(--text-muted)]"><X className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
};

export default ReplenishmentPlanning;
