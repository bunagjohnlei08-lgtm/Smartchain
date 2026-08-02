import React, { useState } from 'react';
import ProductCatalog from './ProductCatalog';
import UserManagement from './userManagement';
import { InventoryList, ManageLocations, StockCounting } from './warehouse/InventoryList';
import Procurement from './Procurement';
import PurchaseOrders from './PurchaseOrders';
import Suppliers from './suppliers';
import Logistics from './logistics';
import AIDemandForecast from './AIDemandForecast';
import Reports from './reports';
import CompanySettings from './settings/CompanySettings';
import Categories from './settings/Categories';
import Brands from './settings/Brands';
import UnitsOfMeasure from './settings/UnitsOfMeasure';
import ApiKeys from './settings/ApiKeys';
import {
  Warehouse,
  FileText,
  Truck,
  AlertCircle,
  Plus,
  TrendingUp,
  TrendingDown,
  MoreVertical,
  Download,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend
} from 'recharts';
// Types
interface KPI {
  label: string;
  value: string | number;
  change?: string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}

interface PurchaseOrder {
  id: string;
  supplier: string;
  amount: string;
  status: 'Approved' | 'Pending' | 'Completed' | 'Cancelled';
  date: string;
}

interface InventoryItem {
  sku: string;
  name: string;
  warehouse: string;
  stock: number;
  safetyStock: number;
  status: 'Healthy' | 'Low Stock' | 'Critical' | 'Out of Stock';
}

// Mock Data
const kpiData: KPI[] = [
  {
    label: 'Warehouse Utilization',
    value: '68%',
    change: '+4.2% vs last week',
    icon: <Warehouse className="w-5 h-5 text-blue-400" />,
    trend: 'up'
  },
  {
    label: 'Open Purchase Orders',
    value: 23,
    subtitle: '6 awaiting approval',
    icon: <FileText className="w-5 h-5 text-blue-400" />,
    trend: 'neutral'
  },
  {
    label: 'Shipments In Transit',
    value: 14,
    subtitle: '2 delayed',
    icon: <Truck className="w-5 h-5 text-blue-400" />,
    trend: 'down'
  },
  {
    label: 'Low Stock Items',
    value: 18,
    subtitle: 'Reorder recommended',
    icon: <AlertCircle className="w-5 h-5 text-blue-400" />,
    trend: 'up'
  }
];

const recentOrders: PurchaseOrder[] = [
  { id: 'PO-9021', supplier: 'Northgate Trading Co.', amount: 'P184,500', status: 'Approved', date: '2026-07-23' },
  { id: 'PO-9022', supplier: 'GreenLeaf Organics', amount: 'P62,400', status: 'Pending', date: '2026-07-23' },
  { id: 'PO-9023', supplier: 'Metro Textile Mills', amount: 'P428,000', status: 'Completed', date: '2026-07-22' },
  { id: 'PO-9024', supplier: 'Peak Health Supply', amount: 'P96,700', status: 'Approved', date: '2026-07-22' },
  { id: 'PO-9025', supplier: 'Bayview Home Goods', amount: 'P18,900', status: 'Cancelled', date: '2026-07-21' }
];

const inventoryItems: InventoryItem[] = [
  { sku: 'SKU-001', name: 'Organic Green Tea', warehouse: 'Northgate', stock: 450, safetyStock: 100, status: 'Healthy' },
  { sku: 'SKU-002', name: 'Stainless Steel Bottle', warehouse: 'Eastside', stock: 120, safetyStock: 150, status: 'Low Stock' },
  { sku: 'SKU-003', name: 'Cotton T-Shirt', warehouse: 'Southpark', stock: 45, safetyStock: 80, status: 'Critical' },
  { sku: 'SKU-004', name: 'Wireless Earbuds', warehouse: 'Northgate', stock: 0, safetyStock: 50, status: 'Out of Stock' }
];

const chartData = [
  { name: 'Mon', inbound: 4000, outbound: 2400, capacity: 65, forecast: 4200 },
  { name: 'Tue', inbound: 3000, outbound: 1398, capacity: 72, forecast: 3800 },
  { name: 'Wed', inbound: 2000, outbound: 3800, capacity: 58, forecast: 3500 },
  { name: 'Thu', inbound: 2780, outbound: 3908, capacity: 70, forecast: 4100 },
  { name: 'Fri', inbound: 1890, outbound: 4800, capacity: 75, forecast: 3900 },
  { name: 'Sat', inbound: 2390, outbound: 3800, capacity: 62, forecast: 3600 },
  { name: 'Sun', inbound: 3490, outbound: 4300, capacity: 68, forecast: 4400 }
];

const statusColors = {
  'Approved': 'text-green-400 bg-green-400/10 border-green-400/20',
  'Pending': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  'Completed': 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  'Cancelled': 'text-red-400 bg-red-400/10 border-red-400/20'
};

const statusBadgeColors = {
  'Healthy': 'bg-green-400/10 text-green-400 border-green-400/20',
  'Low Stock': 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20',
  'Critical': 'bg-orange-400/10 text-orange-400 border-orange-400/20',
  'Out of Stock': 'bg-red-400/10 text-red-400 border-red-400/20'
};

const KpiCard: React.FC<{ data: KPI }> = ({ data }) => {
  const getTrendColor = () => {
    if (data.trend === 'up') return 'text-green-400';
    if (data.trend === 'down') return 'text-red-400';
    return 'text-[#94A3B8]';
  };

  return (
    <div className="bg-[#0F172A] border border-slate-800 text-white rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex items-start justify-between">
        <div className="p-2 bg-blue-500/10 rounded-lg">{data.icon}</div>
        <button className="text-slate-400 hover:text-white transition-colors">
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-4">
        <p className="text-slate-400 text-sm">{data.label}</p>
        <p className="text-xl font-bold text-white mt-1">{data.value}</p>
        {data.change && (
          <p className={`text-sm mt-1 ${getTrendColor()} flex items-center gap-1`}>
            {data.trend === 'up' && <TrendingUp className="w-3 h-3" />}
            {data.trend === 'down' && <TrendingDown className="w-3 h-3" />}
            {data.change}
          </p>
        )}
        {data.subtitle && (
          <p className="text-sm text-slate-400 mt-1">{data.subtitle}</p>
        )}
      </div>
    </div>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors = statusColors[status as keyof typeof statusColors] || 'text-gray-400 bg-gray-400/10';
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${colors}`}>
      {status}
    </span>
  );
};

const InventoryStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors = statusBadgeColors[status as keyof typeof statusBadgeColors] || 'text-gray-400 bg-gray-400/10';
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${colors}`}>
      {status}
    </span>
  );
};

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0F172A] border border-slate-800 text-white rounded-xl p-3 shadow-sm">
        <p className="text-white text-sm font-medium">{label}</p>
        {payload.map((item: any, idx: number) => (
          <p key={idx} className="text-sm" style={{ color: item.color }}>
            {item.name}: {item.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Main Dashboard Page
const DashboardPage: React.FC = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');

  if (currentPage === 'catalog') {
    return <ProductCatalog />;
  }

  if (currentPage === 'userManagement') {
    return <UserManagement />;
  }

  if (currentPage === 'inventory-list') {
    return <InventoryList />;
  }

  if (currentPage === 'manage-locations') {
    return <ManageLocations />;
  }

  if (currentPage === 'stock-counting') {
    return <StockCounting />;
  }

  if (currentPage === 'company-settings') {
    return <CompanySettings />;
  }

  if (currentPage === 'categories') {
    return <Categories />;
  }

  if (currentPage === 'brands') {
    return <Brands />;
  }

  if (currentPage === 'units-of-measure') {
    return <UnitsOfMeasure />;
  }

  if (currentPage === 'api-keys') {
    return <ApiKeys />;
  }

  if (currentPage === 'procurement') {
    return <Procurement />;
  }

  if (currentPage === 'purchase-orders') {
    return <PurchaseOrders />;
  }

  if (currentPage === 'suppliers') {
    return <Suppliers />;
  }

  if (currentPage === 'logistics') {
    return <Logistics />;
  }

  if (currentPage === 'forecast') {
    return <AIDemandForecast />;
  }

  if (currentPage === 'reports') {
    return <Reports />;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Operations Overview</h1>
        <p className="text-slate-400 mt-1">Real-time supply chain insights and warehouse analytics.</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-4 gap-6">
        {kpiData.map((kpi, idx) => (
          <KpiCard key={idx} data={kpi} />
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-[#0F172A] border border-slate-800 text-white rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-white font-medium">Inventory Movement</h3>
              <p className="text-slate-400 text-sm">Inbound vs Outbound</p>
            </div>
            <button className="text-[#64748B] hover:text-white transition-colors">
              <Download className="w-4 h-4" />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="inboundGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="outboundGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#22C55E" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#263244" />
              <XAxis dataKey="name" stroke="#64748B" />
              <YAxis stroke="#64748B" />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="inbound" stroke="#3B82F6" fill="url(#inboundGradient)" strokeWidth={2} />
              <Area type="monotone" dataKey="outbound" stroke="#22C55E" fill="url(#outboundGradient)" strokeWidth={2} />
              <Legend />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#0F172A] border border-slate-800 text-white rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-white font-medium">AI Demand Forecast</h3>
              <p className="text-slate-400 text-sm">7-day projection</p>
            </div>
            <button className="text-[#64748B] hover:text-white transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#263244" />
              <XAxis dataKey="name" stroke="#64748B" />
              <YAxis stroke="#64748B" />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="forecast" stroke="#F59E0B" strokeWidth={2} dot={{ fill: '#F59E0B', r: 4 }} />
              <Line type="monotone" dataKey="inbound" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6', r: 4 }} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-[#0F172A] border border-slate-800 text-white rounded-xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-white font-medium">Recent Purchase Orders</h3>
              <p className="text-slate-400 text-sm">Latest activity across suppliers</p>
            </div>
            <button className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
              View all <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-800">
                <tr className="text-left text-slate-400 text-xs uppercase tracking-wider">
                  <th className="px-6 py-3 font-medium">PO Number</th>
                  <th className="px-6 py-3 font-medium">Supplier</th>
                  <th className="px-6 py-3 font-medium">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-3 text-white text-sm font-medium">{order.id}</td>
                    <td className="px-6 py-3 text-slate-400 text-sm">{order.supplier}</td>
                    <td className="px-6 py-3 text-white text-sm">{order.amount}</td>
                    <td className="px-6 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-[#0F172A] border border-slate-800 text-white rounded-xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-white font-medium">Inventory Status</h3>
              <p className="text-slate-400 text-sm">Current stock levels</p>
            </div>
            <button className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
              Manage <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-800">
                <tr className="text-left text-slate-400 text-xs uppercase tracking-wider">
                  <th className="px-6 py-3 font-medium">SKU</th>
                  <th className="px-6 py-3 font-medium">Product</th>
                  <th className="px-6 py-3 font-medium">Stock</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                 {inventoryItems.map((item) => (
                   <tr key={item.sku} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                     <td className="px-6 py-3 text-white text-sm font-mono">{item.sku}</td>
                     <td className="px-6 py-3 text-slate-400 text-sm">{item.name}</td>
                     <td className="px-6 py-3 text-white text-sm">{item.stock}</td>
                    <td className="px-6 py-3">
                      <InventoryStatusBadge status={item.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-white font-medium mb-4">Quick Actions</h3>
        <div className="grid grid-cols-4 gap-4">
          {['Receive Inventory', 'Create Purchase Order', 'Transfer Stock', 'Generate Reports'].map((action) => (
            <button key={action} className="bg-[#0F172A] border border-slate-800 text-white rounded-xl p-4 text-center hover:shadow-md transition-all duration-200 group">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 mx-auto flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                <Plus className="w-5 h-5 text-blue-400" />
              </div>
              <p className="text-white text-sm mt-2">{action}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-slate-400 text-xs py-4 border-t border-slate-800">
        © 2026 SmartChain. All rights reserved. Powered by AI.
      </div>
    </div>
  );
};

export default DashboardPage;
