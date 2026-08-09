// src/page/plant-manager/Warehouse.tsx
import React, { useState } from 'react';
import {
  ChevronRight as ChevronRightIcon,
  LayoutGrid,
  ArrowUp,
  ArrowDown,
  Box,
  Layers,
  Warehouse as WarehouseIcon,
  BarChart3,
  Package,
  Minus,
  RefreshCw,
  Download,
  Printer,
  X,
  Eye,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ============================================
// TYPES
// ============================================

interface Zone {
  id: string;
  name: string;
  subtitle: string;
  utilization: number;
  used: number;
  capacity: number;
  racks: number;
  freeRacks: number;
}

interface ChartData {
  name: string;
  used: number;
  capacity: number;
}

// ============================================
// MOCK DATA
// ============================================

const zones: Zone[] = [
  {
    id: '1',
    name: 'Zone A',
    subtitle: 'Ambient storage',
    utilization: 85,
    used: 10240,
    capacity: 12000,
    racks: 48,
    freeRacks: 7,
  },
  {
    id: '2',
    name: 'Zone B',
    subtitle: 'Heavy materials',
    utilization: 66,
    used: 5940,
    capacity: 9000,
    racks: 32,
    freeRacks: 10,
  },
  {
    id: '3',
    name: 'Zone C',
    subtitle: 'Electronics / ESD',
    utilization: 91,
    used: 6820,
    capacity: 7500,
    racks: 40,
    freeRacks: 4,
  },
  {
    id: '4',
    name: 'Zone D',
    subtitle: 'Outbound staging',
    utilization: 43,
    used: 2140,
    capacity: 5000,
    racks: 24,
    freeRacks: 13,
  },
];

const chartData: ChartData[] = zones.map((zone) => ({
  name: zone.name,
  used: zone.used,
  capacity: zone.capacity,
}));

// ============================================
// KPI DATA
// ============================================

const kpiData = [
  {
    label: 'Warehouse Capacity',
    value: '33,500 u',
    trend: 'unchanged vs last period',
    trendType: 'neutral' as const,
    icon: <WarehouseIcon className="w-5 h-5 text-blue-400" />,
  },
  {
    label: 'Current Utilization',
    value: '75%',
    trend: '+3.1% vs last period',
    trendType: 'up' as const,
    icon: <BarChart3 className="w-5 h-5 text-emerald-400" />,
  },
  {
    label: 'Storage Zones',
    value: '4',
    trend: 'all active vs last period',
    trendType: 'up' as const,
    icon: <LayoutGrid className="w-5 h-5 text-emerald-400" />,
  },
  {
    label: 'Rack Availability',
    value: '34/144',
    trend: '-4 vs last period',
    trendType: 'down' as const,
    icon: <Package className="w-5 h-5 text-amber-400" />,
  },
];

// ============================================
// HELPER COMPONENTS
// ============================================

const KPICard: React.FC<{
  label: string;
  value: string | number;
  trend: string;
  trendType: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
}> = ({ label, value, trend, trendType, icon }) => {
  const trendColor =
    trendType === 'up'
      ? 'text-emerald-400'
      : trendType === 'down'
      ? 'text-rose-400'
      : 'text-slate-400';

  const TrendIcon =
    trendType === 'up'
      ? ArrowUp
      : trendType === 'down'
      ? ArrowDown
      : Minus;

  return (
    <div className="bg-[#0f172a]/80 border border-slate-800/90 rounded-2xl p-5 hover:border-slate-700 transition-all duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            {label}
          </p>
          <p className="text-2xl font-bold text-white mt-1.5">{value}</p>
          <p className={`text-xs mt-1 flex items-center gap-1 ${trendColor}`}>
            <TrendIcon className="w-3 h-3" />
            {trend}
          </p>
        </div>
        <div className="p-2.5 bg-slate-800/50 rounded-lg">{icon}</div>
      </div>
    </div>
  );
};

// Custom Tooltip for chart
const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const used = payload.find((p) => p.dataKey === 'used')?.value;
    const capacity = payload.find((p) => p.dataKey === 'capacity')?.value;
    return (
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-3 shadow-lg">
        <p className="text-sm font-semibold text-white mb-1">{label}</p>
        <div className="space-y-1 text-sm">
          <p className="text-slate-300">
            Used: <span className="font-medium text-white">{used?.toLocaleString()}</span>
          </p>
          <p className="text-slate-300">
            Capacity: <span className="font-medium text-white">{capacity?.toLocaleString()}</span>
          </p>
          <p className="text-xs text-slate-400 border-t border-slate-700 pt-1 mt-1">
            {used?.toLocaleString()} / {capacity?.toLocaleString()}
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

const Warehouse: React.FC = () => {
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [showZoneModal, setShowZoneModal] = useState(false);

  const handleZoneClick = (zone: Zone) => {
    setSelectedZone(zone);
    setShowZoneModal(true);
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Warehouse Overview</h1>
          <p className="text-sm text-slate-400">Central Distribution Center · 4 storage zones</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button className="p-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
            <Download className="w-4 h-4" />
          </button>
          <button className="p-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiData.map((kpi, index) => (
          <KPICard
            key={index}
            label={kpi.label}
            value={kpi.value}
            trend={kpi.trend}
            trendType={kpi.trendType}
            icon={kpi.icon}
          />
        ))}
      </div>

      {/* Storage Zone Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {zones.map((zone) => (
          <div
            key={zone.id}
            onClick={() => handleZoneClick(zone)}
            className="bg-[#0f172a]/80 border border-slate-800/90 rounded-2xl p-5 hover:border-slate-700 hover:shadow-lg transition-all duration-200 cursor-pointer group"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">{zone.name}</h3>
                <p className="text-xs text-slate-400">{zone.subtitle}</p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  zone.utilization > 90
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : zone.utilization >= 70
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {zone.utilization}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full mb-4 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${zone.utilization}%`,
                  backgroundColor:
                    zone.utilization > 90
                      ? '#EF4444'
                      : zone.utilization >= 70
                      ? '#F59E0B'
                      : '#10B981',
                }}
              />
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                <p className="text-xs text-slate-400">Used</p>
                <p className="text-sm font-semibold text-white">
                  {zone.used.toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                <p className="text-xs text-slate-400">Capacity</p>
                <p className="text-sm font-semibold text-white">
                  {zone.capacity.toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                <p className="text-xs text-slate-400">Racks</p>
                <p className="text-sm font-semibold text-white">{zone.racks}</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                <p className="text-xs text-slate-400">Free racks</p>
                <p className="text-sm font-semibold text-emerald-400">
                  {zone.freeRacks}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Zone Utilization Chart */}
      <div className="bg-[#0f172a]/80 border border-slate-800/90 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Zone Utilization</h3>
            <p className="text-sm text-slate-400">Used vs available capacity by zone</p>
          </div>
          <button className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
            Export
          </button>
        </div>

        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="name"
              className="text-slate-400 text-xs"
              tick={{ fill: '#94a3b8' }}
            />
            <YAxis
              className="text-slate-400 text-xs"
              tick={{ fill: '#94a3b8' }}
              tickFormatter={(value) => value.toLocaleString()}
              domain={[0, 13000]}
              ticks={[0, 3000, 6000, 9000, 12000]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ color: '#94a3b8' }}
              formatter={(value) => (
                <span className="text-slate-300 text-sm">{value}</span>
              )}
            />
            <Bar
              dataKey="used"
              fill="#06b6d4"
              name="Used"
              radius={[6, 6, 0, 0]}
              isAnimationActive={true}
              animationDuration={1200}
              animationEasing="ease-in-out"
            />
            <Bar
              dataKey="capacity"
              fill="#475569"
              stroke="#64748b"
              strokeWidth={1}
              name="Total Capacity"
              radius={[6, 6, 0, 0]}
              isAnimationActive={true}
              animationDuration={1200}
              animationEasing="ease-in-out"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ============================================ */}
      {/* ZONE DETAIL MODAL */}
      {/* ============================================ */}
      {showZoneModal && selectedZone && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowZoneModal(false)}
        >
          <div
            className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">{selectedZone.name}</h2>
                <p className="text-sm text-slate-400">{selectedZone.subtitle}</p>
              </div>
              <button
                onClick={() => setShowZoneModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Utilization */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-slate-400">Utilization</span>
                  <span className="text-lg font-bold text-white">
                    {selectedZone.utilization}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${selectedZone.utilization}%`,
                      backgroundColor:
                        selectedZone.utilization >= 80
                          ? '#F59E0B'
                          : selectedZone.utilization >= 60
                          ? '#3B82F6'
                          : '#10B981',
                    }}
                  />
                </div>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                  <p className="text-xs text-slate-400">Used</p>
                  <p className="text-lg font-bold text-white">
                    {selectedZone.used.toLocaleString()}
                  </p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                  <p className="text-xs text-slate-400">Capacity</p>
                  <p className="text-lg font-bold text-white">
                    {selectedZone.capacity.toLocaleString()}
                  </p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                  <p className="text-xs text-slate-400">Racks</p>
                  <p className="text-lg font-bold text-white">
                    {selectedZone.racks}
                  </p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                  <p className="text-xs text-slate-400">Free Racks</p>
                  <p className="text-lg font-bold text-emerald-400">
                    {selectedZone.freeRacks}
                  </p>
                </div>
              </div>

              {/* Capacity Breakdown */}
              <div className="bg-slate-800/50 rounded-xl p-4">
                <h4 className="text-sm font-medium text-slate-300 mb-2">
                  Capacity Breakdown
                </h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Used</span>
                    <span className="font-medium text-white">
                      {Math.round((selectedZone.used / selectedZone.capacity) * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Available</span>
                    <span className="font-medium text-white">
                      {Math.round(
                        ((selectedZone.capacity - selectedZone.used) /
                          selectedZone.capacity) *
                          100
                      )}
                      %
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  onClick={() => setShowZoneModal(false)}
                  className="px-5 py-2.5 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                >
                  Close
                </button>
                <button className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 text-slate-950">
                  <Eye className="w-4 h-4" /> View Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Warehouse;
