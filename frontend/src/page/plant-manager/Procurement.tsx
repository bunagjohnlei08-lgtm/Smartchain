// src/page/plant-manager/ReplenishmentPlanning.tsx
import React, { useState, useMemo } from 'react';
import {
  Search,
  Eye,
  Plus,
  X,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Truck,
  RefreshCw,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

type Priority = 'Low' | 'Medium' | 'High' | 'Critical';
type RequestStatus = 'Ready for Request' | 'Pending Approval' | 'Approved' | 'Rejected' | 'Awaiting Delivery';

interface Product {
  id: string;
  name: string;
  sku: string;
  warehouse: string;
  currentStock: number;
  minStock: number;
  forecastedDemand: number;
  recommendedReorderQty: number;
  supplier: string;
  priority: Priority;
  status: RequestStatus;
}

interface RequestHistory {
  id: string;
  requestNo: string;
  product: string;
  warehouse: string;
  supplier: string;
  quantity: number;
  submittedDate: string;
  status: RequestStatus;
  adminDecision?: string;
  submittedBy?: string;
  priority?: Priority;
}

// ============================================
// MOCK DATA
// ============================================

const initialProducts: Product[] = [
  {
    id: '1',
    name: 'Corrugated Box 60x40x40',
    sku: 'PKG-BOX-604',
    warehouse: 'Warehouse B',
    currentStock: 92,
    minStock: 150,
    forecastedDemand: 500,
    recommendedReorderQty: 400,
    supplier: 'Kraftline',
    priority: 'Critical',
    status: 'Ready for Request',
  },
  {
    id: '2',
    name: 'Stainless Steel Sheet 2mm',
    sku: 'RAW-SST-002',
    warehouse: 'Production Line 2',
    currentStock: 34,
    minStock: 40,
    forecastedDemand: 120,
    recommendedReorderQty: 80,
    supplier: 'Nordis',
    priority: 'High',
    status: 'Ready for Request',
  },
  {
    id: '3',
    name: 'Nitrile Gloves (Box 100)',
    sku: 'SAF-GLV-100',
    warehouse: 'Safety Office',
    currentStock: 0,
    minStock: 20,
    forecastedDemand: 80,
    recommendedReorderQty: 60,
    supplier: 'Sentra',
    priority: 'Critical',
    status: 'Pending Approval',
  },
  {
    id: '4',
    name: 'Pallet Wrap Film 500mm',
    sku: 'PKG-WRP-500',
    warehouse: 'Warehouse A',
    currentStock: 74,
    minStock: 120,
    forecastedDemand: 240,
    recommendedReorderQty: 150,
    supplier: 'Kraftline',
    priority: 'Medium',
    status: 'Approved',
  },
  {
    id: '5',
    name: 'Safety Helmet Class E',
    sku: 'SAF-HLM-001',
    warehouse: 'Warehouse C',
    currentStock: 64,
    minStock: 80,
    forecastedDemand: 100,
    recommendedReorderQty: 50,
    supplier: 'Sentra',
    priority: 'Low',
    status: 'Rejected',
  },
];

const initialHistory: RequestHistory[] = [
  {
    id: '1',
    requestNo: 'RR-1001',
    product: 'Industrial LED Panel 40W',
    warehouse: 'Central Depot',
    supplier: 'Volt Systems',
    quantity: 400,
    submittedDate: '2026-08-01',
    status: 'Pending Approval',
    submittedBy: 'M. Santos',
    priority: 'High',
  },
  {
    id: '2',
    requestNo: 'RR-1002',
    product: 'Nitrile Gloves (Box 100)',
    warehouse: 'Safety Office',
    supplier: 'Sentra',
    quantity: 60,
    submittedDate: '2026-07-29',
    status: 'Approved',
    submittedBy: 'M. Santos',
    priority: 'Medium',
    adminDecision: 'Approved - Contact supplier',
  },
  {
    id: '3',
    requestNo: 'RR-1003',
    product: 'Safety Helmet Class E',
    warehouse: 'Warehouse C',
    supplier: 'Sentra',
    quantity: 50,
    submittedDate: '2026-07-25',
    status: 'Rejected',
    submittedBy: 'A. Reyes',
    priority: 'Low',
    adminDecision: 'Insufficient budget',
  },
  {
    id: '4',
    requestNo: 'RR-1004',
    product: 'Corrugated Box 60x40x40',
    warehouse: 'Warehouse B',
    supplier: 'Kraftline',
    quantity: 400,
    submittedDate: '2026-08-02',
    status: 'Pending Approval',
    submittedBy: 'M. Santos',
    priority: 'Critical',
  },
  {
    id: '5',
    requestNo: 'RR-1005',
    product: 'Pallet Wrap Film 500mm',
    warehouse: 'Warehouse A',
    supplier: 'Kraftline',
    quantity: 150,
    submittedDate: '2026-08-03',
    status: 'Awaiting Delivery',
    submittedBy: 'L. Cruz',
    priority: 'Medium',
  },
];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: RequestStatus | string }> = ({ status }) => {
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    'Ready for Request': { color: 'text-slate-400 bg-slate-500/10 border-slate-500/20', icon: Minus },
    'Pending Approval': { color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: Clock },
    'Approved': { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle },
    'Rejected': { color: 'text-red-400 bg-red-500/10 border-red-500/20', icon: XCircle },
    'Awaiting Delivery': { color: 'text-sky-400 bg-sky-500/10 border-sky-500/20', icon: Truck },
  };
  const { color, icon: Icon } = config[status] || config['Ready for Request'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
      <Icon className="w-3 h-3" />
      {status}
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
  // State for products and history
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [history, setHistory] = useState<RequestHistory[]>(initialHistory);

  // Filter states
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [priorityFilter, setPriorityFilter] = useState('All Priorities');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal states
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // New request form state
  const [newRequest, setNewRequest] = useState({
    requestNo: '',
    product: '',
    warehouse: '',
    supplier: '',
    quantity: '',
    submittedDate: new Date().toISOString().slice(0, 10),
    status: 'Pending Approval',
  });

  // Filtered products
  const filteredRequests = useMemo(() => {
    return history.filter((r) => {
      const matchSearch =
        r.requestNo.toLowerCase().includes(search.toLowerCase()) ||
        r.product.toLowerCase().includes(search.toLowerCase()) ||
        r.warehouse.toLowerCase().includes(search.toLowerCase()) ||
        r.supplier.toLowerCase().includes(search.toLowerCase()) ||
        (r.submittedBy && r.submittedBy.toLowerCase().includes(search.toLowerCase()));
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
  const needingReplenishment = products.filter((p) => p.currentStock < p.minStock).length;
  const criticalStock = products.filter((p) => p.priority === 'Critical').length;
  const pendingRequests = products.filter((p) => p.status === 'Pending Approval').length;
  const approvedRequests = products.filter((p) => p.status === 'Approved').length;
  const rejectedRequests = products.filter((p) => p.status === 'Rejected').length;
  const forecastAccuracy = 92; // mock

  // Handlers
  const handleCreateRequest = (product: Product) => {
    setSelectedProduct(product);
    setReason('');
    setNotes('');
    setShowCreateModal(true);
  };

  const handleViewDetails = (request: RequestHistory) => {
    // Convert RequestHistory to Product for viewing
    const product: Product = {
      id: request.id,
      name: request.product,
      sku: '',
      warehouse: request.warehouse,
      currentStock: 0,
      minStock: 0,
      forecastedDemand: 0,
      recommendedReorderQty: request.quantity,
      supplier: request.supplier,
      priority: request.priority || 'Medium',
      status: request.status,
    };
    setSelectedProduct(product);
    setShowViewModal(true);
  };

  const submitRequest = () => {
    if (!selectedProduct) return;
    // Update product status to Pending Approval
    const updatedProducts = products.map((p) => {
      if (p.id === selectedProduct.id) {
        return { ...p, status: 'Pending Approval' as RequestStatus };
      }
      return p;
    });
    setProducts(updatedProducts);

    // Add to history
    const newHistory: RequestHistory = {
      id: String(Date.now()),
      requestNo: `RR-${String(history.length + 1).padStart(4, '0')}`,
      product: selectedProduct.name,
      warehouse: selectedProduct.warehouse,
      supplier: selectedProduct.supplier,
      quantity: selectedProduct.recommendedReorderQty,
      submittedDate: new Date().toISOString().slice(0, 10),
      status: 'Pending Approval',
    };
    setHistory([newHistory, ...history]);

    setShowCreateModal(false);
    setSelectedProduct(null);
    showToast('Request submitted successfully!', 'success');
  };

  const handleNewRequestSubmit = () => {
    if (!newRequest.product || !newRequest.warehouse || !newRequest.supplier || !newRequest.quantity) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    const lastRequestNo = history.length > 0 ? history[0].requestNo : 'RR-0000';
    const nextNo = parseInt(lastRequestNo.replace('RR-', ''), 10) + 1;
    const requestNo = newRequest.requestNo || `RR-${String(nextNo).padStart(4, '0')}`;

    const newHistoryEntry: RequestHistory = {
      id: String(Date.now()),
      requestNo,
      product: newRequest.product,
      warehouse: newRequest.warehouse,
      supplier: newRequest.supplier,
      quantity: Number(newRequest.quantity),
      submittedDate: newRequest.submittedDate,
      status: 'Pending Approval',
    };

    setHistory([newHistoryEntry, ...history]);
    setShowNewRequestModal(false);
    setNewRequest({
      requestNo: '',
      product: '',
      warehouse: '',
      supplier: '',
      quantity: '',
      submittedDate: new Date().toISOString().slice(0, 10),
      status: 'Pending Approval',
    });
    showToast('Request created successfully!', 'success');
  };

  const showToast = (message: string, type: 'success' | 'info' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleApproveRequest = (id: string) => {
    const updatedHistory = history.map((r) =>
      r.id === id ? { ...r, status: 'Approved' as RequestStatus, adminDecision: 'Approved' } : r
    );
    setHistory(updatedHistory);
    showToast('Request approved successfully!', 'success');
  };

  const handleRejectRequest = (id: string) => {
    const updatedHistory = history.map((r) =>
      r.id === id ? { ...r, status: 'Rejected' as RequestStatus, adminDecision: 'Rejected' } : r
    );
    setHistory(updatedHistory);
    showToast('Request rejected.', 'error');
  };

  const handleCancelRequest = (id: string) => {
    const updatedHistory = history.filter((r) => r.id !== id);
    setHistory(updatedHistory);
    showToast('Request withdrawn successfully.', 'info');
  };

  // AI Recommendations mock
  const recommendations = products.filter((p) => p.currentStock < p.minStock).slice(0, 3);

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
          <button className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-alt)]">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={() => setShowNewRequestModal(true)}
            className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 text-slate-950"
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
          trend="+2 vs last week"
          trendType="up"
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
          label="Forecast Accuracy"
          value={`${forecastAccuracy}%`}
          icon={<TrendingUp className="w-5 h-5 text-cyan-400" />}
          trend="+2%"
          trendType="up"
        />
      </div>

      {/* Search & Filters */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search products, SKU, warehouse..." />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={['All Status', 'Pending Approval', 'Approved', 'Rejected', 'Awaiting Delivery']} />
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
      </div>

      {/* Main Table */}
      <div className="w-full max-w-full bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-[var(--bg-surface-alt)] border-b border-[var(--border-color)]">
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Request No.</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Requested By</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Warehouse</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Product</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Supplier</th>
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
                  <td className="px-4 py-3.5 text-sm text-[var(--text-secondary)]">{req.submittedBy || '—'}</td>
                  <td className="px-4 py-3.5 text-sm text-[var(--text-secondary)]">{req.warehouse}</td>
                  <td className="px-4 py-3.5 text-sm text-[var(--text-secondary)]">{req.product}</td>
                  <td className="px-4 py-3.5 text-sm text-[var(--text-secondary)]">{req.supplier}</td>
                  <td className="px-4 py-3.5"><PriorityBadge priority={req.priority || 'Medium'} /></td>
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
                      {req.status === 'Pending Approval' && (
                        <button
                          onClick={() => handleCancelRequest(req.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all"
                          title="Cancel Request"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
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
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Supplier</th>
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
                  <td className="px-4 py-2.5 text-sm text-[var(--text-secondary)]">{item.submittedBy || '—'}</td>
                  <td className="px-4 py-2.5 text-sm text-[var(--text-secondary)]">{item.warehouse}</td>
                  <td className="px-4 py-2.5 text-sm text-[var(--text-secondary)]">{item.product}</td>
                  <td className="px-4 py-2.5 text-sm text-[var(--text-secondary)]">{item.supplier}</td>
                  <td className="px-4 py-2.5"><PriorityBadge priority={item.priority || 'Medium'} /></td>
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
            <span>AI recommends replenishment for <strong>{needingReplenishment}</strong> products.</span>
          </div>
          <div className="bg-[var(--bg-surface-alt)] rounded-xl p-3 text-sm text-[var(--text-secondary)] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5" />
            <span><strong>{criticalStock}</strong> products are below minimum stock.</span>
          </div>
          <div className="bg-[var(--bg-surface-alt)] rounded-xl p-3 text-sm text-[var(--text-secondary)] flex items-start gap-2">
            <Clock className="w-4 h-4 text-amber-400 mt-0.5" />
            <span><strong>{pendingRequests}</strong> requests waiting for Admin approval.</span>
          </div>
          <div className="bg-[var(--bg-surface-alt)] rounded-xl p-3 text-sm text-[var(--text-secondary)] flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5" />
            <span>Forecast confidence: <strong>{forecastAccuracy}%</strong></span>
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
                  className="mt-3 w-full py-2 rounded-xl text-sm font-medium bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all"
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
                      onChange={(e) => setNewRequest({ ...newRequest, requestNo: e.target.value })}
                      placeholder="Auto-generated if empty"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Date Submitted</label>
                    <input
                      type="date"
                      value={newRequest.submittedDate}
                      onChange={(e) => setNewRequest({ ...newRequest, submittedDate: e.target.value })}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Product <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={newRequest.product}
                      onChange={(e) => setNewRequest({ ...newRequest, product: e.target.value })}
                      placeholder="Product name"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Warehouse <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={newRequest.warehouse}
                      onChange={(e) => setNewRequest({ ...newRequest, warehouse: e.target.value })}
                      placeholder="Warehouse name"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Supplier <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={newRequest.supplier}
                      onChange={(e) => setNewRequest({ ...newRequest, supplier: e.target.value })}
                      placeholder="Supplier name"
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]">Quantity <span className="text-red-400">*</span></label>
                    <input
                      type="number"
                      value={newRequest.quantity}
                      onChange={(e) => setNewRequest({ ...newRequest, quantity: e.target.value })}
                      placeholder="0"
                      min="0"
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
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 text-slate-950"
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
                  <div className="col-span-2">
                    <p className="text-xs text-[var(--text-muted)]">Supplier</p>
                    <p className="text-[var(--text-primary)]">{selectedProduct.supplier}</p>
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
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 text-slate-950"
                >
                  Submit Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {showViewModal && selectedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowViewModal(false)}
        >
          <div
            className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Product Details</h2>
              <button
                onClick={() => setShowViewModal(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-alt)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[var(--text-muted)]">Product</p>
                <p className="text-[var(--text-primary)] font-medium">{selectedProduct.name}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">SKU</p>
                <p className="text-[var(--text-primary)] font-mono">{selectedProduct.sku}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Warehouse</p>
                <p className="text-[var(--text-primary)]">{selectedProduct.warehouse}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Supplier</p>
                <p className="text-[var(--text-primary)]">{selectedProduct.supplier}</p>
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
                <p className="text-xs text-[var(--text-muted)]">Recommended Qty</p>
                <p className="text-[var(--text-primary)] font-semibold">{selectedProduct.recommendedReorderQty}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Priority</p>
                <PriorityBadge priority={selectedProduct.priority} />
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Status</p>
                <StatusBadge status={selectedProduct.status} />
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