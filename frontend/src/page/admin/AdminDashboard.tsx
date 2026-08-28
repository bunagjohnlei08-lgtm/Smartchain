import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../lib/api';
import { useNavigate } from 'react-router-dom';
import {
  PackageCheck,
  PackageMinus,
  ShoppingCart,
  Building2,
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

interface DashboardData {
  metrics: { warehouse_utilization: number; open_purchase_orders: number; shipments_in_transit: number; low_stock_items: number; low_stock_threshold: number; stock_in: number; stock_out: number; orders: number; active_suppliers: number };
  recent_purchase_orders: Array<{ id: number; po_number: string; supplier_name: string; total_amount: number; status: string }>;
  inventory_status: Array<{ id: number; product: string; category: string; stock: number; status: string }>;
  inventory_movement: Array<{ date: string; day: string; stock_in: number; stock_out: number }>;
  ai_forecast: Array<{ date: string; day: string; actual: number; projected: number; source: string }>;
}

const emptyDashboard: DashboardData = {
  metrics: { warehouse_utilization: 0, open_purchase_orders: 0, shipments_in_transit: 0, low_stock_items: 0, low_stock_threshold: 20, stock_in: 0, stock_out: 0, orders: 0, active_suppliers: 0 },
  recent_purchase_orders: [], inventory_status: [], inventory_movement: [], ai_forecast: [],
};

// Quick Actions
const quickActions = [
  { label: 'Receive Inventory', path: '/admin/inventory' },
  { label: 'Create Purchase Order', path: '/admin/purchase-orders' },
  { label: 'Transfer Stock', path: '/admin/logistics' },
  { label: 'Generate Reports', path: '/admin/reports' },
];

// Helper Badge Components
const POStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, string> = {
    Approved: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    Pending: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    'Pending Approval': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    'Sent to Supplier': 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
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
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/admin/dashboard');
      setDashboard(response.data?.data ?? emptyDashboard);
      setError('');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const dateLabel = useMemo(() => new Intl.DateTimeFormat('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date()), []);

  const topStats = [
    { title: 'Warehouse Utilization', value: loading ? '—' : `${dashboard.metrics.warehouse_utilization}%`, subtitle: 'Capacity placeholder', subtitleColor: 'text-slate-400', icon: <Warehouse className="w-5 h-5 text-blue-400"/>, iconBg: 'bg-blue-500/10' },
    { title: 'Open Purchase Orders', value: loading ? '—' : dashboard.metrics.open_purchase_orders.toLocaleString(), subtitle: 'Excludes completed/cancelled', subtitleColor: 'text-amber-400', icon: <FileText className="w-5 h-5 text-amber-400"/>, iconBg: 'bg-amber-500/10' },
    { title: 'Shipments In Transit', value: loading ? '—' : dashboard.metrics.shipments_in_transit.toLocaleString(), subtitle: 'Orders currently in transit', subtitleColor: 'text-emerald-400', icon: <Truck className="w-5 h-5 text-emerald-400"/>, iconBg: 'bg-emerald-500/10' },
    { title: 'Low Stock Items', value: loading ? '—' : dashboard.metrics.low_stock_items.toLocaleString(), subtitle: `At or below ${dashboard.metrics.low_stock_threshold} units`, subtitleColor: 'text-rose-400', icon: <AlertTriangle className="w-5 h-5 text-rose-400"/>, iconBg: 'bg-rose-500/10' },
    { title: 'Stock In', value: loading ? '—' : dashboard.metrics.stock_in.toLocaleString(), subtitle: 'Total stocked-in units', subtitleColor: 'text-blue-400', icon: <PackageCheck className="w-5 h-5 text-blue-400"/>, iconBg: 'bg-blue-500/10' },
    { title: 'Stock Out', value: loading ? '—' : dashboard.metrics.stock_out.toLocaleString(), subtitle: 'Total stocked-out units', subtitleColor: 'text-emerald-400', icon: <PackageMinus className="w-5 h-5 text-emerald-400"/>, iconBg: 'bg-emerald-500/10' },
    { title: 'Orders', value: loading ? '—' : dashboard.metrics.orders.toLocaleString(), subtitle: 'All order records', subtitleColor: 'text-amber-400', icon: <ShoppingCart className="w-5 h-5 text-amber-400"/>, iconBg: 'bg-amber-500/10' },
    { title: 'Suppliers', value: loading ? '—' : dashboard.metrics.active_suppliers.toLocaleString(), subtitle: 'Active suppliers', subtitleColor: 'text-cyan-400', icon: <Building2 className="w-5 h-5 text-cyan-400"/>, iconBg: 'bg-cyan-500/10' },
  ];
  const movementData = dashboard.inventory_movement;
  const forecastData = dashboard.ai_forecast;
  const purchaseOrders = dashboard.recent_purchase_orders;
  const inventoryStatus = dashboard.inventory_status;

  return (
    <div className="w-full min-w-0 min-h-screen bg-[#070a12] text-slate-100 p-4 sm:p-6 space-y-6 overflow-x-hidden">
      
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Operations Overview</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          {dateLabel} — supply chain operations summary.
        </p>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}

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
              <p className="text-xs text-slate-400">Stock In vs Stock Out</p>
            </div>
            <button className="p-1 text-slate-400 hover:text-white">
              <Download className="w-4 h-4"/>
            </button>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart margin={{ left: -20, right: 10, bottom: 0, top: 10 }} data={movementData}>
                <defs>
                  <linearGradient id="stockInGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="stockOutGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} domain={[0, 'auto']} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '8px' }} />
                <Area dataKey="stock_in" name="Stock In" fill="url(#stockInGrad)" stroke="#3b82f6" strokeWidth={2.5} type="monotone" isAnimationActive={true} animationDuration={1500} animationEasing="ease-in-out" animationBegin={300}/>
                <Area dataKey="stock_out" name="Stock Out" fill="url(#stockOutGrad)" stroke="#22c55e" strokeWidth={2.5} type="monotone" isAnimationActive={true} animationDuration={1500} animationEasing="ease-in-out" animationBegin={300}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-center gap-6 mt-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <span className="text-slate-300">Stock In</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-slate-300">Stock Out</span>
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
            <button onClick={() => void loadDashboard()} disabled={loading} aria-label="Refresh dashboard" className="p-1 text-slate-400 hover:text-white disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/>
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
            <button onClick={() => navigate('/admin/purchase-orders')} className="text-xs text-blue-400 hover:text-blue-300 font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded">
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
                {loading && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Loading purchase orders…</td></tr>}
                {purchaseOrders.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 pl-1 font-mono font-medium text-slate-100">{po.po_number}</td>
                    <td className="py-3 text-slate-300">{po.supplier_name}</td>
                    <td className="py-3 font-medium">₱{po.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-3 pr-1 text-right">
                      <POStatusBadge status={po.status}/>
                    </td>
                  </tr>
                ))}
                {!loading && purchaseOrders.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-slate-500">No purchase orders found.</td></tr>}
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
            <button onClick={() => navigate('/admin/inventory')} className="text-xs text-blue-400 hover:text-blue-300 font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded">
              Manage &gt;
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 font-semibold border-b border-slate-800/80 uppercase tracking-wider">
                  <th className="pb-3 pl-1">PRODUCT</th>
                  <th className="pb-3">CATEGORY</th>
                  <th className="pb-3">STOCK</th>
                  <th className="pb-3 pr-1 text-right">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-slate-200">
                {loading && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Loading inventory status…</td></tr>}
                {inventoryStatus.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 pl-1 font-medium text-slate-100">{item.product}</td>
                    <td className="py-3 text-slate-300">{item.category}</td>
                    <td className="py-3 font-medium">{item.stock}</td>
                    <td className="py-3 pr-1 text-right">
                      <InventoryStatusBadge status={item.status}/>
                    </td>
                  </tr>
                ))}
                {!loading && inventoryStatus.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-slate-500">No inventory records found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. QUICK ACTIONS */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-300">Quick Actions</h3>
        <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              className="bg-[#0b101d] border border-slate-800/80 hover:border-slate-700 rounded-xl p-5 flex flex-col items-center justify-center gap-3 group transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 group-hover:scale-105 transition-all">
                <Plus className="w-5 h-5"/>
              </div>
              <span className="text-xs font-medium text-slate-300 group-hover:text-white">
                {action.label}
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
