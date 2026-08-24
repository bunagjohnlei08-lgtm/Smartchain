import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { AxiosError } from 'axios';
import { apiClient } from '../../lib/api';
import { formatStatusLabel, normalizeInspectionStatus } from './inspectionStatus';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Download,
  Save,
  Send,
  MessageSquare,
} from 'lucide-react';

type InspectionStatus = 'Pending' | 'In Progress' | 'Passed' | 'Rejected' | 'Partial';

interface QaInspectionListRecord {
  id: number;
  receiving_no: string;
  purchase_order: string;
  product: string;
  supplier: string;
  delivery_date: string | null;
  items: number;
  prepared_by: string | null;
  inspection_status: InspectionStatus;
  action: 'Start Inspection' | 'Continue' | 'View Inspection';
}

interface QaInspectionProductApi {
  id: number;
  receiving_item_id: number;
  product: string;
  ordered_qty: number;
  delivered_qty: number;
  accepted_qty: number;
  rejected_qty: number;
  unit: string;
  inspection_result: InspectionStatus | 'Pending';
  remarks?: string | null;
}

interface QaInspectionDetailApi {
  id: number;
  receiving_no: string;
  purchase_order: string;
  supplier: string;
  delivery_date: string | null;
  reference_no: string | null;
  prepared_by: string | null;
  inspection_status: InspectionStatus;
  action: 'Start Inspection' | 'Continue' | 'View Inspection';
  items_count: number;
  products: QaInspectionProductApi[];
  totals: {
    ordered_qty: number;
    delivered_qty: number;
    accepted_qty: number;
    rejected_qty: number;
  };
  timeline: {
    status: string;
    performed_by: string;
    occurred_at: string;
  }[];
  inspection: {
    started_at: string | null;
    completed_at: string | null;
    inspected_by: string | null;
    submitted_by: string | null;
  };
}

interface ReceivingProduct {
  id: number;
  receivingItemId: number;
  product: string;
  orderedQty: number;
  deliveredQty: number;
  acceptedQty: number;
  rejectedQty: number;
  unit: string;
  inspectionResult: InspectionStatus;
  remarks: string;
}

interface ReceivingItem {
  id: number;
  receivingNo: string;
  poNumber: string;
  product: string;
  supplier: string;
  deliveryDate: string;
  items: number;
  preparedBy: string;
  inspectionStatus: InspectionStatus;
  action: 'Start Inspection' | 'Continue' | 'View Inspection';
}

interface ReceivingDetail extends ReceivingItem {
  referenceNo: string;
  products: ReceivingProduct[];
  timeline: {
    status: string;
    date: string;
    time: string;
    performedBy: string;
  }[];
  totalOrdered: number;
  totalDelivered: number;
  totalAccepted: number;
  totalRejected: number;
  inspectedBy: string;
  inspectionDate: string;
  summaryRemarks: string;
}

const statusOptions: Array<'All Status' | InspectionStatus> = ['All Status', 'Pending', 'In Progress', 'Passed', 'Rejected', 'Partial'];

function formatDateOnly(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimeOnly(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getApiErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError<{ message?: string; errors?: Record<string, string[]> }>;
  const status = axiosError.response?.status;
  if (status === 401) return 'Session expired. Please log in again.';
  if (status === 403) return 'You do not have permission to access QA inspection.';
  if (status === 422 && axiosError.response?.data?.errors) {
    const firstError = Object.values(axiosError.response.data.errors)[0];
    return Array.isArray(firstError) ? firstError[0] : String(firstError);
  }
  const message = axiosError.response?.data?.message;
  if (typeof message === 'string') return message;
  return 'An unexpected error occurred. Please try again.';
}

const StatusBadge: React.FC<{ status: unknown }> = ({ status }) => {
  const config: Record<InspectionStatus, { color: string; bg: string; dotColor: string }> = {
    Pending: {
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
      dotColor: 'bg-amber-400',
    },
    'In Progress': {
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      dotColor: 'bg-blue-400',
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
      color: 'text-purple-400',
      bg: 'bg-purple-500/10 border-purple-500/20',
      dotColor: 'bg-purple-400',
    },
  };

  const normalizedStatus = normalizeInspectionStatus(status);
  const badgeConfig = normalizedStatus
    ? config[normalizedStatus]
    : {
        color: 'text-slate-300',
        bg: 'bg-slate-500/10 border-slate-500/20',
        dotColor: 'bg-slate-400',
      };
  const label = normalizedStatus ?? formatStatusLabel(status);

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${badgeConfig.color} ${badgeConfig.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${badgeConfig.dotColor}`} />
      {label}
    </span>
  );
};

const KPICard: React.FC<{
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle: string;
  color?: string;
}> = ({ label, value, icon, subtitle, color = 'text-blue-400' }) => (
  <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 hover:border-gray-700 transition-all duration-200">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-white mt-1.5">{value}</p>
        <p className="text-slate-500 text-xs mt-1">{subtitle}</p>
      </div>
      <div className={`p-2.5 bg-[#090d16] rounded-lg ${color}`}>{icon}</div>
    </div>
  </div>
);

const mapListItem = (record: QaInspectionListRecord): ReceivingItem => ({
  id: record.id,
  receivingNo: record.receiving_no,
  poNumber: record.purchase_order,
  product: record.product,
  supplier: record.supplier,
  deliveryDate: formatDateOnly(record.delivery_date),
  items: record.items,
  preparedBy: record.prepared_by ?? '-',
  inspectionStatus: record.inspection_status,
  action: record.action,
});

const mapDetail = (detail: QaInspectionDetailApi): ReceivingDetail => {
  const products = detail.products.map((item) => ({
    id: item.id,
    receivingItemId: item.receiving_item_id,
    product: item.product,
    orderedQty: item.ordered_qty,
    deliveredQty: item.delivered_qty,
    acceptedQty: item.accepted_qty,
    rejectedQty: item.rejected_qty,
    unit: item.unit,
    inspectionResult: (item.inspection_result === 'Pending' ? 'Pending' : item.inspection_result) as InspectionStatus,
    remarks: item.remarks ?? '',
  }));

  const summaryRemarks = products
    .map((item) => item.remarks.trim())
    .filter(Boolean)
    .join(' | ');

  return {
    id: detail.id,
    receivingNo: detail.receiving_no,
    poNumber: detail.purchase_order,
    product: products[0]?.product ?? '-',
    supplier: detail.supplier,
    deliveryDate: formatDateOnly(detail.delivery_date),
    items: detail.items_count,
    preparedBy: detail.prepared_by ?? '-',
    inspectionStatus: detail.inspection_status,
    action: detail.action,
    referenceNo: detail.reference_no ?? '-',
    products,
    timeline: detail.timeline.map((event) => ({
      status: event.status,
      date: formatDateOnly(event.occurred_at),
      time: formatTimeOnly(event.occurred_at),
      performedBy: event.performed_by || '-',
    })),
    totalOrdered: detail.totals.ordered_qty,
    totalDelivered: detail.totals.delivered_qty,
    totalAccepted: detail.totals.accepted_qty,
    totalRejected: detail.totals.rejected_qty,
    inspectedBy: detail.inspection.inspected_by ?? '-',
    inspectionDate: formatDateOnly(detail.inspection.completed_at ?? detail.inspection.started_at),
    summaryRemarks: summaryRemarks || '-',
  };
};

const QualityInspection: React.FC = () => {
  const [records, setRecords] = useState<ReceivingItem[]>([]);
  const [selectedReceivingId, setSelectedReceivingId] = useState<number | null>(null);
  const [selectedReceiving, setSelectedReceiving] = useState<ReceivingDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'products' | 'summary' | 'notes' | 'attachments' | 'timeline'>('products');
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('All Suppliers');
  const [statusFilter, setStatusFilter] = useState<'All Status' | InspectionStatus>('All Status');
  const [dateFilter, setDateFilter] = useState('All Dates');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const itemsPerPage = 7;

  const fetchList = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);
    try {
      const response = await apiClient.get<{ data: QaInspectionListRecord[] }>('/qa/inspections');
      const mapped = (response.data.data ?? []).map(mapListItem);
      setRecords(mapped);
      setSelectedReceivingId((previous) => {
        if (previous !== null && mapped.some((item) => item.id === previous)) {
          return previous;
        }
        return mapped[0]?.id ?? null;
      });
    } catch (error) {
      setListError(getApiErrorMessage(error));
      setRecords([]);
      setSelectedReceivingId(null);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  const fetchDetail = useCallback(async (receivingId: number) => {
    setIsLoadingDetail(true);
    setDetailError(null);
    try {
      const response = await apiClient.get<QaInspectionDetailApi>(`/qa/inspections/${receivingId}`);
      setSelectedReceiving(mapDetail(response.data));
    } catch (error) {
      setDetailError(getApiErrorMessage(error));
      setSelectedReceiving(null);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (selectedReceivingId === null) {
      setSelectedReceiving(null);
      return;
    }

    fetchDetail(selectedReceivingId);
  }, [fetchDetail, selectedReceivingId]);

  const supplierOptions = useMemo(() => {
    const suppliers = Array.from(new Set(records.map((record) => record.supplier))).sort();
    return ['All Suppliers', ...suppliers];
  }, [records]);

  const filteredData = useMemo(() => {
    return records.filter((record) => {
      const matchSearch =
        record.receivingNo.toLowerCase().includes(search.toLowerCase()) ||
        record.poNumber.toLowerCase().includes(search.toLowerCase()) ||
        record.supplier.toLowerCase().includes(search.toLowerCase()) ||
        record.product.toLowerCase().includes(search.toLowerCase());
      const matchSupplier = supplierFilter === 'All Suppliers' || record.supplier === supplierFilter;
      const matchStatus = statusFilter === 'All Status' || record.inspectionStatus === statusFilter;
      return matchSearch && matchSupplier && matchStatus;
    });
  }, [records, search, supplierFilter, statusFilter]);

  const totalItems = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const currentItems = filteredData.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, supplierFilter, statusFilter, dateFilter]);

  const pending = records.filter((record) => record.inspectionStatus === 'Pending').length;
  const inspectedToday = records.filter((record) => ['Passed', 'Rejected', 'Partial'].includes(record.inspectionStatus)).length;
  const passed = records.filter((record) => record.inspectionStatus === 'Passed').length;
  const rejected = records.filter((record) => record.inspectionStatus === 'Rejected').length;
  const partial = records.filter((record) => record.inspectionStatus === 'Partial').length;

  const handleRowClick = (id: number) => {
    setSelectedReceivingId(id);
    setActionMessage(null);
  };

  const updateProductField = (productId: number, patch: Partial<ReceivingProduct>) => {
    setSelectedReceiving((current) => {
      if (!current) return current;

      const products = current.products.map((product) => {
        if (product.id !== productId) return product;

        const next = { ...product, ...patch };
        return {
          ...next,
          acceptedQty: Math.max(0, Number.isFinite(next.acceptedQty) ? next.acceptedQty : 0),
          rejectedQty: Math.max(0, Number.isFinite(next.rejectedQty) ? next.rejectedQty : 0),
        };
      });

      return {
        ...current,
        products,
        totalAccepted: products.reduce((sum, product) => sum + product.acceptedQty, 0),
        totalRejected: products.reduce((sum, product) => sum + product.rejectedQty, 0),
      };
    });
  };

  const updateInspectionResult = (product: ReceivingProduct, result: InspectionStatus) => {
    const quantityPatch = result === 'Passed'
      ? { acceptedQty: product.deliveredQty, rejectedQty: 0 }
      : result === 'Rejected'
        ? { acceptedQty: 0, rejectedQty: product.deliveredQty }
        : {};

    updateProductField(product.id, { ...quantityPatch, inspectionResult: result });
  };

  const validateProducts = (submit: boolean): string | null => {
    if (!selectedReceiving) return 'Select a receiving record first.';

    for (const product of selectedReceiving.products) {
      const inspectedQuantity = product.acceptedQty + product.rejectedQty;

      if (inspectedQuantity > product.deliveredQty) {
        return `${product.product}: accepted and rejected quantities cannot exceed delivered quantity.`;
      }

      if (!submit) continue;

      if (inspectedQuantity !== product.deliveredQty) {
        return `${product.product}: accepted and rejected quantities must equal delivered quantity before submission.`;
      }

      if (product.inspectionResult === 'Passed' && (product.acceptedQty !== product.deliveredQty || product.rejectedQty !== 0)) {
        return `${product.product}: Passed requires the full delivered quantity to be accepted.`;
      }

      if (product.inspectionResult === 'Rejected' && (product.acceptedQty !== 0 || product.rejectedQty !== product.deliveredQty)) {
        return `${product.product}: Rejected requires the full delivered quantity to be rejected.`;
      }

      if (product.inspectionResult === 'Partial' && (product.acceptedQty === 0 || product.rejectedQty === 0)) {
        return `${product.product}: Partial requires both an accepted and a rejected quantity.`;
      }

      if (product.inspectionResult === 'Pending' || product.inspectionResult === 'In Progress') {
        return `${product.product}: select Passed, Partial, or Rejected before submission.`;
      }
    }

    return null;
  };

  const saveInspection = async (submit: boolean) => {
    if (!selectedReceiving) return;

    const validationError = validateProducts(submit);
    if (validationError) {
      setActionMessage({ type: 'error', text: validationError });
      return;
    }

    setIsSaving(true);
    setActionMessage(null);

    try {
      const payload = {
        submit,
        items: selectedReceiving.products.map((product) => ({
          receiving_item_id: product.receivingItemId,
          accepted_quantity: product.acceptedQty,
          rejected_quantity: product.rejectedQty,
          inspection_result: product.inspectionResult,
          remarks: product.remarks.trim() || null,
        })),
      };

      const method = selectedReceiving.action === 'Start Inspection' ? 'post' : 'put';
      await apiClient[method](`/qa/inspections/${selectedReceiving.id}`, payload);
      if (submit) {
        setSelectedReceivingId(null);
        setSelectedReceiving(null);
        await fetchList();
      } else {
        await fetchList();
        await fetchDetail(selectedReceiving.id);
      }
      setActionMessage({
        type: 'success',
        text: submit ? 'Inspection submitted successfully.' : 'Inspection draft saved.',
      });
    } catch (error) {
      setActionMessage({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  };

  const renderActionButton = (receiving: ReceivingItem) => {
    const baseClass = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-all';

    if (receiving.action === 'Start Inspection') {
      return (
        <button
          onClick={(event) => {
            event.stopPropagation();
            handleRowClick(receiving.id);
          }}
          className={`${baseClass} bg-cyan-500 hover:bg-cyan-400 text-slate-950`}
        >
          Start Inspection
        </button>
      );
    }

    if (receiving.action === 'Continue') {
      return (
        <button
          onClick={(event) => {
            event.stopPropagation();
            handleRowClick(receiving.id);
          }}
          className={`${baseClass} bg-blue-500 hover:bg-blue-400 text-white`}
        >
          Continue
        </button>
      );
    }

    return (
      <button
        onClick={(event) => {
          event.stopPropagation();
          handleRowClick(receiving.id);
        }}
        className={`${baseClass} border border-gray-700 hover:bg-gray-800 text-slate-300`}
      >
        View Inspection
      </button>
    );
  };

  const inspectionIsFinal = selectedReceiving !== null && ['Passed', 'Rejected', 'Partial'].includes(selectedReceiving.inspectionStatus);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Quality Inspection</h1>
          <p className="text-sm text-slate-400">Inspect incoming deliveries before warehouse stock-in.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <KPICard label="Pending Inspection" value={pending} subtitle="Awaiting QA Review" icon={<Clock className="w-5 h-5 text-amber-400" />} color="text-amber-400" />
        <KPICard label="Inspected Today" value={inspectedToday} subtitle="Completed Today" icon={<CheckCircle className="w-5 h-5 text-emerald-400" />} color="text-emerald-400" />
        <KPICard label="Passed Deliveries" value={passed} subtitle="Approved" icon={<CheckCircle className="w-5 h-5 text-emerald-400" />} color="text-emerald-400" />
        <KPICard label="Rejected Deliveries" value={rejected} subtitle="Rejected" icon={<XCircle className="w-5 h-5 text-red-400" />} color="text-red-400" />
        <KPICard label="Partial Acceptance" value={partial} subtitle="Needs Review" icon={<AlertCircle className="w-5 h-5 text-purple-400" />} color="text-purple-400" />
      </div>

      <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search receiving no., PO no., supplier..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full bg-[#090d16] border border-gray-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          />
        </div>
        <select
          value={supplierFilter}
          onChange={(event) => setSupplierFilter(event.target.value)}
          className="bg-[#090d16] border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer min-w-[130px]"
        >
          {supplierOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'All Status' | InspectionStatus)}
          className="bg-[#090d16] border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer min-w-[130px]"
        >
          {statusOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select
          value={dateFilter}
          onChange={(event) => setDateFilter(event.target.value)}
          className="bg-[#090d16] border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer min-w-[130px]"
        >
          {['All Dates', 'Today', 'This Week', 'This Month'].map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <button className="px-3.5 py-2.5 border border-gray-700 rounded-xl text-slate-400 hover:text-white hover:bg-gray-800 transition-all flex items-center gap-1.5 text-sm">
          <Filter className="w-4 h-4" /> Filters
        </button>
      </div>

      {listError && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-sm text-rose-300 flex items-center justify-between gap-3">
          <span>{listError}</span>
          <button onClick={() => fetchList()} className="px-3 py-1.5 rounded-lg border border-rose-400/30 hover:bg-rose-500/10">
            Retry
          </button>
        </div>
      )}

      <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead className="bg-[#090d16]/50 border-b border-gray-800">
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Receiving No.</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">PO Number</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Product</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Supplier</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Delivery Date</th>
                <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400">Items</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Prepared By</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Inspection Status</th>
                <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingList && records.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">Loading inspection records...</td>
                </tr>
              )}
              {currentItems.map((receiving) => (
                <tr
                  key={receiving.id}
                  onClick={() => handleRowClick(receiving.id)}
                  className={`border-b border-gray-800 hover:bg-gray-800/30 transition-all cursor-pointer ${selectedReceivingId === receiving.id ? 'bg-gray-800/30' : ''}`}
                >
                  <td className="px-4 py-3.5 text-sm font-medium text-white">{receiving.receivingNo}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">{receiving.poNumber}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">{receiving.product}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">{receiving.supplier}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">{receiving.deliveryDate}</td>
                  <td className="px-4 py-3.5 text-center text-sm text-slate-300">{receiving.items} Items</td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">{receiving.preparedBy}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={receiving.inspectionStatus} /></td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-2">
                      {renderActionButton(receiving)}
                      <button
                        onClick={(event) => event.stopPropagation()}
                        className="p-1.5 rounded hover:bg-gray-700 text-slate-400 hover:text-white transition-all"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoadingList && currentItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    {listError ? 'Unable to load inspection records.' : 'No inspection records found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 bg-[#090d16]/30">
          <div className="text-sm text-slate-400">Showing {totalItems > 0 ? startIndex + 1 : 0} to {endIndex} of {totalItems} records</div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-xl border border-gray-700 text-slate-400 hover:text-white hover:bg-gray-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
              const page = index + 1;
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded-xl text-sm font-medium transition-all ${currentPage === page ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white hover:bg-gray-800'}`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-xl border border-gray-700 text-slate-400 hover:text-white hover:bg-gray-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {selectedReceivingId !== null && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-gray-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-white">Inspection Details</h3>
                  {selectedReceiving && <StatusBadge status={selectedReceiving.inspectionStatus} />}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={isSaving || isLoadingDetail || !selectedReceiving || inspectionIsFinal}
                    onClick={() => saveInspection(false)}
                    className="px-3 py-1.5 border border-gray-700 hover:bg-gray-800 text-slate-300 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4 inline mr-1.5" /> Save Draft
                  </button>
                  <button
                    disabled={isSaving || isLoadingDetail || !selectedReceiving || inspectionIsFinal}
                    onClick={() => saveInspection(true)}
                    className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" /> Submit Inspection
                  </button>
                  <button className="p-2 rounded-lg hover:bg-gray-800 text-slate-400 hover:text-white transition-all">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {detailError && (
                <div className="mx-5 mt-5 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-sm text-rose-300 flex items-center justify-between gap-3">
                  <span>{detailError}</span>
                  <button onClick={() => selectedReceivingId && fetchDetail(selectedReceivingId)} className="px-3 py-1.5 rounded-lg border border-rose-400/30 hover:bg-rose-500/10">
                    Retry
                  </button>
                </div>
              )}

              {actionMessage && (
                <div className={`mx-5 mt-5 rounded-xl px-4 py-3 text-sm ${actionMessage.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'}`}>
                  {actionMessage.text}
                </div>
              )}

              {isLoadingDetail && !selectedReceiving ? (
                <div className="p-5 text-sm text-slate-400">Loading inspection details...</div>
              ) : selectedReceiving ? (
                <>
                  <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-slate-400">Receiving No.</p>
                      <p className="text-white font-medium">{selectedReceiving.receivingNo}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">PO Number</p>
                      <p className="text-white font-medium">{selectedReceiving.poNumber}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Supplier</p>
                      <p className="text-white font-medium">{selectedReceiving.supplier}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Delivery Date</p>
                      <p className="text-white font-medium">{selectedReceiving.deliveryDate}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Reference No.</p>
                      <p className="text-white font-medium">{selectedReceiving.referenceNo}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Prepared By</p>
                      <p className="text-white font-medium">{selectedReceiving.preparedBy}</p>
                    </div>
                  </div>

                  <div className="border-b border-gray-800">
                    <div className="flex px-5 overflow-x-auto">
                      {['products', 'summary', 'notes', 'attachments', 'timeline'].map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab as typeof activeTab)}
                          className={`py-3 px-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${activeTab === tab ? 'border-cyan-500 text-white' : 'border-transparent text-slate-400 hover:text-white'}`}
                        >
                          {tab.charAt(0).toUpperCase() + tab.slice(1)}
                          {tab === 'products' && ` (${selectedReceiving.products.length})`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-5">
                    {activeTab === 'products' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b border-gray-800">
                            <tr className="text-left text-slate-400">
                              <th className="px-2 py-2 font-medium">Product</th>
                              <th className="px-2 py-2 font-medium text-center">Ordered Qty</th>
                              <th className="px-2 py-2 font-medium text-center">Delivered Qty</th>
                              <th className="px-2 py-2 font-medium text-center">Accepted Qty</th>
                              <th className="px-2 py-2 font-medium text-center">Rejected Qty</th>
                              <th className="px-2 py-2 font-medium">Unit</th>
                              <th className="px-2 py-2 font-medium">Inspection Result</th>
                              <th className="px-2 py-2 font-medium">Remarks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedReceiving.products.map((product) => {
                              const quantityError = product.acceptedQty + product.rejectedQty > product.deliveredQty;
                              const readOnly = ['Passed', 'Rejected', 'Partial'].includes(selectedReceiving.inspectionStatus);

                              return (
                                <tr key={product.id} className="border-b border-gray-800 hover:bg-gray-800/30">
                                  <td className="px-2 py-2 text-white">{product.product}</td>
                                  <td className="px-2 py-2 text-center text-white">{product.orderedQty}</td>
                                  <td className="px-2 py-2 text-center text-white">{product.deliveredQty}</td>
                                  <td className="px-2 py-2 text-center">
                                    <input
                                      type="number"
                                      min={0}
                                      max={product.deliveredQty}
                                      disabled={readOnly}
                                      value={product.acceptedQty}
                                      onChange={(event) => updateProductField(product.id, { acceptedQty: Number(event.target.value) })}
                                      className={`w-20 bg-[#090d16] border rounded px-2 py-1 text-center text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 ${quantityError ? 'border-rose-500/60' : 'border-gray-700'} disabled:opacity-60`}
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    <input
                                      type="number"
                                      min={0}
                                      max={product.deliveredQty}
                                      disabled={readOnly}
                                      value={product.rejectedQty}
                                      onChange={(event) => updateProductField(product.id, { rejectedQty: Number(event.target.value) })}
                                      className={`w-20 bg-[#090d16] border rounded px-2 py-1 text-center text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 ${quantityError ? 'border-rose-500/60' : 'border-gray-700'} disabled:opacity-60`}
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-slate-300">{product.unit}</td>
                                  <td className="px-2 py-2">
                                    <select
                                      disabled={readOnly}
                                      value={product.inspectionResult}
                                      onChange={(event) => updateInspectionResult(product, event.target.value as InspectionStatus)}
                                      className="bg-[#090d16] border border-gray-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-60"
                                    >
                                      <option value="Pending">Pending</option>
                                      <option value="Passed">Passed</option>
                                      <option value="Rejected">Rejected</option>
                                      <option value="Partial">Partial</option>
                                    </select>
                                  </td>
                                  <td className="px-2 py-2">
                                    <div className="flex items-center gap-2">
                                      <MessageSquare className="w-4 h-4 text-slate-500" />
                                      <input
                                        type="text"
                                        disabled={readOnly}
                                        value={product.remarks}
                                        onChange={(event) => updateProductField(product.id, { remarks: event.target.value })}
                                        className="w-full bg-[#090d16] border border-gray-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-60"
                                        placeholder="Add remarks"
                                      />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        <div className="mt-4 p-3 bg-[#090d16] border border-gray-800 rounded-lg flex flex-wrap items-center justify-between text-sm gap-3">
                          <span className="text-slate-400">Total Items: <span className="text-white font-medium">{selectedReceiving.products.length}</span></span>
                          <div className="flex flex-wrap gap-4">
                            <span className="text-slate-400">Ordered: <span className="text-white font-medium">{selectedReceiving.totalOrdered}</span></span>
                            <span className="text-slate-400">Delivered: <span className="text-white font-medium">{selectedReceiving.totalDelivered}</span></span>
                            <span className="text-slate-400">Accepted: <span className="text-emerald-400 font-medium">{selectedReceiving.totalAccepted}</span></span>
                            <span className="text-slate-400">Rejected: <span className="text-red-400 font-medium">{selectedReceiving.totalRejected}</span></span>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'summary' && (
                      <div className="space-y-4 text-sm">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-slate-400">QA Inspector</p>
                            <p className="text-white">{selectedReceiving.inspectedBy}</p>
                          </div>
                          <div>
                            <p className="text-slate-400">Inspection Date</p>
                            <p className="text-white">{selectedReceiving.inspectionDate}</p>
                          </div>
                          <div>
                            <p className="text-slate-400">Overall Decision</p>
                            <StatusBadge status={selectedReceiving.inspectionStatus} />
                          </div>
                          <div>
                            <p className="text-slate-400">Remarks</p>
                            <p className="text-white">{selectedReceiving.summaryRemarks}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'notes' && (
                      <div className="space-y-3 text-sm">
                        <div className="space-y-2">
                          <p className="text-slate-400">QA Notes</p>
                          {selectedReceiving.products.map((product) => (
                            <div key={product.id}>
                              <label className="mb-1 block text-xs text-slate-500">{product.product}</label>
                              <textarea
                                value={product.remarks}
                                onChange={(event) => updateProductField(product.id, { remarks: event.target.value })}
                                disabled={inspectionIsFinal}
                                maxLength={1000}
                                rows={3}
                                placeholder="Enter QA inspection findings"
                                className="w-full rounded-lg border border-gray-800 bg-[#090d16] p-3 text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none disabled:opacity-60"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeTab === 'attachments' && (
                      <div className="space-y-3 text-sm">
                        <p className="text-slate-400">No attachments uploaded.</p>
                      </div>
                    )}

                    {activeTab === 'timeline' && (
                      <div className="space-y-4 relative">
                        {selectedReceiving.timeline.map((item, index) => (
                          <div key={`${item.status}-${index}`} className="flex items-start gap-3 relative">
                            {index < selectedReceiving.timeline.length - 1 && <div className="absolute left-2.5 top-5 bottom-0 w-0.5 bg-slate-700" />}
                            <div className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <div className="w-2 h-2 rounded-full bg-cyan-500" />
                            </div>
                            <div className="flex-1 pb-4">
                              <p className="text-white font-medium">{item.status}</p>
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <span>{item.date}</span>
                                <span>|</span>
                                <span>{item.time}</span>
                                <span>|</span>
                                <span>by {item.performedBy}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-5 text-sm text-slate-400">Select a receiving to view inspection details.</div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 sticky top-6">
              <h3 className="text-lg font-semibold text-white mb-4">Inspection Timeline</h3>
              <div className="space-y-4 relative">
                {selectedReceiving?.timeline.map((item, index) => (
                  <div key={`${item.status}-side-${index}`} className="flex items-start gap-3 relative">
                    {index < selectedReceiving.timeline.length - 1 && <div className="absolute left-2.5 top-5 bottom-0 w-0.5 bg-slate-700" />}
                    <div className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-cyan-500" />
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="text-white font-medium">{item.status}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>{item.date}</span>
                        <span>|</span>
                        <span>{item.time}</span>
                        <span>|</span>
                        <span>by {item.performedBy}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {!selectedReceiving && <p className="text-sm text-slate-400">Select a receiving to view its timeline.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QualityInspection;
