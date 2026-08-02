import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
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
  User,
  Settings,
  Bell,
  LogOut,
} from 'lucide-react';

export default function SuperAdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const [isWarehouseOpen, setIsWarehouseOpen] = useState(
    location.pathname.startsWith('/super-admin/warehouse')
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(
    location.pathname.startsWith('/super-admin/settings')
  );

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login', { replace: true });
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
      isActive
        ? 'bg-[#0b2234] text-[#00a3c4] border border-[#00a3c4]/40'
        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40'
    }`;

  const subLinkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2 rounded-lg text-xs font-medium transition-all ${
      isActive
        ? 'text-[#00a3c4] font-semibold bg-[#00a3c4]/10'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
    }`;

  return (
    <aside className="w-64 h-screen sticky top-0 bg-[#090d16] border-r border-slate-800/80 text-slate-300 flex flex-col justify-between overflow-hidden z-30 select-none">
      {/* BRAND HEADER */}
      <div className="h-16 flex-shrink-0 px-4 border-b border-slate-800/80 flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center text-sm shadow-md">
          SC
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-100 tracking-wide leading-tight">SmartChain</h1>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">SUPPLY OS</p>
        </div>
      </div>

      {/* NAVIGATION */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1 [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <NavLink className={linkClass} to="/super-admin/dashboard">
          <div className="flex items-center gap-3"><LayoutDashboard className="w-4 h-4"/><span>Dashboard</span></div>
        </NavLink>

        <NavLink className={linkClass} to="/super-admin/product-catalog">
          <div className="flex items-center gap-3"><Package className="w-4 h-4"/><span>Product Catalog</span></div>
        </NavLink>

        {/* WAREHOUSE DROPDOWN (Mapped strictly to super-admin/warehouse/ files) */}
        <div>
          <button
            type="button"
            onClick={() => setIsWarehouseOpen(!isWarehouseOpen)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium ${
              location.pathname.startsWith('/super-admin/warehouse') ? 'text-[#00a3c4]' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <div className="flex items-center gap-3"><Warehouse className="w-4 h-4"/><span>Warehouse</span></div>
            {isWarehouseOpen ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
          </button>

          {isWarehouseOpen && (
            <div className="pl-9 pr-2 py-1 space-y-1 border-l border-slate-800 ml-5 my-1">
              <NavLink className={subLinkClass} to="/super-admin/warehouse/inventory">Inventory</NavLink>
              <NavLink className={subLinkClass} to="/super-admin/warehouse/stock-counting">Stock Counting</NavLink>
              <NavLink className={subLinkClass} to="/super-admin/warehouse/manage-locations">Manage Locations</NavLink>
            </div>
          )}
        </div>

        <NavLink className={linkClass} to="/super-admin/procurement">
          <div className="flex items-center gap-3"><ShoppingCart className="w-4 h-4"/><span>Procurement</span></div>
        </NavLink>

        <NavLink className={linkClass} to="/super-admin/purchase-orders">
          <div className="flex items-center gap-3"><FileText className="w-4 h-4"/><span>Purchase Orders</span></div>
        </NavLink>

        <NavLink className={linkClass} to="/super-admin/suppliers">
          <div className="flex items-center gap-3"><Users className="w-4 h-4"/><span>Suppliers</span></div>
        </NavLink>

        {/* LOGISTICS (Matches logistics.tsx) */}
        <NavLink className={linkClass} to="/super-admin/logistics">
          <div className="flex items-center gap-3"><Truck className="w-4 h-4"/><span>Logistics (DTRS)</span></div>
        </NavLink>

        <NavLink className={linkClass} to="/super-admin/ai-demand-forecast">
          <div className="flex items-center gap-3"><Brain className="w-4 h-4"/><span>AI Demand Forecasting</span></div>
        </NavLink>

        <NavLink className={linkClass} to="/super-admin/reports">
          <div className="flex items-center gap-3"><BarChart3 className="w-4 h-4"/><span>Reports</span></div>
        </NavLink>

        <NavLink className={linkClass} to="/super-admin/users">
          <div className="flex items-center gap-3"><Users className="w-4 h-4"/><span>Users</span></div>
        </NavLink>

        {/* SETTINGS DROPDOWN */}
        <div>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium ${
              location.pathname.startsWith('/super-admin/settings') ? 'text-[#00a3c4]' : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <div className="flex items-center gap-3"><Settings className="w-4 h-4"/><span>Settings</span></div>
            {isSettingsOpen ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
          </button>

          {isSettingsOpen && (
            <div className="pl-9 pr-2 py-1 space-y-1 border-l border-slate-800 ml-5 my-1">
              <NavLink className={subLinkClass} to="/super-admin/settings/api-keys">API Keys</NavLink>
              <NavLink className={subLinkClass} to="/super-admin/settings/brands">Brands</NavLink>
              <NavLink className={subLinkClass} to="/super-admin/settings/categories">Categories</NavLink>
              <NavLink className={subLinkClass} to="/super-admin/settings/company">Company Settings</NavLink>
              <NavLink className={subLinkClass} to="/super-admin/settings/uom">Units of Measure</NavLink>
            </div>
          )}
        </div>
      </nav>

      {/* BOTTOM ACCOUNT SECTION */}
      <div className="p-4 border-t border-slate-800/80 space-y-1 flex-shrink-0">
        <div className="flex items-center gap-3 px-3 py-2 text-slate-300 text-sm font-medium">
          <User className="w-4 h-4 text-slate-400"/><span>John Doe</span>
        </div>
        <NavLink className={linkClass} to="/super-admin/notifications">
          <div className="flex items-center gap-3"><Bell className="w-4 h-4"/><span>Notifications</span></div>
          <span className="w-5 h-5 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center">3</span>
        </NavLink>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut className="w-4 h-4"/><span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
