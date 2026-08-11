// src/page/admin/ProductCatalog.tsx
import React, { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Plus,
  Search,
  Printer,
  Edit,
  Edit3,
  Trash2,
  ArrowLeft,
  QrCode,
  Package,
  Eye,
  X,
  Save,
  AlertCircle,
  CheckCircle,
  XCircle,
  Filter,
  Download,
  Table,
  Grid,
  Layers,
  PackageX,
  Clock,
  DollarSign,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

type ViewMode = 'table' | 'card';

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string;
  supplier: string;
  warehouse: string;
  currentStock: number;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  reorderLevel: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
  // computed status
  status: 'In Stock' | 'Low Stock' | 'Critical' | 'Out of Stock';
}

interface MovementLog {
  id: string;
  date: string;
  refNo: string;
  action: 'Stock In' | 'Stock Out' | 'Adjustment' | 'Shipment';
  quantity: number;
  performedBy: string;
}

// ============================================
// MOCK DATA
// ============================================

const initialProducts: Product[] = [
  {
    id: '1',
    sku: 'SKU-IPAD-AIRRR',
    name: 'IPAD AIR 1 variants',
    category: 'Electronics',
    brand: 'Sony',
    supplier: 'ABC Electronics',
    warehouse: 'Central Warehouse',
    currentStock: 97,
    unit: 'pcs',
    costPrice: 10000,
    sellingPrice: 12000,
    reorderLevel: 97,
    description: 'Latest iPad Air model',
    createdAt: '2026-01-10',
    updatedAt: '2026-07-25',
    status: 'Low Stock', // will be computed
  },
  {
    id: '2',
    sku: 'MBP-M3',
    name: 'Macbook Pro M3',
    category: 'Electronics',
    brand: 'Apple',
    supplier: 'Apple Distributors',
    warehouse: 'North Hub',
    currentStock: 5,
    unit: 'pcs',
    costPrice: 10000,
    sellingPrice: 15000,
    reorderLevel: 5,
    description: 'Apple M3 chip',
    createdAt: '2026-02-15',
    updatedAt: '2026-07-25',
    status: 'Low Stock',
  },
  {
    id: '3',
    sku: 'SKU-001',
    name: 'Organic Green Tea',
    category: 'Beverages',
    brand: "Nature's Best",
    supplier: 'GreenLeaf Supply',
    warehouse: 'South Warehouse',
    currentStock: 450,
    unit: 'box',
    costPrice: 250,
    sellingPrice: 350,
    reorderLevel: 100,
    description: 'Premium organic green tea',
    createdAt: '2026-03-01',
    updatedAt: '2026-07-24',
    status: 'In Stock',
  },
  {
    id: '4',
    sku: 'SKU-002',
    name: 'Stainless Steel Bottle',
    category: 'Kitchenware',
    brand: 'EcoLife',
    supplier: 'EcoLife Manufacturing',
    warehouse: 'East Warehouse',
    currentStock: 120,
    unit: 'pcs',
    costPrice: 450,
    sellingPrice: 650,
    reorderLevel: 150,
    description: 'Durable stainless steel bottle',
    createdAt: '2026-03-15',
    updatedAt: '2026-07-24',
    status: 'Low Stock',
  },
  {
    id: '5',
    sku: 'SKU-003',
    name: 'Wireless Earbuds Pro',
    category: 'Electronics',
    brand: 'SoundMax',
    supplier: 'SoundMax Inc.',
    warehouse: 'Central Warehouse',
    currentStock: 0,
    unit: 'pcs',
    costPrice: 1800,
    sellingPrice: 2500,
    reorderLevel: 30,
    description: 'Noise-cancelling earbuds',
    createdAt: '2026-04-01',
    updatedAt: '2026-07-25',
    status: 'Out of Stock',
  },
  {
    id: '6',
    sku: 'SKU-004',
    name: 'Premium Yoga Mat',
    category: 'Sports',
    brand: 'FlexFit',
    supplier: 'FlexFit Sports',
    warehouse: 'South Warehouse',
    currentStock: 8,
    unit: 'roll',
    costPrice: 1200,
    sellingPrice: 1800,
    reorderLevel: 20,
    description: 'Eco-friendly yoga mat',
    createdAt: '2026-05-10',
    updatedAt: '2026-07-23',
    status: 'Critical',
  },
];

// Mock movement logs
const mockMovements: Record<string, MovementLog[]> = {
  '1': [
    { id: 'm1', date: '2026-07-24 14:30', refNo: 'PO-2857', action: 'Stock In', quantity: 50, performedBy: 'A. Reyes' },
    { id: 'm2', date: '2026-07-22 09:15', refNo: 'SO-4412', action: 'Stock Out', quantity: 10, performedBy: 'M. Lim' },
    { id: 'm3', date: '2026-07-20 11:45', refNo: 'ADJ-221', action: 'Adjustment', quantity: -5, performedBy: 'L. Cruz' },
  ],
  '2': [
    { id: 'm4', date: '2026-07-25 08:00', refNo: 'PO-2851', action: 'Stock In', quantity: 20, performedBy: 'A. Reyes' },
    { id: 'm5', date: '2026-07-23 10:30', refNo: 'SO-4411', action: 'Stock Out', quantity: 3, performedBy: 'R. Diaz' },
  ],
  '3': [
    { id: 'm6', date: '2026-07-24 16:20', refNo: 'PO-2855', action: 'Stock In', quantity: 120, performedBy: 'A. Reyes' },
  ],
  '4': [
    { id: 'm7', date: '2026-07-23 12:00', refNo: 'PO-2859', action: 'Stock In', quantity: 30, performedBy: 'A. Reyes' },
    { id: 'm8', date: '2026-07-21 09:30', refNo: 'SO-4415', action: 'Stock Out', quantity: 5, performedBy: 'M. Santos' },
  ],
  '5': [
    { id: 'm9', date: '2026-07-20 14:00', refNo: 'PO-2860', action: 'Stock In', quantity: 50, performedBy: 'A. Reyes' },
    { id: 'm10', date: '2026-07-25 11:00', refNo: 'SO-4418', action: 'Stock Out', quantity: 50, performedBy: 'J. Dela Cruz' },
  ],
  '6': [
    { id: 'm11', date: '2026-07-22 13:30', refNo: 'PO-2861', action: 'Stock In', quantity: 10, performedBy: 'A. Reyes' },
  ],
};

// ============================================
// CONSTANTS
// ============================================

const categories = ['All Categories', 'Electronics', 'Beverages', 'Kitchenware', 'Sports'];
const brands = ['All Brands', 'Sony', 'Apple', "Nature's Best", 'EcoLife', 'SoundMax', 'FlexFit'];
const suppliers = ['All Suppliers', 'ABC Electronics', 'Apple Distributors', 'GreenLeaf Supply', 'EcoLife Manufacturing', 'SoundMax Inc.', 'FlexFit Sports'];
const warehouses = ['All Warehouses', 'Central Warehouse', 'North Hub', 'South Warehouse', 'East Warehouse'];
const statusOptions = ['All Status', 'In Stock', 'Low Stock', 'Critical', 'Out of Stock'];

// ============================================
// HELPER FUNCTIONS
// ============================================

const computeStatus = (stock: number, reorder: number): Product['status'] => {
  if (stock === 0) return 'Out of Stock';
  if (stock <= reorder * 0.5) return 'Critical';
  if (stock <= reorder) return 'Low Stock';
  return 'In Stock';
};

const getStatusColor = (status: Product['status']) => {
  switch (status) {
    case 'In Stock': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    case 'Low Stock': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
    case 'Critical': return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
    case 'Out of Stock': return 'text-red-400 bg-red-500/10 border-red-500/20';
  }
};

const getStatusIcon = (status: Product['status']) => {
  switch (status) {
    case 'In Stock': return CheckCircle;
    case 'Low Stock': return AlertCircle;
    case 'Critical': return AlertCircle;
    case 'Out of Stock': return XCircle;
  }
};


// ============================================
// COMPONENTS
// ============================================

// Status Badge Component
const StatusBadge: React.FC<{ status: Product['status'] }> = ({ status }) => {
  const color = getStatusColor(status);
  const Icon = getStatusIcon(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
};

// KPI Card
const KPICard: React.FC<{ label: string; value: string | number; icon: React.ReactNode; subtitle?: string; trend?: string }> = ({ label, value, icon, subtitle, trend }) => {
  return (
    <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 hover:border-gray-700 transition-all duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-white mt-1.5">{value}</p>
          {subtitle && <p className="text-slate-500 text-xs mt-1">{subtitle}</p>}
        </div>
        <div className="p-2.5 bg-slate-800/60 rounded-lg">{icon}</div>
      </div>
      {trend && <p className="text-xs text-emerald-400 mt-2">{trend}</p>}
    </div>
  );
};

// Search Input
const SearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder = 'Search...' }) => (
  <div className="relative flex-1 min-w-[180px]">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[#101929] border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all"
    />
  </div>
);

// Filter Select
const FilterSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: string[];
  className?: string;
}> = ({ value, onChange, options, className = '' }) => (
  <div className={`min-w-[130px] ${className}`}>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[#101929] border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  </div>
);

// Pagination Component
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
    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-[#0b0f19]/30">
      <div className="text-sm text-slate-400">
        Showing <span className="text-white font-medium">{start}</span> to{' '}
        <span className="text-white font-medium">{end}</span> of{' '}
        <span className="text-white font-medium">{totalItems}</span> products
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="p-1.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {getPages().map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`px-3 py-1 rounded-xl text-sm font-medium transition-all ${
              currentPage === page
                ? 'bg-cyan-500 text-slate-950'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {page}
          </button>
        ))}
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ============================================
// VIEW TOGGLE COMPONENT
// ============================================

const ViewToggle: React.FC<{
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
}> = ({ viewMode, onViewChange }) => {
  return (
    <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1">
      <button
        onClick={() => onViewChange('table')}
        className={`p-1.5 rounded-lg transition-all ${
          viewMode === 'table'
            ? 'bg-cyan-500 text-slate-950'
            : 'text-slate-400 hover:text-slate-100'
        }`}
        title="Table View"
      >
        <Table className="w-4 h-4" />
      </button>
      <button
        onClick={() => onViewChange('card')}
        className={`p-1.5 rounded-lg transition-all ${
          viewMode === 'card'
            ? 'bg-cyan-500 text-slate-950'
            : 'text-slate-400 hover:text-slate-100'
        }`}
        title="Card View"
      >
        <Grid className="w-4 h-4" />
      </button>
    </div>
  );
};

// ============================================
// PRODUCT CARD COMPONENT
// ============================================

const ProductCard: React.FC<{
  product: Product;
  onView: (product: Product) => void;
  onEdit: (product: Product) => void;
  onPrintLabels: (product: Product) => void;
}> = ({ product, onView, onEdit, onPrintLabels }) => {
  const inventoryValue = product.currentStock * product.costPrice;

  return (
    <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 hover:border-gray-700 transition-all duration-200 flex flex-col h-full">
      <div className="flex items-start gap-3 mb-3">
        <div className="bg-gray-800/50 p-3 rounded-xl flex-shrink-0">
          <Package className="w-5 h-5 text-cyan-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-white text-base truncate">{product.name}</h3>
          <p className="text-slate-400 text-xs mt-0.5">SKU: {product.sku}</p>
          <p className="text-slate-400 text-xs">Barcode: {product.sku}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="bg-gray-800/60 text-gray-300 text-xs px-2.5 py-1 rounded-lg border border-gray-700/50">
          {product.category}
        </span>
        <span className="bg-gray-800/60 text-gray-300 text-xs px-2.5 py-1 rounded-lg border border-gray-700/50">
          {product.warehouse}
        </span>
      </div>

      <div className="bg-[#090d16]/80 p-3 rounded-xl grid grid-cols-3 text-center my-3">
        <div>
          <p className="text-emerald-400 text-xs">Available</p>
          <p className="text-emerald-400 font-bold text-lg">{product.currentStock}</p>
        </div>
        <div>
          <p className="text-cyan-400 text-xs">Reserved</p>
          <p className="text-cyan-400 font-bold text-lg">0</p>
        </div>
        <div>
          <p className="text-rose-400 text-xs">Damaged</p>
          <p className="text-rose-400 font-bold text-lg">0</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-1">
        <StatusBadge status={product.status} />
        <div className="text-right">
          <p className="text-slate-400 text-xs">Inventory Value</p>
          <p className="text-cyan-400 font-bold text-sm">₱{inventoryValue.toLocaleString()}</p>
        </div>
      </div>
      <p className="text-slate-500 text-xs mb-3">Updated: {product.updatedAt}</p>

      <div className="border-t border-gray-800/60 pt-3 flex items-center justify-around text-gray-400">
        <button onClick={() => onView(product)} className="hover:text-white transition-all" title="View Details">
          <Eye className="w-4 h-4" />
        </button>
        <button onClick={() => onPrintLabels(product)} className="hover:text-white transition-all" title="Stock Allocation">
          <Layers className="w-4 h-4" />
        </button>
        <button onClick={() => onEdit(product)} className="hover:text-white transition-all" title="Edit Product">
          <Edit3 className="w-4 h-4" />
        </button>
        <button onClick={() => {}} className="hover:text-white transition-all" title="Movement History">
          <Clock className="w-4 h-4" />
        </button>
        <button onClick={() => onPrintLabels(product)} className="hover:text-white transition-all" title="Print Barcode">
          <Printer className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ============================================
// ADD/EDIT PRODUCT MODAL
// ============================================

const ProductFormModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  onSave: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => void;
}> = ({ isOpen, onClose, product, onSave }) => {
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    category: '',
    brand: '',
    supplier: '',
    warehouse: '',
    currentStock: 0,
    unit: 'pcs',
    costPrice: 0,
    sellingPrice: 0,
    reorderLevel: 0,
    description: '',
  });

  React.useEffect(() => {
    if (product) {
      setFormData({
        sku: product.sku,
        name: product.name,
        category: product.category,
        brand: product.brand,
        supplier: product.supplier,
        warehouse: product.warehouse,
        currentStock: product.currentStock,
        unit: product.unit,
        costPrice: product.costPrice,
        sellingPrice: product.sellingPrice,
        reorderLevel: product.reorderLevel,
        description: product.description || '',
      });
    } else {
      setFormData({
        sku: '',
        name: '',
        category: '',
        brand: '',
        supplier: '',
        warehouse: '',
        currentStock: 0,
        unit: 'pcs',
        costPrice: 0,
        sellingPrice: 0,
        reorderLevel: 0,
        description: '',
      });
    }
  }, [product, isOpen]);

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0d1322] border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">{product ? 'Edit Product' : 'Add Product'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">SKU *</label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => handleChange('sku', e.target.value)}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Product Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Category *</label>
              <select
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none"
                required
              >
                <option value="">Select Category</option>
                {categories.filter(c => c !== 'All Categories').map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Brand *</label>
              <select
                value={formData.brand}
                onChange={(e) => handleChange('brand', e.target.value)}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none"
                required
              >
                <option value="">Select Brand</option>
                {brands.filter(b => b !== 'All Brands').map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Supplier *</label>
              <select
                value={formData.supplier}
                onChange={(e) => handleChange('supplier', e.target.value)}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none"
                required
              >
                <option value="">Select Supplier</option>
                {suppliers.filter(s => s !== 'All Suppliers').map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Warehouse *</label>
              <select
                value={formData.warehouse}
                onChange={(e) => handleChange('warehouse', e.target.value)}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none"
                required
              >
                <option value="">Select Warehouse</option>
                {warehouses.filter(w => w !== 'All Warehouses').map(w => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Unit *</label>
              <input
                type="text"
                value={formData.unit}
                onChange={(e) => handleChange('unit', e.target.value)}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Current Stock</label>
              <input
                type="number"
                value={formData.currentStock}
                onChange={(e) => handleChange('currentStock', parseInt(e.target.value) || 0)}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Cost Price (₱)</label>
              <input
                type="number"
                step="0.01"
                value={formData.costPrice}
                onChange={(e) => handleChange('costPrice', parseFloat(e.target.value) || 0)}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Selling Price (₱)</label>
              <input
                type="number"
                step="0.01"
                value={formData.sellingPrice}
                onChange={(e) => handleChange('sellingPrice', parseFloat(e.target.value) || 0)}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Reorder Level</label>
              <input
                type="number"
                value={formData.reorderLevel}
                onChange={(e) => handleChange('reorderLevel', parseInt(e.target.value) || 0)}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                min="0"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-slate-300">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
              className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
              Cancel
            </button>
            <button type="submit" className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 text-slate-950">
              <Save className="w-4 h-4" /> {product ? 'Update' : 'Add'} Product
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================
// VIEW PRODUCT DRAWER
// ============================================

const ViewProductDrawer: React.FC<{
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}> = ({ product, isOpen, onClose }) => {
  const movements = product ? mockMovements[product.id] || [] : [];

  if (!isOpen || !product) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="bg-black/60 backdrop-blur-sm w-full" onClick={onClose}></div>
      <div className="bg-[#0d1322] border-l border-slate-800 w-[640px] h-full overflow-y-auto max-h-[calc(100vh-80px)] p-6 animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Product Details</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-400">SKU</p>
              <p className="text-white font-mono">{product.sku}</p>
            </div>
            <div>
              <p className="text-slate-400">Product Name</p>
              <p className="text-white font-medium">{product.name}</p>
            </div>
            <div>
              <p className="text-slate-400">Category</p>
              <p className="text-white">{product.category}</p>
            </div>
            <div>
              <p className="text-slate-400">Brand</p>
              <p className="text-white">{product.brand}</p>
            </div>
            <div>
              <p className="text-slate-400">Supplier</p>
              <p className="text-white">{product.supplier}</p>
            </div>
            <div>
              <p className="text-slate-400">Warehouse</p>
              <p className="text-white">{product.warehouse}</p>
            </div>
            <div>
              <p className="text-slate-400">Current Stock</p>
              <p className="text-white">{product.currentStock} {product.unit}</p>
            </div>
            <div>
              <p className="text-slate-400">Status</p>
              <StatusBadge status={product.status} />
            </div>
            <div>
              <p className="text-slate-400">Cost Price</p>
              <p className="text-white">₱{product.costPrice.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-slate-400">Selling Price</p>
              <p className="text-white">₱{product.sellingPrice.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-slate-400">Reorder Level</p>
              <p className="text-white">{product.reorderLevel}</p>
            </div>
            <div>
              <p className="text-slate-400">Unit</p>
              <p className="text-white">{product.unit}</p>
            </div>
            <div className="col-span-2">
              <p className="text-slate-400">Description</p>
              <p className="text-white">{product.description || 'No description'}</p>
            </div>
            <div>
              <p className="text-slate-400">Created</p>
              <p className="text-white">{product.createdAt}</p>
            </div>
            <div>
              <p className="text-slate-400">Last Updated</p>
              <p className="text-white">{product.updatedAt}</p>
            </div>
          </div>

            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-2">Movement History</h3>
              <div className="bg-[#0b0f19] rounded-xl border border-slate-800 overflow-hidden">
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-800/30 border-b border-slate-800">
                      <tr>
                        <th className="px-1.5 py-2 text-left text-xs text-slate-400 whitespace-nowrap">Date</th>
                        <th className="px-1.5 py-2 text-left text-xs text-slate-400 whitespace-nowrap">Ref</th>
                        <th className="px-1.5 py-2 text-left text-xs text-slate-400">Action</th>
                        <th className="px-1.5 py-2 text-right text-xs text-slate-400">Qty</th>
                        <th className="px-1.5 py-2 text-left text-xs text-slate-400">By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.length > 0 ? (
                        movements.map((mov) => (
                          <tr key={mov.id} className="border-b border-slate-800/50">
                            <td className="px-1.5 py-2 text-slate-300 whitespace-nowrap">{mov.date}</td>
                            <td className="px-1.5 py-2 text-slate-300 whitespace-nowrap">{mov.refNo}</td>
                            <td className="px-1.5 py-2 text-slate-300">{mov.action}</td>
                            <td className={`px-1.5 py-2 text-right font-medium ${mov.quantity > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {mov.quantity > 0 ? '+' : ''}{mov.quantity}
                            </td>
                            <td className="px-1.5 py-2 text-slate-300">{mov.performedBy}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-1.5 py-4 text-center text-slate-500">No movement records</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// LABEL PRINTING PAGE
// ============================================

const LabelPrintingPage: React.FC<{ product: Product; onBack: () => void }> = ({ product, onBack }) => {
  const [stickers, setStickers] = useState(30);
  const [columns, setColumns] = useState(3);
  const [showRetailPrice, setShowRetailPrice] = useState(true);
  const [showQR, setShowQR] = useState(true);
  const [paperSize, setPaperSize] = useState('A4');
  const [stickerSize, setStickerSize] = useState('70x35mm');
  const [barcodeFormat, setBarcodeFormat] = useState('EAN-13');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <main className="flex-1 overflow-y-auto p-6">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to Products
        </button>

        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-2">LABEL PRINTING</h1>
          <p className="text-slate-400 mb-6">Configure sheet layout settings and sticker grids below.</p>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Panel - Settings */}
            <div className="lg:col-span-1 bg-[#0d1322] border border-slate-800 rounded-xl p-6 h-fit space-y-6">
              <div>
                <p className="text-slate-400 text-sm font-medium">PRODUCT INFO</p>
                <p className="text-white font-semibold mt-2">{product.name}</p>
                <p className="text-slate-500 text-sm">{product.sku}</p>
              </div>

              <div>
                <p className="text-slate-400 text-sm font-medium">LAYOUT PARAMETERS</p>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-slate-400 text-xs mb-1">STICKERS TO PRINT</label>
                    <input
                      type="number"
                      value={stickers}
                      onChange={(e) => setStickers(Number(e.target.value))}
                      className="w-full bg-[#0b0f19] border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs mb-1">COLUMNS IN GRID</label>
                    <select
                      value={columns}
                      onChange={(e) => setColumns(Number(e.target.value))}
                      className="w-full bg-[#0b0f19] border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    >
                      <option value={2}>2 Columns</option>
                      <option value={3}>3 Columns (Standard size)</option>
                      <option value={4}>4 Columns</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs mb-1">Paper Size</label>
                    <select
                      value={paperSize}
                      onChange={(e) => setPaperSize(e.target.value)}
                      className="w-full bg-[#0b0f19] border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    >
                      <option>A4</option>
                      <option>Letter</option>
                      <option>Thermal Label</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs mb-1">Sticker Size</label>
                    <select
                      value={stickerSize}
                      onChange={(e) => setStickerSize(e.target.value)}
                      className="w-full bg-[#0b0f19] border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    >
                      <option>50x25 mm</option>
                      <option>70x35 mm</option>
                      <option>100x50 mm</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs mb-1">Barcode Format</label>
                    <select
                      value={barcodeFormat}
                      onChange={(e) => setBarcodeFormat(e.target.value)}
                      className="w-full bg-[#0b0f19] border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    >
                      <option>QR Code</option>
                      <option>Code 128</option>
                      <option>EAN-13</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-slate-400 text-sm font-medium">DISPLAY OPTIONS</p>
                <div className="mt-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showRetailPrice}
                      onChange={(e) => setShowRetailPrice(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                    />
                    <span className="text-slate-300 text-sm">Display Retail Price</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showQR}
                      onChange={(e) => setShowQR(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                    />
                    <span className="text-slate-300 text-sm">Include QR Lookup Code</span>
                  </label>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button className="w-full py-2.5 rounded-xl text-sm font-medium bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all flex items-center justify-center gap-2">
                  <Printer className="w-4 h-4" /> Print Labels
                </button>
                <button className="w-full py-2.5 rounded-xl text-sm font-medium border border-slate-700 text-slate-300 hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                  <Download className="w-4 h-4" /> Download PDF
                </button>
                <button className="w-full py-2.5 rounded-xl text-sm font-medium border border-slate-700 text-slate-300 hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                  <Eye className="w-4 h-4" /> Print Preview
                </button>
              </div>
            </div>

            {/* Right Panel - Label Grid */}
            <div className="lg:col-span-3 bg-[#0d1322] border border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-slate-400 text-sm">Label Preview ({stickers} stickers)</p>
              </div>

              <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
                {Array.from({ length: Math.min(stickers, 30) }).map((_, idx) => (
                  <div key={idx} className="bg-[#0b0f19] border border-slate-700 rounded-lg p-3 text-center">
                    <p className="text-white font-medium text-xs">{product.name}</p>
                    <p className="text-slate-400 text-[10px]">{product.sku}</p>
                    {showRetailPrice && (
                      <p className="text-emerald-400 text-xs font-semibold mt-1">₱{product.sellingPrice.toFixed(2)}</p>
                    )}
                    {showQR && (
                      <div className="mt-1 flex justify-center">
                        <QrCode className="w-6 h-6 text-slate-400" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// ============================================
// MAIN PRODUCT CATALOG COMPONENT
// ============================================

const ProductCatalog: React.FC = () => {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [brandFilter, setBrandFilter] = useState('All Brands');
  const [supplierFilter, setSupplierFilter] = useState('All Suppliers');
  const [warehouseFilter, setWarehouseFilter] = useState('All Warehouses');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showViewDrawer, setShowViewDrawer] = useState(false);
  const [showLabelPrinting, setShowLabelPrinting] = useState(false);

  // Compute status for all products
  const productsWithStatus = useMemo(() => {
    return products.map(p => ({
      ...p,
      status: computeStatus(p.currentStock, p.reorderLevel),
    }));
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return productsWithStatus.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
                          p.sku.toLowerCase().includes(search.toLowerCase()) ||
                          p.description?.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === 'All Categories' || p.category === categoryFilter;
      const matchBrand = brandFilter === 'All Brands' || p.brand === brandFilter;
      const matchSupplier = supplierFilter === 'All Suppliers' || p.supplier === supplierFilter;
      const matchWarehouse = warehouseFilter === 'All Warehouses' || p.warehouse === warehouseFilter;
      const matchStatus = statusFilter === 'All Status' || p.status === statusFilter;
      return matchSearch && matchCategory && matchBrand && matchSupplier && matchWarehouse && matchStatus;
    });
  }, [productsWithStatus, search, categoryFilter, brandFilter, supplierFilter, warehouseFilter, statusFilter]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // KPI calculations
  const totalProducts = products.length;
  const lowStockCount = products.filter(p => computeStatus(p.currentStock, p.reorderLevel) === 'Low Stock' || computeStatus(p.currentStock, p.reorderLevel) === 'Critical').length;
  const outOfStockCount = products.filter(p => p.currentStock === 0).length;
  const totalInventoryValue = products.reduce((sum, p) => sum + (p.currentStock * p.costPrice), 0);

  // Handlers
  const handleAddProduct = (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => {
    const newProduct: Product = {
      ...data,
      id: String(Date.now()),
      createdAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10),
      status: computeStatus(data.currentStock, data.reorderLevel),
    };
    setProducts([...products, newProduct]);
  };

  const handleEditProduct = (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => {
    if (!selectedProduct) return;
    const updated = products.map((p) => {
      if (p.id === selectedProduct.id) {
        return {
          ...p,
          ...data,
          updatedAt: new Date().toISOString().slice(0, 10),
          status: computeStatus(data.currentStock, data.reorderLevel),
        };
      }
      return p;
    });
    setProducts(updated);
    setSelectedProduct(null);
  };

  const handleDeleteProduct = (id: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      setProducts(products.filter(p => p.id !== id));
    }
  };

  const handleView = (product: Product) => {
    setSelectedProduct(product);
    setShowViewDrawer(true);
  };

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setShowEditModal(true);
  };

  const handlePrintLabels = (product: Product) => {
    setSelectedProduct(product);
    setShowLabelPrinting(true);
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span>SmartChain</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-slate-100">Product Catalog</span>
          </div>
          <h1 className="text-2xl font-bold text-white mt-1">Product Catalog</h1>
          <p className="text-sm text-slate-400">Manage your master list of products, stock thresholds, pricing, and classifications.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total Products"
          value={totalProducts}
          icon={<Package className="w-5 h-5 text-blue-400" />}
          subtitle="All products"
        />
        <KPICard
          label="Low Stock Items"
          value={lowStockCount}
          icon={<AlertCircle className="w-5 h-5 text-yellow-400" />}
          subtitle="Need replenishment"
        />
        <KPICard
          label="Out of Stock"
          value={outOfStockCount}
          icon={<PackageX className="w-5 h-5 text-red-400" />}
          subtitle="Critical level"
        />
        <KPICard
          label="Total Inventory Value"
          value={`₱${totalInventoryValue.toLocaleString()}`}
          icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
          subtitle="Cost-based valuation"
        />
      </div>

      {/* Filter Toolbar */}
      <div className="bg-[#0d1322] border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by SKU, product name, or description..." />
        <FilterSelect value={categoryFilter} onChange={setCategoryFilter} options={categories} />
        <FilterSelect value={brandFilter} onChange={setBrandFilter} options={brands} />
        <FilterSelect value={supplierFilter} onChange={setSupplierFilter} options={suppliers} />
        <FilterSelect value={warehouseFilter} onChange={setWarehouseFilter} options={warehouses} />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
        <button className="p-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
          <Filter className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setSearch('');
            setCategoryFilter('All Categories');
            setBrandFilter('All Brands');
            setSupplierFilter('All Suppliers');
            setWarehouseFilter('All Warehouses');
            setStatusFilter('All Status');
            setCurrentPage(1);
          }}
          className="px-3.5 py-2.5 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-sm"
        >
          Reset
        </button>
      </div>

      {/* View Toggle + Table/Card Container */}
      <div className="bg-[#0d1322] border border-slate-800 rounded-2xl overflow-hidden">
        {/* View Toggle Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
          <span className="text-sm text-slate-400">
            {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
          </span>
          <ViewToggle viewMode={viewMode} onViewChange={setViewMode} />
        </div>

        {/* Table View */}
        {viewMode === 'table' && (
          <div className="w-full overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
            <table className="w-full min-w-[1200px] text-left text-sm border-collapse">
              <thead className="bg-[#0b0f19]/50 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">SKU / Code</th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Product Name</th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Category</th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Brand</th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Supplier</th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Warehouse</th>
                  <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400">Current Stock</th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Unit</th>
                  <th className="px-4 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Cost Price</th>
                  <th className="px-4 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Selling Price</th>
                  <th className="px-4 py-3.5 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Reorder Level</th>
                  <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                  <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.map((product) => (
                  <tr key={product.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-all">
                    <td className="px-4 py-3.5 text-sm font-mono text-white">{product.sku}</td>
                    <td className="px-4 py-3.5 text-sm text-white">{product.name}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">{product.category}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">{product.brand}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">{product.supplier}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">{product.warehouse}</td>
                    <td className="px-4 py-3.5 text-center text-sm text-white">{product.currentStock}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-300">{product.unit}</td>
                    <td className="px-4 py-3.5 text-right text-sm text-white">₱{product.costPrice.toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-right text-sm text-white">₱{product.sellingPrice.toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-right text-sm text-white">{product.reorderLevel}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={product.status} /></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleView(product)}
                          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handlePrintLabels(product)}
                          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                          title="Print Labels"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(product)}
                          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(product.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedProducts.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-slate-400">
                      No products found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Card View */}
        {viewMode === 'card' && (
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {paginatedProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onView={handleView}
                  onEdit={handleEdit}
                  onPrintLabels={handlePrintLabels}
                />
              ))}
            </div>
            {paginatedProducts.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                No products found matching your criteria.
              </div>
            )}
          </div>
        )}

        {/* Pagination - outside the scroll wrapper and view-specific sections */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredProducts.length}
          itemsPerPage={itemsPerPage}
        />
      </div>

      {/* Modals & Drawers */}
      <ProductFormModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleAddProduct}
      />
      <ProductFormModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        product={selectedProduct}
        onSave={handleEditProduct}
      />
      <ViewProductDrawer
        product={selectedProduct}
        isOpen={showViewDrawer}
        onClose={() => setShowViewDrawer(false)}
      />
      {showLabelPrinting && selectedProduct && (
        <LabelPrintingPage product={selectedProduct} onBack={() => setShowLabelPrinting(false)} />
      )}
    </div>
  );
};

export default ProductCatalog;