// src/page/plant-manager/Reports.tsx
import React, { useState } from 'react';
import {
  FileText,
  Eye,
  Printer,
  Download,
  FileSpreadsheet,
  BarChart3,
  Clock,
  Calendar,
  ChevronRight,
  X,
  CheckCircle,
  RefreshCw,
  Package,
  Truck,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Filter,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  ChevronDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Sector,
} from 'recharts';

// ============================================
// TYPES
// ============================================

interface KpiData {
  label: string;
  value: string | number;
  subtitle: string;
  change: string;
  trend: 'up' | 'down';
  icon: React.ReactNode;
}

interface ReportCard {
  id: string;
  title: string;
  description: string;
  recordCount: string;
  icon: React.ReactNode;
}

interface RecentReport {
  id: string;
  name: string;
  category: string;
  dateGenerated: string;
  generatedBy: string;
  format: 'PDF' | 'Excel';
}

// ============================================
// MOCK DATA
// ============================================

const kpiData: KpiData[] = [
  {
    label: "Today's Deliveries",
    value: 12,
    subtitle: 'Deliveries received',
    change: '+20% vs yesterday',
    trend: 'up',
    icon: <Truck className="w-4 h-4 text-blue-400" />,
  },
  {
    label: "Today's Stock In",
    value: 1245,
    subtitle: 'Items received',
    change: '+18% vs yesterday',
    trend: 'up',
    icon: <ArrowUp className="w-4 h-4 text-emerald-400" />,
  },
  {
    label: "Today's Stock Out",
    value: 980,
    subtitle: 'Items released',
    change: '+15% vs yesterday',
    trend: 'up',
    icon: <ArrowDown className="w-4 h-4 text-rose-400" />,
  },
  {
    label: 'Pending QA',
    value: 7,
    subtitle: 'Deliveries pending',
    change: '-12% vs yesterday',
    trend: 'down',
    icon: <AlertCircle className="w-4 h-4 text-yellow-400" />,
  },
  {
    label: 'Pending Shipment',
    value: 14,
    subtitle: 'Shipments waiting',
    change: '-7% vs yesterday',
    trend: 'down',
    icon: <Package className="w-4 h-4 text-purple-400" />,
  },
  {
    label: 'Warehouse Utilization',
    value: '78%',
    subtitle: 'Overall utilization',
    change: '+9% vs yesterday',
    trend: 'up',
    icon: <BarChart3 className="w-4 h-4 text-cyan-400" />,
  },
];

const reportCards: ReportCard[] = [
  {
    id: '1',
    title: 'Inventory Report',
    description: 'Comprehensive inventory levels, valuation and aging.',
    recordCount: '1,284 records',
    icon: <Package className="w-5 h-5 text-blue-400" />,
  },
  {
    id: '2',
    title: 'Receiving Report',
    description: 'Delivery receiving summary, QA results and inspection.',
    recordCount: '654 records',
    icon: <Truck className="w-5 h-5 text-emerald-400" />,
  },
  {
    id: '3',
    title: 'Stock In Report',
    description: 'Items received into warehouse and stock in summary.',
    recordCount: '1,128 records',
    icon: <ArrowUp className="w-5 h-5 text-cyan-400" />,
  },
  {
    id: '4',
    title: 'Stock Out Report',
    description: 'Released items, orders fulfilled and stock out summary.',
    recordCount: '980 records',
    icon: <ArrowDown className="w-5 h-5 text-rose-400" />,
  },
  {
    id: '5',
    title: 'Shipment Report',
    description: 'Shipment performance, transit time and delivery status.',
    recordCount: '312 records',
    icon: <Truck className="w-5 h-5 text-purple-400" />,
  },
  {
    id: '6',
    title: 'Inventory Movement Report',
    description: 'All stock movements including in, out, transfer and adjustments.',
    recordCount: '2,560 records',
    icon: <BarChart3 className="w-5 h-5 text-indigo-400" />,
  },
  {
    id: '7',
    title: 'Warehouse Utilization Report',
    description: 'Warehouse capacity, occupancy and utilization analysis.',
    recordCount: '18 warehouses',
    icon: <BarChart3 className="w-5 h-5 text-yellow-400" />,
  },
  {
    id: '8',
    title: 'Low Stock Report',
    description: 'Items below minimum level and reorder suggestions.',
    recordCount: '215 records',
    icon: <AlertCircle className="w-5 h-5 text-amber-400" />,
  },
  {
    id: '9',
    title: 'Damage & Waste Report',
    description: 'Damaged, expired and disposed items summary.',
    recordCount: '56 records',
    icon: <X className="w-5 h-5 text-rose-400" />,
  },
  {
    id: '10',
    title: 'Order Fulfillment Report',
    description: 'Orders received, fulfilled, shipped and delivered.',
    recordCount: '432 records',
    icon: <CheckCircle className="w-5 h-5 text-emerald-400" />,
  },
];

const recentReports: RecentReport[] = [
  {
    id: '1',
    name: 'Stock Out Report-May 2025',
    category: 'Stock Out',
    dateGenerated: 'May 31, 2025 10:45 AM',
    generatedBy: 'Laysa',
    format: 'PDF',
  },
  {
    id: '2',
    name: 'Receiving Report-May 2025',
    category: 'Receiving',
    dateGenerated: 'May 31, 2025 09:30 AM',
    generatedBy: 'Laysa',
    format: 'Excel',
  },
  {
    id: '3',
    name: 'Shipment Report-May 2025',
    category: 'Shipment',
    dateGenerated: 'May 31, 2025 08:15 AM',
    generatedBy: 'Laysa',
    format: 'PDF',
  },
  {
    id: '4',
    name: 'Inventory Report-May 2025',
    category: 'Inventory',
    dateGenerated: 'May 31, 2025 07:00 AM',
    generatedBy: 'Laysa',
    format: 'Excel',
  },
];

// Chart mock data
const stockMovementData = [
  { date: 'May 1', stockIn: 1200, stockOut: 980 },
  { date: 'May 8', stockIn: 1500, stockOut: 1100 },
  { date: 'May 15', stockIn: 1300, stockOut: 1200 },
  { date: 'May 22', stockIn: 1800, stockOut: 1400 },
  { date: 'May 29', stockIn: 1600, stockOut: 1300 },
];

const weeklyData = [
  { week: 'Week1', stockIn: 3200, stockOut: 2800 },
  { week: 'Week2', stockIn: 3800, stockOut: 3100 },
  { week: 'Week3', stockIn: 4500, stockOut: 4200 },
  { week: 'Week4', stockIn: 3900, stockOut: 3500 },
  { week: 'Week5', stockIn: 4100, stockOut: 3800 },
];

const inventoryStatusData = [
  { name: 'Available', value: 7245, color: '#10b981' },
  { name: 'In Transit', value: 2150, color: '#3b82f6' },
  { name: 'Damaged', value: 420, color: '#ef4444' },
  { name: 'Expired', value: 1320, color: '#f59e0b' },
  { name: 'Reserved', value: 1425, color: '#8b5cf6' },
];

const warehouseCapacityData = [
  { name: 'Used Space', value: 7800, color: '#06b6d4' },
  { name: 'Free Space', value: 2200, color: '#1e293b' },
];

// ============================================
// HELPER COMPONENTS
// ============================================

const KpiCard: React.FC<{ data: KpiData }> = ({ data }) => {
  const trendIcon = data.trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />;
  const trendColor = data.trend === 'up' ? 'text-emerald-400' : 'text-rose-400';
  return (
    <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{data.label}</p>
          <p className="text-2xl font-bold text-white mt-1">{data.value}</p>
        </div>
        <div className="p-2 rounded-lg bg-slate-800/30 text-slate-400">{data.icon}</div>
      </div>
      <p className="text-xs text-slate-400 mt-1">{data.subtitle}</p>
      <p className={`text-xs font-medium mt-1 flex items-center gap-1 ${trendColor}`}>
        {trendIcon} {data.change}
      </p>
    </div>
  );
};

const ReportCard: React.FC<{ report: ReportCard }> = ({ report }) => {
  return (
    <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 flex flex-col hover:border-gray-600 transition-all">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-slate-800/30">{report.icon}</div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-white truncate">{report.title}</h4>
          <p className="text-xs text-slate-400">{report.recordCount}</p>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-2 flex-1">{report.description}</p>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button className="py-1.5 text-xs font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-1">
          <Eye className="w-3.5 h-3.5" /> Preview
        </button>
        <button className="py-1.5 text-xs font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-1">
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
        <button className="py-1.5 text-xs font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-1">
          <Download className="w-3.5 h-3.5" /> PDF
        </button>
        <button className="py-1.5 text-xs font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-1">
          <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
        </button>
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const Reports: React.FC = () => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [dateFilter, setDateFilter] = useState('May 2025');
  const [warehouseFilter, setWarehouseFilter] = useState('All');
  const [activeInventoryIndex, setActiveInventoryIndex] = useState(-1);
  const [activeWarehouseIndex, setActiveWarehouseIndex] = useState(-1);

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    );
  };

  // Filter reports (for table)
  const filteredReports = recentReports.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.category.toLowerCase().includes(search.toLowerCase()) ||
      r.generatedBy.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.5s ease-in-out forwards;
          opacity: 0;
        }
        .recharts-bar-rectangle {
          transition: transform 0.2s ease, filter 0.2s ease;
          transform-origin: center bottom;
        }
        .recharts-bar-rectangle:hover {
          transform: scale(1.03);
          filter: brightness(1.2) drop-shadow(0 0 4px rgba(59,130,246,0.5));
        }
      `}</style>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span>Plant Manager</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-100">Reports</span>
      </div>

      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-sm text-slate-400">
            Operational reporting for warehouse, inventory, receiving, shipping and stock activities.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-[#111827] border border-[#1f2937] rounded-xl px-3 py-2 text-sm text-slate-300">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span>{dateFilter}</span>
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </div>
          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="bg-[#111827] border border-[#1f2937] rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          >
            <option value="All">All Warehouses</option>
            <option value="Central Depot">Central Depot</option>
            <option value="Northgate">Northgate</option>
            <option value="Southpark">Southpark</option>
          </select>
          <button className="p-2 rounded-xl border border-[#1f2937] text-slate-400 hover:bg-slate-800/50 transition-colors">
            <Filter className="w-4 h-4" />
          </button>
          <button className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
            <Download className="w-4 h-4" /> Export All
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiData.map((kpi, idx) => (
          <KpiCard key={idx} data={kpi} />
        ))}
      </div>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock Movement Trend (Line Chart) */}
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 animate-fade-in transition-all duration-500 ease-in-out">
          <h3 className="text-sm font-semibold text-white mb-2">Stock Movement Trend (30 Days)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={stockMovementData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip
                cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '3 3' }}
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#1e293b',
                  color: '#fff',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="stockIn"
                stroke="#3b82f6"
                strokeWidth={2}
                name="Stock In"
                isAnimationActive={true}
                animationDuration={1200}
                activeDot={<circle r={6} strokeWidth={2} fill="#3b82f6" stroke="#fff" style={{ filter: 'drop-shadow(0 0 6px rgba(59,130,246,0.8))' }} />}
              />
              <Line
                type="monotone"
                dataKey="stockOut"
                stroke="#ef4444"
                strokeWidth={2}
                name="Stock Out"
                isAnimationActive={true}
                animationDuration={1200}
                activeDot={<circle r={6} strokeWidth={2} fill="#ef4444" stroke="#fff" style={{ filter: 'drop-shadow(0 0 6px rgba(239,68,68,0.8))' }} />}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Stock In vs Stock Out (Bar Chart) */}
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 animate-fade-in transition-all duration-500 ease-in-out">
          <h3 className="text-sm font-semibold text-white mb-2">Stock In vs Stock Out</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart key={`bar-chart-${warehouseFilter}-${dateFilter}`} data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="week" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#1e293b',
                  color: '#fff',
                  borderRadius: '8px',
                  transition: 'opacity 0.3s ease-in-out',
                }}
              />
              <Legend />
              <Bar dataKey="stockIn" fill="#3b82f6" name="Stock In" isAnimationActive={true} animationDuration={1200} animationEasing="ease-in-out" animationBegin={200} radius={[6, 6, 0, 0]} />
              <Bar dataKey="stockOut" fill="#ef4444" name="Stock Out" isAnimationActive={true} animationDuration={1200} animationEasing="ease-in-out" animationBegin={200} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Inventory Status Overview (Donut Chart) */}
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 animate-fade-in transition-all duration-500 ease-in-out">
          <h3 className="text-sm font-semibold text-white mb-2">Inventory Status Overview</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={inventoryStatusData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                dataKey="value"
                label={false}
                labelLine={false}
                isAnimationActive={true}
                animationBegin={100}
                animationDuration={1200}
                activeIndex={activeInventoryIndex}
                activeShape={renderActiveShape}
                onMouseEnter={(_: any, index: number) => setActiveInventoryIndex(index)}
                onMouseLeave={() => setActiveInventoryIndex(-1)}
              >
                {inventoryStatusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#111827" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#1e293b',
                  color: '#fff',
                  borderRadius: '8px',
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap justify-center gap-3 text-xs mt-2">
            {inventoryStatusData.map((item) => (
              <div key={item.name} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-slate-300">{item.name}</span>
                <span className="text-slate-400">({item.value})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Warehouse Capacity (Donut Chart) */}
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 animate-fade-in transition-all duration-500 ease-in-out">
          <h3 className="text-sm font-semibold text-white mb-2">Warehouse Capacity</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={warehouseCapacityData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                dataKey="value"
                label={false}
                labelLine={false}
                isAnimationActive={true}
                animationDuration={1400}
                activeIndex={activeWarehouseIndex}
                activeShape={renderActiveShape}
                onMouseEnter={(_: any, index: number) => setActiveWarehouseIndex(index)}
                onMouseLeave={() => setActiveWarehouseIndex(-1)}
              >
                {warehouseCapacityData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#111827" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#1e293b',
                  color: '#fff',
                  borderRadius: '8px',
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <div className="text-center text-sm mt-2">
            <span className="text-slate-400">Utilization: </span>
            <span className="text-white font-bold">78%</span>
            <span className="text-slate-400 ml-2">(Used: 7,800 sq. ft · Free: 2,200 sq. ft)</span>
          </div>
        </div>
      </div>

      {/* Report Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportCards.map((report) => (
          <ReportCard key={report.id} report={report} />
        ))}
      </div>

      {/* Bottom Section: Recent Reports Table & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Table */}
        <div className="lg:col-span-2 bg-[#111827] border border-[#1f2937] rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Recent Generated Reports</h3>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search reports..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-[#0f172a] border border-[#1f2937] rounded-lg pl-8 pr-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>
              <select className="bg-[#0f172a] border border-[#1f2937] rounded-lg px-2 py-1.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                <option>All Categories</option>
                <option>Stock Out</option>
                <option>Receiving</option>
                <option>Shipment</option>
                <option>Inventory</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0f172a] border-b border-[#1f2937]">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Report Name
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Category
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Date Generated
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Generated By
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Format
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((report) => (
                  <tr key={report.id} className="border-b border-[#1f2937] hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-2 text-white">{report.name}</td>
                    <td className="px-3 py-2 text-slate-300">{report.category}</td>
                    <td className="px-3 py-2 text-slate-300">{report.dateGenerated}</td>
                    <td className="px-3 py-2 text-slate-300">{report.generatedBy}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                          report.format === 'PDF'
                            ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                            : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                        }`}
                      >
                        {report.format}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                          <Download className="w-4 h-4" />
                        </button>
                        <button className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                          <Printer className="w-4 h-4" />
                        </button>
                        <button className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredReports.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-slate-400">
                      No reports found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Quick Actions & Notes */}
        <div className="space-y-4">
          <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Quick Actions</h3>
            <button className="w-full py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-2">
              <FileText className="w-4 h-4" /> Custom Report Builder
            </button>
            <button className="w-full py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" /> Schedule Report
            </button>
            <button className="w-full py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-2">
              <FileText className="w-4 h-4" /> Manage Report Templates
            </button>
            <button className="w-full py-2 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-2">
              <Edit className="w-4 h-4" /> Report Settings
            </button>
          </div>

          <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-white">Report Notes</h3>
            <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
              <li>All reports are based on real-time data.</li>
              <li>Data is refreshed every 15 minutes.</li>
              <li>For large datasets, export may take a few minutes.</li>
              <li>Available formats: PDF, Excel, CSV.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;