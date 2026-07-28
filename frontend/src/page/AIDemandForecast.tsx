// src/pages/AIDemandForecast.tsx
import React, { useState } from 'react';
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Search,
  Download,
  Printer,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Eye,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Filter,
  Sparkles,
  Shield,
  Target,
  Award,
  Minus,
  Maximize2,
  Minimize2,
  ShoppingCart,
  X,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  Legend,
} from 'recharts';

import PageContainer from '../components/layout/PageContainer';

// ============================================
// TYPES
// ============================================

interface ForecastProduct {
  id: string;
  name: string;
  sku: string;
  warehouse: string;
  category: string;
  historicalDemand: number;
  predictedDemand: number;
  currentStock: number;
  suggestedReorder: number;
  safetyStock: number;
  confidence: number;
  status: 'Critical' | 'High' | 'Medium' | 'Low';
  trend: 'up' | 'down' | 'flat';
}

interface ForecastHistory {
  id: string;
  generatedDate: string;
  generatedBy: string;
  model: string;
  accuracy: number;
  forecastPeriod: string;
}

interface AIInsight {
  id: string;
  title: string;
  description: string;
  type: 'warning' | 'success' | 'info' | 'critical';
  action?: string;
}

// ============================================
// MOCK DATA
// ============================================

const mockForecastProducts: ForecastProduct[] = [
  {
    id: '1',
    name: 'Wireless Earbuds Pro',
    sku: 'SKU-1001',
    warehouse: 'Central Depot',
    category: 'Electronics',
    historicalDemand: 650,
    predictedDemand: 820,
    currentStock: 340,
    suggestedReorder: 480,
    safetyStock: 200,
    confidence: 92,
    status: 'Critical',
    trend: 'up'
  },
  {
    id: '2',
    name: 'Bluetooth Speaker Mini',
    sku: 'SKU-1004',
    warehouse: 'Northgate',
    category: 'Electronics',
    historicalDemand: 520,
    predictedDemand: 640,
    currentStock: 280,
    suggestedReorder: 360,
    safetyStock: 150,
    confidence: 88,
    status: 'High',
    trend: 'up'
  },
  {
    id: '3',
    name: 'Organic Green Tea 500g',
    sku: 'SKU-1002',
    warehouse: 'Eastside',
    category: 'Beverages',
    historicalDemand: 380,
    predictedDemand: 410,
    currentStock: 180,
    suggestedReorder: 230,
    safetyStock: 100,
    confidence: 81,
    status: 'Medium',
    trend: 'flat'
  },
  {
    id: '4',
    name: 'Stainless Water Bottle',
    sku: 'SKU-1005',
    warehouse: 'Southpark',
    category: 'Kitchenware',
    historicalDemand: 300,
    predictedDemand: 260,
    currentStock: 120,
    suggestedReorder: 140,
    safetyStock: 80,
    confidence: 76,
    status: 'Low',
    trend: 'down'
  },
  {
    id: '5',
    name: 'LED Desk Lamp',
    sku: 'SKU-1006',
    warehouse: 'Central Depot',
    category: 'Electronics',
    historicalDemand: 410,
    predictedDemand: 530,
    currentStock: 220,
    suggestedReorder: 310,
    safetyStock: 120,
    confidence: 84,
    status: 'High',
    trend: 'up'
  },
  {
    id: '6',
    name: 'Yoga Mat Premium',
    sku: 'SKU-1007',
    warehouse: 'Northgate',
    category: 'Sports',
    historicalDemand: 220,
    predictedDemand: 300,
    currentStock: 95,
    suggestedReorder: 205,
    safetyStock: 60,
    confidence: 79,
    status: 'Medium',
    trend: 'up'
  }
];

const mockForecastHistory: ForecastHistory[] = [
  {
    id: '1',
    generatedDate: '2026-07-27 08:00:00',
    generatedBy: 'AI System',
    model: 'Random Forest v1.3',
    accuracy: 89.4,
    forecastPeriod: '30 Days'
  },
  {
    id: '2',
    generatedDate: '2026-07-20 08:00:00',
    generatedBy: 'AI System',
    model: 'Random Forest v1.3',
    accuracy: 87.2,
    forecastPeriod: '30 Days'
  },
  {
    id: '3',
    generatedDate: '2026-07-13 08:00:00',
    generatedBy: 'AI System',
    model: 'XGBoost v1.0',
    accuracy: 85.6,
    forecastPeriod: '30 Days'
  },
  {
    id: '4',
    generatedDate: '2026-07-06 08:00:00',
    generatedBy: 'AI System',
    model: 'Random Forest v1.2',
    accuracy: 83.9,
    forecastPeriod: '30 Days'
  }
];

const mockAIInsights: AIInsight[] = [
  {
    id: '1',
    title: 'Increase Reorder Quantity',
    description: 'Demand for Wireless Earbuds Pro is expected to rise 26% in the next 30 days.',
    type: 'warning',
    action: 'Adjust Reorder'
  },
  {
    id: '2',
    title: 'Inventory Health Check',
    description: 'Current stock levels are optimal for 92% of tracked SKUs.',
    type: 'success',
    action: 'View Details'
  },
  {
    id: '3',
    title: 'Restock Alert',
    description: 'Stainless Water Bottle inventory will be depleted in 5 days.',
    type: 'critical',
    action: 'Create PO'
  },
  {
    id: '4',
    title: 'Demand Trend',
    description: 'Organic Green Tea 500g demand is stable with slight upward trend.',
    type: 'info',
    action: 'Analyze'
  }
];

const mockChartData = [
  { month: 'Feb', actual: 1200, forecast: 1300, upper: 1450, lower: 1150 },
  { month: 'Mar', actual: 1350, forecast: 1400, upper: 1550, lower: 1250 },
  { month: 'Apr', actual: 1450, forecast: 1500, upper: 1650, lower: 1350 },
  { month: 'May', actual: 1600, forecast: 1550, upper: 1700, lower: 1400 },
  { month: 'Jun', actual: 1700, forecast: 1750, upper: 1900, lower: 1600 },
  { month: 'Jul', actual: 1800, forecast: 1850, upper: 2000, lower: 1700 },
  { month: 'Aug', actual: null, forecast: 1950, upper: 2100, lower: 1800 },
  { month: 'Sep', actual: null, forecast: 2050, upper: 2200, lower: 1900 },
];

// ============================================
// HELPER COMPONENTS
// ============================================

const KPICard: React.FC<{
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: string; positive: boolean };
  className?: string;
}> = ({ label, value, subtitle, icon, trend, className = '' }) => (
  <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 hover:border-[#4F7DF3]/30 transition-all duration-200 h-full flex flex-col ${className}`}>
    <div className="flex items-start justify-between flex-1">
      <div>
        <p className="text-[var(--muted)] text-xs font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-[var(--fg)] mt-1.5">{value}</p>
        {subtitle && <p className="text-[var(--muted)] text-xs mt-1">{subtitle}</p>}
      </div>
      <div className="p-2.5 bg-[#0E1624] rounded-lg shrink-0">
        {icon}
      </div>
    </div>
    {trend && (
      <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-[#263244]/50">
        <span className={`text-xs font-medium ${trend.positive ? 'text-success' : 'text-danger'}`}>
          {trend.positive ? '↑' : '↓'} {trend.value}
        </span>
        <span className="text-[var(--muted)] text-xs">vs last month</span>
      </div>
    )}
  </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    'Critical': { color: 'text-danger bg-danger/10 border-danger/20', icon: AlertCircle },
    'High': { color: 'text-warning bg-warning/10 border-warning/20', icon: TrendingUp },
    'Medium': { color: 'text-info bg-info/10 border-info/20', icon: Minus },
    'Low': { color: 'text-success bg-success/10 border-success/20', icon: TrendingDown },
    'In Stock': { color: 'text-success bg-success/10 border-success/20', icon: CheckCircle },
    'Low Stock': { color: 'text-warning bg-warning/10 border-warning/20', icon: AlertCircle },
    'Out of Stock': { color: 'text-danger bg-danger/10 border-danger/20', icon: XCircle },
  };
  const { color, icon: Icon } = config[status] || config['Medium'];
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${color} flex items-center gap-1.5 whitespace-nowrap`}>
      <Icon className="w-3 h-3" />
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
  <div className={`relative flex-1 min-w-[180px] ${className}`}>
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[var(--surface-alt)] border border-[var(--border)] rounded-xl pl-9 pr-4 py-2.5 text-sm text-[var(--fg)] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-all"
    />
  </div>
);

const FilterSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: string[];
  className?: string;
}> = ({ value, onChange, options, className = '' }) => (
  <div className={`min-w-[130px] ${className}`}>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[var(--surface-alt)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--fg)] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-all appearance-none cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  </div>
);

const AIDemandForecast: React.FC = () => {
  const [timeFilter, setTimeFilter] = useState('90 Days');
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('All Warehouses');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [selectedProduct, setSelectedProduct] = useState<ForecastProduct | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [expandedChart, setExpandedChart] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const timeFilters = ['7 Days', '30 Days', '90 Days', '6 Months', '1 Year'];
  const warehouses = ['All Warehouses', 'Central Depot', 'Northgate', 'Eastside', 'Southpark'];
  const categories = ['All Categories', 'Electronics', 'Beverages', 'Kitchenware', 'Sports'];
  const suppliers = ['All Suppliers', 'Northgate Trading Co.', 'GreenLeaf Organics', 'Metro Textile Mills'];

  const filteredProducts = mockForecastProducts.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
                        p.sku.toLowerCase().includes(search.toLowerCase());
    const matchWarehouse = warehouseFilter === 'All Warehouses' || p.warehouse === warehouseFilter;
    const matchCategory = categoryFilter === 'All Categories' || p.category === categoryFilter;
    return matchSearch && matchWarehouse && matchCategory;
  });

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // KPI Calculations
  const totalPredictedDemand = mockForecastProducts.reduce((sum, p) => sum + p.predictedDemand, 0);
  const totalReorder = mockForecastProducts.reduce((sum, p) => sum + p.suggestedReorder, 0);
  const avgConfidence = Math.round(mockForecastProducts.reduce((sum, p) => sum + p.confidence, 0) / mockForecastProducts.length);
  const criticalItems = mockForecastProducts.filter(p => p.status === 'Critical').length;

  // Top products
  const lastActualIndex = mockChartData.reduce((acc, entry, index) => entry.actual !== null ? index : acc, -1);
  const _forecastChartData = mockChartData.map((entry, index) => {
    if (lastActualIndex < 0) return { ...entry, forecastFromLastActual: entry.forecast };
    if (index < lastActualIndex) return { ...entry, forecastFromLastActual: null };
    if (index === lastActualIndex) return { ...entry, forecastFromLastActual: entry.actual as number };
    return { ...entry, forecastFromLastActual: entry.forecast };
  });

  const topProducts = [...mockForecastProducts].sort((a, b) => b.predictedDemand - a.predictedDemand).slice(0, 3);

  const handleViewProduct = (product: ForecastProduct) => {
    setSelectedProduct(product);
    setShowDrawer(true);
  };

  return (
    <PageContainer>
      <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--fg)]">AI Demand Forecast</h1>
        <p className="text-[var(--muted)] text-sm mt-1">
          Predict future inventory demand using Machine Learning.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-6 gap-4">
        <KPICard
          label="Predicted 30D Demand"
          value={totalPredictedDemand.toLocaleString()}
          subtitle="units across all SKUs"
          icon={<Brain className="w-5 h-5 text-primary" />}
          trend={{ value: '8.6%', positive: true }}
        />
        <KPICard
          label="Model Confidence"
          value={`${avgConfidence}%`}
          subtitle="Random Forest v1.3"
          icon={<Target className="w-5 h-5 text-success" />}
        />
        <KPICard
          label="Restock Suggestions"
          value={criticalItems}
          subtitle="SKUs below forecast"
          icon={<AlertCircle className="w-5 h-5 text-warning" />}
          trend={{ value: '12%', positive: false }}
        />
        <KPICard
          label="Total Reorder Qty"
          value={totalReorder.toLocaleString()}
          subtitle="suggested across all SKUs"
          icon={<ShoppingCart className="w-5 h-5 text-info" />}
        />
        <KPICard
          label="Forecast Accuracy"
          value="89.4%"
          subtitle="MAE: 12.3 | RMSE: 18.7"
          icon={<Award className="w-5 h-5 text-warning" />}
        />
        <KPICard
          label="Inventory Health"
          value="92%"
          subtitle="optimal stock levels"
          icon={<Shield className="w-5 h-5 text-success" />}
        />
      </div>

      {/* Time Filters & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-[#162033] border border-[var(--border)] rounded-xl p-1">
          {timeFilters.map((filter) => (
            <button
              key={filter}
              onClick={() => setTimeFilter(filter)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                timeFilter === filter
                  ? 'bg-primary text-[var(--fg)]'
                  : 'text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2.5 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-all">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button className="p-2.5 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-all">
            <Download className="w-4 h-4" />
          </button>
          <button className="p-2.5 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-all">
            <Printer className="w-4 h-4" />
          </button>
          <button
            onClick={() => setExpandedChart(!expandedChart)}
            className="p-2.5 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-all"
          >
            {expandedChart ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Chart */}
      <div className={`bg-[#162033] border border-[#233047] rounded-2xl p-8 shadow-lg shadow-black/10 transition-all ${expandedChart ? 'col-span-full' : ''}`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-[var(--fg)] text-xl font-bold">Demand Forecast — Next Quarter</h3>
            <p className="text-[var(--muted)] text-sm mt-1">Historical sales vs Random Forest projection</p>
          </div>
          <button className="px-5 py-2.5 bg-[#4F7DF3] hover:bg-[#4F7DF3]/90 text-[var(--fg)] rounded-xl text-sm font-medium transition-all flex items-center gap-2 shadow-md shadow-[#4F7DF3]/20">
            <RefreshCw className="w-4 h-4" /> Re-run Forecast
          </button>
        </div>
        <ResponsiveContainer width="100%" height={expandedChart ? 500 : 320}>
          <AreaChart data={_forecastChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }} animationDuration={1500}>
            <defs>
              <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22C55E" stopOpacity={0.25}/>
                <stop offset="95%" stopColor="#22C55E" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#233047" opacity={0.5} />
            <XAxis dataKey="month" stroke="#64748B" tick={{ fill: '#64748B', fontSize: 12 }} />
            <YAxis stroke="#64748B" tick={{ fill: '#64748B', fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1E293B',
                borderColor: '#334155',
                borderRadius: '12px',
                color: '#F1F5F9',
              }}
              itemStyle={{ color: '#F1F5F9', fontSize: '12px' }}
              labelStyle={{ color: '#94A3B8', fontSize: '12px' }}
            />
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ paddingTop: '16px', color: '#94A3B8', fontSize: '12px' }} />
            <Area
              type="monotone"
              dataKey="actual"
              stroke="#22C55E"
              strokeWidth={3}
              fill="url(#actualGradient)"
              name="Actual"
              dot={{ fill: '#22C55E', r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="forecastFromLastActual"
              stroke="#4F7DF3"
              strokeWidth={3}
              strokeDasharray="6 6"
              name="Forecast"
              dot={{ fill: '#4F7DF3', r: 3 }}
              activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Filters */}
      <div className="bg-[#162033] border border-[var(--border)] rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search products..."
            className="min-w-[220px]"
          />
          <FilterSelect
            value={warehouseFilter}
            onChange={setWarehouseFilter}
            options={warehouses}
          />
          <FilterSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={categories}
          />
          <FilterSelect
            value="All Suppliers"
            onChange={() => {}}
            options={suppliers}
          />
          <button className="px-3.5 py-2.5 border border-[var(--border)] rounded-xl text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-all flex items-center gap-1.5 text-sm ml-auto">
            <Filter className="w-4 h-4" /> More Filters
          </button>
          <button className="px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-1.5" style={{ backgroundColor: '#4F7DF3', color: '#FFFFFF' }}>
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Product Forecast Table */}
      <div className="bg-[#162033] border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[var(--surface-alt)]/50 border-b border-[#263244]">
              <tr>
                <th className="px-5 py-3.5 text-left text-[var(--muted)] text-xs font-medium uppercase tracking-wider">Product</th>
                <th className="px-5 py-3.5 text-left text-[var(--muted)] text-xs font-medium uppercase tracking-wider">SKU</th>
                <th className="px-5 py-3.5 text-left text-[var(--muted)] text-xs font-medium uppercase tracking-wider">Warehouse</th>
                <th className="px-5 py-3.5 text-right text-[var(--muted)] text-xs font-medium uppercase tracking-wider">Hist. Demand</th>
                <th className="px-5 py-3.5 text-right text-[var(--muted)] text-xs font-medium uppercase tracking-wider">Predicted</th>
                <th className="px-5 py-3.5 text-right text-[var(--muted)] text-xs font-medium uppercase tracking-wider">Current Stock</th>
                <th className="px-5 py-3.5 text-right text-[var(--muted)] text-xs font-medium uppercase tracking-wider">Suggested Reorder</th>
                <th className="px-5 py-3.5 text-left text-[var(--muted)] text-xs font-medium uppercase tracking-wider">Confidence</th>
                <th className="px-5 py-3.5 text-left text-[var(--muted)] text-xs font-medium uppercase tracking-wider">Status</th>
                <th className="px-5 py-3.5 text-center text-[var(--muted)] text-xs font-medium uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((product) => (
                <tr key={product.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-hover)]/30 transition-all duration-150 group">
                  <td className="px-5 py-3.5 text-[var(--fg)] text-sm font-medium">{product.name}</td>
                  <td className="px-5 py-3.5 text-[var(--muted)] text-sm font-mono">{product.sku}</td>
                  <td className="px-5 py-3.5 text-[var(--muted)] text-sm">{product.warehouse}</td>
                  <td className="px-5 py-3.5 text-right text-[var(--fg)] text-sm">{product.historicalDemand}</td>
                  <td className="px-5 py-3.5 text-right text-[var(--fg)] text-sm font-semibold">{product.predictedDemand}</td>
                  <td className="px-5 py-3.5 text-right text-[var(--fg)] text-sm">{product.currentStock}</td>
                  <td className="px-5 py-3.5 text-right text-[var(--fg)] text-sm">{product.suggestedReorder}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 bg-[#0E1624] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${product.confidence}%`,
                            backgroundColor: product.confidence >= 85 ? '#22C55E' : product.confidence >= 70 ? '#F59E0B' : '#EF4444'
                          }}
                        />
                      </div>
                      <span className="text-[var(--muted)] text-xs">{product.confidence}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5"><StatusBadge status={product.status} /></td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleViewProduct(product)}
                        className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--fg)] transition-all"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--fg)] transition-all">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#263244] bg-[var(--surface-alt)]/30">
          <div className="text-sm text-[var(--muted)]">
            Showing <span className="text-[var(--fg)] font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
            <span className="text-[var(--fg)] font-medium">{Math.min(currentPage * itemsPerPage, filteredProducts.length)}</span> of{' '}
            <span className="text-[var(--fg)] font-medium">{filteredProducts.length}</span> products
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-1 rounded-xl text-sm font-medium transition-all ${
                    currentPage === pageNum
                      ? 'bg-primary text-[var(--fg)]'
                      : 'text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Section - AI Insights & Top Products */}
      <div className="grid grid-cols-3 gap-6">
        {/* AI Insights Panel */}
        <div className="col-span-2">
          <div className="bg-[#162033] border border-[var(--border)] rounded-2xl p-5">
            <h3 className="text-[var(--fg)] font-semibold text-sm mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-warning" /> AI Insights
            </h3>
            <div className="space-y-3">
              {mockAIInsights.map((insight) => (
                <div
                  key={insight.id}
                  className={`p-4 rounded-xl border transition-all ${
                    insight.type === 'critical' ? 'border-danger/30 bg-danger/5 hover:border-danger/50' :
                    insight.type === 'warning' ? 'border-warning/30 bg-warning/5 hover:border-warning/50' :
                    insight.type === 'success' ? 'border-success/30 bg-success/5 hover:border-success/50' :
                    'border-info/30 bg-info/5 hover:border-info/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[var(--fg)] font-medium text-sm">{insight.title}</p>
                      <p className="text-[var(--muted)] text-sm mt-0.5">{insight.description}</p>
                    </div>
                    {insight.action && (
                      <button className="px-3 py-1 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-all whitespace-nowrap ml-4">
                        {insight.action}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Products */}
        <div className="col-span-1">
          <div className="bg-[#162033] border border-[var(--border)] rounded-2xl p-5">
            <h3 className="text-[var(--fg)] font-semibold text-sm mb-4">Top Predicted Products</h3>
            <p className="text-[var(--muted)] text-xs mb-3">Next 30-day demand ranking</p>
            <div className="space-y-3">
              {topProducts.slice(0, 4).map((product, idx) => (
                <div key={product.id} className="flex items-center justify-between p-2.5 rounded-xl bg-[#0E1624] border border-[var(--border)]">
                  <div className="flex items-center gap-3">
                    <span className="text-[var(--muted)] text-xs font-medium w-4">{idx + 1}</span>
                    <div>
                      <p className="text-[var(--fg)] text-sm font-medium">{product.name}</p>
                      <p className="text-[var(--muted)] text-xs">{product.sku}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--fg)] text-sm font-semibold">{product.predictedDemand}</span>
                    <span className={`text-xs ${product.trend === 'up' ? 'text-success' : product.trend === 'down' ? 'text-danger' : 'text-warning'}`}>
                      {product.trend === 'up' ? '↑' : product.trend === 'down' ? '↓' : '→'}
                    </span>
                    <StatusBadge status={product.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Forecast History */}
      <div className="bg-[#162033] border border-[var(--border)] rounded-2xl p-5">
        <h3 className="text-[var(--fg)] font-semibold text-sm mb-4">Forecast History</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-[#263244]">
              <tr>
                <th className="px-4 py-2 text-left text-[var(--muted)] text-xs font-medium uppercase tracking-wider">Generated Date</th>
                <th className="px-4 py-2 text-left text-[var(--muted)] text-xs font-medium uppercase tracking-wider">Generated By</th>
                <th className="px-4 py-2 text-left text-[var(--muted)] text-xs font-medium uppercase tracking-wider">Model</th>
                <th className="px-4 py-2 text-right text-[var(--muted)] text-xs font-medium uppercase tracking-wider">Accuracy</th>
                <th className="px-4 py-2 text-left text-[var(--muted)] text-xs font-medium uppercase tracking-wider">Forecast Period</th>
              </tr>
            </thead>
            <tbody>
              {mockForecastHistory.map((history) => (
                <tr key={history.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-hover)]/30 transition-all">
                  <td className="px-4 py-2.5 text-[var(--fg)] text-sm">{history.generatedDate}</td>
                  <td className="px-4 py-2.5 text-[var(--muted)] text-sm">{history.generatedBy}</td>
                  <td className="px-4 py-2.5 text-[var(--muted)] text-sm">{history.model}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--fg)] text-sm font-medium">{history.accuracy}%</td>
                  <td className="px-4 py-2.5 text-[var(--muted)] text-sm">{history.forecastPeriod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Forecast Details Drawer */}
      {showDrawer && selectedProduct && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="bg-black/50 backdrop-blur-sm w-full" onClick={() => setShowDrawer(false)} />
          <div className="bg-[#162033] border-l border-[#263244] w-[480px] h-full overflow-y-auto p-6 animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[var(--fg)]">Forecast Details</h2>
              <button onClick={() => setShowDrawer(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--fg)] transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

      <div className="space-y-8">
              {/* Product Info */}
              <div>
                <h3 className="text-[var(--fg)] font-semibold text-lg">{selectedProduct.name}</h3>
                <p className="text-[var(--muted)] text-sm">{selectedProduct.sku} · {selectedProduct.warehouse}</p>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge status={selectedProduct.status} />
                  <span className={`text-xs ${selectedProduct.trend === 'up' ? 'text-success' : selectedProduct.trend === 'down' ? 'text-danger' : 'text-warning'}`}>
                    {selectedProduct.trend === 'up' ? '↑ Growing' : selectedProduct.trend === 'down' ? '↓ Declining' : '→ Stable'}
                  </span>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0E1624] rounded-xl p-3 border border-[var(--border)]">
                  <p className="text-[var(--muted)] text-xs">Historical Demand</p>
                  <p className="text-[var(--fg)] text-lg font-bold">{selectedProduct.historicalDemand}</p>
                </div>
                <div className="bg-[#0E1624] rounded-xl p-3 border border-[var(--border)]">
                  <p className="text-[var(--muted)] text-xs">Predicted Demand</p>
                  <p className="text-[var(--fg)] text-lg font-bold">{selectedProduct.predictedDemand}</p>
                </div>
                <div className="bg-[#0E1624] rounded-xl p-3 border border-[var(--border)]">
                  <p className="text-[var(--muted)] text-xs">Current Stock</p>
                  <p className="text-[var(--fg)] text-lg font-bold">{selectedProduct.currentStock}</p>
                </div>
                <div className="bg-[#0E1624] rounded-xl p-3 border border-[var(--border)]">
                  <p className="text-[var(--muted)] text-xs">Suggested Reorder</p>
                  <p className="text-[var(--fg)] text-lg font-bold">{selectedProduct.suggestedReorder}</p>
                </div>
              </div>

              {/* Confidence & Safety */}
              <div className="bg-[#0E1624] rounded-xl p-4 border border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)] text-sm">Forecast Confidence</span>
                  <span className="text-[var(--fg)] font-semibold">{selectedProduct.confidence}%</span>
                </div>
                <div className="w-full h-1.5 bg-[#162033] rounded-full mt-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${selectedProduct.confidence}%`,
                      backgroundColor: selectedProduct.confidence >= 85 ? '#22C55E' : selectedProduct.confidence >= 70 ? '#F59E0B' : '#EF4444'
                    }}
                  />
                </div>
                <div className="flex items-center justify-between mt-3 text-sm">
                  <span className="text-[var(--muted)]">Safety Stock</span>
                  <span className="text-[var(--fg)] font-medium">{selectedProduct.safetyStock} units</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-[#263244]">
                <button className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center justify-center gap-2" style={{ backgroundColor: '#4F7DF3', color: '#FFFFFF' }}>
                  <ShoppingCart className="w-4 h-4" /> Create PO
                </button>
                <button className="px-4 py-2.5 border border-[var(--border)] rounded-xl text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-hover)] transition-all flex items-center gap-2">
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