// src/page/plant-manager/Inventory.tsx
import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Package,
  Clock,
  AlertTriangle,
  RefreshCw,
  X,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface InventoryItem {
  id: string;
  barcode: string;
  sku: string;
  product: string;
  location: string;
  available: number;
  reserved: number;
  damaged: number;
  unit: string;
  status: 'In Stock' | 'Low Stock' | 'Out Of Stock';
}

// ============================================
// MOCK DATA
// ============================================

const mockInventory: InventoryItem[] = [
  {
    id: '1',
    barcode: '8801234500011',
    sku: 'ELC-LED-040',
    product: 'Industrial LED Panel 40W',
    location: 'A-04-12',
    available: 428,
    reserved: 40,
    damaged: 2,
    unit: 'pcs',
    status: 'In Stock',
  },
  {
    id: '2',
    barcode: '8801234500028',
    sku: 'PKG-BOX-604',
    product: 'Corrugated Box 60x40x40',
    location: 'B-02-07',
    available: 92,
    reserved: 30,
    damaged: 6,
    unit: 'pcs',
    status: 'Low Stock',
  },
  {
    id: '3',
    barcode: '8801234500035',
    sku: 'RAW-SST-002',
    product: 'Stainless Steel Sheet 2mm',
    location: 'B-06-01',
    available: 0,
    reserved: 0,
    damaged: 1,
    unit: 'sheet',
    status: 'Out Of Stock',
  },
  {
    id: '4',
    barcode: '8801234500042',
    sku: 'TLS-IMP-018',
    product: 'Cordless Impact Driver',
    location: 'A-08-03',
    available: 176,
    reserved: 18,
    damaged: 0,
    unit: 'pcs',
    status: 'In Stock',
  },
  {
    id: '5',
    barcode: '8801234500059',
    sku: 'SAF-HLM-001',
    product: 'Safety Helmet Class E',
    location: 'C-01-09',
    available: 64,
    reserved: 12,
    damaged: 3,
    unit: 'pcs',
    status: 'Low Stock',
  },
  {
    id: '6',
    barcode: '8801234500066',
    sku: 'PKG-LBL-046',
    product: 'Thermal Label Roll 4x6',
    location: 'A-02-14',
    available: 512,
    reserved: 60,
    damaged: 0,
    unit: 'roll',
    status: 'In Stock',
  },
];

// ============================================
// CONSTANTS
// ============================================

const statusOptions = ['All statuses', 'In Stock', 'Low Stock', 'Out Of Stock'];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<
    string,
    { color: string; bg: string; dotColor: string }
  > = {
    'In Stock': {
      color: 'text-emerald-400',
      bg: 'bg-emerald-950/60 border-emerald-800/60',
      dotColor: 'bg-emerald-400',
    },
    'Low Stock': {
      color: 'text-amber-400',
      bg: 'bg-amber-950/60 border-amber-800/60',
      dotColor: 'bg-amber-400',
    },
    'Out Of Stock': {
      color: 'text-rose-400',
      bg: 'bg-rose-950/60 border-rose-800/60',
      dotColor: 'bg-rose-400',
    },
  };
  const { color, bg, dotColor } = config[status] || config['In Stock'];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color} ${bg}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {status}
    </span>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const Inventory: React.FC = () => {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');

  // Filtered inventory
  const filteredInventory = useMemo(() => {
    return mockInventory.filter((item) => {
      const matchSearch =
        item.product.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.barcode.includes(searchQuery) ||
        item.location.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus =
        statusFilter === 'All statuses' || item.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [searchQuery, statusFilter]);

  // Calculate totals
  const totalAvailable = mockInventory.reduce((sum, item) => sum + item.available, 0);
  const totalReserved = mockInventory.reduce((sum, item) => sum + item.reserved, 0);
  const totalDamaged = mockInventory.reduce((sum, item) => sum + item.damaged, 0);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span>Plant Manager</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-100">Inventory</span>
      </div>

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-sm text-slate-400">
            Stock positions by product and storage location
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="bg-[#101929] hover:bg-[#18253d] border border-slate-700/60 text-slate-200 text-xs font-medium px-4 py-2 rounded-xl flex items-center gap-2 transition-colors">
            <Download className="w-4 h-4" /> Export
          </button>
          <button className="bg-[#101929] hover:bg-[#18253d] border border-slate-700/60 text-slate-200 text-xs font-medium px-4 py-2 rounded-xl flex items-center gap-2 transition-colors">
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0f172a]/70 border border-slate-800/80 rounded-2xl p-5 md:p-6 shadow-sm space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Available Stock
          </p>
          <p className="text-3xl md:text-4xl font-bold text-emerald-400">
            {totalAvailable.toLocaleString()}
          </p>
        </div>
        <div className="bg-[#0f172a]/70 border border-slate-800/80 rounded-2xl p-5 md:p-6 shadow-sm space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Reserved Stock
          </p>
          <p className="text-3xl md:text-4xl font-bold text-cyan-400">
            {totalReserved.toLocaleString()}
          </p>
        </div>
        <div className="bg-[#0f172a]/70 border border-slate-800/80 rounded-2xl p-5 md:p-6 shadow-sm space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Damaged Stock
          </p>
          <p className="text-3xl md:text-4xl font-bold text-rose-500">
            {totalDamaged.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Filter & Table Container */}
      <div className="bg-[#0f172a]/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
        {/* Search & Filter Row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search barcode, SKU, product or location"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#101929] border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#101929] border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer min-w-[140px]"
            >
              {statusOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <button className="p-2.5 rounded-xl border border-slate-800 hover:bg-slate-800/30 transition-colors text-slate-400 hover:text-slate-200">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-slate-800/80">
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Barcode
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  SKU
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Product
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Location
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Available
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Reserved
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Damaged
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Unit
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-4 py-3.5 text-sm font-mono text-slate-400">
                    {item.barcode}
                  </td>
                  <td className="px-4 py-3.5 text-xs font-mono uppercase text-slate-500">
                    {item.sku}
                  </td>
                  <td className="px-4 py-3.5 text-sm font-medium text-white">
                    {item.product}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-400">
                    {item.location}
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm text-white">
                    {item.available}
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm font-medium text-cyan-400">
                    {item.reserved}
                  </td>
                  <td className={`px-4 py-3.5 text-right text-sm font-medium ${
                    item.damaged > 0 ? 'text-rose-400' : 'text-slate-500'
                  }`}>
                    {item.damaged}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-400">
                    {item.unit}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              ))}
              {filteredInventory.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    No inventory items found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination (static) */}
        <div className="flex items-center justify-between px-2 py-3 border-t border-slate-800/60">
          <div className="text-sm text-slate-400">
            Showing <span className="text-white font-medium">1</span> to{' '}
            <span className="text-white font-medium">{filteredInventory.length}</span> of{' '}
            <span className="text-white font-medium">{mockInventory.length}</span> items
          </div>
          <div className="flex items-center gap-1">
            <button className="p-1.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="px-3 py-1 rounded-xl text-sm font-medium bg-cyan-500 text-slate-950">
              1
            </button>
            <button className="p-1.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Inventory;
