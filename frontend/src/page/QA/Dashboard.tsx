// src/page/qa/Dashboard.tsx
import React from 'react';
import {
  ClipboardList,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  PackageX,
  Gauge,
  ArrowRight,
  History,
  Clock,
  AlertCircle,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface Metric {
  label: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}

interface Activity {
  id: string;
  user: string;
  action: string;
  details: string;
  time: string;
  status: 'passed' | 'damaged' | 'rejected' | 'flagged';
}

interface QueueItem {
  id: string;
  product: string;
  details: string;
  quantity: string;
  status: 'Pending' | 'In Progress' | 'Completed';
}

// ============================================
// MOCK DATA
// ============================================

const metrics: Metric[] = [
  {
    label: "TODAY'S INSPECTIONS",
    value: 12,
    subtitle: '3 inspectors on shift',
    icon: <ClipboardList className="w-6 h-6" />,
    iconBg: 'bg-teal-500/10',
    iconColor: 'text-teal-400',
  },
  {
    label: 'PENDING INSPECTION',
    value: 4,
    subtitle: 'Awaiting QA release',
    icon: <ClipboardCheck className="w-6 h-6" />,
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-400',
  },
  {
    label: 'APPROVED PRODUCTS',
    value: 219,
    subtitle: 'Month to date',
    icon: <CheckCircle2 className="w-6 h-6" />,
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-400',
  },
  {
    label: 'REJECTED PRODUCTS',
    value: 38,
    subtitle: '6 open supplier claims',
    icon: <XCircle className="w-6 h-6" />,
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-400',
  },
  {
    label: 'DAMAGED PRODUCTS',
    value: 27,
    subtitle: '4 pending disposal',
    icon: <PackageX className="w-6 h-6" />,
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
  },
  {
    label: 'INSPECTION RATE',
    value: '94.2%',
    subtitle: 'Target 92%',
    icon: <Gauge className="w-6 h-6" />,
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-400',
  },
];

const activities: Activity[] = [
  {
    id: '1',
    user: 'R. Villanueva',
    action: 'passed inspection for',
    details: 'Deformed Steel Bar 16mm',
    time: '18 min ago',
    status: 'passed',
  },
  {
    id: '2',
    user: 'M. Santos',
    action: 'recorded',
    details: '34 damaged cement bags (B-CEM-1187)',
    time: '1 hr ago',
    status: 'damaged',
  },
  {
    id: '3',
    user: 'A. Bautista',
    action: 'rejected',
    details: 'Hex Bolt M12 batch B-BLT-5512',
    time: '3 hrs ago',
    status: 'rejected',
  },
  {
    id: '4',
    user: 'J. Delos Reyes',
    action: 'flagged',
    details: '9 THHN wire rolls for supplier return',
    time: '5 hrs ago',
    status: 'flagged',
  },
  {
    id: '5',
    user: 'M. Santos',
    action: 'passed inspection for',
    details: 'PVC Pipe Series 1000',
    time: 'Yesterday',
    status: 'passed',
  },
];

const queueItems: QueueItem[] = [
  {
    id: '1',
    product: 'Deformed Steel Bar 16mm x 6m',
    details: 'Northgate Steel Works • PO-2026-0451 • Batch B-STL-2201',
    quantity: '480 pcs',
    status: 'Pending',
  },
  {
    id: '2',
    product: 'Portland Cement Type 1 (40kg)',
    details: 'Cordillera Cement Corp. • PO-2026-0448 • Batch B-CEM-1187',
    quantity: '1,200 bags',
    status: 'Pending',
  },
  {
    id: '3',
    product: 'G.I. Pipe Schedule 40 2" x 6m',
    details: 'Pacific Metal Traders • PO-2026-0431 • Batch B-GIP-2205',
    quantity: '180 pcs',
    status: 'Pending',
  },
  {
    id: '4',
    product: 'Tile Adhesive Cement (25kg)',
    details: 'Cordillera Cement Corp. • PO-2026-0418 • Batch B-CEM-1150',
    quantity: '600 bags',
    status: 'Pending',
  },
];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { color: string; bg: string }> = {
    Pending: {
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
    },
    'In Progress': {
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
    },
    Completed: {
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
    },
  };
  const { color, bg } = config[status] || config['Pending'];
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${color} ${bg}`}>
      {status}
    </span>
  );
};

const ActivityDot: React.FC<{ status: Activity['status'] }> = ({ status }) => {
  const colors = {
    passed: 'bg-emerald-400',
    damaged: 'bg-amber-400',
    rejected: 'bg-red-400',
    flagged: 'bg-red-400',
  };
  const dotColor = colors[status] || 'bg-slate-400';
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${dotColor} flex-shrink-0 mt-1`} />;
};

// ============================================
// MAIN COMPONENT
// ============================================

const QADashboard: React.FC = () => {
  // Progress calculation for daily inspection target
  const dailyTarget = 16;
  const completedToday = 12;
  const progressPercentage = (completedToday / dailyTarget) * 100;

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Good afternoon, Ramon</h1>
          <p className="text-sm text-slate-400">
            Wednesday, August 5, 2026 — receiving inspection summary for Plant 02.
          </p>
        </div>
        <button className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold">
          <ClipboardCheck className="w-4 h-4" /> Start Inspection
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map((metric, index) => (
          <div
            key={index}
            className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 hover:border-gray-700 transition-all"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  {metric.label}
                </p>
                <p className="text-2xl font-bold text-white mt-1.5">{metric.value}</p>
                <p className="text-xs text-slate-500 mt-1">{metric.subtitle}</p>
              </div>
              <div className={`p-2.5 rounded-full ${metric.iconBg} ${metric.iconColor}`}>
                {metric.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions & Recent Activities */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Quick Actions */}
        <div className="w-full lg:w-1/3">
          <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 h-full">
            <h3 className="text-lg font-semibold text-white">Quick Actions</h3>
            <p className="text-sm text-slate-400 mb-4">Jump straight into your daily QA tasks.</p>
            <div className="space-y-2">
              <button className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 transition-all text-slate-200">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-cyan-400" />
                  <span>Start Inspection</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>
              <button className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 transition-all text-slate-200">
                <div className="flex items-center gap-2">
                  <PackageX className="w-4 h-4 text-blue-400" />
                  <span>Damaged Items</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>
              <button className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 transition-all text-slate-200">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-400" />
                  <span>Inspection History</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="mt-6">
              <div className="flex items-center justify-between text-sm text-slate-300 mb-1.5">
                <span>Daily inspection target</span>
                <span>
                  {completedToday} / {dailyTarget}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-cyan-500 transition-all"
                  style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activities */}
        <div className="w-full lg:w-2/3">
          <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 h-full">
            <h3 className="text-lg font-semibold text-white">Recent Activities</h3>
            <p className="text-sm text-slate-400 mb-4">Latest quality actions across the receiving bay.</p>
            <div className="space-y-3">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 transition-all"
                >
                  <ActivityDot status={activity.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200">
                      <span className="font-medium text-white">{activity.user}</span>{' '}
                      {activity.action} <span className="text-slate-300">{activity.details}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Today's Inspection Queue */}
      <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Today's Inspection Queue</h3>
            <p className="text-sm text-slate-400">Deliveries received and waiting for QA release.</p>
          </div>
          <button className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">View all</button>
        </div>
        <div className="space-y-3">
          {queueItems.map((item) => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 transition-all border border-gray-800/30"
            >
              <div>
                <p className="text-sm font-medium text-white">{item.product}</p>
                <p className="text-xs text-slate-400">{item.details}</p>
                <p className="text-xs text-slate-500 mt-1">{item.quantity}</p>
              </div>
              <div className="flex items-center gap-3 mt-2 sm:mt-0">
                <StatusBadge status={item.status} />
                <button className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-medium transition-all">
                  Inspect
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default QADashboard;