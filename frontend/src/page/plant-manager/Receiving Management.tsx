// src/page/plant-manager/ReceivingManagement.tsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { AxiosError } from 'axios';
import { apiClient } from '../../lib/api';
import type { ApiReceiving } from '../../types';
import {
  Package,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  MoreHorizontal,
  Search,
  Plus,
  Clock,
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  RefreshCw,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface CreateReceivingItemInput {
  purchase_order_item_id: number;
  product: string;
  ordered_quantity: number;
  remaining_quantity: number;
  delivered_quantity: string;
  unit: string;
}

interface CreateReceivingFormData {
  purchase_order_id: number | null;
  supplier: string;
  reference_no: string;
  delivery_date: string;
  items: CreateReceivingItemInput[];
}

interface ApprovedPurchaseOrder {
  id: number;
  po_number: string;
  supplier_name: string;
  status: string;
  items: Array<{ id: number; product_name: string; ordered_quantity: number; received_quantity: number; remaining_quantity: number; unit: string }>;
}

// ============================================
// HELPERS
// ============================================

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateOnly(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString);
  if (!match) return '—';
  const [, y, m, d] = match;
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

function formatDateTimeParts(dateString: string | null | undefined): { date: string; time: string } {
  if (!dateString) return { date: '—', time: '' };
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return { date: '—', time: '' };
  return {
    date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

function formatCreatedAt(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function matchesDateFilter(dateString: string, filter: string): boolean {
  if (filter === 'All Dates') return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString);
  if (!match) return false;
  const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (filter === 'Today') {
    return target.getTime() === today.getTime();
  }
  if (filter === 'This Week') {
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    return target >= startOfWeek && target <= endOfWeek;
  }
  if (filter === 'This Month') {
    return target.getFullYear() === today.getFullYear() && target.getMonth() === today.getMonth();
  }
  return true;
}

function getApiErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError<{ message?: string; errors?: Record<string, string[]> }>;
  const status = axiosError.response?.status;
  if (status === 401) return 'Session expired. Please log in again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 422 && axiosError.response?.data?.errors) {
    const firstError = Object.values(axiosError.response.data.errors)[0];
    return Array.isArray(firstError) ? firstError[0] : String(firstError);
  }
  const msg = axiosError.response?.data?.message;
  if (typeof msg === 'string') return msg;
  return 'An unexpected error occurred. Please try again.';
}

const emptyForm = (): CreateReceivingFormData => ({
  purchase_order_id: null,
  supplier: '',
  reference_no: '',
  delivery_date: '',
  items: [],
});

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { color: string; bg: string; dotColor: string }> = {
    'Pending QA': {
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
      dotColor: 'bg-amber-400',
    },
    Passed: {
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      dotColor: 'bg-emerald-400',
    },
    Rejected: {
      color: 'text-red-400',
      bg: 'bg-red-500/10 border-red-500/20',
      dotColor: 'bg-red-400',
    },
    Partial: {
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      dotColor: 'bg-blue-400',
    },
  };
  const matchedConfig = config[status] || {
    color: 'text-gray-400',
    bg: 'bg-gray-500/10 border-gray-500/20',
    dotColor: 'bg-gray-400',
  };
  const { color, bg, dotColor } = matchedConfig;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color} ${bg}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {status}
    </span>
  );
};

const KPICard: React.FC<{
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  color?: string;
}> = ({ label, value, icon, subtitle, color = 'text-blue-400' }) => {
  return (
    <div className="bg-[#111827] border border-[#1f2937] rounded-2xl p-5 hover:border-[#3b82f6]/30 transition-all duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">
            {label}
          </p>
          <p className="text-2xl font-bold text-white mt-1.5">{value}</p>
          {subtitle && <p className="text-slate-500 text-xs mt-1">{subtitle}</p>}
        </div>
        <div className={`p-2.5 bg-[#0b1220] rounded-lg ${color}`}>{icon}</div>
      </div>
    </div>
  );
};

// ============================================
// CREATE RECEIVING MODAL
// ============================================

const CreateReceivingModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateReceivingFormData) => Promise<void>;
}> = ({ isOpen, onClose, onSubmit }) => {
  const [formData, setFormData] = useState<CreateReceivingFormData>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<ApprovedPurchaseOrder[]>([]);
  const [loadingPurchaseOrders, setLoadingPurchaseOrders] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData(emptyForm());
      setFormError(null);
      setLoadingPurchaseOrders(true);
      apiClient.get<{ data: ApprovedPurchaseOrder[] }>('/purchase-orders/approved')
        .then((response) => setPurchaseOrders(response.data.data))
        .catch((error) => setFormError(getApiErrorMessage(error)))
        .finally(() => setLoadingPurchaseOrders(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const updateItem = (index: number, patch: Partial<CreateReceivingItemInput>) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };

  const selectPurchaseOrder = (purchaseOrderId: string) => {
    const order = purchaseOrders.find((candidate) => candidate.id === Number(purchaseOrderId));
    setFormData((prev) => ({
      ...prev,
      purchase_order_id: order?.id ?? null,
      supplier: order?.supplier_name ?? '',
      items: order?.items.map((item) => ({
        purchase_order_item_id: item.id,
        product: item.product_name,
        ordered_quantity: item.ordered_quantity,
        remaining_quantity: item.remaining_quantity,
        delivered_quantity: String(item.remaining_quantity),
        unit: item.unit,
      })) ?? [],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.purchase_order_id || !formData.supplier || !formData.delivery_date) {
      setFormError('Please fill in all required fields.');
      return;
    }
    const invalidItem = formData.items.some(
      (item) => !item.product || !item.unit || item.delivered_quantity === '' || Number(item.delivered_quantity) < 0 || Number(item.delivered_quantity) > item.remaining_quantity
    );
    if (invalidItem) {
      setFormError('Delivered quantities must be between 0 and the remaining PO quantity.');
      return;
    }
    if (!formData.items.some((item) => Number(item.delivered_quantity) > 0)) {
      setFormError('Enter a delivered quantity for at least one product.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0d1322] border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Create Receiving</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Purchase Order *</label>
              <select
                value={formData.purchase_order_id ?? ''}
                onChange={(e) => selectPurchaseOrder(e.target.value)}
                disabled={loadingPurchaseOrders}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:opacity-60"
                required
              >
                <option value="">{loadingPurchaseOrders ? 'Loading purchase orders…' : 'Select a purchase order'}</option>
                {purchaseOrders.map((order) => (
                  <option key={order.id} value={order.id}>{order.po_number}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Supplier *</label>
              <input
                type="text"
                value={formData.supplier}
                readOnly
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-400"
                placeholder="Populated from selected PO"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Reference No.</label>
              <input
                type="text"
                value={formData.reference_no}
                onChange={(e) => setFormData({ ...formData, reference_no: e.target.value })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                placeholder="DEL-98765"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Delivery Date *</label>
              <input
                type="date"
                value={formData.delivery_date}
                onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                required
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mt-3 mb-2">
              <label className="text-sm font-medium text-slate-300">Products *</label>
              <span className="text-xs text-slate-500">Expected vs. delivered</span>
            </div>
            <div className="space-y-3">
              {formData.items.map((item, index) => (
                <div key={item.purchase_order_item_id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5"><p className="text-sm text-slate-200">{item.product}</p><p className="text-xs text-slate-500">Ordered: {item.ordered_quantity} · Remaining: {item.remaining_quantity} {item.unit}</p></div>
                  <input
                    type="number"
                    min="0"
                    max={item.remaining_quantity}
                    value={item.delivered_quantity}
                    onChange={(e) => updateItem(index, { delivered_quantity: e.target.value })}
                    className="col-span-4 bg-[#0b0f19] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    placeholder="Delivered qty"
                  />
                  <span className="col-span-3 text-sm text-slate-400">{item.unit}</span>
                </div>
              ))}
              {formData.items.length === 0 && <p className="text-sm text-slate-500 py-3">Select a purchase order to load its products.</p>}
            </div>
          </div>

          {formError && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 text-slate-950 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Receiving
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const ReceivingManagement: React.FC = () => {
  const [receivings, setReceivings] = useState<ApiReceiving[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('All Suppliers');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [dateFilter, setDateFilter] = useState('All Dates');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const [selectedReceivingId, setSelectedReceivingId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchReceivings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiClient.get<{ data: ApiReceiving[] }>('/receivings');
      setReceivings(res.data.data);
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReceivings();
  }, [fetchReceivings]);

  useEffect(() => {
    if (receivings.length === 0) {
      setSelectedReceivingId(null);
      return;
    }
    if (!receivings.some((r) => r.id === selectedReceivingId)) {
      setSelectedReceivingId(receivings[0].id);
    }
  }, [receivings, selectedReceivingId]);

  const selectedReceiving = useMemo(() => {
    return receivings.find((r) => r.id === selectedReceivingId) || null;
  }, [receivings, selectedReceivingId]);

  const supplierOptions = useMemo(() => {
    const unique = Array.from(new Set(receivings.map((r) => r.supplier)));
    return ['All Suppliers', ...unique];
  }, [receivings]);

  // Filter data
  const filteredReceivings = useMemo(() => {
    return receivings.filter((r) => {
      const matchSearch =
        r.receiving_no.toLowerCase().includes(search.toLowerCase()) ||
        r.purchase_order.toLowerCase().includes(search.toLowerCase()) ||
        r.supplier.toLowerCase().includes(search.toLowerCase());
      const matchSupplier = supplierFilter === 'All Suppliers' || r.supplier === supplierFilter;
      const matchStatus = statusFilter === 'All Status' || r.status === statusFilter;
      const matchDate = matchesDateFilter(r.delivery_date, dateFilter);
      return matchSearch && matchSupplier && matchStatus && matchDate;
    });
  }, [receivings, search, supplierFilter, statusFilter, dateFilter]);

  // Pagination
  const totalItems = filteredReceivings.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, totalItems);
  const paginatedReceivings = filteredReceivings.slice(start - 1, end);

  // KPI data
  const totalDeliveries = receivings.length;
  const pendingQA = receivings.filter((r) => r.status === 'Pending QA').length;
  const passed = receivings.filter((r) => r.status === 'Passed').length;
  const rejected = receivings.filter((r) => r.status === 'Rejected').length;
  const partial = receivings.filter((r) => r.status === 'Partial').length;

  const handleRowClick = (id: number) => {
    setSelectedReceivingId(id);
  };

  const handleCreateReceiving = async (formData: CreateReceivingFormData) => {
    const payload = {
      purchase_order_id: formData.purchase_order_id,
      reference_no: formData.reference_no || null,
      delivery_date: formData.delivery_date,
      items: formData.items.map((item) => ({
        purchase_order_item_id: item.purchase_order_item_id,
        delivered_quantity: Number(item.delivered_quantity),
      })),
    };

    const res = await apiClient.post<ApiReceiving>('/receivings', payload);
    setReceivings((prev) => [res.data, ...prev]);
    setSelectedReceivingId(res.data.id);
    setShowCreateModal(false);
    setCurrentPage(1);
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6 bg-[#0b1220] text-slate-100 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Receiving Management</h1>
          <p className="text-slate-400 text-sm">
            Manage all incoming deliveries from suppliers.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" /> Create Receiving
        </button>
      </div>

      {loadError && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl p-4 flex items-center justify-between gap-4">
          <span className="text-sm">{loadError}</span>
          <button
            onClick={fetchReceivings}
            className="flex items-center gap-1.5 text-sm font-medium hover:text-red-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard
          label="Total Deliveries"
          value={totalDeliveries}
          icon={<Package className="w-5 h-5" />}
          subtitle="All Receiving Records"
          color="text-blue-400"
        />
        <KPICard
          label="Pending QA"
          value={pendingQA}
          icon={<Clock className="w-5 h-5" />}
          subtitle="Awaiting Inspection"
          color="text-amber-400"
        />
        <KPICard
          label="Passed"
          value={passed}
          icon={<CheckCircle className="w-5 h-5" />}
          subtitle="Approved by QA"
          color="text-emerald-400"
        />
        <KPICard
          label="Rejected"
          value={rejected}
          icon={<XCircle className="w-5 h-5" />}
          subtitle="Rejected by QA"
          color="text-red-400"
        />
        <KPICard
          label="Partial"
          value={partial}
          icon={<AlertCircle className="w-5 h-5" />}
          subtitle="Partial Acceptance"
          color="text-blue-400"
        />
      </div>

      {/* Search & Filters */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search Receiving No., PO Number, Supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0b1220] border border-[#1f2937] rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          />
        </div>
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="bg-[#0b1220] border border-[#1f2937] rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer min-w-[130px]"
        >
          {supplierOptions.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[#0b1220] border border-[#1f2937] rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer min-w-[130px]"
        >
          <option>All Status</option>
          <option>Pending QA</option>
          <option>Passed</option>
          <option>Rejected</option>
          <option>Partial</option>
        </select>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="bg-[#0b1220] border border-[#1f2937] rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer min-w-[130px]"
        >
          <option>All Dates</option>
          <option>Today</option>
          <option>This Week</option>
          <option>This Month</option>
        </select>
        <button
          onClick={fetchReceivings}
          className="p-2.5 rounded-xl border border-[#1f2937] hover:bg-slate-800/30 transition-colors text-slate-400 hover:text-slate-200"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Full-width Table */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-[#0b1220]/50 border-b border-[#1f2937]">
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Receiving No.
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  PO Number
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Product
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Supplier
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Expected Date
                </th>
                <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400">
                  Items
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Prepared By
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Status
                </th>
                <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading receiving records…
                    </span>
                  </td>
                </tr>
              )}
              {!loading &&
                paginatedReceivings.map((record) => (
                  <tr
                    key={record.id}
                    onClick={() => handleRowClick(record.id)}
                    className={`border-b border-[#1f2937] hover:bg-slate-800/30 transition-all cursor-pointer ${
                      selectedReceivingId === record.id ? 'bg-slate-800/30' : ''
                    }`}
                  >
                    <td className="px-4 py-3.5 text-sm font-medium text-white">
                      {record.receiving_no}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">
                      {record.purchase_order}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">
                      {record.product_summary}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">
                      {record.supplier}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">
                      {formatDateOnly(record.delivery_date)}
                    </td>
                    <td className="px-4 py-3.5 text-center text-sm text-slate-300">
                      {record.items_count}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">
                      {record.prepared_by || '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={record.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(record.id);
                          }}
                          className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-all">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              {!loading && paginatedReceivings.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    No receiving records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#1f2937] bg-[#0b1220]/30">
          <div className="text-sm text-slate-400">
            Showing {totalItems > 0 ? start : 0} to {end} of {totalItems} records
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-xl border border-[#1f2937] text-slate-400 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={`px-3 py-1 rounded-xl text-sm font-medium transition-all ${
                  currentPage === p
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-xl border border-[#1f2937] text-slate-400 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Section: Details & Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel: Receiving Details (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {selectedReceiving ? (
            <div className="bg-[#111827] border border-[#1f2937] rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="p-5 border-b border-[#1f2937] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-white">
                    Receiving Details
                  </h3>
                  <StatusBadge status={selectedReceiving.status} />
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all">
                    <Download className="w-4 h-4" />
                  </button>
                  <button className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all">
                    <Printer className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Details Grid */}
              <div className="p-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-400">Receiving No.</p>
                  <p className="text-white font-medium">{selectedReceiving.receiving_no}</p>
                </div>
                <div>
                  <p className="text-slate-400">Purchase Order</p>
                  <p className="text-white font-medium">{selectedReceiving.purchase_order}</p>
                </div>
                <div>
                  <p className="text-slate-400">Supplier</p>
                  <p className="text-white font-medium">{selectedReceiving.supplier}</p>
                </div>
                <div>
                  <p className="text-slate-400">Reference No.</p>
                  <p className="text-white font-medium">{selectedReceiving.reference_no || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-400">Delivery Date</p>
                  <p className="text-white font-medium">{formatDateOnly(selectedReceiving.delivery_date)}</p>
                </div>
                <div>
                  <p className="text-slate-400">Prepared By</p>
                  <p className="text-white font-medium">{selectedReceiving.prepared_by || '-'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-slate-400">Created At</p>
                  <p className="text-white font-medium">{formatCreatedAt(selectedReceiving.created_at)}</p>
                </div>
              </div>

              {/* Products */}
              <div className="border-t border-[#1f2937] p-5">
                <h4 className="text-sm font-medium text-slate-300 mb-3">Products</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-[#1f2937]">
                      <tr className="text-left text-slate-400">
                        <th className="px-2 py-2 font-medium">Product</th>
                        <th className="px-2 py-2 font-medium text-center">Delivered Qty</th>
                        <th className="px-2 py-2 font-medium">Unit</th>
                        <th className="px-2 py-2 font-medium">Inspection Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReceiving.items.map((item) => (
                        <tr key={item.id} className="border-b border-[#1f2937] hover:bg-slate-800/30">
                          <td className="px-2 py-2 text-white">{item.product_name}</td>
                          <td className="px-2 py-2 text-center text-white">{item.delivered_quantity}</td>
                          <td className="px-2 py-2 text-slate-300">{item.unit}</td>
                          <td className="px-2 py-2">
                            <StatusBadge status={item.inspection_status} />
                          </td>
                        </tr>
                      ))}
                      {selectedReceiving.items.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-2 py-4 text-center text-slate-400">
                            No products recorded.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#111827] border border-[#1f2937] rounded-2xl p-6 text-center text-slate-400">
              {loading ? 'Loading receiving records…' : 'Select a receiving record to view details.'}
            </div>
          )}
        </div>

        {/* Right Panel: Timeline (1/3 width) */}
        <div className="lg:col-span-1">
          <div className="bg-[#111827] border border-[#1f2937] rounded-2xl p-5 sticky top-6">
            <h3 className="text-lg font-semibold text-white mb-4">Timeline</h3>
            {selectedReceiving?.timeline && selectedReceiving.timeline.length > 0 ? (
              <div className="space-y-4 relative">
                {selectedReceiving.timeline.map((event, idx) => {
                  const { date, time } = formatDateTimeParts(event.occurred_at);
                  return (
                    <div key={idx} className="flex items-start gap-3 relative">
                      {idx < selectedReceiving.timeline.length - 1 && (
                        <div className="absolute left-2.5 top-5 bottom-0 w-0.5 bg-slate-700" />
                      )}
                      <div className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <div className="w-2 h-2 rounded-full bg-cyan-500" />
                      </div>
                      <div className="flex-1 pb-4">
                        <p className="text-white font-medium">{event.status}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span>{date}</span>
                          <span>•</span>
                          <span>{time}</span>
                          <span>•</span>
                          <span>by {event.performed_by}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-400">No timeline events.</p>
            )}
          </div>
        </div>
      </div>

      <CreateReceivingModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateReceiving}
      />
    </div>
  );
};

export default ReceivingManagement;
