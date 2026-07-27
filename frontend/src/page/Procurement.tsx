// Procurement.tsx
import React, { useState, useMemo } from 'react';
import {
  ShoppingCart,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit,
  Trash2,
  Eye,
  Download,
  RefreshCw,
  Upload,
  Printer,
  Clock,
  CheckCircle,
  XCircle,
  FileCheck,
  DollarSign,
  FileText,
  AlertCircle,
  Ban
} from 'lucide-react';

// ---------- TYPES ----------
interface ProcurementRequest {
  id: string;
  prNumber: string;
  title: string;
  supplier: string;
  warehouse: string;
  requestedBy: string;
  department: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  estimatedCost: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Completed' | 'Cancelled';
  dateRequested: string;
  expectedDelivery: string;
  items: number;
}

// ---------- MOCK DATA ----------
const mockProcurementRequests: ProcurementRequest[] = [
  {
    id: '1',
    prNumber: 'PR-2041',
    title: 'Warehouse Equipment',
    supplier: 'Northgate Trading Co.',
    warehouse: 'Central Depot',
    requestedBy: 'A. Santos',
    department: 'Warehousing',
    priority: 'High',
    estimatedCost: 48200,
    status: 'Pending',
    dateRequested: '2026-07-05',
    expectedDelivery: '2026-07-20',
    items: 6
  },
  {
    id: '2',
    prNumber: 'PR-2042',
    title: 'Retail Display Units',
    supplier: 'Metro Textile Mills',
    warehouse: 'Northgate',
    requestedBy: 'M. Cruz',
    department: 'Retail Ops',
    priority: 'Medium',
    estimatedCost: 129400,
    status: 'Approved',
    dateRequested: '2026-07-04',
    expectedDelivery: '2026-07-25',
    items: 12
  },
  {
    id: '3',
    prNumber: 'PR-2043',
    title: 'Fulfillment Supplies',
    supplier: 'Bayview Home Goods',
    warehouse: 'Eastside',
    requestedBy: 'R. Diaz',
    department: 'Fulfillment',
    priority: 'Low',
    estimatedCost: 15600,
    status: 'Rejected',
    dateRequested: '2026-07-03',
    expectedDelivery: '2026-07-15',
    items: 3
  },
  {
    id: '4',
    prNumber: 'PR-2044',
    title: 'Merchandise Stock',
    supplier: 'Peak Health Supply',
    warehouse: 'Southpark',
    requestedBy: 'K. Tan',
    department: 'Merchandising',
    priority: 'Urgent',
    estimatedCost: 342000,
    status: 'Approved',
    dateRequested: '2026-07-02',
    expectedDelivery: '2026-07-28',
    items: 20
  },
  {
    id: '5',
    prNumber: 'PR-2045',
    title: 'Warehouse Equipment',
    supplier: 'GreenLeaf Organics',
    warehouse: 'Central Depot',
    requestedBy: 'L. Reyes',
    department: 'Warehousing',
    priority: 'Medium',
    estimatedCost: 22800,
    status: 'Pending',
    dateRequested: '2026-07-01',
    expectedDelivery: '2026-07-18',
    items: 4
  }
];

// ---------- CONSTANTS ----------
const procurementStatuses = ['All Status', 'Pending', 'Approved', 'Rejected', 'Completed', 'Cancelled'];
const warehouses = ['All Warehouses', 'Central Depot', 'Northgate', 'Eastside', 'Southpark'];
const priorities = ['All Priorities', 'Low', 'Medium', 'High', 'Urgent'];
const departments = ['All Departments', 'Warehousing', 'Retail Ops', 'Fulfillment', 'Merchandising'];
const suppliers = ['All Suppliers', 'Northgate Trading Co.', 'GreenLeaf Organics', 'Metro Textile Mills', 'Peak Health Supply', 'Bayview Home Goods'];

// ---------- HELPER COMPONENTS ----------
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    'Pending': { color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: Clock },
    'Approved': { color: 'text-green-400 bg-green-400/10 border-green-400/20', icon: CheckCircle },
    'Rejected': { color: 'text-red-400 bg-red-400/10 border-red-400/20', icon: XCircle },
    'Completed': { color: 'text-blue-400 bg-blue-400/10 border-blue-400/20', icon: FileCheck },
    'Cancelled': { color: 'text-gray-400 bg-gray-400/10 border-gray-400/20', icon: Ban }
  };
  const { color, icon: Icon } = config[status] || config['Pending'];
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${color} flex items-center gap-1.5 whitespace-nowrap`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
};

const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  const config: Record<string, string> = {
    'Low': 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    'Medium': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    'High': 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    'Urgent': 'text-red-400 bg-red-400/10 border-red-400/20'
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${config[priority] || config['Medium']}`}>
      {priority}
    </span>
  );
};

const KPICard: React.FC<{
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
}> = ({ label, value, subtitle, icon }) => (
  <div className="bg-[#162033] border border-[#263244] rounded-2xl p-5 hover:border-[#5B8CFF]/30 transition-all duration-200 h-full flex flex-col">
    <div className="flex items-start justify-between flex-1">
      <div>
        <p className="text-[#94A3B8] text-xs font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-white mt-1.5">{value}</p>
        {subtitle && <p className="text-[#64748B] text-xs mt-1">{subtitle}</p>}
      </div>
      <div className="p-2.5 bg-[#0E1624] rounded-lg shrink-0">{icon}</div>
    </div>
  </div>
);

const SearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder = 'Search...' }) => (
  <div className="relative flex-1 min-w-[180px]">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[#0E1624] border border-[#263244] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-all"
    />
  </div>
);

const FilterSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: string[];
}> = ({ value, onChange, options }) => (
  <div className="min-w-[130px]">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[#0E1624] border border-[#263244] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-all appearance-none cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  </div>
);

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
    <div className="flex items-center justify-between px-6 py-4 border-t border-[#263244] bg-[#0B1220]/30">
      <div className="text-sm text-[#94A3B8]">
        Showing <span className="text-white font-medium">{start}</span> to{' '}
        <span className="text-white font-medium">{end}</span> of{' '}
        <span className="text-white font-medium">{totalItems}</span> items
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="p-1.5 rounded-xl border border-[#263244] text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
                : 'text-[#94A3B8] hover:text-white hover:bg-[#1E293B]'
            }`}
          >
            {page}
          </button>
        ))}
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-xl border border-[#263244] text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ---------- MAIN COMPONENT ----------
const Procurement: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [supplierFilter, setSupplierFilter] = useState('All Suppliers');
  const [warehouseFilter, setWarehouseFilter] = useState('All Warehouses');
  const [priorityFilter, setPriorityFilter] = useState('All Priorities');
  const [departmentFilter, setDepartmentFilter] = useState('All Departments');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredRequests = useMemo(() => {
    return mockProcurementRequests.filter(req => {
      const matchSearch = req.title.toLowerCase().includes(search.toLowerCase()) ||
                          req.prNumber.toLowerCase().includes(search.toLowerCase()) ||
                          req.supplier.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All Status' || req.status === statusFilter;
      const matchSupplier = supplierFilter === 'All Suppliers' || req.supplier === supplierFilter;
      const matchWarehouse = warehouseFilter === 'All Warehouses' || req.warehouse === warehouseFilter;
      const matchPriority = priorityFilter === 'All Priorities' || req.priority === priorityFilter;
      const matchDepartment = departmentFilter === 'All Departments' || req.department === departmentFilter;
      return matchSearch && matchStatus && matchSupplier && matchWarehouse && matchPriority && matchDepartment;
    });
  }, [search, statusFilter, supplierFilter, warehouseFilter, priorityFilter, departmentFilter]);

  const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalRequests = mockProcurementRequests.length;
  const pendingRequests = mockProcurementRequests.filter(r => r.status === 'Pending').length;
  const approvedRequests = mockProcurementRequests.filter(r => r.status === 'Approved').length;
  const rejectedRequests = mockProcurementRequests.filter(r => r.status === 'Rejected').length;
  const completedRequests = mockProcurementRequests.filter(r => r.status === 'Completed').length;
  const totalCost = mockProcurementRequests.reduce((sum, r) => sum + r.estimatedCost, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Procurement & Sourcing</h1>
        <p className="text-[#94A3B8] text-sm mt-1">
          Manage procurement requests, approvals, and purchasing activities across the supply chain.
        </p>
      </div>

      <div className="grid grid-cols-6 gap-4">
        <KPICard label="Total Requisitions" value={totalRequests} icon={<FileText className="w-5 h-5 text-[#5B8CFF]" />} />
        <KPICard label="Pending Requisitions" value={pendingRequests} icon={<Clock className="w-5 h-5 text-[#F59E0B]" />} />
        <KPICard label="Approved This Month" value={approvedRequests} icon={<CheckCircle className="w-5 h-5 text-[#22C55E]" />} />
        <KPICard label="Rejected" value={rejectedRequests} icon={<XCircle className="w-5 h-5 text-[#EF4444]" />} />
        <KPICard label="Completed" value={completedRequests} icon={<FileCheck className="w-5 h-5 text-[#38BDF8]" />} />
        <KPICard label="Requisition Value" value={`₱${(totalCost / 1000).toFixed(0)}K`} icon={<DollarSign className="w-5 h-5 text-[#22C55E]" />} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2" style={{ backgroundColor: '#5B8CFF', color: '#FFFFFF' }}>
          <Plus className="w-4 h-4" /> New Request
        </button>
        <button className="px-4 py-2.5 border border-[#263244] rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-all flex items-center gap-2 text-sm">
          <Upload className="w-4 h-4" /> Import
        </button>
        <button className="px-4 py-2.5 border border-[#263244] rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-all flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" /> Export
        </button>
        <button className="px-4 py-2.5 border border-[#263244] rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-all flex items-center gap-2 text-sm">
          <Printer className="w-4 h-4" /> Print
        </button>
        <button className="px-4 py-2.5 border border-[#263244] rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-all flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="bg-[#162033] border border-[#263244] rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search requests..." />
          <FilterSelect value={statusFilter} onChange={setStatusFilter} options={procurementStatuses} />
          <FilterSelect value={supplierFilter} onChange={setSupplierFilter} options={suppliers} />
          <FilterSelect value={warehouseFilter} onChange={setWarehouseFilter} options={warehouses} />
          <FilterSelect value={priorityFilter} onChange={setPriorityFilter} options={priorities} />
          <FilterSelect value={departmentFilter} onChange={setDepartmentFilter} options={departments} />
        </div>
      </div>

      <div className="bg-[#162033] border border-[#263244] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#0B1220]/50 border-b border-[#263244]">
              <tr>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">PR #</th>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Request Title</th>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Supplier</th>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Requested By</th>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Priority</th>
                <th className="px-5 py-3.5 text-right text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Est. Cost</th>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Status</th>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Date</th>
                <th className="px-5 py-3.5 text-center text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRequests.map((req) => (
                <tr key={req.id} className="border-b border-[#1E293B] hover:bg-[#1E293B]/30 transition-all duration-150 group">
                  <td className="px-5 py-3.5 text-white text-sm font-medium">{req.prNumber}</td>
                  <td className="px-5 py-3.5 text-white text-sm">{req.title}</td>
                  <td className="px-5 py-3.5 text-[#94A3B8] text-sm">{req.supplier}</td>
                  <td className="px-5 py-3.5 text-[#94A3B8] text-sm">{req.requestedBy}</td>
                  <td className="px-5 py-3.5"><PriorityBadge priority={req.priority} /></td>
                  <td className="px-5 py-3.5 text-right text-white text-sm">₱{req.estimatedCost.toLocaleString()}</td>
                  <td className="px-5 py-3.5"><StatusBadge status={req.status} /></td>
                  <td className="px-5 py-3.5 text-[#64748B] text-sm">{req.dateRequested}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-[#1E293B] text-[#64748B] hover:text-white transition-all"><Eye className="w-4 h-4" /></button>
                      <button className="p-1.5 rounded-lg hover:bg-[#1E293B] text-[#64748B] hover:text-white transition-all"><Edit className="w-4 h-4" /></button>
                      {req.status === 'Pending' && (
                        <>
                          <button className="p-1.5 rounded-lg hover:bg-[#1E293B] text-green-400 hover:text-green-300 transition-all"><CheckCircle className="w-4 h-4" /></button>
                          <button className="p-1.5 rounded-lg hover:bg-[#1E293B] text-red-400 hover:text-red-300 transition-all"><XCircle className="w-4 h-4" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filteredRequests.length} itemsPerPage={itemsPerPage} />
      </div>
    </div>
  );
};

export default Procurement;