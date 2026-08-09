// src/page/qa/RejectedItems.tsx
import React, { useState } from 'react';
import {
  Ban,
  RotateCcw,
  Clock,
  CheckCircle2,
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface RejectedRecord {
  id: string;
  supplier: string;
  product: string;
  barcode: string;
  batch: string;
  rejectedQty: number;
  reason: string;
  status: 'Returned' | 'Pending' | 'Approved Replacement';
}

// ============================================
// MOCK DATA
// ============================================

const mockData: RejectedRecord[] = [
  {
    id: '1',
    supplier: 'Ironclad Fasteners Inc.',
    product: 'Hex Bolt M12 x 60mm Galvanized',
    barcode: '8901234500059',
    batch: 'B-BLT-5512',
    rejectedQty: 5000,
    reason: 'Failed tensile spot test',
    status: 'Returned',
  },
  {
    id: '2',
    supplier: 'Volt Prime Electricals',
    product: 'THHN Copper Wire #12 (150m)',
    barcode: '8901234500042',
    batch: 'B-ELC-7741',
    rejectedQty: 9,
    reason: 'Under-gauge conductor',
    status: 'Pending',
  },
  {
    id: '3',
    supplier: 'Northgate Steel Works',
    product: 'Steel Angle Bar 50 x 50 x 6mm',
    barcode: '8901234500097',
    batch: 'B-STL-2188',
    rejectedQty: 26,
    reason: 'Thickness below tolerance',
    status: 'Approved Replacement',
  },
  {
    id: '4',
    supplier: 'Cordillera Cement Corp.',
    product: 'Tile Adhesive Cement (25kg)',
    barcode: '8901234500110',
    batch: 'B-CEM-1150',
    rejectedQty: 48,
    reason: 'Hardened / expired stock',
    status: 'Pending',
  },
  {
    id: '5',
    supplier: 'Pacific Metal Traders',
    product: 'G.I. Pipe Schedule 40 2" x 6m',
    barcode: '8901234500073',
    batch: 'B-GIP-2205',
    rejectedQty: 14,
    reason: 'Weld seam defects',
    status: 'Returned',
  },
  {
    id: '6',
    supplier: 'Atlas Polymer Supply',
    product: 'PVC Pipe Series 1000 4" x 3m',
    barcode: '8901234500035',
    batch: 'B-PVC-3390',
    rejectedQty: 11,
    reason: 'Wall thickness inconsistent',
    status: 'Approved Replacement',
  },
];

// Supplier options for filter
const supplierOptions = [
  'All suppliers',
  'Ironclad Fasteners Inc.',
  'Volt Prime Electricals',
  'Northgate Steel Works',
  'Cordillera Cement Corp.',
  'Pacific Metal Traders',
  'Atlas Polymer Supply',
];

// Status options
const statusOptions = ['All statuses', 'Returned', 'Pending', 'Approved Replacement'];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: RejectedRecord['status'] }> = ({ status }) => {
  const config: Record<
    RejectedRecord['status'],
    { color: string; bg: string; dotColor: string }
  > = {
    Returned: {
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      dotColor: 'bg-blue-400',
    },
    Pending: {
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
      dotColor: 'bg-amber-400',
    },
    'Approved Replacement': {
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      dotColor: 'bg-emerald-400',
    },
  };
  const { color, bg, dotColor } = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color} ${bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {status}
    </span>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const RejectedItems: React.FC = () => {
  // Filter states
  const [supplier, setSupplier] = useState('All suppliers');
  const [status, setStatus] = useState('All statuses');
  const [search, setSearch] = useState('');

  // Pagination (static since we only have 6 items)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Filter data
  const filteredData = mockData.filter((item) => {
    const matchesSearch =
      item.product.toLowerCase().includes(search.toLowerCase()) ||
      item.supplier.toLowerCase().includes(search.toLowerCase()) ||
      item.barcode.includes(search) ||
      item.batch.toLowerCase().includes(search.toLowerCase()) ||
      item.reason.toLowerCase().includes(search.toLowerCase());
    const matchesSupplier = supplier === 'All suppliers' || item.supplier === supplier;
    const matchesStatus = status === 'All statuses' || item.status === status;
    return matchesSearch && matchesSupplier && matchesStatus;
  });

  // Summary counts
  const totalRejected = mockData.length;
  const returned = mockData.filter((d) => d.status === 'Returned').length;
  const pending = mockData.filter((d) => d.status === 'Pending').length;
  const approvedReplacement = mockData.filter((d) => d.status === 'Approved Replacement').length;

  // Pagination
  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const currentItems = filteredData.slice(startIndex, endIndex);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Rejected Items</h1>
        <p className="text-sm text-slate-400">
          Deliveries that failed quality verification and their supplier resolution status.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                TOTAL REJECTED
              </p>
              <p className="text-2xl font-bold text-white mt-1.5">{totalRejected}</p>
              <p className="text-xs text-slate-500 mt-1">Batches this month</p>
            </div>
            <div className="p-2.5 rounded-full bg-red-500/10 text-red-400">
              <Ban className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                RETURNED
              </p>
              <p className="text-2xl font-bold text-white mt-1.5">{returned}</p>
            </div>
            <div className="p-2.5 rounded-full bg-blue-500/10 text-blue-400">
              <RotateCcw className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                PENDING
              </p>
              <p className="text-2xl font-bold text-white mt-1.5">{pending}</p>
            </div>
            <div className="p-2.5 rounded-full bg-amber-500/10 text-amber-400">
              <Clock className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                APPROVED REPLACEMENT
              </p>
              <p className="text-2xl font-bold text-white mt-1.5">{approvedReplacement}</p>
            </div>
            <div className="p-2.5 rounded-full bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Supplier</label>
            <select
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full bg-[#090d16] border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 appearance-none"
            >
              {supplierOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-[#090d16] border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 appearance-none"
            >
              {statusOptions.map((opt) => (
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
        {/* Search Bar */}
        <div className="p-4 border-b border-gray-800/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search rejections..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#090d16] border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-[#090d16] border-b border-gray-800/50">
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Supplier
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Product
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Barcode
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Batch
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Rejected Qty
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Reason
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Status
                </th>
                <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400">
                  Actions
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
                    <td className="px-4 py-3.5 text-sm text-slate-300">
                      {item.supplier}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-200">
                      {item.product}
                    </td>
                    <td className="px-4 py-3.5 text-sm font-mono text-slate-300">
                      {item.barcode}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">
                      {item.batch}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm font-medium text-red-500">
                      {item.rejectedQty.toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">
                      {item.reason}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center">
                        <button className="p-1.5 rounded-lg border border-gray-700 hover:bg-gray-700/50 transition-all text-slate-300 hover:text-white">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No rejected records found.
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
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-700 text-slate-300 hover:bg-gray-800/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-slate-400">
              Page {currentPage} / {totalPages || 1}
            </span>
            <button
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
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

export default RejectedItems;