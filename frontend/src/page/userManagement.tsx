import React, { useState, useMemo } from 'react';
import PageContainer from '../components/layout/PageContainer';
import {
  Plus,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  User,
  Users,
  UserCheck,
  UserX,
  Clock,
  AlertCircle,
  Eye,
  Edit,
  Key,
  Lock,
  Trash2,
  X,
  Check,
  MoreVertical,
  Download,
  RefreshCw,
  Warehouse,
  ChevronRight as ChevronBreadcrumb
} from 'lucide-react';


interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeId: string;
  department: string;
  role: 'ADMIN' | 'MANAGER' | 'USER' | 'VIEWER';
  warehouse: string;
  branch: string;
  status: 'Active' | 'Inactive' | 'Pending' | 'Suspended';
  lastLogin: string;
  phone: string;
  avatar?: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

interface UserFilters {
  search: string;
  department: string;
  role: string;
  warehouse: string;
  status: string;
  sortBy: keyof User;
  sortOrder: 'asc' | 'desc';
}

// ============================================
// MOCK DATA
// ============================================

const mockUsers: User[] = [
  {
    id: '1',
    firstName: 'Administrator',
    lastName: '',
    email: 'admin@example.com',
    employeeId: 'EMP-001',
    department: 'Purchasing',
    role: 'ADMIN',
    warehouse: 'WH-PAMP',
    branch: 'BR-PAMP',
    status: 'Active',
    lastLogin: '2026-07-27 09:30:00',
    phone: '+63 912 345 6789',
    permissions: ['dashboard', 'inventory', 'warehouse', 'products', 'orders', 'purchasing', 'suppliers', 'reports', 'forecasting', 'settings', 'user-management'],
    createdAt: '2026-01-01',
    updatedAt: '2026-07-27'
  },
  {
    id: '2',
    firstName: 'Maria',
    lastName: 'Santos',
    email: 'maria.santos@smartchain.com',
    employeeId: 'EMP-002',
    department: 'Warehouse',
    role: 'MANAGER',
    warehouse: 'WH-PAMP',
    branch: 'BR-PAMP',
    status: 'Active',
    lastLogin: '2026-07-26 14:20:00',
    phone: '+63 912 345 1234',
    permissions: ['dashboard', 'inventory', 'warehouse', 'products', 'orders'],
    createdAt: '2026-01-15',
    updatedAt: '2026-07-26'
  },
  {
    id: '3',
    firstName: 'John',
    lastName: 'Dela Cruz',
    email: 'john.delacruz@smartchain.com',
    employeeId: 'EMP-003',
    department: 'Procurement',
    role: 'USER',
    warehouse: 'WH-PAMP',
    branch: 'BR-PAMP',
    status: 'Pending',
    lastLogin: '2026-07-24 10:00:00',
    phone: '+63 912 345 5678',
    permissions: ['dashboard', 'purchasing'],
    createdAt: '2026-01-20',
    updatedAt: '2026-07-24'
  },
  {
    id: '4',
    firstName: 'Elena',
    lastName: 'Reyes',
    email: 'elena.reyes@smartchain.com',
    employeeId: 'EMP-004',
    department: 'Inventory',
    role: 'USER',
    warehouse: 'WH-MNL',
    branch: 'BR-MNL',
    status: 'Active',
    lastLogin: '2026-07-23 16:45:00',
    phone: '+63 912 345 9012',
    permissions: ['dashboard', 'inventory', 'products'],
    createdAt: '2026-02-01',
    updatedAt: '2026-07-23'
  },
  {
    id: '5',
    firstName: 'Carlos',
    lastName: 'Garcia',
    email: 'carlos.garcia@smartchain.com',
    employeeId: 'EMP-005',
    department: 'Logistics',
    role: 'VIEWER',
    warehouse: 'WH-CEB',
    branch: 'BR-CEB',
    status: 'Inactive',
    lastLogin: '2026-07-20 08:15:00',
    phone: '+63 912 345 6780',
    permissions: ['dashboard', 'reports'],
    createdAt: '2026-02-10',
    updatedAt: '2026-07-20'
  }
];

// ============================================
// CONSTANTS
// ============================================

const departments = ['All Departments', 'Purchasing', 'Warehouse', 'Procurement', 'Inventory', 'Logistics'];
const roles = ['All Roles', 'ADMIN', 'MANAGER', 'USER', 'VIEWER'];
const warehouses = ['All Warehouses', 'WH-PAMP', 'WH-MNL', 'WH-CEB', 'WH-DVO'];
const statusOptions = ['All Status', 'Active', 'Inactive', 'Pending', 'Suspended'];

// ============================================
// COMPONENTS
// ============================================

// ----- Status Badge -----
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config = {
    Active: { color: 'text-green-400 bg-green-400/10 border-green-400/20', icon: Check },
    Inactive: { color: 'text-gray-400 bg-gray-400/10 border-gray-400/20', icon: UserX },
    Pending: { color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: Clock },
    Suspended: { color: 'text-red-400 bg-red-400/10 border-red-400/20', icon: AlertCircle }
  };
  const { color, icon: Icon } = config[status as keyof typeof config] || config.Inactive;
    return (
     <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${color} transition-colors duration-150`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
    );
};

// ----- KPI Card -----
const KPICard: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  trend?: { value: string; positive: boolean };
}> = ({ label, value, icon, trend }) => (
  <div className="bg-[#162033] border border-[#263244] rounded-2xl shadow-sm p-5 h-full flex flex-col justify-between gap-4 transition-colors duration-150 hover:border-[#5B8CFF]/30">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[#94A3B8] text-[11px] font-semibold uppercase tracking-widest leading-none">{label}</p>
        <p className="text-2xl font-bold text-white mt-2.5 leading-none">{value}</p>
      </div>
      <div className="p-2 bg-[#0E1624] rounded-lg shrink-0">
        {icon}
      </div>
    </div>
    <div className="flex items-center gap-1.5 pt-3 border-t border-[#263244]/50 min-h-[20px]">
      {trend && (
        <>
          <span className={`text-xs font-medium ${trend.positive ? 'text-green-400' : 'text-red-400'}`}>
            {trend.positive ? '↑' : '↓'} {trend.value}
          </span>
          <span className="text-[#64748B] text-xs">vs last month</span>
        </>
      )}
    </div>
  </div>
);

// ----- Search Input -----
const SearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder = 'Search...' }) => (
  <div className="relative w-full sm:flex-1 sm:min-w-65">
    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B] transition-colors duration-200" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-11 bg-[#0E1624] border border-[#263244] rounded-lg pl-10 pr-4 text-sm text-white placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-200"
    />
  </div>
);

// ----- Filter Select -----
const FilterSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: string[];
}> = ({ value, onChange, options }) => (
  <div className="w-full sm:w-[168px] shrink-0">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-11 bg-[#0E1624] border border-[#263244] rounded-lg px-3.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-200 appearance-none cursor-pointer"
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
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-t border-[#263244] bg-[#0B1220]/30">
      <div className="text-sm text-[#94A3B8]">
        Showing <span className="text-white font-medium">{start}</span> to{' '}
        <span className="text-white font-medium">{end}</span> of{' '}
        <span className="text-white font-medium">{totalItems}</span> users
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#263244] text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {getPages().map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors duration-200 ${
              currentPage === page
                ? 'bg-[#5B8CFF] text-white'
                : 'text-[#94A3B8] hover:text-white hover:bg-[#1E293B]'
            }`}
          >
            {page}
          </button>
        ))}
        {totalPages > 5 && currentPage < totalPages - 2 && (
          <>
            <span className="text-[#64748B] px-1">…</span>
            <button
              onClick={() => onPageChange(totalPages)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-colors duration-200"
            >
              {totalPages}
            </button>
          </>
        )}
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#263244] text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ----- User Table Row -----
const UserTableRow: React.FC<{
  user: User;
  onView: (user: User) => void;
  onEdit: (user: User) => void;
  onResetPassword: (user: User) => void;
  onToggleStatus: (user: User) => void;
  onDelete: (user: User) => void;
}> = ({ user, onView, onEdit, onResetPassword, onToggleStatus, onDelete }) => {
  const [showActions, setShowActions] = useState(false);

  return (
    <tr className="border-b border-[#1E293B] hover:bg-[#1E293B]/40 transition-colors duration-200 group">
      <td className="px-3 py-3 align-middle">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#5B8CFF]/20 border border-[#5B8CFF]/30 flex items-center justify-center text-sm font-semibold text-[#5B8CFF] shrink-0">
            {user.firstName.charAt(0)}{user.lastName.charAt(0) || ''}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{user.firstName} {user.lastName}</p>
            <p className="text-[#94A3B8] text-xs truncate">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 align-middle text-[#94A3B8] text-sm font-mono whitespace-nowrap">{user.employeeId}</td>
      <td className="px-3 py-3 align-middle text-[#94A3B8] text-sm whitespace-nowrap">{user.department}</td>
      <td className="px-3 py-3 align-middle">
        <span className="inline-flex px-2 py-0.5 rounded-lg text-xs font-medium bg-[#5B8CFF]/10 text-[#5B8CFF] border border-[#5B8CFF]/20 whitespace-nowrap">
          {user.role}
        </span>
      </td>
      <td className="px-3 py-3 align-middle text-[#94A3B8] text-sm whitespace-nowrap">{user.branch}</td>
      <td className="px-3 py-3 align-middle text-[#94A3B8] text-sm whitespace-nowrap">{user.warehouse}</td>
      <td className="px-3 py-3 align-middle"><StatusBadge status={user.status} /></td>
      <td className="px-3 py-3 align-middle text-[#64748B] text-sm whitespace-nowrap">{user.lastLogin}</td>
      <td className="px-3 py-3 align-middle">
        <div className="relative flex justify-end">
          <button
            onClick={() => setShowActions(!showActions)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#1E293B] text-[#64748B] hover:text-white transition-colors duration-200"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
{showActions && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-[#162033] border border-[#263244] rounded-xl shadow-xl z-20 py-1.5 overflow-hidden animate-in fade-in">
              <button
                onClick={() => { onView(user); setShowActions(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#94A3B8] hover:bg-[#1E293B] hover:text-white transition-colors duration-200"
              >
                <Eye className="w-4 h-4" /> View Profile
              </button>
              <button
                onClick={() => { onEdit(user); setShowActions(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#94A3B8] hover:bg-[#1E293B] hover:text-white transition-colors duration-200"
              >
                <Edit className="w-4 h-4" /> Edit User
              </button>
              <button
                onClick={() => { onResetPassword(user); setShowActions(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#94A3B8] hover:bg-[#1E293B] hover:text-white transition-colors duration-200"
              >
                <Key className="w-4 h-4" /> Reset Password
              </button>
              <button
                onClick={() => { onToggleStatus(user); setShowActions(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#94A3B8] hover:bg-[#1E293B] hover:text-white transition-colors duration-200"
              >
                <Lock className="w-4 h-4" /> {user.status === 'Active' ? 'Deactivate' : 'Activate'}
              </button>
              <div className="border-t border-[#263244] my-1.5" />
              <button
                onClick={() => { onDelete(user); setShowActions(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-[#1E293B] hover:text-red-300 transition-colors duration-200"
              >
                <Trash2 className="w-4 h-4" /> Delete User
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
};

// ----- Create/Edit User Modal -----
const UserModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  user?: User | null;
  onSave: (data: Partial<User>) => void;
}> = ({ isOpen, onClose, user, onSave }) => {
  const [formData, setFormData] = useState<Partial<User>>(
    user || {
      firstName: '',
      lastName: '',
      email: '',
      employeeId: '',
      phone: '',
      department: 'Purchasing',
      role: 'USER',
      warehouse: 'WH-PAMP',
      branch: 'BR-PAMP',
      status: 'Active'
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={onClose}>
      <div className="bg-[#162033] border border-[#263244] rounded-2xl shadow-xl w-full max-w-2xl p-8 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white tracking-tight">{user ? 'Edit User' : 'Create User'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#1E293B] text-[#94A3B8] hover:text-white transition-colors duration-150">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center gap-4 pb-6 border-b border-[#263244]">
            <div className="w-16 h-16 rounded-full bg-[#5B8CFF]/20 border-2 border-[#5B8CFF]/30 flex items-center justify-center text-2xl font-bold text-[#5B8CFF] shrink-0">
              {formData.firstName?.charAt(0) || 'U'}{formData.lastName?.charAt(0) || ''}
            </div>
            <div>
              <p className="text-white text-sm font-medium">Profile Photo</p>
              <p className="text-[#64748B] text-xs mt-0.5">Click to upload or drag & drop</p>
              <button type="button" className="mt-1.5 text-xs text-[#5B8CFF] hover:text-[#6B9BFF] transition-colors duration-150">Upload Photo</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-[#94A3B8]">First Name *</label>
              <input
                type="text"
                value={formData.firstName || ''}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full h-11 bg-[#0E1624] border border-[#263244] rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-[#94A3B8]">Last Name *</label>
              <input
                type="text"
                value={formData.lastName || ''}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full h-11 bg-[#0E1624] border border-[#263244] rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-[#94A3B8]">Employee ID *</label>
              <input
                type="text"
                value={formData.employeeId || ''}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                className="w-full h-11 bg-[#0E1624] border border-[#263244] rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-[#94A3B8]">Email *</label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full h-11 bg-[#0E1624] border border-[#263244] rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-[#94A3B8]">Phone</label>
            <input
              type="text"
              value={formData.phone || ''}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full h-11 bg-[#0E1624] border border-[#263244] rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-[#94A3B8]">Department *</label>
              <select
                value={formData.department || 'Purchasing'}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full h-11 bg-[#0E1624] border border-[#263244] rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150 appearance-none"
              >
                {departments.filter(d => d !== 'All Departments').map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-[#94A3B8]">Role *</label>
              <select
                value={formData.role || 'USER'}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as User['role'] })}
                className="w-full h-11 bg-[#0E1624] border border-[#263244] rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150 appearance-none"
              >
                {roles.filter(r => r !== 'All Roles').map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-[#94A3B8]">Branch *</label>
              <select
                value={formData.branch || 'BR-PAMP'}
                onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                className="w-full h-11 bg-[#0E1624] border border-[#263244] rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150 appearance-none"
              >
                <option value="BR-PAMP">BR-PAMP</option>
                <option value="BR-MNL">BR-MNL</option>
                <option value="BR-CEB">BR-CEB</option>
                <option value="BR-DVO">BR-DVO</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-[#94A3B8]">Warehouse *</label>
              <select
                value={formData.warehouse || 'WH-PAMP'}
                onChange={(e) => setFormData({ ...formData, warehouse: e.target.value })}
                className="w-full h-11 bg-[#0E1624] border border-[#263244] rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150 appearance-none"
              >
                {warehouses.filter(w => w !== 'All Warehouses').map(w => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
          </div>

          {!user && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-[#94A3B8]">Username *</label>
                <input
                  type="text"
                  className="w-full h-11 bg-[#0E1624] border border-[#263244] rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
                  placeholder="Enter username"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-[#94A3B8]">Status *</label>
                <select
                  value={formData.status || 'Active'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as User['status'] })}
                  className="w-full h-11 bg-[#0E1624] border border-[#263244] rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150 appearance-none"
                >
                  {statusOptions.filter(s => s !== 'All Status').map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {!user && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-[#94A3B8]">Password *</label>
                <input
                  type="password"
                  className="w-full h-11 bg-[#0E1624] border border-[#263244] rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
                  placeholder="Enter password"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-[#94A3B8]">Confirm Password *</label>
                <input
                  type="password"
                  className="w-full h-11 bg-[#0E1624] border border-[#263244] rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
                  placeholder="Confirm password"
                  required
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-6 border-t border-[#263244]">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 border border-[#263244] rounded-lg text-sm font-medium text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-11 px-5 rounded-lg text-sm font-medium transition-opacity duration-200 hover:opacity-90"
              style={{ backgroundColor: '#5B8CFF', color: '#FFFFFF' }}
            >
              {user ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ----- User Profile Drawer -----
const UserProfileDrawer: React.FC<{
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
}> = ({ user, isOpen, onClose }) => {
  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="bg-black/50 backdrop-blur-sm w-full" onClick={onClose} />
      <div className="bg-[#162033] border-l border-[#263244] w-full max-w-[420px] h-full overflow-y-auto p-6 animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-bold text-white tracking-tight">User Profile</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#1E293B] text-[#94A3B8] hover:text-white transition-colors duration-150">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 rounded-full bg-[#5B8CFF]/20 border-2 border-[#5B8CFF]/30 flex items-center justify-center text-3xl font-bold text-[#5B8CFF]">
            {user.firstName.charAt(0)}{user.lastName.charAt(0) || ''}
          </div>
          <h3 className="text-white font-semibold text-lg mt-4 tracking-tight">{user.firstName} {user.lastName}</h3>
          <p className="text-[#94A3B8] text-sm mt-1">{user.email}</p>
          <div className="mt-3"><StatusBadge status={user.status} /></div>
        </div>

        <div className="space-y-6">
          <div>
            <h4 className="text-[#94A3B8] text-xs font-medium uppercase tracking-wider mb-3">Employee Information</h4>
            <div className="space-y-3 text-sm bg-[#0E1624] rounded-2xl p-4 border border-[#263244]">
              <div className="flex justify-between"><span className="text-[#64748B]">Employee ID</span><span className="text-white">{user.employeeId}</span></div>
              <div className="flex justify-between"><span className="text-[#64748B]">Department</span><span className="text-white">{user.department}</span></div>
              <div className="flex justify-between"><span className="text-[#64748B]">Role</span><span className="text-white">{user.role}</span></div>
              <div className="flex justify-between"><span className="text-[#64748B]">Phone</span><span className="text-white">{user.phone}</span></div>
            </div>
          </div>

          <div>
            <h4 className="text-[#94A3B8] text-xs font-medium uppercase tracking-wider mb-3">Assigned Warehouse</h4>
            <div className="bg-[#0E1624] border border-[#263244] rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-[#94A3B8]" />
                <span className="text-white text-sm">{user.warehouse}</span>
                <span className="text-[#64748B] text-xs ml-auto">{user.branch}</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-[#94A3B8] text-xs font-medium uppercase tracking-wider mb-3">Permissions</h4>
            <div className="flex flex-wrap gap-2">
              {user.permissions.map((p) => (
                <span key={p} className="px-2.5 py-1 bg-[#5B8CFF]/10 border border-[#5B8CFF]/20 rounded-lg text-xs text-[#5B8CFF]">
                  {p}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-[#94A3B8] text-xs font-medium uppercase tracking-wider mb-3">Account Activity</h4>
            <div className="space-y-3 text-sm bg-[#0E1624] rounded-2xl p-4 border border-[#263244]">
              <div className="flex justify-between"><span className="text-[#64748B]">Last Login</span><span className="text-white">{user.lastLogin}</span></div>
              <div className="flex justify-between"><span className="text-[#64748B]">Created</span><span className="text-white">{user.createdAt}</span></div>
              <div className="flex justify-between"><span className="text-[#64748B]">Last Updated</span><span className="text-white">{user.updatedAt}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MAIN USER MANAGEMENT COMPONENT
// ============================================

const UserManagement: React.FC = () => {
  // State
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [filters, setFilters] = useState<UserFilters>({
    search: '',
    department: 'All Departments',
    role: 'All Roles',
    warehouse: 'All Warehouses',
    status: 'All Status',
    sortBy: 'firstName',
    sortOrder: 'asc'
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [isLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [viewUser, setViewUser] = useState<User | null>(null);

  // Filtered & sorted users
  const filteredUsers = useMemo(() => {
    let result = users.filter((u) => {
      const search = filters.search.toLowerCase();
      const matchSearch =
        u.firstName.toLowerCase().includes(search) ||
        u.lastName.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search) ||
        u.employeeId.toLowerCase().includes(search);
      const matchDepartment = filters.department === 'All Departments' || u.department === filters.department;
      const matchRole = filters.role === 'All Roles' || u.role === filters.role;
      const matchWarehouse = filters.warehouse === 'All Warehouses' || u.warehouse === filters.warehouse;
      const matchStatus = filters.status === 'All Status' || u.status === filters.status;
      return matchSearch && matchDepartment && matchRole && matchWarehouse && matchStatus;
    });

    result.sort((a, b) => {
      const aVal = a[filters.sortBy] ?? '';
      const bVal = b[filters.sortBy] ?? '';
      if (aVal < bVal) return filters.sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return filters.sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [users, filters]);

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredUsers.slice(start, start + itemsPerPage);
  }, [filteredUsers, currentPage, itemsPerPage]);

  // Handlers
  const handleCreateUser = (data: Partial<User>) => {
    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      email: data.email || '',
      employeeId: data.employeeId || '',
      phone: data.phone || '',
      department: data.department || 'Purchasing',
      role: (data.role as User['role']) || 'USER',
      warehouse: data.warehouse || 'WH-PAMP',
      branch: data.branch || 'BR-PAMP',
      status: (data.status as User['status']) || 'Active',
      lastLogin: new Date().toISOString().replace('T', ' ').slice(0, 19),
      permissions: ['dashboard'],
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0]
    };
    setUsers([newUser, ...users]);
  };

  const handleEditUser = (data: Partial<User>) => {
    if (!editUser) return;
    setUsers(users.map((u) => (u.id === editUser.id ? { ...u, ...data, updatedAt: new Date().toISOString().split('T')[0] } : u)));
    setEditUser(null);
  };

  const handleDeleteUser = (user: User) => {
    if (window.confirm(`Are you sure you want to delete ${user.firstName} ${user.lastName}?`)) {
      setUsers(users.filter((u) => u.id !== user.id));
    }
  };

  const handleToggleStatus = (user: User) => {
    const newStatus = user.status === 'Active' ? 'Inactive' : 'Active';
    setUsers(users.map((u) => (u.id === user.id ? { ...u, status: newStatus, updatedAt: new Date().toISOString().split('T')[0] } : u)));
  };

  const handleResetPassword = (user: User) => {
    alert(`Password reset link has been sent to ${user.email}`);
  };

  const resetFilters = () => {
    setFilters({
      search: '',
      department: 'All Departments',
      role: 'All Roles',
      warehouse: 'All Warehouses',
      status: 'All Status',
      sortBy: 'firstName',
      sortOrder: 'asc'
    });
    setCurrentPage(1);
  };

  // KPI data
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === 'Active').length;
  const pendingUsers = users.filter((u) => u.status === 'Pending').length;
  const suspendedUsers = users.filter((u) => u.status === 'Suspended').length;

 return (
      <PageContainer>
        {/* Main Content - Centered with max width and proper spacing */}
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">

          {/* Breadcrumb */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm text-[#64748B] hover:text-white transition-colors duration-200 cursor-pointer">Dashboard</span>
            <ChevronBreadcrumb className="w-4 h-4 text-[#64748B]" />
            <span className="text-sm text-[#64748B] hover:text-white transition-colors duration-200 cursor-pointer">Administration</span>
            <ChevronBreadcrumb className="w-4 h-4 text-[#64748B]" />
            <span className="text-base font-semibold text-white">User Management</span>
          </div>

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight leading-tight mb-2">
              User Management
            </h1>
            <p className="text-sm text-[#94A3B8] max-w-2xl leading-relaxed">
              Manage employee accounts, roles, warehouse assignments, departments, and system permissions.
            </p>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
               <KPICard label="Total Users" value={totalUsers} icon={<Users className="w-5 h-5 text-[#5B8CFF]" />} />
               <KPICard
                 label="Active Users"
                 value={activeUsers}
                 icon={<UserCheck className="w-5 h-5 text-[#22C55E]" />}
                 trend={{ value: '12%', positive: true }}
               />
               <KPICard
                 label="Pending Approval"
                 value={pendingUsers}
                 icon={<Clock className="w-5 h-5 text-[#F59E0B]" />}
                 trend={{ value: '5%', positive: false }}
               />
               <KPICard label="Suspended Accounts" value={suspendedUsers} icon={<AlertCircle className="w-5 h-5 text-[#EF4444]" />} />
</div>

{/* Toolbar - Unified row: Search, All Departments, All Roles, All Warehouses, All Status, Reset, Export, Create User */}
            <div className="bg-[#162033] border border-[#263244] rounded-2xl shadow-sm">
              <div className="px-6 py-4 sm:px-6">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0">
                    <SearchInput
                      value={filters.search}
                      onChange={(val) => setFilters({ ...filters, search: val })}
                      placeholder="Search Users..."
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <FilterSelect
                      value={filters.department}
                      onChange={(val) => setFilters({ ...filters, department: val })}
                      options={departments}
                    />
                    <FilterSelect
                      value={filters.role}
                      onChange={(val) => setFilters({ ...filters, role: val })}
                      options={roles}
                    />
                    <FilterSelect
                      value={filters.warehouse}
                      onChange={(val) => setFilters({ ...filters, warehouse: val })}
                      options={warehouses}
                    />
                    <FilterSelect
                      value={filters.status}
                      onChange={(val) => setFilters({ ...filters, status: val })}
                      options={statusOptions}
                    />

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={resetFilters}
                        className="h-10 px-4 border border-[#263244] rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-colors duration-200 flex items-center gap-2 text-sm font-medium"
                      >
                        <RefreshCw className="w-4 h-4" /> Reset
                      </button>
                      <button
                        className="h-10 px-4 border border-[#263244] rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-colors duration-200 flex items-center gap-2 text-sm font-medium"
                      >
                        <Download className="w-4 h-4" /> Export
                      </button>
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className="h-10 px-4 rounded-lg text-sm font-medium transition-opacity duration-200 flex items-center gap-2"
                        style={{ backgroundColor: '#5B8CFF', color: '#FFFFFF' }}
                      >
                        <Plus className="w-4 h-4" />
                        Create User
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          {/* Table Card */}
          <div className="bg-[#162033] border border-[#263244] rounded-2xl shadow-sm">
             <div className="w-full overflow-x-auto">
               <table className="w-full min-w-max">
                <thead className="sticky top-0 bg-[#162033] z-10 border-b border-[#263244]">
                  <tr>
                    {[
                      { key: 'name', label: 'User' },
                      { key: 'employeeId', label: 'Employee ID' },
                      { key: 'department', label: 'Department' },
                      { key: 'role', label: 'Role' },
                      { key: 'branch', label: 'Branch' },
                      { key: 'warehouse', label: 'Warehouse' },
                      { key: 'status', label: 'Status' },
                      { key: 'lastLogin', label: 'Last Login' },
                      { key: 'actions', label: 'Actions' }
                    ].map((col) => (
                      <th
                        key={col.key}
                         className="px-3 py-3 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider cursor-pointer hover:text-white transition-colors duration-150 select-none whitespace-nowrap"
                        onClick={() => {
                          if (col.key !== 'actions') {
                            const sortBy = col.key as keyof User;
                            setFilters({
                              ...filters,
                              sortBy,
                              sortOrder: filters.sortBy === sortBy && filters.sortOrder === 'asc' ? 'desc' : 'asc'
                            });
                          }
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          {col.label}
                          {col.key !== 'actions' && filters.sortBy === col.key && (
                            <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${filters.sortOrder === 'asc' ? '' : 'rotate-180'}`} />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    // Loading skeleton
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-[#1E293B]">
                          <td colSpan={9} className="px-3 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#1E293B] animate-pulse" />
                            <div className="space-y-2 flex-1">
                              <div className="h-3.5 bg-[#1E293B] rounded-lg w-32 animate-pulse" />
                              <div className="h-2.5 bg-[#1E293B] rounded-lg w-48 animate-pulse" />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : paginatedUsers.length > 0 ? (
                    paginatedUsers.map((user) => (
                      <UserTableRow
                        key={user.id}
                        user={user}
                        onView={setViewUser}
                        onEdit={setEditUser}
                        onResetPassword={handleResetPassword}
                        onToggleStatus={handleToggleStatus}
                        onDelete={handleDeleteUser}
                      />
                    ))
                  ) : (
                    <tr>
                         <td colSpan={9} className="px-3 py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <User className="w-12 h-12 text-[#64748B]" />
                          <p className="text-[#94A3B8] font-medium">No users found matching your filters</p>
                          <button
                            onClick={resetFilters}
                            className="text-[#5B8CFF] hover:text-[#6B9BFF] text-sm transition-colors duration-150 font-medium"
                          >
                            Clear all filters
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filteredUsers.length}
              itemsPerPage={itemsPerPage}
            />
           </div>
         </div>

         {/* Modals & Drawer */}
      <UserModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={handleCreateUser}
      />
      <UserModal
        isOpen={!!editUser}
        onClose={() => setEditUser(null)}
        user={editUser}
        onSave={handleEditUser}
      />
      <UserProfileDrawer
        user={viewUser}
        isOpen={!!viewUser}
        onClose={() => setViewUser(null)}
      />
    </PageContainer>
  );
};

export default UserManagement;