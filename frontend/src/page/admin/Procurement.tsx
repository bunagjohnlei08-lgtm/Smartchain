// src/pages/admin/Procurement.tsx
import React, { useState } from 'react';
import {
  Download,
  Truck,
  X,
  Clock as ClockIcon,
  CheckCircle as CheckCircleIcon,
  Calendar as CalendarIcon,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface PendingRequest {
  id: string;
  title: string;
  reference: string;
  location: string;
  qty: number;
  needed: string;
  status: 'Pending' | 'Approved';
}

interface ReceivingSchedule {
  id: string;
  poNumber: string;
  dock: string;
  supplier: string;
  status: 'Approved' | 'Partially Received' | 'Pending';
  time: string;
}

interface SupplierSummary {
  id: string;
  name: string;
  orders: number;
  onTime: number;
  quality: number;
}

// ============================================
// MOCK DATA
// ============================================

const pendingRequests: PendingRequest[] = [
  {
    id: '1',
    title: 'Corrugated Box 60x40x40',
    reference: 'REQ-318',
    location: 'Warehouse B',
    qty: 500,
    needed: '2026-08-05',
    status: 'Pending',
  },
  {
    id: '2',
    title: 'Stainless Steel Sheet 2mm',
    reference: 'REQ-317',
    location: 'Production Line 2',
    qty: 120,
    needed: '2026-08-03',
    status: 'Pending',
  },
  {
    id: '3',
    title: 'Nitrile Gloves (Box 100)',
    reference: 'REQ-316',
    location: 'Safety Office',
    qty: 80,
    needed: '2026-08-08',
    status: 'Approved',
  },
  {
    id: '4',
    title: 'Pallet Wrap Film 500mm',
    reference: 'REQ-315',
    location: 'Warehouse A',
    qty: 240,
    needed: '2026-08-02',
    status: 'Approved',
  },
];

const receivingSchedule: ReceivingSchedule[] = [
  {
    id: '1',
    poNumber: 'PO-2057',
    dock: 'Dock 1',
    supplier: 'Kraft Industrial',
    status: 'Approved',
    time: '08:30',
  },
  {
    id: '2',
    poNumber: 'PO-2055',
    dock: 'Dock 3',
    supplier: 'Cebu Logistics Co.',
    status: 'Partially Received',
    time: '10:15',
  },
  {
    id: '3',
    poNumber: 'PO-2058',
    dock: 'Dock 2',
    supplier: 'Northwind Traders',
    status: 'Pending',
    time: '13:00',
  },
  {
    id: '4',
    poNumber: 'PO-2051',
    dock: 'Dock 1',
    supplier: 'Kraft Industrial',
    status: 'Approved',
    time: '15:45',
  },
];

const supplierSummary: SupplierSummary[] = [
  {
    id: '1',
    name: 'Northwind Traders',
    orders: 42,
    onTime: 96,
    quality: 94,
  },
  {
    id: '2',
    name: 'Kraft Industrial',
    orders: 31,
    onTime: 88,
    quality: 91,
  },
  {
    id: '3',
    name: 'Cebu Logistics Co.',
    orders: 24,
    onTime: 79,
    quality: 85,
  },
  {
    id: '4',
    name: 'Apex Components',
    orders: 37,
    onTime: 92,
    quality: 89,
  },
  {
    id: '5',
    name: 'Meridian Supply',
    orders: 18,
    onTime: 71,
    quality: 80,
  },
];

// ============================================
// HELPER COMPONENTS
// ============================================

  const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
   const config: Record<string, { color: string; bg: string; dotColor: string }> = {
     Pending: {
       color: 'text-amber-400',
       bg: 'bg-amber-500/10 border-amber-500/20',
       dotColor: 'bg-amber-500',
     },
     Approved: {
       color: 'text-emerald-400',
       bg: 'bg-emerald-500/10 border-emerald-500/20',
       dotColor: 'bg-emerald-500',
     },
     'Partially Received': {
       color: 'text-sky-400',
       bg: 'bg-sky-500/10 border-sky-500/20',
       dotColor: 'bg-sky-500',
     },
   };
  const { color, bg, dotColor } = config[status] || config['Pending'];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color} ${bg}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {status}
    </span>
  );
};

  const KPICard: React.FC<{
   label: string;
   value: string | number;
   indicator: string;
   icon: React.ReactNode;
   trend?: 'up' | 'down' | 'stable';
 }> = ({ label, value, indicator, icon, trend }) => {
   const trendColor =
     trend === 'up'
       ? 'text-emerald-400'
       : trend === 'down'
       ? 'text-red-400'
       : 'text-gray-400';

   return (
     <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-5 shadow-sm">
       <div className="flex items-start justify-between">
         <div>
           <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
             {label}
           </p>
           <p className="text-2xl font-bold text-white mt-1.5">
             {value}
           </p>
           <p className={`text-xs mt-1 ${trendColor}`}>{indicator}</p>
         </div>
         <div className="p-2.5 bg-slate-800 rounded-lg">{icon}</div>
       </div>
     </div>
   );
};

// ============================================
// MAIN COMPONENT
// ============================================

const Procurement: React.FC = () => {
  const [requests, setRequests] = useState(pendingRequests);
  const [showExportModal, setShowExportModal] = useState(false);

  // Handle Approve/Decline
  const handleRequestAction = (id: string, action: 'Approve' | 'Decline') => {
    setRequests((prev) =>
      prev.map((req) =>
        req.id === id
          ? {
              ...req,
              status: action === 'Approve' ? 'Approved' : 'Pending',
            }
          : req
      )
    );
  };

  // KPI Data
  const pendingCount = requests.filter((r) => r.status === 'Pending').length;
  const approvedCount = requests.filter((r) => r.status === 'Approved').length;
  const activeSuppliers = supplierSummary.length;

  return (
{/* Theme fix: page background and text contrast now respond correctly to Light/Dark mode. */}
    <div className="w-full min-h-screen bg-[#f4f7fb] dark:bg-[#090d16] text-slate-900 dark:text-slate-100 p-4 lg:p-6 space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Procurement
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Requests, approvals and inbound scheduling
          </p>
        </div>
        <button
          onClick={() => setShowExportModal(true)}
          className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 border border-slate-700 text-gray-300 hover:bg-slate-800"
        >
          <Download className="w-4 h-4" /> Export summary
        </button>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Pending Requests"
          value={pendingCount}
          indicator="+2 vs last period"
          icon={<ClockIcon className="w-5 h-5 text-amber-400" />}
          trend="up"
        />
        <KPICard
          label="Approved Orders"
          value={approvedCount}
          indicator="+1 vs last period"
          icon={<CheckCircleIcon className="w-5 h-5 text-emerald-400" />}
          trend="up"
        />
        <KPICard
          label="Receiving Windows"
          value={receivingSchedule.length}
          indicator="today vs last period"
          icon={<CalendarIcon className="w-5 h-5 text-blue-400" />}
          trend="up"
        />
        <KPICard
          label="Active Suppliers"
          value={activeSuppliers}
          indicator="stable vs last period"
          icon={<Truck className="w-5 h-5 text-gray-400" />}
          trend="stable"
        />
      </div>

      {/* Middle Section: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side (2 spans) - Pending Requests Grid */}
        <div className="lg:col-span-2">
          <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Pending Requests
                </h3>
                <p className="text-sm text-gray-400">
                  Awaiting purchasing decision
                </p>
              </div>
              <button className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                View all
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="bg-[#161f33] border border-slate-800 rounded-xl p-4 hover:shadow-sm transition-shadow duration-200"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-sm font-semibold text-white">
                      {req.title}
                    </h4>
                    <StatusBadge status={req.status} />
                  </div>
                  <p className="text-xs text-gray-400 mb-2">
                    {req.reference} · {req.location}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-gray-300 mb-3">
                    <span>Qty {req.qty}</span>
                    <span>Needed {req.needed}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRequestAction(req.id, 'Decline')}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-700 text-gray-300 hover:bg-slate-800 transition-all"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => handleRequestAction(req.id, 'Approve')}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold transition-all"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side (1 span) - Receiving Schedule Timeline */}
        <div className="lg:col-span-1">
          <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-6 h-full">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Receiving Schedule
                </h3>
                <p className="text-sm text-gray-400">
                  Today's dock assignments
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {receivingSchedule.map((item, index) => (
                <div key={item.id} className="relative pl-6">
                  {/* Timeline Line */}
                  {index < receivingSchedule.length - 1 && (
                    <div className="absolute left-1.5 top-6 bottom-0 w-0.5 bg-slate-800" />
                  )}
                  {/* Timeline Dot */}
                  <div
                    className={`absolute left-0 top-1.5 w-3 h-3 rounded-full border-2 ${
                      item.status === 'Approved'
                        ? 'bg-emerald-500 border-emerald-500'
                        : item.status === 'Partially Received'
                        ? 'bg-blue-500 border-blue-500'
                        : 'bg-amber-500 border-amber-500'
                    }`}
                  />
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {item.poNumber} · {item.dock}
                      </p>
                      <p className="text-xs text-gray-400">
                        {item.supplier}
                      </p>
                      <div className="mt-1">
                        <StatusBadge status={item.status} />
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-300 whitespace-nowrap ml-4">
                      {item.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Supplier Summary */}
      <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Supplier Summary
            </h3>
            <p className="text-sm text-gray-400">
              Fill rate and quality across active vendors
            </p>
          </div>
          <button className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
            View all
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {supplierSummary.map((supplier) => (
            <div
              key={supplier.id}
              className="bg-[#161f33] border border-slate-800 rounded-xl p-4 hover:shadow-sm transition-shadow duration-200"
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-white">
                  {supplier.name}
                </h4>
                <span className="text-xs text-gray-400">
                  {supplier.orders} orders
                </span>
              </div>

              <div className="space-y-2">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-300">On-time</span>
                    <span className="font-medium text-white">
                      {supplier.onTime}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${supplier.onTime}%`,
                        backgroundColor:
                          supplier.onTime >= 90
                            ? '#34D399'
                            : supplier.onTime >= 80
                            ? '#FBBF24'
                            : '#F87171',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-300">Quality</span>
                    <span className="font-medium text-white">
                      {supplier.quality}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${supplier.quality}%`,
                        backgroundColor:
                          supplier.quality >= 90
                            ? '#34D399'
                            : supplier.quality >= 80
                            ? '#FBBF24'
                            : '#F87171',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============================================ */}
      {/* EXPORT SUMMARY MODAL */}
      {/* ============================================ */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowExportModal(false)}
        >
          <div
            className="bg-[#0f172a] border border-slate-800/80 rounded-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                Export Summary
              </h2>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-gray-400 hover:text-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-300">
                  Export Format
                </label>
                <select className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all">
                  <option>PDF Document</option>
                  <option>Excel Spreadsheet</option>
                  <option>CSV File</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-300">
                  Date Range
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  />
                  <input
                    type="date"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="px-5 py-2.5 border border-slate-800 rounded-xl text-gray-400 hover:text-slate-100 hover:bg-slate-800 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                >
                  <Download className="w-4 h-4" /> Export
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Procurement;