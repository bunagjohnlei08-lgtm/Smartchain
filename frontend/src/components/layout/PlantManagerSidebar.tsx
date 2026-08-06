import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  FileText,
  Boxes,
  Warehouse,
  Box,
  ArrowDownToLine,
  ArrowUpFromLine,
  Truck,
  Inbox,
  BarChart3,
  Sparkles,
  Bell,
  User,
} from 'lucide-react';

const navGroups = [
  {
    title: 'OPERATIONS',
    items: [
      { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', path: '/plant-manager/dashboard' },
      { id: 'products', icon: Package, label: 'Products', path: '/plant-manager/products' },
    ],
  },
  {
    title: 'PROCUREMENT',
    items: [
      { id: 'purchase-orders', icon: FileText, label: 'Purchase Orders', path: '/plant-manager/purchase-orders' },
      { id: 'procurement', icon: Boxes, label: 'Procurement', path: '/plant-manager/procurement' },
    ],
  },
  {
    title: 'WAREHOUSE',
    items: [
      { id: 'warehouse', icon: Warehouse, label: 'Warehouse', path: '/plant-manager/warehouse' },
      { id: 'inventory', icon: Box, label: 'Inventory', path: '/plant-manager/inventory' },
      { id: 'stock-in', icon: ArrowDownToLine, label: 'Stock In', path: '/plant-manager/stock-in' },
      { id: 'stock-out', icon: ArrowUpFromLine, label: 'Stock Out', path: '/plant-manager/stock-out' },
      { id: 'shipment', icon: Truck, label: 'Shipment', path: '/plant-manager/shipment' },
      { id: 'receiving', icon: Inbox, label: 'Receiving', path: '/plant-manager/receiving' },
    ],
  },
  {
    title: 'INSIGHTS',
    items: [
      { id: 'reports', icon: BarChart3, label: 'Reports', path: '/plant-manager/reports' },
      { id: 'forecast', icon: Sparkles, label: 'AI Forecast', path: '/plant-manager/forecast' },
    ],
  },
  {
    title: 'ACCOUNT',
    items: [
      { id: 'notifications', icon: Bell, label: 'Notifications', path: '/plant-manager/notifications' },
      { id: 'profile', icon: User, label: 'Profile', path: '/plant-manager/profile' },
    ],
  },
];

const PlantManagerSidebar = () => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="w-64 h-screen sticky top-0 flex flex-col justify-between overflow-hidden bg-[#090d16] border-r border-slate-800/80 text-slate-300">
      <div className="flex-shrink-0 h-16 px-6 flex items-center border-b border-slate-800/80">
        <div className="flex items-center gap-3.5">
          <div className="bg-[#00a3c4]/10 border border-[#00a3c4]/30 text-[#00a3c4] p-2.5 rounded-2xl flex items-center justify-center">
            <Warehouse className="w-5 h-5" />
          </div>
          <div className="flex flex-col justify-center">
            <span className="font-bold text-white text-base tracking-tight leading-none">SmartChain</span>
            <span className="text-[10px] font-semibold text-slate-500 tracking-wider uppercase mt-1">Plant Manager</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto space-y-4 p-4 [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {navGroups.map((group) => (
          <div key={group.title}>
            <h3 className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase px-3 mt-5 mb-2">
              {group.title}
            </h3>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all text-sm ${
                      active
                        ? 'bg-[#0b2234] text-[#00a3c4] border border-[#00a3c4]/40 font-medium'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${active && item.id === 'forecast' ? 'drop-shadow-[0_0_6px_rgba(0,163,196,0.6)]' : ''}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
};

export default PlantManagerSidebar;
