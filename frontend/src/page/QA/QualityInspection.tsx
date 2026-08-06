import React, { useState } from 'react';
import { Clock, CheckCircle2, AlertTriangle, Search, CheckSquare, X, ChevronDown, ClipboardCheck } from 'lucide-react';

// ============================================
// TYPES
// ============================================

type InspectionStatus = 'Pending QA' | 'In Progress';
type InspectionOutcome = 'Passed' | 'Partial Pass' | 'Rejected';

interface DeliveryItem {
  id: string;
  deliveryId: string;
  supplier: string;
  product: string;
  deliveredQty: string;
  arrival: string;
  status: InspectionStatus;
}

interface InspectionFormData {
  batchLotNumber: string;
  inspectedQty: number;
  passedQty: number;
  rejectedQty: number;
  outcome: InspectionOutcome;
  remarks: string;
}

// ============================================
// MOCK DATA
// ============================================

const deliveryItems: DeliveryItem[] = [
  {
    id: 'PO-2026-0881',
    deliveryId: 'DEL-0881',
    supplier: 'Cordillera Cement Corp.',
    product: 'Portland Cement Type 1 (40kg)',
    deliveredQty: '1,200 bags',
    arrival: '2026-08-05',
    status: 'Pending QA',
  },
  {
    id: 'PO-2026-0884',
    deliveryId: 'DEL-0884',
    supplier: 'Atlas Polymer Supply',
    product: 'PVC Pipe Series 1000 4" x 3m',
    deliveredQty: '260 pcs',
    arrival: '2026-08-05',
    status: 'Pending QA',
  },
  {
    id: 'PO-2026-0889',
    deliveryId: 'DEL-0889',
    supplier: 'Northgate Steel Works',
    product: 'Deformed Steel Bar 16mm x 6m',
    deliveredQty: '480 pcs',
    arrival: '2026-08-05',
    status: 'In Progress',
  },
  {
    id: 'PO-2026-0892',
    deliveryId: 'DEL-0892',
    supplier: 'Volt Prime Electricals',
    product: 'THHN Copper Wire #12 (150m)',
    deliveredQty: '75 rolls',
    arrival: '2026-08-04',
    status: 'Pending QA',
  },
];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: InspectionStatus }> = ({ status }) => {
  const config: Record<InspectionStatus, { color: string; bg: string }> = {
    'Pending QA': {
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
    },
    'In Progress': {
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
    },
  };
  const { color, bg } = config[status];
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${color} ${bg}`}>
      {status}
    </span>
  );
};

const OutcomeButton: React.FC<{
  value: InspectionOutcome;
  selected: InspectionOutcome;
  onClick: () => void;
}> = ({ value, selected, onClick }) => {
  const colorMap: Record<InspectionOutcome, string> = {
    Passed: 'green',
    'Partial Pass': 'blue',
    Rejected: 'red',
  };
  const color = colorMap[value];

  if (selected === value) {
    const selectedClasses: Record<string, string> = {
      green: 'bg-green-500/10 border-green-500/50 text-green-400',
      blue: 'bg-blue-500/10 border-blue-500/50 text-blue-400',
      red: 'bg-red-500/10 border-red-500/50 text-red-400',
    };
    return (
      <button
        type="button"
        onClick={onClick}
        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${selectedClasses[color]}`}
      >
        {value}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-700 text-gray-400 hover:border-gray-600 transition-colors"
    >
      {value}
    </button>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const QualityInspection: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All Statuses');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryItem | null>(null);
  const [formData, setFormData] = useState<InspectionFormData>({
    batchLotNumber: '',
    inspectedQty: 0,
    passedQty: 0,
    rejectedQty: 0,
    outcome: 'Passed',
    remarks: '',
  });

  const filteredData = deliveryItems.filter((item) => {
    const matchesSearch =
      item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.product.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'All Statuses' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openInspection = (delivery: DeliveryItem) => {
    setSelectedDelivery(delivery);
    setFormData({
      batchLotNumber: '',
      inspectedQty: 0,
      passedQty: 0,
      rejectedQty: 0,
      outcome: 'Passed',
      remarks: '',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedDelivery(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Inspection submitted:', { delivery: selectedDelivery, ...formData });
    closeModal();
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Quality Inspection</h1>
        <p className="mt-1 text-sm text-slate-400">
          Conduct and review receiving inspections for incoming materials.
        </p>
      </div>

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pending Inspection</p>
              <p className="text-3xl font-bold text-white mt-1">4</p>
              <p className="text-sm text-gray-500 mt-1">Deliveries awaiting QA clearance</p>
            </div>
            <div className="p-3 bg-amber-500/10 rounded-full">
              <Clock className="h-6 w-6 text-amber-400" />
            </div>
          </div>
        </div>

        <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Passed Today</p>
              <p className="text-3xl font-bold text-white mt-1">8</p>
              <p className="text-sm text-gray-500 mt-1">Batches cleared today</p>
            </div>
            <div className="p-3 bg-green-500/10 rounded-full">
              <CheckCircle2 className="h-6 w-6 text-green-400" />
            </div>
          </div>
        </div>

        <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Flagged for Rejection</p>
              <p className="text-3xl font-bold text-white mt-1">1</p>
              <p className="text-sm text-gray-500 mt-1">Requires supplier action</p>
            </div>
            <div className="p-3 bg-red-500/10 rounded-full">
              <AlertTriangle className="h-6 w-6 text-red-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar & Search */}
      <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search deliveries or PO numbers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#090d16] border border-gray-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none bg-[#090d16] border border-gray-800 rounded-lg px-4 py-2 pr-10 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
          >
            <option value="All Statuses">All Statuses</option>
            <option value="Pending QA">Pending Verification</option>
            <option value="In Progress">In Progress</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
        </div>
      </div>

      {/* Pending Inspection Queue Table */}
      <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Pending Receiving Deliveries</h2>
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="px-4 py-3.5 font-medium">PO Number / Delivery ID</th>
                <th className="px-4 py-3.5 font-medium">Supplier</th>
                <th className="px-4 py-3.5 font-medium">Product & Quantity</th>
                <th className="px-4 py-3.5 font-medium">Arrival Date</th>
                <th className="px-4 py-3.5 font-medium">Status</th>
                <th className="px-4 py-3.5 font-medium text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredData.map((item) => (
                <tr key={item.id} className="hover:bg-gray-800/20 transition-colors">
                  <td className="px-4 py-3.5 align-middle">
                    <div>
                      <p className="font-medium text-white">{item.id}</p>
                      <p className="text-xs text-gray-500">{item.deliveryId}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 align-middle text-gray-300">{item.supplier}</td>
                  <td className="px-4 py-3.5 align-middle">
                    <div>
                      <p className="text-gray-300">{item.product}</p>
                      <p className="text-xs text-gray-500">{item.deliveredQty}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 align-middle text-gray-300">{item.arrival}</td>
                  <td className="px-4 py-3.5 align-middle">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3.5 align-middle text-right">
                    <button
                      onClick={() => openInspection(item)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-medium rounded-lg transition-colors"
                    >
                      <CheckSquare className="h-4 w-4" />
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspection Modal */}
      {isModalOpen && selectedDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0d1322] border border-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Conduct Inspection</h3>
              <button
                onClick={closeModal}
                className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Batch / Lot Number</label>
                <input
                  type="text"
                  value={formData.batchLotNumber}
                  onChange={(e) => setFormData({ ...formData, batchLotNumber: e.target.value })}
                  className="w-full bg-[#090d16] border border-gray-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Inspected Quantity</label>
                  <input
                    type="number"
                    value={formData.inspectedQty || ''}
                    onChange={(e) => setFormData({ ...formData, inspectedQty: Number(e.target.value) })}
                    className="w-full bg-[#090d16] border border-gray-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Passed Quantity</label>
                  <input
                    type="number"
                    value={formData.passedQty || ''}
                    onChange={(e) => setFormData({ ...formData, passedQty: Number(e.target.value) })}
                    className="w-full bg-[#090d16] border border-gray-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Rejected / Damaged</label>
                  <input
                    type="number"
                    value={formData.rejectedQty || ''}
                    onChange={(e) => setFormData({ ...formData, rejectedQty: Number(e.target.value) })}
                    className="w-full bg-[#090d16] border border-gray-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Inspection Outcome Decision</label>
                <div className="flex gap-3">
                  <OutcomeButton
                    value="Passed"
                    selected={formData.outcome}
                    onClick={() => setFormData({ ...formData, outcome: 'Passed' })}
                  />
                  <OutcomeButton
                    value="Partial Pass"
                    selected={formData.outcome}
                    onClick={() => setFormData({ ...formData, outcome: 'Partial Pass' })}
                  />
                  <OutcomeButton
                    value="Rejected"
                    selected={formData.outcome}
                    onClick={() => setFormData({ ...formData, outcome: 'Rejected' })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Defects / Remarks</label>
                <textarea
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  rows={3}
                  className="w-full bg-[#090d16] border border-gray-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 resize-none"
                  placeholder="e.g., Torn packaging, Tensile test failed..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border border-gray-700 text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-medium rounded-lg transition-colors"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  Submit Inspection Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default QualityInspection;
