// src/page/qa/Inventory.tsx
import React, { useState, useMemo } from 'react';
import {
  Lock,
  Search,
  ChevronDown,
  Eye,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

type StockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock' | 'Quarantined';

interface InventoryItem {
  id: string;
  product: string;
  barcode: string;
  currentStock: string;
  location: string;
  status: StockStatus;
}

// ============================================
// MOCK DATA
// ============================================

const mockData: InventoryItem[] = [
  {
    id: '1',
    product: 'Deformed Steel Bar 16mm x 6m',
    barcode: '8901234500011',
    currentStock: '1,840 pcs',
    location: 'Yard A - Rack 3',
    status: 'In Stock',
  },
  {
    id: '2',
    product: 'Portland Cement Type 1 (40kg)',
    barcode: '8901234500028',
    currentStock: '320 bags',
    location: 'Warehouse 1 - Bay 2',
    status: 'Low Stock',
  },
  {
    id: '3',
    product: 'PVC Pipe Series 1000 4" x 3m',
    barcode: '8901234500035',
    currentStock: '640 pcs',
    location: 'Warehouse 2 - Bay 5',
    status: 'In Stock',
  },
  {
    id: '4',
    product: 'THHN Copper Wire #12 (150m)',
    barcode: '8901234500042',
    currentStock: '0 rolls',
    location: 'Warehouse 1 - Cage E',
    status: 'Out of Stock',
  },
  {
    id: '5',
    product: 'Hex Bolt M12 x 60mm Galvanized',
    barcode: '8901234500059',
    currentStock: '5,000 pcs',
    location: 'Quarantine Zone',
    status: 'Quarantined',
  },
  {
    id: '6',
    product: 'Wedge Anchor Bolt 10mm',
    barcode: '8901234500066',
    currentStock: '8,600 pcs',
    location: 'Warehouse 1 - Bin 12',
    status: 'In Stock',
  },
  {
    id: '7',
    product: 'G.I. Pipe Schedule 40 2" x 6m',
    barcode: '8901234500073',
    currentStock: '210 pcs',
    location: 'Yard B - Rack 1',
    status: 'Low Stock',
  },
  {
    id: '8',
    product: 'Industrial Lithium Grease EP2 (16kg)',
    barcode: '8901234500080',
    currentStock: '96 pails',
    location: 'Warehouse 3 - Shelf 4',
    status: 'In Stock',
  },
];

// ============================================
// CONSTANTS
// ============================================

const statusOptions = [
  'All statuses',
  'In Stock',
  'Low Stock',
  'Out of Stock',
  'Quarantined',
];
const locationOptions = [
  'All locations',
  'Yard A - Rack 3',
  'Warehouse 1 - Bay 2',
  'Warehouse 2 - Bay 5',
  'Warehouse 1 - Cage E',
  'Quarantine Zone',
  'Warehouse 1 - Bin 12',
  'Yard B - Rack 1',
  'Warehouse 3 - Shelf 4',
];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: StockStatus }> = ({ status }) => {
  const config: Record<
    StockStatus,
    { color: string; bg: string; dotColor: string }
  > = {
    'In Stock': {
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      dotColor: 'bg-emerald-400',
    },
    'Low Stock': {
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
      dotColor: 'bg-amber-400',
    },
    'Out of Stock': {
      color: 'text-red-400',
      bg: 'bg-red-500/10 border-red-500/20',
      dotColor: 'bg-red-400',
    },
    Quarantined: {
      color: 'text-purple-400',
      bg: 'bg-purple-500/10 border-purple-500/20',
      dotColor: 'bg-purple-400',
    },
  };
  const { color, bg, dotColor } = config[status];
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
  // Filter states
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [locationFilter, setLocationFilter] = useState('All locations');
  const [search, setSearch] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Filter data
  const filteredData = useMemo(() => {
    return mockData.filter((item) => {
      const matchesSearch =
        item.product.toLowerCase().includes(search.toLowerCase()) ||
        item.barcode.includes(search) ||
        item.location.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === 'All statuses' || item.status === statusFilter;
      const matchesLocation =
        locationFilter === 'All locations' || item.location === locationFilter;
      return matchesSearch && matchesStatus && matchesLocation;
    });
  }, [search, statusFilter, locationFilter]);

  // Pagination
  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const currentItems = filteredData.slice(startIndex, endIndex);

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Inventory</h1>
        <p className="text-sm text-slate-400">
          Reference stock levels for quality decisions. QA/QC access is read-only.
        </p>
      </div>

      {/* Notice Banner */}
      <div className="bg-[#0d1322] border border-amber-500/20 rounded-2xl p-4 flex items-center gap-3 text-amber-200/90 text-sm">
        <Lock className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <span>
          View-only access — editing, deleting and stock adjustments are disabled
          for the QA/QC Supervisor role.
        </span>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-[#090d16] border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 appearance-none"
            >
              {statusOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Location
            </label>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full bg-[#090d16] border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 appearance-none"
            >
              {locationOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl overflow-hidden shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-gray-800/50">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search inventory..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#090d16] border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Eye className="w-4 h-4" />
            <span>Read-only</span>
          </div>
        </div>

        {/* Table */}
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-[#090d16] border-b border-gray-800/50">
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Product
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Barcode
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Current Stock
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Location
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {currentItems.length > 0 ? (
                currentItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors"
                  >
                    <td className="px-4 py-3.5 text-sm text-slate-200">
                      {item.product}
                    </td>
                    <td className="px-4 py-3.5 text-sm font-mono text-slate-300">
                      {item.barcode}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">
                      {item.currentStock}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">
                      {item.location}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={item.status} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No inventory items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-gray-800/50 bg-[#090d16]/50">
          <div className="text-sm text-slate-400">
            Showing {totalItems > 0 ? startIndex + 1 : 0} to {endIndex} of {totalItems} records
          </div>
          <div className="flex items-center gap-3 mt-2 sm:mt-0">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-700 text-slate-300 hover:bg-gray-800/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-slate-400">
              Page {currentPage} / {totalPages || 1}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-700 text-slate-300 hover:bg-gray-800/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Inventory;