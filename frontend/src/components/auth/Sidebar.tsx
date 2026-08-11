import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import logo from '../../assets/logo.jpg';
import {
  LayoutDashboard,
  Package,
  Tag,
  Truck,
  FileBarChart,
  Brain,
  Bell,
  User,
  Warehouse,
  ShoppingCart,
  FileText,
  Users,
  ChevronDown,
} from 'lucide-react';

type SubItem = { label: string; path: string };

interface NavItem {
  id: string;
  icon?: React.ReactNode;
  label: string;
  path?: string;
  subItems?: SubItem[];
}

const sectionGroups: { title: string; items: NavItem[] }[] = [
  {
    title: 'OPERATIONS',
    items: [
      {
        id: 'dashboard',
        icon: <LayoutDashboard className="w-5 h-5" />,
        label: 'Dashboard',
        path: '/admin/dashboard',
      },
      {
        id: 'products',
        icon: <Package className="w-5 h-5" />,
        label: 'Products',
        path: '/admin/products',
      },
      {
        id: 'categories',
        icon: <Tag className="w-5 h-5" />,
        label: 'Categories',
        path: '/admin/categories',
      },
    ],
  },
  {
    title: 'PROCUREMENT',
    items: [
      {
        id: 'suppliers',
        icon: <Users className="w-5 h-5" />,
        label: 'Suppliers',
        path: '/admin/suppliers',
      },
      {
        id: 'purchase-orders',
        icon: <FileText className="w-5 h-5" />,
        label: 'Purchase Orders',
        path: '/admin/purchase-orders',
      },
      {
        id: 'procurement',
        icon: <ShoppingCart className="w-5 h-5" />,
        label: 'Procurement',
        path: '/admin/procurement',
      },
    ],
  },
  {
    title: 'WAREHOUSE',
    items: [
      {
        id: 'warehouse',
        icon: <Warehouse className="w-5 h-5" />,
        label: 'Warehouse',
        subItems: [
          { label: 'Inventory', path: '/admin/inventory' },
          { label: 'Stock In', path: '/admin/stock-in' },
          { label: 'Stock Out', path: '/admin/stock-out' },
        ],
      },
      {
        id: 'shipment',
        icon: <Truck className="w-5 h-5" />,
        label: 'Shipment',
        path: '/admin/shipment',
      },
    ],
  },
  {
    title: 'INSIGHTS',
    items: [
      {
        id: 'reports',
        icon: <FileBarChart className="w-5 h-5" />,
        label: 'Reports',
        path: '/admin/reports',
      },
      {
        id: 'forecast',
        icon: <Brain className="w-5 h-5" />,
        label: 'AI Forecast',
        path: '/admin/forecast',
      },
    ],
  },
  {
    title: 'ACCOUNT',
    items: [
      {
        id: 'notifications',
        icon: <Bell className="w-5 h-5" />,
        label: 'Notifications',
        path: '/admin/notifications',
      },
      {
        id: 'profile',
        icon: <User className="w-5 h-5" />,
        label: 'Profile',
        path: '/admin/profile',
      },
    ],
  },
];

const Sidebar = () => {
  const [warehouseOpen, setWarehouseOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const warehousePaths = ['/admin/inventory', '/admin/stock-in', '/admin/stock-out'];
    setWarehouseOpen(warehousePaths.includes(location.pathname));
  }, [location.pathname]);

  const isParentActive = (path?: string, subItems?: SubItem[]) => {
    if (subItems) {
      return subItems.some((sub) => location.pathname === sub.path);
    }
    return path ? location.pathname === path : false;
  };

  return (
    <div className="w-64 h-screen sticky top-0 bg-[#090d16] border-r border-slate-800/80 text-slate-300 flex flex-col overflow-hidden z-30">
      <div className="p-3 mb-2">
        <div className="w-full bg-white rounded-lg p-2 flex items-center justify-center shadow-sm">
          <img src={logo} alt="Archon Nell Incorporated" className="w-full h-auto max-h-12 object-contain" />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-800 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-700 [scrollbar-width:thin]">
        {sectionGroups.map((group) => (
          <div key={group.title}>
            <h3 className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
              {group.title}
            </h3>
            <div className="space-y-1">
              {group.items.map((item) =>
                item.subItems ? (
                  <div key={item.id}>
                    <button
                      onClick={() => {
                        if (item.id === 'warehouse') setWarehouseOpen(!warehouseOpen);
                      }}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 w-full text-left ${
                        isParentActive(item.path, item.subItems)
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : 'text-[#94A3B8] hover:bg-[#1E293B] hover:text-white'
                      }`}
                    >
                      {item.icon}
                      <span className="flex-1">{item.label}</span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform duration-200 ${
                          item.id === 'warehouse' && warehouseOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {item.id === 'warehouse' && warehouseOpen && item.subItems && (
                      <div className="ml-6 mt-1 flex flex-col space-y-1 border-l border-[#1E293B] pl-3">
                        {item.subItems.map((subItem) => (
                          <Link
                            key={subItem.path}
                            to={subItem.path}
                            className={`block py-1.5 px-2 text-xs text-slate-400 hover:text-white hover:bg-[#131C2E] rounded transition whitespace-nowrap ${
                              location.pathname === subItem.path
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : ''
                            }`}
                          >
                            {subItem.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    key={item.id}
                    to={item.path!}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                      isParentActive(item.path, item.subItems)
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        : 'text-[#94A3B8] hover:bg-[#1E293B] hover:text-white'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {isParentActive(item.path, item.subItems) && (
                      <ChevronDown className="w-4 h-4 ml-auto text-blue-400" />
                    )}
                  </Link>
                )
              )}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
};

export default Sidebar;
