import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
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
  ShoppingCart,
  X,
} from 'lucide-react';
import logo from '../../assets/logo.png';

const navGroups = [
  {
    title: 'OPERATIONS',
    items: [
      { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', path: '/plant-manager/dashboard' },
      { id: 'order-management', icon: ShoppingCart, label: 'Order Management', path: '/plant-manager/order-management' },
    ],
  },
  {
    title: 'PROCUREMENT',
    items: [
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

interface PlantManagerSidebarProps {
  onClose?: () => void;
}

const PlantManagerSidebar = ({ onClose }: PlantManagerSidebarProps) => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <aside className="sidebar sticky top-0 flex h-dvh w-64 flex-col justify-between overflow-hidden border-r border-slate-800/80 bg-[#090d16] text-slate-300 xl:h-screen">
      <div className="flex-shrink-0 h-16 px-4 flex items-center border-b border-slate-800">
        <div className="w-10 h-10 min-w-[40px] bg-white rounded-lg flex items-center justify-center p-1 shadow-sm">
          <img src={logo} alt="Archon Nell Incorporated" className="w-full h-full object-contain" />
        </div>
        <div className="flex flex-col min-w-0 ml-3">
          <span className="text-sm font-bold text-white truncate">Archon Nell</span>
          <span className="text-[10px] font-medium tracking-wider text-slate-400 uppercase">PLANT MANAGER</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 xl:hidden"
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
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
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all text-sm border-l-2 ${
                      active
                        ? 'bg-cyan-500/10 text-cyan-400 font-semibold border-l-cyan-400'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40 border-l-transparent'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${active ? 'drop-shadow-[0_0_6px_rgba(0,163,196,0.6)]' : ''}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default PlantManagerSidebar;
