// src/page/admin/PurchaseOrders.tsx
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { apiClient } from '../../lib/api';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAdminDetailOverlay } from '../../components/layout/AdminDetailOverlayContext';
import {
  Search,
  Plus,
  ChevronRight,
  Download,
  Printer,
  RefreshCw,
  Save,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Trash2,
  Eye,
  MoreVertical,
  X,
  Send,
  Clock,
  CheckCircle,
  AlertCircle,
  Package,
  Calendar,
  Building,
  LayoutGrid,
  LayoutList,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

type POStatus = 'Pending Approval' | 'Approved' | 'Sent to Supplier' | 'Partially Received' | 'Completed' | 'Closed with Shortage' | 'Cancelled';

interface PurchaseOrderItem { productName: string; quantity: number; receivedQuantity: number; remainingQuantity: number; unitPrice: number; amount: number; }
interface ReceivingHistory { id: number; receivingNo: string; deliveryDate: string; deliveredQuantity: number; status: string; }
type SupplierResponseCode = 'WILL_FULFILL' | 'WILL_NOT_FULFILL' | 'OTHER';
interface ReceivingDiscrepancy {
  id: number; receivingId: number; type: string; expectedQuantity: number; deliveredQuantity: number; shortQuantity: number; status: string;
  reportedAt?: string; reportedBy?: string; contactMethod?: string; contactNote?: string; contactedAt?: string; contactedBy?: string;
  supplierResponseCode?: SupplierResponseCode; responseNotes?: string; expectedBalanceDeliveryDate?: string; respondedAt?: string; respondedBy?: string;
  resolutionNotes?: string; resolvedAt?: string; resolvedBy?: string; resolvedByReceiving?: { id: number; receivingNo: string; deliveryDate?: string };
}
interface SupplierOption { id: number; supplier_code: string; name: string; }
interface PurchaseOrderSummary { total: number; pending: number; approved: number; completed: number; cancelled: number; }

const mapDiscrepancy = (item: any): ReceivingDiscrepancy => ({
  id: Number(item.id), receivingId: Number(item.receiving_id), type: item.type ?? item.discrepancy_type,
  expectedQuantity: Number(item.expected_quantity), deliveredQuantity: Number(item.delivered_quantity), shortQuantity: Number(item.short_quantity), status: item.status,
  reportedAt: item.reported_at, reportedBy: item.reported_by?.name ?? item.reported_by,
  contactMethod: item.contact_method, contactNote: item.contact_note, contactedAt: item.contacted_at, contactedBy: item.contacted_by?.name ?? item.contacted_by,
  supplierResponseCode: item.supplier_response_code, responseNotes: item.response_notes ?? item.supplier_response,
  expectedBalanceDeliveryDate: item.expected_balance_delivery_date, respondedAt: item.responded_at, respondedBy: item.responded_by?.name ?? item.responded_by,
  resolutionNotes: item.resolution_notes, resolvedAt: item.resolved_at, resolvedBy: item.resolved_by?.name ?? item.resolved_by,
  resolvedByReceiving: item.resolved_by_receiving ? { id: Number(item.resolved_by_receiving.id), receivingNo: item.resolved_by_receiving.receiving_no, deliveryDate: item.resolved_by_receiving.delivery_date } : undefined,
});

interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplier: string;
  expectedDeliveryDate: string;
  deliveryDetails: string;
  items: PurchaseOrderItem[];
  totalAmount: number;
  status: POStatus;
  createdAt: string;
  approvedBy?: string;
  signatureData?: string;
  sentAt?: string;
  receivingHistory: ReceivingHistory[];
  discrepancies: ReceivingDiscrepancy[];
}

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: POStatus; className?: string }> = ({ status, className = '' }) => {
  const config: Record<POStatus, { color: string; bg: string; border: string }> = {
    'Pending Approval': { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
    Approved: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    'Sent to Supplier': { color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
    'Partially Received': { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    Completed: { color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20' },
    'Closed with Shortage': { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
    Cancelled: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  };
  const { color, bg, border } = config[status] || config['Pending Approval'];
  return (
    <span className={`admin-badge inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${color} ${bg} ${border} ${className}`}>
      {status}
    </span>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const PurchaseOrders: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<POStatus | 'All'>('All');
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [pageFrom, setPageFrom] = useState(0);
  const [pageTo, setPageTo] = useState(0);
  const [summary, setSummary] = useState<PurchaseOrderSummary>({ total: 0, pending: 0, approved: 0, completed: 0, cancelled: 0 });
  const [productNames, setProductNames] = useState<string[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [supplierError, setSupplierError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState(false);
  useAdminDetailOverlay(showDetailsDrawer && selectedOrder !== null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [resolvingDiscrepancyId, setResolvingDiscrepancyId] = useState<number | null>(null);
  const [discrepancyDialog, setDiscrepancyDialog] = useState<{ item: ReceivingDiscrepancy; mode: 'contact' | 'response' | 'close' } | null>(null);
  const [discrepancyForm, setDiscrepancyForm] = useState({ contactMethod: 'PHONE', contactNote: '', responseCode: 'WILL_FULFILL' as SupplierResponseCode, responseNotes: '', expectedDate: '', closureReason: '' });
  const [discrepancyFormError, setDiscrepancyFormError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const [showHistory, setShowHistory] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [newOrder, setNewOrder] = useState({
    replenishmentRequestId: null as number | null,
    requestNo: '', warehouseLocation: '', supplierId: '', expectedDeliveryDate: '',
    deliveryDetails: '', signatureData: '', status: 'Approved' as POStatus,
    items: [{ productName: '', quantity: 1, unitPrice: 0 }],
  });

  const mapOrder = useCallback((order: any): PurchaseOrder => ({
    id: String(order.id), poNumber: order.po_number, supplier: order.supplier_name,
    expectedDeliveryDate: order.expected_delivery_date, deliveryDetails: order.delivery_details, totalAmount: Number(order.total_amount),
    status: order.status as POStatus, createdAt: order.created_at,
    approvedBy: order.approved_by, signatureData: order.signature_data, sentAt: order.sent_at,
    items: (order.items ?? []).map((item: any) => ({
      productName: item.product_name, quantity: Number(item.ordered_quantity), receivedQuantity: Number(item.received_quantity ?? 0), remainingQuantity: Number(item.remaining_quantity ?? item.ordered_quantity),
      unitPrice: Number(item.unit_price), amount: Number(item.total_price),
    })),
    receivingHistory: (order.receiving_history ?? []).map((receiving: any) => ({ id: Number(receiving.id), receivingNo: receiving.receiving_no, deliveryDate: receiving.delivery_date, deliveredQuantity: Number(receiving.delivered_quantity), status: receiving.status })),
    discrepancies: (order.discrepancies ?? []).map(mapDiscrepancy),
  }), []);

  useEffect(() => {
    const linkedRequest = (location.state as any)?.replenishmentRequest;
    if (!linkedRequest) return;
    setNewOrder({
      replenishmentRequestId: Number(linkedRequest.id),
      requestNo: linkedRequest.requestNo,
      warehouseLocation: linkedRequest.warehouseLocation,
      supplierId: '',
      expectedDeliveryDate: '',
      deliveryDetails: `Deliver to ${linkedRequest.warehouseLocation}`,
      signatureData: '',
      status: 'Approved',
      items: [{ productName: linkedRequest.productName, quantity: Number(linkedRequest.orderedQuantity), unitPrice: 0 }],
    });
    setShowCreateModal(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/purchase-orders', { params: {
        page: currentPage,
        per_page: 10,
        search: searchQuery.trim() || undefined,
        status: statusFilter === 'All' ? undefined : statusFilter,
      } });
      setOrders((response.data?.data ?? []).map(mapOrder));
      const responseLastPage = Math.max(1, Number(response.data?.last_page ?? 1));
      setTotalPages(responseLastPage);
      setTotalItems(Number(response.data?.total ?? 0));
      setPageFrom(Number(response.data?.from ?? 0));
      setPageTo(Number(response.data?.to ?? 0));
      setSummary(response.data?.summary ?? { total: 0, pending: 0, approved: 0, completed: 0, cancelled: 0 });
      if (currentPage > responseLastPage) setCurrentPage(responseLastPage);
      setError('');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to load purchase orders.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, mapOrder, searchQuery, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOrders(), 250);
    return () => window.clearTimeout(timer);
  }, [loadOrders]);

  useEffect(() => {
    apiClient.get('/inventory').then((response) => {
      const inventoryItems = (response.data?.data ?? []) as Array<{ product?: string }>;
      setProductNames([...new Set(inventoryItems.map((item) => item.product).filter((name): name is string => Boolean(name)))]);
    }).catch(() => setProductNames([]));
  }, []);

  const loadActiveSuppliers = useCallback(async () => {
    setLoadingSuppliers(true);
    setSupplierError('');
    try {
      const response = await apiClient.get('/suppliers', { params: { status: 'ACTIVE' } });
      setSupplierOptions(response.data?.data ?? []);
    } catch (requestError: any) {
      setSupplierOptions([]);
      setSupplierError(requestError?.response?.data?.message || 'Unable to load active suppliers.');
    } finally {
      setLoadingSuppliers(false);
    }
  }, []);

  useEffect(() => {
    if (showCreateModal) void loadActiveSuppliers();
  }, [showCreateModal, loadActiveSuppliers]);

  const paginationPages = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
    if (currentPage <= 3) return [1, 2, 3, 4, 5];
    if (currentPage >= totalPages - 2) return Array.from({ length: 5 }, (_, index) => totalPages - 4 + index);
    return Array.from({ length: 5 }, (_, index) => currentPage - 2 + index);
  }, [currentPage, totalPages]);

  const kpiCounts = {
    Pending: summary.pending,
    Approved: summary.approved,
    Completed: summary.completed,
    Cancelled: summary.cancelled,
  };

  const handleCreateOrder = async () => {
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/purchase-orders', {
        supplier_id: Number(newOrder.supplierId),
        replenishment_request_id: newOrder.replenishmentRequestId,
        expected_delivery_date: newOrder.expectedDeliveryDate,
        delivery_details: newOrder.deliveryDetails,
        status: newOrder.status,
        signature_data: newOrder.signatureData || null,
        items: newOrder.items.map((item) => ({ product_name: item.productName, ordered_quantity: item.quantity, unit_price: item.unitPrice })),
      });
      await loadOrders();
      setShowCreateModal(false);
      setNewOrder({ replenishmentRequestId: null, requestNo: '', warehouseLocation: '', supplierId: '', expectedDeliveryDate: '', deliveryDetails: '', signatureData: '', status: 'Approved', items: [{ productName: '', quantity: 1, unitPrice: 0 }] });
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Purchase order could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const resetNewOrder = () => setNewOrder({ replenishmentRequestId: null, requestNo: '', warehouseLocation: '', supplierId: '', expectedDeliveryDate: '', deliveryDetails: '', signatureData: '', status: 'Approved', items: [{ productName: '', quantity: 1, unitPrice: 0 }] });
  const closeCreateModal = () => { setShowCreateModal(false); resetNewOrder(); };

  const handleViewDetails = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setShowHistory(false);
    setShowDetailsDrawer(true);
  };

  const handleCloseDrawer = () => {
    setShowDetailsDrawer(false);
    setSelectedOrder(null);
    setShowHistory(false);
  };

  const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[character] || character);

  const openPrintablePo = (order: PurchaseOrder) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to print this Purchase Order.');
      return;
    }
    printWindow.opener = null;
    const rows = order.items.map((item) => `<tr><td>${escapeHtml(item.productName)}</td><td class="number">${item.quantity}</td><td class="number">₱${item.unitPrice.toLocaleString()}</td><td class="number">₱${item.amount.toLocaleString()}</td></tr>`).join('');
    printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(order.poNumber)}</title><style>body{font-family:Arial,sans-serif;color:#111827;margin:40px}header{display:flex;justify-content:space-between;border-bottom:2px solid #0891b2;padding-bottom:16px}h1{margin:0}.meta{margin:24px 0;display:grid;grid-template-columns:1fr 1fr;gap:10px}.label{color:#64748b;font-size:12px;text-transform:uppercase}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #cbd5e1;padding:10px;text-align:left}th{background:#f1f5f9}.number{text-align:right}.total{text-align:right;font-size:18px;font-weight:700;margin-top:18px}.signature{margin-top:60px;width:260px;border-top:1px solid #111827;padding-top:8px}@media print{body{margin:20mm}}</style></head><body><header><div><h1>Purchase Order</h1><p>${escapeHtml(order.poNumber)}</p></div><strong>${escapeHtml(order.status)}</strong></header><section class="meta"><div><div class="label">Supplier</div>${escapeHtml(order.supplier)}</div><div><div class="label">Created Date</div>${escapeHtml(order.createdAt)}</div><div><div class="label">Expected Delivery</div>${escapeHtml(order.expectedDeliveryDate)}</div><div><div class="label">Delivery Details</div>${escapeHtml(order.deliveryDetails)}</div></section><table><thead><tr><th>Product</th><th class="number">Qty</th><th class="number">Unit Price</th><th class="number">Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="total">Total Amount: ₱${order.totalAmount.toLocaleString()}</div><div class="signature">Approved by: ${escapeHtml(order.approvedBy || 'Electronic approval')}<br>${order.signatureData ? 'Signature recorded' : 'Electronically approved'}</div><script>window.onload=()=>{window.print();}</script></body></html>`);
    printWindow.document.close();
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    window.clearTimeout(toastTimer.current);
    setToast({ type, message });
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  };

  const openDiscrepancyDialog = (item: ReceivingDiscrepancy, mode: 'contact' | 'response' | 'close') => {
    setDiscrepancyForm({ contactMethod: item.contactMethod || 'PHONE', contactNote: '', responseCode: item.supplierResponseCode || 'WILL_FULFILL', responseNotes: '', expectedDate: item.expectedBalanceDeliveryDate || '', closureReason: '' });
    setDiscrepancyFormError('');
    setDiscrepancyDialog({ item, mode });
  };

  const handleDiscrepancyAction = async () => {
    if (!discrepancyDialog) return;
    const { item, mode } = discrepancyDialog;
    if (mode === 'response' && discrepancyForm.responseCode !== 'WILL_FULFILL' && !discrepancyForm.responseNotes.trim()) {
      setDiscrepancyFormError('Response notes are required for this response.');
      return;
    }
    if (mode === 'close' && !discrepancyForm.closureReason.trim()) {
      setDiscrepancyFormError('A closure reason is required.');
      return;
    }
    const action = mode === 'contact' ? 'CONTACT_SUPPLIER' : mode === 'response' ? 'RECORD_RESPONSE' : 'CLOSE_SHORTAGE';
    setResolvingDiscrepancyId(item.id);
    setDiscrepancyFormError('');
    try {
      const payload = mode === 'contact'
        ? { action, contact_method: discrepancyForm.contactMethod, contact_note: discrepancyForm.contactNote.trim() || undefined }
        : mode === 'response'
          ? { action, supplier_response_code: discrepancyForm.responseCode, response_notes: discrepancyForm.responseNotes.trim() || undefined, expected_balance_delivery_date: discrepancyForm.responseCode === 'WILL_FULFILL' ? discrepancyForm.expectedDate || undefined : undefined }
          : { action, resolution_notes: discrepancyForm.closureReason.trim() };
      const response = await apiClient.patch(`/admin/receiving-discrepancies/${item.id}`, payload);
      const updated = mapDiscrepancy(response.data);
      setSelectedOrder((current) => current ? {
        ...current,
        status: action === 'CLOSE_SHORTAGE' ? 'Closed with Shortage' : 'Partially Received',
        discrepancies: current.discrepancies.map((value) => value.id === item.id ? updated : value),
      } : current);
      setOrders((current) => current.map((order) => order.id === selectedOrder?.id ? {
        ...order,
        status: action === 'CLOSE_SHORTAGE' ? 'Closed with Shortage' : 'Partially Received',
        discrepancies: order.discrepancies.map((value) => value.id === item.id ? updated : value),
      } : order));
      setDiscrepancyDialog(null);
      showToast('success', mode === 'contact' ? 'Supplier contact recorded.' : mode === 'response' ? 'Supplier response recorded.' : 'Shortage case closed.');
      if (action === 'CLOSE_SHORTAGE') await loadOrders();
    } catch (requestError: any) {
      const validationMessage = Object.values(requestError?.response?.data?.errors ?? {}).flat().find(Boolean);
      setDiscrepancyFormError(String(validationMessage || requestError?.response?.data?.message || 'Unable to update the discrepancy.'));
    } finally {
      setResolvingDiscrepancyId(null);
    }
  };

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // Blob responses hide the JSON error body; read it back for a safe message.
  const blobErrorMessage = async (requestError: any, fallback: string) => {
    try {
      const data = requestError?.response?.data;
      const parsed = data instanceof Blob ? JSON.parse(await data.text()) : data;
      return parsed?.message || fallback;
    } catch {
      return fallback;
    }
  };

  // The same server-rendered PDF that is emailed to the supplier.
  const downloadPoPdf = async (order: PurchaseOrder) => {
    if (downloadingId !== null) return;
    setDownloadingId(order.id);
    try {
      const response = await apiClient.get(`/purchase-orders/${order.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${order.poNumber.replace(/[^A-Za-z0-9._-]+/g, '_') || 'purchase-order'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (requestError: any) {
      showToast('error', await blobErrorMessage(requestError, 'The Purchase Order PDF could not be downloaded.'));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSendToSupplier = async (order: PurchaseOrder) => {
    if (sending) return;
    setSending(true);
    try {
      const response = await apiClient.patch(`/purchase-orders/${order.id}/send`);
      const updated = { ...order, status: response.data.status as POStatus, sentAt: response.data.sent_at };
      setOrders((current) => current.map((value) => value.id === order.id ? updated : value));
      setSelectedOrder(updated);
      showToast('success', response.data?.message || 'Purchase order sent to supplier successfully.');
    } catch (requestError: any) {
      showToast('error', requestError?.response?.data?.message || 'Purchase Order could not be sent.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#0a0e17] text-slate-100 p-4 md:p-6 space-y-6 overflow-x-hidden">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span>Admin</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-100">Purchase Orders</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Purchase Order Management</h1>
          <p className="text-sm text-gray-400">
            Create approved purchase orders, track delivery targets, and review order totals.
          </p>
        </div>

      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-yellow-400">
            <Clock className="w-4 h-4" />
            <span className="admin-kpi-title text-xs font-medium uppercase tracking-wider">Pending</span>
          </div>
          <p className="admin-kpi-value text-2xl font-bold text-white mt-1">{kpiCounts.Pending}</p>
          <p className="admin-kpi-helper text-xs text-gray-400">Awaiting approval</p>
        </div>
        <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            <span className="admin-kpi-title text-xs font-medium uppercase tracking-wider">Approved</span>
          </div>
          <p className="admin-kpi-value text-2xl font-bold text-white mt-1">{kpiCounts.Approved}</p>
          <p className="admin-kpi-helper text-xs text-gray-400">Ready for supplier</p>
        </div>
        <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-indigo-400">
            <Package className="w-4 h-4" />
            <span className="admin-kpi-title text-xs font-medium uppercase tracking-wider">Total POs</span>
          </div>
          <p className="admin-kpi-value text-2xl font-bold text-white mt-1">{summary.total}</p>
          <p className="admin-kpi-helper text-xs text-gray-400">Saved purchase orders</p>
        </div>
        <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-teal-400">
            <Package className="w-4 h-4" />
            <span className="admin-kpi-title text-xs font-medium uppercase tracking-wider">Completed</span>
          </div>
          <p className="admin-kpi-value text-2xl font-bold text-white mt-1">{kpiCounts.Completed}</p>
          <p className="admin-kpi-helper text-xs text-gray-400">Fully received</p>
        </div>
        <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-red-400">
            <X className="w-4 h-4" />
            <span className="admin-kpi-title text-xs font-medium uppercase tracking-wider">Cancelled</span>
          </div>
          <p className="admin-kpi-value text-2xl font-bold text-white mt-1">{kpiCounts.Cancelled}</p>
          <p className="admin-kpi-helper text-xs text-gray-400">Cancelled orders</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl p-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 min-w-0 sm:flex-1 sm:min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search PO number, supplier..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full bg-[#1e293b] border border-[#1f2937] rounded-xl pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as POStatus | 'All'); setCurrentPage(1); }}
          className="w-full min-w-0 bg-[#1e293b] border border-[#1f2937] rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:w-auto"
        >
          <option value="All">All Status</option>
          <option value="Pending Approval">Pending Approval</option>
          <option value="Approved">Approved</option>
          <option value="Sent to Supplier">Sent to Supplier</option>
          <option value="Partially Received">Partially Received</option>
        </select>
        <div className="flex min-w-0 items-center gap-2 bg-[#1e293b] border border-[#1f2937] rounded-xl px-3 py-2 text-sm text-slate-300">
          <Calendar className="w-4 h-4 shrink-0 text-gray-400" />
          <span className="truncate">Date Range</span>
          <ChevronRightIcon className="w-4 h-4 shrink-0 text-gray-400 max-sm:ml-auto" />
        </div>
        {/* Mobile: the view toggle dissolves (display: contents) so List, Grid, Refresh and Download share one 4-column row. */}
        <div className="admin-po-toolbar-actions col-span-2 grid grid-cols-4 gap-2 sm:ml-auto sm:flex sm:items-center sm:gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-[#1f2937] bg-[#1e293b] p-1 max-sm:contents" aria-label="Purchase order view">
            <button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} title="List view" className={`admin-po-toolbar-view-button rounded-md border-[#1f2937] p-1.5 transition-colors max-sm:flex max-sm:items-center max-sm:justify-center max-sm:rounded-xl max-sm:border max-sm:aria-pressed:border-cyan-400/40 ${viewMode === 'list' ? 'bg-slate-200 text-slate-900 dark:bg-[#092635] dark:text-white' : 'text-gray-400 hover:text-white'}`}><LayoutList className="h-4 w-4" /></button>
            <button type="button" onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} title="Grid view" className={`admin-po-toolbar-view-button rounded-md border-[#1f2937] p-1.5 transition-colors max-sm:flex max-sm:items-center max-sm:justify-center max-sm:rounded-xl max-sm:border max-sm:aria-pressed:border-cyan-400/40 ${viewMode === 'grid' ? 'bg-slate-200 text-slate-900 dark:bg-[#092635] dark:text-white' : 'text-gray-400 hover:text-white'}`}><LayoutGrid className="h-4 w-4" /></button>
          </div>
          <button onClick={() => void loadOrders()} disabled={loading} className="p-2 rounded-xl border border-[#1f2937] text-gray-400 hover:bg-slate-800/50 transition-colors disabled:opacity-50 max-sm:flex max-sm:h-11 max-sm:w-full max-sm:items-center max-sm:justify-center">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button className="p-2 rounded-xl border border-[#1f2937] text-gray-400 hover:bg-slate-800/50 transition-colors max-sm:flex max-sm:h-11 max-sm:w-full max-sm:items-center max-sm:justify-center">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

      {/* Table */}
      <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl overflow-hidden">
        {viewMode === 'list' ? (
        <div className="admin-table-scroll">
          <table className="admin-responsive-table admin-cols-9 admin-sticky-1 w-full min-w-[900px] table-auto">
            <thead className="bg-[#1e293b]/50 border-b border-[#1f2937]">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">PO No.</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400 w-auto min-w-[200px]">Supplier</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Created Date</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Target / Delivery Details</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Items / Total Qty</th>
                <th className="px-5 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Total Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-36">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Signature / Approved</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-[#1f2937] hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3.5 text-sm font-medium text-white">{order.poNumber}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-300 w-auto min-w-[200px]">{order.supplier}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-300">{order.createdAt}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-300 max-w-[240px]" title={order.deliveryDetails}><span className="block text-white">{order.expectedDeliveryDate}</span><span className="block truncate">{order.deliveryDetails}</span></td>
                  <td className="px-5 py-3.5 text-sm text-gray-300">{order.items.length} / {order.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
                  <td className="px-5 py-3.5 text-right text-sm text-white">₱{order.totalAmount.toLocaleString()}</td>
                  <td className="px-4 py-3 whitespace-nowrap w-36"><StatusBadge status={order.status} /></td>
                  <td className="px-4 py-3 text-sm text-gray-300">{order.approvedBy || '—'}{order.signatureData ? ' · Signed' : ''}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-center w-28">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleViewDetails(order)}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => void downloadPoPdf(order)}
                        disabled={downloadingId !== null}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        title="Download PO"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openPrintablePo(order)}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        title="Print PO"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleViewDetails(order)}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        title="More options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-gray-400">
                    No purchase orders found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        ) : orders.length > 0 ? (
          <div className="grid min-w-0 grid-cols-1 gap-3 p-3 sm:gap-4 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
            {orders.map((order) => (
              <article key={order.id} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-start justify-between gap-2.5 sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-sm font-semibold leading-5 text-slate-900 sm:text-base sm:leading-normal dark:text-white">{order.poNumber}</h3>
                    <p className="mt-0.5 break-words text-[13px] leading-4 text-slate-600 sm:mt-1 sm:text-sm sm:leading-normal dark:text-slate-300">{order.supplier}</p>
                  </div>
                  <StatusBadge status={order.status} className="w-fit shrink-0 whitespace-nowrap text-xs" />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:mt-4 sm:gap-3">
                  <div className="min-w-0"><dt className="text-xs leading-4 text-slate-500 sm:text-sm sm:leading-normal dark:text-slate-400">Created</dt><dd className="break-words text-[13px] leading-4 text-slate-900 sm:text-sm sm:leading-normal dark:text-white">{order.createdAt}</dd></div>
                  <div className="min-w-0"><dt className="text-xs leading-4 text-slate-500 sm:text-sm sm:leading-normal dark:text-slate-400">Target</dt><dd className="break-words text-[13px] leading-4 text-slate-900 sm:text-sm sm:leading-normal dark:text-white">{order.expectedDeliveryDate}</dd></div>
                  <div className="min-w-0"><dt className="text-xs leading-4 text-slate-500 sm:text-sm sm:leading-normal dark:text-slate-400">Items / Qty</dt><dd className="text-[13px] leading-4 text-slate-900 sm:text-sm sm:leading-normal dark:text-white">{order.items.length} / {order.items.reduce((sum, item) => sum + item.quantity, 0)}</dd></div>
                  <div className="min-w-0"><dt className="text-xs leading-4 text-slate-500 sm:text-sm sm:leading-normal dark:text-slate-400">Total</dt><dd className="break-words text-[13px] font-semibold leading-4 text-slate-900 sm:text-sm sm:leading-normal dark:text-white">₱{order.totalAmount.toLocaleString()}</dd></div>
                </dl>
                <p className="mt-2.5 whitespace-normal break-words text-xs leading-4 text-slate-500 sm:mt-3 sm:truncate dark:text-slate-400" title={order.deliveryDetails}>{order.deliveryDetails}</p>
                <div className="mt-3 flex justify-end gap-1 border-t border-slate-200 pt-2.5 sm:mt-auto sm:pt-3 dark:border-slate-700"><button onClick={() => handleViewDetails(order)} className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" title="View Details"><Eye className="h-4 w-4" /></button><button onClick={() => void downloadPoPdf(order)} disabled={downloadingId !== null} className="p-2 text-slate-500 hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:text-white" title="Download PO"><Download className="h-4 w-4" /></button><button onClick={() => openPrintablePo(order)} className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" title="Print PO"><Printer className="h-4 w-4" /></button></div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-gray-400">No purchase orders found matching your criteria.</div>
        )}
        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#1f2937] bg-white dark:bg-[#0f172a]/30">
          <div className="text-sm text-gray-400">
            Showing <span className="text-white font-medium">{pageFrom}</span> to{' '}
            <span className="text-white font-medium">{pageTo}</span> of{' '}
            <span className="text-white font-medium">{totalItems}</span> entries
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} aria-label="Previous page" className="p-1.5 rounded-xl border border-[#1f2937] text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#1f2937] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {paginationPages.map((page) => (
              <button key={page} type="button" onClick={() => setCurrentPage(page)} aria-current={currentPage === page ? 'page' : undefined} className={`px-3 py-1 rounded-xl text-sm font-medium ${currentPage === page ? 'bg-slate-200 text-slate-900 dark:bg-cyan-500 dark:text-slate-950' : 'text-gray-400 hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-[#1f2937] dark:hover:text-white'}`}>{page}</button>
            ))}
            <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} aria-label="Next page" className="p-1.5 rounded-xl border border-[#1f2937] text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#1f2937] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* DETAILS DRAWER */}
      {/* ============================================ */}
      {showDetailsDrawer && selectedOrder && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="min-w-0 flex-1 bg-black/60 backdrop-blur-sm" onClick={handleCloseDrawer}></div>
          <div className="admin-po-details-drawer h-full w-[96vw] shrink-0 overflow-x-hidden overflow-y-auto overscroll-y-contain border-l border-[#1f2937] bg-[#0f172a] p-3 animate-in slide-in-from-right duration-300 min-[400px]:w-[92vw] sm:w-[600px] sm:p-6">
            {/* Header */}
            <div className="admin-po-details-header sticky top-0 z-10 -mx-3 -mt-3 mb-4 flex items-start justify-between gap-2 bg-[#0f172a] px-3 py-3 sm:static sm:mx-0 sm:mt-0 sm:mb-6 sm:bg-transparent sm:p-0">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                  <h2 className="admin-po-details-title min-w-0 text-base font-bold leading-tight text-white sm:text-xl">{selectedOrder.poNumber}</h2>
                  <StatusBadge status={selectedOrder.status} />
                </div>
                <p className="admin-po-details-supplier mt-1 break-words text-xs text-gray-400 sm:mt-0 sm:text-sm">Supplier: {selectedOrder.supplier}</p>
              </div>
              <button aria-label="Close purchase order details" onClick={handleCloseDrawer} className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 dark:hover:bg-slate-700 dark:hover:text-white sm:min-h-0 sm:min-w-0 sm:p-1.5">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* PO Info Grid */}
            <div className="admin-po-details-info mb-4 grid grid-cols-1 gap-3 rounded-xl border border-[#1f2937] bg-[#1e293b]/30 p-3 text-xs min-[360px]:grid-cols-2 sm:mb-6 sm:gap-4 sm:p-4 sm:text-sm">
              <div><span className="text-gray-400">Created Date</span><p className="whitespace-nowrap text-white">{selectedOrder.createdAt}</p></div>
              <div><span className="text-gray-400">Expected Delivery</span><p className="whitespace-nowrap text-white">{selectedOrder.expectedDeliveryDate}</p></div>
              <div className="min-[360px]:col-span-2 sm:col-span-1"><span className="text-gray-400">Approved By</span><p className="break-words text-white">{selectedOrder.approvedBy || '—'}</p></div>
              <div className="min-[360px]:col-span-2"><span className="text-gray-400">Delivery Details</span><p className="break-words text-white">{selectedOrder.deliveryDetails}</p></div>
              <div className="min-[360px]:col-span-2"><span className="text-gray-400">Signature</span><p className="break-words text-white">{selectedOrder.signatureData ? 'Signature recorded' : 'Approved electronically'}</p></div>
            </div>

            {/* Supplier Info */}
            <div className="admin-po-details-supplier-card mb-4 rounded-xl border border-[#1f2937] bg-[#1e293b]/30 p-3 sm:mb-6 sm:p-4">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-white sm:text-sm">
                <Building className="w-4 h-4 text-cyan-400" /> Supplier Information
              </h3>
              <p className="break-words text-xs text-white sm:text-sm">{selectedOrder.supplier}</p>
            </div>

            {/* Items Table */}
            <div className="admin-po-details-items mb-4 sm:mb-6">
              <h3 className="mb-2 text-xs font-semibold text-white sm:text-sm">Items</h3>
              <div className="space-y-2 sm:hidden">
                {selectedOrder.items.map((item, idx) => (
                  <article key={idx} className="min-w-0 rounded-xl border border-[#1f2937] bg-[#1e293b]/30 p-3">
                    <h4 className="break-words text-[13px] font-semibold leading-4 text-white" title={item.productName}>{item.productName}</h4>
                    <dl className="mt-2 grid grid-cols-3 gap-2">
                      <div className="min-w-0">
                        <dt className="text-xs leading-4 text-slate-400">Ordered</dt>
                        <dd className="text-[13px] font-medium leading-4 text-white">{item.quantity}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs leading-4 text-slate-400">Received</dt>
                        <dd className="text-[13px] font-medium leading-4 text-white">{item.receivedQuantity}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs leading-4 text-slate-400">Remaining</dt>
                        <dd className="text-[13px] font-medium leading-4 text-white">{item.remainingQuantity}</dd>
                      </div>
                    </dl>
                    <dl className="mt-2 grid grid-cols-2 gap-2 border-t border-[#1f2937] pt-2">
                      <div className="min-w-0">
                        <dt className="text-xs leading-4 text-slate-400">Unit Price</dt>
                        <dd className="whitespace-nowrap text-[13px] font-medium leading-4 text-white">₱{item.unitPrice.toLocaleString()}</dd>
                      </div>
                      <div className="min-w-0 text-right">
                        <dt className="text-xs leading-4 text-slate-400">Amount</dt>
                        <dd className="whitespace-nowrap text-[13px] font-semibold leading-4 text-white">₱{item.amount.toLocaleString()}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
                <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-[#1f2937] bg-[#1e293b]/30 p-3">
                  <span className="text-xs font-semibold leading-4 text-white">Total Amount</span>
                  <span className="min-w-0 whitespace-nowrap text-right text-sm font-bold leading-5 text-cyan-400">₱{selectedOrder.totalAmount.toLocaleString()}</span>
                </div>
              </div>
              <div className="admin-po-details-items-scroll admin-table-scroll hidden sm:block">
                <table className="admin-po-details-items-table admin-responsive-table admin-cols-4 admin-sticky-1 w-full min-w-[420px] text-xs sm:min-w-0 sm:text-sm">
                  <thead className="border-b border-[#1f2937]">
                    <tr className="text-gray-400 text-xs uppercase">
                      <th className="w-[40%] px-2 py-2 text-left sm:px-3">Product</th>
                      <th className="w-[12%] px-2 py-2 text-right sm:px-3">Ordered</th>
                      <th className="w-[24%] px-2 py-2 text-right sm:px-3">Unit Price</th>
                      <th className="w-[24%] px-2 py-2 text-right sm:px-3">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items.map((item, idx) => (
                      <tr key={idx} className="border-b border-[#1f2937]">
                        <td className="px-2 py-2 text-gray-300 sm:px-3">{item.productName}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right text-white sm:px-3"><span className="block">{item.quantity}</span><span className="block text-[10px] font-normal text-slate-400">Received {item.receivedQuantity} / Remaining {item.remainingQuantity}</span></td>
                        <td className="whitespace-nowrap px-2 py-2 text-right text-white sm:px-3">₱{item.unitPrice.toLocaleString()}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right text-white sm:px-3">₱{item.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-[#1f2937] font-medium">
                    <tr className="text-sm sm:text-lg"><td colSpan={3} className="px-2 py-2 text-right font-bold text-white sm:px-3">Total Amount</td><td className="whitespace-nowrap px-2 py-2 text-right font-bold text-cyan-400 sm:px-3">₱{selectedOrder.totalAmount.toLocaleString()}</td></tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {(selectedOrder.receivingHistory.length > 0 || selectedOrder.discrepancies.length > 0) && (
              <div className="mb-4 grid gap-4 sm:mb-6 sm:grid-cols-2">
                <section className="rounded-xl border border-[#1f2937] bg-[#1e293b]/30 p-3 sm:p-4" aria-label="Receiving history">
                  <h3 className="mb-3 text-xs font-semibold text-white sm:text-sm">Receiving History</h3>
                  <ul className="space-y-2 text-xs">
                    {selectedOrder.receivingHistory.map((receiving) => <li key={receiving.id} className="rounded-lg border border-slate-700 p-2"><div className="flex justify-between gap-2"><span className="font-medium text-cyan-300">{receiving.receivingNo}</span><span className="text-white">{receiving.deliveredQuantity} delivered</span></div><p className="mt-1 text-slate-400">{receiving.deliveryDate} · {receiving.status}</p></li>)}
                  </ul>
                </section>
                <section className="rounded-xl border border-[#1f2937] bg-[#1e293b]/30 p-3 sm:p-4" aria-label="Receiving discrepancies">
                  <h3 className="mb-3 text-xs font-semibold text-white sm:text-sm">Receiving Discrepancies</h3>
                  <ul className="space-y-2 text-xs">
                    {selectedOrder.discrepancies.map((item) => (
                      <li key={item.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                        <div className="flex justify-between gap-2"><span className="font-medium text-amber-700 dark:text-amber-300">Short Delivery</span><span className="text-slate-900 dark:text-white">{item.shortQuantity} short</span></div>
                        <p className="mt-1 font-medium text-slate-600 dark:text-slate-400">{item.status.replaceAll('_', ' ')}</p>
                        <ol className="mt-3 space-y-3 border-l border-slate-300 pl-3 text-slate-700 dark:border-slate-700 dark:text-slate-300" aria-label="Short delivery activity">
                          <li><p className="font-semibold text-slate-900 dark:text-white">Short delivery detected</p><p>{item.reportedAt ? new Date(item.reportedAt).toLocaleString() : 'Recorded'}{item.reportedBy ? ` by ${item.reportedBy}` : ''}</p><p>Ordered: {item.expectedQuantity} · Delivered: {item.deliveredQuantity} · Short: {item.shortQuantity}</p></li>
                          {item.contactedAt && <li><p className="font-semibold text-slate-900 dark:text-white">Supplier contacted</p><p>{new Date(item.contactedAt).toLocaleString()}{item.contactedBy ? ` by ${item.contactedBy}` : ''}</p><p>Method: {item.contactMethod?.replaceAll('_', ' ')}</p>{item.contactNote && <p>Note: {item.contactNote}</p>}</li>}
                          {item.respondedAt && <li><p className="font-semibold text-slate-900 dark:text-white">Supplier response recorded</p><p>{new Date(item.respondedAt).toLocaleString()}{item.respondedBy ? ` by ${item.respondedBy}` : ''}</p><p>Response: {item.supplierResponseCode?.replaceAll('_', ' ')}</p>{item.expectedBalanceDeliveryDate && <p>Expected delivery: {new Date(`${item.expectedBalanceDeliveryDate}T00:00:00`).toLocaleDateString()}</p>}{item.responseNotes && <p>Note: {item.responseNotes}</p>}</li>}
                          {item.resolvedByReceiving && <li><p className="font-semibold text-slate-900 dark:text-white">Balance delivery received</p><p>{item.resolvedByReceiving.receivingNo} · {item.resolvedByReceiving.deliveryDate || 'Delivery recorded'}</p></li>}
                          {item.resolvedAt && <li><p className="font-semibold text-slate-900 dark:text-white">{item.status === 'CLOSED_WITH_SHORTAGE' ? 'Case closed with shortage' : 'Discrepancy resolved'}</p><p>{new Date(item.resolvedAt).toLocaleString()}{item.resolvedBy ? ` by ${item.resolvedBy}` : ''}</p>{item.resolutionNotes && <p>Reason: {item.resolutionNotes}</p>}</li>}
                        </ol>
                        {!['RESOLVED', 'CLOSED_WITH_SHORTAGE'].includes(item.status) && <div className="mt-3 grid gap-2">
                          {['REPORTED', 'SUPPLIER_CONTACTED', 'AWAITING_SUPPLIER_RESPONSE'].includes(item.status) && <button type="button" disabled={resolvingDiscrepancyId !== null} onClick={() => openDiscrepancyDialog(item, 'contact')} className="min-h-11 cursor-pointer rounded-lg border border-slate-300 bg-white px-2 text-slate-800 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-700">Contact Supplier</button>}
                          {['SUPPLIER_CONTACTED', 'AWAITING_SUPPLIER_RESPONSE', 'AWAITING_BALANCE_DELIVERY', 'UNDER_RESOLUTION'].includes(item.status) && <button type="button" disabled={resolvingDiscrepancyId !== null} onClick={() => openDiscrepancyDialog(item, 'response')} className="min-h-11 cursor-pointer rounded-lg border border-cyan-600/50 px-2 text-cyan-700 transition-colors hover:bg-cyan-500/10 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-cyan-300">Record Supplier Response</button>}
                          {item.supplierResponseCode === 'WILL_NOT_FULFILL' && <button type="button" disabled={resolvingDiscrepancyId !== null} onClick={() => openDiscrepancyDialog(item, 'close')} className="min-h-11 cursor-pointer rounded-lg border border-orange-500/50 px-2 text-orange-700 transition-colors hover:bg-orange-500/10 focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-orange-300">Close Case</button>}
                        </div>}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}

            {/* Action Buttons */}
            <div className="admin-po-details-actions grid grid-cols-1 gap-2 border-t border-[#1f2937] pt-3 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap sm:pt-4">
              <button onClick={() => openPrintablePo(selectedOrder)} className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-2 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-300 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 sm:flex-1 sm:gap-2 sm:px-0 sm:text-[13px]">
                <Printer className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="admin-po-action-label">Print PO</span>
              </button>
              <button onClick={() => void downloadPoPdf(selectedOrder)} disabled={downloadingId !== null} aria-busy={downloadingId === selectedOrder.id} className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[#1f2937] px-2 py-2 text-xs font-medium text-gray-300 transition-colors hover:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 sm:flex-1 sm:gap-2 sm:px-0 sm:text-[13px]">
                <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="admin-po-action-label">{downloadingId === selectedOrder.id ? 'Preparing PDF…' : 'Download PO (PDF)'}</span>
              </button>
              <button onClick={() => void handleSendToSupplier(selectedOrder)} disabled={sending} aria-busy={sending} className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-cyan-500/50 px-2 py-2 text-xs font-medium text-cyan-400 transition-colors hover:bg-cyan-500/10 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-1 sm:gap-2 sm:px-0 sm:text-[13px]">
                <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="admin-po-action-label">{sending ? 'Sending…' : selectedOrder.status === 'Sent to Supplier' ? 'Resend PO to Supplier' : 'Send PO to Supplier'}</span>
              </button>
              <button onClick={() => setShowHistory((visible) => !visible)} aria-expanded={showHistory} className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[#1f2937] px-2 py-2 text-xs font-medium text-gray-300 transition-colors hover:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 sm:flex-1 sm:gap-2 sm:px-0 sm:text-[13px]">
                <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="admin-po-action-label">{showHistory ? 'Hide History' : 'View History'}</span>
              </button>
            </div>
            {showHistory && (
              <section className="mt-4 rounded-xl border border-[#1f2937] bg-[#1e293b]/30 p-3 sm:p-4" aria-label="Purchase Order history">
                <h3 className="mb-3 text-xs font-semibold text-white sm:text-sm">Audit History</h3>
                <ol className="space-y-3 border-l border-slate-700 pl-4 text-xs sm:text-sm">
                  <li><p className="font-medium text-white">Purchase Order created</p><p className="text-gray-400">{selectedOrder.createdAt}</p></li>
                  {selectedOrder.approvedBy && <li><p className="font-medium text-white">Approved by {selectedOrder.approvedBy}</p><p className="text-gray-400">{selectedOrder.createdAt}</p></li>}
                  {selectedOrder.sentAt && <li><p className="font-medium text-cyan-300">Sent to supplier</p><p className="text-gray-400">{new Date(selectedOrder.sentAt).toLocaleString()}</p></li>}
                </ol>
              </section>
            )}
          </div>
        </div>
      )}

      {discrepancyDialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="discrepancy-dialog-title">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="discrepancy-dialog-title" className="text-lg font-semibold text-slate-900 dark:text-white">{discrepancyDialog.mode === 'contact' ? 'Contact Supplier' : discrepancyDialog.mode === 'response' ? 'Record Supplier Response' : 'Close Shortage Case'}</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Short delivery of {discrepancyDialog.item.shortQuantity} unit(s).</p></div>
              <button type="button" onClick={() => setDiscrepancyDialog(null)} disabled={resolvingDiscrepancyId !== null} aria-label="Close dialog" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 space-y-4">
              {discrepancyDialog.mode === 'contact' && <>
                <div><label htmlFor="contact-method" className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-200">Contact method</label><select id="contact-method" value={discrepancyForm.contactMethod} onChange={(event) => setDiscrepancyForm({ ...discrepancyForm, contactMethod: event.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-600/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="PHONE">Phone</option><option value="EMAIL">Email</option><option value="OTHER">Other</option></select></div>
                <div><label htmlFor="contact-note" className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-200">Contact note <span className="font-normal text-slate-500">(optional)</span></label><textarea id="contact-note" rows={3} value={discrepancyForm.contactNote} onChange={(event) => setDiscrepancyForm({ ...discrepancyForm, contactNote: event.target.value })} placeholder="How the supplier was contacted" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-600/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400" /></div>
              </>}
              {discrepancyDialog.mode === 'response' && <>
                <div><label htmlFor="supplier-response" className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-200">Supplier response</label><select id="supplier-response" value={discrepancyForm.responseCode} onChange={(event) => setDiscrepancyForm({ ...discrepancyForm, responseCode: event.target.value as SupplierResponseCode, expectedDate: event.target.value === 'WILL_FULFILL' ? discrepancyForm.expectedDate : '' })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-600/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="WILL_FULFILL">Will Fulfill Remaining Balance</option><option value="WILL_NOT_FULFILL">Will Not Fulfill Remaining Balance</option><option value="OTHER">Other / Under Negotiation</option></select></div>
                <div><label htmlFor="response-notes" className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-200">Response notes {discrepancyForm.responseCode !== 'WILL_FULFILL' && '*'}</label><textarea id="response-notes" rows={3} value={discrepancyForm.responseNotes} onChange={(event) => setDiscrepancyForm({ ...discrepancyForm, responseNotes: event.target.value })} placeholder="Record the supplier's response" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-600/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400" /></div>
                {discrepancyForm.responseCode === 'WILL_FULFILL' && <div><label htmlFor="expected-balance-date" className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-200">Expected delivery date <span className="font-normal text-slate-500">(optional)</span></label><input id="expected-balance-date" type="date" min={new Date().toISOString().slice(0, 10)} value={discrepancyForm.expectedDate} onChange={(event) => setDiscrepancyForm({ ...discrepancyForm, expectedDate: event.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-600/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></div>}
              </>}
              {discrepancyDialog.mode === 'close' && <div><label htmlFor="closure-reason" className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-200">Closure reason *</label><textarea id="closure-reason" rows={4} value={discrepancyForm.closureReason} onChange={(event) => setDiscrepancyForm({ ...discrepancyForm, closureReason: event.target.value })} placeholder="Explain why the balance will remain unfulfilled" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-600/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400" /></div>}
              {discrepancyFormError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{discrepancyFormError}</p>}
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700"><button type="button" onClick={() => setDiscrepancyDialog(null)} disabled={resolvingDiscrepancyId !== null} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button><button type="button" onClick={() => void handleDiscrepancyAction()} disabled={resolvingDiscrepancyId !== null} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">{resolvingDiscrepancyId !== null ? 'Saving…' : discrepancyDialog.mode === 'close' ? 'Close Case' : 'Save'}</button></div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* CREATE PO MODAL */}
      {/* ============================================ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="admin-create-po-modal bg-[#0f172a] border border-[#1f2937] rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <div className="admin-create-po-header flex items-center justify-between mb-6">
              <h2 className="admin-create-po-title text-xl font-bold text-white">Create New Purchase Order</h2>
              <button onClick={closeCreateModal} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="admin-create-po-content space-y-4">
              {newOrder.replenishmentRequestId && (
                <div className="admin-create-po-linked rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-slate-700 dark:text-cyan-100">
                  Linked request <strong>{newOrder.requestNo}</strong> · Delivery location: <strong>{newOrder.warehouseLocation}</strong>
                </div>
              )}
              <div className="admin-create-po-form grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Supplier *</label>
                  <select required disabled={loadingSuppliers} value={newOrder.supplierId} onChange={(e) => setNewOrder({ ...newOrder, supplierId: e.target.value })} className="w-full bg-[#1e293b] border border-[#1f2937] rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:cursor-wait disabled:opacity-60">
                    <option value="">{loadingSuppliers ? 'Loading active suppliers…' : 'Select an active supplier'}</option>
                    {supplierOptions.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} ({supplier.supplier_code})</option>)}
                  </select>
                  {supplierError && <p role="alert" className="mt-1 text-xs text-red-400">{supplierError}</p>}
                  {!loadingSuppliers && !supplierError && supplierOptions.length === 0 && <p className="mt-1 text-xs text-amber-400">No active suppliers are available.</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Status *</label>
                  <select value={newOrder.status} onChange={(e) => setNewOrder({ ...newOrder, status: e.target.value as POStatus })} className="w-full bg-[#1e293b] border border-[#1f2937] rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                    <option>Pending Approval</option><option>Approved</option><option>Completed</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-1">Expected Delivery Date *</label>
                  <input type="date" required value={newOrder.expectedDeliveryDate} onChange={(e) => setNewOrder({ ...newOrder, expectedDeliveryDate: e.target.value })} className="w-full bg-[#1e293b] border border-[#1f2937] rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/40" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-1">Target / Delivery Details *</label>
                  <textarea rows={2} value={newOrder.deliveryDetails} onChange={(e) => setNewOrder({ ...newOrder, deliveryDetails: e.target.value })} placeholder="Delivery target, destination, and instructions" className="w-full bg-[#1e293b] border border-[#1f2937] rounded-xl px-4 py-2 text-sm text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-1">Signature Data</label>
                  <textarea rows={2} value={newOrder.signatureData} onChange={(e) => setNewOrder({ ...newOrder, signatureData: e.target.value })} placeholder="Optional signature data or approval reference" className="w-full bg-[#1e293b] border border-[#1f2937] rounded-xl px-4 py-2 text-sm text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40" />
                </div>
              </div>
              <div>
                <h3 className="admin-create-po-items-title text-sm font-semibold text-white mb-2">Items</h3>
                <button type="button" onClick={() => setNewOrder({ ...newOrder, items: [...newOrder.items, { productName: '', quantity: 1, unitPrice: 0 }] })} className="admin-create-po-add-item text-cyan-400 text-sm hover:text-cyan-300 transition-colors flex items-center gap-1 mb-2">
                  <Plus className="w-4 h-4" /> Add Item
                </button>
                <div className="admin-table-scroll">
                  <table className="admin-create-po-items-table admin-responsive-table admin-cols-5 admin-sticky-1 w-full text-sm">
                    <thead className="border-b border-[#1f2937] text-gray-400 text-xs uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">Product</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Unit Price</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newOrder.items.map((item, index) => (
                        <tr key={index} className="border-b border-[#1f2937]">
                          <td className="px-3 py-2"><select value={item.productName} onChange={(e) => setNewOrder({ ...newOrder, items: newOrder.items.map((value, itemIndex) => itemIndex === index ? { ...value, productName: e.target.value } : value) })} className="w-full bg-[#1e293b] border border-[#1f2937] rounded-lg px-2 py-1 text-sm text-slate-100"><option value="">Select inventory product</option>{productNames.map((name) => <option key={name}>{name}</option>)}</select></td>
                          <td className="px-3 py-2"><input type="number" min="1" value={item.quantity} onChange={(e) => setNewOrder({ ...newOrder, items: newOrder.items.map((value, itemIndex) => itemIndex === index ? { ...value, quantity: Number(e.target.value) } : value) })} className="w-full bg-[#1e293b] border border-[#1f2937] rounded-lg px-2 py-1 text-sm text-slate-100 text-right" /></td>
                          <td className="px-3 py-2"><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => setNewOrder({ ...newOrder, items: newOrder.items.map((value, itemIndex) => itemIndex === index ? { ...value, unitPrice: Number(e.target.value) } : value) })} className="w-full bg-[#1e293b] border border-[#1f2937] rounded-lg px-2 py-1 text-sm text-slate-100 text-right" /></td>
                          <td className="px-3 py-2 text-right text-white">₱{(item.quantity * item.unitPrice).toLocaleString()}</td>
                          <td className="px-3 py-2 text-center"><button type="button" disabled={newOrder.items.length === 1} onClick={() => setNewOrder({ ...newOrder, items: newOrder.items.filter((_, itemIndex) => itemIndex !== index) })} className="text-red-400 hover:text-red-300 disabled:opacity-40"><Trash2 className="w-4 h-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="admin-create-po-footer flex items-center justify-end gap-3 mt-6 pt-4 border-t border-[#1f2937]">
            <button onClick={closeCreateModal} className="admin-create-po-action px-4 py-2 border border-[#1f2937] rounded-xl text-sm font-medium text-gray-300 hover:bg-slate-800/50 transition-colors">Cancel</button>
              <button onClick={() => void handleCreateOrder()} disabled={saving || loadingSuppliers || !newOrder.supplierId} className="admin-create-po-action px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                <Save className="w-4 h-4" /> Create PO
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role={toast.type === 'error' ? 'alert' : 'status'}
          className={`fixed bottom-6 right-6 z-[60] flex max-w-sm items-center gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}
        >
          {toast.type === 'success' ? <CheckCircle className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default PurchaseOrders;
