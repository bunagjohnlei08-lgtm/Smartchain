import React, { useCallback, useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { apiClient } from '../../lib/api';
import {
  ChevronRight,
  Search,
  Download,
  Package,
  Clock,
  Calendar,
  X,
  Check,
  AlertCircle,
  Plus,
  MoreVertical,
  Eye,
  Filter,
  RefreshCw,
  Printer,
  FileText,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  PackageCheck,
  ArrowDownToLine,
  Box,
  Loader2,
  PanelRightClose,
  QrCode,
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

type QaStatus = 'Pending QA' | 'Passed' | 'Rejected' | 'Partial';
type ReceivingStatus = 'Pending QA' | 'Ready for Stock In' | 'Completed' | 'Rejected';
type DrawerMode = 'receiving' | 'stocked' | null;

interface ReceivingLineItem {
  id: number;
  productName: string;
  deliveredQuantity: number;
  acceptedQuantity: number;
  stockableQuantity: number;
  stockedQuantity: number;
  unit: string;
  inspectionStatus: QaStatus;
  warehouse: string | null;
  stockedInAt: string | null;
  barcode: string | null;
}

interface ReceivingItem {
  id: number;
  receivingNo: string;
  purchaseOrder: string;
  supplier: string;
  receivingDate: string;
  refNo: string;
  preparedBy: string | null;
  qaStatus: QaStatus;
  status: ReceivingStatus;
  productSummary: string;
  itemsCount: number;
  totalQuantity: number;
  eligibleItemsCount: number;
  eligibleQuantity: number;
  eligibilityMessage: string;
  receivedValue: number;
  items: ReceivingLineItem[];
  timeline: { status: string; performed_by: string; occurred_at: string }[];
  stockedInAt: string | null;
}

interface RecentlyStockedItem {
  id: number;
  receivingId: number;
  receivingNo: string | null;
  barcode: string | null;
  product: string;
  warehouse: string;
  quantity: number;
  stockInDate: string | null;
  status: 'Stocked In';
}

interface StockInHistoryItem {
  id: number;
  receivingId: number;
  receivingNo: string | null;
  product: string;
  supplier: string | null;
  receivingDate: string | null;
  referenceNo: string | null;
  stockedQuantity: number;
  barcode: string | null;
  stockInDate: string | null;
  status: 'Completed';
}

interface ApiReceivingLineItem {
  id: number;
  product_id: number;
  product_name: string;
  delivered_quantity: number;
  accepted_quantity: number;
  stockable_quantity: number;
  stocked_quantity: number;
  unit: string;
  inspection_status: QaStatus;
  warehouse: string | null;
  stocked_in_at: string | null;
  barcode: string | null;
}

interface ApiReceiving {
  id: number;
  receiving_no: string;
  purchase_order: string;
  supplier: string;
  ref_no: string | null;
  delivery_date: string;
  qa_status: QaStatus;
  stock_in_status: ReceivingStatus;
  prepared_by: string | null;
  product_summary: string;
  items_count: number;
  total_quantity: number;
  eligible_items_count: number;
  eligible_quantity: number;
  eligibility_message: string;
  received_value: number;
  items: ApiReceivingLineItem[];
  timeline: { status: string; performed_by: string; occurred_at: string }[];
  stocked_in_at: string | null;
}

interface ApiRecentlyStockedItem {
  id: number;
  receiving_id: number;
  receiving_no: string | null;
  barcode: string | null;
  product: string;
  warehouse: string;
  quantity: number;
  stock_in_date: string | null;
  status: 'Stocked In';
}

interface ApiStockInHistoryItem {
  id: number;
  receiving_id: number;
  receiving_no: string | null;
  product: string;
  supplier: string | null;
  receiving_date: string | null;
  reference_no: string | null;
  stocked_quantity: number;
  barcode: string | null;
  stock_in_date: string | null;
  status: 'Completed';
}

const mapReceiving = (record: ApiReceiving): ReceivingItem => ({
  id: record.id,
  receivingNo: record.receiving_no,
  purchaseOrder: record.purchase_order,
  supplier: record.supplier,
  receivingDate: formatDateOnly(record.delivery_date),
  refNo: record.ref_no ?? '—',
  preparedBy: record.prepared_by,
  qaStatus: record.qa_status,
  status: record.stock_in_status,
  productSummary: record.product_summary,
  itemsCount: record.items_count,
  totalQuantity: record.total_quantity,
  eligibleItemsCount: record.eligible_items_count,
  eligibleQuantity: record.eligible_quantity,
  eligibilityMessage: record.eligibility_message,
  receivedValue: record.received_value,
  items: record.items.map((item) => ({
    id: item.id,
    productName: item.product_name,
    deliveredQuantity: item.delivered_quantity,
    acceptedQuantity: item.accepted_quantity,
    stockableQuantity: item.stockable_quantity,
    stockedQuantity: item.stocked_quantity,
    unit: item.unit,
    inspectionStatus: item.inspection_status,
    warehouse: item.warehouse,
    stockedInAt: item.stocked_in_at,
    barcode: item.barcode,
  })),
  timeline: record.timeline,
  stockedInAt: record.stocked_in_at,
});

const mapRecentlyStocked = (item: ApiRecentlyStockedItem): RecentlyStockedItem => ({
  id: item.id,
  receivingId: item.receiving_id,
  receivingNo: item.receiving_no,
  barcode: item.barcode,
  product: item.product,
  warehouse: item.warehouse,
  quantity: item.quantity,
  stockInDate: item.stock_in_date,
  status: item.status,
});

const mapStockInHistory = (item: ApiStockInHistoryItem): StockInHistoryItem => ({
  id: item.id,
  receivingId: item.receiving_id,
  receivingNo: item.receiving_no,
  product: item.product,
  supplier: item.supplier,
  receivingDate: item.receiving_date,
  referenceNo: item.reference_no,
  stockedQuantity: item.stocked_quantity,
  barcode: item.barcode,
  stockInDate: item.stock_in_date,
  status: item.status,
});

function formatDateOnly(dateString: string | null): string {
  if (!dateString) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString);
  if (!match) return '—';
  const [, y, m, d] = match;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Number(m) - 1]} ${Number(d)}, ${y}`;
}

function formatDateTime(dateString: string | null): string {
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
  if (status === 422 && axiosError.response?.data?.errors) {
    const firstError = Object.values(axiosError.response.data.errors)[0];
    return Array.isArray(firstError) ? firstError[0] : String(firstError);
  }
  const msg = axiosError.response?.data?.message;
  if (typeof msg === 'string') return msg;
  return 'An unexpected error occurred. Please try again.';
}

const QaStatusBadge: React.FC<{ status: QaStatus }> = ({ status }) => {
  const config = {
    'Pending QA': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    Passed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    Rejected: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    Partial: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${config[status]}`}>
      {status === 'Passed' && <Check className="w-3 h-3 mr-1" />}
      {status === 'Pending QA' && <Clock className="w-3 h-3 mr-1" />}
      {status === 'Rejected' && <X className="w-3 h-3 mr-1" />}
      {status}
    </span>
  );
};

const ReceivingStatusBadge: React.FC<{ status: ReceivingStatus | 'Stocked In' }> = ({ status }) => {
  const config = {
    'Pending QA': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'Ready for Stock In': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    Completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    Rejected: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    'Stocked In': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${config[status]}`}>
      {status}
    </span>
  );
};

const BarcodeSVG: React.FC<{ value: string }> = ({ value }) => {
  const digits = value.split('').map(Number);
  const patterns = digits.map((digit) => {
    const pattern = [];
    for (let index = 0; index < 5; index += 1) {
      pattern.push(digit % 3 === 0 ? 2 : 1);
    }
    return pattern;
  }).flat();

  const barWidth = 2;
  const barSpacing = 1;
  const height = 42;

  return (
    <svg
      viewBox={`0 0 ${patterns.length * (barWidth + barSpacing)} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto max-h-12"
    >
      {patterns.map((thickness, index) => (
        <rect
          key={`${value}-${index}`}
          x={index * (barWidth + barSpacing)}
          y={0}
          width={thickness === 2 ? barWidth * 2 : barWidth}
          height={height}
          fill="currentColor"
          className="text-slate-100"
        />
      ))}
    </svg>
  );
};

const StockIn: React.FC = () => {
  const [receivings, setReceivings] = useState<ReceivingItem[]>([]);
  const [recentlyStocked, setRecentlyStocked] = useState<RecentlyStockedItem[]>([]);
  const [historyItems, setHistoryItems] = useState<StockInHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isStockingIn, setIsStockingIn] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedStockedId, setSelectedStockedId] = useState<number | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'items' | 'attachments' | 'history'>('info');

  const fetchReceivings = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await apiClient.get<{ data: ApiReceiving[] }>('/stock-in/receivings');
      const mapped = (response.data.data ?? []).map(mapReceiving);
      setReceivings(mapped);
      setSelectedId((prev) => {
        if (prev !== null && mapped.some((item) => item.id === prev)) return prev;
        return mapped[0]?.id ?? null;
      });
    } catch (error) {
      setLoadError(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchRecentStocked = useCallback(async () => {
    setIsLoadingRecent(true);
    setRecentError(null);
    try {
      const response = await apiClient.get<{ data: ApiRecentlyStockedItem[] }>('/stock-in/recently-stocked');
      setRecentlyStocked((response.data.data ?? []).map(mapRecentlyStocked));
    } catch (error) {
      setRecentError(getApiErrorMessage(error));
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const response = await apiClient.get<{ data: ApiStockInHistoryItem[] }>('/stock-in/history');
      setHistoryItems((response.data.data ?? []).map(mapStockInHistory));
    } catch (error) {
      setHistoryError(getApiErrorMessage(error));
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchReceivings();
    fetchRecentStocked();
    fetchHistory();
  }, [fetchReceivings, fetchRecentStocked, fetchHistory]);

  const selectedReceiving = receivings.find((record) => record.id === selectedId) ?? null;
  const selectedStocked = recentlyStocked.find((record) => record.id === selectedStockedId) ?? null;

  const filteredReceivings = receivings.filter((record) =>
    record.receivingNo.toLowerCase().includes(search.toLowerCase()) ||
    record.supplier.toLowerCase().includes(search.toLowerCase()) ||
    record.refNo.toLowerCase().includes(search.toLowerCase())
  );

  const totalDeliveries = receivings.length;
  const totalItemsReceived = receivings.reduce((sum, receiving) => sum + receiving.items.reduce((itemSum, item) => itemSum + item.stockedQuantity, 0), 0);
  const pendingQa = receivings.filter((receiving) => receiving.status === 'Pending QA').length;
  const qaPassed = receivings.filter((receiving) => receiving.status === 'Ready for Stock In').length;
  const rejected = receivings.filter((receiving) => receiving.status === 'Rejected').length;
  const totalValue = receivings.reduce((sum, receiving) => sum + receiving.receivedValue, 0);

  const kpiData = [
    { label: 'Total Receivings', value: totalDeliveries, subtitle: 'All records', trend: 'up' },
    { label: 'Items Stocked In', value: totalItemsReceived, subtitle: 'QA-approved quantity', trend: 'up' },
    { label: 'Pending QA', value: pendingQa, subtitle: 'Awaiting inspection', trend: 'down' },
    { label: 'Ready for Stock In', value: qaPassed, subtitle: 'Eligible receivings', trend: 'up' },
    { label: 'Rejected', value: rejected, subtitle: 'Deliveries rejected', trend: 'down' },
    { label: 'Total Received Value', value: `₱${totalValue.toLocaleString()}`, subtitle: 'Stock In view', trend: 'up' },
  ];

  const canPerformStockIn = selectedReceiving !== null && selectedReceiving.eligibleQuantity > 0 && selectedReceiving.status !== 'Completed';

  const handleSelect = (id: number) => {
    setSelectedId(id);
    setDrawerMode('receiving');
    setActionMessage(null);
  };

  const handleSelectStocked = (id: number) => {
    setSelectedStockedId(id);
    setDrawerMode('stocked');
  };

  const handlePerformStockIn = async () => {
    if (!selectedReceiving || !canPerformStockIn) return;
    setIsStockingIn(true);
    setActionMessage(null);
    try {
      await apiClient.post(`/stock-in/receivings/${selectedReceiving.id}/stock-in`);
      setActionMessage({ type: 'success', text: `${selectedReceiving.receivingNo} stocked in successfully. Inventory and barcode are now available.` });
      await Promise.all([fetchReceivings(), fetchRecentStocked(), fetchHistory()]);
      setSelectedId(selectedReceiving.id);
      setDrawerMode('receiving');
    } catch (error) {
      setActionMessage({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setIsStockingIn(false);
    }
  };

  const handlePrimaryStockIn = () => {
    const firstEligible = receivings.find((receiving) => receiving.eligibleQuantity > 0 && receiving.status !== 'Completed');
    if (!firstEligible) {
      setActionMessage({ type: 'error', text: 'No QA-approved receiving is ready for Stock In right now.' });
      return;
    }
    setSelectedId(firstEligible.id);
    setDrawerMode('receiving');
    setActionMessage(null);
  };

  const timelineSteps = selectedReceiving ? [
    { label: 'Receiving Created', done: true, time: selectedReceiving.receivingDate },
    {
      label: 'QA Inspection',
      done: selectedReceiving.status !== 'Pending QA',
      time: selectedReceiving.status === 'Pending QA' ? 'In Progress' : selectedReceiving.status,
    },
    {
      label: 'Ready for Stock In',
      done: selectedReceiving.status === 'Ready for Stock In' || selectedReceiving.status === 'Completed',
      time: selectedReceiving.status === 'Ready for Stock In' || selectedReceiving.status === 'Completed' ? selectedReceiving.status : selectedReceiving.status,
    },
    {
      label: 'Stock In Completed',
      done: selectedReceiving.status === 'Completed',
      time: selectedReceiving.status === 'Completed' ? formatDateTime(selectedReceiving.stockedInAt) : 'Pending',
    },
    {
      label: 'Barcode Available',
      done: selectedReceiving.items.some((item) => Boolean(item.barcode)),
      time: selectedReceiving.items.find((item) => item.barcode)?.barcode ?? 'Pending',
    },
  ] : [];

  const pieData = [
    { name: 'Ready', value: qaPassed, color: '#10b981' },
    { name: 'Rejected', value: rejected, color: '#ef4444' },
    { name: 'Pending', value: pendingQa, color: '#f59e0b' },
  ];
  const pieTotal = pieData.reduce((sum, item) => sum + item.value, 0) || 1;

  return (
    <div className="w-full min-h-screen bg-[#070a12] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 overflow-x-hidden">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span>Plant Manager</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-100">Stock In</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Stock In</h1>
          <p className="text-slate-400 text-sm mt-1">
            Inbound receiving against QA-approved deliveries and accepted quantities.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-slate-700 hover:bg-slate-800/50 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-slate-700 hover:bg-slate-800/50 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button
            onClick={() => {
              fetchReceivings();
              fetchRecentStocked();
              fetchHistory();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-700 hover:bg-slate-800/50 text-slate-300 rounded-xl text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading || isLoadingRecent ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handlePrimaryStockIn}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Stock In
          </button>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {loadError}
        </div>
      )}

      {actionMessage && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm ${
          actionMessage.type === 'success'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
        }`}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {actionMessage.text}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiData.map((kpi, idx) => {
          const trendIcon = kpi.trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />;
          const trendColor = kpi.trend === 'up' ? 'text-emerald-400' : 'text-rose-400';
          const accentClasses = [
            'text-blue-400 bg-blue-500/10 border border-blue-500/20',
            'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20',
            'text-amber-400 bg-amber-500/10 border border-amber-500/20',
            'text-cyan-400 bg-cyan-500/10 border border-cyan-500/20',
            'text-rose-400 bg-rose-500/10 border border-rose-500/20',
            'text-teal-400 bg-teal-500/10 border border-teal-500/20',
          ];
          return (
            <div key={idx} className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 hover:border-slate-700 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{kpi.label}</p>
                  <p className="text-2xl font-bold text-white mt-1">{kpi.value}</p>
                </div>
                <div className={`p-2.5 rounded-lg flex items-center justify-center ${accentClasses[idx]}`}>
                  {idx === 0 && <Box className="w-5 h-5" />}
                  {idx === 1 && <PackageCheck className="w-5 h-5" />}
                  {idx === 2 && <Clock className="w-5 h-5" />}
                  {idx === 3 && <CheckCircle className="w-5 h-5" />}
                  {idx === 4 && <XCircle className="w-5 h-5" />}
                  {idx === 5 && <FileText className="w-5 h-5" />}
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-1">{kpi.subtitle}</p>
              <p className={`text-xs font-medium mt-1 flex items-center gap-1 ${trendColor}`}>
                {trendIcon}
              </p>
            </div>
          );
        })}
      </div>

      <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 space-y-4 w-full">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search receiving no., supplier, or reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#070a12] border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
          </div>
          <select className="bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
            <option>All Status</option>
            <option>Pending QA</option>
            <option>Ready for Stock In</option>
            <option>Rejected</option>
          </select>
          <select className="bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
            <option>All Warehouses</option>
            <option>Main Warehouse</option>
          </select>
          <div className="flex items-center gap-2 bg-[#070a12] border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span>Date Range</span>
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </div>
          <button className="p-2 rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-800/50 transition-colors">
            <Filter className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#070a12] border-b border-slate-800/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Receiving No.</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Product</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Receiving Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Ref. No.</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-400">Items</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Received Value</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {isLoading && receivings.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Loading receivings...
                  </td>
                </tr>
              )}
              {filteredReceivings.map((rec) => (
                <tr key={rec.id} className={`hover:bg-slate-800/20 transition-colors ${selectedReceiving?.id === rec.id ? 'bg-slate-800/20' : ''}`}>
                  <td className="px-4 py-3 font-mono text-blue-400 hover:underline font-medium">{rec.receivingNo}</td>
                  <td className="px-4 py-3 text-slate-300">{rec.productSummary}</td>
                  <td className="px-4 py-3 text-slate-300">{rec.supplier}</td>
                  <td className="px-4 py-3 text-slate-300">{rec.receivingDate}</td>
                  <td className="px-4 py-3 text-slate-400">{rec.refNo}</td>
                  <td className="px-4 py-3"><ReceivingStatusBadge status={rec.status} /></td>
                  <td className="px-4 py-3 text-center text-white">
                    <div>{rec.itemsCount} item{rec.itemsCount === 1 ? '' : 's'}</div>
                    <div className="text-xs text-slate-500">{rec.totalQuantity} units</div>
                  </td>
                  <td className="px-4 py-3 text-right text-white">₱{rec.receivedValue.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        onClick={() => handleSelect(rec.id)}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && filteredReceivings.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No receiving records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 space-y-4 w-full">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <QrCode className="w-4 h-4 text-cyan-400" />
            Recently Stocked In
          </h3>
          <span className="text-xs text-slate-400">Latest 5 records</span>
        </div>

        {recentError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {recentError}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#070a12] border-b border-slate-800/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Barcode</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Product</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Warehouse</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-400">Quantity</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Stock In Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {isLoadingRecent && recentlyStocked.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Loading recently stocked records...
                  </td>
                </tr>
              )}
              {recentlyStocked.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 py-3">
                    {item.barcode ? (
                      <div className="w-40">
                        <BarcodeSVG value={item.barcode} />
                        <p className="mt-1 text-[10px] tracking-[0.2em] text-cyan-300 font-mono text-center">{item.barcode}</p>
                      </div>
                    ) : (
                      <span className="font-mono text-cyan-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white">{item.product}</td>
                  <td className="px-4 py-3 text-slate-300">{item.warehouse}</td>
                  <td className="px-4 py-3 text-center text-white">{item.quantity}</td>
                  <td className="px-4 py-3 text-slate-300">{formatDateTime(item.stockInDate)}</td>
                  <td className="px-4 py-3"><ReceivingStatusBadge status={item.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                      onClick={() => handleSelectStocked(item.id)}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!isLoadingRecent && recentlyStocked.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No stocked-in records yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 space-y-4 w-full">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            Stock In History
          </h3>
          <span className="text-xs text-slate-400">Completed records</span>
        </div>

        {historyError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {historyError}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#070a12] border-b border-slate-800/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Receiving No.</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Product</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Receiving Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Reference No.</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-400">Stocked Qty</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Barcode</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Stock In Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {isLoadingHistory && historyItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Loading history...
                  </td>
                </tr>
              )}
              {historyItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-blue-400">{item.receivingNo ?? '—'}</td>
                  <td className="px-4 py-3 text-white">{item.product}</td>
                  <td className="px-4 py-3 text-slate-300">{item.supplier ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{formatDateOnly(item.receivingDate)}</td>
                  <td className="px-4 py-3 text-slate-300">{item.referenceNo ?? '—'}</td>
                  <td className="px-4 py-3 text-center text-white">{item.stockedQuantity}</td>
                  <td className="px-4 py-3 font-mono text-cyan-300">{item.barcode ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{formatDateTime(item.stockInDate)}</td>
                  <td className="px-4 py-3"><ReceivingStatusBadge status={item.status} /></td>
                </tr>
              ))}
              {!isLoadingHistory && historyItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    No stock in history found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 items-stretch">
        <div className="lg:col-span-2 flex">
          <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 w-full">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              Pending Deliveries
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {receivings.slice(0, 4).map((rec) => (
                <div
                  key={rec.id}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedReceiving?.id === rec.id ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-800/60 hover:border-slate-600'
                  }`}
                  onClick={() => handleSelect(rec.id)}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-sm font-semibold text-white">{rec.receivingNo}</span>
                    <QaStatusBadge status={rec.qaStatus} />
                  </div>
                  <p className="text-sm text-slate-300 mt-1">{rec.supplier}</p>
                  <p className="text-xs text-slate-400 mt-1">Received: {rec.receivingDate}</p>
                  <p className="text-xs text-slate-400">
                    {rec.productSummary} · {rec.totalQuantity} {rec.totalQuantity === 1 ? 'unit' : 'units'}
                  </p>
                  <button
                    onClick={() => handleSelect(rec.id)}
                    className="w-full mt-2 py-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/10 rounded-lg transition-colors"
                  >
                    View Receiving
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1 flex">
          <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 w-full h-full min-h-[320px] flex flex-col">
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <Package className="w-4 h-4 text-cyan-400" />
              Receiving Summary
            </h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" dataKey="value" label={false}>
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center flex-wrap gap-4 text-xs pt-2">
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Ready {Math.round((qaPassed / pieTotal) * 100)}%</div>
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Rejected {Math.round((rejected / pieTotal) * 100)}%</div>
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> Pending {Math.round((pendingQa / pieTotal) * 100)}%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full mt-6">
        <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            Receiving Timeline
          </h3>
          <div className="overflow-x-auto pb-1">
            <div className="flex items-start min-w-[700px]">
              {timelineSteps.map((step, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === timelineSteps.length - 1;
                const incomingDone = !isFirst && timelineSteps[idx - 1].done;
                return (
                  <div key={idx} className="flex-1 min-w-0 flex flex-col items-center text-center">
                    <div className="flex items-center w-full">
                      <div
                        className={`h-0.5 flex-1 ${
                          isFirst ? 'bg-transparent' : incomingDone ? 'bg-cyan-500' : 'bg-slate-700'
                        }`}
                      />
                      <div
                        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                          step.done ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-slate-600 bg-slate-800 text-slate-400'
                        }`}
                      >
                        {step.done ? <Check className="w-4 h-4 text-cyan-400" /> : idx + 1}
                      </div>
                      <div
                        className={`h-0.5 flex-1 ${
                          isLast ? 'bg-transparent' : step.done ? 'bg-cyan-500' : 'bg-slate-700'
                        }`}
                      />
                    </div>
                    <p className={`text-sm font-medium mt-2 px-2 ${step.done ? 'text-white' : 'text-slate-500'}`}>{step.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5 px-2">{step.time}</p>
                  </div>
                );
              })}
            </div>
            {timelineSteps.length === 0 && <p className="text-xs text-slate-500">Select a receiving to view its timeline.</p>}
          </div>
        </div>
      </div>

      {drawerMode && (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-slate-800 bg-[#0b101d] shadow-2xl">
          <div className="h-full overflow-y-auto p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {drawerMode === 'receiving' ? 'Receiving Details' : 'Stock In Details'}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {drawerMode === 'receiving' ? 'Review the selected receiving before posting Stock In.' : 'Most recent stocked-in inventory detail.'}
                </p>
              </div>
              <button
                onClick={() => setDrawerMode(null)}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <PanelRightClose className="w-4 h-4" />
              </button>
            </div>

            {drawerMode === 'receiving' && selectedReceiving && (
              <>
                <div className="rounded-xl border border-slate-800 bg-[#070a12] p-4 space-y-3 text-sm">
                  <div><span className="text-slate-400">Receiving No.</span><p className="text-white">{selectedReceiving.receivingNo}</p></div>
                  <div><span className="text-slate-400">Supplier</span><p className="text-white">{selectedReceiving.supplier}</p></div>
                  <div><span className="text-slate-400">Purchase Order</span><p className="text-white">{selectedReceiving.purchaseOrder}</p></div>
                  <div><span className="text-slate-400">Reference No.</span><p className="text-white">{selectedReceiving.refNo}</p></div>
                  <div><span className="text-slate-400">Receiving Date</span><p className="text-white">{selectedReceiving.receivingDate}</p></div>
                  <div><span className="text-slate-400">Prepared By</span><p className="text-white">{selectedReceiving.preparedBy ?? '—'}</p></div>
                  <div><span className="text-slate-400">Product</span><p className="text-white">{selectedReceiving.productSummary}</p></div>
                  <div><span className="text-slate-400">Quantity</span><p className="text-white">{selectedReceiving.eligibleQuantity} units</p></div>
                  <div><span className="text-slate-400">Status</span><div className="pt-1"><ReceivingStatusBadge status={selectedReceiving.status} /></div></div>
                  <div><span className="text-slate-400">Received Value</span><p className="text-white">₱{selectedReceiving.receivedValue.toLocaleString()}</p></div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#070a12] p-4">
                  <h4 className="text-sm font-semibold text-white mb-3">Products</h4>
                  <div className="space-y-3">
                    {selectedReceiving.items.map((item) => (
                      <div key={item.id} className="rounded-lg border border-slate-800 p-3">
                        <p className="text-white text-sm font-medium">{item.productName}</p>
                        <p className="text-xs text-slate-400 mt-1">Accepted Quantity: <span className="text-white">{item.acceptedQuantity} {item.unit}</span></p>
                        <p className="text-xs text-slate-400">Eligible Quantity: <span className="text-white">{item.stockableQuantity} {item.unit}</span></p>
                        {item.barcode && <p className="text-xs text-slate-400">Barcode: <span className="text-cyan-300 font-mono">{item.barcode}</span></p>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#070a12] p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-white">Quick Actions</h4>
                  <button
                    disabled={!canPerformStockIn || isStockingIn}
                    onClick={handlePerformStockIn}
                    className={`w-full py-2.5 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                      canPerformStockIn && !isStockingIn
                        ? 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950'
                        : 'bg-slate-700/50 text-slate-500 cursor-not-allowed opacity-50'
                    }`}
                  >
                    {isStockingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
                    {isStockingIn ? 'Stocking In...' : 'Perform Stock In'}
                  </button>
                  {!canPerformStockIn && (
                    <p className="text-xs text-amber-400 text-center">{selectedReceiving.eligibilityMessage}</p>
                  )}
                  <button
                    onClick={() => setDrawerMode(null)}
                    className="w-full py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800/50 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </>
            )}

            {drawerMode === 'stocked' && selectedStocked && (
              <div className="rounded-xl border border-slate-800 bg-[#070a12] p-4 space-y-3 text-sm">
                <div><span className="text-slate-400">Product</span><p className="text-white">{selectedStocked.product}</p></div>
                <div><span className="text-slate-400">Barcode</span><p className="text-cyan-300 font-mono">{selectedStocked.barcode ?? '—'}</p></div>
                <div><span className="text-slate-400">Warehouse</span><p className="text-white">{selectedStocked.warehouse}</p></div>
                <div><span className="text-slate-400">Quantity</span><p className="text-white">{selectedStocked.quantity} units</p></div>
                <div><span className="text-slate-400">Stock In Date</span><p className="text-white">{formatDateTime(selectedStocked.stockInDate)}</p></div>
                <div><span className="text-slate-400">Status</span><div className="pt-1"><ReceivingStatusBadge status={selectedStocked.status} /></div></div>
                <button
                  onClick={() => setDrawerMode(null)}
                  className="w-full mt-2 py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800/50 transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StockIn;
