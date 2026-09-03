// src/pages/admin/Suppliers.tsx
import React, { useCallback, useEffect, useState } from 'react';
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
  Download,
  Printer,
  RefreshCw,
  Grid,
  List,
  X,
  Save,
  ExternalLink,
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
  status: 'Active' | 'On Hold' | 'Inactive';
  notes: string;
}

// ============================================
// CONSTANTS
// ============================================

const statusOptions = ['All', 'Active', 'On Hold', 'Inactive'];

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
  };
  const { color, dotColor } = config[status] || config['Active'];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}
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
  const [statusFilter, setStatusFilter] = useState('All');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const apiStatus = (status: string) => status === 'On Hold' ? 'ON_HOLD' : status.toUpperCase();
  const uiStatus = (status: string): Supplier['status'] => status === 'ON_HOLD' ? 'On Hold' : status === 'INACTIVE' ? 'Inactive' : 'Active';
  const mapSupplier = (supplier: any): Supplier => ({
    id: String(supplier.id), code: supplier.supplier_code, name: supplier.name,
    contactPerson: supplier.contact_person || '', email: supplier.email || '', phone: supplier.phone || '',
    location: supplier.address || '', openPOs: 0, paymentTerms: supplier.payment_terms || '',
    status: uiStatus(supplier.status), notes: supplier.notes || '',
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

  const payloadFromForm = (form: HTMLFormElement) => {
    const data = new FormData(form);
    return {
      supplier_code: String(data.get('supplier_code') || '').trim(), name: String(data.get('name') || '').trim(),
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

  {/* FIX: Dark mode canvas adaptation */}
  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6 bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors duration-200">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <span>Admin</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-[var(--text-inverse)]">Suppliers</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Suppliers</h1>
          <p className="text-sm text-[var(--text-secondary)]">Manage vendor relationships, contacts, and performance metrics</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => void loadSuppliers()}
            disabled={loading}
            className="p-2.5 rounded-xl border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            className="p-2.5 rounded-xl border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            title="Export"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            className="p-2.5 rounded-xl border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            title="Print"
          >
            <Printer className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1 bg-[var(--bg-hover)] rounded-xl p-1">
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
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Total Suppliers</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{totalSuppliers}</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 text-center hover:border-[var(--border-color-strong)] transition-colors">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Active Vendors</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{activeSuppliers}</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 text-center hover:border-[var(--border-color-strong)] transition-colors">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">On Hold</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{onHoldSuppliers}</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 text-center hover:border-[var(--border-color-strong)] transition-colors">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Open POs</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{totalOpenPOs}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1 bg-[var(--bg-hover)] rounded-full p-1">
            {statusOptions.map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  statusFilter === status
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
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
                <button
                  onClick={() => handleEdit(supplier)}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  title="Edit Supplier"
                >
                  <Edit className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Supplier Table View */}
      {viewMode === 'table' && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
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
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEdit(supplier)}
                          className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                          title="Edit Supplier"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => void handleViewDetails(supplier)}
                          className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                          title="View Details"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
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
              <button className="px-3 py-1 rounded-xl text-sm font-medium bg-cyan-500 text-slate-950">
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
                <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Supplier Code *</label>
                <input name="supplier_code" required maxLength={50} type="text" className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40" placeholder="SUP-001" />
              </div>
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
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    placeholder="+1 234 567 8900"
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
                <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Supplier Code *</label>
                <input name="supplier_code" required maxLength={50} type="text" defaultValue={selectedSupplier.code} className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40" />
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
                    defaultValue={selectedSupplier.phone}
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
    </div>
  );
};

export default Suppliers;

