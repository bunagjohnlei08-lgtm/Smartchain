// src/page/qa/InspectionHistory.tsx
import React, { useState, useMemo } from 'react';
import {
  User,
  Calendar,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Filter,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

type DecisionStatus = 'Passed' | 'Partial' | 'Rejected';

interface InspectionRecord {
  id: string;
  product: string;
  supplier: string;
  inspector: string;
  timestamp: string; // e.g., "2026-08-05 • 09:14"
  passed: number;
  rejected: number;
  inspectionId: string;
  status: DecisionStatus;
  remarks: string;
}

// ============================================
// MOCK DATA
// ============================================

const mockData: InspectionRecord[] = [
  {
    id: '1',
    product: 'Portland Cement Type 1 (40kg)',
    supplier: 'Cordillera Cement Corp.',
    inspector: 'R. Villanueva',
    timestamp: '2026-08-05 • 09:14',
    passed: 1166,
    rejected: 34,
    inspectionId: 'INS-9101',
    status: 'Partial',
    remarks: '34 bags torn on arrival, remainder within spec.',
  },
  {
    id: '2',
    product: 'PVC Pipe Series 1000 4" x 3m',
    supplier: 'Atlas Polymer Supply',
    inspector: 'M. Santos',
    timestamp: '2026-08-05 • 11:02',
    passed: 260,
    rejected: 0,
    inspectionId: 'INS-9102',
    status: 'Passed',
    remarks: 'Dimensions and wall thickness verified on 10 samples.',
  },
  {
    id: '3',
    product: 'Deformed Steel Bar 16mm x 6m',
    supplier: 'Northgate Steel Works',
    inspector: 'R. Villanueva',
    timestamp: '2026-08-05 • 13:40',
    passed: 480,
    rejected: 0,
    inspectionId: 'INS-9103',
    status: 'Passed',
    remarks: 'Mill certificate matched batch markings.',
  },
  {
    id: '4',
    product: 'THHN Copper Wire #12 (150m)',
    supplier: 'Volt Prime Electricals',
    inspector: 'J. Delos Reyes',
    timestamp: '2026-08-04 • 15:25',
    passed: 66,
    rejected: 9,
    inspectionId: 'INS-9104',
    status: 'Partial',
    remarks: '9 rolls under-gauge; flagged for supplier return.',
  },
  {
    id: '5',
    product: 'Hex Bolt M12 x 60mm Galvanized',
    supplier: 'Ironclad Fasteners Inc.',
    inspector: 'A. Bautista',
    timestamp: '2026-08-03 • 10:08',
    passed: 0,
    rejected: 5000,
    inspectionId: 'INS-9105',
    status: 'Rejected',
    remarks: 'Entire batch failed tensile spot test. Full return issued.',
  },
];

// ============================================
// CONSTANTS
// ============================================

const timeFilters = ['Today', 'This Week', 'This Month'];
const supplierOptions = [
  'All suppliers',
  'Cordillera Cement Corp.',
  'Atlas Polymer Supply',
  'Northgate Steel Works',
  'Volt Prime Electricals',
  'Ironclad Fasteners Inc.',
];
const productOptions = [
  'All products',
  'Portland Cement Type 1 (40kg)',
  'PVC Pipe Series 1000 4" x 3m',
  'Deformed Steel Bar 16mm x 6m',
  'THHN Copper Wire #12 (150m)',
  'Hex Bolt M12 x 60mm Galvanized',
];
const statusOptions = ['All decisions', 'Passed', 'Partial', 'Rejected'];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: DecisionStatus }> = ({ status }) => {
  const config: Record<
    DecisionStatus,
    { color: string; bg: string; icon: React.ReactNode }
  > = {
    Passed: {
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    Partial: {
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      icon: <AlertCircle className="w-3.5 h-3.5" />,
    },
    Rejected: {
      color: 'text-red-400',
      bg: 'bg-red-500/10 border-red-500/20',
      icon: <XCircle className="w-3.5 h-3.5" />,
    },
  };
  const { color, bg, icon } = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color} ${bg}`}>
      {icon}
      {status}
    </span>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const InspectionHistory: React.FC = () => {
  // State for filters
  const [activeTimeFilter, setActiveTimeFilter] = useState('This Week');
  const [supplier, setSupplier] = useState('All suppliers');
  const [product, setProduct] = useState('All products');
  const [status, setStatus] = useState('All decisions');

  // Filter data (simplified; for mock we just filter by status and product/supplier)
  const filteredData = useMemo(() => {
    return mockData.filter((item) => {
      const matchSupplier = supplier === 'All suppliers' || item.supplier === supplier;
      const matchProduct = product === 'All products' || item.product === product;
      const matchStatus = status === 'All decisions' || item.status === status;
      // For time filter, we could filter by date range; for mock we just show all
      // but we can simulate by checking if timestamp contains the current date part
      // Since we don't have actual date objects, we'll skip time filtering for simplicity.
      return matchSupplier && matchProduct && matchStatus;
    });
  }, [supplier, product, status]);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Inspection History</h1>
        <p className="text-sm text-slate-400">
          Full audit trail of quality decisions made on received deliveries.
        </p>
      </div>

      {/* Time Filter & Dropdown Toolbar */}
      <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
        {/* Time filter buttons */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {timeFilters.map((label) => (
            <button
              key={label}
              onClick={() => setActiveTimeFilter(label)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTimeFilter === label
                  ? 'bg-cyan-500 text-black'
                  : 'bg-transparent border border-gray-700 text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Dropdown filters grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
        </div>
      </div>

      {/* Vertical Timeline */}
      <div className="space-y-6">
        {filteredData.length === 0 ? (
          <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-8 text-center text-slate-400">
            No inspection records found.
          </div>
        ) : (
          filteredData.map((record, index) => {
            // Determine dot color based on status
            const dotColor =
              record.status === 'Passed'
                ? 'bg-emerald-500'
                : record.status === 'Partial'
                ? 'bg-blue-500'
                : 'bg-red-500';
            const dotBorder =
              record.status === 'Passed'
                ? 'border-emerald-500'
                : record.status === 'Partial'
                ? 'border-blue-500'
                : 'border-red-500';

            return (
              <div key={record.id} className="relative pl-6">
                {/* Vertical line (connect nodes) */}
                {index < filteredData.length - 1 && (
                  <div className="absolute left-1.5 top-7 bottom-0 w-0.5 bg-gray-800" />
                )}
                {/* Node indicator */}
                <div
                  className={`absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 ${dotBorder} ${dotColor} ring-2 ring-gray-800/80`}
                />
                {/* Audit card */}
                <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 space-y-3">
                  {/* Header row */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{record.product}</h3>
                      <p className="text-sm text-slate-400">{record.supplier}</p>
                    </div>
                    <StatusBadge status={record.status} />
                  </div>

                  {/* Metadata row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <User className="w-4 h-4 text-slate-500" />
                      {record.inspector}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-slate-500" />
                      {record.timestamp}
                    </span>
                    <span>
                      Passed <span className="text-emerald-400 font-medium">{record.passed.toLocaleString()}</span> /{' '}
                      Rejected <span className="text-red-400 font-medium">{record.rejected.toLocaleString()}</span>
                    </span>
                    <span className="text-slate-500 font-mono text-xs">{record.inspectionId}</span>
                  </div>

                  {/* Remarks box */}
                  <div className="bg-[#090d16] border border-gray-800/60 rounded-xl p-3.5 text-sm text-gray-300">
                    {record.remarks}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default InspectionHistory;