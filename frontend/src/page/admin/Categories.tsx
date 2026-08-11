// src/pages/admin/Categories.tsx
import React, { useState, useMemo } from 'react';
import {
  ChevronRight,
  Search,
  Plus,
  Layers,
  Edit,
  Archive,
  X,
  FolderOpen,
  Eye,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Save,
  Folder,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface Category {
  id: string;
  name: string;
  code: string;
  description: string;
  productCount: number;
  status: 'Active' | 'Archived';
  createdDate: string;
  lastUpdated: string;
}

// ============================================
// MOCK DATA
// ============================================

const mockCategories: Category[] = [
  {
    id: '1',
    name: 'Electronics',
    code: 'CAT-001',
    description: 'Consumer & industrial electronics',
    productCount: 214,
    status: 'Active',
    createdDate: '2026-01-15',
    lastUpdated: '2026-07-28 14:30',
  },
  {
    id: '2',
    name: 'Packaging',
    code: 'CAT-002',
    description: 'Boxes, wraps, fillers',
    productCount: 128,
    status: 'Active',
    createdDate: '2026-01-20',
    lastUpdated: '2026-07-30 09:15',
  },
  {
    id: '3',
    name: 'Raw Materials',
    code: 'CAT-003',
    description: 'Base production inputs',
    productCount: 96,
    status: 'Active',
    createdDate: '2026-02-01',
    lastUpdated: '2026-07-31 11:45',
  },
  {
    id: '4',
    name: 'Tools & Hardware',
    code: 'CAT-004',
    description: 'Hand and power tools',
    productCount: 154,
    status: 'Active',
    createdDate: '2026-02-10',
    lastUpdated: '2026-07-29 16:20',
  },
  {
    id: '5',
    name: 'Safety Equipment',
    code: 'CAT-005',
    description: 'PPE and site safety',
    productCount: 63,
    status: 'Active',
    createdDate: '2026-03-05',
    lastUpdated: '2026-07-28 10:00',
  },
  {
    id: '6',
    name: 'Office Supplies',
    code: 'CAT-006',
    description: 'Admin consumables',
    productCount: 88,
    status: 'Archived',
    createdDate: '2026-03-15',
    lastUpdated: '2026-07-25 13:30',
  },
];

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<
    string,
    { color: string; bg: string; dotColor: string }
  > = {
    Active: {
      color: 'text-emerald-400',
      bg: 'bg-emerald-950/60 border-emerald-800/60',
      dotColor: 'bg-emerald-400',
    },
    Archived: {
      color: 'text-slate-400',
      bg: 'bg-slate-800/60 border-slate-700/60',
      dotColor: 'bg-slate-400',
    },
  };
  const { color, bg, dotColor } = config[status] || config['Active'];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color} ${bg}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {status}
    </span>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const Categories: React.FC = () => {
  // State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    let result = mockCategories.filter((c) => {
      const matchSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase()) ||
        c.description.toLowerCase().includes(search.toLowerCase());
      const matchStatus =
        statusFilter === 'All Status' || c.status === statusFilter;
      return matchSearch && matchStatus;
    });

    // Sort by name
    result.sort((a, b) => a.name.localeCompare(b.name));

    return result;
  }, [search, statusFilter]);

  const totalPages = Math.ceil(filteredCategories.length / itemsPerPage);
  const paginatedCategories = filteredCategories.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const openViewModal = (category: Category) => {
    setSelectedCategory(category);
    setShowViewModal(true);
  };

  const openEditModal = (category: Category) => {
    setSelectedCategory(category);
    setShowEditModal(true);
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span>Admin</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-100">Categories</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Category Management</h1>
          <p className="text-sm text-slate-400">
            Group products for reporting, forecasting and reorder policies
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" /> Add Category
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search categories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#0f172a]/80 border border-slate-800/80 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all"
        />
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {paginatedCategories.map((category) => (
          <div
            key={category.id}
            className="bg-[#0f172a]/70 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all shadow-sm"
          >
            {/* Card Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    {category.name}
                  </h3>
                  <p className="text-xs text-slate-400">{category.code}</p>
                </div>
              </div>
              <StatusBadge status={category.status} />
            </div>

            {/* Description */}
            <p className="text-sm text-slate-400 flex-1">
              {category.description}
            </p>

            {/* Card Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800/60">
              <span className="text-sm text-slate-300">
                <span className="font-bold text-white">
                  {category.productCount}
                </span>{' '}
                products
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openViewModal(category)}
                  className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-200 transition-all"
                  title="View Category"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => openEditModal(category)}
                  className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-200 transition-all"
                  title="Edit Category"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-200 transition-all"
                  title={category.status === 'Active' ? 'Archive' : 'Restore'}
                >
                  {category.status === 'Active' ? (
                    <Archive className="w-4 h-4" />
                  ) : (
                    <Folder className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredCategories.length === 0 && (
        <div className="bg-[#0f172a]/60 border border-slate-800/80 rounded-2xl p-8 text-center">
          <FolderOpen className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-400">No categories found matching your search.</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-3 border-t border-slate-800/60">
          <div className="text-sm text-slate-400">
            Showing{' '}
            <span className="text-white font-medium">
              {(currentPage - 1) * itemsPerPage + 1}
            </span>{' '}
            to{' '}
            <span className="text-white font-medium">
              {Math.min(currentPage * itemsPerPage, filteredCategories.length)}
            </span>{' '}
            of{' '}
            <span className="text-white font-medium">
              {filteredCategories.length}
            </span>{' '}
            categories
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-1 rounded-xl text-sm font-medium transition-all ${
                  currentPage === page
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() =>
                setCurrentPage(Math.min(totalPages, currentPage + 1))
              }
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* ADD CATEGORY MODAL (UI ONLY) */}
      {/* ============================================ */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Add New Category</h2>
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
                  Category Name *
                </label>
                <input
                  type="text"
                  className="w-full bg-[#090d16] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="Enter category name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Category Code
                </label>
                <input
                  type="text"
                  className="w-full bg-[#090d16] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="e.g., CAT-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Description
                </label>
                <textarea
                  rows={3}
                  className="w-full bg-[#090d16] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="Enter category description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Status
                </label>
                <select className="w-full bg-[#090d16] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                  <option>Active</option>
                  <option>Archived</option>
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
                  <Save className="w-4 h-4" /> Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* EDIT CATEGORY MODAL (UI ONLY) */}
      {/* ============================================ */}
      {showEditModal && selectedCategory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Edit Category</h2>
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
                  Category Name *
                </label>
                <input
                  type="text"
                  defaultValue={selectedCategory.name}
                  className="w-full bg-[#090d16] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Category Code
                </label>
                <input
                  type="text"
                  defaultValue={selectedCategory.code}
                  className="w-full bg-[#090d16] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Description
                </label>
                <textarea
                  rows={3}
                  defaultValue={selectedCategory.description}
                  className="w-full bg-[#090d16] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Status
                </label>
                <select
                  defaultValue={selectedCategory.status}
                  className="w-full bg-[#090d16] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                >
                  <option>Active</option>
                  <option>Archived</option>
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
                  <Save className="w-4 h-4" /> Update Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* VIEW CATEGORY MODAL (UI ONLY) */}
      {/* ============================================ */}
      {showViewModal && selectedCategory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowViewModal(false)}
        >
          <div
            className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Category Details</h2>
              <button
                onClick={() => setShowViewModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              <div className="flex items-center justify-between p-4 rounded-xl bg-[#090d16] border border-slate-800">
                <div>
                  <p className="text-sm text-slate-400">Category Name</p>
                  <p className="text-lg font-semibold text-white mt-1">
                    {selectedCategory.name}
                  </p>
                </div>
                <StatusBadge status={selectedCategory.status} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[#090d16] border border-slate-800">
                  <p className="text-xs text-slate-400">Category Code</p>
                  <p className="text-sm font-mono text-white mt-1">
                    {selectedCategory.code}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[#090d16] border border-slate-800">
                  <p className="text-xs text-slate-400">Products</p>
                  <p className="text-lg font-semibold text-white mt-1">
                    {selectedCategory.productCount}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#090d16] border border-slate-800">
                <p className="text-xs text-slate-400">Description</p>
                <p className="text-sm text-white mt-1">
                  {selectedCategory.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-xl bg-[#090d16] border border-slate-800">
                  <p className="text-xs text-slate-400">Created</p>
                  <p className="text-sm text-white mt-0.5">
                    {selectedCategory.createdDate}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#090d16] border border-slate-800">
                  <p className="text-xs text-slate-400">Last Updated</p>
                  <p className="text-sm text-white mt-0.5">
                    {selectedCategory.lastUpdated}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  onClick={() => setShowViewModal(false)}
                  className="px-5 py-2.5 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-all"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    openEditModal(selectedCategory);
                  }}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 text-slate-950"
                >
                  <Edit className="w-4 h-4" /> Edit Category
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Categories;