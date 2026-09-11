import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Warehouse,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  FileText,
  Users,
  Truck,
  Brain,
  BarChart3,
  QrCode,
  ClipboardList,
  User,
  Bell,
} from 'lucide-react';
import logo from '../../assets/logo.png';

interface NavItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  hasDropdown?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'OPERATIONS',
    items: [
      { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', path: '/admin/dashboard' },
      { id: 'product-catalog', icon: Package, label: 'Product Catalog', path: '/admin/product-catalog' },
    ],
  },
  {
    title: 'WAREHOUSE MANAGEMENT',
    items: [
      {
        id: 'warehouse-parent',
        icon: Warehouse,
        label: 'Warehouse / Inventory',
        path: '/admin/inventory',
        hasDropdown: true,
      },
    ],
  },
  {
    title: 'PROCUREMENT & LOGISTICS',
    items: [
      { id: 'procurement', icon: ShoppingCart, label: 'Procurement', path: '/admin/procurement' },
      { id: 'purchase-orders', icon: FileText, label: 'Purchase Orders', path: '/admin/purchase-orders' },
      { id: 'barcode-center', icon: QrCode, label: 'Barcode Center', path: '/admin/barcode-center' },
      { id: 'suppliers', icon: Users, label: 'Suppliers', path: '/admin/suppliers' },
      { id: 'logistics', icon: Truck, label: 'Logistics (DTRS)', path: '/admin/logistics' },
      { id: 'order-management', icon: ClipboardList, label: 'Order Management', path: '/admin/order-management' },
    ],
  },
  {
    title: 'ANALYTICS & INSIGHTS',
    items: [
      { id: 'ai-demand-forecast', icon: Brain, label: 'AI Demand Forecasting', path: '/admin/ai-demand-forecasting' },
      { id: 'reports', icon: BarChart3, label: 'Reports', path: '/admin/reports' },
      { id: 'users', icon: Users, label: 'Users', path: '/admin/users' },
    ],
  },
  {
    title: 'ACCOUNT',
    items: [
      { id: 'notifications', icon: Bell, label: 'Notifications', path: '/admin/notifications' },
      { id: 'profile', icon: User, label: 'Profile', path: '/admin/profile' },
    ],
  },
];

const AdminSidebar = () => {
  const location = useLocation();

  const [isWarehouseOpen, setIsWarehouseOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const isPathActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  const linkClass = (active: boolean) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all text-sm border-l-2 ${
      active
        ? 'bg-cyan-500/10 text-cyan-400 border-l-cyan-400 font-semibold'
        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40 border-l-transparent'
    }`;

  const subLinkClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg border-l-2 px-3 py-2 text-xs font-medium transition-all ${
      isActive
        ? 'bg-cyan-500/10 text-cyan-400 border-l-cyan-400 font-semibold'
        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40 border-l-transparent'
    }`;

  return (
    <aside className="sidebar w-64 h-screen sticky top-0 flex flex-col justify-between overflow-hidden bg-[#090d16] border-r border-slate-800/80 text-slate-300">
      {/* HEADER */}
      <div className="flex items-center px-4 h-16 border-b border-slate-800 flex-shrink-0">
        <div className="w-9 h-9 min-w-[36px] bg-white rounded-lg flex items-center justify-center p-1 shadow-sm">
          <img src={logo} alt="Logo" className="w-full h-full object-contain" />
        </div>
        <div className="flex flex-col min-w-0 ml-3">
          <span className="text-sm font-bold text-white truncate">Archon Nell</span>
          <span className="text-[10px] font-medium tracking-wider text-slate-400 uppercase">ADMINISTRATOR</span>
        </div>
      </div>

      {/* NAVIGATION */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-4 [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {navGroups.map((group) => (
          <div key={group.title}>
            <h3 className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase px-3 mt-5 mb-2">
              {group.title}
            </h3>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.hasDropdown ? isPathActive(item.path) : isActive(item.path);

                if (item.hasDropdown) {
                  const isOpen = isWarehouseOpen;
                  const setIsOpen = setIsWarehouseOpen;
                  const isParentActive = isPathActive(item.path);

                  return (
                    <div key={item.id}>
                      <button
                        type="button"
                        onClick={() => setIsOpen(!isOpen)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all border-l-2 ${
                          isParentActive
                            ? 'bg-cyan-500/10 text-cyan-400 border-l-cyan-400 font-semibold'
                            : 'text-slate-400 hover:text-slate-100 border-l-transparent hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={`w-5 h-5 ${isParentActive ? 'drop-shadow-[0_0_6px_rgba(0,163,196,0.6)]' : ''}`} />
                          <span>{item.label}</span>
                        </div>
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {isOpen && (
                        <div className="pl-9 pr-2 py-1 space-y-1 border-l border-gray-700 ml-5 my-1">
                          <NavLink className={subLinkClass} to="/admin/inventory">Inventory</NavLink>
                          <NavLink className={subLinkClass} to="/admin/manage-locations">Manage Locations</NavLink>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <NavLink key={item.id} to={item.path} className={linkClass(active)}>
                    <Icon className={`w-5 h-5 ${active ? 'drop-shadow-[0_0_6px_rgba(0,163,196,0.6)]' : ''}`} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default AdminSidebar;
