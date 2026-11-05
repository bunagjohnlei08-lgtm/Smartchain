import { ClassificationBadge } from '../../components/catalog/ProductFields';
// src/page/plant-manager/ReceivingManagement.tsx
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { AxiosError } from 'axios';
import { apiClient } from '../../lib/api';
import { sha256File } from '../../lib/fileSha256';
import { appendReceiptFiles, createReceiptPreview, RECEIPT_MAX_FILES, validateReceiptFile } from '../../lib/receiptFiles';
import type { ApiExcessReview, ApiReceiving } from '../../types';
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
  FileText,
  Image as ImageIcon,
  Trash2,
  Upload,
  AlertTriangle,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface CreateReceivingItemInput {
  purchase_order_item_id: number;
  product: string;
  ordered_quantity: number;
  previously_received: number;
  remaining_quantity: number;
  delivered_quantity: string;
  unit: string | null;
}

interface CreateReceivingFormData {
  submission_key: string;
  purchase_order_id: number | null;
  supplier: string;
  reference_no: string;
  delivery_date: string;
  items: CreateReceivingItemInput[];
  receipts: File[];
}

interface QuantityDiscrepancy extends CreateReceivingItemInput {
  delivered: number;
  difference: number;
  direction: 'short' | 'extra';
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

type ReceivingView = 'active' | 'history';
type ReceivingWorkstream = 'normal' | 'excess';

interface ReceivingListResponse {
  data: ApiReceiving[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
  };
  summary: {
    total: number;
    pending_qa: number;
    passed: number;
    rejected: number;
    partial: number;
  };
  suppliers: string[];
}

interface ExcessListResponse {
  data: ApiExcessReview[];
  meta: ReceivingListResponse['meta'];
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

function getApiErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError<{ message?: string; errors?: Record<string, string[]> }>;
  const status = axiosError.response?.status;
  if (status === 401) return 'Session expired. Please log in again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 413) return 'The server rejected the upload size. Try smaller receipt files or ask the administrator to check the upload limits.';
  if (status === 422 && axiosError.response?.data?.errors) {
    const firstError = Object.values(axiosError.response.data.errors)[0];
    return Array.isArray(firstError) ? firstError[0] : String(firstError);
  }
  const msg = axiosError.response?.data?.message;
  if (typeof msg === 'string') return msg;
  return 'An unexpected error occurred. Please try again.';
}

const emptyForm = (): CreateReceivingFormData => ({
  submission_key: crypto.randomUUID(),
  purchase_order_id: null,
  supplier: '',
  reference_no: '',
  delivery_date: '',
  items: [],
  receipts: [],
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
    Completed: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dotColor: 'bg-emerald-400' },
    'PENDING REVIEW': { color: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-500/20', dotColor: 'bg-orange-400' },
    'DOCUMENTATION REQUESTED': { color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20', dotColor: 'bg-amber-400' },
    'DOCUMENTATION SUBMITTED': { color: 'text-cyan-300', bg: 'bg-cyan-500/10 border-cyan-500/20', dotColor: 'bg-cyan-400' },
    'AWAITING FINANCIAL RECONCILIATION': { color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20', dotColor: 'bg-amber-400' },
    'APPROVED FOR QA': { color: 'text-cyan-300', bg: 'bg-cyan-500/10 border-cyan-500/20', dotColor: 'bg-cyan-400' },
    'REJECTED RETURN REQUIRED': { color: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-500/20', dotColor: 'bg-orange-400' },
    'RETURN IN PROGRESS': { color: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-500/20', dotColor: 'bg-orange-400' },
    'RETURNED TO SUPPLIER': { color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20', dotColor: 'bg-emerald-400' },
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

const ReceiptPreview: React.FC<{ file: File; onRemove: () => void; disabled?: boolean }> = ({ file, onRemove, disabled }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const preview = createReceiptPreview(file);
    setPreviewUrl(preview.url);
    return preview.dispose;
  }, [file]);

  return (
    <li className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-700 bg-[#0b1220] p-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-800 text-cyan-700 dark:text-cyan-300">
        {previewUrl ? <img src={previewUrl} alt="Supplier receipt preview" onError={() => setPreviewUrl(null)} className="h-full w-full object-cover" /> : <FileText className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100" title={file.name}>{file.name}</p>
        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{file.type === 'application/pdf' ? 'PDF' : file.type.replace('image/', '').toUpperCase()} · {(file.size / 1024).toFixed(0)} KB</p>
      </div>
      <button type="button" onClick={onRemove} disabled={disabled} aria-label={`Remove ${file.name}`} className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
    </li>
  );
};

const ReceiptFilePicker: React.FC<{
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  inputId: string;
}> = ({ files, onChange, disabled, inputId }) => {
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [processingFiles, setProcessingFiles] = useState(false);

  const addFiles = async (incoming: File[]) => {
    if (disabled || processingFiles || incoming.length === 0) return;
    setProcessingFiles(true);
    try {
      const result = await appendReceiptFiles(files, incoming, sha256File);
      setReceiptError(result.error);
      if (!result.error) onChange(result.files);
    } finally {
      setProcessingFiles(false);
    }
  };

  const pickerDisabled = disabled || processingFiles;

  return <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4" aria-labelledby={`${inputId}-title`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 id={`${inputId}-title`} className="text-sm font-semibold text-slate-900 dark:text-slate-100">Supplier Delivery Receipt *</h3>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Attach 1–4 supplier document copies. JPG, PNG, or PDF; 10 MB each.</p>
      </div>
      <span aria-live="polite" className="rounded-full border border-slate-600 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">{files.length} / {RECEIPT_MAX_FILES} files</span>
    </div>
    {files.length > 0 && <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">{files.map((file, index) => <ReceiptPreview key={`${file.name}-${file.lastModified}-${index}`} file={file} disabled={disabled || processingFiles} onRemove={() => { setReceiptError(null); onChange(files.filter((_, fileIndex) => fileIndex !== index)); }} />)}</ul>}
    <input id={inputId} type="file" accept="image/jpeg,image/png,application/pdf" multiple disabled={pickerDisabled} className="sr-only" onChange={(event) => { const selected = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; void addFiles(selected); }} />
    <label htmlFor={inputId} aria-disabled={pickerDisabled} className={`mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-500/30 px-4 text-sm font-medium text-cyan-700 dark:text-cyan-300 transition-colors focus-within:ring-2 focus-within:ring-cyan-500 ${pickerDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-cyan-500/10'}`}><Upload className="h-4 w-4" /> {processingFiles ? 'Checking receipts...' : 'Add receipt'}</label>
    {receiptError && <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{receiptError}</p>}
  </section>
};

// ============================================
// CREATE RECEIVING MODAL
// ============================================

const CreateReceivingModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateReceivingFormData, mode?: 'normal' | 'excess') => Promise<void>;
}> = ({ isOpen, onClose, onSubmit }) => {
  const [formData, setFormData] = useState<CreateReceivingFormData>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<ApprovedPurchaseOrder[]>([]);
  const [loadingPurchaseOrders, setLoadingPurchaseOrders] = useState(false);
  const [discrepancies, setDiscrepancies] = useState<QuantityDiscrepancy[]>([]);
  const hasExcessDiscrepancy = discrepancies.some((item) => item.direction === 'extra');

  useEffect(() => {
    if (isOpen) {
      setFormData(emptyForm());
      setFormError(null);
      setDiscrepancies([]);
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
        previously_received: item.received_quantity,
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
      (item) => !item.product || item.delivered_quantity === '' || !Number.isInteger(Number(item.delivered_quantity)) || Number(item.delivered_quantity) < 0
    );
    if (invalidItem) {
      setFormError('Delivered quantities must be whole numbers of zero or more.');
      return;
    }
    if (!formData.items.some((item) => Number(item.delivered_quantity) > 0)) {
      setFormError('Enter a delivered quantity for at least one product.');
      return;
    }
    if (formData.receipts.length < 1) {
      setFormError('Attach at least one supplier delivery receipt before confirming Receiving.');
      return;
    }
    const receiptError = formData.receipts.map(validateReceiptFile).find(Boolean);
    if (receiptError) {
      setFormError(receiptError);
      return;
    }

    const latestDiscrepancies = formData.items.flatMap((item): QuantityDiscrepancy[] => {
      const delivered = Number(item.delivered_quantity);
      if (delivered === item.remaining_quantity) return [];
      return [{ ...item, delivered, difference: Math.abs(item.remaining_quantity - delivered), direction: delivered < item.remaining_quantity ? 'short' : 'extra' }];
    });
    if (latestDiscrepancies.length > 0) {
      setDiscrepancies(latestDiscrepancies);
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

  const confirmDiscrepancies = async () => {
    if (submitting) return;
    setDiscrepancies([]);
    setSubmitting(true);
    try {
      await onSubmit(formData, hasExcessDiscrepancy ? 'excess' : 'normal');
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

          <ReceiptFilePicker files={formData.receipts} onChange={(receipts) => setFormData((current) => ({ ...current, receipts }))} disabled={submitting} inputId="receiving-receipts" />

          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mt-3 mb-2">
              <label className="text-sm font-medium text-slate-300">Products *</label>
              <span className="text-xs text-slate-500">Expected vs. delivered</span>
            </div>
            <div className="space-y-3">
              {formData.items.map((item, index) => (
                <div key={item.purchase_order_item_id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5"><p className="text-sm text-slate-200">{item.product}</p><p className="text-xs text-slate-500">Ordered: {item.ordered_quantity} · Previously received: {item.previously_received} · Remaining: {item.remaining_quantity} {item.unit ?? '—'}</p>{Number(item.delivered_quantity) < item.remaining_quantity && <p className="mt-1 text-xs font-medium text-amber-400">Short delivery: {item.remaining_quantity - Number(item.delivered_quantity || 0)} {item.unit ?? ''}</p>}</div>
                  <input
                    type="number"
                    min="0"
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
      {discrepancies.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="quantity-discrepancy-title">
          <div className="w-full max-w-xl rounded-2xl border border-amber-500/30 bg-[#0d1322] p-5 shadow-2xl sm:p-6">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-amber-500/10 p-2 text-amber-400"><AlertTriangle className="h-5 w-5" /></span>
              <div><h2 id="quantity-discrepancy-title" className="text-lg font-bold text-white">{hasExcessDiscrepancy ? 'Excess Delivery Detected' : 'Confirm Short Delivery'}</h2><p className="mt-1 text-sm text-slate-400">{hasExcessDiscrepancy ? 'The delivered quantity exceeds the remaining Purchase Order balance. You may record the actual delivery for review, but the excess quantity cannot be added to inventory until the required approvals and QA inspection are completed.' : 'Please verify the actual counts before creating this receiving record.'}</p></div>
            </div>
            <div className="mt-5 max-h-[50vh] space-y-3 overflow-y-auto pr-1">
              {discrepancies.map((item) => <div key={item.purchase_order_item_id} className={`rounded-xl border p-3 ${item.direction === 'short' ? 'border-amber-500/30 bg-amber-500/5' : 'border-orange-500/30 bg-orange-500/5'}`}><p className="font-medium text-white">{item.product}</p><dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3"><div><dt className="text-slate-500">Expected</dt><dd className="text-slate-200">{item.remaining_quantity} {item.unit ?? 'units'}</dd></div><div><dt className="text-slate-500">Delivered</dt><dd className="text-slate-200">{item.delivered} {item.unit ?? 'units'}</dd></div><div><dt className="text-slate-500">Difference</dt><dd className={item.direction === 'short' ? 'font-medium text-amber-300' : 'font-medium text-orange-300'}>{item.difference} {item.unit ?? 'units'} {item.direction}</dd></div></dl><p className="mt-2 text-xs text-slate-400">{item.direction === 'short' ? `The expected quantity is ${item.remaining_quantity}, but only ${item.delivered} were delivered. This is a shortage of ${item.difference} ${item.unit ?? 'units'}.` : `The expected quantity is ${item.remaining_quantity}, but you entered ${item.delivered}. This is an excess of ${item.difference} ${item.unit ?? 'units'}.`}</p></div>)}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setDiscrepancies([])} disabled={submitting} className="min-h-11 rounded-xl border border-slate-700 px-4 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-60">Go Back &amp; Review</button><button type="button" onClick={() => void confirmDiscrepancies()} disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60">{submitting && <Loader2 className="h-4 w-4 animate-spin" />}{hasExcessDiscrepancy ? 'Submit for Excess Review' : 'Confirm & Create Receiving'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const ReceivingManagement: React.FC = () => {
  const [receivings, setReceivings] = useState<ApiReceiving[]>([]);
  const [excessReviews, setExcessReviews] = useState<ApiExcessReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('All Suppliers');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [dateFilter, setDateFilter] = useState('All Dates');
  const [currentPage, setCurrentPage] = useState(1);
  const [receivingView, setReceivingView] = useState<ReceivingView>('active');
  const [workstream, setWorkstream] = useState<ReceivingWorkstream>('normal');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const itemsPerPage = 5;
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, totalItems: 0, from: 0, to: 0 });
  const [summary, setSummary] = useState({ total: 0, pending_qa: 0, passed: 0, rejected: 0, partial: 0 });
  const [supplierOptions, setSupplierOptions] = useState<string[]>(['All Suppliers']);

  const [selectedReceivingId, setSelectedReceivingId] = useState<number | null>(null);
  const [receivingDetail, setReceivingDetail] = useState<ApiReceiving | null>(null);
  const [receivingDetailLoading, setReceivingDetailLoading] = useState(false);
  const [receivingDetailError, setReceivingDetailError] = useState<string | null>(null);
  const detailsDialogRef = useRef<HTMLDivElement | null>(null);
  const detailsTriggerRef = useRef<HTMLElement | null>(null);
  const [excessActionFile, setExcessActionFile] = useState<File | null>(null);
  const [excessExternalReference, setExcessExternalReference] = useState('');
  const [excessReturnDate, setExcessReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [excessActionSaving, setExcessActionSaving] = useState(false);
  const [excessActionError, setExcessActionError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [qaAssignees, setQaAssignees] = useState<QaAssignee[]>([]);
  const [qaAssigneesLoading, setQaAssigneesLoading] = useState(true);
  const [qaAssigneesError, setQaAssigneesError] = useState<string | null>(null);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentTarget, setAssignmentTarget] = useState<ApiReceiving | null>(null);
  const [assignmentContext, setAssignmentContext] = useState<{ kind: 'normal' | 'excess'; review: ApiExcessReview | null }>({ kind: 'normal', review: null });
  const [selectedQaUserId, setSelectedQaUserId] = useState<number | null>(null);
  const [assignmentToast, setAssignmentToast] = useState<AssignmentToast | null>(null);
  const [replacementQuantities, setReplacementQuantities] = useState<Record<number, string>>({});
  const [replacementDate, setReplacementDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [replacementReference, setReplacementReference] = useState('');
  const [replacementReceipts, setReplacementReceipts] = useState<File[]>([]);
  const [replacementSaving, setReplacementSaving] = useState(false);
  const [replacementError, setReplacementError] = useState<string | null>(null);

  const fetchReceivings = useCallback(async (viewOverride?: ReceivingView, pageOverride?: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      const view = viewOverride ?? receivingView;
      const page = pageOverride ?? currentPage;
      const res = await apiClient.get<ReceivingListResponse>('/receivings', { params: {
        view,
        page,
        per_page: itemsPerPage,
        search: search.trim() || undefined,
        supplier: supplierFilter === 'All Suppliers' ? undefined : supplierFilter,
        status: statusFilter === 'All Status' ? undefined : statusFilter,
        date: dateFilter === 'Today' ? 'today' : dateFilter === 'This Week' ? 'week' : dateFilter === 'This Month' ? 'month' : undefined,
      } });
      setReceivings(res.data.data);
      setPagination({
        currentPage: res.data.meta.current_page,
        totalPages: Math.max(1, res.data.meta.last_page),
        totalItems: res.data.meta.total,
        from: res.data.meta.from ?? 0,
        to: res.data.meta.to ?? 0,
      });
      setSummary(res.data.summary);
      setSupplierOptions(['All Suppliers', ...res.data.suppliers]);
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [currentPage, dateFilter, receivingView, search, statusFilter, supplierFilter]);

  const fetchExcessReviews = useCallback(async (viewOverride?: ReceivingView, pageOverride?: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await apiClient.get<ExcessListResponse>('/excess-delivery-reviews', { params: {
        view: viewOverride ?? receivingView,
        page: pageOverride ?? currentPage,
        per_page: itemsPerPage,
        search: search.trim() || undefined,
        status: statusFilter === 'All Status' ? undefined : statusFilter,
      } });
      setExcessReviews(response.data.data);
      setPagination({
        currentPage: response.data.meta.current_page,
        totalPages: Math.max(1, response.data.meta.last_page),
        totalItems: response.data.meta.total,
        from: response.data.meta.from ?? 0,
        to: response.data.meta.to ?? 0,
      });
    } catch (error) {
      setLoadError(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [currentPage, receivingView, search, statusFilter]);

  useEffect(() => {
    if (workstream === 'normal') void fetchReceivings();
    else void fetchExcessReviews();
  }, [fetchExcessReviews, fetchReceivings, workstream]);

  useEffect(() => {
    let active = true;
    apiClient.get<{ data: QaAssignee[] }>('/receivings/qa-assignees')
      .then((response) => { if (active) setQaAssignees(response.data.data); })
      .catch((error) => { if (active) setQaAssigneesError(getApiErrorMessage(error)); })
      .finally(() => { if (active) setQaAssigneesLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (workstream !== 'normal') return;
    if (receivings.length === 0) {
      setSelectedReceivingId(null);
      return;
    }
    if (selectedReceivingId !== null && !receivings.some((r) => r.id === selectedReceivingId)) {
      setSelectedReceivingId(null);
    }
  }, [receivings, selectedReceivingId, workstream]);

  const listedSelectedReceiving = useMemo(() => {
    return receivings.find((r) => r.id === selectedReceivingId) || null;
  }, [receivings, selectedReceivingId]);
  const selectedReceiving = receivingDetail ?? listedSelectedReceiving;

  useEffect(() => {
    if (selectedReceivingId === null) {
      setReceivingDetail(null);
      setReceivingDetailError(null);
      return;
    }
    let active = true;
    setReceivingDetailLoading(true);
    setReceivingDetailError(null);
    apiClient.get<ApiReceiving>(`/receivings/${selectedReceivingId}`)
      .then((response) => { if (active) setReceivingDetail(response.data); })
      .catch((error) => { if (active) setReceivingDetailError(getApiErrorMessage(error)); })
      .finally(() => { if (active) setReceivingDetailLoading(false); });
    return () => { active = false; };
  }, [selectedReceivingId]);

  const totalItems = pagination.totalItems;
  const totalPages = pagination.totalPages;
  const start = pagination.from;
  const end = pagination.to;
  const paginatedReceivings = receivings;

  // KPI data
  const totalDeliveries = summary.total;
  const pendingQA = summary.pending_qa;
  const passed = summary.passed;
  const partial = summary.partial;

  const handleRowClick = (id: number) => {
    detailsTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedReceivingId(id);
  };

  const closeReceivingDetails = useCallback(() => {
    setSelectedReceivingId(null);
    window.requestAnimationFrame(() => detailsTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (selectedReceivingId === null) return;
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { closeReceivingDetails(); return; }
      if (event.key !== 'Tab' || !detailsDialogRef.current) return;
      const focusable = Array.from(detailsDialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handleDialogKeys);
    return () => window.removeEventListener('keydown', handleDialogKeys);
  }, [closeReceivingDetails, selectedReceivingId]);

  const handleCreateReceiving = async (formData: CreateReceivingFormData, mode: 'normal' | 'excess' = 'normal') => {
    const payload = new FormData();
    if (mode === 'excess') payload.append('submission_key', formData.submission_key);
    payload.append('purchase_order_id', String(formData.purchase_order_id));
    if (formData.reference_no) payload.append('reference_no', formData.reference_no);
    payload.append('delivery_date', formData.delivery_date);
    formData.items.forEach((item, index) => {
      payload.append(`items[${index}][purchase_order_item_id]`, String(item.purchase_order_item_id));
      payload.append(`items[${index}][delivered_quantity]`, String(Number(item.delivered_quantity)));
    });
    formData.receipts.forEach((file) => payload.append('receipts[]', file));

    await apiClient.post(mode === 'excess' ? '/receivings/excess-reviews' : '/receivings', payload);
    setOperationMessage(mode === 'excess'
      ? 'Excess delivery recorded successfully and submitted for review. The excess quantity is on hold and will not be added to available inventory until authorized and QA-approved.'
      : 'Receiving created successfully.');
    setReceivingView('active');
    setCurrentPage(1);
    setShowCreateModal(false);
    if (mode === 'excess') {
      setWorkstream('excess');
      await fetchExcessReviews('active', 1);
    } else {
      await fetchReceivings('active', 1);
    }
  };

  useEffect(() => {
    setReplacementQuantities({});
    setReplacementReference('');
    setReplacementReceipts([]);
    setReplacementError(null);
    setExcessActionFile(null);
    setExcessExternalReference('');
    setExcessActionError(null);
  }, [selectedReceivingId]);

  const refreshSelectedReceiving = async () => {
    if (selectedReceivingId !== null) {
      const response = await apiClient.get<ApiReceiving>(`/receivings/${selectedReceivingId}`);
      setReceivingDetail(response.data);
    }
    if (workstream === 'excess') await fetchExcessReviews(receivingView, currentPage);
    else await fetchReceivings(receivingView, currentPage);
  };

  const submitRequestedDocumentation = async () => {
    if (!selectedReceiving?.excess_review || !excessActionFile || excessActionSaving) return;
    setExcessActionSaving(true); setExcessActionError(null);
    try {
      const payload = new FormData();
      payload.append('document', excessActionFile);
      if (excessExternalReference.trim()) payload.append('external_reference', excessExternalReference.trim());
      await apiClient.post(`/excess-delivery-reviews/${selectedReceiving.excess_review.id}/documentation`, payload);
      setOperationMessage('Supplier documentation submitted for Admin re-review. The held excess remains blocked.');
      await refreshSelectedReceiving();
    } catch (error) { setExcessActionError(getApiErrorMessage(error)); }
    finally { setExcessActionSaving(false); }
  };

  const prepareExcessReturn = async () => {
    if (!selectedReceiving?.excess_review || excessActionSaving) return;
    setExcessActionSaving(true); setExcessActionError(null);
    try {
      await apiClient.post(`/excess-delivery-reviews/${selectedReceiving.excess_review.id}/return/prepare`);
      setOperationMessage('Excess return marked as prepared. Record the physical handoff with evidence when completed.');
      await refreshSelectedReceiving();
    } catch (error) { setExcessActionError(getApiErrorMessage(error)); }
    finally { setExcessActionSaving(false); }
  };

  const completeExcessReturn = async () => {
    if (!selectedReceiving?.excess_review || !excessActionFile || excessActionSaving) return;
    setExcessActionSaving(true); setExcessActionError(null);
    try {
      const payload = new FormData();
      payload.append('return_date', excessReturnDate);
      selectedReceiving.excess_review.items.filter((item) => item.return_requested_quantity > 0).forEach((item, index) => {
        payload.append(`items[${index}][review_item_id]`, String(item.id));
        payload.append(`items[${index}][returned_quantity]`, String(item.return_requested_quantity));
      });
      payload.append('document', excessActionFile);
      if (excessExternalReference.trim()) payload.append('external_reference', excessExternalReference.trim());
      await apiClient.post(`/excess-delivery-reviews/${selectedReceiving.excess_review.id}/return/complete`, payload);
      setOperationMessage('Physical excess return recorded and closed with supporting evidence.');
      await refreshSelectedReceiving();
    } catch (error) { setExcessActionError(getApiErrorMessage(error)); }
    finally { setExcessActionSaving(false); }
  };

  const handleConfirmReplacement = async (receiving: ApiReceiving) => {
    const items = receiving.items.map((item) => ({
      receiving_item_id: item.id,
      delivered_quantity: Number(replacementQuantities[item.id] ?? item.ordered_quantity ?? 0),
    }));
    if (items.some((item) => !Number.isInteger(item.delivered_quantity) || item.delivered_quantity < 0)) {
      setReplacementError('Enter a whole-number delivered quantity for each product.');
      return;
    }
    if (replacementReceipts.length < 1) {
      setReplacementError('Attach at least one supplier delivery receipt before confirming the replacement.');
      return;
    }
    const receiptError = replacementReceipts.map(validateReceiptFile).find(Boolean);
    if (receiptError) {
      setReplacementError(receiptError);
      return;
    }
    setReplacementSaving(true);
    setReplacementError(null);
    try {
      const payload = new FormData();
      payload.append('delivery_date', replacementDate);
      if (replacementReference.trim()) payload.append('reference_no', replacementReference.trim());
      items.forEach((item, index) => {
        payload.append(`items[${index}][receiving_item_id]`, String(item.receiving_item_id));
        payload.append(`items[${index}][delivered_quantity]`, String(item.delivered_quantity));
      });
      replacementReceipts.forEach((file) => payload.append('receipts[]', file));
      const response = await apiClient.post<ApiReceiving>(`/receivings/${receiving.id}/confirm-replacement`, payload);
      setReceivings((current) => current.map((record) => (record.id === response.data.id ? response.data : record)));
      setAssignmentToast({ type: 'success', message: 'Replacement delivery confirmed. Assign a QA Supervisor to inspect it.' });
    } catch (error) {
      setReplacementError(getApiErrorMessage(error));
    } finally {
      setReplacementSaving(false);
    }
  };

  const openAssignmentModal = (receiving: ApiReceiving) => {
    setAssignmentContext({ kind: 'normal', review: null });
    setAssignmentTarget(receiving);
    setSelectedQaUserId(receiving.assigned_qa_user_id);
    setAssignmentError(null);
  };

  const openExcessAssignmentModal = async (review: ApiExcessReview) => {
    if (!review.receiving_id || (!review.qa_assignment?.can_assign && !review.qa_assignment?.can_reassign)) return;
    setAssignmentError(null);
    try {
      const response = await apiClient.get<ApiReceiving>(`/receivings/${review.receiving_id}`);
      setAssignmentContext({ kind: 'excess', review });
      setAssignmentTarget(response.data);
      setSelectedQaUserId(review.qa_assignment?.can_reassign ? review.qa_assignment.assigned_qa?.id ?? null : response.data.assigned_qa_user_id);
    } catch (error) {
      setAssignmentToast({ type: 'error', message: getApiErrorMessage(error) });
    }
  };

  const closeAssignmentModal = () => {
    if (assignmentSaving) return;
    setAssignmentTarget(null);
    setAssignmentContext({ kind: 'normal', review: null });
    setSelectedQaUserId(null);
    setAssignmentError(null);
  };

  const handleAssignQa = async () => {
    if (!assignmentTarget || !selectedQaUserId) {
      setAssignmentError('Select a QA Supervisor before continuing.');
      return;
    }
    const currentCycleQaId = assignmentContext.review?.qa_assignment?.assigned_qa?.id;
    if ((assignmentContext.kind === 'normal' && selectedQaUserId === assignmentTarget.assigned_qa_user_id)
      || (assignmentContext.kind === 'excess' && assignmentContext.review?.qa_assignment?.can_reassign && selectedQaUserId === currentCycleQaId)) {
      setAssignmentError('Select a different QA Supervisor to reassign this receiving.');
      return;
    }
    setAssignmentSaving(true);
    setAssignmentError(null);
    try {
      const response = await apiClient.patch<ApiReceiving>(`/receivings/${assignmentTarget.id}/assign-qa`, {
        qa_user_id: selectedQaUserId,
        operation: assignmentContext.kind === 'excess'
          ? (assignmentContext.review?.qa_assignment?.can_reassign ? 'reassign_excess' : 'assign_excess')
          : (assignmentTarget.assigned_qa ? 'reassign' : 'assign'),
        excess_review_id: assignmentContext.review?.id,
      });
      setReceivings((current) => current.map((receiving) =>
        receiving.id === response.data.id ? response.data : receiving
      ));
      setAssignmentTarget(null);
      setSelectedQaUserId(null);
      if (assignmentContext.kind === 'excess') await fetchExcessReviews(receivingView, currentPage);
      setAssignmentToast({ type: 'success', message: assignmentContext.kind === 'excess' ? `Excess QA cycle ${response.data.qa_assignment?.cycle_number ?? assignmentContext.review?.qa_assignment?.next_cycle_number} ${response.data.qa_assignment?.outcome === 'reassigned' ? 'reassigned' : 'assigned'}.` : 'Receiving assigned to QA Supervisor successfully.' });
      setAssignmentContext({ kind: 'normal', review: null });
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
    <div className="pm-receiving-page min-h-screen w-full min-w-0 space-y-6 bg-[#0b1220] p-4 text-slate-100 sm:p-6">
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
            onClick={() => void (workstream === 'excess' ? fetchExcessReviews() : fetchReceivings())}
            className="flex items-center gap-1.5 text-sm font-medium hover:text-red-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      )}
      {operationMessage && <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"><span>{operationMessage}</span><button type="button" onClick={() => setOperationMessage(null)} aria-label="Dismiss message" className="rounded p-1 hover:bg-emerald-500/10"><X className="h-4 w-4" /></button></div>}

      <div className="inline-flex max-w-full overflow-x-auto rounded-xl border border-[#1f2937] bg-[#111827] p-1" role="tablist" aria-label="Receiving workstream">
        {([['normal', 'Normal Receiving'], ['excess', 'Excess Deliveries']] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={workstream === value} onClick={() => { setWorkstream(value); setReceivingView('active'); setStatusFilter('All Status'); setCurrentPage(1); setSelectedReceivingId(null); }} className={`min-h-11 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${workstream === value ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>{label}</button>
        ))}
      </div>

      {workstream === 'normal' && <>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          label="Total Deliveries"
          value={totalDeliveries}
          icon={<Package className="w-5 h-5" />}
          subtitle={receivingView === 'active' ? 'Active Receiving Records' : 'Historical Receiving Records'}
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
          label="Partial"
          value={partial}
          icon={<AlertCircle className="w-5 h-5" />}
          subtitle="Partial Acceptance"
          color="text-blue-400"
        />
      </div>

      <div className="inline-flex rounded-xl border border-[#1f2937] bg-[#111827] p-1" role="tablist" aria-label="Receiving records">
        {(['active', 'history'] as const).map((view) => (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={receivingView === view}
            onClick={() => {
              setReceivingView(view);
              setCurrentPage(1);
              setSelectedReceivingId(null);
            }}
            className={`min-h-10 rounded-lg px-4 text-sm font-medium capitalize transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${receivingView === view ? 'bg-slate-200 text-slate-900 dark:bg-cyan-500 dark:text-slate-950' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
          >
            {view}
          </button>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#1f2937] bg-[#111827] p-3 sm:gap-3 sm:p-4">
        <div className="pm-rcv-search relative basis-full min-w-0 sm:basis-auto sm:flex-1 sm:min-w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500 sm:h-4 sm:w-4" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search Receiving No., PO Number, Supplier..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="h-10 w-full rounded-xl border border-[#1f2937] bg-[#0b1220] py-0 pl-10 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:h-auto sm:py-2.5 sm:pr-4 sm:text-sm"
          />
        </div>
        <div className="pm-rcv-select relative min-w-[108px] flex-1 sm:min-w-[130px] sm:flex-none">
          <select
            value={supplierFilter}
            onChange={(e) => { setSupplierFilter(e.target.value); setCurrentPage(1); }}
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
          onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
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
            onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
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
            onClick={() => void fetchReceivings()}
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
                      {record.replacement?.awaiting_delivery ? record.replacement.expected_quantity : (record.quantity_summary?.physical_delivered ?? record.items_count)}
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
                        {(record.quantity_summary?.qa_eligible ?? (record.status === 'Pending QA' ? record.items_count : 0)) > 0 && (
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
      </>}

      {workstream === 'excess' && <section className="space-y-4" aria-labelledby="excess-deliveries-title">
        <div className="flex flex-col gap-3 rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 id="excess-deliveries-title" className="font-semibold text-white">{receivingView === 'active' ? 'Active Excess Deliveries' : 'Excess Delivery History'}</h2><p className="mt-1 text-sm text-slate-400">Tracked independently from the linked normal Receiving until the excess is stocked or physically returned.</p></div>
          <div className="inline-flex self-start rounded-xl border border-slate-700 bg-[#0b1220] p-1" role="tablist" aria-label="Excess delivery records">{(['active', 'history'] as const).map((view) => <button key={view} type="button" role="tab" aria-selected={receivingView === view} onClick={() => { setReceivingView(view); setCurrentPage(1); }} className={`min-h-10 rounded-lg px-4 text-sm font-medium capitalize focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${receivingView === view ? 'bg-orange-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}>{view}</button>)}</div>
        </div>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-[#1f2937] bg-[#111827] p-3 sm:p-4">
          <div className="relative min-w-0 basis-full sm:flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }} placeholder="Search exception, Receiving, PO, supplier, product..." className="min-h-11 w-full rounded-xl border border-slate-700 bg-[#0b1220] pl-10 pr-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40" /></div>
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setCurrentPage(1); }} aria-label="Filter excess deliveries by status" className="min-h-11 min-w-[190px] cursor-pointer rounded-xl border border-slate-700 bg-[#0b1220] px-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"><option>All Status</option><option value="PENDING_REVIEW">Pending Review</option><option value="DOCUMENTATION_REQUESTED">Documentation Requested</option><option value="DOCUMENTATION_SUBMITTED">Documentation Submitted</option><option value="AWAITING_FINANCIAL_RECONCILIATION">Financial Hold</option><option value="APPROVED_FOR_QA">Approved for QA</option><option value="REJECTED_RETURN_REQUIRED">Return Required</option><option value="RETURN_IN_PROGRESS">Return In Progress</option><option value="RETURNED_TO_SUPPLIER">Returned</option></select>
          <button type="button" onClick={() => void fetchExcessReviews()} aria-label="Refresh excess deliveries" className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#1f2937] bg-[#111827]">
          <div className="overflow-x-auto"><table className="w-full min-w-[1050px]"><thead className="border-b border-[#1f2937] bg-[#0b1220]/60"><tr>{['Exception','Receiving','PO Number','Supplier','Product','Excess Quantity','Status','Required Next Action','Last Updated','Actions'].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">{heading}</th>)}</tr></thead><tbody>
            {loading && <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading excess deliveries…</span></td></tr>}
            {!loading && excessReviews.map((review) => <tr key={review.id} className="border-b border-[#1f2937] text-sm text-slate-300 hover:bg-slate-800/30"><td className="px-4 py-3 font-medium text-orange-300">{review.reference}</td><td className="px-4 py-3">{review.receiving_no ?? '—'}</td><td className="px-4 py-3">{review.purchase_order ?? '—'}</td><td className="px-4 py-3">{review.supplier ?? '—'}</td><td className="px-4 py-3"><span className="block max-w-48 truncate" title={review.items.map((item) => item.product).join(', ')}>{review.items.map((item) => item.product).join(', ')}</span></td><td className="px-4 py-3 whitespace-nowrap">{review.items.map((item) => `${item.excess_quantity} ${item.unit}`).join(' · ')}</td><td className="px-4 py-3"><StatusBadge status={review.status.replaceAll('_', ' ')} /></td><td className="px-4 py-3 text-slate-200">{review.next_action ?? 'View exception'}</td><td className="px-4 py-3 whitespace-nowrap">{formatCreatedAt(review.updated_at)}</td><td className="px-4 py-3"><div className="flex items-center gap-2">{review.qa_assignment?.can_assign ? <button type="button" onClick={() => void openExcessAssignmentModal(review)} className="inline-flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg bg-orange-400 px-3 font-semibold text-slate-950 hover:bg-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-200"><UserCheck className="h-4 w-4" /> Assign Excess to QA</button> : review.qa_assignment?.can_reassign ? <button type="button" onClick={() => void openExcessAssignmentModal(review)} className="inline-flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-cyan-500/30 px-3 text-cyan-200 hover:bg-cyan-500/10 focus:outline-none focus:ring-2 focus:ring-cyan-400"><UserCheck className="h-4 w-4" /> Reassign QA Supervisor</button> : review.qa_assignment?.state === 'ASSIGNED_PENDING_QA' ? <button type="button" onClick={() => review.receiving_id && handleRowClick(review.receiving_id)} className="inline-flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-cyan-500/30 px-3 text-cyan-200 hover:bg-cyan-500/10 focus:outline-none focus:ring-2 focus:ring-cyan-400"><Eye className="h-4 w-4" /> View QA Assignment</button> : review.qa_assignment?.state === 'AWAITING_STOCK_IN' ? <span className="whitespace-nowrap rounded-lg border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300">Awaiting Stock In</span> : null}<button type="button" onClick={() => review.receiving_id && handleRowClick(review.receiving_id)} disabled={!review.receiving_id} aria-label={`View linked Receiving for ${review.reference}`} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-orange-500/30 px-3 text-orange-200 hover:bg-orange-500/10 focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:cursor-not-allowed disabled:opacity-50"><Eye className="h-4 w-4" /> View</button></div></td></tr>)}
            {!loading && excessReviews.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">No {receivingView} excess delivery exceptions found.</td></tr>}
          </tbody></table></div>
          <div className="flex flex-col gap-3 border-t border-[#1f2937] px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-400">Showing {totalItems > 0 ? start : 0} to {end} of {totalItems} exceptions</p><div className="flex gap-1"><button type="button" onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} aria-label="Previous excess page" className="min-h-11 min-w-11 rounded-lg border border-slate-700 text-slate-300 disabled:opacity-40"><ChevronLeft className="mx-auto h-4 w-4" /></button><button type="button" onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} aria-label="Next excess page" className="min-h-11 min-w-11 rounded-lg border border-slate-700 text-slate-300 disabled:opacity-40"><ChevronRight className="mx-auto h-4 w-4" /></button></div></div>
        </div>
      </section>}

      {/* Receiving details stay in context without forcing the user below the table. */}
      {selectedReceiving && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeReceivingDetails(); }}>
        <div ref={detailsDialogRef} role="dialog" aria-modal="true" aria-labelledby="receiving-details-title" aria-busy={receivingDetailLoading} className="flex max-h-[100dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-[#1f2937] bg-[#0b1220] shadow-2xl sm:max-h-[92vh] sm:rounded-2xl">
          <div className="flex items-center justify-between border-b border-[#1f2937] bg-[#111827] px-4 py-3 sm:px-5">
            <div className="min-w-0"><h2 id="receiving-details-title" className="truncate text-lg font-semibold text-white">Receiving {selectedReceiving.receiving_no}</h2><p className="text-sm text-slate-400">Details, documents, quantities, QA, and activity timeline</p></div>
            <button type="button" autoFocus onClick={closeReceivingDetails} aria-label="Close receiving details" className="min-h-11 min-w-11 cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"><X className="mx-auto h-5 w-5" /></button>
          </div>
          <div className="overflow-y-auto overscroll-contain p-3 sm:p-5">
      {receivingDetailLoading && <div className="mb-4 flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-sm text-cyan-200"><Loader2 className="h-4 w-4 animate-spin" /> Loading complete receiving details…</div>}
      {receivingDetailError && <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{receivingDetailError}</div>}
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
                  {(selectedReceiving.quantity_summary?.qa_eligible ?? (selectedReceiving.status === 'Pending QA' ? selectedReceiving.items_count : 0)) > 0 && (
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

              {selectedReceiving.quantity_summary && (
                <section className="border-t border-[#1f2937] p-4 sm:p-5" aria-labelledby="quantity-lifecycle-title">
                  <h4 id="quantity-lifecycle-title" className="text-sm font-medium text-slate-200">Linked Delivery Workstreams</h4>
                  <p className="mt-1 text-xs text-slate-400">One physical delivery, with normal and excess portions tracked independently. Quantities stay separated by canonical unit.</p>
                  <div className="mt-3 space-y-3">{selectedReceiving.quantity_summary.by_unit.map((quantity) => <div key={quantity.unit} className="grid gap-3 rounded-xl border border-slate-700 bg-[#0b1220] p-3 lg:grid-cols-3"><div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Original Physical Delivery</p><p className="mt-2 text-xl font-semibold text-white">{quantity.physical_delivered} {quantity.unit}</p></div><div className="border-slate-700 lg:border-l lg:pl-3"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-medium uppercase tracking-wide text-cyan-300">Normal PO-Authorized Portion</p><StatusBadge status={selectedReceiving.quantity_summary?.normal_status ?? 'In Progress'} /></div><dl className="mt-2 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-slate-500">Authorized</dt><dd className="text-white">{quantity.po_authorized} {quantity.unit}</dd></div><div><dt className="text-slate-500">Stocked In</dt><dd className="text-white">{quantity.normal_stocked_in} {quantity.unit}</dd></div></dl></div><div className="border-slate-700 lg:border-l lg:pl-3"><div className="flex items-center justify-between gap-2"><p className="text-[11px] font-medium uppercase tracking-wide text-orange-300">Excess Portion</p>{selectedReceiving.excess_review && <StatusBadge status={selectedReceiving.excess_review.status.replaceAll('_', ' ')} />}</div><dl className="mt-2 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-slate-500">Excess</dt><dd className="text-white">{quantity.excess_total} {quantity.unit}</dd></div><div><dt className="text-slate-500">QA Eligible</dt><dd className="text-white">{quantity.qa_eligible} {quantity.unit}</dd></div><div><dt className="text-slate-500">Excess Stocked</dt><dd className="text-white">{quantity.excess_stocked_in} {quantity.unit}</dd></div><div><dt className="text-slate-500">Returned</dt><dd className="text-white">{quantity.returned_excess} {quantity.unit}</dd></div><div className="col-span-2"><dt className="text-slate-500">Remaining Unresolved</dt><dd className="font-semibold text-orange-200">{Math.max(0, quantity.excess_total - quantity.excess_stocked_in - quantity.returned_excess)} {quantity.unit}</dd></div></dl>{selectedReceiving.excess_review && <p className="mt-2 text-xs text-slate-400">Exception {selectedReceiving.excess_review.reference}</p>}</div></div>)}</div>
                </section>
              )}

              <section className="border-t border-[#1f2937] p-4 sm:p-5" aria-labelledby="saved-receipts-title">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><h4 id="saved-receipts-title" className="text-sm font-medium text-slate-200">Supplier Delivery Receipt</h4><p className="mt-1 text-xs text-slate-400">Documentary delivery evidence; quantities remain based on the physical count.</p></div>
                  <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300">{selectedReceiving.receipt_attachments?.length ?? 0} / {RECEIPT_MAX_FILES} files</span>
                </div>
                <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(selectedReceiving.receipt_attachments ?? []).map((receipt) => (
                    <li key={receipt.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-700 bg-[#0b1220] p-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-cyan-300">{receipt.mime_type.startsWith('image/') ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</div>
                      <div className="min-w-0"><p className="truncate text-sm font-medium text-white" title={receipt.original_name}>{receipt.original_name}</p><p className="mt-0.5 text-xs text-slate-400">{receipt.mime_type === 'application/pdf' ? 'PDF' : receipt.mime_type.replace('image/', '').toUpperCase()} · {(receipt.file_size / 1024).toFixed(0)} KB</p></div>
                    </li>
                  ))}
                </ul>
              </section>

              {selectedReceiving.excess_review && (
                <section className="border-t border-[#1f2937] p-4 sm:p-5" aria-labelledby="excess-resolution-title">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h4 id="excess-resolution-title" className="font-medium text-white">Excess / Discrepancy Resolution</h4><p className="mt-1 text-xs text-slate-400">Exception {selectedReceiving.excess_review.reference}; PO-authorized quantities remain separate from held excess.</p></div>
                    <StatusBadge status={selectedReceiving.excess_review.status.replaceAll('_', ' ')} />
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {selectedReceiving.excess_review.items.map((item) => <div key={item.id} className="rounded-xl border border-slate-700 bg-[#111827] p-3 text-sm"><p className="font-medium text-white">{item.product}</p><p className="mt-1 text-slate-300">{item.authorized_quantity} authorized · {item.actual_delivered_quantity} physical · <span className="text-orange-300">{item.excess_quantity} held</span> {item.unit}</p>{item.return_requested_quantity > 0 && <p className="mt-1 text-slate-400">Return: {item.returned_quantity} / {item.return_requested_quantity} {item.unit}</p>}</div>)}
                  </div>

                  {selectedReceiving.excess_review.status === 'DOCUMENTATION_REQUESTED' && <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"><h5 className="font-medium text-amber-200">Documentation Requested</h5><dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-slate-400">Required evidence</dt><dd className="text-white">{selectedReceiving.excess_review.documentation_type?.replaceAll('_', ' ')}</dd></div><div><dt className="text-slate-400">Requested by</dt><dd className="text-white">{selectedReceiving.excess_review.documentation_requested_by ?? 'Admin'}</dd></div><div><dt className="text-slate-400">Requested</dt><dd className="text-white">{formatCreatedAt(selectedReceiving.excess_review.documentation_requested_at)}</dd></div><div><dt className="text-slate-400">Assigned to</dt><dd className="text-white">{selectedReceiving.excess_review.documentation_assigned_to ?? selectedReceiving.prepared_by}</dd></div></dl><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm text-slate-300">Supplier document *<input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => setExcessActionFile(event.target.files?.[0] ?? null)} className="mt-1 block min-h-11 w-full text-sm" /></label><label className="text-sm text-slate-300">External reference <span className="text-slate-500">(if present)</span><input value={excessExternalReference} maxLength={255} onChange={(event) => setExcessExternalReference(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-[#0b1220] px-3 text-white" /></label></div><button type="button" disabled={!excessActionFile || excessActionSaving} onClick={() => void submitRequestedDocumentation()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 font-semibold text-slate-950 disabled:opacity-50 sm:w-auto">{excessActionSaving && <Loader2 className="h-4 w-4 animate-spin" />}Submit Documentation</button></div>}

                  {selectedReceiving.excess_review.status === 'REJECTED_RETURN_REQUIRED' && <div className="mt-4 rounded-xl border border-orange-500/30 bg-orange-500/5 p-4"><h5 className="font-medium text-orange-200">Return Required</h5><p className="mt-1 text-sm text-slate-300">Admin rejected only the held excess. Prepare it for physical return; this does not subtract inventory because the excess was never stocked.</p><button type="button" disabled={excessActionSaving} onClick={() => void prepareExcessReturn()} className="mt-3 min-h-11 rounded-lg bg-orange-400 px-4 font-semibold text-slate-950 disabled:opacity-50">Prepare Return</button></div>}

                  {selectedReceiving.excess_review.status === 'RETURN_IN_PROGRESS' && <div className="mt-4 rounded-xl border border-orange-500/30 bg-orange-500/5 p-4"><h5 className="font-medium text-orange-200">Return In Progress</h5><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm text-slate-300">Physical return date *<input type="date" max={new Date().toISOString().slice(0, 10)} value={excessReturnDate} onChange={(event) => setExcessReturnDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-[#0b1220] px-3 text-white" /></label><label className="text-sm text-slate-300">Return evidence *<input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => setExcessActionFile(event.target.files?.[0] ?? null)} className="mt-1 block min-h-11 w-full text-sm" /></label><label className="text-sm text-slate-300 sm:col-span-2">Supplier return reference <span className="text-slate-500">(if present)</span><input value={excessExternalReference} maxLength={255} onChange={(event) => setExcessExternalReference(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-[#0b1220] px-3 text-white" /></label></div><button type="button" disabled={!excessActionFile || excessActionSaving} onClick={() => void completeExcessReturn()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-orange-400 px-4 font-semibold text-slate-950 disabled:opacity-50 sm:w-auto">{excessActionSaving && <Loader2 className="h-4 w-4 animate-spin" />}Confirm Returned to Supplier</button></div>}

                  {excessActionError && <p role="alert" className="mt-3 text-sm text-red-400">{excessActionError}</p>}
                  {selectedReceiving.excess_review.documents.length > 0 && <div className="mt-4"><h5 className="text-sm font-medium text-slate-200">Submitted documents</h5><ul className="mt-2 grid gap-2 sm:grid-cols-2">{selectedReceiving.excess_review.documents.map((document) => <li key={document.id} className="rounded-lg border border-slate-700 bg-[#111827] p-3 text-sm"><p className="truncate font-medium text-white">{document.name}</p><p className="mt-1 text-xs text-slate-400">{document.internal_reference} · {document.document_type.replaceAll('_', ' ')}</p><p className="text-xs text-slate-500">Uploaded by {document.uploaded_by ?? 'System'} · {formatCreatedAt(document.created_at)}</p></li>)}</ul></div>}
                </section>
              )}

              {selectedReceiving.replacement && (
                <div className="border-t border-[#1f2937] p-4 sm:p-5">
                  <h4 className="text-[12px] font-medium text-slate-700 dark:text-slate-300 sm:text-sm">Rejected item replacement</h4>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4 sm:text-sm [&_dt]:text-[11px] sm:[&_dt]:text-sm">
                    <div className="min-w-0"><dt className="text-slate-600 dark:text-slate-400">Related rejection</dt><dd className="truncate font-medium text-slate-900 dark:text-white">{selectedReceiving.replacement.rejection_reference}</dd></div>
                    <div className="min-w-0"><dt className="text-slate-600 dark:text-slate-400">Original receiving</dt><dd className="truncate font-medium text-slate-900 dark:text-white">{selectedReceiving.replacement.original_receiving_no ?? '—'}</dd></div>
                    <div className="min-w-0"><dt className="text-slate-600 dark:text-slate-400">Purchase Order</dt><dd className="truncate font-medium text-slate-900 dark:text-white">{selectedReceiving.purchase_order}</dd></div>
                    <div className="min-w-0"><dt className="text-slate-600 dark:text-slate-400">Expected replacement</dt><dd className="font-medium text-violet-700 dark:text-violet-300">{selectedReceiving.replacement.expected_quantity} {replacementUnit(selectedReceiving)}</dd></div>
                  </dl>
                  {!selectedReceiving.replacement.awaiting_delivery && <p role="status" className="mt-3 text-sm text-slate-700 dark:text-slate-300">Replacement delivery already recorded. Current stage: {selectedReceiving.status}.</p>}
                  {selectedReceiving.replacement.awaiting_delivery && !selectedReceiving.items.some(item => (item.ordered_quantity ?? 0) > 0) && <p role="status" className="mt-3 text-sm text-slate-700 dark:text-slate-300">No replacement quantity is available to receive. Refresh the receiving details before continuing.</p>}
                  {selectedReceiving.replacement.awaiting_delivery && selectedReceiving.items.some(item => (item.ordered_quantity ?? 0) > 0) && (
                    <form
                      className="mt-4 space-y-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 sm:p-4"
                      onSubmit={(event) => { event.preventDefault(); void handleConfirmReplacement(selectedReceiving); }}
                    >
                      <p className="text-xs text-slate-700 dark:text-slate-300 sm:text-sm">When the supplier's replacement arrives, record the quantity actually delivered. It then continues to QA inspection and Stock In as usual.</p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block text-xs text-slate-600 dark:text-slate-400 sm:text-sm">Delivery date
                          <input type="date" required value={replacementDate} onChange={(event) => setReplacementDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#1f2937] bg-[#0b1220] px-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:text-sm" />
                        </label>
                        <label className="block text-xs text-slate-600 dark:text-slate-400 sm:text-sm">Reference No. <span className="text-slate-600 dark:text-slate-500">(optional)</span>
                          <input type="text" maxLength={255} value={replacementReference} onChange={(event) => setReplacementReference(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#1f2937] bg-[#0b1220] px-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:text-sm" />
                        </label>
                        {selectedReceiving.items.map((item) => (
                          <label key={item.id} className="block min-w-0 text-xs text-slate-600 dark:text-slate-400 sm:text-sm">
                            <span className="block truncate" title={item.product_name}>{item.product_name} delivered (max {item.ordered_quantity ?? 0} {item.unit})</span>
                            <input type="number" inputMode="numeric" min={0} max={item.ordered_quantity ?? undefined} step={1} required value={replacementQuantities[item.id] ?? String(item.ordered_quantity ?? 0)} onChange={(event) => setReplacementQuantities((current) => ({ ...current, [item.id]: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-[#1f2937] bg-[#0b1220] px-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:text-sm" />
                          </label>
                        ))}
                      </div>
                      <ReceiptFilePicker files={replacementReceipts} onChange={setReplacementReceipts} disabled={replacementSaving} inputId={`replacement-receipts-${selectedReceiving.id}`} />
                      {replacementError && <p role="alert" className="text-xs text-red-700 dark:text-red-400 sm:text-sm">{replacementError}</p>}
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
                          <td className="px-2 py-2 text-white">{item.product_name}{item.item_classification && <div className="mt-1"><ClassificationBadge value={item.item_classification}/></div>}</td>
                          <td className="px-2 py-2 text-center text-white">{selectedReceiving.replacement?.awaiting_delivery ? `0 / ${item.ordered_quantity ?? 0}` : item.delivered_quantity}</td>
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
          </div>
        </div>
      </div>}

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
                  {assignmentContext.kind === 'excess' ? (assignmentContext.review?.qa_assignment?.can_reassign ? 'Reassign QA Supervisor' : 'Assign Excess to QA') : (assignmentTarget.assigned_qa ? 'Reassign QA Supervisor' : 'Assign QA Supervisor')}
                </h2>
                <p className="mt-0.5 text-sm text-slate-400">{assignmentContext.kind === 'excess' ? (assignmentContext.review?.qa_assignment?.can_reassign ? 'Change the supervisor for the current pending excess QA cycle.' : 'Create the next independent QA cycle for the approved excess.') : 'Choose who will inspect this receiving.'}</p>
              </div>
              <button type="button" onClick={closeAssignmentModal} disabled={assignmentSaving} aria-label="Close assignment dialog" className="min-h-11 min-w-11 cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">
                <X className="mx-auto h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="rounded-xl border border-[#1f2937] bg-[#0b1220] px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Receiving</p>
                <p className="mt-1 font-semibold text-white">{assignmentTarget.receiving_no}</p>
                {assignmentContext.kind === 'excess' && assignmentContext.review ? <dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-slate-500">Exception</dt><dd className="font-medium text-orange-200">{assignmentContext.review.reference}</dd></div><div><dt className="text-slate-500">{assignmentContext.review.qa_assignment?.can_reassign ? 'Current QA Cycle' : 'New QA Cycle'}</dt><dd className="font-medium text-white">Cycle {assignmentContext.review.qa_assignment?.can_reassign ? assignmentContext.review.qa_assignment.cycle_number : assignmentContext.review.qa_assignment?.next_cycle_number}</dd></div><div className="col-span-2"><dt className="text-slate-500">Approved Excess</dt><dd className="font-medium text-white">{assignmentContext.review.items.map((item) => `${item.excess_quantity} ${item.unit} ${item.product}`).join(' · ')}</dd></div></dl> : assignmentTarget.assigned_qa && <p className="mt-1 text-xs text-slate-400">Currently assigned to {assignmentTarget.assigned_qa.name}</p>}
                {assignmentContext.kind === 'excess' && !assignmentContext.review?.qa_assignment?.can_reassign && assignmentTarget.assigned_qa && <p className="mt-3 text-xs text-slate-400">The previous cycle was assigned to {assignmentTarget.assigned_qa.name}. You may select the same supervisor for the new cycle.</p>}
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
                disabled={assignmentSaving || qaAssigneesLoading || !selectedQaUserId || (assignmentContext.kind === 'normal' && selectedQaUserId === assignmentTarget.assigned_qa_user_id) || (assignmentContext.kind === 'excess' && assignmentContext.review?.qa_assignment?.can_reassign && selectedQaUserId === assignmentContext.review.qa_assignment.assigned_qa?.id)}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {assignmentSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                {assignmentSaving ? 'Assigning…' : assignmentContext.kind === 'excess' ? (assignmentContext.review?.qa_assignment?.can_reassign ? 'Confirm Reassignment' : 'Confirm Excess Assignment') : assignmentTarget.assigned_qa ? 'Reassign QA' : 'Assign QA'}
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
