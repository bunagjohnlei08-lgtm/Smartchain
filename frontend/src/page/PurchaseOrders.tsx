// PurchaseOrders.tsx
import React, { useState, useMemo } from 'react';
import {
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit,
  Trash2,
  Eye,
  Download,
  Filter,
  Clock,
  CheckCircle,
  XCircle,
  FileCheck,
  AlertCircle,
  Ban
} from 'lucide-react';

// ---------- TYPES ----------
interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplier: string;
  items: number;
  amount: number;
  delivery: string;
  payment: 'Unpaid' | 'Paid' | 'Partial';
  status: 'Pending' | 'Approved' | 'Completed' | 'Cancelled';
}

// ---------- MOCK DATA ----------
const mockPurchaseOrders: PurchaseOrder[] = [
  {
    id: '1',
    poNumber: 'PO-9021',
    supplier: 'Northgate Trading Co.',
    items: 8,
    amount: 184500,
    delivery: '2026-07-15',
    payment: 'Unpaid',
    status: 'Approved'
  },
  {
    id: '2',
    poNumber: 'PO-9022',
    supplier: 'GreenLeaf Organics',
    items: 15,
    amount: 62400,
    delivery: '2026-07-18',
    payment: 'Unpaid',
    status: 'Pending'
  },
  {
    id: '3',
    poNumber: 'PO-9023',
    supplier: 'Metro Textile Mills',
    items: 30,
    amount: 428000,
    delivery: '2026-06-28',
    payment: 'Paid',
    status: 'Completed'
  },
  {
    id: '4',
    poNumber: 'PO-9024',
    supplier: 'Peak Health Supply',
    items: 22,
    amount: 96700,
    delivery: '2026-07-12',
    payment: 'Partial',
    status: 'Approved'
  },
  {
    id: '5',
    poNumber: 'PO-9025',
    supplier: 'Bayview Home Goods',
    items: 5,
    amount: 18900,
    delivery: 'N/A',
    payment: 'Unpaid',
    status: 'Cancelled'
  },
  {
    id: '6',
    poNumber: 'PO-9026',
    supplier: 'Northgate Trading Co.',
    items: 12,
    amount: 245000,
    delivery: '2026-07-20',
    payment: 'Unpaid',
    status: 'Pending'
  }
];

// ---------- CONSTANTS ----------
const poStatuses = ['All Status', 'Pending', 'Approved', 'Completed', 'Cancelled'];
const paymentStatuses = ['All Payment', 'Unpaid', 'Paid', 'Partial'];

// ---------- HELPER COMPONENTS ----------
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    'Pending': { color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: Clock },
    'Approved': { color: 'text-green-400 bg-green-400/10 border-green-400/20', icon: CheckCircle },
    'Completed': { color: 'text-blue-400 bg-blue-400/10 border-blue-400/20', icon: FileCheck },
    'Cancelled': { color: 'text-gray-400 bg-gray-400/10 border-gray-400/20', icon: Ban },
    'Unpaid': { color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: Clock },
    'Paid': { color: 'text-green-400 bg-green-400/10 border-green-400/20', icon: CheckCircle },
    'Partial': { color: 'text-orange-400 bg-orange-400/10 border-orange-400/20', icon: AlertCircle }
  };
  const { color, icon: Icon } = config[status] || config['Pending'];
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
  icon: React.ReactNode;
}> = ({ label, value, icon }) => (
  <div className="bg-[#162033] border border-[#263244] rounded-2xl p-5 hover:border-[#5B8CFF]/30 transition-all duration-200 h-full flex flex-col">
    <div className="flex items-start justify-between flex-1">
      <div>
        <p className="text-[#94A3B8] text-xs font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-white mt-1.5">{value}</p>
      </div>
      <div className="p-2.5 bg-[#0E1624] rounded-lg shrink-0">{icon}</div>
    </div>
  </div>
);

const SearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, placeholder = 'Search...', className = '' }) => (
  <div className={`relative flex-1 min-w-[180px] ${className}`}>
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
const PurchaseOrders: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [paymentFilter, setPaymentFilter] = useState('All Payment');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredOrders = useMemo(() => {
    return mockPurchaseOrders.filter(po => {
      const matchSearch = po.supplier.toLowerCase().includes(search.toLowerCase()) ||
                          po.poNumber.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All Status' || po.status === statusFilter;
      const matchPayment = paymentFilter === 'All Payment' || po.payment === paymentFilter;
      return matchSearch && matchStatus && matchPayment;
    });
  }, [search, statusFilter, paymentFilter]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const pendingPOs = mockPurchaseOrders.filter(p => p.status === 'Pending').length;
  const approvedPOs = mockPurchaseOrders.filter(p => p.status === 'Approved').length;
  const completedPOs = mockPurchaseOrders.filter(p => p.status === 'Completed').length;
  const cancelledPOs = mockPurchaseOrders.filter(p => p.status === 'Cancelled').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Purchase Order Management</h1>
        <p className="text-[#94A3B8] text-sm mt-1">
          Manage purchase orders, track deliveries, and monitor supplier payments.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Pending" value={pendingPOs} icon={<Clock className="w-5 h-5 text-[#F59E0B]" />} />
        <KPICard label="Approved" value={approvedPOs} icon={<CheckCircle className="w-5 h-5 text-[#22C55E]" />} />
        <KPICard label="Completed" value={completedPOs} icon={<FileCheck className="w-5 h-5 text-[#38BDF8]" />} />
        <KPICard label="Cancelled" value={cancelledPOs} icon={<XCircle className="w-5 h-5 text-[#EF4444]" />} />
      </div>

      <div className="bg-[#162033] border border-[#263244] rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search PO or supplier..."
            className="min-w-[250px]"
          />
          <FilterSelect value={statusFilter} onChange={setStatusFilter} options={poStatuses} />
          <FilterSelect value={paymentFilter} onChange={setPaymentFilter} options={paymentStatuses} />
          <button className="px-3.5 py-2.5 border border-[#263244] rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-all flex items-center gap-1.5 text-sm ml-auto">
            <Filter className="w-4 h-4" /> Filter
          </button>
          <button className="px-3.5 py-2.5 border border-[#263244] rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-all flex items-center gap-1.5 text-sm">
            <Download className="w-4 h-4" /> Export
          </button>
          <button className="px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-1.5" style={{ backgroundColor: '#5B8CFF', color: '#FFFFFF' }}>
            <Plus className="w-4 h-4" /> New PO
          </button>
        </div>
      </div>

      <div className="bg-[#162033] border border-[#263244] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#0B1220]/50 border-b border-[#263244]">
              <tr>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">PO #</th>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Supplier</th>
                <th className="px-5 py-3.5 text-right text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Items</th>
                <th className="px-5 py-3.5 text-right text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Amount</th>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Delivery</th>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Payment</th>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Status</th>
                <th className="px-5 py-3.5 text-center text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedOrders.map((po) => (
                <tr key={po.id} className="border-b border-[#1E293B] hover:bg-[#1E293B]/30 transition-all duration-150 group">
                  <td className="px-5 py-3.5 text-white text-sm font-medium">{po.poNumber}</td>
                  <td className="px-5 py-3.5 text-[#94A3B8] text-sm">{po.supplier}</td>
                  <td className="px-5 py-3.5 text-right text-white text-sm">{po.items}</td>
                  <td className="px-5 py-3.5 text-right text-white text-sm">₱{po.amount.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-[#64748B] text-sm">{po.delivery}</td>
                  <td className="px-5 py-3.5"><StatusBadge status={po.payment} /></td>
                  <td className="px-5 py-3.5"><StatusBadge status={po.status} /></td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-[#1E293B] text-[#64748B] hover:text-white transition-all"><Eye className="w-4 h-4" /></button>
                      <button className="p-1.5 rounded-lg hover:bg-[#1E293B] text-[#64748B] hover:text-white transition-all"><Edit className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filteredOrders.length} itemsPerPage={itemsPerPage} />
      </div>
    </div>
  );
};

export default PurchaseOrders;