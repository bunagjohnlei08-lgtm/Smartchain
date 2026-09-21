import React, { useState, useEffect, useCallback } from 'react';
import { useAdminDetailOverlay } from '../../components/layout/AdminDetailOverlayContext';
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
  Mail,
  Send,
  X,
  Filter,
  Users,
  LayoutGrid,
  LayoutList,
} from 'lucide-react';
import type { ApiUser, ApiRole, ApiDepartment, ApiBranch, ApiWarehouse } from '../../types';
import type { AxiosError } from 'axios';
import { apiClient } from '../../lib/api';
import AuditLogSection from './AuditLogSection';

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

const MAIN_WAREHOUSE_CODE = 'WH-MAIN';

/** Resolve the Main Warehouse by its stable code (name as fallback), never by numeric id. */
function findMainWarehouse(warehouses: ApiWarehouse[]): ApiWarehouse | undefined {
  return warehouses.find((w) => w.code === MAIN_WAREHOUSE_CODE)
    ?? warehouses.find((w) => w.name === 'Main Warehouse');
}

const STATUSES = ['All Status', 'ACTIVE', 'PENDING', 'SUSPENDED'];

/** Invited but never activated: only the emailed link can activate it. */
function isAwaitingActivation(user: ApiUser): boolean {
  return user.status === 'PENDING' && !!user.invited_at && !user.activated_at;
}
const ROLE_OPTIONS = ['PLANT_MANAGER', 'QA_SUPERVISOR'];

const KPICard: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
}> = ({ label, value, icon }) => (
  <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-5 hover:border-[#5B8CFF]/30 transition-all duration-200 h-full flex flex-col">
    <div className="flex items-start justify-between flex-1">
      <div>
        <p className="admin-kpi-title text-gray-400 text-xs font-medium uppercase tracking-wider">{label}</p>
        <p className="admin-kpi-value text-2xl font-bold text-white mt-1.5">{value}</p>
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
                ? 'bg-slate-200 text-slate-900 dark:bg-[#5B8CFF] dark:text-white'
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
  onSave: (data: Partial<ApiUser>) => void;
  roles: ApiRole[];
  departments: ApiDepartment[];
  branches: ApiBranch[];
  warehouses: ApiWarehouse[];
}> = ({ isOpen, onClose, user, onSave, roles, departments, branches, warehouses }) => {
  // New accounts get no password and no client-chosen status: the server
  // creates them PENDING and emails an activation invitation.
  const initialFormData: Partial<ApiUser> = user ? { ...user } : {
    name: '',
    email: '',
    department_id: undefined,
    role_id: undefined,
    warehouse_id: undefined,
    branch_id: undefined,
  };

  const [formData, setFormData] = useState<Partial<ApiUser>>(initialFormData);
  const mainWarehouse = findMainWarehouse(warehouses);
  // An invited account can only become ACTIVE through its activation link.
  const statusOptions = STATUSES.filter((s) => s !== 'All Status' && !(s === 'ACTIVE' && user && isAwaitingActivation(user)));

  useEffect(() => {
    if (user) {
      setFormData({ ...user });
    }
  }, [user]);

  // Warehouses load asynchronously; assign Main Warehouse once it is known.
  useEffect(() => {
    if (!user && mainWarehouse) {
      setFormData((current) => (current.warehouse_id ? current : { ...current, warehouse_id: mainWarehouse.id }));
    }
  }, [user, mainWarehouse]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  const renderRoleSelect = (id?: string) => (
    <select
      id={id}
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
  );

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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          {user ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-400">Role *</label>
                  {renderRoleSelect()}
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
            </>
          ) : (
            <>
              {/* Employee ID is generated by the server; admins never type it. */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="create-user-status" className="block text-sm font-medium mb-2 text-gray-400">Status</label>
                  <input
                    id="create-user-status"
                    type="text"
                    value="PENDING (until activated)"
                    readOnly
                    aria-readonly="true"
                    className="w-full h-11 cursor-not-allowed bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-gray-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="create-user-role" className="block text-sm font-medium mb-2 text-gray-400">Role *</label>
                  {renderRoleSelect('create-user-role')}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="create-user-warehouse" className="block text-sm font-medium mb-2 text-gray-400">Warehouse</label>
                  {/* Single-warehouse operation: every new account joins the Main Warehouse. */}
                  <input
                    id="create-user-warehouse"
                    type="text"
                    value={mainWarehouse?.name ?? 'Main Warehouse'}
                    readOnly
                    aria-readonly="true"
                    className="w-full h-11 cursor-not-allowed bg-gray-800/50 border-gray-700 rounded-lg px-4 text-sm text-gray-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-[#5B8CFF]/20 bg-[#5B8CFF]/10 p-3 text-xs text-gray-300">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#5B8CFF]" aria-hidden="true" />
                <p>
                  An activation invitation will be emailed to this address. The user sets their own
                  password through the single-use link before they can sign in. An Employee ID is
                  assigned automatically.
                </p>
              </div>
            </>
          )}

          {user && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          )}

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
  useAdminDetailOverlay(viewUser !== null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [resendingId, setResendingId] = useState<number | null>(null);

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
      (u.employee_id ?? '').toLowerCase().includes(search);
    const matchStatus = filters.status === 'All Status' || u.status === filters.status;
    const matchRole = filters.role === 'All Roles' || u.role?.slug === filters.role;
    return matchSearch && matchStatus && matchRole;
  });

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleCreateUser = async (data: Partial<ApiUser>) => {
    try {
      const response = await apiClient.post('/users', {
        name: data.name,
        email: data.email,
        role_id: data.role_id,
        // Omitted when unresolved: the API then assigns the Main Warehouse itself.
        warehouse_id: data.warehouse_id ?? findMainWarehouse(warehouses)?.id,
      });
      const sent = response.data?.invitation?.sent === true;
      setNotice({
        tone: sent ? 'success' : 'warning',
        text: response.data?.message
          ?? (sent
            ? 'User created. An activation invitation has been sent to their email.'
            : 'User created, but the invitation email could not be sent. Use Resend Invitation to try again.'),
      });
      await fetchUsers();
      await fetchStatistics();
      setIsAddUserModalOpen(false);
    } catch (e) {
      alert(getApiErrorMessage(e));
    }
  };

  const handleResendInvitation = async (user: ApiUser) => {
    if (resendingId !== null) return;
    setResendingId(user.id);
    try {
      const response = await apiClient.post(`/users/${user.id}/resend-invitation`);
      setNotice({ tone: 'success', text: response.data?.message ?? `A new invitation has been sent to ${user.email}.` });
      await fetchUsers();
    } catch (e) {
      setNotice({ tone: 'error', text: getApiErrorMessage(e) });
    } finally {
      setResendingId(null);
    }
  };

  const handleEditUser = async (data: Partial<ApiUser>) => {
    if (!editUser) return;
    try {
      const { invited_at: _invitedAt, activated_at: _activatedAt, ...updatePayload } = data;
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
      {notice && (
        <div
          role={notice.tone === 'success' ? 'status' : 'alert'}
          aria-live="polite"
          className={`flex items-start justify-between gap-3 rounded-xl border p-4 text-sm ${
            notice.tone === 'success' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' :
            notice.tone === 'warning' ? 'border-amber-500/20 bg-amber-500/10 text-amber-400' :
            'border-red-500/20 bg-red-500/10 text-red-400'
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" className="shrink-0 opacity-70 transition-opacity hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
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
        <div className="admin-user-search-wrap relative flex-1 min-w-[240px]">
          <Search className="admin-user-search-icon w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Search users..."
            className="admin-user-search-input w-full bg-gray-800/50 border-gray-700 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
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
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-600/50 dark:border-gray-700 dark:bg-gray-800/50 dark:text-white dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <Filter className="w-3.5 h-3.5" /> Reset
          </button>

          <div className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800/50 p-1" aria-label="User view">
            <button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} title="List view" className={`rounded-md p-1.5 transition-colors ${viewMode === 'list' ? 'bg-slate-200 text-slate-900 dark:bg-[#092635] dark:text-white' : 'text-gray-400 hover:text-white'}`}><LayoutList className="h-4 w-4" /></button>
            <button type="button" onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} title="Grid view" className={`rounded-md p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-slate-200 text-slate-900 dark:bg-[#092635] dark:text-white' : 'text-gray-400 hover:text-white'}`}><LayoutGrid className="h-4 w-4" /></button>
          </div>

          <button
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-600/50 dark:border-gray-700 dark:bg-gray-800/50 dark:text-white dark:hover:bg-gray-800 dark:hover:text-white"
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
        <div className="admin-table-scroll w-full">
          <table className="admin-user-table admin-responsive-table admin-cols-6 admin-sticky-1 w-full table-auto text-left text-xs text-gray-300 border-collapse">
            <thead className="bg-[#0b101d] border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="text-left pl-4 py-4 whitespace-nowrap">USER</th>
                <th className="text-left px-4 py-4 whitespace-nowrap">EMPLOYEE ID</th>
                <th className="text-left px-4 py-4 whitespace-nowrap">ROLE</th>
                <th className="text-left px-4 py-4 whitespace-nowrap">WAREHOUSE</th>
                <th className="text-left px-4 py-4 whitespace-nowrap">STATUS</th>
                <th className="text-center px-4 pr-4 py-4 whitespace-nowrap">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading...</td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No users found</td>
                </tr>
              ) : (
                paginatedUsers.map((u) => {
                  const displayName = u.name || 'Unnamed';
                  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <tr key={u.id} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                      <td className="pl-4 pr-4 py-4 whitespace-nowrap">
                        <div className="admin-user-identity flex items-center gap-3">
                          <div className="admin-user-avatar w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 font-bold flex shrink-0 items-center justify-center text-xs border border-blue-500/30">
                            {initials}
                          </div>
                          <div className="admin-user-copy min-w-0">
                            <div className="admin-user-name truncate font-semibold text-white text-xs" title={displayName}>{displayName}</div>
                            <div className="admin-user-email truncate text-[10px] text-gray-400" title={u.email}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-gray-300 font-mono text-[11px]">{u.employee_id}</td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="admin-badge px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
                          {u.role?.slug || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-gray-300">{u.warehouse?.code || '-'}</td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`admin-badge px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 w-fit ${
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
                            <button
                              onClick={() => handleResendInvitation(u)}
                              disabled={resendingId !== null}
                              className="p-1 hover:text-[#5B8CFF] transition disabled:cursor-not-allowed disabled:opacity-40"
                              title={resendingId === u.id ? 'Sending invitation...' : 'Resend Invitation'}
                              aria-label={`Resend invitation to ${u.email}`}
                              aria-busy={resendingId === u.id}
                            >
                              <Send className={`w-4 h-4 ${resendingId === u.id ? 'animate-pulse' : ''}`} />
                            </button>
                          )}
                          {u.status === 'PENDING' && !isAwaitingActivation(u) && (
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
                  <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-500/30 bg-blue-600/20 text-xs font-bold text-blue-600 dark:text-blue-400">{initials}</div><div className="min-w-0 flex-1"><h3 className="truncate font-semibold text-slate-900 dark:text-white">{displayName}</h3><p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.email}</p></div><span className={`admin-badge rounded-full border px-2.5 py-1 text-[10px] font-semibold ${u.status === 'ACTIVE' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : u.status === 'PENDING' ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>{u.status}</span></div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-500 dark:text-slate-400">Employee ID</dt><dd className="font-mono text-slate-900 dark:text-white">{u.employee_id}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Role</dt><dd className="text-slate-900 dark:text-white">{u.role?.slug || '—'}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Department</dt><dd className="text-slate-900 dark:text-white">{u.department?.name || '—'}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Warehouse</dt><dd className="text-slate-900 dark:text-white">{u.warehouse?.code || '—'}</dd></div></dl>
                  <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3 text-slate-500 dark:border-slate-700 dark:text-slate-400"><button onClick={() => setViewUser(u)} className="p-1 hover:text-slate-900 dark:hover:text-white" title="View"><Eye className="h-4 w-4" /></button><button onClick={() => setEditUser(u)} className="p-1 hover:text-slate-900 dark:hover:text-white" title="Edit"><Edit className="h-4 w-4" /></button>{u.status === 'PENDING' && <button onClick={() => handleResendInvitation(u)} disabled={resendingId !== null} className="p-1 hover:text-[#5B8CFF] disabled:cursor-not-allowed disabled:opacity-40" title={resendingId === u.id ? 'Sending invitation...' : 'Resend Invitation'} aria-label={`Resend invitation to ${u.email}`} aria-busy={resendingId === u.id}><Send className={`h-4 w-4 ${resendingId === u.id ? 'animate-pulse' : ''}`} /></button>}{u.status === 'PENDING' && !isAwaitingActivation(u) && <button onClick={() => handleApprove(u)} className="p-1 hover:text-green-500" title="Approve"><Check className="h-4 w-4" /></button>}{u.status === 'ACTIVE' && <button onClick={() => handleSuspend(u)} className="p-1 hover:text-red-500" title="Suspend"><UserX className="h-4 w-4" /></button>}{u.status === 'SUSPENDED' && <button onClick={() => handleActivate(u)} className="p-1 hover:text-green-500" title="Activate"><UserCheck className="h-4 w-4" /></button>}</div>
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

      {/* 5. AUDIT LOGS */}
      <AuditLogSection />

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
                <div className="flex items-center justify-between border-b border-gray-800 px-4 py-4 sm:px-6">
                  <h2 className="text-[22px] font-semibold text-white sm:text-lg">User Details</h2>
                  <button onClick={() => setViewUser(null)} aria-label="Close user details" className="inline-flex min-h-11 min-w-11 items-center justify-center text-gray-400 transition-colors hover:text-white sm:min-h-0 sm:min-w-0">
                    <X className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                </div>
                <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-blue-500/30 bg-blue-500/20 text-[20px] font-semibold text-blue-400 sm:text-2xl sm:font-bold">
                      {(viewUser.name || 'U').substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex min-w-0 flex-col items-start gap-1 sm:block">
                      <h3 className="max-w-full break-words text-[14px] font-semibold text-white sm:text-lg sm:[overflow-wrap:normal]">{viewUser.name || 'Unnamed'}</h3>
                      <p className="max-w-full break-words text-[10px] leading-[14px] text-gray-400 sm:text-sm sm:leading-normal sm:[overflow-wrap:normal]">{viewUser.email}</p>
                      <span className={(
                        'admin-badge mt-1 inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] font-medium sm:mt-3 sm:h-auto sm:px-2.5 sm:text-xs ' +
                        (viewUser.status === 'ACTIVE' ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                         viewUser.status === 'PENDING' ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' :
                         viewUser.status === 'SUSPENDED' ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                         'text-gray-400 bg-gray-400/10 border-gray-400/20')
                      )}>
                        {viewUser.status}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                    <div className="min-w-0 rounded-xl border border-gray-800/50 bg-gray-800/30 p-2.5 sm:p-3">
                      <p className="mb-1 text-[10px] font-medium text-gray-400 sm:text-xs sm:font-normal">Employee ID</p>
                      <p className="break-words text-[11px] font-medium text-white sm:text-sm sm:[overflow-wrap:normal]">{viewUser.employee_id}</p>
                    </div>
                    <div className="min-w-0 rounded-xl border border-gray-800/50 bg-gray-800/30 p-2.5 sm:p-3">
                      <p className="mb-1 text-[10px] font-medium text-gray-400 sm:text-xs sm:font-normal">Department</p>
                      <p className="break-words text-[11px] font-medium text-white sm:text-sm sm:[overflow-wrap:normal]">{viewUser.department?.name || '-'}</p>
                    </div>
                    <div className="min-w-0 rounded-xl border border-gray-800/50 bg-gray-800/30 p-2.5 sm:p-3">
                      <p className="mb-1 text-[10px] font-medium text-gray-400 sm:text-xs sm:font-normal">Role</p>
                      <p className="break-words text-[11px] font-medium text-white sm:text-sm sm:[overflow-wrap:normal]">{viewUser.role?.slug || '-'}</p>
                    </div>
                    <div className="min-w-0 rounded-xl border border-gray-800/50 bg-gray-800/30 p-2.5 sm:p-3">
                      <p className="mb-1 text-[10px] font-medium text-gray-400 sm:text-xs sm:font-normal">Branch</p>
                      <p className="break-words text-[11px] font-medium text-white sm:text-sm sm:[overflow-wrap:normal]">{viewUser.branch?.name || '-'}</p>
                    </div>
                    <div className="min-w-0 rounded-xl border border-gray-800/50 bg-gray-800/30 p-2.5 sm:p-3">
                      <p className="mb-1 text-[10px] font-medium text-gray-400 sm:text-xs sm:font-normal">Warehouse</p>
                      <p className="break-words text-[11px] font-medium text-white sm:text-sm sm:[overflow-wrap:normal]">{viewUser.warehouse?.name || '-'}</p>
                    </div>
                    <div className="min-w-0 rounded-xl border border-gray-800/50 bg-gray-800/30 p-2.5 sm:p-3">
                      <p className="mb-1 text-[10px] font-medium text-gray-400 sm:text-xs sm:font-normal">Status</p>
                      <p className="break-words text-[11px] font-medium text-white sm:text-sm sm:[overflow-wrap:normal]">{viewUser.status}</p>
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
