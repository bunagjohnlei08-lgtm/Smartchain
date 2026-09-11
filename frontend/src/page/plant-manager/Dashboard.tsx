// src/page/plant-manager/Dashboard.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';
import { useTheme } from '../../context/ThemeContext';
import {
  Package,
  Layers,
  Wallet,
  AlertTriangle,
  ShieldAlert,
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
  ExternalLink,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  BarStack,
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

interface DashboardData {
  metrics: { total_products: number; total_categories: number; stock_value: number; low_stock_items: number; out_of_stock: number; todays_stock_in: number; todays_stock_out: number };
  inventory_trend: Array<{ month: string; stock: number; value: number }>;
  stock_movement: Array<{ day: string; in: number; out: number }>;
  monthly_inventory_activity: Array<{ month: string; receiving: number; release: number; transfers: number }>;
  low_stock_summary: LowStockItem[];
  recent_transactions: Transaction[];
  supplier_performance: SupplierPerformance[];
  ai_forecast_summary: { headline: string; products: ForecastProduct[]; source: string };
}

const emptyDashboard: DashboardData = {
  metrics: { total_products: 0, total_categories: 0, stock_value: 0, low_stock_items: 0, out_of_stock: 0, todays_stock_in: 0, todays_stock_out: 0 },
  inventory_trend: [], stock_movement: [], monthly_inventory_activity: [], low_stock_summary: [], recent_transactions: [], supplier_performance: [],
  ai_forecast_summary: { headline: '', products: [], source: 'placeholder' },
};

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
  const { theme } = useTheme();
  const [date] = useState(new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
  const [location] = useState('Central Distribution Center');
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/plant-manager/dashboard');
      setDashboard(response.data?.data ?? emptyDashboard);
      setError('');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value);
  const kpiData: KPI[] = [
    { label: 'Total Products', value: loading ? '—' : dashboard.metrics.total_products.toLocaleString(), change: 'Live', icon: <Package className="w-5 h-5" />, trend: 'neutral' },
    { label: 'Total Categories', value: loading ? '—' : dashboard.metrics.total_categories.toLocaleString(), change: 'Live', icon: <Layers className="w-5 h-5" />, trend: 'neutral' },
    { label: 'Stock Value', value: loading ? '—' : formatCurrency(dashboard.metrics.stock_value), change: 'Live', icon: <Wallet className="w-5 h-5" />, trend: 'neutral' },
    { label: 'Low Stock Items', value: loading ? '—' : dashboard.metrics.low_stock_items.toLocaleString(), change: '≤ 20 units', icon: <AlertTriangle className="w-5 h-5" />, trend: 'down' },
    { label: 'Out of Stock', value: loading ? '—' : dashboard.metrics.out_of_stock.toLocaleString(), change: '0 units', icon: <ShieldAlert className="w-5 h-5" />, trend: 'down' },
    { label: "Today's Stock In", value: loading ? '—' : dashboard.metrics.todays_stock_in.toLocaleString(), change: 'Today', icon: <ArrowDownCircle className="w-5 h-5" />, trend: 'up' },
    { label: "Today's Stock Out", value: loading ? '—' : dashboard.metrics.todays_stock_out.toLocaleString(), change: 'Today', icon: <ArrowUpCircle className="w-5 h-5" />, trend: 'down' },
  ];
  const inventoryTrendData = dashboard.inventory_trend;
  const isDark = theme === 'dark';
  const chartGridColor = isDark ? '#334155' : '#E2E8F0';
  const chartAxisColor = isDark ? '#CBD5E1' : '#64748B';
  const chartCardColor = isDark ? '#0d1322' : '#FFFFFF';
  const stockColor = isDark ? '#60A5FA' : '#3B82F6';
  const valuationColor = isDark ? '#34D399' : '#22C55E';
  const tooltipStyle = {
    backgroundColor: isDark ? '#111827' : '#FFFFFF',
    borderColor: isDark ? '#475569' : '#CBD5E1',
    color: isDark ? '#F8FAFC' : '#0F172A',
    borderRadius: '0.75rem',
    boxShadow: isDark ? '0 12px 30px rgb(0 0 0 / 0.35)' : '0 4px 12px rgb(15 23 42 / 0.08)',
  };
  const stockMovementData = dashboard.stock_movement;
  const monthlyActivityData = dashboard.monthly_inventory_activity;
  const lowStockItems = dashboard.low_stock_summary;
  const transactions = dashboard.recent_transactions;
  const supplierData = dashboard.supplier_performance;
  const forecastData = dashboard.ai_forecast_summary.products;

  const trendColor = (trend: 'up' | 'down' | 'neutral') =>
    trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-rose-400' : 'text-slate-400';
  const TrendIcon = (trend: 'up' | 'down' | 'neutral') =>
    trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus;

  return (
    <div className="w-full min-h-screen bg-[#090d16] p-4 sm:p-6 lg:p-8 space-y-6 overflow-x-hidden">
      {/* ============================================================
          HEADER
      ============================================================ */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6 px-1">
        <div className="space-y-1">
          <nav className="flex items-center gap-2 text-sm text-slate-400">
            <span className="hover:text-slate-300 cursor-pointer">Plant Manager</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-slate-300 font-medium">Dashboard</span>
          </nav>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
               <input
                 type="text"
                 placeholder="Search products or barcode..."
                 className="pl-9 pr-4 py-2 rounded-xl bg-[#0d1322] border border-slate-800 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 w-full sm:w-72"
               />
            </div>
            <div>
               <h1 className="text-xl font-bold text-white">Warehouse Operations Dashboard</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">{date} · {location}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-800 text-sm font-medium text-slate-300 bg-[#0d1322] hover:bg-slate-800 transition-colors">
            <Download className="w-4 h-4" />
            Export snapshot
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 transition-colors">
            Receive products
          </button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
      {loading && <div role="status" className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">Loading real-time dashboard data…</div>}

      {/* ============================================================
          KPI METRICS GRID
      ============================================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiData.map((kpi, idx) => (
          <div
            key={idx}
            className="min-w-0 bg-[#0d1322] border border-slate-800/80 rounded-2xl p-5 hover:border-blue-300 dark:hover:border-slate-600 transition-all group"
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
          CHARTS SECTION 1 — Inventory Trend
      ============================================================ */}
      <div>
        {/* Inventory Trend */}
        <div className="bg-[#0d1322] border border-slate-800/80 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold">Inventory Trend</h3>
              <p className="text-slate-400 text-sm">Stock units and valuation trend across 7 months</p>
            </div>
            <button className="text-slate-400 hover:text-slate-300 transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
          <div className="flex h-[300px] w-full flex-col">
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={inventoryTrendData} margin={{ left: -20, right: 10, bottom: 0, top: 10 }}>
                  <defs>
                    <linearGradient id="gradientStock" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={stockColor} stopOpacity={isDark ? 0.32 : 0.3} />
                      <stop offset="95%" stopColor={stockColor} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradientValuation" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={valuationColor} stopOpacity={isDark ? 0.28 : 0.3} />
                      <stop offset="95%" stopColor={valuationColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" strokeOpacity={isDark ? 0.7 : 1} vertical={false} />
                  <XAxis dataKey="month" stroke={chartAxisColor} tick={{ fill: chartAxisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" stroke={chartAxisColor} tick={{ fill: chartAxisColor, fontSize: 12 }} axisLine={false} tickLine={false} domain={[0, 'auto']} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" stroke={chartAxisColor} tick={{ fill: chartAxisColor, fontSize: 12 }} axisLine={false} tickLine={false} domain={[0, 'auto']} tickFormatter={(value: number) => `$${value}M`} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: isDark ? '#F8FAFC' : '#0F172A', fontWeight: 600 }}
                    itemStyle={{ color: isDark ? '#E2E8F0' : '#334155' }}
                    cursor={{ stroke: chartAxisColor, strokeOpacity: 0.35 }}
                    formatter={(value, name, item) => [typeof value === 'number' ? item.dataKey === 'value' ? `$${value.toFixed(2)}M` : value.toLocaleString('en-US') : value, name]}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="stock"
                    stroke={stockColor}
                    strokeWidth={3}
                    fill="url(#gradientStock)"
                    name="Stock Units"
                    dot={{ r: 3, fill: stockColor, stroke: chartCardColor, strokeWidth: 2 }}
                    activeDot={{ r: 5, stroke: chartCardColor, strokeWidth: 2 }}
                    isAnimationActive={true}
                    animationDuration={1500}
                    animationEasing="ease-in-out"
                    animationBegin={100}
                  />
                  <Area type="monotone" yAxisId="right" dataKey="value" stroke={valuationColor} strokeWidth={3} fill="url(#gradientValuation)" name="Valuation ($M)" dot={{ r: 3, fill: valuationColor, stroke: chartCardColor, strokeWidth: 2 }} activeDot={{ r: 5, stroke: chartCardColor, strokeWidth: 2 }} isAnimationActive={true} animationDuration={1500} animationEasing="ease-in-out" animationBegin={100} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex shrink-0 flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stockColor }} />
                <span className="text-slate-600 dark:text-slate-300">Stock Units</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: valuationColor }} />
                <span className="text-slate-600 dark:text-slate-300">Valuation ($M)</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ============================================================
          CHARTS SECTION 2 — Stock Movement (6/12) + Monthly Activity (6/12)
      ============================================================ */}
      <div className="grid min-w-0 grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Stock Movement */}
        <div className="min-w-0 bg-[#0d1322] border border-slate-800/80 rounded-2xl p-5">
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
            <BarChart data={stockMovementData} margin={{ left: -20, right: 10, bottom: 0, top: 10 }} barCategoryGap="20%" barGap={4} maxBarSize={32}>
              <CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" strokeOpacity={isDark ? 0.7 : 1} vertical={false} />
              <XAxis dataKey="day" stroke={chartAxisColor} tick={{ fill: chartAxisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis stroke={chartAxisColor} tick={{ fill: chartAxisColor, fontSize: 12 }} axisLine={false} tickLine={false} domain={[0, 'auto']} allowDecimals={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: isDark ? '#F8FAFC' : '#0F172A', fontWeight: 600 }}
                itemStyle={{ color: isDark ? '#E2E8F0' : '#334155' }}
                cursor={{ fill: chartGridColor, fillOpacity: 0.2 }}
              />
              <Legend iconType="circle" iconSize={10} wrapperStyle={{ paddingTop: 12, fontSize: 12 }} formatter={(value) => <span style={{ color: chartAxisColor }}>{value}</span>} />
              <Bar dataKey="in" fill="#3B82F6" name="Stock In" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={1200} animationEasing="ease-out" animationBegin={300} />
              <Bar dataKey="out" fill="#EF4444" name="Stock Out" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={1200} animationEasing="ease-out" animationBegin={300} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Inventory Activity */}
        <div className="min-w-0 bg-[#0d1322] border border-slate-800/80 rounded-2xl p-5">
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
            <BarChart data={monthlyActivityData} margin={{ left: -20, right: 10, bottom: 0, top: 10 }} barCategoryGap="20%" maxBarSize={40}>
              <CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" strokeOpacity={isDark ? 0.7 : 1} vertical={false} />
              <XAxis dataKey="month" stroke={chartAxisColor} tick={{ fill: chartAxisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis stroke={chartAxisColor} tick={{ fill: chartAxisColor, fontSize: 12 }} axisLine={false} tickLine={false} domain={[0, 'auto']} allowDecimals={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: isDark ? '#F8FAFC' : '#0F172A', fontWeight: 600 }}
                itemStyle={{ color: isDark ? '#E2E8F0' : '#334155' }}
                cursor={{ fill: chartGridColor, fillOpacity: 0.2 }}
              />
              <Legend iconType="circle" iconSize={10} wrapperStyle={{ paddingTop: 12, fontSize: 12 }} formatter={(value) => <span style={{ color: chartAxisColor }}>{value}</span>} />
              <BarStack stackId="a" radius={[4, 4, 0, 0]}>
                <Bar dataKey="receiving" stackId="a" fill="#3B82F6" name="Receiving" radius={[0, 0, 0, 0]} isAnimationActive={true} animationDuration={1300} animationEasing="ease-in-out" animationBegin={400} />
                <Bar dataKey="release" stackId="a" fill="#22C55E" name="Release" radius={[0, 0, 0, 0]} isAnimationActive={true} animationDuration={1300} animationEasing="ease-in-out" animationBegin={400} />
                <Bar dataKey="transfers" stackId="a" fill="#F59E0B" name="Transfers" radius={[0, 0, 0, 0]} isAnimationActive={true} animationDuration={1300} animationEasing="ease-in-out" animationBegin={400} />
              </BarStack>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ============================================================
          BOTTOM DATA PANELS — Low Stock Summary (4/12) + Recent Transactions (8/12)
      ============================================================ */}
      <div className="grid min-w-0 grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Low Stock Summary */}
        <div className="min-w-0 xl:col-span-4 bg-[#0d1322] border border-slate-800/80 rounded-2xl p-5">
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
        <div className="min-w-0 xl:col-span-8 bg-[#0d1322] border border-slate-800/80 rounded-2xl p-5">
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
      <div className="grid min-w-0 grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Supplier Performance */}
        <div className="min-w-0 bg-[#0d1322] border border-slate-800/80 rounded-2xl p-6">
          <div className="flex flex-col items-start justify-between gap-3 mb-4 sm:flex-row sm:items-center">
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
        <div className="min-w-0 bg-[#0d1322] border border-slate-800/80 rounded-2xl p-6">
          <div className="flex flex-col items-start justify-between gap-3 mb-1 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-white font-semibold">AI Forecast Summary</h3>
              <p className="text-slate-400 text-xs">View only — model training is not available to Plant Manager</p>
            </div>
            <button className="text-slate-400 hover:text-white text-xs flex items-center gap-1 transition-colors">
              Open forecast <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-3 bg-sky-950/40 border border-sky-500/30 rounded-xl p-3 flex items-start gap-2.5 text-sky-400 text-xs">
            <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{dashboard.ai_forecast_summary.headline || 'Forecast summary will appear when dashboard data is available.'}</span>
          </div>

          <div className="mt-4 space-y-2">
            {forecastData.map((product) => (
              <div
                key={product.id}
                className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0">
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
