import React, { useState, useMemo } from 'react';
import {
 UserPlus,
 Search,
 ChevronLeft,
 ChevronRight,
 User,
 Users,
 UserCheck,
 UserX,
 Clock,
 AlertCircle,
 Check,
 Download,
 Warehouse,
 Edit,
 Eye,
 X,
 Filter
} from 'lucide-react';

interface User {
 id: string;
 firstName: string;
 lastName: string;
 email: string;
 employeeId: string;
 department: string;
 role: 'PLANT_MANAGER' | 'MANAGER' | 'USER' | 'VIEWER';
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

const mockUsers: User[] = [
 {
  id: '1',
  firstName: 'Administrator',
  lastName: '',
  email: 'admin@example.com',
  employeeId: 'EMP-001',
  department: 'Purchasing',
  role: 'PLANT_MANAGER',
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

const departments = ['All Departments', 'Purchasing', 'Warehouse', 'Procurement', 'Inventory', 'Logistics'];
const roles = ['All Roles', 'PLANT_MANAGER', 'MANAGER', 'USER', 'VIEWER'];
const warehouses = ['All Warehouses', 'WH-PAMP', 'WH-MNL', 'WH-CEB', 'WH-DVO'];
const statusOptions = ['All Status', 'Active', 'Inactive', 'Pending', 'Suspended'];

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
 const config = {
  Active: { color: 'text-green-400 bg-green-400/10 border-green-400/20', icon: Check },
  Inactive: { color: 'text-gray-400 bg-gray-400/10 border-gray-400/20', icon: UserX },
  Pending: { color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: Clock },
  Suspended: { color: 'text-red-400 bg-red-400/10 border-red-400/20', icon: AlertCircle }
 };
 const { color, icon: Icon } = config[status as keyof typeof config] || config.Inactive;
 return (
  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${color} transition-colors duration-150`}>
   <Icon className="w-3 h-3" />
   {status}
  </span>
 );
};

 const KPICard: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
 }> = ({ label, value, icon }) => (
  <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-5 hover:border-[#5B8CFF]/30 transition-all duration-200 h-full flex flex-col">
  <div className="flex items-start justify-between flex-1">
   <div>
    <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">{label}</p>
    <p className="text-2xl font-bold text-white mt-1.5">{value}</p>
   </div>
   <div className="p-2.5 bg-gray-800/50 bg-gray-800/50 rounded-lg shrink-0">
    {icon}
   </div>
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
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
  <input
   type="text"
   value={value}
   onChange={(e) => onChange(e.target.value)}
   placeholder={placeholder}
   className="w-full bg-gray-800/50 border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-gray-400 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-all"
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
   className="w-full bg-gray-800/50 border-gray-700 px-3 py-2 text-xs rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-200 appearance-none cursor-pointer"
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
  <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 border-gray-800/50 bg-slate-50 bg-gray-800/30">
   <div className="text-sm text-gray-400">
    Showing <span className="text-white font-medium">{start}</span> to{' '}
    <span className="text-white font-medium">{end}</span> of{' '}
    <span className="text-white font-medium">{totalItems}</span> users
   </div>
   <div className="flex items-center gap-1">
    <button
     onClick={() => onPageChange(Math.max(1, currentPage - 1))}
     disabled={currentPage === 1}
     className="p-1.5 rounded-xl border border-gray-800 border-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
        : 'text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800/50'
      }`}
     >
      {page}
     </button>
    ))}
    <button
     onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
     disabled={currentPage === totalPages}
     className="p-1.5 rounded-xl border border-gray-800 border-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
     >
     <ChevronRight className="w-4 h-4" />
    </button>
   </div>
  </div>
 );
};

const UserTableRow: React.FC<{
 user: User;
 onEdit: (user: User) => void;
 onView: (user: User) => void;
}> = ({ user, onEdit, onView }) => (
 <tr className="hover:bg-gray-800/50 hover:bg-gray-800/50 transition-colors duration-200 group">
  <td className="px-6 py-4 whitespace-nowrap">
   <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-full bg-[#5B8CFF]/20 border border-[#5B8CFF]/30 flex items-center justify-center text-sm font-semibold text-[#5B8CFF] shrink-0">
     {user.firstName.charAt(0)}{user.lastName.charAt(0) || ''}
    </div>
    <div className="min-w-0">
     <p className="text-white text-sm font-medium truncate">{user.firstName} {user.lastName}</p>
     <p className="text-gray-400 text-xs truncate">{user.email}</p>
    </div>
   </div>
  </td>
  <td className="px-6 py-4 whitespace-nowrap">{user.employeeId}</td>
  <td className="px-6 py-4 whitespace-nowrap">{user.department}</td>
  <td className="px-6 py-4 whitespace-nowrap">
   <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-medium bg-[#5B8CFF]/10 text-[#5B8CFF] border border-[#5B8CFF]/20">
    {user.role}
   </span>
  </td>
  <td className="px-6 py-4 whitespace-nowrap">{user.branch}</td>
  <td className="px-6 py-4 whitespace-nowrap">{user.warehouse}</td>
  <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={user.status} /></td>
  <td className="px-6 py-4 whitespace-nowrap">
   <div className="flex items-center gap-1 justify-end">
    <button
     onClick={() => onView(user)}
     className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800/50 transition-colors duration-150"
    >
     <Eye className="w-4 h-4" />
    </button>
    <button
     onClick={() => onEdit(user)}
     className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800/50 transition-colors duration-150"
    >
     <Edit className="w-4 h-4" />
    </button>
   </div>
  </td>
 </tr>
);

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
   <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl shadow-xl w-full max-w-2xl p-8 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
    <div className="flex items-center justify-between mb-6">
     <h2 className="text-xl font-bold text-white tracking-tight">{user ? 'Edit User' : 'Create User'}</h2>
     <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800/50 hover:bg-gray-800/50 text-gray-400 hover:text-white transition-colors duration-150">
      <X className="w-5 h-5" />
     </button>
    </div>

    <form onSubmit={handleSubmit} className="space-y-6">
     <div className="flex items-center gap-4 pb-6 border-b border-gray-800 border-gray-800/50">
      <div className="w-16 h-16 rounded-full bg-[#5B8CFF]/20 border-2 border-[#5B8CFF]/30 flex items-center justify-center text-2xl font-bold text-[#5B8CFF] shrink-0">
       {formData.firstName?.charAt(0) || 'U'}{formData.lastName?.charAt(0) || ''}
      </div>
      <div>
       <p className="text-white text-sm font-medium">Profile Photo</p>
       <p className="text-gray-400 text-xs mt-0.5">Click to upload or drag & drop</p>
       <button type="button" className="mt-1.5 text-xs text-[#5B8CFF] hover:text-[#6B9BFF] transition-colors duration-150">Upload Photo</button>
      </div>
     </div>

     <div className="grid grid-cols-2 gap-4">
      <div>
       <label className="block text-sm font-medium mb-2 text-gray-400">First Name *</label>
       <input
        type="text"
        value={formData.firstName || ''}
        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
        className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
        required
       />
      </div>
      <div>
       <label className="block text-sm font-medium mb-2 text-gray-400">Last Name *</label>
       <input
        type="text"
        value={formData.lastName || ''}
        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
        className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
        required
       />
      </div>
     </div>

     <div className="grid grid-cols-2 gap-4">
      <div>
       <label className="block text-sm font-medium mb-2 text-gray-400">Employee ID *</label>
       <input
        type="text"
        value={formData.employeeId || ''}
        onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
        className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
        required
       />
      </div>
      <div>
       <label className="block text-sm font-medium mb-2 text-gray-400">Email *</label>
       <input
        type="email"
        value={formData.email || ''}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
        required
       />
      </div>
     </div>

     <div>
       <label className="block text-sm font-medium mb-2 text-gray-400">Phone</label>
       <input
        type="text"
        value={formData.phone || ''}
        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
       />
     </div>

     <div className="grid grid-cols-2 gap-4">
      <div>
       <label className="block text-sm font-medium mb-2 text-gray-400">Department *</label>
       <select
        value={formData.department || 'Purchasing'}
        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
        className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150 appearance-none"
       >
        {departments.filter(d => d !== 'All Departments').map(d => (
         <option key={d} value={d}>{d}</option>
        ))}
       </select>
      </div>
      <div>
       <label className="block text-sm font-medium mb-2 text-gray-400">Role *</label>
       <select
        value={formData.role || 'USER'}
        onChange={(e) => setFormData({ ...formData, role: e.target.value as User['role'] })}
        className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150 appearance-none"
       >
        {roles.filter(r => r !== 'All Roles').map(r => (
         <option key={r} value={r}>{r}</option>
        ))}
       </select>
      </div>
     </div>

     <div className="grid grid-cols-2 gap-4">
      <div>
       <label className="block text-sm font-medium mb-2 text-gray-400">Branch *</label>
       <select
        value={formData.branch || 'BR-PAMP'}
        onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
        className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150 appearance-none"
       >
        <option value="BR-PAMP">BR-PAMP</option>
        <option value="BR-MNL">BR-MNL</option>
        <option value="BR-CEB">BR-CEB</option>
        <option value="BR-DVO">BR-DVO</option>
       </select>
      </div>
      <div>
       <label className="block text-sm font-medium mb-2 text-gray-400">Warehouse *</label>
       <select
        value={formData.warehouse || 'WH-PAMP'}
        onChange={(e) => setFormData({ ...formData, warehouse: e.target.value })}
        className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150 appearance-none"
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
       <label className="block text-sm font-medium mb-2 text-gray-400">Username *</label>
       <input
        type="text"
        className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
        placeholder="Enter username"
        required
       />
       </div>
       <div>
       <label className="block text-sm font-medium mb-2 text-gray-400">Status *</label>
       <select
        value={formData.status || 'Active'}
        onChange={(e) => setFormData({ ...formData, status: e.target.value as User['status'] })}
        className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150 appearance-none"
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
       <label className="block text-sm font-medium mb-2 text-gray-400">Password *</label>
       <input
        type="password"
        className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
        placeholder="Enter password"
        required
       />
       </div>
       <div>
       <label className="block text-sm font-medium mb-2 text-gray-400">Confirm Password *</label>
       <input
        type="password"
        className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
        placeholder="Confirm password"
        required
       />
       </div>
      </div>
     )}

     <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-800 border-gray-800/50">
      <button
       type="button"
       onClick={onClose}
       className="h-11 px-5 border border-gray-800 border-gray-800/50 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800/50 transition-colors duration-200"
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

const UserManagement: React.FC = () => {
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
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState<boolean>(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [viewUser, setViewUser] = useState<User | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

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

 const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
 const paginatedUsers = useMemo(() => {
  const start = (currentPage - 1) * itemsPerPage;
  return filteredUsers.slice(start, start + itemsPerPage);
 }, [filteredUsers, currentPage, itemsPerPage]);

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

 const totalUsers = users.length;
 const activeUsers = users.filter((u) => u.status === 'Active').length;
 const pendingUsers = users.filter((u) => u.status === 'Pending').length;
 const suspendedUsers = users.filter((u) => u.status === 'Suspended').length;

  return (
   <div className="w-full px-6 py-8 space-y-6 text-white">
   {/* 1. PAGE HEADER */}
   <div>
    <h1 className="text-2xl font-bold text-white tracking-tight">User Management</h1>
    <p className="text-xs text-gray-400 mt-1">
     Manage employee accounts, roles, warehouse assignments, departments, and system permissions.
    </p>
   </div>

   {/* 2. STAT CARDS (4 Columns) */}
   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {/* TOTAL USERS */}
    <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-xl p-4 flex items-center justify-between">
     <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">TOTAL USERS</p>
      <h3 className="text-2xl font-bold text-white mt-1">5</h3>
     </div>
     <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
      <Users className="w-5 h-5"/>
     </div>
    </div>

    {/* ACTIVE USERS */}
    <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-xl p-4 flex items-center justify-between">
     <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">ACTIVE USERS</p>
      <h3 className="text-2xl font-bold text-white mt-1">3</h3>
     </div>
     <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
      <UserCheck className="w-5 h-5"/>
     </div>
    </div>

    {/* PENDING APPROVAL */}
    <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-xl p-4 flex items-center justify-between">
     <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">PENDING APPROVAL</p>
      <h3 className="text-2xl font-bold text-white mt-1">1</h3>
     </div>
     <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
      <Clock className="w-5 h-5"/>
     </div>
    </div>

    {/* SUSPENDED ACCOUNTS */}
    <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-xl p-4 flex items-center justify-between">
     <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">SUSPENDED ACCOUNTS</p>
      <h3 className="text-2xl font-bold text-white mt-1">0</h3>
     </div>
     <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
      <AlertCircle className="w-5 h-5"/>
     </div>
    </div>
   </div>

   {/* 3. TOOLBAR (Search, Filters, Export, New User) */}
   <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
    {/* Search Bar */}
    <div className="relative flex-1 min-w-[240px]">
     <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400"/>
     <input
      type="text"
      placeholder="Search users..."
      className="w-full bg-gray-800/50 border-gray-700 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
     />
    </div>

    {/* Action Controls */}
    <div className="flex items-center gap-2 flex-wrap">
     <select className="bg-gray-800/50 border-gray-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none">
      <option>All Status</option>
      <option>Active</option>
      <option>Inactive</option>
      <option>Pending</option>
     </select>

     <select className="bg-gray-800/50 border-gray-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none">
      <option>All Roles</option>
      <option>Plant Manager</option>
      <option>Manager</option>
      <option>User</option>
      <option>Viewer</option>
     </select>

     <button className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/50 border border-gray-700 text-xs font-medium text-white rounded-lg hover:bg-gray-800 hover:bg-gray-700 transition">
      <Filter className="w-3.5 h-3.5"/> Filter
     </button>

     <button className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/50 border border-gray-700 text-xs font-medium text-white rounded-lg hover:bg-gray-800 hover:bg-gray-700 transition">
      <Download className="w-3.5 h-3.5"/> Export
     </button>

      <button onClick={() => setIsAddUserModalOpen(true)} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white rounded-lg transition shadow-lg shadow-blue-600/20">
       <UserPlus className="w-3.5 h-3.5"/> + New User
      </button>
    </div>
   </div>

    {/* 4. TABLE CONTAINER */}
    <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl overflow-hidden shadow-xl mt-6">
     <div className="overflow-x-auto w-full">
     <table className="w-full text-left text-xs text-gray-300 border-collapse">
        <thead className="bg-[#0b101d] border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
       <tr>
        <th className="px-6 py-4 whitespace-nowrap">USER</th>
        <th className="px-6 py-4 whitespace-nowrap">EMPLOYEE ID</th>
        <th className="px-6 py-4 whitespace-nowrap">DEPARTMENT</th>
        <th className="px-6 py-4 whitespace-nowrap">ROLE</th>
        <th className="px-6 py-4 whitespace-nowrap">BRANCH</th>
        <th className="px-6 py-4 whitespace-nowrap">WAREHOUSE</th>
        <th className="px-6 py-4 whitespace-nowrap">STATUS</th>
        <th className="px-6 py-4 whitespace-nowrap text-right">ACTIONS</th>
       </tr>
      </thead>
       <tbody>
        {users.map((u) => (
         <tr key={u.id} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
         <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-center gap-3">
           <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 font-bold flex items-center justify-center text-xs border border-blue-500/30">
            {u.firstName.substring(0, 2).toUpperCase()}
           </div>
           <div>
           <div className="font-semibold text-white text-xs">{u.firstName} {u.lastName}</div>
           <div className="text-[10px] text-gray-400">{u.email}</div>
           </div>
          </div>
         </td>
          <td className="px-6 py-4 whitespace-nowrap text-gray-300 font-mono text-[11px]">{u.employeeId}</td>
          <td className="px-6 py-4 whitespace-nowrap text-gray-300">{u.department}</td>
         <td className="px-6 py-4 whitespace-nowrap">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
           {u.role}
          </span>
         </td>
          <td className="px-6 py-4 whitespace-nowrap text-gray-300">{u.branch}</td>
          <td className="px-6 py-4 whitespace-nowrap text-gray-300">{u.warehouse}</td>
         <td className="px-6 py-4 whitespace-nowrap">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 w-fit ${
           u.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
           u.status === 'Pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
           'bg-slate-500/10 text-gray-400 border border-slate-500/20'
          }`}>
           • {u.status}
          </span>
         </td>
           <td className="px-6 py-4 whitespace-nowrap text-right">
            <div className="flex items-center justify-end gap-2 text-gray-400">
            <button onClick={() => setSelectedUser(u)} className="p-1 hover:text-white transition"><Eye className="w-4 h-4"/></button>
            <button className="p-1 hover:text-white transition"><Edit className="w-4 h-4"/></button>
           </div>
          </td>
        </tr>
       ))}
      </tbody>
       </table>
      </div>
     </div>

      {isAddUserModalOpen && (
       <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => setIsAddUserModalOpen(false)}>
        <div className="max-w-xl w-full max-h-[90vh] flex flex-col rounded-xl bg-[#0d1527] border border-gray-800 shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
         <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white tracking-tight">Create New User</h2>
          <button onClick={() => setIsAddUserModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800/50 text-gray-400 hover:text-white transition-colors duration-150">
           <X className="w-5 h-5" />
          </button>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
           <label className="block text-sm font-medium mb-1.5 text-gray-400">Full Name</label>
           <input
            type="text"
            className="w-full h-10 bg-gray-800/50 border border-gray-700 rounded-lg px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors"
            placeholder="Enter full name"
           />
          </div>
          <div>
           <label className="block text-sm font-medium mb-1.5 text-gray-400">Email Address</label>
           <input
            type="email"
            className="w-full h-10 bg-gray-800/50 border border-gray-700 rounded-lg px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors"
            placeholder="Enter email address"
           />
          </div>
          <div>
           <label className="block text-sm font-medium mb-1.5 text-gray-400">Employee ID</label>
           <input
            type="text"
            className="w-full h-10 bg-gray-800/50 border border-gray-700 rounded-lg px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors"
            placeholder="Enter employee ID"
           />
          </div>
          <div>
           <label className="block text-sm font-medium mb-1.5 text-gray-400">Department</label>
           <select className="w-full h-10 bg-gray-800/50 border border-gray-700 rounded-lg px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors appearance-none">
            <option>Purchasing</option>
            <option>Warehouse</option>
            <option>Procurement</option>
            <option>Inventory</option>
            <option>Logistics</option>
           </select>
          </div>
          <div>
           <label className="block text-sm font-medium mb-1.5 text-gray-400">System Role</label>
           <select className="w-full h-10 bg-gray-800/50 border border-gray-700 rounded-lg px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors appearance-none">
            <option>Administrator</option>
            <option>Manager</option>
            <option>Plant Manager</option>
            <option>QA Supervisor</option>
            <option>User</option>
           </select>
          </div>
          <div>
           <label className="block text-sm font-medium mb-1.5 text-gray-400">Branch / Warehouse Assignment</label>
           <select className="w-full h-10 bg-gray-800/50 border border-gray-700 rounded-lg px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors appearance-none">
            <option>BR-PAMP / WH-PAMP</option>
            <option>BR-MNL / WH-MNL</option>
            <option>BR-CEB / WH-CEB</option>
            <option>BR-DVO / WH-DVO</option>
           </select>
          </div>
         </div>

         <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-800 mt-auto">
          <button
           onClick={() => setIsAddUserModalOpen(false)}
           className="h-10 px-4 border border-gray-700 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors duration-200"
          >
           Cancel
          </button>
          <button
           onClick={() => setIsAddUserModalOpen(false)}
           className="h-10 px-5 rounded-lg text-sm font-medium transition-opacity duration-200 hover:opacity-90"
           style={{ backgroundColor: '#5B8CFF', color: '#FFFFFF' }}
          >
           Create User
          </button>
         </div>
        </div>
       </div>
      )}

      {/* Slide-over User Details Drawer */}
      {selectedUser && (
       <div className="fixed inset-0 z-50 overflow-hidden">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setSelectedUser(null)} />
        <div className="fixed inset-y-0 right-0 flex max-w-full">
         <div className="w-screen max-w-md transform transition ease-in-out duration-500 sm:duration-700">
          <div className="flex h-full flex-col overflow-y-auto bg-[#0d1322] border-l border-gray-800 shadow-xl">
           <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
            <h2 className="text-lg font-semibold text-white">User Details</h2>
            <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-white transition-colors">
             <X className="w-5 h-5" />
            </button>
           </div>
           <div className="p-6 space-y-6">
             <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-500/20 border-2 border-blue-500/30 flex items-center justify-center text-2xl font-bold text-blue-400">
               {selectedUser.firstName.charAt(0)}{selectedUser.lastName?.charAt(0) || ''}
              </div>
              <div>
               <h3 className="text-white font-semibold text-lg">{selectedUser.firstName} {selectedUser.lastName}</h3>
               <p className="text-gray-400 text-sm">{selectedUser.email}</p>
               <span className={
                'mt-3 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ' +
                (selectedUser.status === 'Active' ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                 selectedUser.status === 'Inactive' ? 'text-gray-400 bg-gray-400/10 border-gray-400/20' :
                 selectedUser.status === 'Pending' ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' :
                 selectedUser.status === 'Suspended' ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                 'text-gray-400 bg-gray-400/10 border-gray-400/20')
               }>
                {selectedUser.status}
               </span>
              </div>
             </div>
            <div className="grid grid-cols-2 gap-4">
             <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-800/50">
              <p className="text-gray-400 text-xs mb-1">Employee ID</p>
              <p className="text-white text-sm font-medium">{selectedUser.employeeId}</p>
             </div>
             <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-800/50">
              <p className="text-gray-400 text-xs mb-1">Department</p>
              <p className="text-white text-sm font-medium">{selectedUser.department}</p>
             </div>
             <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-800/50">
              <p className="text-gray-400 text-xs mb-1">Role</p>
              <p className="text-white text-sm font-medium">{selectedUser.role}</p>
             </div>
             <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-800/50">
              <p className="text-gray-400 text-xs mb-1">Branch</p>
              <p className="text-white text-sm font-medium">{selectedUser.branch}</p>
             </div>
             <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-800/50">
              <p className="text-gray-400 text-xs mb-1">Warehouse</p>
              <p className="text-white text-sm font-medium">{selectedUser.warehouse}</p>
             </div>
             <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-800/50">
              <p className="text-gray-400 text-xs mb-1">Status</p>
              <p className="text-white text-sm font-medium">{selectedUser.status}</p>
             </div>
            </div>
            <div className="bg-gray-800/20 border border-gray-800/50 rounded-xl p-4">
             <h4 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Recent Activity</h4>
             <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
               <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500/60" />
                <span className="text-gray-300">Profile created</span>
               </div>
               <span className="text-gray-500 text-xs whitespace-nowrap">{selectedUser.createdAt}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
               <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500/60" />
                <span className="text-gray-300">Last login</span>
               </div>
               <span className="text-gray-500 text-xs whitespace-nowrap">{selectedUser.lastLogin}</span>
              </div>
             </div>
            </div>
           </div>
          </div>
         </div>
        </div>
       </div>
      )}
    </div>
   );
   };

export default UserManagement;
