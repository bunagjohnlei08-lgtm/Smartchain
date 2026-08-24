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

// Top Stat Cards Data
const topStats = [
  {
    title: 'Warehouse Utilization',
    value: '68%',
    subtitle: '+4.2% vs last week',
    subtitleColor: 'text-emerald-400',
    icon: <Warehouse className="w-5 h-5 text-blue-400"/>,
    iconBg: 'bg-blue-500/10',
  },
  {
    title: 'Open Purchase Orders',
    value: '23',
    subtitle: '6 awaiting approval',
    subtitleColor: 'text-slate-400',
    icon: <FileText className="w-5 h-5 text-amber-400"/>,
    iconBg: 'bg-amber-500/10',
  },
  {
    title: 'Shipments In Transit',
    value: '14',
    subtitle: '2 delayed',
    subtitleColor: 'text-rose-400',
    icon: <Truck className="w-5 h-5 text-emerald-400"/>,
    iconBg: 'bg-emerald-500/10',
  },
  {
    title: 'Low Stock Items',
    value: '18',
    subtitle: 'Reorder recommended',
    subtitleColor: 'text-rose-400',
    icon: <AlertTriangle className="w-5 h-5 text-rose-400"/>,
    iconBg: 'bg-rose-500/10',
  },
];

// Inventory Movement Data (Values calibrated to fit 0-6000 Y-Axis scale)
const movementData = [
  { day: 'Mon', inbound: 3400, outbound: 2100 },
  { day: 'Tue', inbound: 2800, outbound: 1200 },
  { day: 'Wed', inbound: 1900, outbound: 3800 },
  { day: 'Thu', inbound: 2600, outbound: 4200 },
  { day: 'Fri', inbound: 1800, outbound: 5200 },
  { day: 'Sat', inbound: 2400, outbound: 4600 },
  { day: 'Sun', inbound: 3600, outbound: 5100 },
];

// AI Demand Forecast Data
const forecastData = [
  { day: 'Mon', projected: 3900, actual: 3600 },
  { day: 'Tue', projected: 3600, actual: 3000 },
  { day: 'Wed', projected: 3300, actual: 2200 },
  { day: 'Thu', projected: 3800, actual: 2800 },
  { day: 'Fri', projected: 3600, actual: 2100 },
  { day: 'Sat', projected: 3400, actual: 2500 },
  { day: 'Sun', projected: 4100, actual: 3600 },
];

// Recent Purchase Orders Data
const purchaseOrders = [
  { id: 'PO-9021', supplier: 'Northgate Trading Co.', amount: '₱184,500', status: 'Approved' },
  { id: 'PO-9022', supplier: 'GreenLeaf Organics', amount: '₱62,400', status: 'Pending' },
  { id: 'PO-9023', supplier: 'Metro Textile Mills', amount: '₱428,000', status: 'Completed' },
  { id: 'PO-9024', supplier: 'Peak Health Supply', amount: '₱96,700', status: 'Approved' },
  { id: 'PO-9025', supplier: 'Bayview Home Goods', amount: '₱18,900', status: 'Cancelled' },
];

// Inventory Status Data
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

// Helper Badge Components
const POStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, string> = {
    Approved: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    Pending: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    Completed: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    Cancelled: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  };
  return (
    <span className={`inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.Pending}`}>
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
    <span className={`inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.Healthy}`}>
      {status}
    </span>
  );
};

export default function AdminDashboard() {
  return (
    <div className="w-full min-w-0 min-h-screen bg-[#070a12] text-slate-100 p-4 sm:p-6 space-y-6 overflow-x-hidden">
      
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Operations Overview</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Real-time supply chain insights and warehouse analytics.
        </p>
      </div>

      {/* 1. TOP STAT CARDS */}
      <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {topStats.map((stat, idx) => (
          <div
            key={idx}
            className="bg-[#0b101d] border border-slate-800/80 rounded-xl p-5 flex flex-col justify-between hover:border-slate-700 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className={`p-2.5 rounded-lg flex items-center justify-center shrink-0 ${stat.iconBg}`}>
                {stat.icon}
              </div>
              <button className="text-slate-500 hover:text-slate-300">
                <MoreVertical className="w-4 h-4"/>
              </button>
            </div>

            <div className="mt-4">
              <span className="text-xs text-slate-400 font-medium">
                {stat.title}
              </span>
              <div className="text-3xl font-bold text-white mt-1">{stat.value}</div>
              <div className={`text-xs mt-1.5 font-medium ${stat.subtitleColor}`}>
                {stat.subtitle}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 2. CHARTS SECTION */}
      <div className="grid min-w-0 grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Inventory Movement */}
        <div className="min-w-0 bg-[#0b101d] border border-slate-800/80 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-white">Inventory Movement</h2>
              <p className="text-xs text-slate-400">Inbound vs Outbound</p>
            </div>
            <button className="p-1 text-slate-400 hover:text-white">
              <Download className="w-4 h-4"/>
            </button>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart margin={{ left: -20, right: 10, bottom: 0, top: 10 }} data={movementData}>
                <defs>
                  <linearGradient id="inboundGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outboundGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} domain={[0, 6000]} ticks={[0, 1500, 3000, 4500, 6000]} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '8px' }} />
                <Area dataKey="inbound" fill="url(#inboundGrad)" stroke="#3b82f6" strokeWidth={2.5} type="monotone" isAnimationActive={true} animationDuration={1500} animationEasing="ease-in-out" animationBegin={300}/>
                <Area dataKey="outbound" fill="url(#outboundGrad)" stroke="#22c55e" strokeWidth={2.5} type="monotone" isAnimationActive={true} animationDuration={1500} animationEasing="ease-in-out" animationBegin={300}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-center gap-6 mt-3 text-xs">
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
        <div className="min-w-0 bg-[#0b101d] border border-slate-800/80 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-white">AI Demand Forecast</h2>
              <p className="text-xs text-slate-400">7-day projection</p>
            </div>
            <button className="p-1 text-slate-400 hover:text-white">
              <RefreshCw className="w-4 h-4"/>
            </button>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer height="100%" width="100%">
              <LineChart margin={{ left: -20, right: 10, bottom: 0, top: 10 }} data={forecastData}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} domain={[0, 6000]} ticks={[0, 1500, 3000, 4500, 6000]} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '8px' }} />
                <Line type="monotone" dataKey="projected" stroke="#f59e0b" strokeWidth={2.5} dot={{ fill: '#f59e0b', r: 4 }} isAnimationActive={true} animationDuration={1500} animationEasing="ease-in-out" animationBegin={300}/>
                <Line type="monotone" dataKey="actual" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#3b82f6', r: 4 }} isAnimationActive={true} animationDuration={1500} animationEasing="ease-in-out" animationBegin={300}/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-center gap-6 mt-3 text-xs">
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

      {/* 3. MIDDLE TABLES SECTION */}
      <div className="grid min-w-0 grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Recent Purchase Orders */}
        <div className="min-w-0 bg-[#0b101d] border border-slate-800/80 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-white">Recent Purchase Orders</h2>
              <p className="text-xs text-slate-400">Latest activity across suppliers</p>
            </div>
            <button className="text-xs text-blue-400 hover:text-blue-300 font-medium">
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
                    <td className="py-3 pl-1 font-mono font-medium text-slate-100">{po.id}</td>
                    <td className="py-3 text-slate-300">{po.supplier}</td>
                    <td className="py-3 font-medium">{po.amount}</td>
                    <td className="py-3 pr-1 text-right">
                      <POStatusBadge status={po.status}/>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inventory Status */}
        <div className="min-w-0 bg-[#0b101d] border border-slate-800/80 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-white">Inventory Status</h2>
              <p className="text-xs text-slate-400">Current stock levels</p>
            </div>
            <button className="text-xs text-blue-400 hover:text-blue-300 font-medium">
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
                    <td className="py-3 pl-1 font-mono font-medium text-slate-100">{item.sku}</td>
                    <td className="py-3 text-slate-300">{item.product}</td>
                    <td className="py-3 font-medium">{item.stock}</td>
                    <td className="py-3 pr-1 text-right">
                      <InventoryStatusBadge status={item.status}/>
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
        <h3 className="text-sm font-semibold text-slate-300">Quick Actions</h3>
        <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {quickActions.map((label, idx) => (
            <button
              key={idx}
              className="bg-[#0b101d] border border-slate-800/80 hover:border-slate-700 rounded-xl p-5 flex flex-col items-center justify-center gap-3 group transition-all"
            >
              <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 group-hover:scale-105 transition-all">
                <Plus className="w-5 h-5"/>
              </div>
              <span className="text-xs font-medium text-slate-300 group-hover:text-white">
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* FOOTER */}
      <div className="pt-6 text-center text-xs text-slate-500 border-t border-slate-800/60">
        © 2026 SmartChain. All rights reserved. Powered by AI.
      </div>
    </div>
  );
}
