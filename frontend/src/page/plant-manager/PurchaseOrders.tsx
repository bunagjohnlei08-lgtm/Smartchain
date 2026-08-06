// src/page/plant-manager/PurchaseOrders.tsx
import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  ChevronRight,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Download,
  Printer,
  RefreshCw,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplier: string;
  warehouse: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  expectedDelivery: string;
  items: number;
  totalCost: number;
  createdBy: string;
  status: 'Draft' | 'Pending' | 'Approved' | 'Partially Received' | 'Completed' | 'Cancelled';
}

// ============================================
// MOCK DATA
// ============================================

const mockPurchaseOrders: PurchaseOrder[] = [
  {
    id: '1',
    poNumber: 'PO-2058',
    supplier: 'Northwind Traders',
    warehouse: 'WH-Alpha',
    priority: 'High',
    expectedDelivery: '2026-08-06',
    items: 14,
    totalCost: 24860,
    createdBy: 'A. Reyes',
    status: 'Pending',
  },
  {
    id: '2',
    poNumber: 'PO-2057',
    supplier: 'Kraft Industrial',
    warehouse: 'WH-Beta',
    priority: 'Medium',
    expectedDelivery: '2026-08-04',
    items: 9,
    totalCost: 18240,
    createdBy: 'A. Reyes',
    status: 'Approved',
  },
  {
    id: '3',
    poNumber: 'PO-2056',
    supplier: 'Apex Components',
    warehouse: 'WH-Gamma',
    priority: 'Low',
    expectedDelivery: '2026-08-11',
    items: 6,
    totalCost: 9410,
    createdBy: 'J. Santos',
    status: 'Draft',
  },
  {
    id: '4',
    poNumber: 'PO-2055',
    supplier: 'Cebu Logistics Co.',
    warehouse: 'WH-Alpha',
    priority: 'Urgent',
    expectedDelivery: '2026-07-30',
    items: 11,
    totalCost: 12760,
    createdBy: 'A. Reyes',
    status: 'Partially Received',
  },
  {
    id: '5',
    poNumber: 'PO-2054',
    supplier: 'Meridian Supply',
    warehouse: 'WH-Delta',
    priority: 'Medium',
    expectedDelivery: '2026-07-28',
    items: 4,
    totalCost: 6480,
    createdBy: 'L. Cruz',
    status: 'Completed',
  },
  {
    id: '6',
    poNumber: 'PO-2053',
    supplier: 'Northwind Traders',
    warehouse: 'WH-Beta',
    priority: 'Low',
    expectedDelivery: '2026-07-25',
    items: 3,
    totalCost: 3120,
    createdBy: 'J. Santos',
    status: 'Cancelled',
  },
];

// ============================================
// CONSTANTS
// ============================================

const statusOptions = ['All', 'Draft', 'Pending', 'Approved', 'Partially Received', 'Completed', 'Cancelled'];
const warehouseOptions = ['All', 'WH-Alpha', 'WH-Beta', 'WH-Gamma', 'WH-Delta'];
const supplierOptions = ['All', 'Northwind Traders', 'Kraft Industrial', 'Apex Components', 'Cebu Logistics Co.', 'Meridian Supply'];
const priorityOptions = ['All', 'Low', 'Medium', 'High', 'Urgent'];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { color: string; dotColor: string }> = {
    Draft: { color: 'text-slate-400 bg-slate-500/10 border-slate-500/20', dotColor: 'bg-slate-400' },
    Pending: { color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', dotColor: 'bg-amber-400' },
    Approved: { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', dotColor: 'bg-emerald-400' },
    'Partially Received': { color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', dotColor: 'bg-blue-400' },
    Completed: { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', dotColor: 'bg-emerald-400' },
    Cancelled: { color: 'text-red-400 bg-red-500/10 border-red-500/20', dotColor: 'bg-red-400' },
  };
  const { color, dotColor } = config[status] || config['Draft'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {status}
    </span>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const PurchaseOrders: React.FC = () => {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [warehouseFilter, setWarehouseFilter] = useState('All');
  const [supplierFilter, setSupplierFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return mockPurchaseOrders.filter((order) => {
      const matchSearch =
        order.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.supplier.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === 'All' || order.status === statusFilter;
      const matchWarehouse = warehouseFilter === 'All' || order.warehouse === warehouseFilter;
      const matchSupplier = supplierFilter === 'All' || order.supplier === supplierFilter;
      const matchPriority = priorityFilter === 'All' || order.priority === priorityFilter;
      return matchSearch && matchStatus && matchWarehouse && matchSupplier && matchPriority;
    });
  }, [searchQuery, statusFilter, warehouseFilter, supplierFilter, priorityFilter]);

  // KPI counts
  const kpiCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    statusOptions.forEach((status) => {
      if (status === 'All') return;
      counts[status] = mockPurchaseOrders.filter((o) => o.status === status).length;
    });
    return counts;
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6 bg-[#0a0e17] text-slate-100">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span>Plant Manager</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-100">Purchase Orders</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Purchase Orders</h1>
          <p className="text-sm text-slate-400">Replenishment orders from draft through completion</p>
        </div>
        <button className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> Create PO
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {statusOptions.filter(s => s !== 'All').map((status) => (
          <div
            key={status}
            className="bg-[#0f172a] border border-[#1e293b] rounded-2xl p-4 text-center hover:border-slate-600 transition-colors"
          >
            <p className="text-xs text-slate-400 uppercase tracking-wider">{status}</p>
            <p className="text-2xl font-bold text-white mt-1">{kpiCounts[status] || 0}</p>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="w-full flex flex-nowrap items-center justify-between gap-4 p-4 bg-[#0d1322] rounded-xl border border-gray-800/50 overflow-x-auto">
        {/* Status Pills (Left) */}
        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
          {statusOptions.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-[#090d16] border border-gray-800 text-gray-300 hover:text-white hover:border-gray-700'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Search Bar & Action Icons (Right) */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search PO or supplier"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#090d16] border border-gray-800 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 w-48 xl:w-56"
            />
          </div>
          <button className="p-2.5 rounded-xl border border-gray-800 text-slate-400 hover:text-white hover:border-gray-700 transition-colors" title="Download">
            <Download className="w-4 h-4" />
          </button>
          <button className="p-2.5 rounded-xl border border-gray-800 text-slate-400 hover:text-white hover:border-gray-700 transition-colors" title="Print">
            <Printer className="w-4 h-4" />
          </button>
          <button className="p-2.5 rounded-xl border border-gray-800 text-slate-400 hover:text-white hover:border-gray-700 transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-[#1e293b]/50 border-b border-[#1e293b]">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  PO Number
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Supplier
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Expected delivery
                </th>
                <th className="px-5 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Items
                </th>
                <th className="px-5 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Total cost
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Created by
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-[#1e293b] hover:bg-[#1e293b]/30 transition-colors"
                >
                  <td className="px-5 py-3.5 text-sm font-medium text-white">
                    {order.poNumber}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-300">
                    {order.supplier}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-300">
                    {order.expectedDelivery}
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm text-slate-300">
                    {order.items}
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm font-medium text-white">
                    ${order.totalCost.toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-300">
                    {order.createdBy}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={order.status} />
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    No purchase orders found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#1e293b] bg-[#0f172a]/30">
          <div className="text-sm text-slate-400">
            Showing <span className="text-white font-medium">1</span> to{' '}
            <span className="text-white font-medium">{filteredOrders.length}</span> of{' '}
            <span className="text-white font-medium">{mockPurchaseOrders.length}</span> results
          </div>
          <div className="flex items-center gap-1">
            <button className="p-1.5 rounded-xl border border-[#1e293b] text-slate-400 hover:text-white hover:bg-[#1e293b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="px-3 py-1 rounded-xl text-sm font-medium bg-cyan-500 text-slate-950">
              1
            </button>
            <button className="p-1.5 rounded-xl border border-[#1e293b] text-slate-400 hover:text-white hover:bg-[#1e293b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrders;
