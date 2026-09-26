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
  UserCheck,
  Search,
  Plus,
  Clock,
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Loader2,
  RefreshCw,
  LayoutGrid,
  LayoutList,
  RotateCcw,
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
  unit: string | null;
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
  items: Array<{ id: number; product_name: string; ordered_quantity: number; received_quantity: number; remaining_quantity: number; unit: string | null }>;
}

interface QaAssignee {
  id: number;
  name: string;
}

interface AssignmentToast {
  type: 'success' | 'error';
  message: string;
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
    'Awaiting Replacement': {
      color: 'text-violet-400',
      bg: 'bg-violet-500/10 border-violet-500/20',
      dotColor: 'bg-violet-400',
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
      className={`plant-manager-badge inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs ${color} ${bg}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {status}
    </span>
  );
};

const ReplacementBadge: React.FC<{ reference: string }> = ({ reference }) => (
  <span
    title={`Supplier replacement for rejected item ${reference}`}
    className="pm-rcv-replacement-badge plant-manager-badge inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full border border-violet-500/30 bg-violet-500/10 px-2 text-[10px] font-semibold leading-none text-violet-400"
  >
    <RotateCcw className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" aria-hidden="true" />
    Replacement
  </span>
);

const replacementUnit = (receiving: ApiReceiving) => receiving.items[0]?.unit ?? '';

const KPICard: React.FC<{
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  color?: string;
}> = ({ label, value, icon, subtitle, color = 'text-blue-400' }) => {
  return (
    <div className="pm-rcv-kpi bg-[#111827] border border-[#1f2937] rounded-2xl p-5 hover:border-[#3b82f6]/30 transition-all duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="mobile-kpi-title text-slate-400 text-xs font-medium uppercase tracking-wider">
            {label}
          </p>
          <p className="mobile-kpi-value text-2xl font-bold text-white mt-1.5">{value}</p>
          {subtitle && <p className="mobile-kpi-helper text-slate-500 text-xs mt-1">{subtitle}</p>}
        </div>
        <div className={`pm-rcv-kpi-icon p-2.5 bg-[#0b1220] rounded-lg ${color}`}>{icon}</div>
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
      (item) => !item.product || item.delivered_quantity === '' || Number(item.delivered_quantity) < 0 || Number(item.delivered_quantity) > item.remaining_quantity
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
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Purchase Order *</label>
              <select
                value={formData.purchase_order_id ?? ''}
                onChange={(e) => selectPurchaseOrder(e.target.value)}
                disabled={loadingPurchaseOrders}
                className="w-full bg-white dark:bg-[#0b0f19] border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:opacity-60"
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
                className="w-full bg-white dark:bg-[#0b0f19] border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-slate-400 placeholder:text-slate-400 dark:placeholder:text-inherit"
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
                className="w-full bg-white dark:bg-[#0b0f19] border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 placeholder:text-slate-400 dark:placeholder:text-inherit"
                placeholder="DEL-98765"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Delivery Date *</label>
              <input
                type="date"
                value={formData.delivery_date}
                onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                className="w-full bg-white dark:bg-[#0b0f19] border border-slate-300 dark:border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
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
                  <div className="col-span-5"><p className="text-sm text-slate-200">{item.product}</p><p className="text-xs text-slate-500">Ordered: {item.ordered_quantity} · Remaining: {item.remaining_quantity} {item.unit ?? '—'}</p></div>
                  <input
                    type="number"
                    min="0"
                    max={item.remaining_quantity}
                    value={item.delivered_quantity}
                    onChange={(e) => updateItem(index, { delivered_quantity: e.target.value })}
                    className="col-span-4 min-w-0 bg-white dark:bg-[#0b0f19] border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 placeholder:text-slate-400 dark:placeholder:text-inherit"
                    placeholder="Delivered qty"
                  />
                  <span className="col-span-3 text-sm text-slate-400">{item.unit ?? '—'}</span>
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
              className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 disabled:opacity-60"
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
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const itemsPerPage = 5;

  const [selectedReceivingId, setSelectedReceivingId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [qaAssignees, setQaAssignees] = useState<QaAssignee[]>([]);
  const [qaAssigneesLoading, setQaAssigneesLoading] = useState(true);
  const [qaAssigneesError, setQaAssigneesError] = useState<string | null>(null);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentTarget, setAssignmentTarget] = useState<ApiReceiving | null>(null);
  const [selectedQaUserId, setSelectedQaUserId] = useState<number | null>(null);
  const [assignmentToast, setAssignmentToast] = useState<AssignmentToast | null>(null);
  const [replacementQuantities, setReplacementQuantities] = useState<Record<number, string>>({});
  const [replacementDate, setReplacementDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [replacementReference, setReplacementReference] = useState('');
  const [replacementSaving, setReplacementSaving] = useState(false);
  const [replacementError, setReplacementError] = useState<string | null>(null);

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
    let active = true;
    apiClient.get<{ data: QaAssignee[] }>('/receivings/qa-assignees')
      .then((response) => { if (active) setQaAssignees(response.data.data); })
      .catch((error) => { if (active) setQaAssigneesError(getApiErrorMessage(error)); })
      .finally(() => { if (active) setQaAssigneesLoading(false); });
    return () => { active = false; };
  }, []);

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

  useEffect(() => {
    setReplacementQuantities({});
    setReplacementReference('');
    setReplacementError(null);
  }, [selectedReceivingId]);

  const handleConfirmReplacement = async (receiving: ApiReceiving) => {
    const items = receiving.items.map((item) => ({
      receiving_item_id: item.id,
      delivered_quantity: Number(replacementQuantities[item.id] ?? item.expected_quantity ?? 0),
    }));
    if (items.some((item) => !Number.isInteger(item.delivered_quantity) || item.delivered_quantity < 0)) {
      setReplacementError('Enter a whole-number delivered quantity for each product.');
      return;
    }
    setReplacementSaving(true);
    setReplacementError(null);
    try {
      const response = await apiClient.post<ApiReceiving>(`/receivings/${receiving.id}/confirm-replacement`, {
        delivery_date: replacementDate,
        reference_no: replacementReference.trim() || null,
        items,
      });
      setReceivings((current) => current.map((record) => (record.id === response.data.id ? response.data : record)));
      setAssignmentToast({ type: 'success', message: 'Replacement delivery confirmed. Assign a QA Supervisor to inspect it.' });
    } catch (error) {
      setReplacementError(getApiErrorMessage(error));
    } finally {
      setReplacementSaving(false);
    }
  };

  const openAssignmentModal = (receiving: ApiReceiving) => {
    setAssignmentTarget(receiving);
    setSelectedQaUserId(receiving.assigned_qa_user_id);
    setAssignmentError(null);
  };

  const closeAssignmentModal = () => {
    if (assignmentSaving) return;
    setAssignmentTarget(null);
    setSelectedQaUserId(null);
    setAssignmentError(null);
  };

  const handleAssignQa = async () => {
    if (!assignmentTarget || !selectedQaUserId) {
      setAssignmentError('Select a QA Supervisor before continuing.');
      return;
    }
    if (selectedQaUserId === assignmentTarget.assigned_qa_user_id) {
      setAssignmentError('Select a different QA Supervisor to reassign this receiving.');
      return;
    }
    setAssignmentSaving(true);
    setAssignmentError(null);
    try {
      const response = await apiClient.patch<ApiReceiving>(`/receivings/${assignmentTarget.id}/assign-qa`, {
        qa_user_id: selectedQaUserId,
      });
      setReceivings((current) => current.map((receiving) =>
        receiving.id === response.data.id ? response.data : receiving
      ));
      setAssignmentTarget(null);
      setSelectedQaUserId(null);
      setAssignmentToast({ type: 'success', message: 'Receiving assigned to QA Supervisor successfully.' });
    } catch (error) {
      setAssignmentError(getApiErrorMessage(error));
    } finally {
      setAssignmentSaving(false);
    }
  };

  useEffect(() => {
    if (!assignmentToast) return;
    const timeout = window.setTimeout(() => setAssignmentToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [assignmentToast]);

  useEffect(() => {
    if (!assignmentTarget) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !assignmentSaving) closeAssignmentModal();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [assignmentTarget, assignmentSaving]);

  return (
    <div className="pm-receiving-page mx-auto min-h-screen w-full max-w-7xl space-y-6 bg-[#0b1220] p-4 text-slate-100 sm:p-6">
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
          className="w-fit bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors sm:w-auto"
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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#1f2937] bg-[#111827] p-3 sm:gap-3 sm:p-4">
        <div className="pm-rcv-search relative basis-full min-w-0 sm:basis-auto sm:flex-1 sm:min-w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500 sm:h-4 sm:w-4" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search Receiving No., PO Number, Supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-[#1f2937] bg-[#0b1220] py-0 pl-10 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:h-auto sm:py-2.5 sm:pr-4 sm:text-sm"
          />
        </div>
        <div className="pm-rcv-select relative min-w-[108px] flex-1 sm:min-w-[130px] sm:flex-none">
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            aria-label="Filter by supplier"
            className="h-9 w-full cursor-pointer appearance-none rounded-xl border border-[#1f2937] bg-[#0b1220] py-0 pl-2.5 pr-7 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:h-auto sm:py-2.5 sm:pl-3 sm:pr-8 sm:text-sm"
          >
            {supplierOptions.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
        </div>
        <div className="pm-rcv-select relative min-w-[104px] flex-1 sm:min-w-[130px] sm:flex-none">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="h-9 w-full cursor-pointer appearance-none rounded-xl border border-[#1f2937] bg-[#0b1220] py-0 pl-2.5 pr-7 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:h-auto sm:py-2.5 sm:pl-3 sm:pr-8 sm:text-sm"
        >
          <option>All Status</option>
          <option>Pending QA</option>
          <option>Passed</option>
          <option>Rejected</option>
          <option>Partial</option>
          <option>Awaiting Replacement</option>
        </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
        </div>
        <div className="flex basis-full min-w-0 items-center gap-2 sm:basis-auto sm:gap-3">
          <div className="pm-rcv-select relative min-w-[112px] flex-1 sm:min-w-[130px] sm:flex-none">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            aria-label="Filter by date"
            className="h-9 w-full cursor-pointer appearance-none rounded-xl border border-[#1f2937] bg-[#0b1220] py-0 pl-2.5 pr-7 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:h-auto sm:py-2.5 sm:pl-3 sm:pr-8 sm:text-sm"
          >
            <option>All Dates</option>
            <option>Today</option>
            <option>This Week</option>
            <option>This Month</option>
          </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
          </div>
          <button
            onClick={fetchReceivings}
            aria-label="Refresh receiving records"
            title="Refresh"
            className="pm-rcv-refresh flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#1f2937] text-slate-400 transition-colors hover:bg-slate-800/30 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:h-10 sm:w-10"
          >
            <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="pm-rcv-toggle flex h-9 shrink-0 items-center gap-0.5 rounded-lg border border-[#1f2937] bg-[#0b1220] p-0.5 sm:h-auto sm:gap-1 sm:p-1" role="group" aria-label="Receiving view"><button type="button" onClick={() => setViewMode('list')} aria-label="List view" aria-pressed={viewMode === 'list'} title="List view" className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-200 text-slate-900 dark:bg-[#092635] dark:text-white' : 'text-slate-400 hover:text-white'}`}><LayoutList className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></button><button type="button" onClick={() => setViewMode('grid')} aria-label="Grid view" aria-pressed={viewMode === 'grid'} title="Grid view" className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${viewMode === 'grid' ? 'bg-slate-200 text-slate-900 dark:bg-[#092635] dark:text-white' : 'text-slate-400 hover:text-white'}`}><LayoutGrid className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></button></div>
        </div>
      </div>

      {/* Full-width Table */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-2xl overflow-hidden">
        {viewMode === 'list' ? (
        <div className="pm-table-scroll">
          <table className="pm-receiving-table pm-rcv-main-table pm-responsive-table pm-cols-9 pm-sticky-1 w-full min-w-[900px]">
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
                      <span className="block truncate">{record.receiving_no}</span>
                      {record.replacement && (
                        <span className="mt-1 block">
                          <ReplacementBadge reference={record.replacement.rejection_reference} />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300 max-sm:whitespace-nowrap">
                      {record.purchase_order}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">
                      <span className="block truncate" title={record.product_summary}>{record.product_summary}</span>
                      {record.replacement && (
                        <span className="pm-rcv-helper block text-[10px] text-violet-300 sm:text-xs">
                          Expected {record.replacement.expected_quantity} {replacementUnit(record)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">
                      <span className="block max-sm:truncate" title={record.supplier}>{record.supplier}</span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300 max-sm:whitespace-nowrap">
                      {formatDateOnly(record.delivery_date)}
                    </td>
                    <td className="px-4 py-3.5 text-center text-sm text-slate-300">
                      {record.replacement?.awaiting_delivery ? record.replacement.expected_quantity : record.items_count}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">
                      <span className="block max-sm:truncate" title={record.prepared_by || undefined}>{record.prepared_by || '—'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={record.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(record.id);
                          }}
                          aria-label={`View receiving ${record.receiving_no}`}
                          title="View Receiving"
                          className="min-h-11 min-w-11 cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:hover:bg-slate-700 dark:hover:text-white"
                        >
                          <Eye className="h-[13px] w-[13px] sm:h-4 sm:w-4" />
                        </button>
                        {record.status === 'Pending QA' && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openAssignmentModal(record);
                            }}
                            aria-label={`${record.assigned_qa ? 'Reassign' : 'Assign'} QA for ${record.receiving_no}`}
                            title={record.assigned_qa ? 'Reassign QA' : 'Assign QA'}
                            className="min-h-11 min-w-11 cursor-pointer rounded-lg p-2 text-cyan-400 transition-colors hover:bg-cyan-500/10 hover:text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          >
                            <UserCheck className="h-[13px] w-[13px] sm:h-4 sm:w-4" />
                          </button>
                        )}
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
        ) : loading ? (
          <div className="px-4 py-8 text-center text-slate-400"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading receiving records…</span></div>
        ) : paginatedReceivings.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">{paginatedReceivings.map((record) => <article key={record.id} onClick={() => handleRowClick(record.id)} className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold text-slate-900 dark:text-white">{record.receiving_no}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{record.purchase_order}</p>{record.replacement && <span className="mt-1.5 block"><ReplacementBadge reference={record.replacement.rejection_reference} /></span>}</div><StatusBadge status={record.status} /></div><p className="mt-4 font-medium text-slate-900 dark:text-white">{record.product_summary}</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{record.supplier}</p><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500 dark:text-slate-400">Delivery date</dt><dd className="text-slate-900 dark:text-white">{formatDateOnly(record.delivery_date)}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Items</dt><dd className="text-slate-900 dark:text-white">{record.items_count}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Prepared by</dt><dd className="text-slate-900 dark:text-white">{record.prepared_by || '—'}</dd></div>{record.replacement && <div><dt className="text-slate-500 dark:text-slate-400">Expected replacement</dt><dd className="font-medium text-violet-600 dark:text-violet-300">{record.replacement.expected_quantity} {replacementUnit(record)}</dd></div>}</dl><div className="mt-4 flex justify-end border-t border-slate-200 pt-3 dark:border-slate-700"><button onClick={(event) => { event.stopPropagation(); handleRowClick(record.id); }} className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" title="View"><Eye className="h-4 w-4" /></button></div></article>)}</div>
        ) : (
          <div className="px-4 py-8 text-center text-slate-400">No receiving records found.</div>
        )}

        {/* Pagination */}
        <div className="pm-rcv-pagination flex items-center justify-between px-6 py-4 border-t border-[#1f2937] bg-white dark:bg-[#0b1220]/30">
          <div className="text-sm text-slate-400">
            Showing {totalItems > 0 ? start : 0} to {end} of {totalItems} records
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
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
                    ? 'bg-slate-200 text-slate-900 dark:bg-cyan-500 dark:text-slate-950'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              aria-label="Next page"
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
            <div className="pm-rcv-details bg-[#111827] border border-[#1f2937] rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="p-5 border-b border-[#1f2937] flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                  <h3 className="text-[15px] font-semibold text-white sm:text-base">
                    Receiving Details
                  </h3>
                  <StatusBadge status={selectedReceiving.status} />
                  {selectedReceiving.replacement && <ReplacementBadge reference={selectedReceiving.replacement.rejection_reference} />}
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
              <div className="grid grid-cols-1 gap-4 p-4 text-[12px] sm:grid-cols-2 sm:p-5 sm:text-sm">
                <div>
                  <p className="text-[11px] text-slate-400 sm:text-sm">Receiving No.</p>
                  <p className="text-white font-medium">{selectedReceiving.receiving_no}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 sm:text-sm">Purchase Order</p>
                  <p className="text-white font-medium">{selectedReceiving.purchase_order}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 sm:text-sm">Supplier</p>
                  <p className="text-white font-medium">{selectedReceiving.supplier}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 sm:text-sm">Reference No.</p>
                  <p className="text-white font-medium">{selectedReceiving.reference_no || '-'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 sm:text-sm">Delivery Date</p>
                  <p className="text-white font-medium">{formatDateOnly(selectedReceiving.delivery_date)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 sm:text-sm">Prepared By</p>
                  <p className="text-white font-medium">{selectedReceiving.prepared_by || '-'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 sm:text-sm">Assigned QA</p>
                  <p className="font-medium text-white">{selectedReceiving.assigned_qa?.name ?? 'Unassigned'}</p>
                  {selectedReceiving.status === 'Pending QA' && (
                    <button type="button" onClick={() => openAssignmentModal(selectedReceiving)} className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-cyan-500/30 px-3 py-2 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-500/10 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                      <UserCheck className="h-4 w-4" />
                      {selectedReceiving.assigned_qa ? 'Reassign QA' : 'Assign QA Supervisor'}
                    </button>
                  )}
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] text-slate-400 sm:text-sm">Created At</p>
                  <p className="text-white font-medium">{formatCreatedAt(selectedReceiving.created_at)}</p>
                </div>
              </div>

              {selectedReceiving.replacement && (
                <div className="border-t border-[#1f2937] p-4 sm:p-5">
                  <h4 className="text-[12px] font-medium text-slate-300 sm:text-sm">Rejected item replacement</h4>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4 sm:text-sm [&_dt]:text-[11px] sm:[&_dt]:text-sm">
                    <div className="min-w-0"><dt className="text-slate-400">Related rejection</dt><dd className="truncate font-medium text-white">{selectedReceiving.replacement.rejection_reference}</dd></div>
                    <div className="min-w-0"><dt className="text-slate-400">Original receiving</dt><dd className="truncate font-medium text-white">{selectedReceiving.replacement.original_receiving_no ?? '—'}</dd></div>
                    <div className="min-w-0"><dt className="text-slate-400">Purchase Order</dt><dd className="truncate font-medium text-white">{selectedReceiving.purchase_order}</dd></div>
                    <div className="min-w-0"><dt className="text-slate-400">Expected replacement</dt><dd className="font-medium text-violet-300">{selectedReceiving.replacement.expected_quantity} {replacementUnit(selectedReceiving)}</dd></div>
                  </dl>
                  {selectedReceiving.replacement.awaiting_delivery && (
                    <form
                      className="mt-4 space-y-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 sm:p-4"
                      onSubmit={(event) => { event.preventDefault(); void handleConfirmReplacement(selectedReceiving); }}
                    >
                      <p className="text-xs text-slate-300 sm:text-sm">When the supplier's replacement arrives, record the quantity actually delivered. It then continues to QA inspection and Stock In as usual.</p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block text-xs text-slate-400 sm:text-sm">Delivery date
                          <input type="date" required value={replacementDate} onChange={(event) => setReplacementDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#1f2937] bg-[#0b1220] px-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:text-sm" />
                        </label>
                        <label className="block text-xs text-slate-400 sm:text-sm">Reference No. <span className="text-slate-500">(optional)</span>
                          <input type="text" maxLength={255} value={replacementReference} onChange={(event) => setReplacementReference(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#1f2937] bg-[#0b1220] px-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:text-sm" />
                        </label>
                        {selectedReceiving.items.map((item) => (
                          <label key={item.id} className="block min-w-0 text-xs text-slate-400 sm:text-sm">
                            <span className="block truncate" title={item.product_name}>{item.product_name} delivered (max {item.expected_quantity ?? 0} {item.unit})</span>
                            <input type="number" inputMode="numeric" min={0} max={item.expected_quantity ?? undefined} step={1} required value={replacementQuantities[item.id] ?? String(item.expected_quantity ?? 0)} onChange={(event) => setReplacementQuantities((current) => ({ ...current, [item.id]: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-[#1f2937] bg-[#0b1220] px-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:text-sm" />
                          </label>
                        ))}
                      </div>
                      {replacementError && <p role="alert" className="text-xs text-red-400 sm:text-sm">{replacementError}</p>}
                      <button type="submit" disabled={replacementSaving} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:text-sm">
                        {replacementSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Confirm replacement delivery
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Products */}
              <div className="border-t border-[#1f2937] p-5">
                <h4 className="mb-3 text-[12px] font-medium text-slate-300 sm:text-sm">Products</h4>
                <div className="pm-table-scroll">
                  <table className="pm-receiving-table pm-responsive-table pm-cols-4 pm-sticky-1 w-full min-w-[560px] text-[12px] sm:text-sm">
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
                          <td className="px-2 py-2 text-center text-white">{selectedReceiving.replacement?.awaiting_delivery ? `0 / ${item.expected_quantity ?? 0}` : item.delivered_quantity}</td>
                          <td className="px-2 py-2 text-slate-300">{item.unit ?? '—'}</td>
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
          <div className="pm-rcv-timeline bg-[#111827] border border-[#1f2937] rounded-2xl p-5 sticky top-6">
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

      {assignmentTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeAssignmentModal(); }}
          role="presentation"
        >
          <div role="dialog" aria-modal="true" aria-labelledby="assign-qa-title" className="w-full max-w-md rounded-2xl border border-[#1f2937] bg-[#111827] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1f2937] px-5 py-4">
              <div>
                <h2 id="assign-qa-title" className="text-lg font-semibold text-white">
                  {assignmentTarget.assigned_qa ? 'Reassign QA Supervisor' : 'Assign QA Supervisor'}
                </h2>
                <p className="mt-0.5 text-sm text-slate-400">Choose who will inspect this receiving.</p>
              </div>
              <button type="button" onClick={closeAssignmentModal} disabled={assignmentSaving} aria-label="Close assignment dialog" className="min-h-11 min-w-11 cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">
                <X className="mx-auto h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="rounded-xl border border-[#1f2937] bg-[#0b1220] px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Receiving</p>
                <p className="mt-1 font-semibold text-white">{assignmentTarget.receiving_no}</p>
                {assignmentTarget.assigned_qa && <p className="mt-1 text-xs text-slate-400">Currently assigned to {assignmentTarget.assigned_qa.name}</p>}
              </div>

              <div>
                <label htmlFor="qa-supervisor-select" className="mb-1.5 block text-sm font-medium text-slate-300">QA Supervisor</label>
                <select
                  id="qa-supervisor-select"
                  autoFocus
                  value={selectedQaUserId ?? ''}
                  onChange={(event) => {
                    setSelectedQaUserId(event.target.value ? Number(event.target.value) : null);
                    setAssignmentError(null);
                  }}
                  disabled={qaAssigneesLoading || assignmentSaving}
                  className="min-h-11 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none [color-scheme:light] transition-colors focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#1f2937] dark:bg-[#0b1220] dark:text-slate-100 dark:[color-scheme:dark]"
                >
                  <option value="" className="bg-white text-slate-600 dark:bg-[#0b1220] dark:text-slate-300">{qaAssigneesLoading ? 'Loading QA Supervisors…' : 'Select QA Supervisor'}</option>
                  {qaAssignees.map((qa) => <option key={qa.id} value={qa.id} className="bg-white text-slate-900 dark:bg-[#0b1220] dark:text-slate-100">{qa.name}</option>)}
                </select>
                {!qaAssigneesLoading && !qaAssigneesError && qaAssignees.length === 0 && <p className="mt-2 text-sm text-amber-400">No active QA Supervisors are available.</p>}
                {qaAssigneesError && <p role="alert" className="mt-2 text-sm text-red-400">{qaAssigneesError}</p>}
                {assignmentError && <p role="alert" className="mt-2 text-sm text-red-400">{assignmentError}</p>}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[#1f2937] px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeAssignmentModal} disabled={assignmentSaving} className="min-h-11 cursor-pointer rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
              <button
                type="button"
                onClick={() => void handleAssignQa()}
                disabled={assignmentSaving || qaAssigneesLoading || !selectedQaUserId || selectedQaUserId === assignmentTarget.assigned_qa_user_id}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {assignmentSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                {assignmentSaving ? 'Assigning…' : assignmentTarget.assigned_qa ? 'Reassign QA' : 'Assign QA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {assignmentToast && (
        <div role="status" className="fixed bottom-4 left-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-[#111827] px-4 py-3 text-white shadow-xl sm:left-auto sm:right-6 sm:max-w-md">
          {assignmentToast.type === 'success' ? <CheckCircle className="h-5 w-5 shrink-0 text-emerald-400" /> : <XCircle className="h-5 w-5 shrink-0 text-red-400" />}
          <span className="flex-1 text-sm">{assignmentToast.message}</span>
          <button type="button" onClick={() => setAssignmentToast(null)} aria-label="Dismiss notification" className="min-h-11 min-w-11 cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"><X className="mx-auto h-4 w-4" /></button>
        </div>
      )}

      <CreateReceivingModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateReceiving}
      />
    </div>
  );
};

export default ReceivingManagement;
