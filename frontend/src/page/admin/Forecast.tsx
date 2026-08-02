// src/pages/admin/Forecast.tsx
import React, { useState, useMemo } from 'react';
import {
  ChevronRight,
  Search,
  Sparkles,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ============================================
// TYPES
// ============================================

interface ForecastItem {
  id: string;
  sku: string;
  product: string;
  predictedDemand: number;
  recommendedReorder: number;
  confidence: number;
}

interface ChartDataPoint {
  month: string;
  predicted: number;
  upperBound: number;
  lowerBound: number;
}

// ============================================
// MOCK DATA
// ============================================

const forecastTableData: ForecastItem[] = [
  {
    id: '1',
    sku: 'ELC-LED-040',
    product: 'Industrial LED Panel 40W',
    predictedDemand: 640,
    recommendedReorder: 480,
    confidence: 94,
  },
  {
    id: '2',
    sku: 'PKG-BOX-604',
    product: 'Corrugated Box 60x40x40',
    predictedDemand: 2100,
    recommendedReorder: 1800,
    confidence: 91,
  },
  {
    id: '3',
    sku: 'RAW-SST-002',
    product: 'Stainless Steel Sheet 2mm',
    predictedDemand: 180,
    recommendedReorder: 220,
    confidence: 87,
  },
  {
    id: '4',
    sku: 'SAF-GLV-100',
    product: 'Nitrile Gloves (Box 100)',
    predictedDemand: 320,
    recommendedReorder: 400,
    confidence: 82,
  },
  {
    id: '5',
    sku: 'TLS-IMP-018',
    product: 'Cordless Impact Driver',
    predictedDemand: 145,
    recommendedReorder: 90,
    confidence: 78,
  },
  {
    id: '6',
    sku: 'ELC-SRV-400',
    product: 'Servo Motor 400W',
    predictedDemand: 62,
    recommendedReorder: 45,
    confidence: 74,
  },
];

const chartData: ChartDataPoint[] = [
  { month: 'Aug', predicted: 5200, upperBound: 5800, lowerBound: 4600 },
  { month: 'Sep', predicted: 5400, upperBound: 6050, lowerBound: 4750 },
  { month: 'Oct', predicted: 5800, upperBound: 6500, lowerBound: 5100 },
  { month: 'Nov', predicted: 6400, upperBound: 7100, lowerBound: 5700 },
  { month: 'Dec', predicted: 7200, upperBound: 7900, lowerBound: 6500 },
  { month: 'Jan', predicted: 6800, upperBound: 7500, lowerBound: 6100 },
];

// ============================================
// HELPER COMPONENTS
// ============================================

const SearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, placeholder = 'Search...', className = '' }) => (
  <div className={`relative flex-1 min-w-[200px] ${className}`}>
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[#101929] border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all"
    />
  </div>
);

// Custom Tooltip for Chart
const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-3 shadow-lg">
        <p className="text-sm font-semibold text-white mb-1">{label}</p>
        <div className="space-y-0.5 text-sm">
          <p className="text-slate-300">
            Predicted: <span className="font-medium text-white">{payload[1]?.value?.toLocaleString()}</span>
          </p>
          <p className="text-slate-300">
            Upper: <span className="font-medium text-white">{payload[0]?.value?.toLocaleString()}</span>
          </p>
          <p className="text-slate-300">
            Lower: <span className="font-medium text-white">{payload[2]?.value?.toLocaleString()}</span>
          </p>
        </div>
      </div>
    );
  }
  return null;
};

// ============================================
// MAIN COMPONENT
// ============================================

const Forecast: React.FC = () => {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof ForecastItem>('predictedDemand');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Filter and sort table data
  const filteredData = useMemo(() => {
    let result = forecastTableData.filter(
      (item) =>
        item.product.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase())
    );

    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [searchQuery, sortField, sortDirection]);

  const handleSort = (field: keyof ForecastItem) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const renderSortIcon = (field: keyof ForecastItem) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 inline" />
    ) : (
      <ArrowDown className="w-3 h-3 inline" />
    );
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'bg-emerald-500';
    if (confidence >= 80) return 'bg-cyan-500';
    if (confidence >= 70) return 'bg-amber-500';
    return 'bg-slate-500';
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span>Admin</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-100">AI Forecast</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Forecast</h1>
          <p className="text-sm text-slate-400">
            Demand predictions generated by the SmartChain forecasting service
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button className="p-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Notice Banner */}
      <div className="bg-[#0b1b2b]/60 border border-cyan-950/80 rounded-2xl p-4 flex items-center gap-3 text-cyan-400 text-sm">
        <Sparkles className="w-5 h-5 flex-shrink-0" />
        <span>
          View only — model training and tuning are managed by the System Administrator. Last model run: July 31, 2026 at 04:00.
        </span>
      </div>

      {/* Forecast Graph */}
      <div className="bg-[#0f172a]/60 border border-slate-800/80 rounded-2xl p-5 md:p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Forecast Graph</h3>
          <p className="text-sm text-slate-400">Predicted demand with confidence band (units)</p>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 0, bottom: 10 }}
          >
            <defs>
              <linearGradient id="upperBandGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00a3c4" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#00a3c4" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="lowerBandGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00a3c4" stopOpacity={0.02} />
                <stop offset="95%" stopColor="#00a3c4" stopOpacity={0.15} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-700" />
            <XAxis
              dataKey="month"
              className="text-slate-400 text-xs"
              tick={{ fill: '#94a3b8' }}
            />
            <YAxis
              className="text-slate-400 text-xs"
              tick={{ fill: '#94a3b8' }}
              tickFormatter={(value) => value.toLocaleString()}
              domain={[0, 8500]}
              ticks={[0, 2000, 4000, 6000, 8000]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ color: '#94a3b8' }}
              formatter={(value) => (
                <span className="text-slate-300 text-sm">{value}</span>
              )}
            />
            <Area
              type="monotone"
              dataKey="upperBound"
              stroke="none"
              fill="url(#upperBandGradient)"
              name="Confidence Band"
              stackId="1"
            />
            <Area
              type="monotone"
              dataKey="lowerBound"
              stroke="none"
              fill="url(#lowerBandGradient)"
              name="Confidence Band"
              stackId="1"
            />
            <Area
              type="monotone"
              dataKey="predicted"
              stroke="#00a3c4"
              strokeWidth={2.5}
              fill="none"
              name="Predicted Demand"
              dot={{ fill: '#00a3c4', r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Forecast Table */}
      <div className="bg-[#0f172a]/60 border border-slate-800/80 rounded-2xl p-5 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Forecast Table</h3>
            <p className="text-sm text-slate-400">
              Predicted demand and recommended reorder quantity per SKU
            </p>
          </div>
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search products or SKU..."
            className="min-w-[200px]"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="border-b border-slate-800">
              <tr>
                <th
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400 cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('sku')}
                >
                  <div className="flex items-center gap-1">
                    SKU {renderSortIcon('sku')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400 cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('product')}
                >
                  <div className="flex items-center gap-1">
                    Product {renderSortIcon('product')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400 cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('predictedDemand')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Predicted demand {renderSortIcon('predictedDemand')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400 cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('recommendedReorder')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Recommended reorder {renderSortIcon('recommendedReorder')}
                  </div>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400 cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('confidence')}
                >
                  <div className="flex items-center gap-1">
                    Confidence {renderSortIcon('confidence')}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item) => (
                <tr key={item.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3.5 text-xs font-mono uppercase text-slate-400">
                    {item.sku}
                  </td>
                  <td className="px-4 py-3.5 text-sm font-medium text-white">
                    {item.product}
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm text-white">
                    {item.predictedDemand.toLocaleString()}
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm text-white">
                    {item.recommendedReorder.toLocaleString()}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getConfidenceColor(
                            item.confidence
                          )}`}
                          style={{ width: `${item.confidence}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-white min-w-[36px]">
                        {item.confidence}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No forecast data found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-2 pt-4 border-t border-slate-800">
          <div className="text-sm text-slate-400">
            Showing <span className="text-white font-medium">1</span> to{' '}
            <span className="text-white font-medium">{filteredData.length}</span> of{' '}
            <span className="text-white font-medium">{forecastTableData.length}</span> products
          </div>
          <div className="flex items-center gap-1">
            <button className="p-1.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="px-3 py-1 rounded-xl text-sm font-medium bg-cyan-500 text-slate-950">
              1
            </button>
            <button className="p-1.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Forecast;