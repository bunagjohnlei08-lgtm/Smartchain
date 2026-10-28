import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AxiosError } from 'axios';
import { useAdminDetailOverlay } from '../../components/layout/AdminDetailOverlayContext';
import {
  Brain,
  Search,
  Download,
  Printer,
  RefreshCw,
  AlertCircle,
  Eye,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Filter,
  Sparkles,
  Target,
  Maximize2,
  Minimize2,
  ShoppingCart,
  X,
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
 Legend,
} from 'recharts';

import PageContainer from '@/components/layout/PageContainer';
import { useTheme } from '../../context/ThemeContext';
import { apiClient } from '../../lib/api';
import { ADMIN_FORECAST_UNITS, adminPlanningQuantity, buildAdminForecastSeries, saveAdminForecastSnapshot, type AdminForecastProduct } from '../../lib/adminForecastSnapshot';

// ============================================
// TYPES
// ============================================

type ForecastProduct = AdminForecastProduct;

interface ProductOption {
 id: number;
 name: string;
 unit: string;
}

interface ProductPage {
 data: ProductOption[];
}

interface ForecastResponse {
 product_id: number;
 product_name: string;
 forecast: Array<{ week_start: string; expected_quantity: number }>;
 model_version: string;
 training_weeks: number;
 model_quality: { mae: number };
 forecast_as_of: string;
 forecast_timezone: string;
 horizon_policy: 'four_weeks_after_latest_training_week';
 training_data_type: string;
}

const FORECAST_REQUEST_INTERVAL_MS = 2100;

const wait = (milliseconds: number) => new Promise<void>((resolve) => {
 setTimeout(resolve, milliseconds);
});

const SUPPORTED_UNITS = ADMIN_FORECAST_UNITS;
const UNIT_COLORS = ['#22C55E', '#3B82F6', '#F59E0B', '#A78BFA'];

const normalizeUnit = (unit: string) => unit.trim().toUpperCase() || 'UNIT';

const isDiscretePackage = (unit: string) => SUPPORTED_UNITS.includes(normalizeUnit(unit) as typeof SUPPORTED_UNITS[number]);
const planningQuantity = adminPlanningQuantity;
const formatQuantity = (value: number, unit: string) => `${planningQuantity(value, unit).toLocaleString(undefined, {
 minimumFractionDigits: 0,
 maximumFractionDigits: isDiscretePackage(unit) ? 0 : 2,
})} ${normalizeUnit(unit)}`;
const formatRawQuantity = (value: number, unit: string) => `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${normalizeUnit(unit)}`;

// ============================================
// HELPER COMPONENTS
// ============================================

const KPICard: React.FC<{
 label: string;
 value: React.ReactNode;
 subtitle?: string;
 icon: React.ReactNode;
 trend?: { value: string; positive: boolean };
 className?: string;
}> = ({ label, value, subtitle, icon, trend, className = '' }) => (
  <div className={`bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-6 shadow-xl hover:border-slate-300 hover:border-gray-700 transition-all duration-200 h-full flex flex-col ${className}`}>
  <div className="flex items-start justify-between flex-1">
   <div>
    <p className="admin-kpi-title text-gray-400 text-xs font-medium uppercase tracking-wider">{label}</p>
    <div className="admin-kpi-value mt-1 text-2xl font-bold leading-tight text-white">{value}</div>
    {subtitle && <p className="admin-kpi-helper text-xs text-gray-400 mt-1">{subtitle}</p>}
   </div>
   <div className="p-2.5 bg-gray-800/50 bg-gray-800/50 rounded-lg shrink-0">
    {icon}
   </div>
  </div>
  {trend && (
   <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-gray-800/50">
    <span className={`text-xs font-medium ${trend.positive ? 'text-emerald-400' : 'text-red-400'}`}>
     {trend.positive ? '↑' : '↓'} {trend.value}
    </span>
    <span className="text-gray-400 text-xs">vs last month</span>
   </div>
  )}
 </div>
);

// ============================================
// MAIN COMPONENT
// ============================================

const AIDemandForecast: React.FC = () => {
 const { theme } = useTheme();
 const [timeFilter, setTimeFilter] = useState('4 Weeks');
 const [search, setSearch] = useState('');
 const [unitFilter, setUnitFilter] = useState('ALL');
 const [forecastProducts, setForecastProducts] = useState<ForecastProduct[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [loadNotice, setLoadNotice] = useState<string | null>(null);
 const [loadProgress, setLoadProgress] = useState({ completed: 0, total: 0 });
 const requestController = useRef<AbortController | null>(null);
 const [selectedProduct, setSelectedProduct] = useState<ForecastProduct | null>(null);
 const [showDrawer, setShowDrawer] = useState(false);
 useAdminDetailOverlay(showDrawer && selectedProduct !== null);
 const [expandedChart, setExpandedChart] = useState(false);
 const [currentPage, setCurrentPage] = useState(1);
 const itemsPerPage = 8;
 const isDark = theme === 'dark';
 const chartGridColor = isDark ? '#233047' : '#E2E8F0';
 const chartAxisColor = isDark ? '#64748B' : '#64748B';
 const chartTooltipStyle = {
  backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
  borderColor: isDark ? '#334155' : '#CBD5E1',
  borderRadius: '12px',
  color: isDark ? '#F1F5F9' : '#0F172A',
  boxShadow: isDark ? 'none' : '0 4px 12px rgb(15 23 42 / 0.08)',
 };

 const loadForecasts = useCallback(async () => {
  requestController.current?.abort();
  const controller = new AbortController();
  requestController.current = controller;
  setLoading(true);
  setError(null);
  setLoadNotice(null);
  setForecastProducts([]);
  setLoadProgress({ completed: 0, total: 0 });
  try {
   const products = (await apiClient.get<ProductPage>('/products', {
    params: { per_page: 100 },
    signal: controller.signal,
   })).data.data;
   const productsById = new Map(products.map((product) => [product.id, product]));
   setLoadProgress({ completed: 0, total: products.length });
   const forecasts: ForecastProduct[] = [];
   let unsupportedCount = 0;
   let failedCount = 0;

   for (const [index, product] of products.entries()) {
    if (controller.signal.aborted) return;
    let data: ForecastResponse | null = null;
    while (!controller.signal.aborted && data === null) {
     try {
      data = (await apiClient.post<ForecastResponse>(
       '/ai/forecast',
       { product_id: product.id },
       { signal: controller.signal },
      )).data;
     } catch (caught) {
      if (controller.signal.aborted) return;
      const forecastError = caught as AxiosError<{ message?: string; code?: string }>;
      if (forecastError.response?.status === 503) {
       setError(forecastError.response.data?.message || 'AI forecasting service is unavailable. Please try again later.');
       return;
      }
      if (forecastError.response?.status === 404) {
       unsupportedCount += 1;
       break;
      }
      if (forecastError.response?.status !== 429) {
       failedCount += 1;
       break;
      }
      const retryAfter = Number(forecastError.response.headers['retry-after']);
      await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60_000);
     }
    }
    if (data !== null) {
     const predictedDemand = data.forecast.reduce((sum, week) => sum + week.expected_quantity, 0);
     forecasts.push({
      id: data.product_id,
      name: data.product_name,
      unit: normalizeUnit(productsById.get(data.product_id)?.unit ?? 'UNIT'),
      forecast: data.forecast,
      predictedDemand,
      averageWeeklyDemand: data.forecast.length ? predictedDemand / data.forecast.length : 0,
      validationMae: data.model_quality.mae,
      modelVersion: data.model_version,
      trainingWeeks: data.training_weeks,
       forecastAsOf: data.forecast_as_of,
       forecastTimezone: data.forecast_timezone,
       horizonPolicy: data.horizon_policy,
       trainingDataType: data.training_data_type,
     });
    }
    // Products absent from the trained artifact return 404 and are skipped.
    setLoadProgress({ completed: index + 1, total: products.length });
    if (index < products.length - 1) await wait(FORECAST_REQUEST_INTERVAL_MS);
   }

   if (!controller.signal.aborted && !forecasts.length) {
    setError(failedCount > 0
     ? `${failedCount} forecast request${failedCount === 1 ? '' : 's'} failed; no validated forecasts could be displayed.`
     : `No catalog products are supported by the trained model (${unsupportedCount} checked).`);
   } else if (!controller.signal.aborted) {
    setForecastProducts(forecasts);
    if (unsupportedCount > 0 || failedCount > 0) {
     setLoadNotice(`${forecasts.length} supported · ${unsupportedCount} unsupported · ${failedCount} failed`);
    }
    saveAdminForecastSnapshot(forecasts);
   }
  } catch (caught) {
   if (controller.signal.aborted) return;
   const requestError = caught as AxiosError<{ message?: string }>;
   setForecastProducts([]);
   setError(requestError.response?.data?.message || 'Unable to load forecast data. Please try again.');
  } finally {
   if (!controller.signal.aborted) setLoading(false);
  }
 }, []);

 useEffect(() => {
  void loadForecasts();
  return () => requestController.current?.abort();
 }, [loadForecasts]);

 const timeFilters = ['4 Weeks'];

 const filteredProducts = forecastProducts.filter(p => {
  const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || String(p.id).includes(search.trim());
  return matchesSearch && (unitFilter === 'ALL' || p.unit === unitFilter);
 });

 useEffect(() => setCurrentPage(1), [search, unitFilter]);

 const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
 const paginatedProducts = filteredProducts.slice(
  (currentPage - 1) * itemsPerPage,
  currentPage * itemsPerPage
 );

 // KPI Calculations
 const demandByUnit = forecastProducts.reduce<Record<string, number>>((totals, product) => {
  totals[product.unit] = (totals[product.unit] ?? 0) + product.predictedDemand;
  return totals;
 }, {});
 const unitNames = [...SUPPORTED_UNITS];
 const globalMae = forecastProducts[0]?.validationMae;
 const trainingWeeks = forecastProducts.length ? Math.max(...forecastProducts.map((product) => product.trainingWeeks)) : 0;
 const forecastContext = forecastProducts[0];

 const forecastChartData: Array<Record<string, string | number>> = buildAdminForecastSeries(forecastProducts).map(({ weekStart, ...values }) => ({
  week: new Date(`${weekStart}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  ...values,
 }));

 const topProducts = unitNames.flatMap((unit) => {
  const largest = forecastProducts.filter((product) => product.unit === unit).sort((a, b) => b.predictedDemand - a.predictedDemand)[0];
  return largest ? [largest] : [];
 });

 const handleViewProduct = (product: ForecastProduct) => {
  setSelectedProduct(product);
  setShowDrawer(true);
 };

 const exportForecasts = (products: ForecastProduct[] = filteredProducts) => {
  if (!products.length) return;
  const csvCell = (value: string | number) => {
   const text = String(value);
   const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
   return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows = [
   ['Product', 'Product ID', 'Unit', 'Raw 4-Week Prediction', 'Whole-Package 4-Week Planning Estimate', 'Whole-Package Weekly Planning Average', 'Global Validation MAE', 'Model', 'Training Weeks'],
   ...products.map((product) => [
    product.name, product.id, product.unit, product.predictedDemand, planningQuantity(product.predictedDemand, product.unit), planningQuantity(product.averageWeeklyDemand, product.unit),
    product.validationMae, product.modelVersion, product.trainingWeeks,
   ]),
  ];
  const blob = new Blob([rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ai-demand-forecast.csv';
  link.click();
  URL.revokeObjectURL(url);
 };

 return (
  <PageContainer>
   <div className="min-h-screen min-w-0 max-w-full space-y-6 overflow-x-hidden bg-transparent font-sans">
    {/* Header */}
    <div>
     <h1 className="text-2xl font-bold text-white">AI Demand Forecast</h1>
     <p className="text-gray-400 text-sm mt-1">
       Four weekly model estimates anchored after the latest training week; decision support only.
     </p>
    </div>

    {(loading || error) && <div role="status" aria-live="polite" className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-4 text-sm text-slate-300">
     <p className="font-semibold text-white">{loading ? 'Loading forecast data…' : 'Forecast data unavailable'}</p>
     <p className="mt-1 text-slate-400">{loading
      ? `Requesting forecasts sequentially${loadProgress.total ? ` (${loadProgress.completed}/${loadProgress.total})` : ''}.`
      : error}</p>
    </div>}
    {!loading && !error && loadNotice && <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">Partial forecast coverage: {loadNotice}.</div>}

    {/* ============================================ */}
    {/* SECTION 1 (TOP): Predict Dashboard Stats / Metrics Cards */}
    {/* ============================================ */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
     <KPICard
      label="Predicted 4-Week Demand"
      value={error && !forecastProducts.length ? '—' : (
       <span className="flex flex-col gap-0.5 text-lg">
        {unitNames.map((unit) => <span key={unit}>{formatRawQuantity(demandByUnit[unit] ?? 0, unit)}</span>)}
       </span>
      )}
      subtitle={loading ? 'Loading; totals appear only when the complete snapshot is ready' : 'Raw model predictions summed by measurement unit'}
      icon={<Brain className="w-5 h-5 text-blue-400" />}
     />
     <KPICard
      label="Global Validation MAE"
      value={(error && !forecastProducts.length) || globalMae === undefined ? '—' : globalMae.toLocaleString(undefined, { maximumFractionDigits: 3 })}
      subtitle="Mean absolute error across the model holdout; lower is better, not an accuracy %"
      icon={<Target className="w-5 h-5 text-emerald-400" />}
     />
     <KPICard
      label="Forecasted Products"
      value={error && !forecastProducts.length ? '—' : forecastProducts.length}
      subtitle={`Successful forecasts${loadProgress.total ? ` of ${loadProgress.total} catalog Products` : ''}`}
      icon={<AlertCircle className="w-5 h-5 text-amber-400" />}
     />
     <KPICard
      label="Training History"
      value={error && !forecastProducts.length ? '—' : trainingWeeks}
      subtitle="Complete calendar weeks represented in training"
      icon={<ShoppingCart className="w-5 h-5 text-blue-400" />}
     />
    </div>

    {/* Time Filters & Actions */}
    <div className="flex flex-wrap items-center justify-between gap-4">
     <div className="flex items-center gap-2 bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-xl p-1">
      {timeFilters.map((filter) => (
       <button
        key={filter}
        onClick={() => setTimeFilter(filter)}
        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
         timeFilter === filter
          ? 'bg-slate-200 text-slate-900 dark:bg-blue-500 dark:text-white'
          : 'text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800/50'
        }`}
       >
        {filter}
       </button>
      ))}
     </div>
     <div className="flex items-center gap-2">
      <button onClick={() => void loadForecasts()} disabled={loading} aria-label="Refresh forecasts" className="p-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50">
       <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      </button>
      <button onClick={() => exportForecasts()} disabled={!forecastProducts.length} aria-label="Export forecasts" className="p-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800/50 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50">
       <Download className="w-4 h-4" />
      </button>
      <button onClick={() => window.print()} aria-label="Print forecast" className="p-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800/50 transition-all duration-200">
       <Printer className="w-4 h-4" />
      </button>
      <button
       onClick={() => setExpandedChart(!expandedChart)}
       className="p-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800/50 transition-all duration-200"
      >
       {expandedChart ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>
     </div>
    </div>

    {/* Main Chart */}
     <div className={`min-w-0 max-w-full overflow-hidden bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-4 sm:p-6 transition-all duration-200 ${expandedChart ? 'col-span-full' : ''}`}>
     <div className="flex items-center justify-between mb-6">
      <div>
        <h3 className="text-white text-xl font-bold">Four Weeks After Training Data</h3>
        <p className="text-gray-400 text-sm mt-1">These periods follow the artifact's latest historical week. They are not guaranteed to be future calendar weeks today.</p>
      </div>
      <button onClick={() => void loadForecasts()} disabled={loading} className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 shadow-md shadow-[#092635]/20 disabled:cursor-not-allowed disabled:opacity-50">
       <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Forecast
      </button>
     </div>
     <div className="min-w-0 overflow-x-auto">
     <div className="min-w-[640px]">
     <ResponsiveContainer width="100%" height={expandedChart ? 500 : 320}>
      <AreaChart data={forecastChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
       <defs>{unitNames.map((unit, index) => <linearGradient key={unit} id={`admin-forecast-area-${unit}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor={UNIT_COLORS[index % UNIT_COLORS.length]} stopOpacity={0.32}/>
        <stop offset="95%" stopColor={UNIT_COLORS[index % UNIT_COLORS.length]} stopOpacity={0.06}/>
       </linearGradient>)}</defs>
       <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} opacity={isDark ? 0.5 : 1} />
       <XAxis dataKey="week" stroke={chartAxisColor} tick={{ fill: chartAxisColor, fontSize: 12 }} />
       <YAxis stroke={chartAxisColor} tick={{ fill: chartAxisColor, fontSize: 12 }} />
       <Tooltip
        contentStyle={chartTooltipStyle}
        itemStyle={{ color: isDark ? '#F1F5F9' : '#334155', fontSize: '12px' }}
        labelStyle={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: '12px' }}
         formatter={(value, name) => [`${Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${String(name).replace('Expected ', '')}`, String(name)]}
       />
       <Legend verticalAlign="bottom" height={36} wrapperStyle={{ paddingTop: '16px', color: isDark ? '#94A3B8' : '#475569', fontSize: '12px' }} />
        {unitNames.map((unit) => <Area
         key={`${unit}-fill`}
         type="monotone"
         dataKey={unit}
         baseValue={0}
         stroke="none"
         fill={`url(#admin-forecast-area-${unit})`}
         legendType="none"
         tooltipType="none"
         isAnimationActive={false}
        />)}
        {unitNames.map((unit, index) => <Line
         key={unit}
         type="monotone"
         dataKey={unit}
         stroke={UNIT_COLORS[index % UNIT_COLORS.length]}
         strokeWidth={3}
         fill="none"
         name={`Expected ${unit}`}
         dot={{ fill: UNIT_COLORS[index % UNIT_COLORS.length], r: 4, stroke: '#0d1322', strokeWidth: 2 }}
         activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
         isAnimationActive={true}
         animationDuration={1500}
         animationEasing="ease-in-out"
         animationBegin={200}
        />)}
      </AreaChart>
     </ResponsiveContainer>
     </div>
     </div>
    </div>

     {forecastContext && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-slate-300">
      <p className="font-semibold text-white">Forecast reference: training data through {forecastContext.forecastAsOf} ({forecastContext.forecastTimezone})</p>
      <p className="mt-1 text-slate-400">The four periods begin after that week. Source: {forecastContext.trainingDataType === 'synthetic_mock_demand_v1' ? 'simulated thesis/demo demand' : forecastContext.trainingDataType}. Model: {forecastContext.modelVersion}.</p>
     </div>}

    {/* ============================================ */}
    {/* SECTION 2 (MIDDLE): Full-Width Forecasting Data Table */}
    {/* ============================================ */}
    <div className="min-w-0 w-full max-w-full">
     <div className="min-w-0 w-full max-w-full overflow-hidden bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-4 sm:p-6">
      {/* Top Toolbar Card */}
       <div className="min-w-0 bg-[#0d1322] border border-slate-800/80 p-4 rounded-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="relative min-w-0 flex-1 md:max-w-sm">
         <label htmlFor="forecast-search" className="sr-only">Search forecast products</label>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          id="forecast-search"
         type="text"
         value={search}
         onChange={(e) => setSearch(e.target.value)}
         placeholder="Search products..."
         className="bg-gray-800/50 border-gray-700 pl-10 pr-4 py-2 text-xs rounded-xl w-full text-white focus:outline-none focus:border-blue-500"
        />
       </div>
        <div className="flex items-center gap-2.5 flex-wrap">
         <label className="relative flex items-center">
          <span className="sr-only">Filter forecasts by unit</span>
          <Filter className="pointer-events-none absolute left-3 h-4 w-4 text-gray-400" />
          <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)} className="cursor-pointer rounded-xl border border-gray-700 bg-gray-800/50 py-2.5 pl-9 pr-8 text-xs text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50">
           <option value="ALL">All units</option>
           {unitNames.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
         </label>
         <button onClick={() => exportForecasts()} disabled={!filteredProducts.length} className="px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 bg-[#3B82F6] text-white hover:opacity-90 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50">
         <Download className="w-4 h-4" /> Export
        </button>
       </div>
      </div>

      <div className="admin-table-scroll w-full max-w-full min-w-0 rounded-lg" tabIndex={0} aria-label="Forecast table; scroll horizontally to view all columns">
        <table className="admin-forecast-table admin-responsive-table admin-cols-9 w-full table-fixed text-left border-collapse">
        <thead className="bg-gray-800/50 bg-gray-800/30 text-slate-400 uppercase tracking-wider text-xs font-semibold border-b border-slate-800">
         <tr>
           <th className="px-3 py-3 whitespace-nowrap text-left">Product</th>
           <th className="px-3 py-3 whitespace-nowrap text-left">Product ID</th>
           <th className="px-3 py-3 whitespace-nowrap text-left">Unit</th>
           <th className="px-3 py-3 whitespace-nowrap text-right">4-Week Forecast</th>
           <th className="px-3 py-3 whitespace-nowrap text-right">Weekly Average</th>
           <th className="px-3 py-3 whitespace-nowrap text-right" title="Global mean absolute error across the model's validation holdout; lower is better.">Global MAE</th>
           <th className="px-3 py-3 whitespace-nowrap text-left">Model</th>
           <th className="px-3 py-3 whitespace-nowrap text-right">Training Weeks</th>
           <th className="px-3 py-3 whitespace-nowrap text-right pr-4 min-w-[70px]">Actions</th>
         </tr>
        </thead>
        <tbody className="border-collapse">
         {paginatedProducts.map((product) => (
          <tr key={product.id} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
            <td className="max-w-0 px-3 py-3 text-white font-medium"><span className="block truncate" title={product.name}>{product.name}</span></td>
            <td className="px-3 py-3 whitespace-nowrap text-gray-400">{product.id}</td>
            <td className="px-3 py-3 whitespace-nowrap text-gray-300">{product.unit}</td>
            <td className="px-3 py-3 whitespace-nowrap text-right text-blue-400 font-semibold">{formatRawQuantity(product.predictedDemand, product.unit)}</td>
            <td className="px-3 py-3 whitespace-nowrap text-right text-gray-300">{formatQuantity(product.averageWeeklyDemand, product.unit)}</td>
            <td className="px-3 py-3 whitespace-nowrap text-right text-amber-400 font-medium">{product.validationMae.toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
            <td className="max-w-0 px-3 py-3 text-gray-300"><span className="block truncate" title={product.modelVersion}>{product.modelVersion}</span></td>
            <td className="px-3 py-3 whitespace-nowrap text-right text-gray-300">{product.trainingWeeks}</td>
            <td className="px-3 py-3 whitespace-nowrap text-right pr-4 min-w-[70px]">
            <div className="flex items-center justify-end gap-1">
             <button
              onClick={() => handleViewProduct(product)}
              aria-label={`View forecast for ${product.name}`}
              className="p-1.5 rounded-lg hover:bg-[#1E293B] text-gray-400 hover:text-white transition-all duration-200"
             >
              <Eye className="w-4 h-4" />
             </button>
            </div>
           </td>
          </tr>
         ))}
         {!loading && paginatedProducts.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400">No forecast data available.</td></tr>}
        </tbody>
       </table>
      </div>
      <div className="flex flex-col gap-3 text-xs text-gray-400 pt-4 border-t border-gray-800 sm:flex-row sm:items-center sm:justify-between">
       <div>
         Showing <span className="text-white font-medium">{filteredProducts.length ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> to{' '}
        <span className="text-white font-medium">{Math.min(currentPage * itemsPerPage, filteredProducts.length)}</span> of{' '}
        <span className="text-white font-medium">{filteredProducts.length}</span> products
       </div>
       <div className="flex items-center gap-1">
        <button
          aria-label="Previous forecast page"
         onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
         disabled={currentPage === 1}
         className="p-1.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
         <ChevronLeft className="w-4 h-4" />
        </button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
         let pageNum = i + 1;
         if (totalPages > 5 && currentPage > 3) {
          pageNum = currentPage - 3 + i + (currentPage > totalPages - 3 ? totalPages - 4 : 0);
         }
         if (pageNum > totalPages) return null;
         return (
          <button
           key={pageNum}
            aria-label={`Go to forecast page ${pageNum}`}
            aria-current={currentPage === pageNum ? 'page' : undefined}
           onClick={() => setCurrentPage(pageNum)}
           className={`px-3 py-1 rounded-xl text-sm font-medium transition-all ${
            currentPage === pageNum
              ? 'bg-slate-200 text-slate-900 dark:bg-blue-500 dark:text-white'
             : 'text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800/50'
           }`}
          >
           {pageNum}
          </button>
         );
        })}
        <button
          aria-label="Next forecast page"
         onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
         disabled={totalPages === 0 || currentPage === totalPages}
         className="p-1.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
         <ChevronRightIcon className="w-4 h-4" />
        </button>
       </div>
      </div>
     </div>
    </div>

    {/* ============================================ */}
    {/* SECTION 3 (BOTTOM GRID): AI Insights & Top Predicted Products */}
    {/* ============================================ */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full mt-6">
     {/* LEFT SIDE: AI Insights Card Container */}
     <div className="lg:col-span-2">
      <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-6">
       <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-blue-400" /> AI Insights
       </h3>
       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <div className="bg-[#0d1322] border border-slate-800/80 rounded-xl p-4">
          <p className="text-white font-medium text-sm">Four-week demand outlook</p>
          <p className="text-slate-400 text-sm mt-0.5">{unitNames.length
           ? unitNames.map((unit) => formatRawQuantity(demandByUnit[unit] ?? 0, unit)).join(' · ')
           : 'No forecast totals are available.'} Totals are separated by unit and include all successful product forecasts.</p>
         </div>
         <div className="bg-[#0d1322] border border-slate-800/80 rounded-xl p-4">
          <p className="text-white font-medium text-sm">Model validation</p>
          <p className="text-slate-400 text-sm mt-0.5">Global holdout MAE is {globalMae?.toLocaleString(undefined, { maximumFractionDigits: 3 }) ?? '—'} model units. It is not an accuracy percentage or a separate score per Product.</p>
         </div>
       </div>
      </div>
     </div>

     {/* RIGHT SIDE: Top Predicted Products Card Container */}
     <div className="lg:col-span-1">
      <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-6">
       <h3 className="text-white font-semibold text-sm">Top Product per Unit</h3>
         <p className="text-slate-400 text-xs mt-1 mb-4">One raw four-week leader for each measurement unit.</p>
       <div className="space-y-3">
        {topProducts.map((product, idx) => (
          <div key={product.id} className="bg-[#0d1322] border border-slate-800/80 rounded-xl p-3 transition-all duration-200">
          <div className="flex items-center justify-between">
           <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold flex items-center justify-center shrink-0">
             #{idx + 1}
            </div>
            <div>
             <p className="text-white text-sm font-medium">{product.name}</p>
              <p className="text-slate-400 text-xs">Product {product.id}</p>
            </div>
           </div>
           <div className="flex items-center gap-2">
             <span className="text-white text-sm font-semibold">{formatRawQuantity(product.predictedDemand, product.unit)}</span>
           </div>
          </div>
         </div>
         ))}
         {topProducts.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No forecast ranking is available.</p>}
       </div>
      </div>
     </div>
    </div>

    {/* Current model output */}
    <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-6">
     <h3 className="text-white font-semibold text-sm mb-4">Current Weekly Forecast</h3>
     <div className="admin-table-scroll">
       <table className="admin-responsive-table min-w-[46rem] w-full border-collapse">
        <thead className="bg-gray-800/50 bg-gray-800/30 border-b border-slate-800">
        <tr>
         <th className="px-4 py-2 text-left text-gray-400 text-xs font-medium uppercase tracking-wider">Week Start</th>
         {unitNames.map((unit) => <th key={unit} className="px-4 py-2 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">Expected {unit}</th>)}
         <th className="px-4 py-2 text-left text-gray-400 text-xs font-medium uppercase tracking-wider">Coverage</th>
         <th className="px-4 py-2 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">Products</th>
         <th className="px-4 py-2 text-left text-gray-400 text-xs font-medium uppercase tracking-wider">Model</th>
        </tr>
       </thead>
       <tbody>
          {forecastChartData.map((week) => (
          <tr key={week.week} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
          <td className="px-4 py-2.5 text-white text-sm">{week.week}</td>
          {unitNames.map((unit) => <td key={unit} className="px-4 py-2.5 text-right text-blue-400 text-sm font-medium">{formatRawQuantity(Number(week[unit] ?? 0), unit)}</td>)}
          <td className="px-4 py-2.5 text-gray-400 text-sm">Weekly</td>
          <td className="px-4 py-2.5 text-right text-white text-sm">{forecastProducts.length}</td>
          <td className="px-4 py-2.5 text-gray-400 text-sm">{forecastProducts[0]?.modelVersion ?? '—'}</td>
         </tr>
         ))}
         {!loading && forecastChartData.length === 0 && <tr><td colSpan={unitNames.length + 4} className="px-4 py-8 text-center text-sm text-slate-400">No forecast data available.</td></tr>}
       </tbody>
      </table>
     </div>
    </div>

    {/* Forecast Details Drawer */}
    {showDrawer && selectedProduct && (
     <div className="fixed inset-0 z-50 flex justify-end">
      <div className="min-w-0 flex-1 bg-black/50 backdrop-blur-sm" onClick={() => setShowDrawer(false)} />
      <div className="h-full w-[96vw] shrink-0 overflow-x-hidden overflow-y-auto overscroll-y-contain border-l border-gray-800 bg-[#0d1322] p-3 shadow-sm min-[400px]:w-[92vw] sm:w-[480px] sm:p-6">
       <div className="sticky top-0 z-10 -mx-3 -mt-3 mb-4 flex items-center justify-between gap-2 bg-[#0d1322] px-3 py-3 sm:static sm:mx-0 sm:mt-0 sm:mb-6 sm:bg-transparent sm:p-0">
        <h2 className="min-w-0 text-base font-bold leading-tight text-white sm:text-xl">Forecast Details</h2>
        <button aria-label="Close forecast details" onClick={() => setShowDrawer(false)} className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors duration-200 hover:bg-gray-800/50 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 sm:min-h-0 sm:min-w-0 sm:p-1.5">
         <X className="w-5 h-5" />
        </button>
       </div>

       <div className="space-y-5 sm:space-y-8">
        {/* Product Info */}
        <div>
         <h3 className="break-words text-base font-semibold text-white sm:text-lg">{selectedProduct.name}</h3>
         <p className="text-gray-400 text-sm">Product {selectedProduct.id} · {selectedProduct.modelVersion}</p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:gap-3">
         <div className="bg-[#0d1322] rounded-xl p-3 border border-gray-800/50">
          <p className="text-xs font-normal text-gray-400">Training History</p>
          <p className="text-[15px] font-semibold text-white sm:text-lg sm:font-bold">{selectedProduct.trainingWeeks} weeks</p>
         </div>
         <div className="bg-[#0d1322] rounded-xl p-3 border border-gray-800/50">
          <p className="text-xs font-normal text-gray-400">4-Week Forecast</p>
          <p className="text-[15px] font-semibold text-white sm:text-lg sm:font-bold">{formatRawQuantity(selectedProduct.predictedDemand, selectedProduct.unit)}</p>
         </div>
         <div className="bg-[#0d1322] rounded-xl p-3 border border-gray-800/50">
          <p className="text-xs font-normal text-gray-400">Weekly Average</p>
          <p className="text-[15px] font-semibold text-white sm:text-lg sm:font-bold">{formatRawQuantity(selectedProduct.averageWeeklyDemand, selectedProduct.unit)}</p>
         </div>
         <div className="bg-[#0d1322] rounded-xl p-3 border border-gray-800/50">
          <p className="text-xs font-normal text-gray-400">Global Validation MAE</p>
          <p className="text-[15px] font-semibold text-white sm:text-lg sm:font-bold" title="Global holdout metric, not a Product-specific accuracy percentage.">{selectedProduct.validationMae.toLocaleString(undefined, { maximumFractionDigits: 3 })}</p>
         </div>
        </div>

        {/* Weekly values */}
        <div className="rounded-xl border border-gray-800/50 bg-[#0d1322] p-3 sm:p-4">
         {selectedProduct.forecast.map((week) => <div key={week.week_start} className="flex items-center justify-between border-b border-gray-800/50 py-2 last:border-0">
          <span className="text-xs text-gray-400 sm:text-sm">{new Date(`${week.week_start}T00:00:00`).toLocaleDateString()}</span>
          <span className="text-xs font-semibold text-white sm:text-base">{formatRawQuantity(week.expected_quantity, selectedProduct.unit)}</span>
         </div>)}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 gap-2 border-t border-gray-800/50 pt-3 min-[360px]:grid-cols-2 sm:flex sm:items-center sm:gap-3 sm:pt-4">
         <button onClick={() => exportForecasts([selectedProduct])} className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-gray-700 px-3 py-2 text-xs font-medium leading-[1.2] text-gray-400 transition-colors duration-200 hover:bg-gray-800/50 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 sm:min-h-11 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm sm:font-normal sm:leading-5">
          <Download className="w-4 h-4" /> Export
         </button>
        </div>
       </div>
      </div>
     </div>
    )}
   </div>
  </PageContainer>
 );
};

export default AIDemandForecast;
