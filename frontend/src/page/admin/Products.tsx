// src/pages/admin/Products.tsx
import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Eye,
  Edit2,
  Trash2,
  X,
  Check,
  AlertTriangle,
  XCircle,
  Archive,
  RefreshCw,
  Download,
  Printer,
  Filter,
  Columns,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Save,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface Brand {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  brandId: string;
  unit: string;
  currentStock: number;
  reorderLevel: number;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock' | 'Archived';
  lastUpdated: string;
  image?: string;
  description?: string;
  warehouseLocation?: string;
  price?: number;
  cost?: number;
}

// ============================================
// MOCK DATA
// ============================================

const initialBrands: Brand[] = [
  { id: '1', name: 'Nordis' },
  { id: '2', name: 'Cebu Craft' },
  { id: '3', name: 'Kraftline' },
  { id: '4', name: 'Sentra' },
  { id: '5', name: 'Volt Systems' },
];

const initialProducts: Product[] = [
  {
    id: '1',
    name: 'Aluminium Profile 6m',
    sku: 'RAW-ALU-006',
    barcode: '8801234500097',
    category: 'Raw Materials',
    brandId: '1',
    unit: 'bar',
    currentStock: 240,
    reorderLevel: 90,
    status: 'In Stock',
    lastUpdated: '2026-08-01 10:30',
    warehouseLocation: 'WH-01-A-12',
    price: 45.0,
    cost: 32.0,
  },
  {
    id: '2',
    name: 'Archive Storage Binder',
    sku: 'OFF-BND-001',
    barcode: '8801234500134',
    category: 'Office Supplies',
    brandId: '2',
    unit: 'pcs',
    currentStock: 220,
    reorderLevel: 60,
    status: 'Archived',
    lastUpdated: '2026-07-28 14:15',
    warehouseLocation: 'WH-02-C-08',
    price: 12.5,
    cost: 8.0,
  },
  {
    id: '3',
    name: 'Cordless Impact Driver',
    sku: 'TLS-IMP-018',
    barcode: '8801234500042',
    category: 'Tools & Hardware',
    brandId: '3',
    unit: 'pcs',
    currentStock: 176,
    reorderLevel: 60,
    status: 'In Stock',
    lastUpdated: '2026-08-01 09:00',
    warehouseLocation: 'WH-03-B-05',
    price: 120.0,
    cost: 85.0,
  },
  {
    id: '4',
    name: 'Corrugated Box 60x40x40',
    sku: 'PKG-BOX-604',
    barcode: '8801234500028',
    category: 'Packaging',
    brandId: '3',
    unit: 'pcs',
    currentStock: 92,
    reorderLevel: 150,
    status: 'Low Stock',
    lastUpdated: '2026-07-31 16:45',
    warehouseLocation: 'WH-01-D-03',
    price: 2.8,
    cost: 1.9,
  },
  {
    id: '5',
    name: 'Digital Caliper 150mm',
    sku: 'TLS-CAL-150',
    barcode: '8801234500158',
    category: 'Tools & Hardware',
    brandId: '4',
    unit: 'pcs',
    currentStock: 41,
    reorderLevel: 35,
    status: 'In Stock',
    lastUpdated: '2026-07-30 11:20',
    warehouseLocation: 'WH-02-A-07',
    price: 68.0,
    cost: 45.0,
  },
  {
    id: '6',
    name: 'Hydraulic Hose 3/8"',
    sku: 'RAW-HYD-038',
    barcode: '8801234500141',
    category: 'Raw Materials',
    brandId: '1',
    unit: 'm',
    currentStock: 610,
    reorderLevel: 200,
    status: 'In Stock',
    lastUpdated: '2026-08-01 08:30',
    warehouseLocation: 'WH-03-C-11',
    price: 15.0,
    cost: 10.0,
  },
  {
    id: '7',
    name: 'Industrial LED Panel 40W',
    sku: 'ELC-LED-040',
    barcode: '8801234500111',
    category: 'Electronics',
    brandId: '5',
    unit: 'pcs',
    currentStock: 428,
    reorderLevel: 120,
    status: 'In Stock',
    lastUpdated: '2026-07-31 13:00',
    warehouseLocation: 'WH-01-B-09',
    price: 85.0,
    cost: 62.0,
  },
  {
    id: '8',
    name: 'Nitrile Gloves (Box 100)',
    sku: 'SAF-GLV-100',
    barcode: '8801234500080',
    category: 'Safety Equipment',
    brandId: '4',
    unit: 'box',
    currentStock: 0,
    reorderLevel: 50,
    status: 'Out of Stock',
    lastUpdated: '2026-07-30 09:15',
    warehouseLocation: 'WH-02-E-02',
    price: 22.0,
    cost: 15.0,
  },
  {
    id: '9',
    name: 'Stainless Steel Sheet 2mm',
    sku: 'RAW-SST-002',
    barcode: '8801234500059',
    category: 'Raw Materials',
    brandId: '1',
    unit: 'sheet',
    currentStock: 34,
    reorderLevel: 40,
    status: 'Low Stock',
    lastUpdated: '2026-08-01 10:00',
    warehouseLocation: 'WH-01-A-05',
    price: 120.0,
    cost: 85.0,
  },
  {
    id: '10',
    name: 'Pallet Wrap Film 500mm',
    sku: 'PKG-WRP-500',
    barcode: '8801234500073',
    category: 'Packaging',
    brandId: '3',
    unit: 'roll',
    currentStock: 74,
    reorderLevel: 120,
    status: 'Low Stock',
    lastUpdated: '2026-07-29 14:30',
    warehouseLocation: 'WH-03-D-06',
    price: 28.0,
    cost: 19.0,
  },
  {
    id: '11',
    name: 'Safety Helmet Class E',
    sku: 'SAF-HLM-001',
    barcode: '8801234500066',
    category: 'Safety Equipment',
    brandId: '4',
    unit: 'pcs',
    currentStock: 64,
    reorderLevel: 80,
    status: 'Low Stock',
    lastUpdated: '2026-07-28 16:00',
    warehouseLocation: 'WH-02-E-01',
    price: 35.0,
    cost: 24.0,
  },
  {
    id: '12',
    name: 'Servo Motor 400W',
    sku: 'ELC-SRV-400',
    barcode: '8801234500128',
    category: 'Electronics',
    brandId: '5',
    unit: 'pcs',
    currentStock: 24,
    reorderLevel: 30,
    status: 'Low Stock',
    lastUpdated: '2026-07-31 11:45',
    warehouseLocation: 'WH-01-B-12',
    price: 320.0,
    cost: 230.0,
  },
];

// ============================================
// CONSTANTS
// ============================================

const categories = [
  'All Categories',
  'Raw Materials',
  'Office Supplies',
  'Tools & Hardware',
  'Packaging',
  'Electronics',
  'Safety Equipment',
];
const statuses = ['All Status', 'In Stock', 'Low Stock', 'Out of Stock', 'Archived'];
const sortOptions = ['Name A–Z', 'Name Z–A', 'Stock Low–High', 'Stock High–Low'];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<
    string,
    { color: string; icon: React.ElementType }
  > = {
    'In Stock': {
      color: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
      icon: Check,
    },
    'Low Stock': {
      color: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
      icon: AlertTriangle,
    },
    'Out of Stock': {
      color: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
      icon: XCircle,
    },
    Archived: {
      color: 'bg-slate-800/60 text-slate-400 border border-slate-700/60',
      icon: Archive,
    },
  };
  const { color, icon: Icon } = config[status] || config['In Stock'];
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-medium border ${color} flex items-center gap-1.5 whitespace-nowrap`}
    >
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function Products() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [brandFilter, setBrandFilter] = useState('All Brands');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [sortBy, setSortBy] = useState('Name A–Z');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [brands, setBrands] = useState<Brand[]>(initialBrands);
  const [products, setProducts] = useState<Product[]>(initialProducts);

  const [newBrandName, setNewBrandName] = useState('');
  const [showNewBrandInput, setShowNewBrandInput] = useState(false);

  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    sku: '',
    barcode: '',
    category: '',
    brandId: '',
    unit: '',
    currentStock: 0,
    reorderLevel: 0,
    status: 'In Stock',
    description: '',
    warehouseLocation: '',
  });

  const totalProducts = products.length;
  const activeProducts = products.filter(p => p.status !== 'Archived').length;
  const lowStockProducts = products.filter(p => p.status === 'Low Stock').length;
  const outOfStockProducts = products.filter(p => p.status === 'Out of Stock').length;
  const totalCategories = new Set(products.map(p => p.category)).size;

  const filteredProducts = useMemo(() => {
    let result = products.filter(p => {
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode.includes(search);
      const matchCategory =
        categoryFilter === 'All Categories' || p.category === categoryFilter;
      const matchBrand =
        brandFilter === 'All Brands' ||
        p.brandId === brands.find(b => b.name === brandFilter)?.id;
      const matchStatus =
        statusFilter === 'All Status' || p.status === statusFilter;
      return matchSearch && matchCategory && matchBrand && matchStatus;
    });

    switch (sortBy) {
      case 'Name A–Z':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'Name Z–A':
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'Stock Low–High':
        result.sort((a, b) => a.currentStock - b.currentStock);
        break;
      case 'Stock High–Low':
        result.sort((a, b) => b.currentStock - a.currentStock);
        break;
      default:
        break;
    }

    return result;
  }, [search, categoryFilter, brandFilter, statusFilter, sortBy, products, brands]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getBrandName = (brandId: string): string => {
    const brand = brands.find(b => b.id === brandId);
    return brand ? brand.name : 'Unknown';
  };

  const openEditModal = (product: Product) => {
    setSelectedProduct(product);
    setFormData({ ...product });
    setShowEditModal(true);
  };

  const handleAddBrand = () => {
    if (newBrandName.trim()) {
      const newBrand: Brand = {
        id: String(Date.now()),
        name: newBrandName.trim(),
      };
      setBrands([...brands, newBrand]);
      setFormData({ ...formData, brandId: newBrand.id });
      setNewBrandName('');
      setShowNewBrandInput(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      sku: '',
      barcode: '',
      category: '',
      brandId: '',
      unit: '',
      currentStock: 0,
      reorderLevel: 0,
      status: 'In Stock',
      description: '',
      warehouseLocation: '',
    });
    setNewBrandName('');
    setShowNewBrandInput(false);
  };

  const handleAddProduct = () => {
    const newProduct: Product = {
      id: String(Date.now()),
      name: formData.name || 'New Product',
      sku: formData.sku || 'SKU-000',
      barcode: formData.barcode || '0000000000000',
      category: formData.category || 'Uncategorized',
      brandId: formData.brandId || brands[0]?.id || '',
      unit: formData.unit || 'pcs',
      currentStock: formData.currentStock || 0,
      reorderLevel: formData.reorderLevel || 0,
      status: (formData.status as Product['status']) || 'In Stock',
      lastUpdated: new Date().toISOString().slice(0, 10),
      description: formData.description || '',
      warehouseLocation: formData.warehouseLocation || '',
    };
    setProducts([...products, newProduct]);
    setShowAddModal(false);
    resetForm();
  };

  const handleEditProduct = () => {
    if (!selectedProduct) return;
    const updatedProducts = products.map(p =>
      p.id === selectedProduct.id ? { ...p, ...formData } : p
    );
    setProducts(updatedProducts);
    setShowEditModal(false);
    setSelectedProduct(null);
    resetForm();
  };

  const handleDeleteProduct = (id: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      setProducts(products.filter(p => p.id !== id));
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span>Admin</span>
        <ChevronRightIcon className="w-4 h-4" />
        <span className="text-slate-100">Product Management</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Product Management</h1>
          <p className="text-sm text-slate-400">
            {totalProducts} products across {totalCategories} categories
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="p-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button className="p-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
            <Download className="w-4 h-4" />
          </button>
          <button className="p-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
            <Printer className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" /> Add product
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Total Products</p>
          <p className="text-2xl font-bold text-white mt-1.5">{totalProducts}</p>
          <p className="text-emerald-400 text-xs mt-1 flex items-center gap-1">
            <ArrowUp className="w-3 h-3" /> 12% vs last month
          </p>
        </div>
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Active Products</p>
          <p className="text-2xl font-bold text-white mt-1.5">{activeProducts}</p>
        </div>
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Low Stock Products</p>
          <p className="text-2xl font-bold text-white mt-1.5">{lowStockProducts}</p>
          <p className="text-rose-400 text-xs mt-1 flex items-center gap-1">
            <ArrowDown className="w-3 h-3" /> 8% vs last month
          </p>
        </div>
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Out of Stock</p>
          <p className="text-2xl font-bold text-white mt-1.5">{outOfStockProducts}</p>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-[#0f172a]/60 border border-slate-800/80 rounded-2xl p-4 md:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name, SKU or barcode"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#101929] border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-[#101929] border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer min-w-[130px]"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={brandFilter}
            onChange={e => setBrandFilter(e.target.value)}
            className="bg-[#101929] border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer min-w-[130px]"
          >
            <option value="All Brands">All Brands</option>
            {brands.map(brand => (
              <option key={brand.id} value={brand.name}>{brand.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-[#101929] border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer min-w-[130px]"
          >
            {statuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="bg-[#101929] border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer min-w-[130px]"
          >
            {sortOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <button className="px-3.5 py-2.5 border border-slate-800 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all flex items-center gap-1.5 text-sm">
            <Filter className="w-4 h-4" /> More Filters
          </button>
          <button className="px-3.5 py-2.5 border border-slate-800 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all flex items-center gap-1.5 text-sm">
            <Columns className="w-4 h-4" /> Columns
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="border-b border-slate-800 bg-slate-900/30">
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Product</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">SKU</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Barcode</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Category</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Brand</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Unit</th>
                <th className="px-4 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Stock</th>
                <th className="px-4 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Reorder</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map(product => (
                <tr key={product.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-all">
                  <td className="px-4 py-3.5 text-sm font-medium text-white">{product.name}</td>
                  <td className="px-4 py-3.5 text-sm font-mono text-slate-300">{product.sku}</td>
                  <td className="px-4 py-3.5 text-sm font-mono text-slate-300">{product.barcode}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">{product.category}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">{getBrandName(product.brandId)}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">{product.unit}</td>
                  <td className="px-4 py-3.5 text-right text-sm text-white">{product.currentStock}</td>
                  <td className="px-4 py-3.5 text-right text-sm text-slate-300">{product.reorderLevel}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={product.status} /></td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openEditModal(product)}
                        className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-white transition-all"
                        title="View / Edit"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEditModal(product)}
                        className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-white transition-all"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    No products found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/30">
          <div className="text-sm text-slate-400">
            Showing <span className="text-white font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
            <span className="text-white font-medium">{Math.min(currentPage * itemsPerPage, filteredProducts.length)}</span> of{' '}
            <span className="text-white font-medium">{filteredProducts.length}</span> products
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let page = i + 1;
              if (totalPages > 5 && currentPage > 3) {
                page = currentPage - 3 + i + (currentPage > totalPages - 3 ? totalPages - 4 : 0);
              }
              if (page > totalPages) return null;
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded-xl text-sm font-medium transition-all ${
                    currentPage === page
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* ADD / EDIT PRODUCT MODAL */}
      {/* ============================================ */}
      {(showAddModal || showEditModal) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => {
            setShowAddModal(false);
            setShowEditModal(false);
            resetForm();
          }}
        >
          <div
            className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {showAddModal ? 'Add New Product' : 'Edit Product'}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setShowEditModal(false);
                  resetForm();
                }}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form className="space-y-4">
              {/* Product Image Placeholder */}
              <div className="flex items-center gap-4 pb-4 border-b border-slate-800">
                <div className="w-20 h-20 rounded-xl bg-slate-900 border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-500 hover:border-cyan-500/50 transition-all cursor-pointer">
                  <ImageIcon className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">Product Image</p>
                  <p className="text-slate-500 text-xs">Upload a product image (JPG, PNG, WEBP)</p>
                  <button type="button" className="mt-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors">Choose File</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">Product Name *</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    placeholder="Enter product name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">SKU *</label>
                  <input
                    type="text"
                    value={formData.sku || ''}
                    onChange={e => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    placeholder="Enter SKU"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">Barcode</label>
                  <input
                    type="text"
                    value={formData.barcode || ''}
                    onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    placeholder="Enter barcode"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">Category *</label>
                  <select
                    value={formData.category || ''}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  >
                    <option value="">Select Category</option>
                    {categories.filter(c => c !== 'All Categories').map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">Unit *</label>
                  <input
                    type="text"
                    value={formData.unit || ''}
                    onChange={e => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    placeholder="e.g., pcs, box, kg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">Brand</label>
                  <div className="flex gap-2">
                    <select
                      value={formData.brandId || ''}
                      onChange={e => setFormData({ ...formData, brandId: e.target.value })}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    >
                      <option value="">Select Brand</option>
                      {brands.map(brand => (
                        <option key={brand.id} value={brand.id}>{brand.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowNewBrandInput(!showNewBrandInput)}
                      className="px-3 py-2.5 bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-500/30 hover:bg-cyan-500/30 transition-all text-sm whitespace-nowrap"
                    >
                      + New
                    </button>
                  </div>
                  {showNewBrandInput && (
                    <div className="flex gap-2 mt-2">
                      <input
                        type="text"
                        value={newBrandName}
                        onChange={e => setNewBrandName(e.target.value)}
                        placeholder="New brand name"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                      />
                      <button
                        type="button"
                        onClick={handleAddBrand}
                        className="px-4 py-2 bg-cyan-500 text-slate-950 rounded-xl text-sm font-medium hover:bg-cyan-400 transition-all"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewBrandInput(false);
                          setNewBrandName('');
                        }}
                        className="px-4 py-2 border border-slate-700 text-slate-400 rounded-xl text-sm hover:bg-slate-800 transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">Current Stock</label>
                  <input
                    type="number"
                    value={formData.currentStock || 0}
                    onChange={e => setFormData({ ...formData, currentStock: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">Reorder Level</label>
                  <input
                    type="number"
                    value={formData.reorderLevel || 0}
                    onChange={e => setFormData({ ...formData, reorderLevel: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    placeholder="Minimum stock"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">Status</label>
                <select
                  value={formData.status || 'In Stock'}
                  onChange={e => setFormData({ ...formData, status: e.target.value as Product['status'] })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                >
                  <option value="In Stock">In Stock</option>
                  <option value="Low Stock">Low Stock</option>
                  <option value="Out of Stock">Out of Stock</option>
                  <option value="Archived">Archived</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">Warehouse Location</label>
                <input
                  type="text"
                  value={formData.warehouseLocation || ''}
                  onChange={e => setFormData({ ...formData, warehouseLocation: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="e.g., WH-01-A-12"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">Description</label>
                <textarea
                  rows={3}
                  value={formData.description || ''}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  placeholder="Enter product description"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                    resetForm();
                  }}
                  className="px-5 py-2.5 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={showAddModal ? handleAddProduct : handleEditProduct}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 text-slate-950"
                >
                  <Save className="w-4 h-4" /> {showAddModal ? 'Add Product' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
