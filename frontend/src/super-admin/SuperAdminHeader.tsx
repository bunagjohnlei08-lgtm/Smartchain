import { useLocation } from 'react-router-dom';
import { Bell, User } from 'lucide-react';

const pageLabels: Record<string, { parent?: string; title: string }> = {
  '/super-admin/dashboard': { title: 'Dashboard' },
  '/super-admin/product-catalog': { title: 'Product Catalog' },
  '/super-admin/warehouse/inventory': { parent: 'Warehouse', title: 'Inventory' },
  '/super-admin/warehouse/stock-counting': { parent: 'Warehouse', title: 'Stock Counting' },
  '/super-admin/warehouse/manage-locations': { parent: 'Warehouse', title: 'Manage Locations' },
  '/super-admin/procurement': { title: 'Procurement' },
  '/super-admin/purchase-orders': { title: 'Purchase Orders' },
  '/super-admin/suppliers': { title: 'Suppliers' },
  '/super-admin/logistics': { title: 'Logistics (DTRS)' },
  '/super-admin/ai-demand-forecast': { title: 'AI Demand Forecasting' },
  '/super-admin/reports': { title: 'Reports' },
  '/super-admin/users': { title: 'Users' },
  '/super-admin/settings/api-keys': { parent: 'Settings', title: 'API Keys' },
  '/super-admin/settings/brands': { parent: 'Settings', title: 'Brands' },
  '/super-admin/settings/categories': { parent: 'Settings', title: 'Categories' },
  '/super-admin/settings/company': { parent: 'Settings', title: 'Company Settings' },
  '/super-admin/settings/uom': { parent: 'Settings', title: 'Units of Measure' },
  '/super-admin/notifications': { title: 'Notifications' },
};

export default function SuperAdminHeader() {
  const location = useLocation();
  const label = pageLabels[location.pathname] || { title: 'Dashboard' };

  return (
    <header className="flex items-center justify-between h-16 px-6 border-b border-slate-800/80 bg-[#060911] shrink-0">
      <div>
        {label.parent && (
          <p className="text-xs text-slate-400 mb-0.5">{label.parent}</p>
        )}
        <h1 className="text-lg font-semibold text-white">{label.title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800 transition"
        >
          <Bell className="w-4 h-4" />
          <span>Notifications</span>
        </button>
        <button
          type="button"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800 transition"
        >
          <User className="w-4 h-4" />
          <span>Profile</span>
        </button>
      </div>
    </header>
  );
}
