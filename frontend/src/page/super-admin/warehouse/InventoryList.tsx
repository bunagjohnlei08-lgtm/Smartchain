import React, { useState, useMemo } from 'react';
import {
  Warehouse,
  Search,
  ChevronLeft,
  ChevronRight,
  Package,
  MapPin,
  ClipboardList,
  Plus,
  Edit,
  Trash2,
  Eye,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  ChevronRight as ChevronBreadcrumb,
  FileText
} from 'lucide-react';

import StockCounting from './StockCounting';
import ManageLocations from './ManageLocations';
import PageContainer from '@/components/layout/PageContainer';

// ============================================
// TYPES
// ============================================

interface InventoryItem {
  id: string;
  sku: string;
  productName: string;
  warehouse: string;
  binLocation: string;
  batchLot: string | null;
  inStockQty: number;
  availableQty: number;
  reservedQty: number;
  unit: string;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock' | 'On Hold';
  image?: string;
  category: string;
  serialTracked: boolean;
}

const mockInventory: InventoryItem[] = [
  {
    id: '1',
    sku: 'SKU-IPAD-AIRRR',
    productName: 'IPAD AIR',
    warehouse: 'Central Depot',
    binLocation: 'BIN-DEFAULT',
    batchLot: null,
    inStockQty: 2,
    availableQty: 2,
    reservedQty: 0,
    unit: 'pcs',
    status: 'In Stock',
    category: 'Electronics',
    serialTracked: true
  },
  {
    id: '2',
    sku: 'SKU-SONY-XM5',
    productName: 'Sony WH-1000XM5',
    warehouse: 'Central Depot',
    binLocation: 'BIN-DEFAULT',
    batchLot: null,
    inStockQty: 99,
    availableQty: 95,
    reservedQty: 4,
    unit: 'pcs',
    status: 'In Stock',
    category: 'Electronics',
    serialTracked: false
  },
  {
    id: '3',
    sku: 'SKU-ORG-TEA-001',
    productName: 'Organic Green Tea',
    warehouse: 'Northgate',
    binLocation: 'BIN-05A',
    batchLot: 'BATCH-2024-01',
    inStockQty: 45,
    availableQty: 40,
    reservedQty: 5,
    unit: 'box',
    status: 'Low Stock',
    category: 'Beverages',
    serialTracked: false
  },
  {
    id: '4',
    sku: 'SKU-BOTTLE-002',
    productName: 'Stainless Steel Bottle',
    warehouse: 'Eastside',
    binLocation: 'BIN-12C',
    batchLot: null,
    inStockQty: 0,
    availableQty: 0,
    reservedQty: 0,
    unit: 'pcs',
    status: 'Out of Stock',
    category: 'Kitchenware',
    serialTracked: false
  },
  {
    id: '5',
    sku: 'SKU-MBP-M3',
    productName: 'Macbook Pro M3',
    warehouse: 'Southpark',
    binLocation: 'BIN-08B',
    batchLot: null,
    inStockQty: 5,
    availableQty: 3,
    reservedQty: 2,
    unit: 'pcs',
    status: 'Low Stock',
    category: 'Electronics',
    serialTracked: true
  }
];


const warehouses = ['All Warehouses', 'Central Depot', 'Northgate', 'Eastside', 'Southpark'];
const statuses = ['All Status', 'In Stock', 'Low Stock', 'Out of Stock', 'On Hold'];

// ============================================
// COMPONENTS
// ============================================

// ----- Status Badge -----
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config = {
    'In Stock': { color: 'text-green-400 bg-green-400/10 border-green-400/20', icon: CheckCircle },
    'Low Stock': { color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: AlertCircle },
    'Out of Stock': { color: 'text-red-400 bg-red-400/10 border-red-400/20', icon: XCircle },
    'On Hold': { color: 'text-orange-400 bg-orange-400/10 border-orange-400/20', icon: Clock },
    'Active': { color: 'text-green-400 bg-green-400/10 border-green-400/20', icon: CheckCircle },
    'Inactive': { color: 'text-gray-400 bg-gray-400/10 border-gray-400/20', icon: XCircle },
    'Full': { color: 'text-red-400 bg-red-400/10 border-red-400/20', icon: AlertCircle },
    'Pending': { color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: Clock },
    'In Progress': { color: 'text-blue-400 bg-blue-400/10 border-blue-400/20', icon: RefreshCw },
    'Completed': { color: 'text-green-400 bg-green-400/10 border-green-400/20', icon: CheckCircle },
    'Verified': { color: 'text-purple-400 bg-purple-400/10 border-purple-400/20', icon: CheckCircle }
  };
  const { color, icon: Icon } = config[status as keyof typeof config] || config['In Stock'];
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${color} flex items-center gap-1.5 whitespace-nowrap`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
};

// ----- KPI Card -----
const KPICard: React.FC<{
  label: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
}> = ({ label, value, subtitle, icon }) => (
   <div className="bg-[#0F172A] border border-slate-800 text-white rounded-2xl p-4 hover:border-blue-500/30 transition-all duration-200 h-full flex flex-col">
     <div className="flex items-start justify-between flex-1">
       <div>
         <p className="text-slate-400 text-[10px] font-medium uppercase tracking-wider">{label}</p>
         <p className="text-2xl font-bold text-white mt-1">{value}</p>
         <p className="text-slate-500 text-[11px] mt-0.5">{subtitle}</p>
       </div>
       <div className="p-2 bg-[#0E1624] rounded-lg shrink-0">
         {icon}
       </div>
     </div>
   </div>
 );

// ----- Search Input -----
const SearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder = 'Search...' }) => (
   <div className="relative flex-1 min-w-[200px]">
     <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
     <input
       type="text"
       value={value}
       onChange={(e) => onChange(e.target.value)}
       placeholder={placeholder}
       className="w-full bg-[#0E1624] text-white border border-[#263244] rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
     />
   </div>
 );

// ----- Filter Select -----
const FilterSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: string[];
}> = ({ value, onChange, options }) => (
   <div className="min-w-[140px]">
     <select
       value={value}
       onChange={(e) => onChange(e.target.value)}
       className="w-full bg-[#0E1624] text-white border border-[#263244] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all appearance-none cursor-pointer"
     >
       {options.map((opt) => (
         <option key={opt} value={opt}>{opt}</option>
       ))}
     </select>
   </div>
 );

// ----- Pagination -----
const Pagination: React.FC<{
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
}> = ({ currentPage, totalPages, onPageChange, totalItems, itemsPerPage }) => {
  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, totalItems);

  const getPages = () => {
    const pages: number[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
      for (let i = 1; i <= 5; i++) pages.push(i);
    } else if (currentPage >= totalPages - 2) {
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      for (let i = currentPage - 2; i <= currentPage + 2; i++) pages.push(i);
    }
    return pages;
  };

  if (totalItems === 0) return null;

  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-[#0B1220]/30">
      <div className="text-sm text-slate-400">
        Showing <span className="text-white font-medium">{start}</span> to{' '}
        <span className="text-white font-medium">{end}</span> of{' '}
        <span className="text-white font-medium">{totalItems}</span> items
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="p-1.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-[#1E293B] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {getPages().map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`px-3 py-1 rounded-xl text-sm font-medium transition-all ${
              currentPage === page
                ? 'bg-[#5B8CFF] text-white'
                : 'text-slate-400 hover:text-white hover:bg-[#1E293B]'
            }`}
          >
            {page}
          </button>
        ))}
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-[#1E293B] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ============================================
// PAGE 1: INVENTORY LIST
// ============================================

const InventoryList: React.FC = () => {
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('All Warehouses');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(15);

  const filteredItems = useMemo(() => {
    return mockInventory.filter(item => {
      const matchSearch = item.productName.toLowerCase().includes(search.toLowerCase()) ||
                          item.sku.toLowerCase().includes(search.toLowerCase()) ||
                          item.binLocation.toLowerCase().includes(search.toLowerCase());
      const matchWarehouse = warehouseFilter === 'All Warehouses' || item.warehouse === warehouseFilter;
      const matchStatus = statusFilter === 'All Status' || item.status === statusFilter;
      return matchSearch && matchWarehouse && matchStatus;
    });
  }, [search, warehouseFilter, statusFilter]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // KPI Data
  const totalStock = mockInventory.reduce((sum, item) => sum + item.inStockQty, 0);
  const warehouseCount = [...new Set(mockInventory.map(item => item.warehouse))].length;
  const auditLogs = 5;

  return (
    <PageContainer>
      <div className="space-y-8">
        {/* Header */}
        <div>
            <div className="flex items-center gap-1.5 text-sm text-slate-400 mb-1">
            <span>Dashboard</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span>Warehouse</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white font-medium">Inventory List</span>
          </div>
            <h1 className="text-2xl font-bold text-white">Inventory List</h1>
           <p className="text-slate-400 text-sm mt-2">
            Monitor stock levels, warehouse inventory, and stock movements.
          </p>
        </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <KPICard
          label="Total Stock Qty"
          value={totalStock}
          subtitle="Active Stock Units"
          icon={<Package className="w-5 h-5 text-[#5B8CFF]" />}
        />
        <KPICard
          label="Warehouse Locations"
          value={warehouseCount}
          subtitle="100% Operational Capacity"
          icon={<Warehouse className="w-5 h-5 text-[#22C55E]" />}
        />
        <KPICard
          label="Audit Log Stream"
          value={auditLogs}
          subtitle="Live Transaction Logs"
          icon={<FileText className="w-5 h-5 text-[#F59E0B]" />}
        />
      </div>


      {/* Filter Toolbar */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search stock by SKU, product name, or bin location..."
          />
          <FilterSelect
            value={warehouseFilter}
            onChange={setWarehouseFilter}
            options={warehouses}
          />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={statuses}
          />
          <button className="px-3.5 py-2.5 border border-slate-800 text-slate-400 hover:text-white hover:bg-[#1E293B] transition-all flex items-center gap-1.5 text-sm ml-auto">
            <Download className="w-4 h-4" /> Export
          </button>
          <button
            className="px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-1.5"
            style={{ backgroundColor: '#5B8CFF', color: '#FFFFFF' }}
          >
            <Plus className="w-4 h-4" /> Add Inventory
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto relative">
          <table className="w-full">
            <thead className="bg-[#0B1220]/50 border-b border-slate-800 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 text-left text-slate-400 text-xs font-medium uppercase tracking-wider">Warehouse</th>
                <th className="px-6 py-4 text-left text-slate-400 text-xs font-medium uppercase tracking-wider">SKU / Product</th>
                <th className="px-6 py-4 text-left text-slate-400 text-xs font-medium uppercase tracking-wider">Bin Location</th>
                <th className="px-6 py-4 text-left text-slate-400 text-xs font-medium uppercase tracking-wider">Batch / Lot</th>
                <th className="px-6 py-4 text-right text-slate-400 text-xs font-medium uppercase tracking-wider">In Stock Qty</th>
                <th className="px-6 py-4 text-left text-slate-400 text-xs font-medium uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-center text-slate-400 text-xs font-medium uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => (
                <tr key={item.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-all duration-200 group">
                  <td className="px-6 py-4 text-white text-sm">{item.warehouse}</td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-white text-sm font-medium">{item.productName}</p>
                      <p className="text-slate-400 text-xs">{item.sku}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm">{item.binLocation}</td>
                  <td className="px-6 py-4">
                    {item.serialTracked ? (
                      <span className="text-[11px] text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-lg border border-blue-400/20">
                        Serial Tracked
                      </span>
                    ) : (
                      <span className="text-slate-500 text-sm">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-white text-sm font-medium">{item.inStockQty} {item.unit}</span>
                  </td>
                  <td className="px-6 py-4"><StatusBadge status={item.status} /></td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-0.5">
                      <button className="p-1.5 rounded-md hover:bg-slate-800 text-slate-500 hover:text-white transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1.5 rounded-md hover:bg-slate-800 text-slate-500 hover:text-white transition-colors">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1.5 rounded-md hover:bg-slate-800 text-slate-500 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredItems.length}
          itemsPerPage={itemsPerPage}
        />
      </div>
    </div>
    </PageContainer>
  );
};

// ============================================
// MAIN WAREHOUSE COMPONENT (with Tabs)
// ============================================

const WarehouseModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'locations' | 'counting'>('inventory');

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0B0F19]">
      <main className="flex-1 overflow-y-auto py-6">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-6">
            <span>Dashboard</span>
            <ChevronBreadcrumb className="w-4 h-4" />
            <span className="text-white font-medium">Warehouse</span>
          </div>

          {/* Navigation Tabs */}
          <div className="border-b border-slate-800 mb-6">
            <div className="flex gap-6">
              <button
                onClick={() => setActiveTab('inventory')}
                className={`pb-3 text-sm font-medium transition-all relative flex items-center gap-2 ${
                  activeTab === 'inventory'
                    ? 'text-white border-b-2 border-[#5B8CFF]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Package className="w-4 h-4" />
                Inventory List
              </button>
              <button
                onClick={() => setActiveTab('locations')}
                className={`pb-3 text-sm font-medium transition-all relative flex items-center gap-2 ${
                  activeTab === 'locations'
                    ? 'text-white border-b-2 border-[#5B8CFF]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MapPin className="w-4 h-4" />
                Manage Locations
              </button>
              <button
                onClick={() => setActiveTab('counting')}
                className={`pb-3 text-sm font-medium transition-all relative flex items-center gap-2 ${
                  activeTab === 'counting'
                    ? 'text-white border-b-2 border-[#5B8CFF]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                Stock Counting
              </button>
            </div>
          </div>

          {/* Page Content */}
          {activeTab === 'inventory' && <InventoryList />}
          {activeTab === 'locations' && <ManageLocations />}
          {activeTab === 'counting' && <StockCounting />}
        </div>
      </main>
    </div>
  );
};

export default WarehouseModule;
export { InventoryList, ManageLocations, StockCounting };

