import React, { useState } from 'react';
import {
  Download,
  Truck,
  X,
  Clock as ClockIcon,
  CheckCircle as CheckCircleIcon,
  Calendar as CalendarIcon,
  ChevronRight,
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
  const config: Record<
    string,
    { color: string; bg: string; border: string; dotColor: string }
  > = {
    Pending: {
      color: 'text-amber-800 dark:text-amber-400',
      bg: 'bg-amber-100 dark:bg-amber-500/10',
      border: 'border dark:border-amber-500/20 border-amber-200',
      dotColor: 'bg-amber-500',
    },
    Approved: {
      color: 'text-emerald-800 dark:text-emerald-400',
      bg: 'bg-emerald-100 dark:bg-emerald-500/10',
      border: 'border dark:border-emerald-500/20 border-emerald-200',
      dotColor: 'bg-emerald-500',
    },
    'Partially Received': {
      color: 'text-sky-800 dark:text-sky-400',
      bg: 'bg-sky-100 dark:bg-sky-500/10',
      border: 'border dark:border-sky-500/20 border-sky-200',
      dotColor: 'bg-sky-500',
    },
  };
  const { color, bg, border, dotColor } = config[status] || config['Pending'];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${color} ${bg} ${border}`}
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
}> = ({ label, value, indicator, icon }) => {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-xl p-5 flex items-start justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </p>
        <p className="text-2xl font-bold text-[var(--text-primary)] mt-2">
          {value}
        </p>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">{indicator}</p>
      </div>
      <div className="p-2.5 bg-[var(--bg-hover)] rounded-lg">{icon}</div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const Procurement: React.FC = () => {
  const [requests, setRequests] = useState(pendingRequests);
  const [showExportModal, setShowExportModal] = useState(false);

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

  const pendingCount = requests.filter((r) => r.status === 'Pending').length;
  const approvedCount = requests.filter((r) => r.status === 'Approved').length;
  const activeSuppliers = supplierSummary.length;

  return (
    <div className="min-h-screen w-full bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors duration-200 p-6 space-y-6">
      {/* Breadcrumb & Header Row */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>SmartChain</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-[var(--text-primary)] font-medium">Procurement</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Procurement</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Requests, approvals and inbound scheduling
            </p>
          </div>
          <button
            onClick={() => setShowExportModal(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] text-[var(--text-secondary)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] transition-all flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Export summary
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Pending Requests"
          value={pendingCount}
          indicator="+2 vs last period"
          icon={<ClockIcon className="w-5 h-5 text-amber-500" />}
        />
        <KPICard
          label="Approved Orders"
          value={approvedCount}
          indicator="+1 vs last period"
          icon={<CheckCircleIcon className="w-5 h-5 text-emerald-500" />}
        />
        <KPICard
          label="Receiving Windows"
          value={receivingSchedule.length}
          indicator="today vs last period"
          icon={<CalendarIcon className="w-5 h-5 text-cyan-500" />}
        />
        <KPICard
          label="Active Suppliers"
          value={activeSuppliers}
          indicator="stable vs last period"
          icon={<Truck className="w-5 h-5 text-[var(--text-muted)]" />}
        />
      </div>

      {/* Main Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side - Pending Requests */}
        <div className="lg:col-span-2">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  Pending Requests
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Awaiting purchasing decision
                </p>
              </div>
              <button className="text-xs text-[#00a3c4] hover:underline dark:text-cyan-400">
                View all
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="bg-[var(--bg-surface-alt)] border border-[var(--border-color)] rounded-lg p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="text-sm font-semibold text-[var(--text-primary)] leading-tight">
                        {req.title}
                      </h4>
                      <StatusBadge status={req.status} />
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mb-3">
                      {req.reference} · {req.location}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)] mb-4">
                      <span>Qty {req.qty}</span>
                      <span>Needed {req.needed}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => handleRequestAction(req.id, 'Decline')}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-color)] text-[var(--text-secondary)] bg-[var(--bg-hover)] hover:bg-[var(--bg-surface-alt)] transition-all"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => handleRequestAction(req.id, 'Approve')}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#00a3c4] hover:bg-[#008ca8] text-white shadow-none transition-all"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side - Receiving Schedule */}
        <div className="lg:col-span-1">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-xl p-6 h-full">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  Receiving Schedule
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Today's dock assignments
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {receivingSchedule.map((item, index) => (
                <div key={item.id} className="relative pl-5">
                  {index < receivingSchedule.length - 1 && (
                    <div className="absolute left-1.5 top-5 bottom-0 w-px bg-[var(--border-color)]" />
                  )}
                  <div
                    className={`absolute left-0 top-1.5 w-3 h-3 rounded-full ${
                      item.status === 'Approved'
                        ? 'bg-emerald-500'
                        : item.status === 'Partially Received'
                        ? 'bg-sky-500'
                        : 'bg-amber-500'
                    }`}
                  />
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {item.poNumber} · {item.dock}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mb-1.5">
                        {item.supplier}
                      </p>
                      <StatusBadge status={item.status} />
                    </div>
                    <span className="text-xs font-medium text-[var(--text-muted)]">
                      {item.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section - Supplier Summary */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  Supplier Summary
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Fill rate and quality across active vendors
                </p>
          </div>
          <button className="text-xs text-[#00a3c4] hover:underline dark:text-cyan-400">
            View all
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {supplierSummary.map((supplier) => (
            <div
              key={supplier.id}
              className="bg-[var(--bg-surface-alt)] border border-[var(--border-color)] rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                  {supplier.name}
                </h4>
                <span className="text-xs text-[var(--text-muted)]">
                  {supplier.orders} orders
                </span>
              </div>

              <div className="space-y-2">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[var(--text-muted)]">On-time</span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {supplier.onTime}%
                    </span>
                  </div>
                    <div className="w-full h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${supplier.onTime}%`,
                        backgroundColor:
                          supplier.onTime >= 90
                            ? '#34d399'
                            : supplier.onTime >= 80
                            ? '#fbbf24'
                            : '#f87171',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[var(--text-muted)]">Quality</span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {supplier.quality}%
                    </span>
                  </div>
                    <div className="w-full h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${supplier.quality}%`,
                        backgroundColor:
                          supplier.quality >= 90
                            ? '#34d399'
                            : supplier.quality >= 80
                            ? '#fbbf24'
                            : '#f87171',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowExportModal(false)}
        >
          <div
            className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                Export Summary
              </h2>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1 text-[var(--text-muted)]">
                  Export Format
                </label>
                  <select className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-600/50">
                    <option>PDF Document</option>
                    <option>Excel Spreadsheet</option>
                    <option>CSV File</option>
                  </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-[var(--text-muted)]">
                  Date Range
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-600/50"
                  />
                  <input
                    type="date"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-600/50"
                  />
                </div>
              </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium border border-[var(--border-color)] text-[var(--text-secondary)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#00a3c4] hover:bg-[#008ca8] text-white shadow-none flex items-center gap-2"
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