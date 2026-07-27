// Suppliers.tsx
import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Download,
  Truck,
  Star,
  StarHalf,
  XCircle,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  Ban
} from 'lucide-react';

// ---------- TYPES ----------
interface Supplier {
  id: string;
  code: string;
  name: string;
  category: string;
  contact: string;
  email: string;
  phone: string;
  rating: number;
  contracts: number;
  status: 'Active' | 'Inactive' | 'Suspended';
  address?: string;
}

// ---------- MOCK DATA ----------
const mockSuppliers: Supplier[] = [
  {
    id: '1',
    code: 'NT',
    name: 'Northgate Trading Co.',
    category: 'Electronics',
    contact: 'John Smith',
    email: 'john@northgate.com',
    phone: '+63 912 345 6789',
    rating: 4.8,
    contracts: 12,
    status: 'Active',
    address: '123 Northgate Ave, Manila'
  },
  {
    id: '2',
    code: 'GO',
    name: 'GreenLeaf Organics',
    category: 'Grocery',
    contact: 'Maria Santos',
    email: 'maria@greenleaf.com',
    phone: '+63 912 345 1234',
    rating: 4.5,
    contracts: 7,
    status: 'Active',
    address: '456 Green St, Quezon City'
  },
  {
    id: '3',
    code: 'MT',
    name: 'Metro Textile Mills',
    category: 'Apparel',
    contact: 'Carlos Reyes',
    email: 'carlos@metrotextile.com',
    phone: '+63 912 345 5678',
    rating: 4.2,
    contracts: 9,
    status: 'Active',
    address: '789 Fabric Ave, Pasig'
  },
  {
    id: '4',
    code: 'BH',
    name: 'Bayview Home Goods',
    category: 'Home',
    contact: 'Elena Cruz',
    email: 'elena@bayview.com',
    phone: '+63 912 345 9012',
    rating: 3.9,
    contracts: 3,
    status: 'Inactive',
    address: '321 Bay St, Cebu'
  },
  {
    id: '5',
    code: 'PH',
    name: 'Peak Health Supply',
    category: 'Health',
    contact: 'David Tan',
    email: 'david@peakhealth.com',
    phone: '+63 912 345 6780',
    rating: 4.7,
    contracts: 14,
    status: 'Active',
    address: '654 Wellness Ave, Davao'
  }
];

// ---------- CONSTANTS ----------
const supplierStatuses = ['All Status', 'Active', 'Inactive', 'Suspended'];
const categories = ['All Categories', 'Electronics', 'Grocery', 'Apparel', 'Home', 'Health'];

// ---------- HELPER COMPONENTS ----------
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    'Active': { color: 'text-green-400 bg-green-400/10 border-green-400/20', icon: CheckCircle },
    'Inactive': { color: 'text-gray-400 bg-gray-400/10 border-gray-400/20', icon: XCircle },
    'Suspended': { color: 'text-red-400 bg-red-400/10 border-red-400/20', icon: AlertCircle }
  };
  const { color, icon: Icon } = config[status] || config['Inactive'];
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${color} flex items-center gap-1.5 whitespace-nowrap`}>
      <Icon className="w-3 h-3" />
      {status}
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
const Suppliers: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredSuppliers = useMemo(() => {
    return mockSuppliers.filter(sup => {
      const matchSearch = sup.name.toLowerCase().includes(search.toLowerCase()) ||
                          sup.code.toLowerCase().includes(search.toLowerCase()) ||
                          sup.category.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All Status' || sup.status === statusFilter;
      const matchCategory = categoryFilter === 'All Categories' || sup.category === categoryFilter;
      return matchSearch && matchStatus && matchCategory;
    });
  }, [search, statusFilter, categoryFilter]);

  const totalPages = Math.ceil(filteredSuppliers.length / itemsPerPage);
  const paginatedSuppliers = filteredSuppliers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const activeSuppliers = mockSuppliers.filter(s => s.status === 'Active').length;
  const inactiveSuppliers = mockSuppliers.filter(s => s.status === 'Inactive').length;
  const avgRating = mockSuppliers.reduce((sum, s) => sum + s.rating, 0) / mockSuppliers.length;
  const totalContracts = mockSuppliers.reduce((sum, s) => sum + s.contracts, 0);
  const topSuppliers = [...mockSuppliers].sort((a, b) => b.rating - a.rating).slice(0, 4);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Supplier & Vendor Management</h1>
        <p className="text-[#94A3B8] text-sm mt-1">
          Manage supplier profiles, performance ratings, contracts, and vendor relationships.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Active Suppliers" value={activeSuppliers} icon={<Truck className="w-5 h-5 text-[#22C55E]" />} />
        <KPICard label="Inactive" value={inactiveSuppliers} icon={<XCircle className="w-5 h-5 text-[#EF4444]" />} />
        <KPICard label="Avg Performance" value={avgRating.toFixed(2)} subtitle="out of 5.00" icon={<Star className="w-5 h-5 text-[#F59E0B]" />} />
        <KPICard label="Contracts" value={totalContracts} icon={<FileText className="w-5 h-5 text-[#5B8CFF]" />} />
      </div>

      <div className="bg-[#162033] border border-[#263244] rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search suppliers..." className="min-w-[220px]" />
          <FilterSelect value={statusFilter} onChange={setStatusFilter} options={supplierStatuses} />
          <FilterSelect value={categoryFilter} onChange={setCategoryFilter} options={categories} />
          <button className="px-3.5 py-2.5 border border-[#263244] rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-all flex items-center gap-1.5 text-sm ml-auto">
            <Download className="w-4 h-4" /> Export
          </button>
          <button className="px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-1.5" style={{ backgroundColor: '#5B8CFF', color: '#FFFFFF' }}>
            <Plus className="w-4 h-4" /> Add Supplier
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <div className="bg-[#162033] border border-[#263244] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#0B1220]/50 border-b border-[#263244]">
                  <tr>
                    <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Supplier</th>
                    <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Category</th>
                    <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Contact</th>
                    <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Rating</th>
                    <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Contracts</th>
                    <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSuppliers.map((sup) => (
                    <tr key={sup.id} className="border-b border-[#1E293B] hover:bg-[#1E293B]/30 transition-all duration-150 group">
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="text-white text-sm font-medium">{sup.name}</p>
                          <p className="text-[#64748B] text-xs">{sup.code}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-[#94A3B8] text-sm">{sup.category}</td>
                      <td className="px-5 py-3.5 text-[#94A3B8] text-sm">{sup.contact}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1">
                          <div className="flex text-[#F59E0B]">
                            {[...Array(5)].map((_, i) => {
                              const starVal = sup.rating - i;
                              if (starVal >= 1) return <Star key={i} className="w-3.5 h-3.5 fill-[#F59E0B]" />;
                              if (starVal >= 0.5) return <StarHalf key={i} className="w-3.5 h-3.5 fill-[#F59E0B]" />;
                              return <Star key={i} className="w-3.5 h-3.5 text-[#263244]" />;
                            })}
                          </div>
                          <span className="text-white text-xs font-medium ml-1">{sup.rating}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-white text-sm">{sup.contracts}</td>
                      <td className="px-5 py-3.5"><StatusBadge status={sup.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filteredSuppliers.length} itemsPerPage={itemsPerPage} />
          </div>
        </div>

        <div className="col-span-1">
          <div className="bg-[#162033] border border-[#263244] rounded-2xl p-5">
            <h3 className="text-white font-semibold text-sm mb-4">Top Performing</h3>
            <p className="text-[#64748B] text-xs mb-3">By rating and contract volume</p>
            <div className="space-y-3">
              {topSuppliers.map((sup, idx) => (
                <div key={sup.id} className="bg-[#0E1624] rounded-xl p-3 border border-[#263244]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#5B8CFF]/20 flex items-center justify-center text-xs font-bold text-[#5B8CFF]">
                        #{idx + 1}
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{sup.name}</p>
                        <p className="text-[#64748B] text-xs">{sup.contracts} contracts · {sup.category}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex text-[#F59E0B]">
                        {[...Array(5)].map((_, i) => {
                          const starVal = sup.rating - i;
                          if (starVal >= 1) return <Star key={i} className="w-3 h-3 fill-[#F59E0B]" />;
                          if (starVal >= 0.5) return <StarHalf key={i} className="w-3 h-3 fill-[#F59E0B]" />;
                          return <Star key={i} className="w-3 h-3 text-[#263244]" />;
                        })}
                      </div>
                      <span className="text-white text-xs font-medium ml-0.5">{sup.rating}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Suppliers;