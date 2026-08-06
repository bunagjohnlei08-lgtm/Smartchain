import React, { useState, useMemo } from 'react';
import {
 Search,
 ChevronLeft,
 ChevronRight,
 Plus,
 Edit,
 Eye,
 Download,
 CheckCircle,
 Clock,
 RefreshCw
} from 'lucide-react';
import PageContainer from '@/components/layout/PageContainer';

// ============================================
// TYPES
// ============================================

interface StockCount {
 id: string;
 warehouse: string;
 productName: string;
 sku: string;
 cycleCount: number;
 physicalCount: number;
 variance: number;
 status: 'Pending' | 'In Progress' | 'Completed' | 'Verified';
 assignedStaff: string;
 date: string;
 notes?: string;
}

// ============================================
// MOCK DATA
// ============================================

const mockStockCounts: StockCount[] = [
 {
  id: '1',
  warehouse: 'Central Depot',
  productName: 'IPAD AIR',
  sku: 'SKU-IPAD-AIRRR',
  cycleCount: 2,
  physicalCount: 2,
  variance: 0,
  status: 'Completed',
  assignedStaff: 'Maria Santos',
  date: '2026-07-27'
 },
 {
  id: '2',
  warehouse: 'Central Depot',
  productName: 'Sony WH-1000XM5',
  sku: 'SKU-SONY-XM5',
  cycleCount: 100,
  physicalCount: 99,
  variance: -1,
  status: 'Verified',
  assignedStaff: 'John Dela Cruz',
  date: '2026-07-26'
 },
 {
  id: '3',
  warehouse: 'Northgate',
  productName: 'Organic Green Tea',
  sku: 'SKU-ORG-TEA-001',
  cycleCount: 50,
  physicalCount: 45,
  variance: -5,
  status: 'In Progress',
  assignedStaff: 'Elena Reyes',
  date: '2026-07-25'
 },
 {
  id: '4',
  warehouse: 'Eastside',
  productName: 'Stainless Steel Bottle',
  sku: 'SKU-BOTTLE-002',
  cycleCount: 10,
  physicalCount: 0,
  variance: -10,
  status: 'Pending',
  assignedStaff: 'Carlos Garcia',
  date: '2026-07-24'
 }
];

const warehouses = ['All Warehouses', 'Central Depot', 'Northgate', 'Eastside', 'Southpark'];
const countStatuses = ['All Status', 'Pending', 'In Progress', 'Completed', 'Verified'];

// ============================================
// COMPONENTS
// ============================================

// ----- Status Badge -----
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
 const config = {
  'Pending': { color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: Clock },
  'In Progress': { color: 'text-blue-400 bg-blue-400/10 border-blue-400/20', icon: RefreshCw },
  'Completed': { color: 'text-green-400 bg-green-400/10 border-green-400/20', icon: CheckCircle },
  'Verified': { color: 'text-purple-400 bg-purple-400/10 border-purple-400/20', icon: CheckCircle }
 };
 const { color, icon: Icon } = config[status as keyof typeof config] || config['Pending'];
 return (
  <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${color} flex items-center gap-1.5 whitespace-nowrap`}>
   <Icon className="w-3 h-3" />
   {status}
  </span>
 );
};

// ----- Search Input -----
const SearchInput: React.FC<{
 value: string;
 onChange: (value: string) => void;
 placeholder?: string;
}> = ({ value, onChange, placeholder = 'Search...' }) => (
 <div className="relative flex-1 min-w-[200px]">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
  <input
   type="text"
   value={value}
   onChange={(e) => onChange(e.target.value)}
   placeholder={placeholder}
   className="w-full bg-gray-800/50 border-gray-700 text-white rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder-slate-500 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
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
   className="w-full bg-gray-800/50 border-gray-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all appearance-none cursor-pointer"
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
   <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 border-gray-800 bg-gray-800/50">
    <div className="text-sm text-gray-400">
     Showing <span className="text-white font-medium">{start}</span> to{' '}
     <span className="text-white font-medium">{end}</span> of{' '}
     <span className="text-white font-medium">{totalItems}</span> items
    </div>
   <div className="flex items-center gap-1">
    <button
     onClick={() => onPageChange(Math.max(1, currentPage - 1))}
     disabled={currentPage === 1}
     className="p-1.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 hover:bg-gray-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
       : 'text-gray-400 hover:text-white hover:bg-gray-800 hover:bg-gray-800'
     }`}
     >
      {page}
     </button>
    ))}
    <button
     onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
     disabled={currentPage === totalPages}
     className="p-1.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 hover:bg-gray-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
    >
     <ChevronRight className="w-4 h-4" />
    </button>
   </div>
  </div>
 );
};

// ============================================
// PAGE: STOCK COUNTING
// ============================================

const StockCounting: React.FC = () => {
 const [search, setSearch] = useState('');
 const [warehouseFilter, setWarehouseFilter] = useState('All Warehouses');
 const [statusFilter, setStatusFilter] = useState('All Status');
 const [currentPage, setCurrentPage] = useState(1);
 const [itemsPerPage] = useState(10);

 const filteredCounts = useMemo(() => {
  return mockStockCounts.filter(count => {
   const matchSearch = count.productName.toLowerCase().includes(search.toLowerCase()) ||
             count.sku.toLowerCase().includes(search.toLowerCase());
   const matchWarehouse = warehouseFilter === 'All Warehouses' || count.warehouse === warehouseFilter;
   const matchStatus = statusFilter === 'All Status' || count.status === statusFilter;
   return matchSearch && matchWarehouse && matchStatus;
  });
 }, [search, warehouseFilter, statusFilter]);

 const totalPages = Math.ceil(filteredCounts.length / itemsPerPage);
 const paginatedCounts = filteredCounts.slice(
  (currentPage - 1) * itemsPerPage,
  currentPage * itemsPerPage
 );

 return (
  <PageContainer>
   <div className="space-y-8">
    {/* Header */}
    <div>
   <h1 className="text-2xl font-bold text-white">Stock Counting</h1>
   <p className="text-gray-400 text-sm mt-2">
      Manage cycle counts, physical inventory, and stock reconciliation.
     </p>
    </div>

   {/* Filter Toolbar */}
   <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-5">
    <div className="flex flex-wrap items-center gap-4">
     <SearchInput
      value={search}
      onChange={setSearch}
      placeholder="Search products by name or SKU..."
     />
     <FilterSelect
      value={warehouseFilter}
      onChange={setWarehouseFilter}
      options={warehouses}
     />
     <FilterSelect
      value={statusFilter}
      onChange={setStatusFilter}
      options={countStatuses}
     />
     <button className="px-3.5 py-2.5 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 hover:bg-gray-800 transition-all flex items-center gap-1.5 text-sm ml-auto">
      <Download className="w-4 h-4" /> Export Results
     </button>
     <button className="px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-1.5"
      style={{ backgroundColor: '#5B8CFF', color: '#FFFFFF' }}>
      <Plus className="w-4 h-4" /> Start Count
     </button>
    </div>
   </div>

   {/* Table */}
   <div className="w-full overflow-x-auto rounded-xl border border-gray-800/50 bg-[#0d1322] shadow-sm ">
    <table className="w-full min-w-[950px] text-left text-sm">
      <thead className="bg-gray-800/50 border-b border-gray-800 border-gray-800">
       <tr>
        <th className="px-6 py-4 text-left text-gray-400 text-xs font-medium uppercase tracking-wider">Warehouse</th>
        <th className="px-6 py-4 text-left text-gray-400 text-xs font-medium uppercase tracking-wider">Product</th>
        <th className="px-6 py-4 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">Cycle Count</th>
        <th className="px-6 py-4 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">Physical Count</th>
        <th className="px-6 py-4 text-right text-gray-400 text-xs font-medium uppercase tracking-wider">Variance</th>
        <th className="px-6 py-4 text-left text-gray-400 text-xs font-medium uppercase tracking-wider">Status</th>
        <th className="px-6 py-4 text-left text-gray-400 text-xs font-medium uppercase tracking-wider">Assigned Staff</th>
        <th className="px-6 py-4 text-left text-gray-400 text-xs font-medium uppercase tracking-wider">Date</th>
        <th className="px-6 py-4 text-center text-gray-400 text-xs font-medium uppercase tracking-wider">Actions</th>
       </tr>
      </thead>
      <tbody>
       {paginatedCounts.map((count) => (
        <tr key={count.id} className="border-b border-gray-800 border-gray-800 hover:bg-gray-800/50 hover:bg-gray-800/50 transition-all duration-150 group">
         <td className="px-6 py-4 text-white text-sm">{count.warehouse}</td>
         <td className="px-6 py-4">
          <div>
           <p className="text-white text-sm font-medium">{count.productName}</p>
           <p className="text-gray-400 text-xs">{count.sku}</p>
          </div>
         </td>
         <td className="px-6 py-4 text-right text-white text-sm">{count.cycleCount}</td>
         <td className="px-6 py-4 text-right text-white text-sm">{count.physicalCount}</td>
         <td className={`px-6 py-4 text-right font-medium text-sm ${
          count.variance > 0 ? 'text-green-400' :
          count.variance < 0 ? 'text-red-400' :
          'text-white'
         }`}>
          {count.variance > 0 ? '+' : ''}{count.variance}
         </td>
         <td className="px-6 py-4"><StatusBadge status={count.status} /></td>
         <td className="px-6 py-4 text-gray-400 text-sm">{count.assignedStaff}</td>
         <td className="px-6 py-4 text-gray-400 text-sm">{count.date}</td>
         <td className="px-6 py-4">
          <div className="flex items-center justify-center gap-1">
           <button className="p-1.5 rounded-lg hover:bg-gray-800 hover:bg-gray-800 text-gray-400 hover:text-white transition-all">
            <Eye className="w-4 h-4" />
           </button>
           <button className="p-1.5 rounded-lg hover:bg-gray-800 hover:bg-gray-800 text-gray-400 hover:text-white transition-all">
            <Edit className="w-4 h-4" />
           </button>
          </div>
         </td>
        </tr>
       ))}
      </tbody>
     </table>
    <Pagination
     currentPage={currentPage}
     totalPages={totalPages}
     onPageChange={setCurrentPage}
     totalItems={filteredCounts.length}
     itemsPerPage={itemsPerPage}
    />
   </div>
  </div>
  </PageContainer>
 );
};

export default StockCounting;
export { StockCounting };
