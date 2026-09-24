import React from 'react';
import {
  Warehouse,
  FileText,
  Truck,
  AlertTriangle,
  Download,
  RefreshCw,
  Plus,
  MoreVertical,
  TrendingUp,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ============================================
// MOCK DATA
// ============================================

// Top Stat Cards
const topStats = [
  {
    title: 'WAREHOUSE UTILIZATION',
    value: '68%',
    subtitle: '+4.2% vs last week',
    subtitleColor: 'text-emerald-400',
    icon: <Warehouse className="w-5 h-5 text-blue-400" />,
    iconBg: 'bg-blue-500/10 border-blue-500/20',
  },
  {
    title: 'OPEN PURCHASE ORDERS',
    value: '23',
    subtitle: '6 awaiting approval',
    subtitleColor: 'text-slate-400',
    icon: <FileText className="w-5 h-5 text-amber-400" />,
    iconBg: 'bg-amber-500/10 border-amber-500/20',
  },
  {
    title: 'SHIPMENTS IN TRANSIT',
    value: '14',
    subtitle: '2 delayed',
    subtitleColor: 'text-rose-400',
    icon: <Truck className="w-5 h-5 text-emerald-400" />,
    iconBg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    title: 'LOW STOCK ITEMS',
    value: '18',
    subtitle: 'Reorder recommended',
    subtitleColor: 'text-rose-400',
    icon: <AlertTriangle className="w-5 h-5 text-rose-400" />,
    iconBg: 'bg-rose-500/10 border-rose-500/20',
  },
];

// Inventory Movement – data matched to 0–6000 y-axis scale
const movementData = [
  { day: 'Mon', inbound: 3600, outbound: 2100 },
  { day: 'Tue', inbound: 2800, outbound: 1100 },
  { day: 'Wed', inbound: 1800, outbound: 3600 },
  { day: 'Thu', inbound: 2400, outbound: 3900 },
  { day: 'Fri', inbound: 1800, outbound: 5300 },
  { day: 'Sat', inbound: 2600, outbound: 4800 },
  { day: 'Sun', inbound: 3500, outbound: 5200 },
];

// AI Demand Forecast – projected (solid yellow) vs actual (dashed blue)
const forecastData = [
  { day: 'Mon', projected: 3900, actual: 3600 },
  { day: 'Tue', projected: 3600, actual: 3000 },
  { day: 'Wed', projected: 3300, actual: 2300 },
  { day: 'Thu', projected: 3800, actual: 2700 },
  { day: 'Fri', projected: 3600, actual: 2200 },
  { day: 'Sat', projected: 3400, actual: 2600 },
  { day: 'Sun', projected: 4100, actual: 3600 },
];

// Recent Purchase Orders
const purchaseOrders = [
  { id: 'PO-9021', supplier: 'Northgate Trading Co.', amount: '₱184,500', status: 'Approved' },
  { id: 'PO-9022', supplier: 'GreenLeaf Organics', amount: '₱62,400', status: 'Pending' },
  { id: 'PO-9023', supplier: 'Metro Textile Mills', amount: '₱428,000', status: 'Completed' },
  { id: 'PO-9024', supplier: 'Peak Health Supply', amount: '₱96,700', status: 'Approved' },
  { id: 'PO-9025', supplier: 'Bayview Home Goods', amount: '₱18,900', status: 'Cancelled' },
];

// Inventory Status
const inventoryStatus = [
  { sku: 'SKU-001', product: 'Organic Green Tea', stock: 450, status: 'Healthy' },
  { sku: 'SKU-002', product: 'Stainless Steel Bottle', stock: 120, status: 'Low Stock' },
  { sku: 'SKU-003', product: 'Cotton T-Shirt', stock: 45, status: 'Critical' },
  { sku: 'SKU-004', product: 'Wireless Earbuds', stock: 0, status: 'Out of Stock' },
];

// Quick Actions
const quickActions = [
  'Receive Inventory',
  'Create Purchase Order',
  'Transfer Stock',
  'Generate Reports',
];

// ============================================
// HELPER BADGE COMPONENTS
// ============================================

const POStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, string> = {
    Approved: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    Pending: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    Completed: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    Cancelled: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  };
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${styles[status] || styles.Pending}`}>
      {status}
    </span>
  );
};

const InventoryStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, string> = {
    Healthy: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    'Low Stock': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    Critical: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    'Out of Stock': 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  };
  return (
    <span className={`inline-flex items-center justify-center whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium border ${styles[status] || styles.Healthy}`}>
      {status}
    </span>
  );
};

// ============================================
// MAIN DASHBOARD COMPONENT
// ============================================

const Dashboard: React.FC = () => {
  return (
    <div className="w-full min-h-screen bg-[#070a12] text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">

      {/* HEADER */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white tracking-tight">Operations Overview</h1>
        <p className="text-slate-400 text-sm mt-1">
          Real-time supply chain insights and warehouse analytics.
        </p>
      </div>

      {/* 1. TOP STAT CARDS (4 columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {topStats.map((stat, idx) => (
          <div
            key={idx}
            className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-5 flex flex-col justify-between hover:border-slate-700 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className={`p-2.5 rounded-lg border flex items-center justify-center shrink-0 ${stat.iconBg}`}>
                {stat.icon}
              </div>
              <button className="text-slate-500 hover:text-slate-300">
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4">
              <span className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
                {stat.title}
              </span>
              <div className="text-3xl font-bold text-white mt-1">{stat.value}</div>
              <div className={`text-xs mt-1.5 flex items-center gap-1 font-medium ${stat.subtitleColor}`}>
                {stat.subtitle.includes('+') && <TrendingUp className="w-3.5 h-3.5" />}
                {stat.subtitle}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 2. CHARTS SECTION (2 columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inventory Movement */}
        <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-white">Inventory Movement</h2>
              <p className="text-xs text-slate-400">Inbound vs Outbound</p>
            </div>
            <button className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">
              <Download className="w-4 h-4" />
            </button>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={movementData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="inboundGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outboundGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="day" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} domain={[0, 6000]} ticks={[0, 1500, 3000, 4500, 6000]} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '8px' }} />
                <Area type="monotone" dataKey="inbound" stroke="#3b82f6" strokeWidth={2.5} fill="url(#inboundGrad)" />
                <Area type="monotone" dataKey="outbound" stroke="#22c55e" strokeWidth={2.5} fill="url(#outboundGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-center gap-6 mt-2 pt-2 border-t border-slate-800/40 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <span className="text-slate-300">inbound</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-slate-300">outbound</span>
            </div>
          </div>
        </div>

        {/* AI Demand Forecast */}
        <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-white">AI Demand Forecast</h2>
              <p className="text-xs text-slate-400">7-day projection</p>
            </div>
            <button className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecastData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="day" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} domain={[0, 6000]} ticks={[0, 1500, 3000, 4500, 6000]} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '8px' }} />
                {/* Solid yellow line for Projected */}
                <Line type="monotone" dataKey="projected" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b' }} />
                {/* Dashed blue line with circular dots for Actual */}
                <Line type="monotone" dataKey="actual" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4, fill: '#3b82f6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-center gap-6 mt-2 pt-2 border-t border-slate-800/40 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <span className="text-slate-300">Actual</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span className="text-slate-300">Projected</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. MIDDLE TABLES (2 columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Purchase Orders */}
        <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-white">Recent Purchase Orders</h2>
              <p className="text-xs text-slate-400">Latest activity across suppliers</p>
            </div>
            <button className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors">
              View all &gt;
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 font-semibold border-b border-slate-800/80 uppercase tracking-wider">
                  <th className="pb-3 pl-1">PO NUMBER</th>
                  <th className="pb-3">SUPPLIER</th>
                  <th className="pb-3">AMOUNT</th>
                  <th className="pb-3 pr-1 text-right">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-slate-200">
                {purchaseOrders.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 pl-1 font-mono font-medium text-slate-100">{po.id}</td>
                    <td className="py-3.5 text-slate-300">{po.supplier}</td>
                    <td className="py-3.5 font-medium">{po.amount}</td>
                    <td className="py-3.5 pr-1 text-right">
                      <POStatusBadge status={po.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inventory Status */}
        <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-white">Inventory Status</h2>
              <p className="text-xs text-slate-400">Current stock levels</p>
            </div>
            <button className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors">
              Manage &gt;
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 font-semibold border-b border-slate-800/80 uppercase tracking-wider">
                  <th className="pb-3 pl-1">SKU</th>
                  <th className="pb-3">PRODUCT</th>
                  <th className="pb-3">STOCK</th>
                  <th className="pb-3 pr-1 text-right">STATUS</th>

                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-slate-200">
                {inventoryStatus.map((item) => (
                  <tr key={item.sku} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 pl-1 font-mono font-medium text-slate-100">{item.sku}</td>
                    <td className="py-3.5 text-slate-300">{item.product}</td>
                    <td className="py-3.5 font-medium">{item.stock}</td>
                    <td className="py-3.5 pr-1 text-right">
                      <InventoryStatusBadge status={item.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. QUICK ACTIONS */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-300 tracking-wide">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((label, idx) => (
            <button
              key={idx}
              className="bg-[#0b101d] border border-slate-800/80 hover:border-slate-700 rounded-xl p-5 flex flex-col items-center justify-center gap-3 group transition-all"
            >
              <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 group-hover:scale-105 transition-all">
                <Plus className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors">
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* FOOTER */}
      <div className="pt-8 text-center text-xs text-slate-500 border-t border-slate-800/60">
        © 2026 SmartChain. All rights reserved. Powered by AI.
      </div>
    </div>
  );
};

export default Dashboard;
