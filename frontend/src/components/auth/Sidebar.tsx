import React, { useState } from 'react';
import {
  LayoutDashboard,
  Package,
  Grid,
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
  ChevronDown
} from 'lucide-react';

interface NavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  subItems?: string[];
}

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activePage, onNavigate }) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [warehouseOpen, setWarehouseOpen] = useState(false);

  const navItems: NavItem[] = [
    { id: 'dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Dashboard' },
    { id: 'catalog', icon: <Package className="w-5 h-5" />, label: 'Product Catalog' },
    { id: 'inventory', icon: <Grid className="w-5 h-5" />, label: 'Inventory' },
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
    { id: 'users', icon: <Users className="w-5 h-5" />, label: 'Users' },
    {
      id: 'settings',
      icon: <Settings className="w-5 h-5" />,
      label: 'Settings',
      subItems: ['Company Settings', 'Categories', 'Brands', 'Units of Measure', 'API Keys']
    }
  ];

  return (
    <div className="w-64 min-h-screen bg-[#111827] border-r border-[#263244] flex flex-col fixed left-0 top-0 bottom-0 overflow-y-auto scrollbar-hide">
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
                activePage === item.id
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
              {activePage === item.id && item.id !== 'settings' && item.id !== 'warehouse' && (
                <ChevronRight className="w-4 h-4 ml-auto text-blue-400" />
              )}
            </button>

            {item.id === 'settings' && settingsOpen && item.subItems && (
              <div className="ml-6 mt-1 space-y-1 border-l border-[#263244] pl-3">
                {item.subItems.map((subItem) => (
                  <button
                    key={subItem}
                    onClick={() => console.log('Navigate to:', subItem)}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-[#94A3B8] hover:bg-[#1E293B] hover:text-white transition-all duration-200"
                  >
                    {subItem}
                  </button>
                ))}
              </div>
            )}

            {item.id === 'warehouse' && warehouseOpen && item.subItems && (
              <div className="ml-6 mt-1 space-y-1 border-l border-[#263244] pl-3">
                {item.subItems.map((subItem) => (
                  <button
                    key={subItem}
                    onClick={() => console.log('Navigate to:', subItem)}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-[#94A3B8] hover:bg-[#1E293B] hover:text-white transition-all duration-200"
                  >
                    {subItem}
                  </button>
                ))}
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

export default Sidebar;