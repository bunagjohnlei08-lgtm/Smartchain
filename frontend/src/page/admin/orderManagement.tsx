// src/pages/admin/OrderManagement.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';
import { useAdminDetailOverlay } from '../../components/layout/AdminDetailOverlayContext';
import {
  RotateCw,
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  X,
  CheckCircle,
  Clock,
  Package,
  Truck,
  User,
  Calendar,
  MapPin,
  Circle,
  Check,
  LayoutGrid,
  LayoutList,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

type OrderStatus =
  | 'New'
  | 'Assigned'
  | 'Preparing'
  | 'Ready for Stock Out'
  | 'Stock Out In Progress'
  | 'Stock Out Completed'
  | 'Ready for Shipment'
  | 'Forwarded to Logistics'
  | 'In Transit'
  | 'Delivered'
  | 'Cancelled';

interface OrderItem {
  id: string;
  productId: number | null;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  productReferenceRequired: boolean;
}

interface Order {
  id: string;
  orderNo: string;
  refNo: string;
  customer: string;
  address: string;
  contact: string;
  orderDate: string;
  requiredDelivery: string;
  items: OrderItem[];
  itemCount: number;
  totalAmount: number;
  status: string;
  assignedTo: string | null;
  assignedDate: string | null;
  products: string[];
  hasInvalidProductReferences: boolean;
}

interface CatalogOrderProduct {
  id: number;
  name: string;
  category: string;
  unit: string | null;
}

type OrderSummary = Record<string, number>;

interface CreateOrderForm {
  referenceNo: string;
  customerName: string;
  customerAddress: string;
  customerContact: string;
  orderDate: string;
  requiredDeliveryDate: string;
  productId: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

const orderUnitOptions = ['pcs', 'bulk', 'kg'] as const;

const dateInputValue = (date: Date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

const emptyCreateOrderForm = (): CreateOrderForm => {
  const today = new Date();
  const requiredDelivery = new Date(today);
  requiredDelivery.setDate(requiredDelivery.getDate() + 7);

  return {
    referenceNo: '', customerName: '', customerAddress: '', customerContact: '',
    orderDate: dateInputValue(today), requiredDeliveryDate: dateInputValue(requiredDelivery),
    productId: '', quantity: '', unit: '', unitPrice: '',
  };
};

const statusLabels: Record<string, OrderStatus> = {
  NEW: 'New', ASSIGNED: 'Assigned', PREPARING: 'Preparing',
  READY_FOR_STOCK_OUT: 'Ready for Stock Out', STOCK_OUT_IN_PROGRESS: 'Stock Out In Progress', STOCK_OUT_COMPLETED: 'Stock Out Completed',
  READY_FOR_SHIPMENT: 'Ready for Shipment', IN_TRANSIT: 'In Transit',
  FORWARDED_TO_LOGISTICS: 'Forwarded to Logistics',
  DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
};

const normalizeStatusKey = (status: unknown) => String(status ?? '')
  .trim()
  .replace(/[\s-]+/g, '_')
  .replace(/_+/g, '_')
  .toUpperCase();

const normalizeOrderStatus = (status: unknown): string => {
  const originalStatus = String(status ?? '').trim();
  return statusLabels[normalizeStatusKey(status)] ?? (originalStatus || 'Unknown');
};

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '';

const mapOrder = (order: any): Order => ({
  id: String(order.id), orderNo: order.order_no, refNo: order.reference_no || '',
  customer: order.customer_name, address: order.customer_address || '', contact: order.customer_contact || '',
  orderDate: formatDate(order.order_date), requiredDelivery: formatDate(order.required_delivery_date),
  items: (order.items || []).map((item: any) => ({ id: String(item.id), productId: item.product_id ? Number(item.product_id) : null, name: item.product_name || 'Unnamed product', quantity: Number(item.quantity), unit: item.unit, unitPrice: Number(item.unit_price), subtotal: Number(item.subtotal), productReferenceRequired: Boolean(item.product_reference_required || !item.product_id) })),
  itemCount: Number(order.items_count ?? order.items?.length ?? 0),
  totalAmount: Number(order.total_amount), status: normalizeOrderStatus(order.status),
  assignedTo: order.assigned_to?.name || null, assignedDate: formatDate(order.assigned_at) || null,
  products: order.products || (order.items || []).map((item: any) => item.product_name || 'Unnamed product'),
  hasInvalidProductReferences: Boolean(order.has_invalid_product_references),
});

// ============================================
// HELPER COMPONENTS
// ============================================

interface StatusConfig {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
}

const statusConfigs: Record<OrderStatus, StatusConfig> = {
  New: {
    label: 'New',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    icon: <Circle className="w-3 h-3 fill-blue-400 text-blue-400" />,
  },
  Assigned: {
    label: 'Assigned',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    icon: <User className="w-3 h-3 text-orange-400" />,
  },
  Preparing: {
    label: 'Preparing',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    icon: <Package className="w-3 h-3 text-purple-400" />,
  },
  'Ready for Stock Out': {
    label: 'Ready for Stock Out',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: <Package className="w-3 h-3 text-amber-400" />,
  },
  'Stock Out In Progress': {
    label: 'Stock Out In Progress',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    icon: <Package className="w-3 h-3 text-cyan-400" />,
  },
  'Stock Out Completed': {
    label: 'Stock Out Completed',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    icon: <Check className="w-3 h-3 text-violet-400" />,
  },
  'Ready for Shipment': {
    label: 'Ready for Shipment',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    icon: <Check className="w-3 h-3 text-green-400" />,
  },
  'Forwarded to Logistics': {
    label: 'Forwarded to Logistics',
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/30',
    icon: <Truck className="w-3 h-3 text-sky-400" />,
  },
  'In Transit': {
    label: 'In Transit',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    icon: <Truck className="w-3 h-3 text-cyan-400" />,
  },
  Delivered: {
    label: 'Delivered',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    icon: <CheckCircle className="w-3 h-3 text-emerald-400" />,
  },
  Cancelled: {
    label: 'Cancelled',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    icon: <X className="w-3 h-3 text-red-400" />,
  },
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const normalizedStatus = normalizeOrderStatus(status);
  const config = statusConfigs[normalizedStatus as OrderStatus] ?? {
    label: normalizedStatus,
    color: 'text-slate-300',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/30',
    icon: <Circle className="w-3 h-3 text-slate-400" />,
  };
  return (
    <span
      className={`admin-badge admin-status-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${config.color} ${config.bg} ${config.border}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
};

const KpiCard: React.FC<{
  label: string;
  count: number;
  subtitle: string;
  color: string;
  bg: string;
}> = ({ label, count, subtitle, color, bg }) => {
  return (
    <div className="admin-orders-kpi flex flex-col rounded-xl border border-slate-800/80 bg-[#0b101d] p-4 transition-colors hover:border-slate-700">
      <div className="admin-orders-kpi-main flex items-center gap-3">
        <div className={`admin-orders-kpi-icon rounded-lg p-2.5 ${bg} ${color}`}>
          <Package className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="admin-orders-kpi-title break-words text-[12px] font-medium uppercase tracking-wider text-slate-400 sm:text-xs">{label}</p>
          <p className="admin-orders-kpi-value text-[15px] font-semibold text-white sm:text-2xl sm:font-bold">{count}</p>
        </div>
      </div>
      <p className={`admin-orders-kpi-helper mt-1 text-[10px] font-medium sm:text-xs ${color}`}>{subtitle}</p>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const OrderManagement: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  useAdminDetailOverlay(isDrawerOpen && selectedOrder !== null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [summary, setSummary] = useState<OrderSummary>({});
  const [plantManagers, setPlantManagers] = useState<Array<{ id: number; name: string; employee_id?: string }>>([]);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [managerId, setManagerId] = useState('');
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [assignmentError, setAssignmentError] = useState('');
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [createOrderForm, setCreateOrderForm] = useState<CreateOrderForm>(emptyCreateOrderForm);
  const [catalogProducts, setCatalogProducts] = useState<CatalogOrderProduct[]>([]);
  const [selectedProductCategory, setSelectedProductCategory] = useState('');
  const [productsLoading, setProductsLoading] = useState(false);
  const [createOrderBusy, setCreateOrderBusy] = useState(false);
  const [createOrderError, setCreateOrderError] = useState('');

  const loadOrders = useCallback(async () => {
    const [ordersResponse, summaryResponse] = await Promise.all([
      apiClient.get('/admin/orders', { params: { search: search || undefined, status: status || undefined, date_from: dateFrom || undefined, per_page: 100 } }),
      apiClient.get('/admin/orders/summary'),
    ]);
    setOrders(ordersResponse.data.data.map(mapOrder));
    setSummary(summaryResponse.data);
  }, [search, status, dateFrom]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const handleViewOrder = async (order: Order) => {
    const response = await apiClient.get(`/admin/orders/${order.id}`);
    setSelectedOrder(mapOrder(response.data));
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
  };

  const openAssignment = async () => {
    if (!selectedOrder) return;
    setAssignmentError('');
    const response = await apiClient.get('/admin/orders/plant-managers');
    setPlantManagers(response.data);
    setManagerId('');
    setAssignmentOpen(true);
  };

  const assignOrder = async () => {
    if (!selectedOrder || !managerId) return;
    setAssignmentBusy(true);
    setAssignmentError('');
    try {
      const response = await apiClient.patch(`/admin/orders/${selectedOrder.id}/assign`, { assigned_to: Number(managerId) });
      setSelectedOrder(mapOrder(response.data));
      setAssignmentOpen(false);
      await loadOrders();
    } catch (error: any) {
      setAssignmentError(error?.response?.data?.message || Object.values(error?.response?.data?.errors || {}).flat()[0] || 'Assignment could not be saved.');
    } finally {
      setAssignmentBusy(false);
    }
  };

  const openCreateOrder = async () => {
    setCreateOrderForm(emptyCreateOrderForm());
    setSelectedProductCategory('');
    setCreateOrderError('');
    setCreateOrderOpen(true);
    setProductsLoading(true);
    try {
      const response = await apiClient.get('/admin/orders/products');
      setCatalogProducts((response.data ?? []).map((product: any) => ({
        id: Number(product.id),
        name: String(product.name),
        category: String(product.category ?? ''),
        unit: product.unit ? String(product.unit) : null,
      })));
    } catch (error: any) {
      setCatalogProducts([]);
      setCreateOrderError(error?.response?.data?.message || 'Product Catalog could not be loaded.');
    } finally {
      setProductsLoading(false);
    }
  };

  const productCategories = Array.from(new Set(
    catalogProducts.map((product) => product.category).filter(Boolean)
  )).sort();
  const filteredCatalogProducts = selectedProductCategory
    ? catalogProducts.filter((product) => product.category === selectedProductCategory)
    : [];

  const selectProductCategory = (category: string) => {
    setSelectedProductCategory(category);
    setCreateOrderForm((current) => ({ ...current, productId: '', unit: '' }));
  };

  const selectCreateOrderProduct = (productId: string) => {
    const product = catalogProducts.find((item) => String(item.id) === productId);
    const productUnit = product?.unit?.trim().toLowerCase() ?? '';
    setCreateOrderForm((current) => ({
      ...current,
      productId,
      unit: orderUnitOptions.some((unit) => unit === productUnit) ? productUnit : '',
    }));
  };

  const submitCreateOrder = async () => {
    setCreateOrderError('');
    const product = catalogProducts.find((item) => String(item.id) === createOrderForm.productId);
    if (!createOrderForm.customerName.trim() || !createOrderForm.customerAddress.trim()
      || !createOrderForm.orderDate || !createOrderForm.requiredDeliveryDate || !product
      || product.category !== selectedProductCategory
      || Number(createOrderForm.quantity) <= 0 || !createOrderForm.unit.trim()
      || createOrderForm.unitPrice === '' || Number(createOrderForm.unitPrice) < 0) {
      setCreateOrderError('Complete all required fields with valid order values.');
      return;
    }

    setCreateOrderBusy(true);
    try {
      await apiClient.post('/admin/orders', {
        reference_no: createOrderForm.referenceNo.trim() || null,
        customer_name: createOrderForm.customerName.trim(),
        customer_address: createOrderForm.customerAddress.trim(),
        customer_contact: createOrderForm.customerContact.trim() || null,
        order_date: createOrderForm.orderDate,
        required_delivery_date: createOrderForm.requiredDeliveryDate,
        items: [{
          product_id: product.id,
          quantity: Number(createOrderForm.quantity),
          unit: createOrderForm.unit.trim(),
          unit_price: Number(createOrderForm.unitPrice),
        }],
      });
      setCreateOrderOpen(false);
      await loadOrders();
    } catch (error: any) {
      setCreateOrderError(error?.response?.data?.message
        || Object.values(error?.response?.data?.errors || {}).flat()[0]
        || 'Order could not be created.');
    } finally {
      setCreateOrderBusy(false);
    }
  };


  // KPI Data
  const summaryCount = (...statuses: string[]) => statuses.reduce(
    (total, orderStatus) => total + (Number(summary[orderStatus]) || 0),
    0
  );
  const kpis = [
    { label: 'NEW ORDERS', count: summaryCount('NEW'), subtitle: 'Awaiting Review', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'ASSIGNED', count: summaryCount('ASSIGNED'), subtitle: 'To Plant Managers', color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { label: 'PREPARING', count: summaryCount('PREPARING'), subtitle: 'In Progress', color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'READY FOR SHIPMENT', count: summaryCount('READY_FOR_SHIPMENT'), subtitle: 'Ready to Pickup', color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'IN TRANSIT', count: summaryCount('FORWARDED_TO_LOGISTICS', 'IN_TRANSIT'), subtitle: 'With Logistics', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { label: 'DELIVERED', count: summaryCount('DELIVERED'), subtitle: 'Completed', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'CANCELLED', count: summaryCount('CANCELLED'), subtitle: 'Cancelled', color: 'text-red-400', bg: 'bg-red-500/10' },
  ];

  // Lifecycle steps for timeline
  const lifecycleSteps: string[] = ['New', 'Assigned', 'Preparing', 'Ready for Stock Out', 'Stock Out In Progress', 'Stock Out Completed', 'Ready for Shipment', 'Forwarded to Logistics', 'In Transit', 'Delivered'];

  return (
    <div className="w-full min-h-screen bg-[#070a12] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 overflow-x-hidden">
      {/* ============================================================
      HEADER
      ============================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold leading-7 tracking-tight text-white sm:text-2xl">Order Management</h1>
          <p className="mt-0.5 max-w-[34rem] text-[12px] leading-4 text-slate-400 sm:mt-1 sm:text-sm sm:leading-5">
            Manage and track customer orders from other groups. Assign to plant manager and monitor fulfillment.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => void loadOrders()} className="admin-orders-refresh inline-flex h-8 w-auto cursor-pointer items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[12px] font-medium leading-4 text-slate-300 transition-colors hover:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-cyan-500 sm:h-auto sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm sm:leading-5">
            <RotateCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Refresh
          </button>
          <button onClick={() => void openCreateOrder()} className="admin-orders-create inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-medium leading-4 text-white shadow-lg shadow-[#092635]/20 transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 sm:min-h-11 sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm sm:leading-5">
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Create Order
          </button>
        </div>
      </div>

      {/* ============================================================
      KPI CARDS
      ============================================================ */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {kpis.map((kpi, idx) => (
          <KpiCard key={idx} {...kpi} />
        ))}
      </div>

      {/* ============================================================
      TABLE & SEARCH CONTROLS
      ============================================================ */}
      <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-4 space-y-4">
        <div className="admin-orders-toolbar grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:gap-3">
          <div className="relative col-span-2 w-full min-w-0 sm:flex-1 sm:min-w-[200px]">
            <Search className="admin-orders-toolbar-search-icon absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Order No., Customer, Product, Reference No..."
              className="admin-orders-toolbar-search h-11 w-full rounded-lg border border-slate-800 bg-[#070a12] py-1.5 pl-9 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 sm:h-auto sm:py-2 sm:pr-4 sm:text-sm"
            />
          </div>

          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Order status" className="admin-orders-toolbar-status col-span-2 h-11 w-full rounded-lg border border-slate-800 bg-[#070a12] px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 sm:h-auto sm:w-auto sm:px-3 sm:py-2 sm:text-sm">
            <option value="">All Status</option>
            <option value="NEW">New</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="PREPARING">Preparing</option>
            <option value="READY_FOR_STOCK_OUT">Ready for Stock Out</option>
            <option value="STOCK_OUT_IN_PROGRESS">Stock Out In Progress</option>
            <option value="STOCK_OUT_COMPLETED">Stock Out Completed</option>
            <option value="READY_FOR_SHIPMENT">Ready for Shipment</option>
            <option value="FORWARDED_TO_LOGISTICS">Forwarded to Logistics</option>
            <option value="IN_TRANSIT">In Transit</option>
            <option value="DELIVERED">Delivered</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <div className="relative min-w-0 sm:min-w-fit">
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              aria-label="Order date from"
              className="admin-orders-toolbar-date h-11 w-full min-w-0 rounded-lg border border-slate-800 bg-[#070a12] py-1.5 pl-2.5 pr-8 text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 sm:h-auto sm:w-36 sm:px-3 sm:py-2 sm:text-sm"
            />
            <Calendar className="admin-orders-toolbar-date-icon pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500 sm:right-3 sm:h-4 sm:w-4" />
          </div>

          <button className="admin-orders-toolbar-filter inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800/50 sm:h-auto sm:w-auto sm:gap-2 sm:px-4 sm:py-2 sm:text-sm">
            <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Filter
          </button>

          <div className="col-span-2 flex items-center gap-4 sm:contents">
            <div className="admin-orders-toolbar-view flex items-center justify-self-start gap-1 rounded-lg border border-slate-700 bg-[#070a12] p-1 sm:ml-auto" aria-label="Order view">
              <button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} title="List view" className={`admin-orders-toolbar-view-button rounded-md p-1.5 transition-colors ${viewMode === 'list' ? 'bg-slate-200 text-slate-900 dark:bg-[#092635] dark:text-white' : 'text-slate-400 hover:text-white'}`}><LayoutList className="h-4 w-4" /></button>
              <button type="button" onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} title="Grid view" className={`admin-orders-toolbar-view-button rounded-md p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-slate-200 text-slate-900 dark:bg-[#092635] dark:text-white' : 'text-slate-400 hover:text-white'}`}><LayoutGrid className="h-4 w-4" /></button>
            </div>

            <button className="admin-orders-toolbar-export inline-flex h-11 items-center justify-self-end gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 sm:h-auto sm:gap-2 sm:px-4 sm:py-2 sm:text-sm">
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>

        {/* Table */}
        {viewMode === 'list' ? (
        <div className="admin-table-scroll w-full custom-scrollbar">
          <table className="admin-order-table admin-responsive-table admin-cols-10 admin-sticky-1 table-auto w-full min-w-[1400px] border-collapse text-sm">
            <thead className="border-b border-slate-800/80">
              <tr>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Order No.</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Customer</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Order Date</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Required Delivery</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Products</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Items</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Total Amount</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Assigned To</th>
                <th className="text-right py-3 px-3 text-xs font-medium uppercase tracking-wider text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors cursor-pointer" onClick={() => handleViewOrder(order)}>
                  <td className="py-3 px-3">
                    <p className="font-mono text-slate-900 dark:text-blue-400 hover:underline font-medium">{order.orderNo}</p>
                    <p className="text-xs text-slate-500">{order.refNo}</p>
                  </td>
                  <td className="py-3 px-3">
                    <p className="text-slate-200">{order.customer}</p>
                    <p className="text-xs text-slate-500">{order.address.split(',').slice(1).join(',').trim()}</p>
                  </td>
                  <td className="py-3 px-3 text-slate-300">{order.orderDate}</td>
                  <td className="py-3 px-3 text-slate-300">{order.requiredDelivery}</td>
                  <td className="max-w-56 py-3 px-3 text-slate-300">
                    {order.products.length ? order.products.map(product => <p key={product} className="text-slate-200">{product}</p>) : <p className="text-slate-500">No products</p>}
                  </td>
                  <td className="py-3 px-3 text-slate-300">{order.itemCount} items</td>
                  <td className="py-3 px-3 text-white font-medium">₱{order.totalAmount.toLocaleString()}</td>
                  <td className="py-3 px-3"><StatusBadge status={order.status} /></td>
                  <td className="py-3 px-3">
                    {order.assignedTo ? (
                      <div>
                        <p className="text-slate-200">{order.assignedTo}</p>
                        <p className="text-xs text-slate-500">Plant Manager</p>
                      </div>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleViewOrder(order); }}
                      className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        ) : orders.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {orders.map((order) => (
              <article key={order.id} onClick={() => handleViewOrder(order)} className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600">
                <div className="flex items-start justify-between gap-3"><div><h3 className="font-mono font-semibold text-slate-900 dark:text-blue-400">{order.orderNo}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{order.refNo}</p></div><StatusBadge status={order.status} /></div>
                <p className="mt-4 font-medium text-slate-900 dark:text-white">{order.customer}</p><p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{order.address}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500 dark:text-slate-400">Required delivery</dt><dd className="text-slate-900 dark:text-white">{order.requiredDelivery}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Items</dt><dd className="text-slate-900 dark:text-white">{order.itemCount}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Total amount</dt><dd className="font-semibold text-slate-900 dark:text-white">₱{order.totalAmount.toLocaleString()}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Assigned to</dt><dd className="text-slate-900 dark:text-white">{order.assignedTo || '—'}</dd></div></dl>
                <div className="mt-4 flex justify-end border-t border-slate-200 pt-3 dark:border-slate-700"><button onClick={(event) => { event.stopPropagation(); handleViewOrder(order); }} className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" title="View Details"><Eye className="h-4 w-4" /></button></div>
              </article>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-slate-400">No orders found matching your criteria.</div>
        )}
      </div>

      {/* ============================================================
      BOTTOM SECTION (TIMELINE & ITEMS PREVIEW)
      ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline Card */}
        <div className="min-w-0 overflow-hidden rounded-xl border border-slate-800/80 bg-[#0b101d] p-5 lg:col-span-2">
          <h3 className="text-base font-semibold text-white mb-6 flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            Recent Order Timeline
          </h3>
          <div className="max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]">
          <div className="relative flex min-w-[800px] items-start pb-2">
            {lifecycleSteps.map((step, idx) => {
              const currentStatusIndex = lifecycleSteps.indexOf(selectedOrder?.status || 'New');
              const isCompleted = idx <= currentStatusIndex;
              const isCurrent = idx === currentStatusIndex;
              return (
                <div key={step} className="relative flex min-w-20 flex-1 flex-col items-center">
                  <div className="relative flex h-8 w-full shrink-0 items-center justify-center">
                    {/* Connector Line */}
                    {idx < lifecycleSteps.length - 1 && (
                      <div className={`absolute left-1/2 top-1/2 h-0.5 w-full -translate-y-1/2 ${isCompleted ? 'bg-cyan-500' : 'bg-slate-700'}`} />
                    )}
                    {/* Dot */}
                    <div
                      className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                        isCompleted
                          ? 'border-cyan-500 bg-cyan-500/20 text-cyan-500'
                          : isCurrent
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-500 animate-pulse'
                          : 'border-slate-600 bg-slate-800/50 text-slate-600'
                      }`}
                    >
                      {isCompleted ? <Check className="w-4 h-4" /> : <span className="text-xs font-bold">{idx + 1}</span>}
                    </div>
                  </div>
                  {/* Label */}
                  <p className={`mt-1.5 w-full px-1 text-center text-[10px] font-medium leading-3 sm:mt-2 sm:text-xs sm:leading-4 ${isCompleted ? 'text-white' : 'text-slate-500'}`}>
                    {step}
                  </p>
                  <p className="mt-1 w-full px-1 text-center text-[10px] leading-3 text-slate-500">
                    {isCompleted && selectedOrder?.assignedDate ? selectedOrder.assignedDate : ''}
                  </p>
                </div>
              );
            })}
          </div>
          </div>
        </div>

        {/* Order Items Preview Card */}
        <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-5">
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-cyan-400" />
            Order Items Preview
          </h3>
          {selectedOrder ? (
            <div className="space-y-3">
              {selectedOrder.items.slice(0, 4).map((item) => (
                <div key={item.id} className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                  <div>
                    <p className="text-sm text-slate-200">{item.name}</p>
                  </div>
                  <div className="text-sm text-slate-400 font-medium">
                    {item.quantity} {item.unit}
                  </div>
                </div>
              ))}
              {selectedOrder.items.length > 4 && (
                <button className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors mt-2">
                  View All Items ({selectedOrder.items.length})
                </button>
              )}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">Select an order to preview items.</p>
          )}
        </div>
      </div>

      {/* ============================================================
      RIGHT DRAWER: ORDER DETAILS
      ============================================================ */}
      {isDrawerOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="min-w-0 flex-1 bg-black/60 backdrop-blur-sm" onClick={handleCloseDrawer}></div>
          {/* Drawer */}
          <div className="admin-order-details-drawer flex h-full w-[96vw] shrink-0 flex-col gap-4 overflow-x-hidden overflow-y-auto overscroll-y-contain border-l border-slate-800 bg-[#0b101d] p-3 animate-in slide-in-from-right duration-300 min-[400px]:w-[92vw] sm:w-96 sm:gap-6 sm:p-6">
            {/* Header */}
            <div className="admin-order-details-header sticky top-0 z-10 -mx-3 -mt-3 flex items-start justify-between gap-2 bg-[#0b101d] px-3 py-3 sm:static sm:mx-0 sm:mt-0 sm:bg-transparent sm:p-0">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="whitespace-nowrap text-base font-bold leading-tight text-white sm:text-xl">
                  {selectedOrder.orderNo}
                </h2>
                <StatusBadge status={selectedOrder.status} />
                </div>
                <p className="text-sm text-slate-400">{selectedOrder.refNo}</p>
              </div>
              <button aria-label="Close order details" onClick={handleCloseDrawer} className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 dark:hover:bg-slate-700 dark:hover:text-white sm:min-h-0 sm:min-w-0 sm:p-1.5">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Order Date */}
            <div className="admin-order-details-date flex items-start gap-2 text-xs text-slate-400 sm:items-center sm:text-sm">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" />
              <span className="break-words">Order Date: {selectedOrder.orderDate}</span>
            </div>

            {/* Customer Info */}
            <div className="admin-order-details-customer space-y-2 rounded-xl border border-slate-700 bg-slate-800/30 p-3 sm:p-4">
              <h4 className="text-sm font-semibold text-white">Customer Information</h4>
              <p className="text-slate-200 font-medium">{selectedOrder.customer}</p>
              <p className="text-slate-400 text-sm flex items-start gap-2">
                <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="min-w-0 break-words">{selectedOrder.address}</span>
              </p>
              <p className="text-slate-400 text-sm flex items-center gap-2">
                <User className="w-4 h-4" />
                {selectedOrder.contact}
              </p>
            </div>

            {/* Order Summary */}
            <div className="admin-order-details-summary space-y-2 rounded-xl border border-slate-700 bg-slate-800/30 p-3 text-sm sm:p-4 sm:text-base">
              <h4 className="text-sm font-semibold text-white">Order Summary</h4>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Items</span>
                <span className="text-white font-medium">{selectedOrder.itemCount} items</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Total Amount</span>
                <span className="text-white font-bold">₱{selectedOrder.totalAmount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Required Delivery</span>
                <span className="min-w-0 break-words text-right text-slate-200">{selectedOrder.requiredDelivery}</span>
              </div>
            </div>

            {/* Status & Assignment */}
            <div className="admin-order-details-assignment space-y-2 rounded-xl border border-slate-700 bg-slate-800/30 p-3 text-sm sm:p-4 sm:text-base">
              <h4 className="text-sm font-semibold text-white">Status & Assignment</h4>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Status</span>
                <StatusBadge status={selectedOrder.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Assigned To</span>
                <span className="text-white font-medium">{selectedOrder.assignedTo || 'Unassigned'}</span>
              </div>
              {selectedOrder.assignedDate && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Assigned Date</span>
                  <span className="text-slate-300">{selectedOrder.assignedDate}</span>
                </div>
              )}
            </div>

            <div className="admin-order-details-items">
              <h4 className="text-sm font-semibold text-white">Order Items</h4>
              <div className="admin-order-details-items-scroll admin-table-scroll mt-3 rounded-xl border border-slate-700">
                <table className="admin-order-details-items-table admin-responsive-table admin-cols-5 admin-sticky-1 w-full min-w-[620px] text-xs">
                  <thead className="bg-[#070a12] text-slate-400"><tr><th className="px-3 py-2 text-left">Product</th><th className="px-3 py-2 text-right">Ordered Quantity</th><th className="px-3 py-2 text-left">Unit</th><th className="px-3 py-2 text-right">Unit Price</th><th className="px-3 py-2 text-right">Subtotal</th></tr></thead>
                  <tbody className="divide-y divide-slate-800">{selectedOrder.items.map(item => <tr key={item.id}>
                    <td className="px-3 py-3 text-slate-200">{item.name}</td>
                    <td className="px-3 py-3 text-right text-white">{item.quantity}</td><td className="px-3 py-3 text-slate-300">{item.unit}</td><td className="px-3 py-3 text-right text-slate-300">₱{item.unitPrice.toLocaleString()}</td><td className="px-3 py-3 text-right text-white">₱{item.subtotal.toLocaleString()}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="admin-order-details-actions mt-auto space-y-2 border-t border-slate-800 pt-3 sm:space-y-3 sm:pt-4">
              <h4 className="text-sm font-semibold text-white">Actions</h4>
              <button
                onClick={() => selectedOrder && void handleViewOrder(selectedOrder)}
                className="min-h-11 w-full rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                View Order Details
              </button>
              <button
                onClick={() => void openAssignment()}
                disabled={!['New', 'Assigned'].includes(selectedOrder.status)}
                className="min-h-11 w-full rounded-lg border border-orange-500/50 px-3 py-2.5 text-sm font-medium text-orange-400 transition-colors hover:bg-orange-500/10 focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {selectedOrder.status === 'Assigned' ? 'Reassign Plant Manager' : 'Assign to Plant Manager'}
              </button>
            </div>
          </div>
        </div>
      )}

      {assignmentOpen && selectedOrder && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="assignment-title">
        <div className="admin-assign-manager-modal w-full max-w-md rounded-2xl border border-slate-700 bg-[#0b101d] p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4"><div><h2 id="assignment-title" className="text-lg font-semibold text-white">Assign Plant Manager</h2><p className="mt-1 text-sm text-slate-400">{selectedOrder.orderNo} will remain the same order record.</p></div><button onClick={() => setAssignmentOpen(false)} aria-label="Close assignment dialog" className="min-h-11 min-w-11 cursor-pointer rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"><X className="mx-auto h-5 w-5" /></button></div>
          {assignmentError && <p role="alert" className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{assignmentError}</p>}
          <label className="mt-5 block text-sm text-slate-300">Available Plant Manager<select value={managerId} onChange={event => setManagerId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-[#070a12] px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"><option value="">Select a Plant Manager</option>{plantManagers.map(manager => <option key={manager.id} value={manager.id}>{manager.name}{manager.employee_id ? ` — ${manager.employee_id}` : ''}</option>)}</select></label>
          {!plantManagers.length && <p className="mt-2 text-sm text-amber-300">No active Plant Managers are available.</p>}
          <div className="mt-6 flex justify-end gap-3"><button onClick={() => setAssignmentOpen(false)} className="min-h-11 cursor-pointer rounded-lg border border-slate-700 px-4 text-slate-300 hover:bg-slate-800">Close</button><button onClick={() => void assignOrder()} disabled={!managerId || assignmentBusy} className="min-h-11 cursor-pointer rounded-lg bg-slate-900 px-4 font-semibold text-white hover:bg-slate-800 dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{assignmentBusy ? 'Assigning…' : 'Save Assignment'}</button></div>
        </div>
      </div>}

      {createOrderOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="create-order-title">
        <div className="admin-create-order-modal max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-[#0b101d] p-5 shadow-2xl sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div><h2 id="create-order-title" className="text-xl font-semibold text-white">Create Order</h2><p className="mt-1 text-sm text-slate-400">Temporary manual entry for workflow testing. The order will start as New.</p></div>
            <button onClick={() => setCreateOrderOpen(false)} aria-label="Close create order dialog" className="min-h-11 min-w-11 cursor-pointer rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"><X className="mx-auto h-5 w-5" /></button>
          </div>
          {createOrderError && <p role="alert" className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{createOrderError}</p>}
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-300">Customer name <span className="text-rose-400">*</span><input value={createOrderForm.customerName} onChange={event => setCreateOrderForm(current => ({ ...current, customerName: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-[#070a12] px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" /></label>
            <label className="text-sm text-slate-300">Customer contact<input value={createOrderForm.customerContact} onChange={event => setCreateOrderForm(current => ({ ...current, customerContact: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-[#070a12] px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" /></label>
            <label className="text-sm text-slate-300 sm:col-span-2">Customer address / destination <span className="text-rose-400">*</span><textarea value={createOrderForm.customerAddress} onChange={event => setCreateOrderForm(current => ({ ...current, customerAddress: event.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#070a12] px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" /></label>
            <label className="text-sm text-slate-300">Order date <span className="text-rose-400">*</span><input type="date" value={createOrderForm.orderDate} onChange={event => setCreateOrderForm(current => ({ ...current, orderDate: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-[#070a12] px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" /></label>
            <label className="text-sm text-slate-300">Required delivery date <span className="text-rose-400">*</span><input type="date" min={createOrderForm.orderDate} value={createOrderForm.requiredDeliveryDate} onChange={event => setCreateOrderForm(current => ({ ...current, requiredDeliveryDate: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-[#070a12] px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" /></label>
            <label className="text-sm text-slate-300 sm:col-span-2">Reference number<input value={createOrderForm.referenceNo} onChange={event => setCreateOrderForm(current => ({ ...current, referenceNo: event.target.value }))} placeholder="Optional external reference" className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-[#070a12] px-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500" /></label>
            <label className="text-sm text-slate-300 sm:col-span-2">Category <span className="text-rose-400">*</span><select value={selectedProductCategory} onChange={event => selectProductCategory(event.target.value)} disabled={productsLoading || catalogProducts.length === 0} className="mt-1 min-h-11 w-full cursor-pointer rounded-lg border border-slate-700 bg-[#070a12] px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"><option value="">{productsLoading ? 'Loading Product Catalog…' : catalogProducts.length ? 'Select Category' : 'No catalog categories available'}</option>{productCategories.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
            <label className="text-sm text-slate-300 sm:col-span-2">Product <span className="text-rose-400">*</span><select value={createOrderForm.productId} onChange={event => selectCreateOrderProduct(event.target.value)} disabled={!selectedProductCategory || filteredCatalogProducts.length === 0} className="mt-1 min-h-11 w-full cursor-pointer rounded-lg border border-slate-700 bg-[#070a12] px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"><option value="">{!selectedProductCategory ? 'Select a category first' : filteredCatalogProducts.length ? 'Select Product' : 'No products available in this category'}</option>{filteredCatalogProducts.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
            <label className="text-sm text-slate-300">Quantity <span className="text-rose-400">*</span><input type="number" min="0.001" step="0.001" value={createOrderForm.quantity} onChange={event => setCreateOrderForm(current => ({ ...current, quantity: event.target.value }))} placeholder="0" className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-[#070a12] px-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500" /></label>
            <label className="text-sm text-slate-300">Unit <span className="text-rose-400">*</span><select value={createOrderForm.unit} onChange={event => setCreateOrderForm(current => ({ ...current, unit: event.target.value }))} className="mt-1 min-h-11 w-full cursor-pointer rounded-lg border border-slate-700 bg-[#070a12] px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"><option value="">Select unit</option>{orderUnitOptions.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>
            <label className="text-sm text-slate-300 sm:col-span-2">Unit price <span className="text-rose-400">*</span><input type="number" min="0" step="0.01" value={createOrderForm.unitPrice} onChange={event => setCreateOrderForm(current => ({ ...current, unitPrice: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-[#070a12] px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" /></label>
          </div>
          <div className="mt-6 flex flex-col-reverse justify-end gap-3 border-t border-slate-800 pt-5 sm:flex-row"><button onClick={() => setCreateOrderOpen(false)} className="min-h-11 cursor-pointer rounded-lg border border-slate-700 px-4 text-slate-300 transition-colors hover:bg-slate-800">Cancel</button><button onClick={() => void submitCreateOrder()} disabled={createOrderBusy || productsLoading} className="min-h-11 cursor-pointer rounded-lg bg-slate-900 px-5 font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50">{createOrderBusy ? 'Creating…' : 'Create Order'}</button></div>
        </div>
      </div>}

    </div>
  );
};

export default OrderManagement;
