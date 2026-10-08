import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Brain,
  ChevronDown,
  FileText,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  User,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import logo from '../../assets/logo.png';

interface NavChild {
  id: string;
  label: string;
  path: string;
}

interface NavItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path?: string;
  children?: NavChild[];
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
    ],
  },
  {
    title: 'CORE MODULES',
    items: [
      {
        id: 'smart-warehousing-system',
        icon: Warehouse,
        label: 'Smart Warehousing System (SWS)',
        children: [
          { id: 'manage-locations', label: 'Manage Locations', path: '/admin/manage-locations' },
          { id: 'order-management', label: 'Order Management', path: '/admin/order-management' },
        ],
      },
      {
        id: 'inventory-management-system',
        icon: Package,
        label: 'Inventory Management System',
        children: [
          { id: 'product-catalog', label: 'Product Catalog', path: '/admin/product-catalog' },
          { id: 'inventory', label: 'Inventory', path: '/admin/inventory' },
          { id: 'inventory-audit-approvals', label: 'Inventory Audit Approvals', path: '/admin/inventory-audit-approvals' },
          { id: 'rejected-items', label: 'Rejected Items', path: '/admin/rejected-items' },
          { id: 'barcode-center', label: 'Barcode Center', path: '/admin/barcode-center' },
        ],
      },
      {
        id: 'procurement',
        icon: ShoppingCart,
        label: 'Procurement & Sourcing Management (PSM)',
        path: '/admin/procurement',
      },
      {
        id: 'suppliers',
        icon: Users,
        label: 'Supplier / Vendor Management',
        path: '/admin/suppliers',
      },
      {
        id: 'purchase-orders',
        icon: FileText,
        label: 'Purchase Order Management',
        path: '/admin/purchase-orders',
      },
      {
        id: 'logistics',
        icon: Truck,
        label: 'Document Tracking & Logistics Records System (DTRS)',
        path: '/admin/logistics',
      },
    ],
  },
  {
    title: 'ANALYTICS & INSIGHTS',
    items: [
      { id: 'ai-demand-forecast', icon: Brain, label: 'AI Demand Forecasting', path: '/admin/ai-demand-forecasting' },
      { id: 'reports', icon: BarChart3, label: 'Reports', path: '/admin/reports' },
    ],
  },
  {
    title: 'SYSTEM MANAGEMENT',
    items: [
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

const AdminSidebar = ({ onMobileClose }: { onMobileClose?: () => void }) => {
  const location = useLocation();
  const isPathActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);
  const activeParentId = navGroups
    .flatMap((group) => group.items)
    .find((item) => item.children?.some((child) => isPathActive(child.path)))?.id;
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() =>
    activeParentId ? { [activeParentId]: true } : {},
  );

  useEffect(() => {
    if (!activeParentId) return;
    setOpenMenus((current) => ({ ...current, [activeParentId]: true }));
  }, [activeParentId]);

  const linkClass = (active: boolean) =>
    `admin-sidebar-main-item flex min-h-11 items-start gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
      active
        ? 'border-l-cyan-400 bg-cyan-500/10 font-semibold text-cyan-400'
        : 'border-l-transparent text-slate-400 hover:bg-slate-800/40 hover:text-slate-100'
    }`;

  const subLinkClass = ({ isActive }: { isActive: boolean }) =>
    `admin-sidebar-sub-item block min-h-10 rounded-lg border-l-2 px-3 py-2 text-xs font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
      isActive
        ? 'border-l-cyan-400 bg-cyan-500/10 font-semibold text-cyan-400'
        : 'border-l-transparent text-slate-400 hover:bg-slate-800/40 hover:text-slate-100'
    }`;

  return (
    <aside className="sidebar sticky top-0 flex h-screen w-64 flex-col justify-between overflow-hidden border-r border-slate-800/80 bg-[#090d16] text-slate-300">
      <div className="flex h-16 flex-shrink-0 items-center border-b border-slate-800 px-4">
        <div className="flex h-9 w-9 min-w-[36px] items-center justify-center rounded-lg bg-white p-1 shadow-sm">
          <img src={logo} alt="SmartChain" className="h-full w-full object-contain" />
        </div>
        <div className="ml-3 flex min-w-0 flex-col">
          <span className="truncate text-sm font-bold text-white">Archon Nell</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">ADMINISTRATOR</span>
        </div>
        <button type="button" onClick={onMobileClose} className="ml-auto flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 xl:hidden" aria-label="Close navigation menu">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <nav aria-label="Admin navigation" className="admin-sidebar-nav flex-1 space-y-4 overflow-y-auto p-4 [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {navGroups.map((group) => (
          <div key={group.title}>
            <h2 className="admin-sidebar-section-label mb-2 mt-5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {group.title}
            </h2>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isParentActive = item.children?.some((child) => isPathActive(child.path)) ?? false;

                if (item.children) {
                  const isOpen = Boolean(openMenus[item.id]);
                  const submenuId = `admin-${item.id}-submenu`;

                  return (
                    <div key={item.id}>
                      <button
                        type="button"
                        onClick={() => setOpenMenus((current) => ({ ...current, [item.id]: !isOpen }))}
                        className={`admin-sidebar-main-item flex min-h-11 w-full cursor-pointer items-start justify-between gap-2 rounded-xl border-l-2 px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
                          isParentActive
                            ? 'border-l-cyan-400 bg-cyan-500/10 font-semibold text-cyan-400'
                            : 'border-l-transparent text-slate-400 hover:bg-slate-800/40 hover:text-slate-100'
                        }`}
                        aria-expanded={isOpen}
                        aria-controls={submenuId}
                        title={item.label}
                      >
                        <span className="flex min-w-0 items-start gap-3">
                          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${isParentActive ? 'drop-shadow-[0_0_6px_rgba(0,163,196,0.6)]' : ''}`} aria-hidden="true" />
                          <span className="min-w-0 whitespace-normal break-words leading-5">{item.label}</span>
                        </span>
                        <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                      </button>

                      {isOpen && (
                        <div id={submenuId} className="my-1 ml-5 space-y-1 border-l border-slate-700 py-1 pl-9 pr-2">
                          {item.children.map((child) => (
                            <NavLink key={child.id} className={subLinkClass} to={child.path} onClick={onMobileClose}>
                              {child.label}
                            </NavLink>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                if (!item.path) return null;
                const active = isPathActive(item.path);

                return (
                  <NavLink key={item.id} to={item.path} onClick={onMobileClose} className={linkClass(active)} title={item.label}>
                    <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${active ? 'drop-shadow-[0_0_6px_rgba(0,163,196,0.6)]' : ''}`} aria-hidden="true" />
                    <span className="min-w-0 whitespace-normal break-words leading-5">{item.label}</span>
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
