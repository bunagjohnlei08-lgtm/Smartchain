// src/pages/admin/StockIn.tsx
import React, { useState } from 'react';
import {
  ChevronRight,
  Search,
  Download,
  Package,
  Clock,
  Calendar,
  Truck,
  Users,
  Check,
  X,
  AlertCircle,
  Plus,
  Minus,
  ArrowUp,
  ArrowDown,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Filter,
  RefreshCw,
  Printer,
  FileText,
  ChevronDown,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  MessageSquare,
  User,
  Building,
  MapPin,
  Phone,
  Mail,
  Globe,
  Star,
  Award,
  TrendingUp,
  TrendingDown,
  Minus as MinusIcon,
  AlertTriangle,
  Clock as ClockIcon,
  CheckCircle as CheckCircleIcon,
  XCircle,
  Calendar as CalendarIcon,
  Package as PackageIcon,
  PackageCheck,
  PackageOpen,
  ArrowDownToLine,
  ClipboardList,
  Box,
  Layers,
  Grid,
  List,
  FileCheck,
  FilePlus,
  Truck as TruckIcon,
  Warehouse as WarehouseIcon,
  ExternalLink,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface PendingDelivery {
  id: string;
  poNumber: string;
  supplier: string;
  dock: string;
  lineItems: number;
  expectedTime: string;
}

interface ReceivingHistory {
  id: string;
  grn: string;
  po: string;
  supplier: string;
  items: number;
  received: string;
}

interface RecentStockIn {
  id: string;
  product: string;
  po: string;
  receiver: string;
  time: string;
  quantity: number;
}

// ============================================
// MOCK DATA
// ============================================

const pendingDeliveries: PendingDelivery[] = [
  {
    id: '1',
    poNumber: 'PO-2058',
    supplier: 'Northwind Traders',
    dock: 'Dock 2',
    lineItems: 14,
    expectedTime: 'Today, 13:00',
  },
  {
    id: '2',
    poNumber: 'PO-2055',
    supplier: 'Cebu Logistics Co.',
    dock: 'Dock 3',
    lineItems: 11,
    expectedTime: 'Today, 10:15',
  },
  {
    id: '3',
    poNumber: 'PO-2051',
    supplier: 'Kraft Industrial',
    dock: 'Dock 1',
    lineItems: 8,
    expectedTime: 'Tomorrow, 09:00',
  },
];

const receivingHistory: ReceivingHistory[] = [
  {
    id: '1',
    grn: 'GRN-7712',
    po: 'PO-2057',
    supplier: 'Kraft Industrial',
    items: 9,
    received: '2026-07-31 08:42',
  },
  {
    id: '2',
    grn: 'GRN-7711',
    po: 'PO-2052',
    supplier: 'Apex Components',
    items: 18,
    received: '2026-07-30 15:10',
  },
  {
    id: '3',
    grn: 'GRN-7710',
    po: 'PO-2054',
    supplier: 'Meridian Supply',
    items: 4,
    received: '2026-07-29 11:20',
  },
  {
    id: '4',
    grn: 'GRN-7709',
    po: 'PO-2041',
    supplier: 'Northwind Traders',
    items: 12,
    received: '2026-07-28 09:05',
  },
];

const recentStockIn: RecentStockIn[] = [
  {
    id: '1',
    product: 'Industrial LED Panel 40W',
    po: 'PO-2057',
    receiver: 'A. Reyes',
    time: '12 min ago',
    quantity: 240,
  },
  {
    id: '2',
    product: 'Aluminium Profile 6m',
    po: 'PO-2055',
    receiver: 'A. Reyes',
    time: '1 hr ago',
    quantity: 120,
  },
  {
    id: '3',
    product: 'Servo Motor 400W',
    po: 'PO-2051',
    receiver: 'A. Reyes',
    time: '5 hr ago',
    quantity: 24,
  },
];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { color: string; bg: string; dotColor: string }> = {
    Approved: {
      color: 'text-emerald-700 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800',
      dotColor: 'bg-emerald-500 dark:bg-emerald-400',
    },
  };
  const { color, bg, dotColor } = config[status] || config['Approved'];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color} ${bg}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {status}
    </span>
  );
};

const SearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, placeholder = 'Search...', className = '' }) => (
  <div className={`relative flex-1 min-w-[200px] ${className}`}>
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
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

const StockIn: React.FC = () => {
  // State
  const [search, setSearch] = useState('');
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<PendingDelivery | null>(null);
  const [showReceiveModal, setShowReceiveModal] = useState(false);

  // Calculate total deliveries
  const totalDeliveries = pendingDeliveries.length;
  const totalDocks = new Set(pendingDeliveries.map((d) => d.dock)).size;

  // Handle open checklist
  const handleOpenChecklist = (delivery: PendingDelivery) => {
    setSelectedDelivery(delivery);
    setShowChecklistModal(true);
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span>Admin</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-100">Stock In</span>
      </div>

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Stock In</h1>
          <p className="text-sm text-slate-400">Inbound receiving against approved purchase orders</p>
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
      <div className="bg-[#0f172a]/90 border border-slate-800 rounded-2xl p-5 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Ready to receive a delivery?</h3>
          <p className="text-sm text-slate-400">
            {totalDeliveries} deliveries are scheduled across {totalDocks} docks today.
          </p>
        </div>
        <button
          onClick={() => setShowReceiveModal(true)}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-5 py-2.5 rounded-xl text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
        >
          <ArrowDownToLine className="w-4 h-4" /> Receive Products
        </button>
      </div>

      {/* Top Half Grid: Pending Deliveries + Receiving Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column - Pending Deliveries */}
        <div className="lg:col-span-7">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Pending Deliveries</h3>
                <p className="text-sm text-slate-400">Expected at the dock</p>
              </div>
              <button className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                View all
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {pendingDeliveries.map((delivery) => (
                <div
                  key={delivery.id}
                  className="bg-[#141d30] border border-slate-800/80 rounded-xl p-4 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <span className="text-base font-semibold text-white">{delivery.poNumber}</span>
                    <span className="px-2.5 py-0.5 rounded-lg text-xs font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                      {delivery.dock}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 mb-2">{delivery.supplier}</p>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{delivery.lineItems} line items</span>
                    <span>{delivery.expectedTime}</span>
                  </div>
                  <button
                    onClick={() => handleOpenChecklist(delivery)}
                    className="w-full mt-3 py-2 rounded-lg text-sm font-medium border border-slate-700 text-slate-300 hover:bg-slate-800/50 transition-colors"
                  >
                    Open receiving checklist
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Receiving Timeline */}
        <div className="lg:col-span-5">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 h-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Receiving Timeline</h3>
                <p className="text-sm text-slate-400">Today's inbound activity</p>
              </div>
            </div>

            <div className="space-y-4">
              {[
                {
                  id: '1',
                  title: 'PO-2057 received',
                  description: 'Kraft Industrial · 9 items · Dock 1',
                  time: '08:42',
                  completed: true,
                },
                {
                  id: '2',
                  title: 'Quality inspection passed',
                  description: 'GRN-7712 · no discrepancies',
                  time: '09:05',
                  completed: true,
                },
                {
                  id: '3',
                  title: 'Putaway to Zone B',
                  description: 'Racks B-02-07, B-04-05',
                  time: '09:40',
                  completed: true,
                },
                {
                  id: '4',
                  title: 'PO-2055 arriving',
                  description: 'Cebu Logistics Co. · Dock 3',
                  time: '10:15',
                  completed: false,
                },
                {
                  id: '5',
                  title: 'PO-2058 arriving',
                  description: 'Northwind Traders · Dock 2',
                  time: '13:00',
                  completed: false,
                },
              ].map((item, index) => (
                <div key={item.id} className="relative pl-6">
                  {index < 4 && (
                    <div
                      className={`absolute left-1.5 top-5 bottom-0 w-0.5 ${
                        item.completed ? 'bg-cyan-500' : 'bg-slate-700'
                      }`}
                    />
                  )}
                  <div
                    className={`absolute left-0 top-1.5 w-3 h-3 rounded-full border-2 ${
                      item.completed
                        ? 'bg-cyan-500 border-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]'
                        : 'bg-slate-700 border-slate-600'
                    }`}
                  />
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{item.title}</p>
                      <p className="text-xs text-slate-400">{item.description}</p>
                    </div>
                    <span className="text-xs font-mono text-slate-500 whitespace-nowrap ml-4">
                      {item.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Half Grid: Receiving History + Recent Stock In */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column - Receiving History Table */}
        <div className="lg:col-span-7">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-semibold text-white">Receiving History</h3>
                <p className="text-sm text-slate-400">Goods receipt notes</p>
              </div>
              <button className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                View all
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#141d30] border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      GRN
                    </th>
                    <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      PO
                    </th>
                    <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Supplier
                    </th>
                    <th className="px-5 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                      Items
                    </th>
                    <th className="px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Received
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {receivingHistory.map((record) => (
                    <tr
                      key={record.id}
                      className="border-b border-slate-800/60 hover:bg-[#141d30]/50 transition-colors"
                    >
                      <td className="px-5 py-3.5 text-sm font-medium text-white">
                        {record.grn}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-mono text-slate-400">
                        {record.po}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-300">
                        {record.supplier}
                      </td>
                      <td className="px-5 py-3.5 text-right text-sm text-white">
                        {record.items}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-400">
                        {record.received}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column - Recent Stock In */}
        <div className="lg:col-span-5">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Recent Stock In</h3>
                <p className="text-sm text-slate-400">Latest inbound movements</p>
              </div>
            </div>

            <div className="flex-1 space-y-3.5">
              {recentStockIn.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[#141d30] border border-slate-800 hover:border-slate-600 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 flex-shrink-0">
                    <PackageCheck className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {item.product}
                    </p>
                    <p className="text-xs text-slate-400">
                      {item.po} · {item.receiver} · {item.time}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-400 whitespace-nowrap">
                    +{item.quantity}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
                <p className="text-sm text-slate-300 flex-1">
                  Inbound volume today: <span className="font-semibold text-white">1,860</span> units across 3 suppliers.
                </p>
                <StatusBadge status="Approved" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* RECEIVE PRODUCTS MODAL */}
      {/* ============================================ */}
      {showReceiveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowReceiveModal(false)}
        >
          <div
            className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Receive Products</h2>
              <button
                onClick={() => setShowReceiveModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  PO Number *
                </label>
                <select className="w-full bg-[#090d16] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                  <option>PO-2058 - Northwind Traders</option>
                  <option>PO-2055 - Cebu Logistics Co.</option>
                  <option>PO-2051 - Kraft Industrial</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Dock Assignment
                </label>
                <select className="w-full bg-[#090d16] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                  <option>Dock 1</option>
                  <option>Dock 2</option>
                  <option>Dock 3</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Delivered Quantity
                </label>
                <input
                  type="number"
                  className="w-full bg-[#090d16] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="Enter quantity received"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Condition / Inspection Status
                </label>
                <select className="w-full bg-[#090d16] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                  <option>Passed - No discrepancies</option>
                  <option>Passed - Minor discrepancies noted</option>
                  <option>Failed - Return to supplier</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Receiving Notes
                </label>
                <textarea
                  rows={3}
                  className="w-full bg-[#090d16] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="Add any receiving notes..."
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowReceiveModal(false)}
                  className="px-5 py-2.5 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 text-slate-950"
                >
                  <ArrowDownToLine className="w-4 h-4" /> Receive
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* RECEIVING CHECKLIST MODAL */}
      {/* ============================================ */}
      {showChecklistModal && selectedDelivery && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowChecklistModal(false)}
        >
          <div
            className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">Receiving Checklist</h2>
                <p className="text-sm text-slate-400">
                  {selectedDelivery.poNumber} · {selectedDelivery.supplier}
                </p>
              </div>
              <button
                onClick={() => setShowChecklistModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-[#141d30] rounded-xl p-4 border border-slate-800">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Dock</span>
                  <span className="font-medium text-white">
                    {selectedDelivery.dock}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-slate-400">Line Items</span>
                  <span className="font-medium text-white">
                    {selectedDelivery.lineItems}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-slate-400">Expected</span>
                  <span className="font-medium text-white">
                    {selectedDelivery.expectedTime}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-slate-300 mb-2">Checklist Items</h4>
                <div className="space-y-2">
                  {[
                    'Verify PO and supplier documents',
                    'Count and inspect delivered items',
                    'Check for damage or discrepancies',
                    'Record batch/lot numbers if applicable',
                    'Update inventory system',
                    'Generate goods receipt note',
                  ].map((item, idx) => (
                    <label
                      key={idx}
                      className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#141d30] transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-slate-700 bg-[#090d16] text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
                      />
                      <span className="text-sm text-slate-300">{item}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowChecklistModal(false)}
                  className="px-5 py-2.5 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-all"
                >
                  Close
                </button>
                <button className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 text-slate-950">
                  <ClipboardList className="w-4 h-4" /> Complete Receiving
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockIn;