// src/page/admin/PurchaseOrders.tsx
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { apiClient } from '../../lib/api';
import { useLocation, useNavigate } from 'react-router-dom';
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
  Package,
  Calendar,
  Building,
  LayoutGrid,
  LayoutList,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

type POStatus = 'Pending Approval' | 'Approved' | 'Sent to Supplier' | 'Completed' | 'Cancelled';

interface PurchaseOrderItem { productName: string; quantity: number; unitPrice: number; amount: number; }
interface SupplierOption { id: number; supplier_code: string; name: string; }

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
}

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: POStatus }> = ({ status }) => {
  const config: Record<POStatus, { color: string; bg: string; border: string }> = {
    'Pending Approval': { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
    Approved: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    'Sent to Supplier': { color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
    Completed: { color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20' },
    Cancelled: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  };
  const { color, bg, border } = config[status] || config['Pending Approval'];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${color} ${bg} ${border}`}>
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
  const [productNames, setProductNames] = useState<string[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [supplierError, setSupplierError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [newOrder, setNewOrder] = useState({
    replenishmentRequestId: null as number | null,
    requestNo: '', warehouseLocation: '', supplierName: '', expectedDeliveryDate: '',
    deliveryDetails: '', signatureData: '', status: 'Approved' as POStatus,
    items: [{ productName: '', quantity: 1, unitPrice: 0 }],
  });

  useEffect(() => {
    const linkedRequest = (location.state as any)?.replenishmentRequest;
    if (!linkedRequest) return;
    setNewOrder({
      replenishmentRequestId: Number(linkedRequest.id),
      requestNo: linkedRequest.requestNo,
      warehouseLocation: linkedRequest.warehouseLocation,
      supplierName: '',
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
      const [ordersResponse, inventoryResponse] = await Promise.all([
        apiClient.get('/purchase-orders'),
        apiClient.get('/inventory'),
      ]);
      setOrders((ordersResponse.data?.data ?? []).map((order: any) => ({
        id: String(order.id), poNumber: order.po_number, supplier: order.supplier_name,
        expectedDeliveryDate: order.expected_delivery_date, deliveryDetails: order.delivery_details, totalAmount: Number(order.total_amount),
        status: order.status as POStatus, createdAt: order.created_at,
        approvedBy: order.approved_by, signatureData: order.signature_data, sentAt: order.sent_at,
        items: (order.items ?? []).map((item: any) => ({
          productName: item.product_name, quantity: Number(item.ordered_quantity),
          unitPrice: Number(item.unit_price), amount: Number(item.total_price),
        })),
      })));
      const inventoryItems = (inventoryResponse.data?.data ?? []) as Array<{ product?: string }>;
      setProductNames([...new Set(inventoryItems.map((item) => item.product).filter((name): name is string => Boolean(name)))]);
      setError('');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to load purchase orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

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

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchSearch =
        order.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.items.some((item) => item.productName.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchStatus = statusFilter === 'All' || order.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [orders, searchQuery, statusFilter]);

  // KPI counts
  const kpiCounts = {
    Pending: orders.filter((o) => o.status === 'Pending Approval').length,
    Approved: orders.filter((o) => o.status === 'Approved').length,
    Completed: orders.filter((o) => o.status === 'Completed').length,
    Cancelled: orders.filter((o) => o.status === 'Cancelled').length,
  };

  const handleCreateOrder = async () => {
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/purchase-orders', {
        supplier_name: newOrder.supplierName,
        replenishment_request_id: newOrder.replenishmentRequestId,
        expected_delivery_date: newOrder.expectedDeliveryDate,
        delivery_details: newOrder.deliveryDetails,
        status: newOrder.status,
        signature_data: newOrder.signatureData || null,
        items: newOrder.items.map((item) => ({ product_name: item.productName, ordered_quantity: item.quantity, unit_price: item.unitPrice })),
      });
      await loadOrders();
      setShowCreateModal(false);
      setNewOrder({ replenishmentRequestId: null, requestNo: '', warehouseLocation: '', supplierName: '', expectedDeliveryDate: '', deliveryDetails: '', signatureData: '', status: 'Approved', items: [{ productName: '', quantity: 1, unitPrice: 0 }] });
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Purchase order could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const resetNewOrder = () => setNewOrder({ replenishmentRequestId: null, requestNo: '', warehouseLocation: '', supplierName: '', expectedDeliveryDate: '', deliveryDetails: '', signatureData: '', status: 'Approved', items: [{ productName: '', quantity: 1, unitPrice: 0 }] });
  const openCreateModal = () => { resetNewOrder(); setShowCreateModal(true); };
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

  const openPrintablePo = (order: PurchaseOrder, saveAsPdf = false) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to print this Purchase Order.');
      return;
    }
    printWindow.opener = null;
    const rows = order.items.map((item) => `<tr><td>${escapeHtml(item.productName)}</td><td class="number">${item.quantity}</td><td class="number">₱${item.unitPrice.toLocaleString()}</td><td class="number">₱${item.amount.toLocaleString()}</td></tr>`).join('');
    printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(order.poNumber)}</title><style>body{font-family:Arial,sans-serif;color:#111827;margin:40px}header{display:flex;justify-content:space-between;border-bottom:2px solid #0891b2;padding-bottom:16px}h1{margin:0}.meta{margin:24px 0;display:grid;grid-template-columns:1fr 1fr;gap:10px}.label{color:#64748b;font-size:12px;text-transform:uppercase}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #cbd5e1;padding:10px;text-align:left}th{background:#f1f5f9}.number{text-align:right}.total{text-align:right;font-size:18px;font-weight:700;margin-top:18px}.signature{margin-top:60px;width:260px;border-top:1px solid #111827;padding-top:8px}@media print{body{margin:20mm}}</style></head><body><header><div><h1>Purchase Order</h1><p>${escapeHtml(order.poNumber)}</p></div><strong>${escapeHtml(order.status)}</strong></header><section class="meta"><div><div class="label">Supplier</div>${escapeHtml(order.supplier)}</div><div><div class="label">Created Date</div>${escapeHtml(order.createdAt)}</div><div><div class="label">Expected Delivery</div>${escapeHtml(order.expectedDeliveryDate)}</div><div><div class="label">Delivery Details</div>${escapeHtml(order.deliveryDetails)}</div></section><table><thead><tr><th>Product</th><th class="number">Qty</th><th class="number">Unit Price</th><th class="number">Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="total">Total Amount: ₱${order.totalAmount.toLocaleString()}</div><div class="signature">Approved by: ${escapeHtml(order.approvedBy || 'Electronic approval')}<br>${order.signatureData ? 'Signature recorded' : 'Electronically approved'}</div><script>window.onload=()=>{window.print();}</script></body></html>`);
    printWindow.document.close();
    if (saveAsPdf) alert('In the print dialog, choose “Save as PDF” to download the Purchase Order.');
  };

  const handleSendToSupplier = async (order: PurchaseOrder) => {
    if (order.status === 'Sent to Supplier') return;
    setSending(true);
    setError('');
    try {
      const response = await apiClient.patch(`/purchase-orders/${order.id}/send`);
      const updated = { ...order, status: response.data.status as POStatus, sentAt: response.data.sent_at };
      setOrders((current) => current.map((value) => value.id === order.id ? updated : value));
      setSelectedOrder(updated);
      alert(`${order.poNumber} successfully sent to supplier!`);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Purchase Order could not be sent.');
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
            <span className="text-xs font-medium uppercase tracking-wider">Pending</span>
          </div>
          <p className="text-2xl font-bold text-white mt-1">{kpiCounts.Pending}</p>
          <p className="text-xs text-gray-400">Awaiting approval</p>
        </div>
        <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Approved</span>
          </div>
          <p className="text-2xl font-bold text-white mt-1">{kpiCounts.Approved}</p>
          <p className="text-xs text-gray-400">Ready for supplier</p>
        </div>
        <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-indigo-400">
            <Package className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Total POs</span>
          </div>
          <p className="text-2xl font-bold text-white mt-1">{orders.length}</p>
          <p className="text-xs text-gray-400">Saved purchase orders</p>
        </div>
        <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-teal-400">
            <Package className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Completed</span>
          </div>
          <p className="text-2xl font-bold text-white mt-1">{kpiCounts.Completed}</p>
          <p className="text-xs text-gray-400">Fully received</p>
        </div>
        <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 text-red-400">
            <X className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Cancelled</span>
          </div>
          <p className="text-2xl font-bold text-white mt-1">{kpiCounts.Cancelled}</p>
          <p className="text-xs text-gray-400">Cancelled orders</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search PO number, supplier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1e293b] border border-[#1f2937] rounded-xl pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as POStatus | 'All')}
          className="bg-[#1e293b] border border-[#1f2937] rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
        >
          <option value="All">All Status</option>
          <option value="Pending Approval">Pending Approval</option>
          <option value="Approved">Approved</option>
          <option value="Sent to Supplier">Sent to Supplier</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <div className="flex items-center gap-2 bg-[#1e293b] border border-[#1f2937] rounded-xl px-3 py-2 text-sm text-slate-300">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span>Date Range</span>
          <ChevronRightIcon className="w-4 h-4 text-gray-400" />
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-[#1f2937] bg-[#1e293b] p-1" aria-label="Purchase order view">
          <button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} title="List view" className={`rounded-md p-1.5 transition-colors ${viewMode === 'list' ? 'bg-[#092635] text-white' : 'text-gray-400 hover:text-white'}`}><LayoutList className="h-4 w-4" /></button>
          <button type="button" onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} title="Grid view" className={`rounded-md p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-[#092635] text-white' : 'text-gray-400 hover:text-white'}`}><LayoutGrid className="h-4 w-4" /></button>
        </div>
        <button onClick={() => void loadOrders()} disabled={loading} className="p-2 rounded-xl border border-[#1f2937] text-gray-400 hover:bg-slate-800/50 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button className="p-2 rounded-xl border border-[#1f2937] text-gray-400 hover:bg-slate-800/50 transition-colors">
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>New PO</span>
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

      {/* Table */}
      <div className="bg-[#0f172a] border border-[#1f2937] rounded-xl overflow-hidden">
        {viewMode === 'list' ? (
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
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
              {filteredOrders.map((order) => (
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
                        onClick={() => openPrintablePo(order, true)}
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
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-gray-400">
                    No purchase orders found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        ) : filteredOrders.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredOrders.map((order) => (
              <article key={order.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900 dark:text-white">{order.poNumber}</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{order.supplier}</p></div><StatusBadge status={order.status} /></div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500 dark:text-slate-400">Created</dt><dd className="text-slate-900 dark:text-white">{order.createdAt}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Target</dt><dd className="text-slate-900 dark:text-white">{order.expectedDeliveryDate}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Items / Qty</dt><dd className="text-slate-900 dark:text-white">{order.items.length} / {order.items.reduce((sum, item) => sum + item.quantity, 0)}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Total</dt><dd className="font-semibold text-slate-900 dark:text-white">₱{order.totalAmount.toLocaleString()}</dd></div></dl>
                <p className="mt-3 truncate text-xs text-slate-500 dark:text-slate-400" title={order.deliveryDetails}>{order.deliveryDetails}</p>
                <div className="mt-auto flex justify-end gap-1 border-t border-slate-200 pt-3 dark:border-slate-700"><button onClick={() => handleViewDetails(order)} className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" title="View Details"><Eye className="h-4 w-4" /></button><button onClick={() => openPrintablePo(order, true)} className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" title="Download PO"><Download className="h-4 w-4" /></button><button onClick={() => openPrintablePo(order)} className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" title="Print PO"><Printer className="h-4 w-4" /></button></div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-gray-400">No purchase orders found matching your criteria.</div>
        )}
        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#1f2937] bg-white dark:bg-[#0f172a]/30">
          <div className="text-sm text-gray-400">
            Showing <span className="text-white font-medium">1</span> to{' '}
            <span className="text-white font-medium">{filteredOrders.length}</span> of{' '}
            <span className="text-white font-medium">{orders.length}</span> entries
          </div>
          <div className="flex items-center gap-1">
            <button className="p-1.5 rounded-xl border border-[#1f2937] text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#1f2937] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="px-3 py-1 rounded-xl text-sm font-medium bg-cyan-500 text-slate-950">1</button>
            <button className="p-1.5 rounded-xl border border-[#1f2937] text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#1f2937] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
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
          <div className="bg-black/60 backdrop-blur-sm w-full" onClick={handleCloseDrawer}></div>
          <div className="bg-[#0f172a] border-l border-[#1f2937] w-full sm:w-[600px] h-full overflow-y-auto p-6 animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-3">
                  {selectedOrder.poNumber}
                  <StatusBadge status={selectedOrder.status} />
                </h2>
                <p className="text-sm text-gray-400">Supplier: {selectedOrder.supplier}</p>
              </div>
              <button onClick={handleCloseDrawer} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* PO Info Grid */}
            <div className="grid grid-cols-2 gap-4 text-sm mb-6 p-4 bg-[#1e293b]/30 rounded-xl border border-[#1f2937]">
              <div><span className="text-gray-400">Created Date</span><p className="text-white">{selectedOrder.createdAt}</p></div>
              <div><span className="text-gray-400">Expected Delivery</span><p className="text-white">{selectedOrder.expectedDeliveryDate}</p></div>
              <div><span className="text-gray-400">Approved By</span><p className="text-white">{selectedOrder.approvedBy || '—'}</p></div>
              <div className="col-span-2"><span className="text-gray-400">Delivery Details</span><p className="text-white">{selectedOrder.deliveryDetails}</p></div>
              <div className="col-span-2"><span className="text-gray-400">Signature</span><p className="text-white">{selectedOrder.signatureData ? 'Signature recorded' : 'Approved electronically'}</p></div>
            </div>

            {/* Supplier Info */}
            <div className="bg-[#1e293b]/30 rounded-xl p-4 border border-[#1f2937] mb-6">
              <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                <Building className="w-4 h-4 text-cyan-400" /> Supplier Information
              </h3>
              <p className="text-sm text-white">{selectedOrder.supplier}</p>
            </div>

            {/* Items Table */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-white mb-2">Items</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-[#1f2937]">
                    <tr className="text-gray-400 text-xs uppercase">
                      <th className="px-3 py-2 text-left">Product</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items.map((item, idx) => (
                      <tr key={idx} className="border-b border-[#1f2937]">
                        <td className="px-3 py-2 text-gray-300">{item.productName}</td>
                        <td className="px-3 py-2 text-right text-white">{item.quantity}</td>
                        <td className="px-3 py-2 text-right text-white">₱{item.unitPrice.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-white">₱{item.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-[#1f2937] font-medium">
                    <tr className="text-lg"><td colSpan={3} className="px-3 py-2 text-right text-white font-bold">Total Amount</td><td className="px-3 py-2 text-right text-cyan-400 font-bold">₱{selectedOrder.totalAmount.toLocaleString()}</td></tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 border-t border-[#1f2937] pt-4">
              <button onClick={() => openPrintablePo(selectedOrder)} className="flex-1 min-h-11 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-300">
                <Printer className="w-4 h-4" /> Print PO
              </button>
              <button onClick={() => openPrintablePo(selectedOrder, true)} className="flex-1 min-h-11 py-2 border border-[#1f2937] hover:bg-slate-800/50 text-gray-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50">
                <Download className="w-4 h-4" /> Download PO (PDF)
              </button>
              <button onClick={() => void handleSendToSupplier(selectedOrder)} disabled={sending || selectedOrder.status === 'Sent to Supplier'} className="flex-1 min-h-11 py-2 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-cyan-500/50">
                <Send className="w-4 h-4" /> {sending ? 'Sending…' : selectedOrder.status === 'Sent to Supplier' ? 'Sent to Supplier' : 'Send PO to Supplier'}
              </button>
              <button onClick={() => setShowHistory((visible) => !visible)} aria-expanded={showHistory} className="flex-1 min-h-11 py-2 border border-[#1f2937] hover:bg-slate-800/50 text-gray-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50">
                <Clock className="w-4 h-4" /> {showHistory ? 'Hide History' : 'View History'}
              </button>
            </div>
            {showHistory && (
              <section className="mt-4 rounded-xl border border-[#1f2937] bg-[#1e293b]/30 p-4" aria-label="Purchase Order history">
                <h3 className="mb-3 text-sm font-semibold text-white">Audit History</h3>
                <ol className="space-y-3 border-l border-slate-700 pl-4 text-sm">
                  <li><p className="font-medium text-white">Purchase Order created</p><p className="text-gray-400">{selectedOrder.createdAt}</p></li>
                  {selectedOrder.approvedBy && <li><p className="font-medium text-white">Approved by {selectedOrder.approvedBy}</p><p className="text-gray-400">{selectedOrder.createdAt}</p></li>}
                  {selectedOrder.sentAt && <li><p className="font-medium text-cyan-300">Sent to supplier</p><p className="text-gray-400">{new Date(selectedOrder.sentAt).toLocaleString()}</p></li>}
                </ol>
              </section>
            )}
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* CREATE PO MODAL */}
      {/* ============================================ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-[#1f2937] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Create New Purchase Order</h2>
              <button onClick={closeCreateModal} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {newOrder.replenishmentRequestId && (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-100">
                  Linked request <strong>{newOrder.requestNo}</strong> · Delivery location: <strong>{newOrder.warehouseLocation}</strong>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Supplier *</label>
                  <select required disabled={loadingSuppliers} value={newOrder.supplierName} onChange={(e) => setNewOrder({ ...newOrder, supplierName: e.target.value })} className="w-full bg-[#1e293b] border border-[#1f2937] rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:cursor-wait disabled:opacity-60">
                    <option value="">{loadingSuppliers ? 'Loading active suppliers…' : 'Select an active supplier'}</option>
                    {supplierOptions.map((supplier) => <option key={supplier.id} value={supplier.name}>{supplier.name} ({supplier.supplier_code})</option>)}
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
                <h3 className="text-sm font-semibold text-white mb-2">Items</h3>
                <button type="button" onClick={() => setNewOrder({ ...newOrder, items: [...newOrder.items, { productName: '', quantity: 1, unitPrice: 0 }] })} className="text-cyan-400 text-sm hover:text-cyan-300 transition-colors flex items-center gap-1 mb-2">
                  <Plus className="w-4 h-4" /> Add Item
                </button>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
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
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-[#1f2937]">
            <button onClick={closeCreateModal} className="px-4 py-2 border border-[#1f2937] rounded-xl text-sm font-medium text-gray-300 hover:bg-slate-800/50 transition-colors">Cancel</button>
              <button onClick={() => void handleCreateOrder()} disabled={saving || loadingSuppliers || !newOrder.supplierName} className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                <Save className="w-4 h-4" /> Create PO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrders;
