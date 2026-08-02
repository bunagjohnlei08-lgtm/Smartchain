// src/pages/admin/Suppliers.tsx
import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  ChevronRight,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  CheckCircle,
  MoreVertical,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Eye,
  Edit,
  Download,
  Printer,
  RefreshCw,
  Grid,
  List,
  X,
  Save,
  ExternalLink,
  AlertCircle,
  Clock,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface Supplier {
  id: string;
  code: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  location: string;
  openPOs: number;
  paymentTerms: string;
  status: 'Active' | 'On Hold' | 'Inactive';
}

// ============================================
// MOCK DATA
// ============================================

const mockSuppliers: Supplier[] = [
  {
    id: '1',
    code: 'SUP-001',
    name: 'Northwind Traders',
    contactPerson: 'Elena Vasquez',
    email: 'elena@northwind.co',
    phone: '+1 415 220 8891',
    location: 'Seattle, WA',
    openPOs: 4,
    paymentTerms: 'Net 30',
    status: 'Active',
  },
  {
    id: '2',
    code: 'SUP-002',
    name: 'Kraft Industrial',
    contactPerson: 'Marcus Feld',
    email: 'm.feld@kraftind.de',
    phone: '+49 30 5540 1187',
    location: 'Berlin, Germany',
    openPOs: 2,
    paymentTerms: 'Net 60',
    status: 'Active',
  },
  {
    id: '3',
    code: 'SUP-003',
    name: 'Cebu Logistics Co.',
    contactPerson: 'Rina Delgado',
    email: 'rina@cebulog.ph',
    phone: '+63 32 415 7720',
    location: 'Cebu, Philippines',
    openPOs: 3,
    paymentTerms: 'Net 15',
    status: 'On Hold',
  },
  {
    id: '4',
    code: 'SUP-004',
    name: 'Apex Components',
    contactPerson: 'Daniel Okafor',
    email: 'd.okafor@apexcomp.uk',
    phone: '+44 20 7946 0332',
    location: 'Manchester, UK',
    openPOs: 5,
    paymentTerms: 'Net 30',
    status: 'Active',
  },
  {
    id: '5',
    code: 'SUP-005',
    name: 'Meridian Supply',
    contactPerson: 'Aiko Tanaka',
    email: 'aiko@meridian.jp',
    phone: '+81 3 6803 1120',
    location: 'Tokyo, Japan',
    openPOs: 1,
    paymentTerms: 'Net 45',
    status: 'Inactive',
  },
  {
    id: '6',
    code: 'SUP-006',
    name: 'Summit Logistics',
    contactPerson: 'Carlos Mendez',
    email: 'carlos@summitlog.com',
    phone: '+52 55 1234 5678',
    location: 'Mexico City, MX',
    openPOs: 0,
    paymentTerms: 'Net 30',
    status: 'Active',
  },
];

// ============================================
// CONSTANTS
// ============================================

const statusOptions = ['All', 'Active', 'On Hold', 'Inactive'];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { color: string; dotColor: string }> = {
    Active: {
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      dotColor: 'bg-emerald-400',
    },
    'On Hold': {
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      dotColor: 'bg-amber-400',
    },
    Inactive: {
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      dotColor: 'bg-rose-400',
    },
  };
  const { color, dotColor } = config[status] || config['Active'];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {status}
    </span>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const Suppliers: React.FC = () => {
  // State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  // Filtered suppliers
  const filteredSuppliers = useMemo(() => {
    return mockSuppliers.filter((s) => {
      const matchSearch =
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
        s.email.toLowerCase().includes(search.toLowerCase()) ||
        s.code.toLowerCase().includes(search.toLowerCase()) ||
        s.location.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter]);

  // KPI counts
  const totalSuppliers = mockSuppliers.length;
  const activeSuppliers = mockSuppliers.filter((s) => s.status === 'Active').length;
  const onHoldSuppliers = mockSuppliers.filter((s) => s.status === 'On Hold').length;
  const inactiveSuppliers = mockSuppliers.filter((s) => s.status === 'Inactive').length;
  const totalOpenPOs = mockSuppliers.reduce((sum, s) => sum + s.openPOs, 0);

  const handleEdit = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setShowEditModal(true);
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6 bg-[#0b0f19] text-slate-100">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span>Admin</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-100">Suppliers</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Suppliers</h1>
          <p className="text-sm text-slate-400">Manage vendor relationships, contacts, and performance metrics</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            className="p-2.5 rounded-xl border border-slate-800/80 text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            className="p-2.5 rounded-xl border border-slate-800/80 text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors"
            title="Export"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            className="p-2.5 rounded-xl border border-slate-800/80 text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors"
            title="Print"
          >
            <Printer className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'cards'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
              title="Card View"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'table'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Supplier
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-4 text-center hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Total Suppliers</p>
          <p className="text-2xl font-bold text-white mt-1">{totalSuppliers}</p>
        </div>
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-4 text-center hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Active Vendors</p>
          <p className="text-2xl font-bold text-white mt-1">{activeSuppliers}</p>
        </div>
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-4 text-center hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider">On Hold</p>
          <p className="text-2xl font-bold text-white mt-1">{onHoldSuppliers}</p>
        </div>
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-4 text-center hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Open POs</p>
          <p className="text-2xl font-bold text-white mt-1">{totalOpenPOs}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#0f172a]/60 border border-slate-800/80 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1 bg-slate-800/50 rounded-full p-1">
            {statusOptions.map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  statusFilter === status
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by supplier name, contact, or ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-[#0f172a] border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 w-full sm:w-64"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Supplier Cards Grid */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map((supplier) => (
            <div
              key={supplier.id}
              className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-5 hover:border-slate-600 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{supplier.name}</p>
                    <p className="text-xs text-slate-400">{supplier.code}</p>
                  </div>
                </div>
                <StatusBadge status={supplier.status} />
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-slate-300">
                  <User className="w-4 h-4 text-slate-400" />
                  <span>{supplier.contactPerson}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="truncate">{supplier.email}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span>{supplier.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span>{supplier.location}</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/60">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-slate-400">Open POs</p>
                    <p className="text-sm font-semibold text-white">{supplier.openPOs}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Terms</p>
                    <p className="text-sm font-medium text-slate-300">{supplier.paymentTerms}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleEdit(supplier)}
                  className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-100 transition-colors"
                  title="Edit Supplier"
                >
                  <Edit className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Supplier Table View */}
      {viewMode === 'table' && (
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-800/30 border-b border-slate-800/60">
                <tr>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Supplier
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Contact Person
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Phone / Location
                  </th>
                  <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400">
                    Open POs
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Payment Terms
                  </th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Status
                  </th>
                  <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <div>
                        <p className="text-sm font-medium text-white">{supplier.name}</p>
                        <p className="text-xs text-slate-400">{supplier.code}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div>
                        <p className="text-sm text-slate-300">{supplier.contactPerson}</p>
                        <p className="text-xs text-slate-400">{supplier.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div>
                        <p className="text-sm text-slate-300">{supplier.phone}</p>
                        <p className="text-xs text-slate-400">{supplier.location}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center text-sm font-medium text-white">
                      {supplier.openPOs}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">
                      {supplier.paymentTerms}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={supplier.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEdit(supplier)}
                          className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-100 transition-colors"
                          title="Edit Supplier"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-100 transition-colors"
                          title="View Details"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSuppliers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      No suppliers found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800/60 bg-slate-800/10">
            <div className="text-sm text-slate-400">
              Showing <span className="text-white font-medium">1</span> to{' '}
              <span className="text-white font-medium">{filteredSuppliers.length}</span> of{' '}
              <span className="text-white font-medium">{mockSuppliers.length}</span> suppliers
            </div>
            <div className="flex items-center gap-1">
              <button className="p-1.5 rounded-xl border border-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button className="px-3 py-1 rounded-xl text-sm font-medium bg-cyan-500 text-slate-950">
                1
              </button>
              <button className="p-1.5 rounded-xl border border-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors">
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* ADD SUPPLIER MODAL */}
      {/* ============================================ */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-[#0f172a] border border-slate-800/80 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Add New Supplier</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Supplier Name *
                </label>
                <input
                  type="text"
                  className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="Enter supplier name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Contact Person *
                </label>
                <input
                  type="text"
                  className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="Full name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">
                    Email *
                  </label>
                  <input
                    type="email"
                    className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    placeholder="contact@company.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">
                    Phone *
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    placeholder="+1 234 567 8900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Location
                </label>
                <input
                  type="text"
                  className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="City, Country"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Payment Terms
                </label>
                <select className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                  <option>Net 15</option>
                  <option>Net 30</option>
                  <option>Net 45</option>
                  <option>Net 60</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Status
                </label>
                <select className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                  <option>Active</option>
                  <option>On Hold</option>
                  <option>Inactive</option>
                </select>
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 text-slate-950"
                >
                  <Save className="w-4 h-4" /> Add Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* EDIT SUPPLIER MODAL */}
      {/* ============================================ */}
      {showEditModal && selectedSupplier && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="bg-[#0f172a] border border-slate-800/80 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Edit Supplier</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Supplier Name *
                </label>
                <input
                  type="text"
                  defaultValue={selectedSupplier.name}
                  className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Contact Person *
                </label>
                <input
                  type="text"
                  defaultValue={selectedSupplier.contactPerson}
                  className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">
                    Email *
                  </label>
                  <input
                    type="email"
                    defaultValue={selectedSupplier.email}
                    className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">
                    Phone *
                  </label>
                  <input
                    type="text"
                    defaultValue={selectedSupplier.phone}
                    className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Location
                </label>
                <input
                  type="text"
                  defaultValue={selectedSupplier.location}
                  className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Payment Terms
                </label>
                <select
                  defaultValue={selectedSupplier.paymentTerms}
                  className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                >
                  <option>Net 15</option>
                  <option>Net 30</option>
                  <option>Net 45</option>
                  <option>Net 60</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Status
                </label>
                <select
                  defaultValue={selectedSupplier.status}
                  className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                >
                  <option>Active</option>
                  <option>On Hold</option>
                  <option>Inactive</option>
                </select>
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-5 py-2.5 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 text-slate-950"
                >
                  <Save className="w-4 h-4" /> Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Suppliers;