// src/page/qa/DamagedItems.tsx
import React, { useState } from 'react';
import {
  PackageX,
  Clock,
  Truck,
  Trash2,
  Search,
  Calendar,
  Eye,
  Printer,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface DamagedRecord {
  id: string;
  date: string;
  barcode: string;
  product: string;
  quantity: number;
  reason: string;
  reportedBy: string;
  status: 'Pending Disposal' | 'Returned to Supplier' | 'Disposed';
}

// ============================================
// MOCK DATA
// ============================================

const mockData: DamagedRecord[] = [
  {
    id: '1',
    date: '2026-08-05',
    barcode: '8901234500028',
    product: 'Portland Cement Type 1 (40kg)',
    quantity: 34,
    reason: 'Torn bags / moisture exposure',
    reportedBy: 'R. Villanueva',
    status: 'Pending Disposal',
  },
  {
    id: '2',
    date: '2026-08-03',
    barcode: '8901234500011',
    product: 'Deformed Steel Bar 16mm x 6m',
    quantity: 18,
    reason: 'Heavy surface corrosion',
    reportedBy: 'R. Villanueva',
    status: 'Disposed',
  },
  {
    id: '3',
    date: '2026-08-02',
    barcode: '8901234500042',
    product: 'THHN Copper Wire #12 (150m)',
    quantity: 5,
    reason: 'Damaged insulation jacket',
    reportedBy: 'J. Delos Reyes',
    status: 'Pending Disposal',
  },
  {
    id: '4',
    date: '2026-08-01',
    barcode: '8901234500059',
    product: 'Hex Bolt M12 x 60mm Galvanized',
    quantity: 240,
    reason: 'Zinc coating flaking',
    reportedBy: 'M. Santos',
    status: 'Returned to Supplier',
  },
  {
    id: '5',
    date: '2026-07-31',
    barcode: '8901234500080',
    product: 'Industrial Lithium Grease EP2 (16kg)',
    quantity: 3,
    reason: 'Leaking pails',
    reportedBy: 'A. Bautista',
    status: 'Disposed',
  },
  {
    id: '6',
    date: '2026-07-30',
    barcode: '8901234500073',
    product: 'G.I. Pipe Schedule 40 2" x 6m',
    quantity: 2,
    reason: 'Bent / out of spec',
    reportedBy: 'R. Villanueva',
    status: 'Pending Disposal',
  },
];

// Product options for filter
const productOptions = [
  'All products',
  'Portland Cement Type 1 (40kg)',
  'Deformed Steel Bar 16mm x 6m',
  'THHN Copper Wire #12 (150m)',
  'Hex Bolt M12 x 60mm Galvanized',
  'Industrial Lithium Grease EP2 (16kg)',
  'G.I. Pipe Schedule 40 2" x 6m',
];

// Status options
const statusOptions = ['All statuses', 'Pending Disposal', 'Returned to Supplier', 'Disposed'];

// Reason options
const reasonOptions = [
  'All reasons',
  'Torn bags / moisture exposure',
  'Heavy surface corrosion',
  'Damaged insulation jacket',
  'Zinc coating flaking',
  'Leaking pails',
  'Bent / out of spec',
];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: DamagedRecord['status'] }> = ({ status }) => {
  const config: Record<
    DamagedRecord['status'],
    { color: string; bg: string; dotColor: string }
  > = {
    'Pending Disposal': {
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
      dotColor: 'bg-amber-400',
    },
    'Returned to Supplier': {
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      dotColor: 'bg-blue-400',
    },
    Disposed: {
      color: 'text-gray-400',
      bg: 'bg-gray-500/10 border-gray-500/20',
      dotColor: 'bg-gray-400',
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

const DamagedItems: React.FC = () => {
  // Filter states
  const [date, setDate] = useState('');
  const [product, setProduct] = useState('All products');
  const [status, setStatus] = useState('All statuses');
  const [reason, setReason] = useState('All reasons');
  const [search, setSearch] = useState('');

  // Pagination (static since we only have 6 items, but we can still implement)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Filter data
  const filteredData = mockData.filter((item) => {
    const matchesSearch =
      item.product.toLowerCase().includes(search.toLowerCase()) ||
      item.barcode.includes(search) ||
      item.reportedBy.toLowerCase().includes(search.toLowerCase()) ||
      item.reason.toLowerCase().includes(search.toLowerCase());
    const matchesProduct = product === 'All products' || item.product === product;
    const matchesStatus = status === 'All statuses' || item.status === status;
    const matchesReason = reason === 'All reasons' || item.reason === reason;
    // Date filtering would require actual date comparison, we'll skip for mock
    return matchesSearch && matchesProduct && matchesStatus && matchesReason;
  });

  // Summary counts
  const totalDamaged = mockData.length;
  const pendingDisposal = mockData.filter((d) => d.status === 'Pending Disposal').length;
  const returnedToSupplier = mockData.filter((d) => d.status === 'Returned to Supplier').length;
  const disposed = mockData.filter((d) => d.status === 'Disposed').length;

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
        <h1 className="text-2xl font-bold text-white">Damaged Items</h1>
        <p className="text-sm text-slate-400">
          Damaged stock recorded during receiving inspection and warehouse handling.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                TOTAL DAMAGED
              </p>
              <p className="text-2xl font-bold text-white mt-1.5">{totalDamaged}</p>
              <p className="text-xs text-slate-500 mt-1">Records this month</p>
            </div>
            <div className="p-2.5 rounded-full bg-blue-500/10 text-blue-400">
              <PackageX className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                PENDING DISPOSAL
              </p>
              <p className="text-2xl font-bold text-white mt-1.5">{pendingDisposal}</p>
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
                RETURNED TO SUPPLIER
              </p>
              <p className="text-2xl font-bold text-white mt-1.5">{returnedToSupplier}</p>
            </div>
            <div className="p-2.5 rounded-full bg-cyan-500/10 text-cyan-400">
              <Truck className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                DISPOSED
              </p>
              <p className="text-2xl font-bold text-white mt-1.5">{disposed}</p>
            </div>
            <div className="p-2.5 rounded-full bg-red-500/10 text-red-400">
              <Trash2 className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Date</label>
            <div className="relative">
              <input
                type="text"
                placeholder="dd/mm/yyyy"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[#090d16] border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Product</label>
            <select
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="w-full bg-[#090d16] border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 appearance-none"
            >
              {productOptions.map((opt) => (
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

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-[#090d16] border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 appearance-none"
            >
              {reasonOptions.map((opt) => (
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
              placeholder="Search damaged records..."
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
                  Date
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Barcode
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Product
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Quantity
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Reason
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Reported By
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
                    <td className="px-4 py-3.5 text-sm text-slate-300">{item.date}</td>
                    <td className="px-4 py-3.5 text-sm font-mono text-slate-300">{item.barcode}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-200">{item.product}</td>
                    <td className="px-4 py-3.5 text-right text-sm text-slate-300">{item.quantity}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">{item.reason}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">{item.reportedBy}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-2">
                        <button className="p-1.5 rounded-lg border border-gray-700 hover:bg-gray-700/50 transition-all text-slate-300 hover:text-white">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded-lg border border-gray-700 hover:bg-gray-700/50 transition-all text-slate-300 hover:text-white">
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No damaged records found.
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

export default DamagedItems;