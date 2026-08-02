// src/page/admin/Dashboard.tsx
import React, { useState } from 'react';
import {
  Package,
  Layers,
  Wallet,
  AlertTriangle,
  ShieldAlert,
  ClipboardList,
  ArrowDownCircle,
  ArrowUpCircle,
  Search,
  Download,
  ChevronRight,
  MoreVertical,
  Eye,
  User,
  Clock,
  CheckCircle,
  InfoIcon,
  FileText,
  ArrowUp,
  ArrowDown,
  Minus,
  Sparkles,
  TrendingUp,
  ExternalLink,
  Shield,
  Check,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart as RePieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

// ============================================
// TYPES
// ============================================

interface KPI {
  label: string;
  value: string | number;
  change: string;
  icon: React.ReactNode;
  trend: 'up' | 'down' | 'neutral';
}

interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  currentStock: number;
  reorderLevel: number;
  status: 'critical' | 'low' | 'warning';
}

interface Transaction {
  id: string;
  reference: string;
  type: 'Approved' | 'Info' | 'Draft' | 'Pending';
  product: string;
  qty: number;
  user: string;
  time: string;
}

interface SupplierPerformance {
  id: string;
  name: string;
  orders: number;
  onTime: number;   // percentage
  quality: number;  // percentage
}

interface ForecastProduct {
  id: string;
  name: string;
  demand: number;
  reorder: number;
  confidence: number;
}

// ============================================
// MOCK DATA
// ============================================

const kpiData: KPI[] = [
  { label: 'Total Products', value: '1,284', change: '+3.2%', icon: <Package className="w-5 h-5" />, trend: 'up' },
  { label: 'Total Categories', value: '36', change: '+1', icon: <Layers className="w-5 h-5" />, trend: 'up' },
  { label: 'Stock Value', value: '$2.48M', change: '+5.8%', icon: <Wallet className="w-5 h-5" />, trend: 'up' },
  { label: 'Low Stock Items', value: '42', change: '-6', icon: <AlertTriangle className="w-5 h-5" />, trend: 'down' },
  { label: 'Out of Stock', value: '9', change: '-2', icon: <ShieldAlert className="w-5 h-5" />, trend: 'down' },
  { label: 'Pending POs', value: '14', change: '+4', icon: <ClipboardList className="w-5 h-5" />, trend: 'up' },
  { label: "Today's Stock In", value: '1,860', change: '+12.4%', icon: <ArrowDownCircle className="w-5 h-5" />, trend: 'up' },
  { label: "Today's Stock Out", value: '1,204', change: '-4.1%', icon: <ArrowUpCircle className="w-5 h-5" />, trend: 'down' },
];

const lowStockItems: LowStockItem[] = [
  { id: '1', name: 'Corrugated Box 60x40x40', sku: 'PKG-BOX-604', currentStock: 92, reorderLevel: 150, status: 'warning' },
  { id: '2', name: 'Stainless Steel Sheet 2mm', sku: 'RAW-SST-002', currentStock: 0, reorderLevel: 40, status: 'critical' },
  { id: '3', name: 'Safety Helmet Class E', sku: 'SAF-HLM-001', currentStock: 64, reorderLevel: 80, status: 'low' },
  { id: '4', name: 'Nitrile Gloves (Box 100)', sku: 'SAF-GLV-100', currentStock: 0, reorderLevel: 50, status: 'critical' },
  { id: '5', name: 'Pallet Wrap Film 500mm', sku: 'PKG-WRP-500', currentStock: 74, reorderLevel: 120, status: 'low' },
];

const transactions: Transaction[] = [
  { id: '1', reference: 'PO-2857', type: 'Approved', product: 'Industrial LED Panel 40W', qty: 240, user: 'A. Reyes', time: '12 min ago' },
  { id: '2', reference: 'SO-4412', type: 'Info', product: 'Thermal Label Roll 4x6', qty: 60, user: 'M. Lim', time: '34 min ago' },
  { id: '3', reference: 'PO-2855', type: 'Approved', product: 'Aluminium Profile 6m', qty: 120, user: 'A. Reyes', time: '1 hr ago' },
  { id: '4', reference: 'SO-4411', type: 'Info', product: 'Cordless Impact Driver', qty: 18, user: 'R. Diaz', time: '2 hr ago' },
  { id: '5', reference: 'ADJ-221', type: 'Draft', product: 'Safety Helmet Class E', qty: -3, user: 'L. Cruz', time: '3 hr ago' },
  { id: '6', reference: 'PO-2851', type: 'Approved', product: 'Servo Motor 400W', qty: 24, user: 'A. Reyes', time: '5 hr ago' },
];

const supplierData: SupplierPerformance[] = [
  { id: '1', name: 'Northwind Traders', orders: 42, onTime: 96, quality: 94 },
  { id: '2', name: 'Kraft Industrial', orders: 31, onTime: 88, quality: 91 },
  { id: '3', name: 'Cebu Logistics Co.', orders: 24, onTime: 79, quality: 85 },
  { id: '4', name: 'Apex Components', orders: 37, onTime: 92, quality: 89 },
  { id: '5', name: 'Meridian Supply', orders: 18, onTime: 71, quality: 80 },
];

const forecastData: ForecastProduct[] = [
  { id: '1', name: 'Industrial LED Panel 40W', demand: 640, reorder: 480, confidence: 94 },
  { id: '2', name: 'Corrugated Box 60x40x40', demand: 2100, reorder: 1800, confidence: 91 },
  { id: '3', name: 'Stainless Steel Sheet 2mm', demand: 180, reorder: 220, confidence: 87 },
  { id: '4', name: 'Nitrile Gloves (Box 100)', demand: 320, reorder: 400, confidence: 82 },
];

const inventoryTrendData = [
  { month: 'Jan', stock: 52000, value: 1.8 },
  { month: 'Feb', stock: 48000, value: 1.7 },
  { month: 'Mar', stock: 53000, value: 1.9 },
  { month: 'Apr', stock: 56000, value: 2.1 },
  { month: 'May', stock: 58000, value: 2.2 },
  { month: 'Jun', stock: 60000, value: 2.4 },
  { month: 'Jul', stock: 59000, value: 2.48 },
];

const poStatusData = [
  { name: 'Completed', value: 1204, color: '#10b981' },
  { name: 'Approved', value: 42, color: '#06b6d4' },
  { name: 'Draft', value: 8, color: '#a855f7' },
  { name: 'Pending', value: 14, color: '#f59e0b' },
  { name: 'Partially Received', value: 12, color: '#0284c7' },
];

const stockMovementData = [
  { day: 'Mon', in: 320, out: 280 },
  { day: 'Tue', in: 450, out: 390 },
  { day: 'Wed', in: 380, out: 410 },
  { day: 'Thu', in: 510, out: 460 },
  { day: 'Fri', in: 490, out: 520 },
  { day: 'Sat', in: 280, out: 240 },
  { day: 'Sun', in: 190, out: 170 },
];

const monthlyActivityData = [
  { month: 'Feb', receiving: 420, release: 380, transfers: 120 },
  { month: 'Mar', receiving: 480, release: 410, transfers: 140 },
  { month: 'Apr', receiving: 530, release: 460, transfers: 160 },
  { month: 'May', receiving: 560, release: 510, transfers: 180 },
  { month: 'Jun', receiving: 610, release: 540, transfers: 200 },
  { month: 'Jul', receiving: 650, release: 580, transfers: 220 },
];

// ============================================
// HELPERS
// ============================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    Approved: { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle },
    Info: { color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: InfoIcon },
    Draft: { color: 'text-slate-400 bg-slate-500/10 border-slate-500/20', icon: FileText },
    Pending: { color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: Clock },
  };
  const { color, icon: Icon } = config[status] || config.Pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
};

const LowStockBadge: React.FC<{ status: string }> = ({ status }) => {
  const config = {
    critical: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    low: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    warning: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  };
  const color = config[status as keyof typeof config] || config.warning;
  return <span className={`px-2 py-0.5 rounded text-xs font-medium border ${color}`}>{status}</span>;
};

// ============================================
// MAIN COMPONENT
// ============================================

const Dashboard: React.FC = () => {
  const [date] = useState(new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
  const [location] = useState('Central Distribution Center');

  const trendColor = (trend: 'up' | 'down' | 'neutral') =>
    trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-rose-400' : 'text-slate-400';
  const TrendIcon = (trend: 'up' | 'down' | 'neutral') =>
    trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus;

  return (
    <div className="w-full min-h-screen bg-[#0a0f1d] p-4 sm:p-6 lg:p-8 space-y-6 overflow-x-hidden">
      {/* ============================================================
          HEADER
      ============================================================ */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6 px-1">
        <div className="space-y-1">
          <nav className="flex items-center gap-2 text-sm text-slate-400">
            <span className="hover:text-slate-300 cursor-pointer">Admin</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-slate-300 font-medium">Dashboard</span>
          </nav>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
               <input
                 type="text"
                 placeholder="Search products, PO, SKU..."
                 className="pl-9 pr-4 py-2 rounded-xl bg-[#0f172a] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 w-full sm:w-72"
               />
            </div>
            <div>
               <h1 className="text-xl font-bold text-white">Warehouse Operations Dashboard</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">{date} · {location}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-800 text-sm font-medium text-slate-300 bg-[#0f172a] hover:bg-slate-800 transition-colors">
            <Download className="w-4 h-4" />
            Export snapshot
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors">
            Receive products
          </button>
        </div>
      </div>

      {/* ============================================================
          KPI METRICS GRID — 4 CARDS PER ROW
      ============================================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {kpiData.map((kpi, idx) => (
          <div
            key={idx}
            className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-5 hover:border-blue-300 dark:hover:border-slate-600 transition-all group"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{kpi.label}</p>
                <p className="text-2xl font-bold text-white mt-1.5">{kpi.value}</p>
                {kpi.change && (
                  <p className={`text-sm mt-1 flex items-center gap-1 ${trendColor(kpi.trend)}`}>
                    {React.createElement(TrendIcon(kpi.trend), { className: "w-3.5 h-3.5" })}
                    {kpi.change}
                  </p>
                )}
              </div>
              <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400 group-hover:bg-blue-500/20 transition-colors shrink-0">
                {kpi.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ============================================================
          CHARTS SECTION 1 — Inventory Trend (8/12) + PO Status (4/12)
      ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Inventory Trend */}
        <div className="lg:col-span-8 bg-[#0f172a] border border-slate-800/80 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold">Inventory Trend</h3>
              <p className="text-slate-400 text-sm">Stock units and valuation trend across 7 months</p>
            </div>
            <button className="text-slate-400 hover:text-slate-300 transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={inventoryTrendData}>
              <defs>
                <linearGradient id="gradientStock" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" stroke="#64748b" tick={{ fill: '#64748b' }} />
              <YAxis yAxisId="left" stroke="#64748b" tick={{ fill: '#64748b' }} />
              <YAxis yAxisId="right" orientation="right" stroke="#64748b" tick={{ fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' }}
              />
              <Legend />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="stock"
                stroke="#3B82F6"
                fill="url(#gradientStock)"
                name="Stock Units"
              />
              <Line type="monotone" yAxisId="right" dataKey="value" stroke="#22C55E" strokeWidth={2} name="Valuation ($M)" dot={{ fill: '#22C55E', r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* PO Status Donut Chart */}
        <div className="lg:col-span-4 bg-[#0f172a] border border-slate-800/80 rounded-2xl p-6 flex flex-col justify-between items-center h-full min-h-[340px]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold">Purchase Order Status</h3>
              <p className="text-slate-400 text-sm">Distribution across the last 90 days</p>
            </div>
            <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <RePieChart>
              <Pie
                data={poStatusData}
                cx="50%"
                cy="45%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
                label={false}
                labelLine={false}
              >
                {poStatusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#0f172a" strokeWidth={2} />
                ))}
              </Pie>
            </RePieChart>
          </ResponsiveContainer>
          {/* CUSTOM CLEAN LEGEND */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pt-2 px-2 text-xs font-medium">
            {poStatusData.map((entry, index) => (
              <div key={`legend-${index}`} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span style={{ color: entry.color }} className="whitespace-nowrap">
                  {entry.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ============================================================
          CHARTS SECTION 2 — Stock Movement (6/12) + Monthly Activity (6/12)
      ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock Movement */}
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold">Stock Movement</h3>
              <p className="text-slate-400 text-sm">Stock In vs Stock Out this week</p>
            </div>
            <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stockMovementData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" stroke="#64748b" tick={{ fill: '#64748b' }} />
              <YAxis stroke="#64748b" tick={{ fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' }}
              />
              <Legend />
              <Bar dataKey="in" fill="#3B82F6" name="Stock In" radius={[4, 4, 0, 0]} />
              <Bar dataKey="out" fill="#EF4444" name="Stock Out" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Inventory Activity */}
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold">Monthly Inventory Activity</h3>
              <p className="text-slate-400 text-sm">Receiving, release and transfers</p>
            </div>
            <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyActivityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" stroke="#64748b" tick={{ fill: '#64748b' }} />
              <YAxis stroke="#64748b" tick={{ fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#fff' }}
              />
              <Legend />
              <Bar dataKey="receiving" stackId="a" fill="#3B82F6" name="Receiving" radius={[0, 0, 0, 0]} />
              <Bar dataKey="release" stackId="a" fill="#22C55E" name="Release" radius={[0, 0, 0, 0]} />
              <Bar dataKey="transfers" stackId="a" fill="#F59E0B" name="Transfers" radius={[0, 0, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ============================================================
          BOTTOM DATA PANELS — Low Stock Summary (4/12) + Recent Transactions (8/12)
      ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Low Stock Summary */}
        <div className="lg:col-span-4 bg-[#0f172a] border border-slate-800/80 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold">Low Stock Summary</h3>
              <p className="text-slate-400 text-sm">Items at or below reorder level</p>
            </div>
            <button className="text-blue-600 dark:text-blue-400 text-sm hover:text-blue-700 dark:hover:text-blue-300 transition-colors inline-flex items-center gap-1">
              View all <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-3">
            {lowStockItems.map((item) => {
              const pct = Math.round((item.currentStock / item.reorderLevel) * 100);
              const barColor = item.status === 'critical' ? 'bg-rose-500' : item.status === 'low' ? 'bg-amber-500' : 'bg-amber-400';
              return (
                  <div key={item.id} className="p-3 rounded-xl bg-slate-900/40 border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">{item.name}</p>
                        <p className="text-slate-400 text-xs">{item.sku}</p>
                    </div>
                    <LowStockBadge status={item.status === 'critical' ? 'critical' : item.status === 'low' ? 'low' : 'warning'} />
                  </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono shrink-0">
                      {item.currentStock}/{item.reorderLevel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="lg:col-span-8 bg-[#0f172a] border border-slate-800/80 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Recent Transactions</h3>
              <p className="text-sm text-slate-400">Latest inventory ledger entries</p>
            </div>
            <button className="text-xs font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5">
              View all <Eye className="w-3.5 h-3.5"/>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left py-3 text-slate-400 font-medium w-[24%]">Reference</th>
                  <th className="text-left py-3 text-slate-400 font-medium w-[10%]">Type</th>
                  <th className="text-left py-3 text-slate-400 font-medium w-[30%]">Product Name</th>
                  <th className="text-right py-3 text-slate-400 font-medium w-[8%]">Qty</th>
                  <th className="text-left py-3 text-slate-400 font-medium w-[14%]">User</th>
                  <th className="text-left py-3 text-slate-400 font-medium w-[14%]">Time</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-slate-800/60 hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 w-[24%]">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={tx.type} />
                        <span className="text-white font-mono text-xs">{tx.reference}</span>
                      </div>
                    </td>
                    <td className="py-3 text-slate-300 text-xs w-[10%]">{tx.type}</td>
                    <td className="py-3 text-slate-300 font-medium truncate w-[30%]">{tx.product}</td>
                    <td className="py-3 text-right text-white font-medium w-[8%]">{tx.qty}</td>
                    <td className="py-3 text-slate-400 text-xs w-[14%]">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" /> {tx.user}
                      </div>
                    </td>
                    <td className="py-3 text-slate-400 text-xs w-[14%]">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> {tx.time}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ============================================================
          NEW BOTTOM SECTION: Supplier Performance & AI Forecast
      ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Supplier Performance */}
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold">Supplier Performance</h3>
              <p className="text-slate-400 text-sm">On-time delivery and quality score</p>
            </div>
            <button className="text-blue-600 dark:text-blue-400 text-sm hover:text-blue-700 dark:hover:text-blue-300 transition-colors inline-flex items-center gap-1">
              View all <Eye className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-5">
            {supplierData.map((supplier) => (
              <div key={supplier.id} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white font-medium">{supplier.name}</span>
                  <span className="text-slate-400 text-xs">
                    {supplier.orders} orders · {supplier.onTime}% on-time
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Delivery</span>
                      <span className="text-slate-300">{supplier.onTime}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-cyan-500 transition-all"
                        style={{ width: `${supplier.onTime}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Quality</span>
                      <span className="text-slate-300">{supplier.quality}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{ width: `${supplier.quality}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Forecast Summary */}
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-white font-semibold">AI Forecast Summary</h3>
              <p className="text-slate-400 text-xs">View only — model training is not available to Admin</p>
            </div>
            <button className="text-slate-400 hover:text-white text-xs flex items-center gap-1 transition-colors">
              Open forecast <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-3 bg-sky-950/40 border border-sky-500/30 rounded-xl p-3 flex items-start gap-2.5 text-sky-400 text-xs">
            <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Next 30 days demand is projected to rise 6.4% across 4 categories.</span>
          </div>

          <div className="mt-4 space-y-2">
            {forecastData.map((product) => (
              <div
                key={product.id}
                className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-4"
              >
                <div>
                  <p className="text-white text-sm font-medium">{product.name}</p>
                  <p className="text-slate-400 text-xs">
                    Demand {product.demand} · Reorder {product.reorder}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400 text-sm font-semibold">{product.confidence}%</span>
                  <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-cyan-500"
                      style={{ width: `${product.confidence}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;