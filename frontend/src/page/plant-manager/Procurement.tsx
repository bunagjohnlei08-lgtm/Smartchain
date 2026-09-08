// src/page/plant-manager/ReplenishmentPlanning.tsx
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { apiClient } from '../../lib/api';
import {
  Search,
  Eye,
  Plus,
  X,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  RefreshCw,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  LayoutGrid,
  LayoutList,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

type Priority = 'Low' | 'Medium' | 'High' | 'Critical';
type RequestStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'for_purchase_order';

interface Product {
  id: string;
  productId: number;
  warehouseId: number;
  name: string;
  sku: string;
  warehouse: string;
  currentStock: number;
  minStock: number;
  forecastedDemand: number;
  recommendedReorderQty: number;
  priority: Priority;
  needsReplenishment: boolean;
}

interface CatalogProduct {
  id: number;
  name: string;
  category: string;
}

interface ProcurementWarehouse {
  id: number;
  name: string;
}

interface RequestHistory {
  id: string;
  requestNo: string;
  product: string;
  warehouse: string;
  requestedQty: number;
  submittedDate: string;
  status: RequestStatus;
  adminDecision?: string;
  requestedBy: string;
  priority: Priority;
}

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: RequestStatus | string }> = ({ status }) => {
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    draft: { color: 'text-slate-400 bg-slate-500/10 border-slate-500/20', icon: FileText },
    pending: { color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: Clock },
    approved: { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle },
    rejected: { color: 'text-red-400 bg-red-500/10 border-red-500/20', icon: XCircle },
    for_purchase_order: { color: 'text-sky-400 bg-sky-500/10 border-sky-500/20', icon: FileText },
  };
  const labels: Record<string, string> = { draft: 'Draft', pending: 'Pending Approval', approved: 'Approved', rejected: 'Rejected', for_purchase_order: 'For Purchase Order' };
  const { color, icon: Icon } = config[status] || config.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
      <Icon className="w-3 h-3" />
      {labels[status] || status}
    </span>
  );
};

const PriorityBadge: React.FC<{ priority: Priority }> = ({ priority }) => {
  const config: Record<Priority, string> = {
    'Low': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    'Medium': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    'High': 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    'Critical': 'text-red-400 bg-red-500/10 border-red-500/20',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${config[priority]}`}>
      {priority}
    </span>
  );
};

const KPICard: React.FC<{ label: string; value: string | number; icon: React.ReactNode; trend?: string; trendType?: 'up' | 'down' | 'stable' }> = ({
  label,
  value,
  icon,
  trend,
  trendType,
}) => {
  const trendColor =
    trendType === 'up'
      ? 'text-emerald-400'
      : trendType === 'down'
      ? 'text-red-400'
      : 'text-[var(--text-muted)]';

  const TrendIcon =
    trendType === 'up' ? TrendingUp : trendType === 'down' ? TrendingDown : Minus;

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 shadow-sm hover:border-[var(--border-color)] transition-all">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1.5">{value}</p>
          {trend && (
            <p className={`text-xs mt-1 flex items-center gap-1 ${trendColor}`}>
              <TrendIcon className="w-3 h-3" />
              {trend}
            </p>
          )}
        </div>
        <div className="p-2.5 bg-[var(--bg-surface-alt)] rounded-lg">{icon}</div>
      </div>
    </div>
  );
};

const SearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => (
  <div className="relative flex-1 min-w-[180px]">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl pl-9 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all"
    />
  </div>
);

const FilterSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: string[];
}> = ({ value, onChange, options }) => (
  <div className="min-w-[130px]">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  </div>
);

const Pagination: React.FC<{
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
}> = ({ currentPage, totalPages, onPageChange, totalItems, itemsPerPage }) => {
  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, totalItems);

  const getPages = () => {
    const pages: number[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
      for (let i = 1; i <= 5; i++) pages.push(i);
    } else if (currentPage >= totalPages - 2) {
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      for (let i = currentPage - 2; i <= currentPage + 2; i++) pages.push(i);
    }
    return pages;
  };

  if (totalItems === 0) return null;

  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-color)] bg-[var(--bg-surface-alt)]">
      <div className="text-sm text-[var(--text-secondary)]">
        Showing <span className="text-[var(--text-primary)] font-medium">{start}</span> to{' '}
        <span className="text-[var(--text-primary)] font-medium">{end}</span> of{' '}
        <span className="text-[var(--text-primary)] font-medium">{totalItems}</span> items
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="p-1.5 rounded-xl border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {getPages().map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`px-3 py-1 rounded-xl text-sm font-medium transition-all ${
              currentPage === page
                ? 'bg-cyan-500 text-slate-950'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)]'
            }`}
          >
            {page}
          </button>
        ))}
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-xl border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const ReplenishmentPlanning: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [procurementWarehouse, setProcurementWarehouse] = useState<ProcurementWarehouse | null>(null);
  const [history, setHistory] = useState<RequestHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Filter states
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [priorityFilter, setPriorityFilter] = useState('All Priorities');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const itemsPerPage = 10;

  // Modal states
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RequestHistory | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // New request form state
  const [newRequest, setNewRequest] = useState({
    requestNo: '',
    product: '',
    warehouse: 'Main Warehouse',
    quantity: '',
    priority: 'Medium' as Priority,
    submittedDate: new Date().toISOString().slice(0, 10),
    status: 'pending' as RequestStatus,
  });

  const loadProcurement = useCallback(async () => {
    setLoading(true);
    try {
      const [requestsResponse, optionsResponse] = await Promise.all([
        apiClient.get('/plant-manager/procurement/requests'),
        apiClient.get('/plant-manager/procurement/options'),
      ]);
      setHistory((requestsResponse.data?.data ?? []).map((request: any) => ({
        id: String(request.id),
        requestNo: request.request_no,
        product: request.product_name,
        warehouse: request.warehouse_name,
        requestedQty: Number(request.requested_qty),
        submittedDate: request.submitted_date ?? '',
        status: request.status as RequestStatus,
        requestedBy: request.requested_by ?? '—',
        priority: request.priority as Priority,
      })));
      setProducts(optionsResponse.data?.data ?? []);
      const warehouse = optionsResponse.data?.warehouse;
      setProcurementWarehouse(warehouse ? { id: Number(warehouse.id), name: String(warehouse.name) } : null);
    } catch (error: any) {
      setToast({ message: error?.response?.data?.message || 'Unable to load procurement data.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProcurement();
  }, [loadProcurement]);

  useEffect(() => {
    if (!showNewRequestModal) return;

    setNewRequest((current) => ({ ...current, warehouse: procurementWarehouse?.name ?? '' }));
    apiClient.get('/products')
      .then((response) => {
        const records = response.data?.data ?? response.data ?? [];
        setCatalogProducts(records.map((product: any) => ({
          id: Number(product.id),
          name: String(product.name),
          category: String(product.category ?? ''),
        })));
      })
      .catch((error: any) => {
        showToast(error?.response?.data?.message || 'Unable to load Product Catalog.', 'error');
      });
  }, [showNewRequestModal, procurementWarehouse]);

  const catalogCategories = useMemo(
    () => Array.from(new Set(catalogProducts.map((product) => product.category).filter(Boolean))).sort(),
    [catalogProducts]
  );
  const categoryProducts = useMemo(
    () => selectedCategory
      ? catalogProducts.filter((product) => product.category === selectedCategory)
      : [],
    [catalogProducts, selectedCategory]
  );

  // Filtered products
  const filteredRequests = useMemo(() => {
    return history.filter((r) => {
      const matchSearch =
        r.requestNo.toLowerCase().includes(search.toLowerCase()) ||
        r.product.toLowerCase().includes(search.toLowerCase()) ||
        r.warehouse.toLowerCase().includes(search.toLowerCase()) ||
        r.requestedBy.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All Status' || r.status === statusFilter;
      const matchPriority = priorityFilter === 'All Priorities' || (r.priority || '') === priorityFilter;
      return matchSearch && matchStatus && matchPriority;
    });
  }, [history, search, statusFilter, priorityFilter]);

  const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Summary counts
  const needingReplenishment = products.filter((p) => p.needsReplenishment).length;
  const criticalStock = products.filter((p) => p.priority === 'Critical').length;
  const pendingRequests = history.filter((r) => r.status === 'pending').length;
  const approvedRequests = history.filter((r) => r.status === 'approved').length;
  const rejectedRequests = history.filter((r) => r.status === 'rejected').length;
  const criticalRequests = history.filter((r) => r.priority === 'Critical').length;
  const completedRequests = history.filter((r) => r.status === 'for_purchase_order').length;

  // Handlers
  const handleCreateRequest = (product: Product) => {
    setSelectedProduct(product);
    setReason('');
    setNotes('');
    setShowCreateModal(true);
  };

  const handleViewDetails = (request: RequestHistory) => {
    setSelectedRequest(request);
    setShowViewModal(true);
  };

  const submitRequest = async () => {
    if (!selectedProduct) return;
    setSubmitting(true);
    try {
      await apiClient.post('/plant-manager/procurement/requests', {
        product_id: selectedProduct.productId,
        warehouse_id: selectedProduct.warehouseId,
        requested_qty: selectedProduct.recommendedReorderQty,
        priority: selectedProduct.priority,
        status: 'pending',
      });
      await loadProcurement();
      setShowCreateModal(false);
      setSelectedProduct(null);
      showToast('Request submitted successfully!', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Request could not be submitted.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenNewRequest = () => {
    setSelectedCategory('');
    setNewRequest((current) => ({ ...current, product: '' }));
    setShowNewRequestModal(true);
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setNewRequest((current) => ({ ...current, product: '' }));
  };

  const handleNewRequestSubmit = async () => {
    if (!selectedCategory || !newRequest.product || !newRequest.warehouse || !newRequest.quantity || Number(newRequest.quantity) <= 0) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    const product = catalogProducts.find((item) => String(item.id) === newRequest.product);
    if (!product || product.category !== selectedCategory || !procurementWarehouse) {
      showToast('Select a valid catalog product and warehouse.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/plant-manager/procurement/requests', {
        product_id: product.id,
        warehouse_id: procurementWarehouse.id,
        requested_qty: Number(newRequest.quantity),
        priority: newRequest.priority,
        status: 'pending',
      });
      await loadProcurement();
      setShowNewRequestModal(false);
      setSelectedCategory('');
      setNewRequest({ requestNo: '', product: '', warehouse: procurementWarehouse.name, quantity: '', priority: 'Medium', submittedDate: new Date().toISOString().slice(0, 10), status: 'pending' });
      showToast('Request created successfully!', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Request could not be created.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'info' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const recommendations = products
    .filter((p) => p.needsReplenishment && p.recommendedReorderQty > 0)
    .slice(0, 3);

  {/* FIX: Prevent UI horizontal overflow and align container spacing */}
  return (
    <div className="w-full max-w-[100vw] overflow-x-hidden p-4 sm:p-6 lg:p-8 space-y-6 bg-[var(--bg-app)] text-[var(--text-primary)] min-h-screen transition-colors duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Replenishment Planning</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Monitor inventory levels and submit replenishment requests to Admin.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => void loadProcurement()} disabled={loading} className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-alt)] disabled:opacity-50 disabled:cursor-not-allowed">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            onClick={handleOpenNewRequest}
            className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950"
          >
            <Plus className="w-4 h-4" /> New Request
          </button>
        </div>
      </div>

      {/* FIX: Responsive metric cards grid to prevent overflow on narrow screens */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 w-full">
        <KPICard
          label="Needing Replenishment"
          value={needingReplenishment}
          icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
        />
        <KPICard
          label="Critical Stock Items"
          value={criticalStock}
          icon={<AlertTriangle className="w-5 h-5 text-red-400" />}
        />
        <KPICard
          label="Pending Requests"
          value={pendingRequests}
          icon={<Clock className="w-5 h-5 text-amber-400" />}
        />
        <KPICard
          label="Approved Requests"
          value={approvedRequests}
          icon={<CheckCircle className="w-5 h-5 text-emerald-400" />}
        />
        <KPICard
          label="Rejected Requests"
          value={rejectedRequests}
          icon={<XCircle className="w-5 h-5 text-red-400" />}
        />
        <KPICard
          label="For Purchase Order"
          value={completedRequests}
          icon={<CheckCircle className="w-5 h-5 text-cyan-400" />}
        />
      </div>

      {/* Search & Filters */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search request, requester, product, or warehouse..." />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={['All Status', 'draft', 'pending', 'approved', 'rejected', 'for_purchase_order']} />
        <FilterSelect value={priorityFilter} onChange={setPriorityFilter} options={['All Priorities', 'Low', 'Medium', 'High', 'Critical']} />
        <button
          onClick={() => {
            setSearch('');
            setStatusFilter('All Status');
            setPriorityFilter('All Priorities');
          }}
          className="px-4 py-2.5 border border-[var(--border-color)] rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-surface-alt)] transition-all text-sm"
        >
          Reset
        </button>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface-alt)] p-1" aria-label="Request view"><button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} title="List view" className={`rounded-md p-1.5 ${viewMode === 'list' ? 'bg-[#092635] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}><LayoutList className="h-4 w-4" /></button><button type="button" onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} title="Grid view" className={`rounded-md p-1.5 ${viewMode === 'grid' ? 'bg-[#092635] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}><LayoutGrid className="h-4 w-4" /></button></div>
      </div>

      {/* Main Table */}
      <div className="w-full max-w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl overflow-hidden">
        {viewMode === 'list' ? (
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-[var(--bg-surface-alt)] border-b border-[var(--border-color)]">
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Request No.</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Requested By</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Warehouse</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Product</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Requested Qty</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Priority</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Status</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Date</th>
                <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRequests.map((req) => (
                <tr key={req.id} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-surface-alt)] transition-all">
                  <td className="px-4 py-3.5 text-sm font-medium text-[var(--text-primary)]">{req.requestNo}</td>
                  <td className="px-4 py-3.5 text-sm text-[var(--text-secondary)]">{req.requestedBy}</td>
                  <td className="px-4 py-3.5 text-sm text-[var(--text-secondary)]">{req.warehouse}</td>
                  <td className="px-4 py-3.5 text-sm text-[var(--text-secondary)]">{req.product}</td>
                  <td className="px-4 py-3.5 text-sm text-[var(--text-secondary)]">{req.requestedQty.toLocaleString()}</td>
                  <td className="px-4 py-3.5"><PriorityBadge priority={req.priority} /></td>
                  <td className="px-4 py-3.5"><StatusBadge status={req.status} /></td>
                  <td className="px-4 py-3.5 text-sm text-[var(--text-secondary)]">{req.submittedDate}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleViewDetails(req)}
                        className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-alt)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
                        title="View"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedRequests.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    No requests found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        ) : paginatedRequests.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">{paginatedRequests.map((req) => <article key={req.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900 dark:text-white">{req.requestNo}</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{req.product}</p></div><StatusBadge status={req.status} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500 dark:text-slate-400">Requested by</dt><dd className="text-slate-900 dark:text-white">{req.requestedBy}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Warehouse</dt><dd className="text-slate-900 dark:text-white">{req.warehouse}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Quantity</dt><dd className="text-slate-900 dark:text-white">{req.requestedQty.toLocaleString()}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Date</dt><dd className="text-slate-900 dark:text-white">{req.submittedDate}</dd></div></dl><div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-700"><PriorityBadge priority={req.priority} /><button onClick={() => handleViewDetails(req)} className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" title="View"><Eye className="h-4 w-4" /></button></div></article>)}</div>
        ) : (
          <div className="px-4 py-8 text-center text-[var(--text-muted)]">No requests found matching your criteria.</div>
        )}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredRequests.length}
          itemsPerPage={itemsPerPage}
        />
      </div>

      {/* Request History Section */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Request History</h3>
            <p className="text-sm text-[var(--text-muted)]">Track your submitted replenishment requests</p>
          </div>
          <button className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">View all</button>
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-[var(--border-color)]">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Request No.</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Requested By</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Warehouse</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Product</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Requested Qty</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Priority</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Date</th>
                <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-surface-alt)] transition-all">
                  <td className="px-4 py-2.5 text-sm font-medium text-[var(--text-primary)]">{item.requestNo}</td>
                  <td className="px-4 py-2.5 text-sm text-[var(--text-secondary)]">{item.requestedBy}</td>
                  <td className="px-4 py-2.5 text-sm text-[var(--text-secondary)]">{item.warehouse}</td>
                  <td className="px-4 py-2.5 text-sm text-[var(--text-secondary)]">{item.product}</td>
                  <td className="px-4 py-2.5 text-sm text-[var(--text-secondary)]">{item.requestedQty.toLocaleString()}</td>
                  <td className="px-4 py-2.5"><PriorityBadge priority={item.priority} /></td>
                  <td className="px-4 py-2.5"><StatusBadge status={item.status} /></td>
                  <td className="px-4 py-2.5 text-sm text-[var(--text-secondary)]">{item.submittedDate}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleViewDetails(item)}
                        className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-alt)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
                        title="View"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-[var(--text-muted)]">No request history found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right Panel: Replenishment Insights */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-5">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Replenishment Insights</h3>
        <div className="space-y-3">
          <div className="bg-[var(--bg-surface-alt)] rounded-xl p-3 text-sm text-[var(--text-secondary)] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
            <span><strong>{pendingRequests}</strong> requests are waiting for Admin approval.</span>
          </div>
          <div className="bg-[var(--bg-surface-alt)] rounded-xl p-3 text-sm text-[var(--text-secondary)] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5" />
            <span><strong>{approvedRequests}</strong> replenishment requests have been approved.</span>
          </div>
          <div className="bg-[var(--bg-surface-alt)] rounded-xl p-3 text-sm text-[var(--text-secondary)] flex items-start gap-2">
            <Clock className="w-4 h-4 text-amber-400 mt-0.5" />
            <span><strong>{rejectedRequests}</strong> replenishment requests have been rejected.</span>
          </div>
          <div className="bg-[var(--bg-surface-alt)] rounded-xl p-3 text-sm text-[var(--text-secondary)] flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5" />
            <span><strong>{criticalRequests}</strong> requests are marked critical.</span>
          </div>
        </div>
      </div>

      {/* FIX: AI recommendation cards responsive grid */}
      {recommendations.length > 0 && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">AI Recommendations</h3>
              <p className="text-sm text-[var(--text-muted)]">Products that need immediate attention</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
            {recommendations.map((product) => (
              <div key={product.id} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[var(--text-primary)] font-medium">{product.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{product.sku}</p>
                  </div>
                  <PriorityBadge priority={product.priority} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-sm">
                  <span className="text-[var(--text-muted)]">Current Stock</span>
                  <span className="text-[var(--text-primary)] text-right">{product.currentStock}</span>
                  <span className="text-[var(--text-muted)]">Forecast</span>
                  <span className="text-[var(--text-primary)] text-right">{product.forecastedDemand}</span>
                  <span className="text-[var(--text-muted)]">Recommended</span>
                  <span className="text-[var(--text-primary)] text-right font-medium">{product.recommendedReorderQty}</span>
                </div>
                <button
                  onClick={() => handleCreateRequest(product)}
                  className="mt-3 w-full py-2 rounded-xl text-sm font-medium bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 transition-all"
                >
                  Create Request
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Request Modal */}
      {showNewRequestModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowNewRequestModal(false)}
        >
          <div
            className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">New Request</h2>
              <button
                onClick={() => setShowNewRequestModal(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-alt)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Request No.</label>
                    <input
                      type="text"
                      value={newRequest.requestNo}
                      readOnly
                      placeholder="Assigned on submission"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Date Submitted</label>
                    <input
                      type="date"
                      value={newRequest.submittedDate}
                      readOnly
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </div>
                  <div>
                    <label htmlFor="procurement-category" className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Category <span className="text-red-400">*</span></label>
                    <select
                      id="procurement-category"
                      value={selectedCategory}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      className="w-full cursor-pointer bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    >
                      <option value="">Select Category</option>
                      {catalogCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="procurement-product" className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Product <span className="text-red-400">*</span></label>
                    <select
                      id="procurement-product"
                      value={newRequest.product}
                      onChange={(e) => setNewRequest({ ...newRequest, product: e.target.value })}
                      disabled={!selectedCategory || categoryProducts.length === 0}
                      className="w-full cursor-pointer bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="">
                        {!selectedCategory
                          ? 'Select a category first'
                          : categoryProducts.length === 0
                            ? 'No products available in this category'
                            : 'Select Product'}
                      </option>
                      {categoryProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Warehouse <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={procurementWarehouse?.name ?? ''}
                      readOnly
                      disabled
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-secondary)] opacity-80 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Priority <span className="text-red-400">*</span></label>
                    <select
                      value={newRequest.priority}
                      onChange={(e) => setNewRequest({ ...newRequest, priority: e.target.value as Priority })}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    >
                      {(['Low', 'Medium', 'High', 'Critical'] as Priority[]).map((priority) => <option key={priority}>{priority}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Quantity <span className="text-red-400">*</span></label>
                    <input
                      type="number"
                      value={newRequest.quantity}
                      onChange={(e) => setNewRequest({ ...newRequest, quantity: e.target.value })}
                      placeholder="0"
                      min="1"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Status</label>
                  <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium">
                    <Clock className="w-4 h-4" />
                    Pending Approval
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
                <button
                  onClick={() => setShowNewRequestModal(false)}
                  className="px-5 py-2.5 border border-[var(--border-color)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleNewRequestSubmit}
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Request Modal */}
      {showCreateModal && selectedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Create Replenishment Request</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-alt)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Product</p>
                    <p className="text-[var(--text-primary)] font-medium">{selectedProduct.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Warehouse</p>
                    <p className="text-[var(--text-primary)]">{selectedProduct.warehouse}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Current Stock</p>
                    <p className="text-[var(--text-primary)]">{selectedProduct.currentStock}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Minimum Stock</p>
                    <p className="text-[var(--text-primary)]">{selectedProduct.minStock}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Forecasted Demand</p>
                    <p className="text-[var(--text-primary)]">{selectedProduct.forecastedDemand}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Recommended Quantity</p>
                    <p className="text-[var(--text-primary)] font-semibold">{selectedProduct.recommendedReorderQty}</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Reason *</label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    placeholder="e.g., Upcoming production surge"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Additional Notes</label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    placeholder="Any additional information..."
                  />
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-5 py-2.5 border border-[var(--border-color)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={submitRequest}
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {showViewModal && selectedRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowViewModal(false)}
        >
          <div
            className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Replenishment Request Details</h2>
              <button
                onClick={() => setShowViewModal(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-alt)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[var(--text-muted)]">Request No.</p>
                <p className="text-[var(--text-primary)] font-medium">{selectedRequest.requestNo}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Requested By</p>
                <p className="text-[var(--text-primary)]">{selectedRequest.requestedBy}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Warehouse</p>
                <p className="text-[var(--text-primary)]">{selectedRequest.warehouse}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Product</p>
                <p className="text-[var(--text-primary)]">{selectedRequest.product}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Requested Quantity</p>
                <p className="text-[var(--text-primary)]">{selectedRequest.requestedQty.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Date</p>
                <p className="text-[var(--text-primary)]">{selectedRequest.submittedDate}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Priority</p>
                <PriorityBadge priority={selectedRequest.priority} />
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Status</p>
                <StatusBadge status={selectedRequest.status} />
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowViewModal(false)}
                className="px-5 py-2.5 border border-[var(--border-color)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)] transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[var(--bg-surface)] text-[var(--text-primary)] px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-300">
          {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-400" />}
          {toast.type === 'error' && <XCircle className="w-5 h-5 text-red-400" />}
          {toast.type === 'info' && <Clock className="w-5 h-5 text-cyan-400" />}
          <span className="text-sm">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ReplenishmentPlanning;
