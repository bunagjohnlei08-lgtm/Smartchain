import React, { useState, useEffect } from 'react';
import ProductCatalog from './ProductCatalog';
import UserManagement from './userManagement';
import { InventoryList, ManageLocations, StockCounting } from './warehouse/InventoryList';
import CompanySettings from './settings/CompanySettings';
import Categories from './settings/Categories';
import Brands from './settings/Brands';
import UnitsOfMeasure from './settings/UnitsOfMeasure';
import ApiKeys from './settings/ApiKeys';
import {
  LayoutDashboard,
  Package,
  Warehouse,
  ShoppingCart,
  FileText,
  Truck,
  Brain,
  Users,
  FileBarChart,
  Settings,
  User,
  Bell,
  LogOut,
  ChevronRight,
  Plus,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  MoreVertical,
  Download,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';

interface TopNavProps {
  breadcrumb: string;
}

const TopNav: React.FC<TopNavProps> = ({ breadcrumb }) => (
  <header className="sticky top-0 z-20 border-b border-[#263244] bg-[#0B1220]/95 backdrop-blur-sm">
    <div className="flex items-center justify-between px-8 py-4">
      <div>
        <p className="text-sm text-[#64748B]">Dashboard</p>
        <h2 className="text-xl font-semibold text-white">{breadcrumb}</h2>
      </div>
      <div className="flex items-center gap-3">
        <button className="rounded-lg border border-[#263244] px-4 py-2 text-sm text-[#94A3B8] hover:bg-[#1E293B] hover:text-white transition">
          Notifications
        </button>
        <button className="rounded-lg border border-[#263244] px-4 py-2 text-sm text-[#94A3B8] hover:bg-[#1E293B] hover:text-white transition">
          Profile
        </button>
      </div>
    </div>
  </header>
);
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

// Sidebar with fixed position and settings submenu
const Sidebar: React.FC<{ activePage: string; onNavigate: (page: string) => void }> = ({ activePage, onNavigate }) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [warehouseOpen, setWarehouseOpen] = useState(false);

  useEffect(() => {
    const warehousePages = ['inventory-list', 'manage-locations', 'stock-counting'];
    const settingsPages = ['company-settings', 'categories', 'brands', 'units-of-measure', 'api-keys'];
    setWarehouseOpen(warehousePages.includes(activePage));
    setSettingsOpen(settingsPages.includes(activePage));
  }, [activePage]);

  const isParentActive = (itemId: string) => {
    if (itemId === 'warehouse') return ['inventory-list', 'manage-locations', 'stock-counting'].includes(activePage);
    if (itemId === 'settings') return ['company-settings', 'categories', 'brands', 'units-of-measure', 'api-keys'].includes(activePage);
    return activePage === itemId;
  };

  const navItems = [
    { id: 'dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Dashboard' },
    { id: 'catalog', icon: <Package className="w-5 h-5" />, label: 'Product Catalog' },
    {
      id: 'warehouse',
      icon: <Warehouse className="w-5 h-5" />,
      label: 'Warehouse',
      subItems: ['Inventory List', 'Manage Locations', 'Stock Counting']
    },
    { id: 'procurement', icon: <ShoppingCart className="w-5 h-5" />, label: 'Procurement' },
    { id: 'purchase-orders', icon: <FileText className="w-5 h-5" />, label: 'Purchase Orders' },
    { id: 'suppliers', icon: <Users className="w-5 h-5" />, label: 'Suppliers' },
    { id: 'logistics', icon: <Truck className="w-5 h-5" />, label: 'Logistics (DTRS)' },
    { id: 'forecast', icon: <Brain className="w-5 h-5" />, label: 'AI Demand Forecasting' },
    { id: 'reports', icon: <FileBarChart className="w-5 h-5" />, label: 'Reports' },
    { id: 'userManagement', icon: <Users className="w-5 h-5" />, label: 'Users' },
    { 
      id: 'settings', 
      icon: <Settings className="w-5 h-5" />,
      label: 'Settings',
      subItems: ['Company Settings', 'Categories', 'Brands', 'Units of Measure', 'API Keys']
    }
  ];

  return (
    <div className="w-64 min-h-screen bg-[#111827] border-r border-[#263244] flex flex-col fixed left-0 top-0 bottom-0 overflow-y-auto">
      <div className="p-6 border-b border-[#263244] sticky top-0 bg-[#111827] z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">SC</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-lg">SmartChain</h1>
            <p className="text-[#64748B] text-xs">SUPPLYOS</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <div key={item.id}>
            <button
              onClick={() => {
                if (item.id === 'settings') {
                  setSettingsOpen(!settingsOpen);
                } else if (item.id === 'warehouse') {
                  setWarehouseOpen(!warehouseOpen);
                } else {
                  onNavigate(item.id);
                }
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                isParentActive(item.id)
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  : 'text-[#94A3B8] hover:bg-[#1E293B] hover:text-white'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.id === 'settings' && (
                <ChevronDown className={`w-4 h-4 ml-auto transition-transform duration-200 ${settingsOpen ? 'rotate-180' : ''}`} />
              )}
              {item.id === 'warehouse' && (
                <ChevronDown className={`w-4 h-4 ml-auto transition-transform duration-200 ${warehouseOpen ? 'rotate-180' : ''}`} />
              )}
              {isParentActive(item.id) && item.id !== 'settings' && item.id !== 'warehouse' && (
                <ChevronRight className="w-4 h-4 ml-auto text-blue-400" />
              )}
            </button>
            
            {/* Settings Submenu */}
            {item.id === 'settings' && settingsOpen && item.subItems && (
              <div className="ml-6 mt-1 space-y-1 border-l border-[#263244] pl-3">
                {item.subItems.map((subItem, idx) => {
                  const pageId = ['company-settings', 'categories', 'brands', 'units-of-measure', 'api-keys'][idx];
                  return (
                    <button
                      key={subItem}
                      onClick={() => onNavigate(pageId)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                        activePage === pageId
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : 'text-[#94A3B8] hover:bg-[#1E293B] hover:text-white'
                      }`}
                    >
                      {subItem}
                    </button>
                  );
                })}
              </div>
            )}

            {item.id === 'warehouse' && warehouseOpen && item.subItems && (
              <div className="ml-6 mt-1 space-y-1 border-l border-[#263244] pl-3">
                {item.subItems.map((subItem, idx) => {
                  const pageId = ['inventory-list', 'manage-locations', 'stock-counting'][idx];
                  return (
                    <button
                      key={subItem}
                      onClick={() => onNavigate(pageId)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                        activePage === pageId
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : 'text-[#94A3B8] hover:bg-[#1E293B] hover:text-white'
                      }`}
                    >
                      {subItem}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-[#263244] space-y-2 sticky bottom-0 bg-[#111827]">
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#94A3B8] hover:bg-[#1E293B] hover:text-white transition-all">
          <User className="w-5 h-5" />
          <span>John Doe</span>
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#94A3B8] hover:bg-[#1E293B] hover:text-white transition-all">
          <Bell className="w-5 h-5" />
          <span>Notifications</span>
          <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">3</span>
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#94A3B8] hover:bg-[#1E293B] hover:text-red-400 transition-all">
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
};

const KpiCard: React.FC<{ data: KPI }> = ({ data }) => {
  const getTrendColor = () => {
    if (data.trend === 'up') return 'text-green-400';
    if (data.trend === 'down') return 'text-red-400';
    return 'text-[#94A3B8]';
  };

  return (
    <div className="bg-[#162033] border border-[#263244] rounded-2xl p-6 hover:border-[#3B82F6]/30 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/5">
      <div className="flex items-start justify-between">
        <div className="p-2 bg-blue-500/10 rounded-lg">{data.icon}</div>
        <button className="text-[#64748B] hover:text-white transition-colors">
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-4">
        <p className="text-[#94A3B8] text-sm">{data.label}</p>
        <p className="text-2xl font-bold text-white mt-1">{data.value}</p>
        {data.change && (
          <p className={`text-sm mt-1 ${getTrendColor()} flex items-center gap-1`}>
            {data.trend === 'up' && <TrendingUp className="w-3 h-3" />}
            {data.trend === 'down' && <TrendingDown className="w-3 h-3" />}
            {data.change}
          </p>
        )}
        {data.subtitle && (
          <p className="text-sm text-[#64748B] mt-1">{data.subtitle}</p>
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
      <div className="bg-[#162033] border border-[#263244] rounded-lg p-3 shadow-xl">
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

const breadcrumbMap: Record<string, string> = {
     dashboard: 'Dashboard',
     catalog: 'Inventory / Product Catalog',
     'inventory-list': 'Warehouse / Inventory List',
     'manage-locations': 'Warehouse / Manage Locations',
     'stock-counting': 'Warehouse / Stock Counting',
     procurement: 'Procurement',
     'purchase-orders': 'Purchase Orders',
     suppliers: 'Suppliers',
     logistics: 'Logistics (DTRS)',
     forecast: 'AI Demand Forecasting',
     reports: 'Reports',
     userManagement: 'Users',
     settings: 'Settings',
     'company-settings': 'Settings / Company Settings',
     categories: 'Settings / Categories',
     brands: 'Settings / Brands',
     'units-of-measure': 'Settings / Units of Measure',
     'api-keys': 'Settings / API Keys',
   };

  const breadcrumb = breadcrumbMap[currentPage] || 'Dashboard';

// If we're on the catalog page, show the product catalog
   if (currentPage === 'catalog') {
     return (
       <div className="flex min-h-screen bg-[#0B1220] text-white font-sans">
         <Sidebar activePage={currentPage} onNavigate={setCurrentPage} />
         <div className="flex-1 ml-64">
           <TopNav breadcrumb={breadcrumb} />
           <ProductCatalog />
         </div>
       </div>
     );
   }

    // If we're on the user management page, show the user management
    if (currentPage === 'userManagement') {
      return (
        <div className="flex min-h-screen bg-[#0B1220] text-white font-sans">
          <Sidebar activePage={currentPage} onNavigate={setCurrentPage} />
          <div className="flex-1 ml-64">
            <TopNav breadcrumb={breadcrumb} />
            <UserManagement />
          </div>
        </div>
      );
    }

    if (currentPage === 'inventory-list') {
      return (
        <div className="flex min-h-screen bg-[#0B1220] text-white font-sans">
          <Sidebar activePage={currentPage} onNavigate={setCurrentPage} />
          <div className="flex-1 ml-64">
            <TopNav breadcrumb={breadcrumb} />
            <InventoryList />
          </div>
        </div>
      );
    }

    if (currentPage === 'manage-locations') {
      return (
        <div className="flex min-h-screen bg-[#0B1220] text-white font-sans">
          <Sidebar activePage={currentPage} onNavigate={setCurrentPage} />
          <div className="flex-1 ml-64">
            <TopNav breadcrumb={breadcrumb} />
            <ManageLocations />
          </div>
        </div>
      );
    }

    if (currentPage === 'stock-counting') {
      return (
        <div className="flex min-h-screen bg-[#0B1220] text-white font-sans">
          <Sidebar activePage={currentPage} onNavigate={setCurrentPage} />
          <div className="flex-1 ml-64">
            <TopNav breadcrumb={breadcrumb} />
            <StockCounting />
          </div>
        </div>
      );
    }

    if (currentPage === 'company-settings') {
      return (
        <div className="flex min-h-screen bg-[#0B1220] text-white font-sans">
          <Sidebar activePage={currentPage} onNavigate={setCurrentPage} />
          <div className="flex-1 ml-64">
            <TopNav breadcrumb={breadcrumb} />
            <CompanySettings />
          </div>
        </div>
      );
    }

    if (currentPage === 'categories') {
      return (
        <div className="flex min-h-screen bg-[#0B1220] text-white font-sans">
          <Sidebar activePage={currentPage} onNavigate={setCurrentPage} />
          <div className="flex-1 ml-64">
            <TopNav breadcrumb={breadcrumb} />
            <Categories />
          </div>
        </div>
      );
    }

    if (currentPage === 'brands') {
      return (
        <div className="flex min-h-screen bg-[#0B1220] text-white font-sans">
          <Sidebar activePage={currentPage} onNavigate={setCurrentPage} />
          <div className="flex-1 ml-64">
            <TopNav breadcrumb={breadcrumb} />
            <Brands />
          </div>
        </div>
      );
    }

    if (currentPage === 'units-of-measure') {
      return (
        <div className="flex min-h-screen bg-[#0B1220] text-white font-sans">
          <Sidebar activePage={currentPage} onNavigate={setCurrentPage} />
          <div className="flex-1 ml-64">
            <TopNav breadcrumb={breadcrumb} />
            <UnitsOfMeasure />
          </div>
        </div>
      );
    }

    if (currentPage === 'api-keys') {
      return (
        <div className="flex min-h-screen bg-[#0B1220] text-white font-sans">
          <Sidebar activePage={currentPage} onNavigate={setCurrentPage} />
          <div className="flex-1 ml-64">
            <TopNav breadcrumb={breadcrumb} />
            <ApiKeys />
          </div>
        </div>
      );
    }

    // Dashboard view
  return (
    <div className="flex min-h-screen bg-[#0B1220] text-white font-sans">
      <Sidebar activePage={currentPage} onNavigate={setCurrentPage} />

      <div className="flex-1 ml-64 flex flex-col overflow-hidden">
        <TopNav breadcrumb={breadcrumb} />

        <main className="flex-1 overflow-y-auto p-8 space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-white">Operations Overview</h1>
            <p className="text-[#94A3B8] mt-1">Real-time supply chain insights and warehouse analytics.</p>
          </div>

          {/* KPI Grid */}
          <div className="grid grid-cols-4 gap-6">
            {kpiData.map((kpi, idx) => (
              <KpiCard key={idx} data={kpi} />
            ))}
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-[#162033] border border-[#263244] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-white font-medium">Inventory Movement</h3>
                  <p className="text-[#64748B] text-sm">Inbound vs Outbound</p>
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

            <div className="bg-[#162033] border border-[#263244] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-white font-medium">AI Demand Forecast</h3>
                  <p className="text-[#64748B] text-sm">7-day projection</p>
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
            <div className="bg-[#162033] border border-[#263244] rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-[#263244] flex items-center justify-between">
                <div>
                  <h3 className="text-white font-medium">Recent Purchase Orders</h3>
                  <p className="text-[#64748B] text-sm">Latest activity across suppliers</p>
                </div>
                <button className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
                  View all <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-[#263244]">
                    <tr className="text-left text-[#64748B] text-xs uppercase tracking-wider">
                      <th className="px-6 py-3 font-medium">PO Number</th>
                      <th className="px-6 py-3 font-medium">Supplier</th>
                      <th className="px-6 py-3 font-medium">Amount</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="border-b border-[#1E293B] hover:bg-[#1E293B]/50 transition-colors">
                        <td className="px-6 py-3 text-white text-sm font-medium">{order.id}</td>
                        <td className="px-6 py-3 text-[#94A3B8] text-sm">{order.supplier}</td>
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

            <div className="bg-[#162033] border border-[#263244] rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-[#263244] flex items-center justify-between">
                <div>
                  <h3 className="text-white font-medium">Inventory Status</h3>
                  <p className="text-[#64748B] text-sm">Current stock levels</p>
                </div>
                <button className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
                  Manage <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-[#263244]">
                    <tr className="text-left text-[#64748B] text-xs uppercase tracking-wider">
                      <th className="px-6 py-3 font-medium">SKU</th>
                      <th className="px-6 py-3 font-medium">Product</th>
                      <th className="px-6 py-3 font-medium">Stock</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryItems.map((item) => (
                      <tr key={item.sku} className="border-b border-[#1E293B] hover:bg-[#1E293B]/50 transition-colors">
                        <td className="px-6 py-3 text-white text-sm font-mono">{item.sku}</td>
                        <td className="px-6 py-3 text-[#94A3B8] text-sm">{item.name}</td>
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
                <button key={action} className="bg-[#162033] border border-[#263244] rounded-xl p-4 text-center hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 group">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 mx-auto flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                    <Plus className="w-5 h-5 text-blue-400" />
                  </div>
                  <p className="text-white text-sm mt-2">{action}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-[#64748B] text-xs py-4 border-t border-[#263244]">
            © 2026 SmartChain. All rights reserved. Powered by AI.
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardPage;