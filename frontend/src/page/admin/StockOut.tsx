// src/pages/admin/StockOut.tsx
import React, { useState } from 'react';
import {
  ChevronRight,
  Search,
  Download,
  RefreshCw,
  Package,
  Clock,
  User,
  X,
  Scan,
  QrCode,
  ClipboardList,
  PackageMinus,
  ArrowRight,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Filter,
  Printer,
  FileText,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface PendingRelease {
  id: string;
  soNumber: string;
  destination: string;
  items: number;
  scheduledTime: string;
  assignee: string;
}

interface CompletedRelease {
  id: string;
  soNumber: string;
  items: number;
  destination: string;
  picker: string;
  dispatchedAt: string;
}

interface RecentProduct {
  id: string;
  product: string;
  soNumber: string;
  picker: string;
  time: string;
  quantity: number;
}

// ============================================
// MOCK DATA
// ============================================

const pendingReleases: PendingRelease[] = [
  {
    id: '1',
    soNumber: 'SO-4413',
    destination: 'Retail Hub North',
    items: 9,
    scheduledTime: 'Today, 14:00',
    assignee: 'M. Lim',
  },
  {
    id: '2',
    soNumber: 'SO-4414',
    destination: 'Production Line 2',
    items: 5,
    scheduledTime: 'Today, 16:30',
    assignee: 'R. Diaz',
  },
  {
    id: '3',
    soNumber: 'SO-4415',
    destination: 'Retail Hub East',
    items: 12,
    scheduledTime: 'Tomorrow, 08:00',
    assignee: 'Unassigned',
  },
];

const completedReleases: CompletedRelease[] = [
  {
    id: '1',
    soNumber: 'SO-4412',
    items: 7,
    destination: 'Retail Hub South',
    picker: 'M. Lim',
    dispatchedAt: '09:12',
  },
  {
    id: '2',
    soNumber: 'SO-4411',
    items: 3,
    destination: 'Service Fleet',
    picker: 'R. Diaz',
    dispatchedAt: '17:40',
  },
  {
    id: '3',
    soNumber: 'SO-4410',
    items: 15,
    destination: 'Retail Hub North',
    picker: 'M. Lim',
    dispatchedAt: '11:05',
  },
];

const recentProducts: RecentProduct[] = [
  {
    id: '1',
    product: 'Thermal Label Roll 4x6',
    soNumber: 'SO-4412',
    picker: 'M. Lim',
    time: '34 min ago',
    quantity: 60,
  },
  {
    id: '2',
    product: 'Cordless Impact Driver',
    soNumber: 'SO-4411',
    picker: 'R. Diaz',
    time: '2 hr ago',
    quantity: 18,
  },
];

// ============================================
// HELPER COMPONENTS
// ============================================

const SearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, placeholder = 'Search...', className = '' }) => (
  <div className={`relative flex-1 min-w-[200px] ${className}`}>
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[#0f172a] border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
    />
  </div>
);

// ============================================
// MAIN COMPONENT
// ============================================

const StockOut: React.FC = () => {
  // State
  const [search, setSearch] = useState('');
  const [showScanModal, setShowScanModal] = useState(false);
  const [showPickingModal, setShowPickingModal] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<PendingRelease | null>(null);

  // Count pending releases
  const pendingCount = pendingReleases.length;

  // Handle open picking list
  const handleOpenPicking = (release: PendingRelease) => {
    setSelectedRelease(release);
    setShowPickingModal(true);
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span>Admin</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-100">Stock Out</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Stock Out</h1>
          <p className="text-sm text-slate-400">Outbound picking and release workflow</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2.5 rounded-xl border border-slate-800/80 text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button className="p-2.5 rounded-xl border border-slate-800/80 text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Top Callout Banner */}
      <div className="bg-[#0f172a]/90 border border-slate-800/80 rounded-2xl p-5 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Start a release</h3>
          <p className="text-sm text-slate-400">
            {pendingCount} release orders are waiting for picking.
          </p>
        </div>
        <button
          onClick={() => setShowScanModal(true)}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-5 py-2.5 rounded-xl text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
        >
          <Scan className="w-4 h-4" /> Scan Barcode
        </button>
      </div>

      {/* Top Half Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column - Pending Releases */}
        <div className="lg:col-span-7">
          <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Pending Releases</h3>
                <p className="text-sm text-slate-400">Awaiting picking</p>
              </div>
              <button className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                View all
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {pendingReleases.map((release) => (
                <div
                  key={release.id}
                  className="bg-[#141d30] border border-slate-800/80 rounded-xl p-4 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-base font-semibold text-white">{release.soNumber}</span>
                    <span className="text-xs text-slate-400">{release.items} items</span>
                  </div>
                  <p className="text-sm text-slate-300 mb-2">{release.destination}</p>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{release.scheduledTime}</span>
                    <span className="px-2 py-0.5 rounded-lg bg-slate-700/50 text-slate-300">
                      {release.assignee}
                    </span>
                  </div>
                  <button
                    onClick={() => handleOpenPicking(release)}
                    className="w-full mt-3 py-2 rounded-xl text-xs font-medium border border-slate-700/50 text-slate-200 bg-[#1c283d] hover:bg-[#253550] transition-colors"
                  >
                    Open picking list
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Completed Releases */}
        <div className="lg:col-span-5">
          <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-5 h-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Completed Releases</h3>
                <p className="text-sm text-slate-400">Dispatched today and yesterday</p>
              </div>
            </div>

            <div className="space-y-4">
              {completedReleases.map((release, index) => (
                <div key={release.id} className="relative pl-6">
                  {index < completedReleases.length - 1 && (
                    <div className="absolute left-1.5 top-5 bottom-0 w-0.5 bg-cyan-500/30" />
                  )}
                  <div className="absolute left-0 top-1.5 w-3 h-3 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {release.soNumber} · {release.items} items
                      </p>
                      <p className="text-xs text-slate-400">
                        {release.destination} · {release.picker}
                      </p>
                    </div>
                    <span className="text-xs font-mono text-slate-500 whitespace-nowrap ml-4">
                      {release.dispatchedAt}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section - Recent Released Products */}
      <div className="bg-[#0f172a]/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Recent Released Products</h3>
            <p className="text-sm text-slate-400">Latest outbound movements</p>
          </div>
          <button className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
            View all
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recentProducts.map((item) => (
            <div
              key={item.id}
              className="bg-[#141d30]/80 border border-slate-800/90 rounded-xl p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 flex-shrink-0">
                  <PackageMinus className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{item.product}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {item.soNumber} · {item.picker} · {item.time}
                  </p>
                </div>
              </div>
              <span className="text-sm font-semibold text-cyan-400 whitespace-nowrap ml-2">
                -{item.quantity}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ============================================ */}
      {/* SCAN BARCODE MODAL */}
      {/* ============================================ */}
      {showScanModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowScanModal(false)}
        >
          <div
            className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Scan Barcode</h2>
              <button
                onClick={() => setShowScanModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="aspect-video bg-[#090d16] rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center">
                <div className="text-center">
                  <QrCode className="w-12 h-12 text-slate-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Position barcode in frame</p>
                  <p className="text-xs text-slate-500">Camera access required</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Manual Entry
                </label>
                <input
                  type="text"
                  className="w-full bg-[#090d16] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="Enter barcode number"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowScanModal(false)}
                  className="px-5 py-2.5 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-all"
                >
                  Cancel
                </button>
                <button className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 text-slate-950">
                  <Scan className="w-4 h-4" /> Scan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* PICKING LIST MODAL */}
      {/* ============================================ */}
      {showPickingModal && selectedRelease && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowPickingModal(false)}
        >
          <div
            className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">Picking List</h2>
                <p className="text-sm text-slate-400">
                  {selectedRelease.soNumber} · {selectedRelease.destination}
                </p>
              </div>
              <button
                onClick={() => setShowPickingModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 bg-[#141d30] rounded-xl p-4 border border-slate-800">
                <div>
                  <p className="text-xs text-slate-400">Order</p>
                  <p className="text-sm font-medium text-white">{selectedRelease.soNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Items</p>
                  <p className="text-sm font-medium text-white">{selectedRelease.items}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Scheduled</p>
                  <p className="text-sm font-medium text-white">{selectedRelease.scheduledTime}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Picker</p>
                  <p className="text-sm font-medium text-white">{selectedRelease.assignee}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-slate-300 mb-2">Items to Pick</h4>
                <div className="space-y-2">
                  {[
                    { item: 'Industrial LED Panel 40W', location: 'A-04-12', qty: 4 },
                    { item: 'Aluminium Profile 6m', location: 'B-06-01', qty: 2 },
                    { item: 'Safety Helmet Class E', location: 'C-01-09', qty: 3 },
                  ].map((line, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-lg bg-[#090d16] border border-slate-800 hover:bg-[#141d30] transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-white">{line.item}</p>
                        <p className="text-xs text-slate-400">Location: {line.location}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-white">Qty: {line.qty}</span>
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-700 bg-[#090d16] text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPickingModal(false)}
                  className="px-5 py-2.5 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-all"
                >
                  Close
                </button>
                <button className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 text-slate-950">
                  <ClipboardList className="w-4 h-4" /> Confirm Picking
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockOut;