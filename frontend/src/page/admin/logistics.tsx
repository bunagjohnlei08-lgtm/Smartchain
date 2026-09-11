// src/page/admin/Logistics.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import {
  Truck,
  Search,
  ChevronLeft,
  ChevronRight,
  Package,
  Clock,
  CheckCircle,
  Eye,
  Send,
  X,
  Check,
  AlertCircle,
  Filter,
  RefreshCw,
  LayoutGrid,
  LayoutList,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

type ShipmentStatus =
 | 'Pending Approval'
 | 'Approved'
 | 'Assigned'
 | 'Picked Up'
 | 'In Transit'
 | 'Delivered'
 | 'Cancelled';

interface Shipment {
 id: string;
 shipmentNo: string;
 poNumber: string;
 customer: string;
 warehouse: string;
 preparedBy: string;
 destination: string;
 preparedDate: string;
 assignedLogistics: string | null;
 status: ShipmentStatus;
 items: { name: string; sku: string; qty: number; unit: string }[];
 totalItems: number;
 totalWeight: number;
 weightUnit: string;
 timeline: {
  step: string;
  completed: boolean;
  timestamp?: string;
 }[];
 barcodeVerified: boolean;
 expectedDelivery?: string;
}

// ============================================
// ORDER/SHIPMENT MAPPING (existing Plant Manager Shipment data)
// ============================================

// A shipment is the existing order once Stock Out released it; there is no
// separate shipment record to duplicate.
// Only FORWARDED_TO_LOGISTICS orders reach this module; anything still in
// READY_FOR_SHIPMENT belongs to Plant Manager Shipment.
const orderStatusToShipmentStatus: Record<string, ShipmentStatus> = {
  FORWARDED_TO_LOGISTICS: 'Pending Approval',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(value)) : '—';

const formatTimestamp = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : undefined;

const humanize = (value?: string | null) =>
  (value ?? '').split('_').map((word) => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');

const mapShipment = (record: any): Shipment => ({
  id: String(record.id),
  shipmentNo: record.shipment_no,
  poNumber: record.order_no,
  customer: record.customer_name,
  warehouse: record.warehouse || 'Unassigned',
  preparedBy: record.prepared_by || '—',
  destination: record.destination || '—',
  preparedDate: formatDate(record.prepared_date),
  assignedLogistics: record.assigned_logistics ?? null,
  status: orderStatusToShipmentStatus[record.status] ?? 'Pending Approval',
  items: (record.items || []).map((item: any) => ({
    name: item.product_name,
    sku: '—',
    qty: Number(item.quantity) || 0,
    unit: item.unit,
  })),
  totalItems: Number(record.items_count ?? record.items?.length ?? 0),
  totalWeight: 0,
  weightUnit: 'kg',
  timeline: (record.timeline || []).map((entry: any) => ({
    step: humanize(entry.action),
    completed: true,
    timestamp: formatTimestamp(entry.occurred_at),
  })),
  barcodeVerified: true,
  expectedDelivery: formatDate(record.required_delivery_date),
});

// ============================================
// CONSTANTS
// ============================================

const statusOptions = [
 'All Status',
 'Pending Approval',
 'Approved',
 'Assigned',
 'Picked Up',
 'In Transit',
 'Delivered',
 'Cancelled',
];

const warehouseOptions = ['All Warehouses', 'Central Depot', 'Northgate', 'Southpark', 'Eastside'];
const logisticsOptions = ['All Logistics', 'Integrated Logistics System', 'External Delivery Group', 'Internal Fleet', 'Courier Partner'];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: ShipmentStatus }> = ({ status }) => {
 const config: Record<ShipmentStatus, { color: string; bg: string; dotColor: string }> = {
  'Pending Approval': {
   color: 'text-amber-400 not-dark:text-amber-600',
   bg: 'not-dark:bg-transparent bg-amber-500/10 border-amber-500/20',
   dotColor: 'bg-amber-400 not-dark:bg-amber-600',
  },
  Approved: {
   color: 'text-blue-400 not-dark:text-blue-600',
   bg: 'not-dark:bg-transparent bg-blue-500/10 border-blue-500/20',
   dotColor: 'bg-blue-400 not-dark:bg-blue-600',
  },
  Assigned: {
   color: 'text-purple-400 not-dark:text-purple-600',
   bg: 'not-dark:bg-transparent bg-purple-500/10 border-purple-500/20',
   dotColor: 'bg-purple-400 not-dark:bg-purple-600',
  },
  'Picked Up': {
   color: 'text-cyan-400 not-dark:text-cyan-600',
   bg: 'not-dark:bg-transparent bg-cyan-500/10 border-cyan-500/20',
   dotColor: 'bg-cyan-400 not-dark:bg-cyan-600',
  },
  'In Transit': {
   color: 'text-sky-400 not-dark:text-sky-600',
   bg: 'not-dark:bg-transparent bg-sky-500/10 border-sky-500/20',
   dotColor: 'bg-sky-400 not-dark:bg-sky-600',
  },
  Delivered: {
   color: 'text-emerald-400 not-dark:text-emerald-600',
   bg: 'not-dark:bg-transparent bg-emerald-500/10 border-emerald-500/20',
   dotColor: 'bg-emerald-400 not-dark:bg-emerald-600',
  },
  Cancelled: {
   color: 'text-gray-400 not-dark:text-gray-600',
   bg: 'not-dark:bg-transparent bg-slate-500/10 border-slate-500/20',
   dotColor: 'bg-slate-400 not-dark:bg-slate-600',
  },
 };
 const { color, bg, dotColor } = config[status];
 return (
  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium not-dark:font-semibold border ${color} ${bg}`}>
   <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
   {status}
  </span>
 );
};

 const KPICard: React.FC<{
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
 }> = ({ label, value, subtitle, icon }) => (
  <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-5 hover:border-slate-700 transition-all duration-200 h-full flex flex-col">
  <div className="flex items-start justify-between flex-1">
   <div>
    <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">{label}</p>
    <p className="text-2xl font-bold text-white mt-1.5">{value}</p>
    {subtitle && <p className="text-gray-400 text-xs mt-1">{subtitle}</p>}
   </div>
   <div className="p-2.5 bg-gray-800/50 bg-gray-800/50 rounded-lg shrink-0">{icon}</div>
  </div>
 </div>
);

const SearchInput: React.FC<{
 value: string;
 onChange: (value: string) => void;
 placeholder?: string;
}> = ({ value, onChange, placeholder = 'Search...' }) => (
 <div className="relative flex-1 min-w-[180px]">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
  <input
   type="text"
   value={value}
   onChange={(e) => onChange(e.target.value)}
   placeholder={placeholder}
   className="w-full bg-gray-800/50 border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-gray-400 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all"
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
   className="w-full bg-gray-800/50 border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer"
  >
   {options.map((opt) => (
    <option key={opt} value={opt}>{opt}</option>
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
   <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800/80 bg-[#0b101d] rounded-b-xl">
    <div className="text-sm text-slate-400">
     Showing <span className="text-slate-300 font-medium">{start}</span> to{' '}
     <span className="text-slate-300 font-medium">{end}</span> of{' '}
     <span className="text-slate-300 font-medium">{totalItems}</span> shipments
    </div>
    <div className="flex items-center gap-1">
     <button
      onClick={() => onPageChange(Math.max(1, currentPage - 1))}
      disabled={currentPage === 1}
      className="p-1.5 rounded-xl border border-slate-700/60 text-slate-400 hover:bg-slate-700/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
     >
      <ChevronLeft className="w-4 h-4" />
     </button>
     {getPages().map((page) => (
      <button
       key={page}
       onClick={() => onPageChange(page)}
       className={`px-3 py-1 rounded-xl text-sm font-medium transition-all ${
        currentPage === page
         ? 'bg-blue-600 text-white'
         : 'text-slate-400 hover:bg-slate-700/50'
       }`}
      >
       {page}
      </button>
     ))}
     <button
      onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
      disabled={currentPage === totalPages}
      className="p-1.5 rounded-xl border border-slate-700/60 text-slate-400 hover:bg-slate-700/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
     >
      <ChevronRight className="w-4 h-4" />
     </button>
    </div>
   </div>
 );
};

// ============================================
// MAIN COMPONENT
// ============================================

const Logistics: React.FC = () => {
 const [search, setSearch] = useState('');
 const [statusFilter, setStatusFilter] = useState('All Status');
 const [warehouseFilter, setWarehouseFilter] = useState('All Warehouses');
 const [logisticsFilter, setLogisticsFilter] = useState('All Logistics');
 const [currentPage, setCurrentPage] = useState(1);
 const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const itemsPerPage = 6;

  // Shipment data comes from the orders released by Stock Out (Plant Manager Shipment)
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadShipments = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await apiClient.get('/admin/logistics/shipments', { params: { per_page: 100 } });
        const records = response.data?.data ?? [];
        if (!cancelled) setShipments(records.map(mapShipment));
      } catch (error: any) {
        if (!cancelled) {
          setLoadError(error?.response?.data?.message ?? 'Unable to load shipments from Plant Manager Shipment.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadShipments();
    return () => {
      cancelled = true;
    };
  }, []);

  // Modal states
  const [showViewModal, setShowViewModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
 const [assignForm, setAssignForm] = useState({
  logisticsPartner: '',
  pickupDate: '',
  pickupTime: '',
  notes: '',
 });
 const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

 // Filtered shipments
 const filteredShipments = useMemo(() => {
  return shipments.filter((shipment) => {
   const matchSearch =
    shipment.shipmentNo.toLowerCase().includes(search.toLowerCase()) ||
    shipment.poNumber.toLowerCase().includes(search.toLowerCase()) ||
    shipment.customer.toLowerCase().includes(search.toLowerCase()) ||
    shipment.destination.toLowerCase().includes(search.toLowerCase()) ||
    shipment.warehouse.toLowerCase().includes(search.toLowerCase());
   const matchStatus = statusFilter === 'All Status' || shipment.status === statusFilter;
   const matchWarehouse = warehouseFilter === 'All Warehouses' || shipment.warehouse === warehouseFilter;
   const matchLogistics =
    logisticsFilter === 'All Logistics' ||
    (shipment.assignedLogistics && shipment.assignedLogistics === logisticsFilter) ||
    (logisticsFilter === 'Not Assigned' && !shipment.assignedLogistics);
   return matchSearch && matchStatus && matchWarehouse && matchLogistics;
  });
 }, [shipments, search, statusFilter, warehouseFilter, logisticsFilter]);

 const totalPages = Math.ceil(filteredShipments.length / itemsPerPage);
 const paginatedShipments = filteredShipments.slice(
  (currentPage - 1) * itemsPerPage,
  currentPage * itemsPerPage
 );

 // KPI counts
 const pendingApproval = shipments.filter((s) => s.status === 'Pending Approval').length;
 const approved = shipments.filter((s) => s.status === 'Approved').length;
 const assigned = shipments.filter((s) => s.status === 'Assigned').length;
 const inTransit = shipments.filter((s) => s.status === 'In Transit' || s.status === 'Picked Up').length;
 const delivered = shipments.filter((s) => s.status === 'Delivered').length;
 const cancelled = shipments.filter((s) => s.status === 'Cancelled').length;

 // Handlers
 const handleView = (shipment: Shipment) => {
  setSelectedShipment(shipment);
  setShowViewModal(true);
 };

 const handleAssign = (shipment: Shipment) => {
  setSelectedShipment(shipment);
  setAssignForm({
   logisticsPartner: '',
   pickupDate: '',
   pickupTime: '',
   notes: '',
  });
  setShowAssignModal(true);
 };

 const handleAssignSubmit = () => {
  if (!selectedShipment) return;
  // In real app, we would update the shipment status to 'Assigned' and save logistics partner.
  // For mock, we show toast and close modal.
  setToast({
   message: `Shipment ${selectedShipment.shipmentNo} assigned to ${assignForm.logisticsPartner} and notified.`,
   type: 'success',
  });
  setShowAssignModal(false);
  setTimeout(() => setToast(null), 5000);
 };

  const handleApprove = (shipment: Shipment) => {
   // Mock approve: show toast and update status in mock
   setToast({
    message: `Shipment ${shipment.shipmentNo} approved successfully.`,
    type: 'success',
   });
   setTimeout(() => setToast(null), 5000);
  };

 return (
  <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-transparent text-white min-h-screen">
   {/* Breadcrumb */}
   <div className="flex items-center gap-2 text-sm text-gray-400">
    <span>Admin</span>
    <ChevronRight className="w-4 h-4" />
    <span className="text-white">Logistics (DTRS)</span>
   </div>

   {/* Header */}
   <div>
     <h1 className="text-2xl font-bold text-white">Logistics & Tracking (DTRS)</h1>
     <p className="text-sm text-gray-400">
      Manage delivery routes, fleet status, and shipment tracking across warehouses and branches.
     </p>
   </div>

   {/* KPI Cards */}
   <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
    <KPICard label="Waiting Approval" value={pendingApproval} icon={<Clock className="w-5 h-5 text-amber-400 not-dark:text-amber-600" />} />
    <KPICard label="Approved" value={approved} icon={<CheckCircle className="w-5 h-5 text-blue-400 not-dark:text-blue-600" />} />
    <KPICard label="Assigned" value={assigned} icon={<Truck className="w-5 h-5 text-purple-400 not-dark:text-purple-600" />} />
    <KPICard label="In Transit" value={inTransit} icon={<Package className="w-5 h-5 text-sky-400 not-dark:text-sky-600" />} />
    <KPICard label="Delivered" value={delivered} icon={<CheckCircle className="w-5 h-5 text-emerald-400 not-dark:text-emerald-600" />} />
    <KPICard label="Cancelled" value={cancelled} icon={<AlertCircle className="w-5 h-5 text-gray-400 not-dark:text-gray-600" />} />
   </div>

   {/* Filter Bar */}
   <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-4 flex flex-wrap items-center gap-3">
    <SearchInput value={search} onChange={setSearch} placeholder="Search shipment #, PO #, customer..." />
    <FilterSelect value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
    <FilterSelect value={warehouseFilter} onChange={setWarehouseFilter} options={warehouseOptions} />
    <FilterSelect value={logisticsFilter} onChange={setLogisticsFilter} options={[...logisticsOptions, 'Not Assigned']} />
    <button className="px-3.5 py-2.5 border border-gray-700 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800 transition-all flex items-center gap-1.5 text-sm">
     <Filter className="w-4 h-4" /> More Filters
    </button>
    <div className="ml-auto flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800/50 p-1" aria-label="Shipment view">
     <button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} title="List view" className={`rounded-md p-1.5 transition-colors ${viewMode === 'list' ? 'bg-[#092635] text-white' : 'text-gray-400 hover:text-white'}`}><LayoutList className="h-4 w-4" /></button>
     <button type="button" onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} title="Grid view" className={`rounded-md p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-[#092635] text-white' : 'text-gray-400 hover:text-white'}`}><LayoutGrid className="h-4 w-4" /></button>
    </div>
    <button className="p-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800 transition-all">
     <RefreshCw className="w-4 h-4" />
    </button>
   </div>

   {/* Table */}
   <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl overflow-hidden">
    {viewMode === 'list' ? (
    <div className="overflow-x-auto">
     <table className="w-full min-w-[1000px]">
      <thead className="bg-gray-800/50 border-b border-gray-800 border-gray-800/50">
       <tr>
        <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Shipment No.</th>
        <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Order No.</th>
        <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Customer</th>
        <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Warehouse</th>
        <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Prepared By</th>
        <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Assigned Logistics</th>
        <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
        <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-gray-400">Actions</th>
       </tr>
      </thead>
      <tbody>
       {paginatedShipments.map((shipment) => (
        <tr key={shipment.id} className="border-b border-gray-800 border-gray-800/50 hover:bg-gray-800/50 hover:bg-gray-800/30 transition-all">
         <td className="px-4 py-3.5 text-sm font-medium text-white">{shipment.shipmentNo}</td>
         <td className="px-4 py-3.5 text-sm text-gray-300">{shipment.poNumber}</td>
         <td className="px-4 py-3.5 text-sm text-gray-300">{shipment.customer}</td>
         <td className="px-4 py-3.5 text-sm text-gray-300">{shipment.warehouse}</td>
         <td className="px-4 py-3.5 text-sm text-gray-300">{shipment.preparedBy}</td>
         <td className="px-4 py-3.5 text-sm text-gray-300">
          {shipment.assignedLogistics || '—'}
         </td>
         <td className="px-4 py-3.5"><StatusBadge status={shipment.status} /></td>
         <td className="px-4 py-3.5">
          <div className="flex items-center justify-center gap-1">
           <button
            onClick={() => handleView(shipment)}
            className="p-1.5 rounded-lg hover:bg-gray-800 hover:bg-gray-700 text-gray-400 not-dark:text-slate-600 hover:text-white not-dark:hover:text-slate-900 transition-all"
            title="View Details"
           >
            <Eye className="w-4 h-4" />
           </button>
           {shipment.status === 'Pending Approval' && (
            <>
             <button
              onClick={() => handleApprove(shipment)}
              className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-emerald-400 not-dark:text-green-600 hover:text-emerald-300 not-dark:hover:text-green-700 transition-all"
              title="Approve"
             >
              <Check className="w-4 h-4" />
             </button>
             <button
              onClick={() => handleAssign(shipment)}
              className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400 not-dark:text-blue-600 hover:text-blue-300 not-dark:hover:text-blue-700 transition-all"
              title="Assign Logistics"
             >
              <Send className="w-4 h-4" />
             </button>
            </>
           )}
           {shipment.status === 'Approved' && (
            <button
             onClick={() => handleAssign(shipment)}
             className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400 not-dark:text-blue-600 hover:text-blue-300 not-dark:hover:text-blue-700 transition-all"
             title="Assign Logistics"
            >
             <Send className="w-4 h-4" />
            </button>
           )}
          </div>
         </td>
        </tr>
       ))}
       {paginatedShipments.length === 0 && (
        <tr>
         <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
          {isLoading
           ? 'Loading shipments...'
           : loadError ?? 'No shipments found matching your criteria.'}
         </td>
        </tr>
       )}
      </tbody>
     </table>
    </div>
    ) : paginatedShipments.length > 0 ? (
     <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
      {paginatedShipments.map((shipment) => (
       <article key={shipment.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900 dark:text-white">{shipment.shipmentNo}</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{shipment.poNumber} · {shipment.customer}</p></div><StatusBadge status={shipment.status} /></div>
        <dl className="mt-4 space-y-2 text-sm"><div><dt className="text-slate-500 dark:text-slate-400">Assigned Logistics</dt><dd className="text-slate-900 dark:text-white">{shipment.assignedLogistics || '—'}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Destination</dt><dd className="text-slate-900 dark:text-white">{shipment.destination}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Warehouse</dt><dd className="text-slate-900 dark:text-white">{shipment.warehouse}</dd></div></dl>
        <div className="mt-4 flex justify-end gap-1 border-t border-slate-200 pt-3 dark:border-slate-700"><button onClick={() => handleView(shipment)} className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" title="View Details"><Eye className="h-4 w-4" /></button>{shipment.status === 'Pending Approval' && <button onClick={() => handleApprove(shipment)} className="p-2 text-emerald-600 dark:text-emerald-400" title="Approve"><Check className="h-4 w-4" /></button>}{(shipment.status === 'Pending Approval' || shipment.status === 'Approved') && <button onClick={() => handleAssign(shipment)} className="p-2 text-blue-600 dark:text-blue-400" title="Assign Logistics"><Send className="h-4 w-4" /></button>}</div>
       </article>
      ))}
     </div>
    ) : (
     <div className="px-4 py-8 text-center text-gray-400">{isLoading ? 'Loading shipments...' : loadError ?? 'No shipments found matching your criteria.'}</div>
    )}
    <Pagination
     currentPage={currentPage}
     totalPages={totalPages}
     onPageChange={setCurrentPage}
     totalItems={filteredShipments.length}
     itemsPerPage={itemsPerPage}
    />
   </div>

   {/* ============================================ */}
   {/* VIEW SHIPMENT MODAL */}
   {/* ============================================ */}
   {showViewModal && selectedShipment && (
    <div
     className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
     onClick={() => setShowViewModal(false)}
    >
     <div
      className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6"
      onClick={(e) => e.stopPropagation()}
     >
      <div className="flex items-center justify-between mb-6">
       <div>
        <h2 className="text-xl font-bold text-white">Shipment Details</h2>
        <p className="text-sm text-gray-400">{selectedShipment.shipmentNo} · {selectedShipment.poNumber}</p>
       </div>
       <button
        onClick={() => setShowViewModal(false)}
        className="p-1.5 rounded-lg hover:bg-gray-800/50 hover:bg-gray-800/50 text-gray-400 hover:text-white transition-all"
       >
        <X className="w-5 h-5" />
       </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
       <div>
        <p className="text-xs text-gray-400">Customer</p>
        <p className="text-sm text-white">{selectedShipment.customer}</p>
       </div>
       <div>
        <p className="text-xs text-gray-400">Warehouse</p>
        <p className="text-sm text-white">{selectedShipment.warehouse}</p>
       </div>
       <div>
        <p className="text-xs text-gray-400">Destination</p>
        <p className="text-sm text-white">{selectedShipment.destination}</p>
       </div>
       <div>
        <p className="text-xs text-gray-400">Prepared By</p>
        <p className="text-sm text-white">{selectedShipment.preparedBy}</p>
       </div>
       <div>
        <p className="text-xs text-gray-400">Total Items</p>
        <p className="text-sm text-white">{selectedShipment.totalItems}</p>
       </div>
       <div>
        <p className="text-xs text-gray-400">Total Weight</p>
        <p className="text-sm text-white">{selectedShipment.totalWeight} {selectedShipment.weightUnit}</p>
       </div>
       <div>
        <p className="text-xs text-gray-400">Barcode Verified</p>
        <p className="text-sm text-white">{selectedShipment.barcodeVerified ? 'Yes' : 'No'}</p>
       </div>
       <div>
        <p className="text-xs text-gray-400">Status</p>
        <StatusBadge status={selectedShipment.status} />
       </div>
      </div>

       <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-300 mb-2">Items</h4>
        <div className="bg-gray-800/50 rounded-xl border border-gray-800 border-gray-800/50 overflow-hidden">
         <table className="w-full text-sm">
          <thead className="bg-gray-800/50 bg-gray-800/50 border-b border-gray-800 border-gray-800/50">
           <tr>
            <th className="px-4 py-2 text-left text-xs text-gray-400">Product</th>
            <th className="px-4 py-2 text-left text-xs text-gray-400">SKU</th>
            <th className="px-4 py-2 text-right text-xs text-gray-400">Qty</th>
            <th className="px-4 py-2 text-left text-xs text-gray-400">Unit</th>
           </tr>
          </thead>
          <tbody>
           {selectedShipment.items.map((item, idx) => (
            <tr key={idx} className="border-b border-gray-800 border-gray-800/50">
             <td className="px-4 py-2 text-white text-gray-200">{item.name}</td>
             <td className="px-4 py-2 text-gray-400 font-mono">{item.sku}</td>
             <td className="px-4 py-2 text-right text-white">{item.qty}</td>
             <td className="px-4 py-2 text-gray-400">{item.unit}</td>
            </tr>
           ))}
          </tbody>
         </table>
        </div>
       </div>

       <div>
        <h4 className="text-sm font-medium text-gray-300 mb-2">Progress Timeline</h4>
       <div className="space-y-2">
        {selectedShipment.timeline.map((step, idx) => (
         <div key={idx} className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${step.completed ? 'bg-cyan-500' : 'bg-slate-700'}`} />
          <div className="flex-1 flex justify-between">
           <span className="text-sm text-white">{step.step}</span>
           {step.timestamp && <span className="text-xs text-gray-400">{step.timestamp}</span>}
          </div>
         </div>
        ))}
       </div>
      </div>

      <div className="flex justify-end mt-6 pt-4 border-t border-gray-800 border-gray-800/50">
       <button
        onClick={() => setShowViewModal(false)}
        className="px-5 py-2 border border-gray-700 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800 transition-all"
       >
        Close
       </button>
      </div>
     </div>
    </div>
   )}

   {/* ============================================ */}
   {/* ASSIGN LOGISTICS MODAL */}
   {/* ============================================ */}
   {showAssignModal && selectedShipment && (
    <div
     className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
     onClick={() => setShowAssignModal(false)}
    >
     <div
      className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl w-full max-w-lg p-6"
      onClick={(e) => e.stopPropagation()}
     >
      <div className="flex items-center justify-between mb-6">
       <h2 className="text-xl font-bold text-white">Assign Logistics</h2>
       <button
        onClick={() => setShowAssignModal(false)}
        className="p-1.5 rounded-lg hover:bg-gray-800/50 hover:bg-gray-800/50 text-gray-400 hover:text-white transition-all"
       >
        <X className="w-5 h-5" />
       </button>
      </div>

      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
       <div>
        <label className="block text-sm font-medium mb-1.5 text-gray-300">Shipment</label>
        <p className="text-white">{selectedShipment.shipmentNo} - {selectedShipment.customer}</p>
       </div>

       <div>
        <label className="block text-sm font-medium mb-1.5 text-gray-300">Logistics Partner *</label>
        <select
         value={assignForm.logisticsPartner}
         onChange={(e) => setAssignForm({ ...assignForm, logisticsPartner: e.target.value })}
         className="w-full bg-gray-800/50 border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
         required
        >
         <option value="">Select Logistics Partner</option>
         {logisticsOptions.filter(o => o !== 'All Logistics').map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
         ))}
        </select>
       </div>

       <div className="grid grid-cols-2 gap-4">
        <div>
         <label className="block text-sm font-medium mb-1.5 text-gray-300">Pickup Date</label>
         <input
          type="date"
          value={assignForm.pickupDate}
          onChange={(e) => setAssignForm({ ...assignForm, pickupDate: e.target.value })}
          className="w-full bg-gray-800/50 border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
         />
        </div>
        <div>
         <label className="block text-sm font-medium mb-1.5 text-gray-300">Pickup Time</label>
         <input
          type="time"
          value={assignForm.pickupTime}
          onChange={(e) => setAssignForm({ ...assignForm, pickupTime: e.target.value })}
          className="w-full bg-gray-800/50 border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
         />
        </div>
       </div>

       <div>
        <label className="block text-sm font-medium mb-1.5 text-gray-300">Notes</label>
         <textarea
          rows={3}
          value={assignForm.notes}
          onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
          className="w-full bg-gray-800/50 border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-400 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          placeholder="Any special instructions..."
         />
       </div>

       <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-800 border-gray-800/50">
        <button
         type="button"
         onClick={() => setShowAssignModal(false)}
         className="px-5 py-2.5 border border-gray-700 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800 transition-all"
        >
         Cancel
        </button>
        <button
         type="submit"
         onClick={handleAssignSubmit}
         className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950"
        >
         <Send className="w-4 h-4" /> Assign & Notify
        </button>
       </div>
      </form>
     </div>
    </div>
   )}

   {toast && (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm text-white flex items-center gap-2 ${
     toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
    }`}>
     {toast.type === 'success' && <CheckCircle className="w-5 h-5" />}
     {toast.type === 'error' && <AlertCircle className="w-5 h-5" />}
     {toast.type === 'info' && <Clock className="w-5 h-5" />}
     {toast.message}
    </div>
   )}
  </div>
 );
};

export default Logistics;
