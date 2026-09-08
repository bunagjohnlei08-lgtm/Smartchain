// src/page/plant-manager/Inventory.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  LayoutGrid,
  LayoutList,
} from 'lucide-react';
import type { ApiInventoryItem } from '../../types';
import { apiClient } from '../../lib/api';

// ============================================
// TYPES
// ============================================

type InventoryItem = ApiInventoryItem;

// ============================================
// CONSTANTS
// ============================================

const statusOptions = ['All statuses', 'Available', 'Low Stock', 'Out of Stock'];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<
    string,
    { color: string; bg: string; dotColor: string }
  > = {
    Available: {
      color: 'text-emerald-400',
      bg: 'bg-emerald-950/60 border-emerald-800/60',
      dotColor: 'bg-emerald-400',
    },
    'Low Stock': {
      color: 'text-amber-400',
      bg: 'bg-amber-950/60 border-amber-800/60',
      dotColor: 'bg-amber-400',
    },
    'Out of Stock': {
      color: 'text-rose-400',
      bg: 'bg-rose-950/60 border-rose-800/60',
      dotColor: 'bg-rose-400',
    },
  };
  const { color, bg, dotColor } = config[status] || config.Available;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color} ${bg}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {status}
    </span>
  );
};

const code128Patterns = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100',
  '10011001000', '10011000100', '10001100100', '11001001000', '11001000100', '11000100100',
  '10110011100', '10011011100', '10011001110', '10111001100', '10011101100', '10011100110',
  '11001110010', '11001011100', '11001001110', '11011100100', '11001110100', '11101101110',
  '11101001100', '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000', '10001000110',
  '10110001000', '10001101000', '10001100010', '11010001000', '11000101000', '11000100010',
  '10110111000', '10110001110', '10001101110', '10111011000', '10111000110', '10001110110',
  '11101110110', '11010001110', '11000101110', '11011101000', '11011100010', '11011101110',
  '11101011000', '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100', '10010110000',
  '10010000110', '10000101100', '10000100110', '10110010000', '10110000100', '10011010000',
  '10011000010', '10000110100', '10000110010', '11000010010', '11001010000', '11110111010',
  '11000010100', '10001111010', '10100111100', '10010111100', '10010011110', '10111100100',
  '10011110100', '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110', '10111101000',
  '10111100010', '11110101000', '11110100010', '10111011110', '10111101110', '11101011110',
  '11110101110', '11010000100', '11010010000', '11010011100', '1100011101011',
];

const encodeCode128B = (value: string): string => {
  const codes = [104];
  for (const char of value) {
    const code = char.charCodeAt(0);
    codes.push(code >= 32 && code <= 127 ? code - 32 : 0);
  }
  const checksum = codes.reduce((sum, code, index) => sum + (index === 0 ? code : code * index), 0) % 103;
  return [...codes, checksum, 106].map((code) => code128Patterns[code]).join('');
};

const BarcodeDisplay: React.FC<{ value: string }> = ({ value }) => {
  const pattern = encodeCode128B(value);
  const moduleWidth = 2;
  const height = 46;
  const quietZone = 10;
  const width = pattern.length * moduleWidth + quietZone * 2;
  let cursor = quietZone;

  return (
    <div className="inline-flex min-w-[150px] flex-col gap-1">
      <span className="font-mono text-xs text-slate-300 sm:text-sm">{value}</span>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-10 w-40 rounded bg-white"
        role="img"
        aria-label={`Barcode ${value}`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width={width} height={height} fill="#ffffff" />
        {pattern.split('').map((bit, index) => {
          const x = cursor;
          cursor += moduleWidth;
          return bit === '1' ? <rect key={index} x={x} y="4" width={moduleWidth} height="38" fill="#000000" /> : null;
        })}
      </svg>
    </div>
  );
};

function formatLastUpdated(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ============================================
// MAIN COMPONENT
// ============================================

const Inventory: React.FC = () => {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  // State
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');

  const fetchInventory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/inventory');
      setInventory(response.data.data ?? response.data);
    } catch {
      setError('Unable to load inventory records.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // Filtered inventory
  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const query = searchQuery.toLowerCase();
      const matchSearch =
        item.product.toLowerCase().includes(query) ||
        item.barcode.toLowerCase().includes(query) ||
        item.warehouse.toLowerCase().includes(query);
      const matchStatus =
        statusFilter === 'All statuses' || item.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [inventory, searchQuery, statusFilter]);

  // Calculate totals
  const totalAvailable = inventory.reduce((sum, item) => sum + item.available_stock, 0);
  const totalReserved = inventory.reduce((sum, item) => sum + item.reserved_stock, 0);
  const totalBackload = inventory.reduce((sum, item) => sum + item.backload, 0);

  const handleExport = () => {
    const header = ['Barcode', 'Product', 'Warehouse', 'Available', 'Reserved', 'Backload', 'Status', 'Last Updated'];
    const rows = filteredInventory.map((item) => [
      item.barcode,
      item.product,
      item.warehouse,
      item.available_stock,
      item.reserved_stock,
      item.backload,
      item.status,
      item.updated_at,
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plant-manager-inventory-export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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
          <button onClick={handleExport} className="bg-[#101929] hover:bg-[#18253d] border border-slate-700/60 text-slate-200 text-xs font-medium px-4 py-2 rounded-xl flex items-center gap-2 transition-colors">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => window.print()} className="bg-[#101929] hover:bg-[#18253d] border border-slate-700/60 text-slate-200 text-xs font-medium px-4 py-2 rounded-xl flex items-center gap-2 transition-colors">
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
            Backload Stock
          </p>
          <p className="text-3xl md:text-4xl font-bold text-rose-500">
            {totalBackload.toLocaleString()}
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
              placeholder="Search barcode, product or warehouse"
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
            <button onClick={fetchInventory} className="p-2.5 rounded-xl border border-slate-800 hover:bg-slate-800/30 transition-colors text-slate-400 hover:text-slate-200">
              <RefreshCw className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-[#101929] p-1" aria-label="Inventory view"><button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} title="List view" className={`rounded-md p-1.5 ${viewMode === 'list' ? 'bg-[#092635] text-white' : 'text-slate-400 hover:text-white'}`}><LayoutList className="h-4 w-4" /></button><button type="button" onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} title="Grid view" className={`rounded-md p-1.5 ${viewMode === 'grid' ? 'bg-[#092635] text-white' : 'text-slate-400 hover:text-white'}`}><LayoutGrid className="h-4 w-4" /></button></div>
          </div>
        </div>

        {/* Table */}
        {error && (
          <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {viewMode === 'list' ? <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-slate-800/80">
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Barcode
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Product
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Warehouse
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Available
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Reserved
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Backload
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Status
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Last Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Loading inventory...
                  </td>
                </tr>
              )}
              {!isLoading && filteredInventory.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-4 py-3.5">
                    <BarcodeDisplay value={item.barcode} />
                  </td>
                  <td className="px-4 py-3.5 text-sm font-medium text-white">
                    {item.product}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-400">
                    {item.warehouse}
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm text-white">
                    {item.available_stock}
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm font-medium text-cyan-400">
                    {item.reserved_stock}
                  </td>
                  <td className={`px-4 py-3.5 text-right text-sm font-medium ${
                    item.backload > 0 ? 'text-rose-400' : 'text-slate-500'
                  }`}>
                    {item.backload}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-400">
                    {formatLastUpdated(item.updated_at)}
                  </td>
                </tr>
              ))}
              {!isLoading && filteredInventory.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No inventory items found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div> : isLoading ? <div className="py-8 text-center text-slate-400">Loading inventory...</div> : filteredInventory.length > 0 ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredInventory.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900 dark:text-white">{item.product}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.warehouse}</p></div><StatusBadge status={item.status} /></div><div className="mt-3"><BarcodeDisplay value={item.barcode} /></div><dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm"><div><dt className="text-slate-500 dark:text-slate-400">Available</dt><dd className="font-semibold text-slate-900 dark:text-white">{item.available_stock}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Reserved</dt><dd className="font-semibold text-cyan-600 dark:text-cyan-400">{item.reserved_stock}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Backload</dt><dd className={item.backload > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-slate-500'}>{item.backload}</dd></div></dl><p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">Updated {formatLastUpdated(item.updated_at)}</p></article>)}</div> : <div className="py-8 text-center text-slate-400">No inventory items found matching your filters.</div>}

        {/* Pagination (static) */}
        <div className="flex items-center justify-between px-2 py-3 border-t border-slate-800/60">
          <div className="text-sm text-slate-400">
            Showing <span className="text-white font-medium">1</span> to{' '}
            <span className="text-white font-medium">{filteredInventory.length}</span> of{' '}
            <span className="text-white font-medium">{inventory.length}</span> items
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
