// src/pages/admin/Suppliers.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminDetailOverlay } from '../../components/layout/AdminDetailOverlayContext';
import { apiClient } from '../../lib/api';
import {
  Search,
  Plus,
  ChevronRight,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Edit,
  RefreshCw,
  Grid,
  List,
  X,
  Save,
  ExternalLink,
  Trash2,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface Supplier {
  id: string;
  code: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  location: string;
  openPOs: number;
  paymentTerms: string;
  status: 'Active' | 'On Hold' | 'Inactive' | 'Recently Removed' | 'Archived';
  notes: string;
  removedAt: string | null;
  recoveryDeadline: string | null;
  recoveryDaysRemaining: number;
  restoreAllowed: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const statusOptions = ['All', 'Active', 'On Hold', 'Inactive', 'Recently Removed', 'Archived'];
const PHONE_MAX_DIGITS = 11;

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { color: string; dotColor: string }> = {
    Active: {
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      dotColor: 'bg-emerald-400',
    },
    'On Hold': {
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      dotColor: 'bg-amber-400',
    },
    Inactive: {
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      dotColor: 'bg-rose-400',
    },
    'Recently Removed': {
      color: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
      dotColor: 'bg-orange-400',
    },
    Archived: {
      color: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
      dotColor: 'bg-slate-400',
    },
  };
  const { color, dotColor } = config[status] || config['Active'];
  return (
    <span
      className={`admin-badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {status}
    </span>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const Suppliers: React.FC = () => {
  // State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [actionSupplier, setActionSupplier] = useState<Supplier | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<'remove' | 'restore' | null>(null);
  const actionDialogRef = useRef<HTMLDivElement>(null);
  const cancelActionRef = useRef<HTMLButtonElement>(null);
  const actionTriggerRef = useRef<HTMLElement | null>(null);
  useAdminDetailOverlay((showEditModal && selectedSupplier !== null) || actionSupplier !== null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const apiStatus = (status: string) => status === 'On Hold' ? 'ON_HOLD' : status === 'Recently Removed' ? 'PENDING_REMOVAL' : status.toUpperCase();
  const uiStatus = (status: string): Supplier['status'] => status === 'ON_HOLD' ? 'On Hold' : status === 'INACTIVE' ? 'Inactive' : status === 'PENDING_REMOVAL' ? 'Recently Removed' : status === 'ARCHIVED' ? 'Archived' : 'Active';
  const mapSupplier = (supplier: any): Supplier => ({
    id: String(supplier.id), code: supplier.supplier_code, name: supplier.name,
    contactPerson: supplier.contact_person || '', email: supplier.email || '', phone: supplier.phone || '',
    location: supplier.address || '', openPOs: Number(supplier.open_purchase_orders_count || 0), paymentTerms: supplier.payment_terms || '',
    status: uiStatus(supplier.status), notes: supplier.notes || '',
    removedAt: supplier.removal_requested_at || null, recoveryDeadline: supplier.recovery_deadline || null,
    recoveryDaysRemaining: Number(supplier.recovery_days_remaining || 0), restoreAllowed: Boolean(supplier.restore_allowed),
  });

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/suppliers', { params: { search: search || undefined, status: statusFilter === 'All' ? undefined : apiStatus(statusFilter) } });
      setSuppliers((response.data?.data ?? []).map(mapSupplier));
      setError('');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to load suppliers.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadSuppliers(); }, 250);
    return () => window.clearTimeout(timer);
  }, [loadSuppliers]);

  const filteredSuppliers = suppliers;

  // KPI counts
  const totalSuppliers = suppliers.length;
  const activeSuppliers = suppliers.filter((s) => s.status === 'Active').length;
  const onHoldSuppliers = suppliers.filter((s) => s.status === 'On Hold').length;
  const totalOpenPOs = suppliers.reduce((sum, s) => sum + s.openPOs, 0);

  const handleEdit = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setShowEditModal(true);
  };

  const handleViewDetails = async (supplier: Supplier) => {
    try {
      const response = await apiClient.get(`/suppliers/${supplier.id}`);
      handleEdit(mapSupplier(response.data.data));
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to load supplier details.');
    }
  };

  // Philippine mobile/landline: digits only, at most 11 (e.g. 09123456789).
  // Runs on every input event, so typed and pasted text are both cleaned.
  const sanitizePhoneInput = (event: React.FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    input.value = input.value.replace(/\D/g, '').slice(0, PHONE_MAX_DIGITS);
  };

  const payloadFromForm = (form: HTMLFormElement) => {
    const data = new FormData(form);
    return {
      name: String(data.get('name') || '').trim(),
      contact_person: String(data.get('contact_person') || '').trim() || null,
      email: String(data.get('email') || '').trim() || null, phone: String(data.get('phone') || '').trim() || null,
      address: String(data.get('address') || '').trim() || null, status: apiStatus(String(data.get('status') || 'Active')),
      payment_terms: String(data.get('payment_terms') || '').trim() || null, notes: String(data.get('notes') || '').trim() || null,
    };
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError('');
    try { await apiClient.post('/suppliers', payloadFromForm(event.currentTarget)); setShowAddModal(false); await loadSuppliers(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Supplier could not be created.'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selectedSupplier) return; setSaving(true); setError('');
    try { await apiClient.put(`/suppliers/${selectedSupplier.id}`, payloadFromForm(event.currentTarget)); setShowEditModal(false); setSelectedSupplier(null); await loadSuppliers(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Supplier could not be updated.'); }
    finally { setSaving(false); }
  };

  const closeLifecycleDialog = () => {
    setActionSupplier(null);
    setLifecycleAction(null);
    window.setTimeout(() => actionTriggerRef.current?.focus(), 0);
  };

  const openLifecycleDialog = (supplier: Supplier, action: 'remove' | 'restore') => {
    actionTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError('');
    setActionSupplier(supplier);
    setLifecycleAction(action);
  };

  useEffect(() => {
    if (!actionSupplier) return;
    cancelActionRef.current?.focus();
  }, [actionSupplier]);

  const handleLifecycleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeLifecycleDialog();
      return;
    }
    if (event.key !== 'Tab' || !actionDialogRef.current) return;
    const focusable = Array.from(actionDialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };

  const confirmLifecycleAction = async () => {
    if (!actionSupplier || !lifecycleAction) return;
    setSaving(true); setError('');
    try {
      if (lifecycleAction === 'remove') await apiClient.delete(`/suppliers/${actionSupplier.id}`);
      else await apiClient.post(`/suppliers/${actionSupplier.id}/restore`);
      closeLifecycleDialog();
      await loadSuppliers();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || `Supplier could not be ${lifecycleAction === 'remove' ? 'removed' : 'restored'}.`);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (value: string | null) => value
    ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' }).format(new Date(value))
    : 'Not available';

  // Refresh and the view toggle are declared once and rendered in
  // two places: the desktop header keeps them exactly where they were, while the
  // mobile toolbar puts them in the filter card. Only one copy is ever displayed —
  // the other side of the sm breakpoint is display:none, so it leaves no box and
  // is excluded from the accessibility tree. Handlers and state are shared.
  const toolbarIconButtons = (
    <>
      <button
        onClick={() => void loadSuppliers()}
        disabled={loading}
        className="p-2.5 rounded-xl border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
        title="Refresh"
      >
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </>
  );

  const viewToggle = (
    <div className="supplier-view-toggle flex items-center gap-1 bg-[var(--bg-hover)] rounded-xl p-1">
      <button
        onClick={() => setViewMode('cards')}
        className={`p-1.5 rounded-lg transition-all ${
          viewMode === 'cards'
            ? 'bg-slate-900 text-white dark:bg-cyan-500 dark:text-slate-950'
            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
        }`}
        title="Card View"
      >
        <Grid className="w-4 h-4" />
      </button>
      <button
        onClick={() => setViewMode('table')}
        className={`p-1.5 rounded-lg transition-all ${
          viewMode === 'table'
            ? 'bg-slate-900 text-white dark:bg-cyan-500 dark:text-slate-950'
            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
        }`}
        title="Table View"
      >
        <List className="w-4 h-4" />
      </button>
    </div>
  );

  {/* FIX: Dark mode canvas adaptation */}
  return (
    <div className="admin-suppliers w-full max-w-7xl mx-auto p-6 space-y-6 bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors duration-200">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <span>Admin</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-[var(--text-inverse)]">Suppliers</span>
      </div>

      {/* Header */}
      <div className="supplier-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Suppliers</h1>
          <p className="text-sm text-[var(--text-secondary)]">Manage vendor relationships, contacts, and performance metrics</p>
        </div>
        <div className="supplier-header-actions flex items-center gap-3 flex-wrap">
          {/* Desktop only: on mobile these live in the toolbar card instead, and
              display:none leaves no empty row behind. */}
          <div className="supplier-header-tools hidden sm:flex items-center gap-3">
            {toolbarIconButtons}
            {viewToggle}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Supplier
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 text-center hover:border-[var(--border-color-strong)] transition-colors">
          <p className="admin-kpi-title text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Suppliers</p>
          <p className="admin-kpi-value text-2xl font-bold text-[var(--text-primary)] mt-1">{totalSuppliers}</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 text-center hover:border-[var(--border-color-strong)] transition-colors">
          <p className="admin-kpi-title text-xs text-[var(--text-muted)] uppercase tracking-wider">Active Vendors</p>
          <p className="admin-kpi-value text-2xl font-bold text-[var(--text-primary)] mt-1">{activeSuppliers}</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 text-center hover:border-[var(--border-color-strong)] transition-colors">
          <p className="admin-kpi-title text-xs text-[var(--text-muted)] uppercase tracking-wider">On Hold</p>
          <p className="admin-kpi-value text-2xl font-bold text-[var(--text-primary)] mt-1">{onHoldSuppliers}</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 text-center hover:border-[var(--border-color-strong)] transition-colors">
          <p className="admin-kpi-title text-xs text-[var(--text-muted)] uppercase tracking-wider">Open POs</p>
          <p className="admin-kpi-value text-2xl font-bold text-[var(--text-primary)] mt-1">{totalOpenPOs}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="supplier-toolbar bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4">
        {/* Mobile row 1: search flush left, then Refresh. */}
        <div className="supplier-search-row flex items-center sm:hidden">
          <div className="supplier-search-field relative flex-1 min-w-0">
            <Search className="supplier-search-icon absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search by supplier name, contact, or ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl pl-9 pr-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
          </div>
          <div className="supplier-icon-actions flex items-center">
            {toolbarIconButtons}
          </div>
        </div>

        {/* Row 2: status filters left. Mobile adds the view toggle on the right;
            desktop keeps the search field there, exactly as before. */}
        <div className="supplier-filter-row flex flex-wrap items-center gap-3">
          <div className="supplier-status-filters flex flex-wrap items-center gap-1 bg-[var(--bg-hover)] rounded-full p-1">
            {statusOptions.map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  statusFilter === status
                    ? 'bg-slate-200 text-slate-900 dark:bg-cyan-500 dark:text-slate-950'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          <div className="supplier-toggle-slot ml-auto sm:hidden">
            {viewToggle}
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search by supplier name, contact, or ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl pl-9 pr-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </div>
          </div>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}

      {/* Supplier Cards Grid */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map((supplier) => (
            <div
              key={supplier.id}
              className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 hover:border-[var(--border-color-strong)] transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{supplier.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{supplier.code}</p>
                  </div>
                </div>
                <StatusBadge status={supplier.status} />
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <User className="w-4 h-4 text-[var(--text-muted)]" />
                  <span>{supplier.contactPerson}</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <Mail className="w-4 h-4 text-[var(--text-muted)]" />
                  <span className="truncate">{supplier.email}</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <Phone className="w-4 h-4 text-[var(--text-muted)]" />
                  <span>{supplier.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <MapPin className="w-4 h-4 text-[var(--text-muted)]" />
                  <span>{supplier.location}</span>
                </div>
              </div>

              {supplier.status === 'Recently Removed' && (
                <div className="mt-4 rounded-xl border border-orange-500/20 bg-orange-500/10 px-3 py-2.5 text-xs leading-5 text-[var(--text-secondary)]">
                  <p>Removed: <span className="font-medium text-[var(--text-primary)]">{formatDate(supplier.removedAt)}</span></p>
                  <p>Restore until: <span className="font-medium text-[var(--text-primary)]">{formatDate(supplier.recoveryDeadline)}</span></p>
                  <p>{supplier.recoveryDaysRemaining} day{supplier.recoveryDaysRemaining === 1 ? '' : 's'} remaining</p>
                </div>
              )}

              <div className="mt-4 flex items-center justify-between pt-3 border-t border-[var(--border-color)]">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Open POs</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{supplier.openPOs}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Terms</p>
                    <p className="text-sm font-medium text-[var(--text-secondary)]">{supplier.paymentTerms}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {['Active', 'On Hold', 'Inactive'].includes(supplier.status) && <button
                    type="button" onClick={() => handleEdit(supplier)}
                    className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    title="Edit Supplier" aria-label={`Edit ${supplier.name}`}
                  ><Edit className="w-4 h-4" /></button>}
                  {supplier.status === 'Active' && <button
                    type="button" onClick={() => openLifecycleDialog(supplier, 'remove')}
                    className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                    title="Remove Supplier" aria-label={`Remove ${supplier.name}`}
                  ><Trash2 className="w-4 h-4" /></button>}
                  {supplier.status === 'Recently Removed' && supplier.restoreAllowed && <button
                    type="button" onClick={() => openLifecycleDialog(supplier, 'restore')}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-semibold text-cyan-700 transition-colors hover:bg-cyan-500/10 dark:text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  ><RotateCcw className="w-4 h-4" /> Restore</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Supplier Table View */}
      {viewMode === 'table' && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden">
          <div className="admin-table-scroll">
            <table className="admin-suppliers-table admin-responsive-table admin-cols-8 admin-sticky-1 w-full min-w-[900px]">
              <thead className="bg-[var(--bg-hover)] border-b border-[var(--border-color)]">
                <tr>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Supplier
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Contact Person
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Phone / Location
                  </th>
                  <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Open POs
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Payment Terms
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Status
                  </th>
                  <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{supplier.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">{supplier.code}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div>
                        <p className="text-sm text-[var(--text-secondary)]">{supplier.contactPerson}</p>
                        <p className="text-xs text-[var(--text-muted)]">{supplier.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div>
                        <p className="text-sm text-[var(--text-secondary)]">{supplier.phone}</p>
                        <p className="text-xs text-[var(--text-muted)]">{supplier.location}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center text-sm font-medium text-[var(--text-primary)]">
                      {supplier.openPOs}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-[var(--text-secondary)]">
                      {supplier.paymentTerms}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={supplier.status} />
                      {supplier.status === 'Recently Removed' && <p className="mt-1 text-xs text-[var(--text-muted)]">Restore by {formatDate(supplier.recoveryDeadline)}</p>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        {['Active', 'On Hold', 'Inactive'].includes(supplier.status) && <button
                          onClick={() => handleEdit(supplier)}
                          className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                          title="Edit Supplier"
                          aria-label={`Edit ${supplier.name}`}
                        >
                          <Edit className="w-4 h-4" />
                        </button>}
                        {['Active', 'On Hold', 'Inactive'].includes(supplier.status) && <button
                          onClick={() => void handleViewDetails(supplier)}
                          className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                          title="View Details"
                          aria-label={`View ${supplier.name} details`}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>}
                        {supplier.status === 'Active' && <button
                          type="button" onClick={() => openLifecycleDialog(supplier, 'remove')}
                          className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                          title="Remove Supplier" aria-label={`Remove ${supplier.name}`}
                        ><Trash2 className="w-4 h-4" /></button>}
                        {supplier.status === 'Recently Removed' && supplier.restoreAllowed && <button
                          type="button" onClick={() => openLifecycleDialog(supplier, 'restore')}
                          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-semibold text-cyan-700 transition-colors hover:bg-cyan-500/10 dark:text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                        ><RotateCcw className="w-4 h-4" /> Restore</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSuppliers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">
                      No suppliers found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-color)] bg-[var(--bg-hover)]">
            <div className="text-sm text-[var(--text-muted)]">
              Showing <span className="text-[var(--text-primary)] font-medium">1</span> to{' '}
              <span className="text-[var(--text-primary)] font-medium">{filteredSuppliers.length}</span> of{' '}
              <span className="text-[var(--text-primary)] font-medium">{suppliers.length}</span> suppliers
            </div>
            <div className="flex items-center gap-1">
              <button className="p-1.5 rounded-xl border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button className="px-3 py-1 rounded-xl text-sm font-medium bg-slate-200 text-slate-900 dark:bg-cyan-500 dark:text-slate-950">
                1
              </button>
              <button className="p-1.5 rounded-xl border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors">
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* ADD SUPPLIER MODAL */}
      {/* ============================================ */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Add New Supplier</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleCreate}>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
                  Supplier Name *
                </label>
                <input
                  name="name"
                  required
                  type="text"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="Enter supplier name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
                  Contact Person
                </label>
                <input
                  name="contact_person"
                  type="text"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="Full name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
                    Email
                  </label>
                  <input
                    name="email"
                    type="email"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    placeholder="contact@company.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
                    Phone
                  </label>
                  <input
                    name="phone"
                    type="text"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={PHONE_MAX_DIGITS}
                    pattern="[0-9]{0,11}"
                    title="Digits only, up to 11 (e.g. 09123456789)"
                    onInput={sanitizePhoneInput}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    placeholder="09123456789"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
                  Location
                </label>
                <input
                  name="address"
                  type="text"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="City, Country"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
                  Payment Terms
                </label>
                <select name="payment_terms" className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                  <option>Net 15</option>
                  <option>Net 30</option>
                  <option>Net 45</option>
                  <option>Net 60</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
                  Status
                </label>
                <select name="status" className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                  <option>Active</option>
                  <option>On Hold</option>
                  <option>Inactive</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Notes</label>
                <textarea name="notes" rows={3} className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40" placeholder="Optional supplier notes" />
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 border border-[var(--border-color)] rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950"
                >
                  <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Add Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* EDIT SUPPLIER MODAL */}
      {/* ============================================ */}
      {showEditModal && selectedSupplier && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Edit Supplier</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleUpdate}>
              <div>
                <label htmlFor="edit-supplier-code" className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Supplier Code</label>
                {/* Generated by the server and immutable; no name, so it is never submitted. */}
                <input id="edit-supplier-code" type="text" value={selectedSupplier.code} readOnly aria-readonly="true" className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] cursor-not-allowed opacity-70 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
                  Supplier Name *
                </label>
                <input
                  name="name"
                  required
                  type="text"
                  defaultValue={selectedSupplier.name}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
                  Contact Person
                </label>
                <input
                  name="contact_person"
                  type="text"
                  defaultValue={selectedSupplier.contactPerson}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
                    Email
                  </label>
                  <input
                    name="email"
                    type="email"
                    defaultValue={selectedSupplier.email}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
                    Phone
                  </label>
                  <input
                    name="phone"
                    type="text"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={PHONE_MAX_DIGITS}
                    pattern="[0-9]{0,11}"
                    title="Digits only, up to 11 (e.g. 09123456789)"
                    onInput={sanitizePhoneInput}
                    defaultValue={selectedSupplier.phone.replace(/\D/g, '')}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
                  Location
                </label>
                <input
                  name="address"
                  type="text"
                  defaultValue={selectedSupplier.location}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
                  Payment Terms
                </label>
                <select
                  name="payment_terms"
                  defaultValue={selectedSupplier.paymentTerms}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                >
                  <option>Net 15</option>
                  <option>Net 30</option>
                  <option>Net 45</option>
                  <option>Net 60</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">
                  Status
                </label>
                <select
                  name="status"
                  defaultValue={selectedSupplier.status}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                >
                  <option>Active</option>
                  <option>On Hold</option>
                  <option>Inactive</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Notes</label>
                <textarea name="notes" rows={3} defaultValue={selectedSupplier.notes} className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40" />
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-5 py-2.5 border border-[var(--border-color)] rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950"
                >
                  <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {actionSupplier && lifecycleAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) closeLifecycleDialog(); }}>
          <div
            ref={actionDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="supplier-lifecycle-title"
            aria-describedby="supplier-lifecycle-description"
            onKeyDown={handleLifecycleDialogKeyDown}
            className="w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-2xl"
          >
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${lifecycleAction === 'remove' ? 'bg-rose-500/10 text-rose-400' : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300'}`}>
              {lifecycleAction === 'remove' ? <AlertTriangle className="h-6 w-6" aria-hidden="true" /> : <RotateCcw className="h-6 w-6" aria-hidden="true" />}
            </div>
            <h2 id="supplier-lifecycle-title" className="mt-5 text-xl font-bold text-[var(--text-primary)]">
              {lifecycleAction === 'remove' ? 'Remove Supplier' : 'Restore Supplier'}
            </h2>
            <div id="supplier-lifecycle-description" className="mt-3 space-y-3 text-sm leading-6 text-[var(--text-secondary)]">
              {lifecycleAction === 'remove' ? <>
                <p>Are you sure you want to remove <strong className="text-[var(--text-primary)]">{actionSupplier.name}</strong> as a supplier?</p>
                <p>This supplier will no longer be available for new procurement transactions. You can restore it within 30 days.</p>
                <p>Existing purchase orders and historical records will remain unchanged.</p>
                {actionSupplier.openPOs > 0 && <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-200">This supplier has {actionSupplier.openPOs} open purchase order{actionSupplier.openPOs === 1 ? '' : 's'}. Existing orders will remain unchanged.</p>}
              </> : <p>Restore <strong className="text-[var(--text-primary)]">{actionSupplier.name}</strong> as an active supplier? It will become available for new procurement transactions again.</p>}
            </div>
            {error && <p role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button ref={cancelActionRef} type="button" disabled={saving} onClick={closeLifecycleDialog} className="min-h-11 cursor-pointer rounded-xl border border-[var(--border-color)] px-5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-60">Cancel</button>
              <button type="button" disabled={saving} onClick={() => void confirmLifecycleAction()} className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${lifecycleAction === 'remove' ? 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500/40' : 'bg-slate-900 text-white hover:bg-slate-800 focus:ring-cyan-500/40 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400'}`}>
                {lifecycleAction === 'remove' ? <Trash2 className="h-4 w-4" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                {saving ? 'Working…' : lifecycleAction === 'remove' ? 'Remove Supplier' : 'Restore Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Suppliers;
