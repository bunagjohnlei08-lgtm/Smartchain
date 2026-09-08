import React, { useState, useEffect, useCallback } from 'react';
import {
  UserPlus,
  Search,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
  Clock,
  AlertCircle,
  Check,
  Download,
  Edit,
  Eye,
  EyeOff,
  X,
  Filter,
  Users,
  LayoutGrid,
  LayoutList,
} from 'lucide-react';
import type { ApiUser, ApiRole, ApiDepartment, ApiBranch, ApiWarehouse } from '../../types';
import type { AxiosError } from 'axios';
import { apiClient } from '../../lib/api';

function getApiErrorMessage(error: unknown): string {
  const axiosError = error as AxiosError<{ message?: string; errors?: Record<string, string[]> }>;
  const status = axiosError.response?.status;
  if (status === 401) return 'Session expired. Please log in again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 422 && axiosError.response?.data?.errors) {
    const firstError = Object.values(axiosError.response.data.errors)[0];
    return Array.isArray(firstError) ? firstError[0] : String(firstError);
  }
  const msg = axiosError.response?.data?.message;
  if (typeof msg === 'string') return msg;
  return 'An unexpected error occurred. Please try again.';
}

const STATUSES = ['All Status', 'ACTIVE', 'PENDING', 'SUSPENDED'];
const ROLE_OPTIONS = ['PLANT_MANAGER', 'QA_SUPERVISOR'];

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
      <div className="p-2.5 bg-gray-800/50 rounded-lg shrink-0">
        {icon}
      </div>
    </div>
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
    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 border-gray-800/50 bg-gray-800/30">
      <div className="text-sm text-gray-400">
        Showing <span className="text-white font-medium">{start}</span> to{' '}
        <span className="text-white font-medium">{end}</span> of{' '}
        <span className="text-white font-medium">{totalItems}</span> users
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="p-1.5 rounded-xl border border-gray-800 border-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-800/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
          >
            {page}
          </button>
        ))}
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-xl border border-gray-800 border-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-800/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const UserModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  user?: ApiUser | null;
  onSave: (data: Partial<ApiUser> & { password?: string }) => void;
  roles: ApiRole[];
  departments: ApiDepartment[];
  branches: ApiBranch[];
  warehouses: ApiWarehouse[];
}> = ({ isOpen, onClose, user, onSave, roles, departments, branches, warehouses }) => {
  const initialFormData: Partial<ApiUser> & { password?: string } = user ? { ...(user as ApiUser), password: '' } as Partial<ApiUser> & { password?: string } : {
    name: '',
    email: '',
    employee_id: '',
    department_id: undefined,
    role_id: undefined,
    warehouse_id: undefined,
    branch_id: undefined,
    status: 'ACTIVE',
    password: '',
  };

  const [formData, setFormData] = useState<Partial<ApiUser> & { password?: string }>(initialFormData as Partial<ApiUser> & { password?: string });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({ ...(user as ApiUser), password: '' });
    }
  }, [user]);

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
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800/50 text-gray-400 hover:text-white transition-colors duration-150">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center gap-4 pb-6 border-b border-gray-800 border-gray-800/50">
            <div className="w-16 h-16 rounded-full bg-[#5B8CFF]/20 border-2 border-[#5B8CFF]/30 flex items-center justify-center text-2xl font-bold text-[#5B8CFF] shrink-0">
              {(formData.name || 'U')[0]}
            </div>
            <div>
              <p className="text-white text-sm font-medium">Profile Photo</p>
              <p className="text-gray-400 text-xs mt-0.5">Click to upload or drag & drop</p>
              <button type="button" className="mt-1.5 text-xs text-[#5B8CFF] hover:text-[#6B9BFF] transition-colors duration-150">Upload Photo</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-400">Full Name *</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-400">Employee ID *</label>
              <input
                type="text"
                value={formData.employee_id || ''}
                onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-400">Status *</label>
              <select
                value={formData.status || 'ACTIVE'}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as ApiUser['status'] })}
                className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150 appearance-none"
              >
                {STATUSES.filter((s) => s !== 'All Status').map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {!user && (
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-400">Password *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password || ''}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 pr-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-400">Role *</label>
              <select
                value={String(formData.role_id ?? '')}
                onChange={(e) => {
                  const selected = roles.find((r) => String(r.id) === e.target.value);
                  setFormData({ ...formData, role_id: selected ? selected.id : undefined });
                }}
                className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150 appearance-none"
                required
              >
                <option value="">Select role</option>
                {roles.map((r) => (
                  <option key={r.id} value={String(r.id)}>{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-400">Department</label>
              <select
                value={String(formData.department_id ?? '')}
                onChange={(e) => setFormData({ ...formData, department_id: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150 appearance-none"
              >
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d.id} value={String(d.id)}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-400">Branch</label>
              <select
                value={String(formData.branch_id ?? '')}
                onChange={(e) => setFormData({ ...formData, branch_id: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150 appearance-none"
              >
                <option value="">Select branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-400">Warehouse</label>
              <select
                value={String(formData.warehouse_id ?? '')}
                onChange={(e) => setFormData({ ...formData, warehouse_id: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full h-11 bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-150 appearance-none"
              >
                <option value="">Select warehouse</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={String(w.id)}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-800 border-gray-800/50">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 border border-gray-800 border-gray-800/50 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-11 px-5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 text-sm font-medium transition-opacity duration-200"
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
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [departments, setDepartments] = useState<ApiDepartment[]>([]);
  const [branches, setBranches] = useState<ApiBranch[]>([]);
  const [warehouses, setWarehouses] = useState<ApiWarehouse[]>([]);
  const [statistics, setStatistics] = useState({ total: 0, active: 0, pending: 0, suspended: 0 });
  const [filters, setFilters] = useState({
    search: '',
    status: 'All Status',
    role: 'All Roles',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [itemsPerPage] = useState(10);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<ApiUser | null>(null);
  const [viewUser, setViewUser] = useState<ApiUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (filters.search) params.search = filters.search;
      if (filters.status !== 'All Status') params.status = filters.status;
      if (filters.role !== 'All Roles') params.role = filters.role;

      const response = await apiClient.get('/users', { params });
      setUsers(response.data.data ?? response.data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  const fetchStatistics = useCallback(async () => {
    try {
      const response = await apiClient.get('/users/statistics');
      setStatistics(response.data);
    } catch (e) {
      // ignore
    }
  }, []);

  const fetchReferenceData = useCallback(async () => {
    try {
      const [rolesRes, deptsRes, branchesRes, warehousesRes] = await Promise.all([
        apiClient.get('/roles'),
        apiClient.get('/departments'),
        apiClient.get('/branches'),
        apiClient.get('/warehouses'),
      ]);
      setRoles(rolesRes.data);
      setDepartments(deptsRes.data);
      setBranches(branchesRes.data);
      setWarehouses(warehousesRes.data);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchReferenceData();
  }, [fetchReferenceData]);

  useEffect(() => {
    fetchUsers();
    fetchStatistics();
  }, [fetchUsers, fetchStatistics]);

  const filteredUsers = users.filter((u) => {
    const search = filters.search.toLowerCase();
    const matchSearch =
      u.name.toLowerCase().includes(search) ||
      u.email.toLowerCase().includes(search) ||
      u.employee_id.toLowerCase().includes(search);
    const matchStatus = filters.status === 'All Status' || u.status === filters.status;
    const matchRole = filters.role === 'All Roles' || u.role?.slug === filters.role;
    return matchSearch && matchStatus && matchRole;
  });

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleCreateUser = async (data: Partial<ApiUser> & { password?: string }) => {
    try {
      await apiClient.post('/users', {
        name: data.name,
        email: data.email,
        password: data.password || 'password123',
        employee_id: data.employee_id,
        role_id: data.role_id,
        department_id: data.department_id,
        branch_id: data.branch_id,
        warehouse_id: data.warehouse_id,
        status: data.status || 'ACTIVE',
      });
      await fetchUsers();
      await fetchStatistics();
      setIsAddUserModalOpen(false);
    } catch (e) {
      alert(getApiErrorMessage(e));
    }
  };

  const handleEditUser = async (data: Partial<ApiUser> & { password?: string }) => {
    if (!editUser) return;
    try {
      const { password: _password, ...updatePayload } = data;
      await apiClient.put(`/users/${editUser.id}`, updatePayload);
      await fetchUsers();
      await fetchStatistics();
      setEditUser(null);
    } catch (e) {
      alert(getApiErrorMessage(e));
    }
  };

  const handleApprove = async (user: ApiUser) => {
    try {
      await apiClient.post(`/users/${user.id}/approve`);
      await fetchUsers();
      await fetchStatistics();
    } catch (e) {
      alert(getApiErrorMessage(e));
    }
  };

  const handleSuspend = async (user: ApiUser) => {
    try {
      await apiClient.post(`/users/${user.id}/suspend`);
      await fetchUsers();
      await fetchStatistics();
    } catch (e) {
      alert(getApiErrorMessage(e));
    }
  };

  const handleActivate = async (user: ApiUser) => {
    try {
      await apiClient.post(`/users/${user.id}/activate`);
      await fetchUsers();
      await fetchStatistics();
    } catch (e) {
      alert(getApiErrorMessage(e));
    }
  };

  const resetFilters = () => {
    setFilters({
      search: '',
      status: 'All Status',
      role: 'All Roles',
    });
    setCurrentPage(1);
  };

  return (
    <div className="w-full px-6 py-8 space-y-6 text-white">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}
      {/* 1. PAGE HEADER */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">User Management</h1>
        <p className="text-xs text-gray-400 mt-1">
          Manage employee accounts, roles, warehouse assignments, departments, and system permissions.
        </p>
      </div>

      {/* 2. STAT CARDS (4 Columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="TOTAL USERS" value={statistics.total} icon={<Users className="w-5 h-5" />} />
        <KPICard label="ACTIVE USERS" value={statistics.active} icon={<UserCheck className="w-5 h-5" />} />
        <KPICard label="PENDING APPROVAL" value={statistics.pending} icon={<Clock className="w-5 h-5" />} />
        <KPICard label="SUSPENDED ACCOUNTS" value={statistics.suspended} icon={<AlertCircle className="w-5 h-5" />} />
      </div>

      {/* 3. TOOLBAR (Search, Filters, Export, New User) */}
      <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Search users..."
            className="w-full bg-gray-800/50 border-gray-700 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="min-w-[130px]">
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full bg-gray-800/50 border-gray-700 px-3 py-2 text-xs rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-200 appearance-none cursor-pointer"
            >
              {STATUSES.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[130px]">
            <select
              value={filters.role}
              onChange={(e) => setFilters({ ...filters, role: e.target.value })}
              className="w-full bg-gray-800/50 border-gray-700 px-3 py-2 text-xs rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-colors duration-200 appearance-none cursor-pointer"
            >
              <option value="All Roles">All Roles</option>
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/50 border border-gray-700 text-xs font-medium text-white rounded-lg hover:bg-gray-800 transition"
          >
            <Filter className="w-3.5 h-3.5" /> Reset
          </button>

          <div className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800/50 p-1" aria-label="User view">
            <button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} title="List view" className={`rounded-md p-1.5 transition-colors ${viewMode === 'list' ? 'bg-[#092635] text-white' : 'text-gray-400 hover:text-white'}`}><LayoutList className="h-4 w-4" /></button>
            <button type="button" onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} title="Grid view" className={`rounded-md p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-[#092635] text-white' : 'text-gray-400 hover:text-white'}`}><LayoutGrid className="h-4 w-4" /></button>
          </div>

          <button
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/50 border border-gray-700 text-xs font-medium text-white rounded-lg hover:bg-gray-800 transition"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>

          <button onClick={() => setIsAddUserModalOpen(true)} className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 rounded-lg transition shadow-lg shadow-[#092635]/20">
            <UserPlus className="w-3.5 h-3.5" /> + New User
          </button>
        </div>
      </div>

      {/* 4. TABLE CONTAINER */}
      <div className="bg-[#0b101d] border border-slate-800/80 rounded-xl overflow-hidden shadow-xl mt-6">
        {viewMode === 'list' ? (
        <div className="overflow-x-auto w-full">
          <table className="w-full table-auto text-left text-xs text-gray-300 border-collapse">
            <thead className="bg-[#0b101d] border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="text-left pl-4 py-4 whitespace-nowrap">USER</th>
                <th className="text-left px-4 py-4 whitespace-nowrap">EMPLOYEE ID</th>
                <th className="text-left px-4 py-4 whitespace-nowrap">DEPARTMENT</th>
                <th className="text-left px-4 py-4 whitespace-nowrap">ROLE</th>
                <th className="text-left px-4 py-4 whitespace-nowrap">BRANCH</th>
                <th className="text-left px-4 py-4 whitespace-nowrap">WAREHOUSE</th>
                <th className="text-left px-4 py-4 whitespace-nowrap">STATUS</th>
                <th className="text-center px-4 pr-4 py-4 whitespace-nowrap">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading...</td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">No users found</td>
                </tr>
              ) : (
                paginatedUsers.map((u) => {
                  const displayName = u.name || 'Unnamed';
                  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <tr key={u.id} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                      <td className="pl-4 pr-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 font-bold flex items-center justify-center text-xs border border-blue-500/30">
                            {initials}
                          </div>
                          <div>
                            <div className="font-semibold text-white text-xs">{displayName}</div>
                            <div className="text-[10px] text-gray-400">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-gray-300 font-mono text-[11px]">{u.employee_id}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-gray-300">{u.department?.name || '-'}</td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
                          {u.role?.slug || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-gray-300">{u.branch?.code || '-'}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-gray-300">{u.warehouse?.code || '-'}</td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 w-fit ${
                          u.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          u.status === 'PENDING' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          u.status === 'SUSPENDED' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                          'bg-slate-500/10 text-gray-400 border border-slate-500/20'
                        }`}>
                          • {u.status}
                        </span>
                      </td>
                      <td className="px-4 pr-4 py-4 whitespace-nowrap flex justify-center items-center gap-3">
                        <div className="flex items-center gap-3 text-gray-400">
                          <button onClick={() => setViewUser(u)} className="p-1 hover:text-white transition"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => setEditUser(u)} className="p-1 hover:text-white transition"><Edit className="w-4 h-4" /></button>
                          {u.status === 'PENDING' && (
                            <button onClick={() => handleApprove(u)} className="p-1 hover:text-green-400 transition" title="Approve"><Check className="w-4 h-4" /></button>
                          )}
                          {u.status === 'ACTIVE' && (
                            <button onClick={() => handleSuspend(u)} className="p-1 hover:text-red-400 transition" title="Suspend"><UserX className="w-4 h-4" /></button>
                          )}
                          {u.status === 'SUSPENDED' && (
                            <button onClick={() => handleActivate(u)} className="p-1 hover:text-green-400 transition" title="Activate"><UserCheck className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        ) : isLoading ? (
          <div className="px-4 py-8 text-center text-gray-400">Loading...</div>
        ) : paginatedUsers.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {paginatedUsers.map((u) => {
              const displayName = u.name || 'Unnamed';
              const initials = displayName.split(' ').map((name) => name[0]).join('').slice(0, 2).toUpperCase();
              return (
                <article key={u.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-500/30 bg-blue-600/20 text-xs font-bold text-blue-600 dark:text-blue-400">{initials}</div><div className="min-w-0 flex-1"><h3 className="truncate font-semibold text-slate-900 dark:text-white">{displayName}</h3><p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.email}</p></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${u.status === 'ACTIVE' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : u.status === 'PENDING' ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>{u.status}</span></div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-500 dark:text-slate-400">Employee ID</dt><dd className="font-mono text-slate-900 dark:text-white">{u.employee_id}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Role</dt><dd className="text-slate-900 dark:text-white">{u.role?.slug || '—'}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Department</dt><dd className="text-slate-900 dark:text-white">{u.department?.name || '—'}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Warehouse</dt><dd className="text-slate-900 dark:text-white">{u.warehouse?.code || '—'}</dd></div></dl>
                  <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3 text-slate-500 dark:border-slate-700 dark:text-slate-400"><button onClick={() => setViewUser(u)} className="p-1 hover:text-slate-900 dark:hover:text-white" title="View"><Eye className="h-4 w-4" /></button><button onClick={() => setEditUser(u)} className="p-1 hover:text-slate-900 dark:hover:text-white" title="Edit"><Edit className="h-4 w-4" /></button>{u.status === 'PENDING' && <button onClick={() => handleApprove(u)} className="p-1 hover:text-green-500" title="Approve"><Check className="h-4 w-4" /></button>}{u.status === 'ACTIVE' && <button onClick={() => handleSuspend(u)} className="p-1 hover:text-red-500" title="Suspend"><UserX className="h-4 w-4" /></button>}{u.status === 'SUSPENDED' && <button onClick={() => handleActivate(u)} className="p-1 hover:text-green-500" title="Activate"><UserCheck className="h-4 w-4" /></button>}</div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-gray-400">No users found</div>
        )}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredUsers.length}
          itemsPerPage={itemsPerPage}
        />
      </div>

      {isAddUserModalOpen && (
        <UserModal
          isOpen={isAddUserModalOpen}
          onClose={() => setIsAddUserModalOpen(false)}
          onSave={handleCreateUser}
          roles={roles}
          departments={departments}
          branches={branches}
          warehouses={warehouses}
        />
      )}

      {editUser && (
        <UserModal
          isOpen={!!editUser}
          onClose={() => setEditUser(null)}
          user={editUser}
          onSave={handleEditUser}
          roles={roles}
          departments={departments}
          branches={branches}
          warehouses={warehouses}
        />
      )}

      {viewUser && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setViewUser(null)} />
          <div className="fixed inset-y-0 right-0 flex max-w-full">
            <div className="w-screen max-w-md transform transition ease-in-out duration-500 sm:duration-700">
              <div className="flex h-full flex-col overflow-y-auto bg-[#0d1322] border-l border-gray-800 shadow-xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                  <h2 className="text-lg font-semibold text-white">User Details</h2>
                  <button onClick={() => setViewUser(null)} className="text-gray-400 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-blue-500/20 border-2 border-blue-500/30 flex items-center justify-center text-2xl font-bold text-blue-400">
                      {(viewUser.name || 'U').substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-lg">{viewUser.name || 'Unnamed'}</h3>
                      <p className="text-gray-400 text-sm">{viewUser.email}</p>
                      <span className={(
                        'mt-3 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ' +
                        (viewUser.status === 'ACTIVE' ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                         viewUser.status === 'PENDING' ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' :
                         viewUser.status === 'SUSPENDED' ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                         'text-gray-400 bg-gray-400/10 border-gray-400/20')
                      )}>
                        {viewUser.status}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-800/50">
                      <p className="text-gray-400 text-xs mb-1">Employee ID</p>
                      <p className="text-white text-sm font-medium">{viewUser.employee_id}</p>
                    </div>
                    <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-800/50">
                      <p className="text-gray-400 text-xs mb-1">Department</p>
                      <p className="text-white text-sm font-medium">{viewUser.department?.name || '-'}</p>
                    </div>
                    <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-800/50">
                      <p className="text-gray-400 text-xs mb-1">Role</p>
                      <p className="text-white text-sm font-medium">{viewUser.role?.slug || '-'}</p>
                    </div>
                    <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-800/50">
                      <p className="text-gray-400 text-xs mb-1">Branch</p>
                      <p className="text-white text-sm font-medium">{viewUser.branch?.name || '-'}</p>
                    </div>
                    <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-800/50">
                      <p className="text-gray-400 text-xs mb-1">Warehouse</p>
                      <p className="text-white text-sm font-medium">{viewUser.warehouse?.name || '-'}</p>
                    </div>
                    <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-800/50">
                      <p className="text-gray-400 text-xs mb-1">Status</p>
                      <p className="text-white text-sm font-medium">{viewUser.status}</p>
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
