// src/page/admin/PurchaseOrders.tsx
import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  ChevronRight,
  Download,
  Printer,
  RefreshCw,
  Eye,
  Edit,
  MoreVertical,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplier: string;
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

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return mockPurchaseOrders.filter((order) => {
      const matchSearch =
        order.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.supplier.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === 'All' || order.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [searchQuery, statusFilter]);

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
        <span>Admin</span>
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

      {/* Filter Bar & Search */}
      <div className="bg-[#0f172a]/60 border border-[#1e293b] rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 bg-[#1e293b]/50 rounded-full p-1">
            {statusOptions.map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  statusFilter === status
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search PO or supplier"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#0f172a] border border-[#1e293b] rounded-xl pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 w-full sm:w-56"
              />
            </div>
            <button className="p-2 rounded-xl hover:bg-[#1e293b] transition-colors text-slate-400 hover:text-slate-100">
              <Download className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-xl hover:bg-[#1e293b] transition-colors text-slate-400 hover:text-slate-100">
              <Printer className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-xl hover:bg-[#1e293b] transition-colors text-slate-400 hover:text-slate-100">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
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