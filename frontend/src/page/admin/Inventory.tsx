// src/page/admin/Inventory.tsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Package,
  MapPin,
  Plus,
  Edit,
  Eye,
  Download,
  AlertCircle,
  CheckCircle,
  XCircle,
  ChevronRight as ChevronBreadcrumb,
  Printer,
  History,
  X,
  Save,
  Coins,
  Layers,
  Truck,
  Filter,
  AlertTriangle,
  Info,
  Check,
  LayoutList,
  LayoutGrid,
  Loader2,
} from 'lucide-react';
import type { ApiInventoryItem, ApiInventoryMovement, ApiWarehouse, InventoryMovementType } from '../../types';
import type { AxiosError } from 'axios';
import { apiClient } from '../../lib/api';

// ============================================
// TYPES
// ============================================

type InventoryItem = ApiInventoryItem;

type InventoryStatus = 'Available' | 'Low Stock' | 'Out of Stock';

interface InventoryFormData {
  barcode: string;
  product: string;
  category: string;
  brand: string;
  unit: string;
  cost_price: number;
  warehouse_id: number | '';
  available_stock: number;
  reserved_stock: number;
  backload: number;
  status: InventoryStatus;
  pending_receiving: boolean;
}

// ============================================
// HELPERS
// ============================================

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

function formatLastUpdated(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const emptyFormData = (defaultWarehouseId: number | ''): InventoryFormData => ({
  barcode: '',
  product: '',
  category: '',
  brand: '',
  unit: 'pcs',
  cost_price: 0,
  warehouse_id: defaultWarehouseId,
  available_stock: 0,
  reserved_stock: 0,
  backload: 0,
  status: 'Available',
  pending_receiving: false,
});

const toFormData = (item: InventoryItem): InventoryFormData => ({
  barcode: item.barcode,
  product: item.product,
  category: item.category ?? '',
  brand: item.brand ?? '',
  unit: item.unit,
  cost_price: item.cost_price,
  warehouse_id: item.warehouse_id,
  available_stock: item.available_stock,
  reserved_stock: item.reserved_stock,
  backload: item.backload,
  status: item.status,
  pending_receiving: item.pending_receiving,
});

// ============================================
// CONSTANTS
// ============================================

const statusOptions: InventoryStatus[] = ['Available', 'Low Stock', 'Out of Stock'];
const sortOptions = ['Newest First', 'Name A-Z', 'Name Z-A', 'Stock Low-High', 'Stock High-Low', 'Last Updated'];

// ============================================
// HELPER FUNCTIONS
// ============================================

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Available': return 'text-green-600 dark:text-emerald-400 bg-transparent dark:bg-emerald-500/10 border-emerald-500/20';
    case 'Low Stock': return 'text-yellow-600 dark:text-yellow-400 bg-transparent dark:bg-yellow-500/10 border-yellow-500/20';
    case 'Out of Stock': return 'text-red-600 dark:text-red-400 bg-transparent dark:bg-red-500/10 border-red-500/20';
    default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'Available': return CheckCircle;
    case 'Low Stock': return AlertCircle;
    case 'Out of Stock': return XCircle;
    default: return Info;
  }
};

// ============================================
// HELPER COMPONENTS
// ============================================

// ----- Status Badge -----
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const color = getStatusColor(status);
  const Icon = getStatusIcon(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
};

const code128Patterns = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100',
  '10011001000', '10011000100', '10001100100', '11001001000', '11001000100', '11000100100',
  '10110011100', '10011011100', '10011001110', '10111001100', '10011101100', '10011100110',
  '11001110010', '11001011100', '11001001110', '11011100100', '11001110100', '11101101110',
  '11101001100', '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000', '10001000110',
  '10110001000', '10001101000', '10001100010', '11010001000', '11000101000', '11000100010',
  '10110111000', '10110001110', '10001101110', '10111011000', '10111000110', '10001110110',
  '11101110110', '11010001110', '11000101110', '11011101000', '11011100010', '11011101110',
  '11101011000', '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100', '10010110000',
  '10010000110', '10000101100', '10000100110', '10110010000', '10110000100', '10011010000',
  '10011000010', '10000110100', '10000110010', '11000010010', '11001010000', '11110111010',
  '11000010100', '10001111010', '10100111100', '10010111100', '10010011110', '10111100100',
  '10011110100', '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110', '10111101000',
  '10111100010', '11110101000', '11110100010', '10111011110', '10111101110', '11101011110',
  '11110101110', '11010000100', '11010010000', '11010011100', '1100011101011',
];

const encodeCode128B = (value: string): string => {
  const codes = [104];
  for (const char of value) {
    const code = char.charCodeAt(0);
    codes.push(code >= 32 && code <= 127 ? code - 32 : 0);
  }
  const checksum = codes.reduce((sum, code, index) => sum + (index === 0 ? code : code * index), 0) % 103;
  return [...codes, checksum, 106].map((code) => code128Patterns[code]).join('');
};

const BarcodeSvg: React.FC<{ value: string; className?: string }> = ({ value, className = '' }) => {
  const pattern = encodeCode128B(value);
  const moduleWidth = 2;
  const height = 46;
  const quietZone = 10;
  const width = pattern.length * moduleWidth + quietZone * 2;
  let cursor = quietZone;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`Barcode ${value}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={width} height={height} fill="#ffffff" />
      {pattern.split('').map((bit, index) => {
        const x = cursor;
        cursor += moduleWidth;
        return bit === '1' ? <rect key={index} x={x} y="4" width={moduleWidth} height="38" fill="#000000" /> : null;
      })}
    </svg>
  );
};

const BarcodeDisplay: React.FC<{ value: string }> = ({ value }) => (
  <div className="inline-flex min-w-[150px] flex-col gap-1">
    <span className="font-mono text-xs text-slate-900 dark:text-slate-300 sm:text-sm">{value}</span>
    <BarcodeSvg value={value} className="h-10 w-40 rounded bg-white" />
  </div>
);

const getBarcodeSvgMarkup = (value: string): string => {
  const pattern = encodeCode128B(value);
  const moduleWidth = 2;
  const height = 72;
  const quietZone = 14;
  const width = pattern.length * moduleWidth + quietZone * 2;
  let cursor = quietZone;
  const bars = pattern.split('').map((bit) => {
    const x = cursor;
    cursor += moduleWidth;
    return bit === '1' ? `<rect x="${x}" y="6" width="${moduleWidth}" height="58" fill="#000000" />` : '';
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="320" height="96" preserveAspectRatio="none" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" fill="#ffffff" />${bars}</svg>`;
};

// ----- KPI Card -----
const KPICard: React.FC<{
  label: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  onClick?: () => void;
  clickable?: boolean;
  iconContainerClassName?: string;
}> = ({ label, value, subtitle, icon, onClick, clickable, iconContainerClassName }) => {
  return (
    <div
      className={`relative overflow-hidden bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 hover:border-gray-700 transition-all duration-200 ${clickable ? 'cursor-pointer hover:bg-[#111927]' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-white mt-1.5">{value}</p>
          <p className="text-slate-500 text-xs mt-1">{subtitle}</p>
        </div>
        <div className={iconContainerClassName || 'p-2.5 bg-slate-800/60 rounded-lg'}>{icon}</div>
      </div>
    </div>
  );
};

// ----- Alert Pill -----
const AlertPill: React.FC<{
  title: string;
  count: number;
  color: string;
  icon: React.ReactNode;
}> = ({ title, count, color, icon }) => {
  if (count === 0) return null;
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full border border-${color}-500/30 bg-${color}-500/10 text-${color}-400 text-xs sm:text-sm font-medium`}>
      {icon}
      <span>{count} {title}</span>
    </div>
  );
};

// ----- Search Input -----
const SearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, placeholder = 'Search...', className = '' }) => (
  <div className={`relative flex-1 min-w-[160px] sm:min-w-[200px] ${className}`}>
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

// ----- Filter Select -----
const FilterSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: string[];
  className?: string;
}> = ({ value, onChange, options, className = '' }) => (
  <div className={`min-w-[100px] sm:min-w-[130px] ${className}`}>
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
    <div className="flex items-center justify-between px-3 py-3 sm:px-6 sm:py-4 border-t border-slate-800 bg-white dark:bg-[#0b0f19]/30">
      <div className="text-sm text-slate-400">
        Showing <span className="text-white font-medium">{start}</span> to{' '}
        <span className="text-white font-medium">{end}</span> of{' '}
        <span className="text-white font-medium">{totalItems}</span> items
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
// MODALS & DRAWERS
// ============================================

// ----- Inventory Form Modal (Create / Edit) -----
const InventoryFormModal: React.FC<{
  isOpen: boolean;
  mode: 'create' | 'edit';
  onClose: () => void;
  product: InventoryItem | null;
  warehouses: ApiWarehouse[];
  onSubmit: (data: InventoryFormData) => Promise<void>;
}> = ({ isOpen, mode, onClose, product, warehouses, onSubmit }) => {
  const [formData, setFormData] = useState<InventoryFormData>(
    emptyFormData(warehouses[0]?.id ?? '')
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'edit' && product) {
      setFormData(toFormData(product));
    } else {
      setFormData(emptyFormData(warehouses[0]?.id ?? ''));
    }
  }, [isOpen, mode, product, warehouses]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.barcode || !formData.product || !formData.warehouse_id) return;
    setSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0d1322] border border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">{mode === 'create' ? 'New Inventory Record' : 'Edit Inventory Record'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Barcode *</label>
              <input
                type="text"
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Product *</label>
              <input
                type="text"
                value={formData.product}
                onChange={(e) => setFormData({ ...formData, product: e.target.value })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Category</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Brand</label>
              <input
                type="text"
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Unit</label>
              <input
                type="text"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Cost Price</label>
              <input
                type="number"
                min="0"
                value={formData.cost_price}
                onChange={(e) => setFormData({ ...formData, cost_price: Number(e.target.value) })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Warehouse *</label>
              <select
                value={formData.warehouse_id}
                onChange={(e) => setFormData({ ...formData, warehouse_id: Number(e.target.value) })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none"
                required
              >
                <option value="" disabled>Select warehouse</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Available Stock *</label>
              <input
                type="number"
                min="0"
                value={formData.available_stock}
                onChange={(e) => setFormData({ ...formData, available_stock: Number(e.target.value) })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Reserved Stock *</label>
              <input
                type="number"
                min="0"
                value={formData.reserved_stock}
                onChange={(e) => setFormData({ ...formData, reserved_stock: Number(e.target.value) })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Backload *</label>
              <input
                type="number"
                min="0"
                value={formData.backload}
                onChange={(e) => setFormData({ ...formData, backload: Number(e.target.value) })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-300">Status *</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as InventoryStatus })}
                className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none"
                required
              >
                {statusOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 flex items-center gap-2 pt-1">
              <input
                id="pending_receiving"
                type="checkbox"
                checked={formData.pending_receiving}
                onChange={(e) => setFormData({ ...formData, pending_receiving: e.target.checked })}
                className="w-4 h-4 rounded border-slate-700 bg-[#0b0f19] text-cyan-500 focus:ring-cyan-500/40"
              />
              <label htmlFor="pending_receiving" className="text-sm text-slate-300">Pending Receiving</label>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {mode === 'create' ? 'Create Record' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ----- Reserve Stock Modal -----
const ReserveStockModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  product: InventoryItem | null;
  onReserve: (id: number, qty: number, reason: string) => void;
}> = ({ isOpen, onClose, product, onReserve }) => {
  const [qty, setQty] = useState<number>(0);
  const [reason, setReason] = useState('');

  if (!isOpen || !product) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (qty <= 0 || qty > product.available_stock) return;
    onReserve(product.id, qty, reason);
    setQty(0);
    setReason('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0d1322] border border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Reserve Stock</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="mb-4 p-4 bg-slate-800/30 rounded-xl border border-slate-700">
          <p className="text-sm text-slate-400">Product</p>
          <p className="text-white font-medium">{product.product}</p>
          <p className="text-slate-400 text-xs">Available: {product.available_stock} {product.unit}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5 text-slate-300">Quantity to Reserve *</label>
            <input
              type="number"
              min="1"
              max={product.available_stock}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              required
            />
            <p className="text-xs text-slate-500 mt-1">Max: {product.available_stock}</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-slate-300">Reason (e.g., Order #)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Customer order, internal use, etc."
              className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
              Cancel
            </button>
            <button type="submit" className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950">
              <Save className="w-4 h-4" /> Reserve
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ----- Backload Stock Modal -----
const BackloadStockModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  items: InventoryItem[];
}> = ({ isOpen, onClose, items }) => {
  if (!isOpen) return null;

  const records = items.filter((item) => item.backload > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0d1322] border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Backload Stock</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        {records.length === 0 ? (
          <p className="text-slate-400 text-center py-8">No backload stock records.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-[#0b0f19]/50 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Barcode</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Warehouse</th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-400">Backload Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-sm text-white">{record.product}</td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-300">{record.barcode}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{record.warehouse}</td>
                    <td className="px-4 py-3 text-center text-sm text-white">{record.backload}</td>
                    <td className="px-4 py-3"><StatusBadge status={record.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end pt-4 border-t border-slate-800 mt-4">
          <button onClick={onClose} className="px-5 py-2.5 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ----- Details Drawer -----
const DetailsDrawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  product: InventoryItem | null;
}> = ({ isOpen, onClose, product }) => {
  if (!isOpen || !product) return null;

  const totalQty = product.available_stock + product.reserved_stock + product.backload;
  const inventoryValue = totalQty * product.cost_price;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="bg-black/60 backdrop-blur-sm w-full" onClick={onClose}></div>
      <div className="bg-[#0d1322] border-l border-slate-800 w-full sm:w-[480px] h-full overflow-y-auto p-4 sm:p-6 animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Product Details</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-20 h-20 rounded-xl bg-slate-800/50 border border-slate-700 flex items-center justify-center text-slate-400">
              <Package className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-lg">{product.product}</h3>
              <p className="text-slate-400 text-sm">Barcode: {product.barcode}</p>
              <p className="text-slate-400 text-sm">Category: {product.category || '—'} | Brand: {product.brand || '—'}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center dark:border-slate-700 dark:bg-slate-800/30">
            <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">Barcode</p>
            <div className="flex justify-center">
              <BarcodeDisplay value={product.barcode} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-700">
              <p className="text-slate-400">Warehouse</p>
              <p className="text-white">{product.warehouse}</p>
            </div>
            <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-700">
              <p className="text-slate-400">Unit</p>
              <p className="text-white">{product.unit}</p>
            </div>
            <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-700">
              <p className="text-slate-400">Pending Receiving</p>
              <p className="text-white">{product.pending_receiving ? 'Yes' : 'No'}</p>
            </div>
            <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-700">
              <p className="text-slate-400">Last Updated</p>
              <p className="text-white">{formatLastUpdated(product.updated_at)}</p>
            </div>
            <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-700 col-span-2">
              <p className="text-slate-400">Inventory Value</p>
              <p className="text-white font-bold">₱{inventoryValue.toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700">
            <p className="text-slate-400 text-xs mb-2">Stock Breakdown</p>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="text-center">
                <p className="text-emerald-400">Available</p>
                <p className="text-white font-medium">{product.available_stock}</p>
              </div>
              <div className="text-center">
                <p className="text-blue-400">Reserved</p>
                <p className="text-white font-medium">{product.reserved_stock}</p>
              </div>
              <div className="text-center">
                <p className="text-red-400">Backload</p>
                <p className="text-white font-medium">{product.backload}</p>
              </div>
            </div>
            <div className="mt-2 text-center text-sm text-slate-400">
              Total Physical: {totalQty} {product.unit}
            </div>
            <div className="mt-2 flex justify-center">
              <StatusBadge status={product.status} />
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-slate-300 mb-2">Movement History</h4>
            <p className="text-slate-400 text-sm">No movement history available.</p>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button onClick={onClose} className="px-5 py-2.5 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// INVENTORY GRID COMPONENT (Card View)
// ============================================

const InventoryGrid: React.FC<{
  items: InventoryItem[];
  onViewDetails: (item: InventoryItem) => void;
  onReserveStock: (item: InventoryItem) => void;
  onEdit: (item: InventoryItem) => void;
  onMovementHistory: (item: InventoryItem) => void;
  onPrintBarcode: (item: InventoryItem) => void;
}> = ({
  items,
  onViewDetails,
  onReserveStock,
  onEdit,
  onMovementHistory,
  onPrintBarcode,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
      {items.map((item) => {
        const totalQty = item.available_stock + item.reserved_stock + item.backload;
        const inventoryValue = totalQty * item.cost_price;
        return (
          <div
            key={item.id}
            className="bg-[#0d1322] border border-slate-800 rounded-2xl p-4 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/5 hover:-translate-y-1 flex flex-col h-full"
          >
            {/* Product Image & Name */}
            <div className="flex items-start gap-3 mb-3">
              <div className="w-14 h-14 rounded-xl bg-slate-800/50 border border-slate-700 flex items-center justify-center text-slate-400 flex-shrink-0">
                <Package className="w-7 h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-semibold text-base truncate">{item.product}</h3>
              </div>
            </div>
            <div className="mb-3 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-[#0b0f19]">
              <BarcodeDisplay value={item.barcode} />
            </div>

            {/* Category & Warehouse */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-3">
              <span className="bg-slate-800/50 px-2 py-1 rounded-lg truncate">{item.category || 'Uncategorized'}</span>
              <span className="bg-slate-800/50 px-2 py-1 rounded-lg truncate">{item.warehouse}</span>
            </div>

            {/* Stock Quantities */}
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div className="bg-slate-800/30 rounded-xl p-2">
                <p className="text-emerald-400 text-xs font-medium">Available</p>
                <p className="text-white text-lg font-bold">{item.available_stock}</p>
              </div>
              <div className="bg-slate-800/30 rounded-xl p-2">
                <p className="text-blue-400 text-xs font-medium">Reserved</p>
                <p className="text-white text-lg font-bold">{item.reserved_stock}</p>
              </div>
              <div className="bg-slate-800/30 rounded-xl p-2">
                <p className="text-red-400 text-xs font-medium">Backload</p>
                <p className="text-white text-lg font-bold">{item.backload}</p>
              </div>
            </div>

            {/* Status & Inventory Value */}
            <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-800">
              <StatusBadge status={item.status} />
              <div className="text-right">
                <p className="text-slate-400 text-xs">Inventory Value</p>
                <p className="text-cyan-400 text-sm font-bold">₱{inventoryValue.toLocaleString()}</p>
              </div>
            </div>

            {/* Last Updated */}
            <div className="text-xs text-slate-500 mt-2">
              Updated: {formatLastUpdated(item.updated_at)}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => onViewDetails(item)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                title="View Details"
              >
                <Eye className="w-4 h-4" />
              </button>
              <button
                onClick={() => onReserveStock(item)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                title="Reserve Stock"
              >
                <Layers className="w-4 h-4" />
              </button>
              <button
                onClick={() => onEdit(item)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                title="Edit"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={() => onMovementHistory(item)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                title="Movement History"
              >
                <History className="w-4 h-4" />
              </button>
              <button
                onClick={() => onPrintBarcode(item)}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                title="Print Barcode"
              >
                <Printer className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const movementDate = (value: string) => new Date(value).toLocaleString(undefined, {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

const MovementTypeBadge: React.FC<{ type: InventoryMovementType }> = ({ type }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
    type === 'STOCK_IN'
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
      : 'border-orange-500/20 bg-orange-500/10 text-orange-300'
  }`}>
    {type === 'STOCK_IN' ? 'Stock In' : 'Stock Out'}
  </span>
);

const MovementTable: React.FC<{ movements: ApiInventoryMovement[]; loading?: boolean }> = ({ movements, loading }) => (
  <div className="overflow-x-auto custom-scrollbar">
    <table className="w-full min-w-[820px]">
      <thead className="border-b border-slate-800 bg-[#0b0f19]/50">
        <tr>
          {['Type', 'Product', 'Barcode', 'Warehouse', 'Quantity', 'Date / Time'].map(label => (
            <th key={label} className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {movements.map((movement, index) => (
          <tr key={`${movement.type}-${movement.occurred_at}-${movement.barcode ?? index}`} className="border-b border-slate-800 transition-colors hover:bg-slate-800/30">
            <td className="px-4 py-3"><MovementTypeBadge type={movement.type} /></td>
            <td className="px-4 py-3 text-sm font-medium text-white">{movement.product || '—'}</td>
            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-300">{movement.barcode || '—'}</td>
            <td className="px-4 py-3 text-sm text-slate-300">{movement.warehouse || '—'}</td>
            <td className="px-4 py-3 text-sm font-semibold text-white">{movement.quantity}</td>
            <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-300">{movementDate(movement.occurred_at)}</td>
          </tr>
        ))}
        {!loading && movements.length === 0 && (
          <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">No inventory movements found.</td></tr>
        )}
        {loading && (
          <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">Loading movements...</td></tr>
        )}
      </tbody>
    </table>
  </div>
);

// ============================================
// MAIN INVENTORY LIST COMPONENT
// ============================================

export const InventoryList: React.FC = () => {
  // Data state
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [warehouses, setWarehouses] = useState<ApiWarehouse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentMovements, setRecentMovements] = useState<ApiInventoryMovement[]>([]);
  const [historyMovements, setHistoryMovements] = useState<ApiInventoryMovement[]>([]);
  const [recentMovementsLoading, setRecentMovementsLoading] = useState(true);
  const [movementsLoading, setMovementsLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState('');
  const [historyType, setHistoryType] = useState<'ALL' | InventoryMovementType>('ALL');
  const [historyWarehouse, setHistoryWarehouse] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLastPage, setHistoryLastPage] = useState(1);

  // Filter/view state
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('All Warehouses');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [brandFilter, setBrandFilter] = useState('All Brands');
  const [sortBy, setSortBy] = useState('Newest First');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const itemsPerPage = 10;

  // Modal states
  const [showFormModal, setShowFormModal] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [showBackloadModal, setShowBackloadModal] = useState(false);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);

  // Fetching
  const fetchInventory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/inventory');
      setItems(response.data.data ?? response.data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchWarehouses = useCallback(async () => {
    try {
      const response = await apiClient.get('/warehouses');
      setWarehouses(response.data);
    } catch {
      // ignore — warehouse dropdown will just be empty
    }
  }, []);

  const fetchRecentMovements = useCallback(async () => {
    try {
      const response = await apiClient.get('/inventory/movements/recent', { params: { limit: 10 } });
      setRecentMovements(response.data.data ?? []);
    } finally {
      setRecentMovementsLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setMovementsLoading(true);
    try {
      const response = await apiClient.get('/inventory/movements', { params: {
        search: historySearch || undefined,
        type: historyType === 'ALL' ? undefined : historyType,
        warehouse_id: historyWarehouse || undefined,
        date_from: historyDateFrom || undefined,
        date_to: historyDateTo || undefined,
        page: historyPage,
        per_page: 10,
      } });
      setHistoryMovements(response.data.data ?? []);
      setHistoryTotal(response.data.total ?? 0);
      setHistoryLastPage(response.data.last_page ?? 1);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setMovementsLoading(false);
    }
  }, [historySearch, historyType, historyWarehouse, historyDateFrom, historyDateTo, historyPage]);

  useEffect(() => {
    fetchInventory();
    fetchWarehouses();
    fetchRecentMovements().catch(e => setError(getApiErrorMessage(e)));
  }, [fetchInventory, fetchWarehouses, fetchRecentMovements]);

  useEffect(() => {
    const timeout = window.setTimeout(fetchHistory, 250);
    return () => window.clearTimeout(timeout);
  }, [fetchHistory]);

  // Quick actions handlers
  const handleReceiveStock = () => {
    setSelectedProduct(null);
    setFormMode('create');
    setShowFormModal(true);
  };

  const handleExport = () => {
    const header = ['Barcode', 'Product', 'Warehouse', 'Available', 'Reserved', 'Backload', 'Status', 'Last Updated'];
    const rows = filteredItems.map((item) => [
      item.barcode,
      item.product,
      item.warehouse,
      item.available_stock,
      item.reserved_stock,
      item.backload,
      item.status,
      item.updated_at,
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'inventory-export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Per-row actions
  const handleViewDetails = (product: InventoryItem) => {
    setSelectedProduct(product);
    setShowDetailsDrawer(true);
  };

  const handleReserveStock = (product: InventoryItem) => {
    setSelectedProduct(product);
    setShowReserveModal(true);
  };

  const handleEdit = (product: InventoryItem) => {
    setSelectedProduct(product);
    setFormMode('edit');
    setShowFormModal(true);
  };

  const handleMovementHistory = (product: InventoryItem) => {
    setSelectedProduct(product);
    setShowDetailsDrawer(true);
  };

  const handlePrintBarcode = (product: InventoryItem) => {
    const printWindow = window.open('', '_blank', 'width=400,height=300');
    if (!printWindow) return;
    const barcodeSvg = getBarcodeSvgMarkup(product.barcode);
    printWindow.document.write(`
      <html>
        <head><title>Print Barcode</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 24px; color: #111;">
          <h2 style="margin-bottom: 4px; font-size: 18px;">${product.product}</h2>
          <p style="color: #555; margin-top: 0;">${product.warehouse}</p>
          <div style="display: inline-block; margin: 18px 0; padding: 14px; border: 1px solid #ddd; background: #fff;">
            ${barcodeSvg}
            <p style="font-family: 'Courier New', monospace; font-size: 14px; letter-spacing: 1px; margin: 6px 0 0;">${product.barcode}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleBackloadKPIClick = () => {
    setShowBackloadModal(true);
  };

  const handleFormSubmit = async (data: InventoryFormData) => {
    try {
      if (formMode === 'create') {
        await apiClient.post('/inventory', data);
      } else if (selectedProduct) {
        await apiClient.put(`/inventory/${selectedProduct.id}`, data);
      }
      await fetchInventory();
      setShowFormModal(false);
      setSelectedProduct(null);
    } catch (e) {
      alert(getApiErrorMessage(e));
    }
  };

  const handleReserveSubmit = async (id: number, qty: number, _reason: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    try {
      await apiClient.put(`/inventory/${id}`, {
        available_stock: item.available_stock - qty,
        reserved_stock: item.reserved_stock + qty,
      });
      await fetchInventory();
    } catch (e) {
      alert(getApiErrorMessage(e));
    }
  };

  // Filter option lists derived from live data
  const warehouseOptions = useMemo(
    () => ['All Warehouses', ...warehouses.map((w) => w.name)],
    [warehouses]
  );
  const categoryOptions = useMemo(
    () => ['All Categories', ...Array.from(new Set(items.map((i) => i.category).filter((c): c is string => !!c)))],
    [items]
  );
  const brandOptions = useMemo(
    () => ['All Brands', ...Array.from(new Set(items.map((i) => i.brand).filter((b): b is string => !!b)))],
    [items]
  );
  const statusFilterOptions = ['All Status', ...statusOptions];

  // Filter and sort
  const filteredItems = useMemo(() => {
    const list = items.filter(item => {
      const searchLower = search.toLowerCase();
      const matchSearch =
        item.product.toLowerCase().includes(searchLower) ||
        item.barcode.toLowerCase().includes(searchLower) ||
        item.warehouse.toLowerCase().includes(searchLower);

      const matchWarehouse = warehouseFilter === 'All Warehouses' || item.warehouse === warehouseFilter;
      const matchCategory = categoryFilter === 'All Categories' || item.category === categoryFilter;
      const matchBrand = brandFilter === 'All Brands' || item.brand === brandFilter;
      const matchStatus = statusFilter === 'All Status' || item.status === statusFilter;

      return matchSearch && matchWarehouse && matchCategory && matchBrand && matchStatus;
    });

    switch (sortBy) {
      case 'Newest First':
        list.sort((a, b) => {
          const createdAtDifference = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          return createdAtDifference || b.id - a.id;
        });
        break;
      case 'Name A-Z':
        list.sort((a, b) => a.product.localeCompare(b.product));
        break;
      case 'Name Z-A':
        list.sort((a, b) => b.product.localeCompare(a.product));
        break;
      case 'Stock Low-High':
        list.sort((a, b) => a.available_stock - b.available_stock);
        break;
      case 'Stock High-Low':
        list.sort((a, b) => b.available_stock - a.available_stock);
        break;
      case 'Last Updated':
        list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        break;
      default:
        break;
    }
    return list;
  }, [items, search, warehouseFilter, statusFilter, categoryFilter, brandFilter, sortBy]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // KPI calculations (from full backend dataset, not just the current page)
  const totalAvailable = items.reduce((sum, item) => sum + item.available_stock, 0);
  const totalReserved = items.reduce((sum, item) => sum + item.reserved_stock, 0);
  const totalBackload = items.reduce((sum, item) => sum + item.backload, 0);
  const lowStockCount = items.filter(item => item.status === 'Low Stock').length;
  const outOfStockCount = items.filter(item => item.status === 'Out of Stock').length;
  const pendingReceivingCount = items.filter(item => item.pending_receiving).length;
  const inventoryValue = items.reduce((sum, item) => sum + (item.available_stock + item.reserved_stock + item.backload) * item.cost_price, 0);

  const reservedForShipmentCount = items.filter(item => item.reserved_stock > 0).length;
  const readyForStockInCount = items.filter(item => item.pending_receiving && item.available_stock === 0).length;

  const resetFilters = () => {
    setSearch('');
    setWarehouseFilter('All Warehouses');
    setStatusFilter('All Status');
    setCategoryFilter('All Categories');
    setBrandFilter('All Brands');
    setSortBy('Newest First');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-4 text-sm flex items-center justify-between gap-4">
          <span>{error}</span>
          <button onClick={fetchInventory} className="text-red-300 hover:text-white underline whitespace-nowrap">Retry</button>
        </div>
      )}

      {/* Header with actions on the right */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-slate-400 text-sm mt-1">Monitor warehouse inventory, stock movements, and stock valuation.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleReceiveStock}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Receive Stock
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4 xl:gap-5">
        <KPICard
          label="Available Stock"
          value={totalAvailable}
          subtitle="Across all warehouses"
          icon={<Package className="w-5 h-5 text-emerald-400" />}
        />
        <KPICard
          label="Reserved Stock"
          value={totalReserved}
          subtitle="For shipments"
          icon={<Layers className="w-5 h-5 text-blue-400" />}
        />
        <KPICard
          label="Backload Stock"
          value={totalBackload}
          subtitle="Pending resolution"
          icon={<AlertTriangle className="w-5 h-5 text-red-400" />}
          clickable
          onClick={handleBackloadKPIClick}
        />
        <KPICard
          label="Low Stock Items"
          value={lowStockCount}
          subtitle="Needs restock"
          icon={<AlertCircle className="w-5 h-5 text-yellow-400" />}
        />
        <KPICard
          label="Pending Receiving"
          value={pendingReceivingCount}
          subtitle="Awaiting stock in"
          icon={<Truck className="w-5 h-5 text-purple-400" />}
        />
        <KPICard
          label="Inventory Value"
          value={`₱${inventoryValue.toLocaleString()}`}
          subtitle="Cost-based"
          icon={<Coins className="w-5 h-5" />}
          iconContainerClassName="p-2.5 bg-cyan-500/10 rounded-xl text-cyan-400"
        />
      </div>

      {/* Alert Pills */}
      <div className="flex flex-wrap gap-3">
        {lowStockCount > 0 && (
          <AlertPill
            title="Low Stock"
            count={lowStockCount}
            color="yellow"
            icon={<AlertCircle className="w-4 h-4" />}
          />
        )}
        {pendingReceivingCount > 0 && (
          <AlertPill
            title="Pending Receiving"
            count={pendingReceivingCount}
            color="orange"
            icon={<Truck className="w-4 h-4" />}
          />
        )}
        {reservedForShipmentCount > 0 && (
          <AlertPill
            title="Reserved Shipment"
            count={reservedForShipmentCount}
            color="blue"
            icon={<Layers className="w-4 h-4" />}
          />
        )}
        {readyForStockInCount > 0 && (
          <AlertPill
            title="Ready for Stock In"
            count={readyForStockInCount}
            color="green"
            icon={<Check className="w-4 h-4" />}
          />
        )}
        {outOfStockCount > 0 && (
          <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 cursor-pointer">
            <XCircle className="w-3.5 h-3.5" /> {outOfStockCount} Out of Stock
          </span>
        )}
      </div>

      {/* Filters - Two rows */}
      <div className="bg-[#0d1322] border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3">
        {/* Row 1: Search + main filters */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by Barcode, Product, or Warehouse..."
            className="flex-[2] min-w-[160px] sm:min-w-[200px]"
          />
          <FilterSelect
            value={warehouseFilter}
            onChange={setWarehouseFilter}
            options={warehouseOptions}
            className="flex-1 min-w-[100px] sm:min-w-[130px]"
          />
          <FilterSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={categoryOptions}
            className="flex-1 min-w-[100px] sm:min-w-[130px]"
          />
          <FilterSelect
            value={brandFilter}
            onChange={setBrandFilter}
            options={brandOptions}
            className="flex-1 min-w-[100px] sm:min-w-[130px]"
          />
        </div>
        {/* Row 2: Status, Sort, Advanced, Reset */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusFilterOptions}
            className="min-w-[100px] sm:min-w-[130px]"
          />
          <FilterSelect
            value={sortBy}
            onChange={setSortBy}
            options={sortOptions}
            className="min-w-[120px] sm:min-w-[140px]"
          />
          <button className="p-2 sm:p-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={resetFilters}
            className="px-3 py-2 sm:px-3.5 sm:py-2.5 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-xs sm:text-sm"
          >
            Reset
          </button>
          <div className="flex-1 hidden md:block"></div>
        </div>
      </div>

      {/* View Toggle & Results Count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 bg-[#0d1322] border border-slate-800 rounded-xl p-1">
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              viewMode === 'table'
                ? 'bg-slate-900 text-white dark:bg-cyan-500 dark:text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LayoutList className="w-4 h-4" /> Table
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              viewMode === 'grid'
                ? 'bg-slate-900 text-white dark:bg-cyan-500 dark:text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LayoutGrid className="w-4 h-4" /> Grid
          </button>
        </div>
        <div className="text-sm text-slate-400">
          {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && items.length === 0 ? (
        <div className="bg-[#0d1322] border border-slate-800 rounded-2xl p-16 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm">Loading inventory...</span>
        </div>
      ) : viewMode === 'table' ? (
        // Table View
        <div className="bg-[#0d1322] border border-slate-800 rounded-2xl">
          <div className="overflow-x-auto w-full custom-scrollbar">
            <table className="w-full min-w-[900px]">
              <thead className="bg-[#0b0f19]/50 border-b border-slate-800 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-400 sm:px-4 sm:py-3.5">Barcode</th>
                  <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-400 sm:px-4 sm:py-3.5">Product</th>
                  <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-400 sm:px-4 sm:py-3.5">Warehouse</th>
                  <th className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-slate-400 sm:px-4 sm:py-3.5">Available</th>
                  <th className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-slate-400 sm:px-4 sm:py-3.5">Reserved</th>
                  <th className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-slate-400 sm:px-4 sm:py-3.5">Backload</th>
                  <th className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-slate-400 sm:px-4 sm:py-3.5">Status</th>
                  <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-400 sm:px-4 sm:py-3.5">Last Updated</th>
                  <th className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-slate-400 sm:px-4 sm:py-3.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item) => (
                  <tr key={item.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-all">
                    <td className="px-2 py-2 sm:px-4 sm:py-3.5">
                      <BarcodeDisplay value={item.barcode} />
                    </td>
                    <td className="px-2 py-2 sm:px-4 sm:py-3.5">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-md sm:rounded-lg bg-slate-800/50 border border-slate-700 flex items-center justify-center text-slate-400">
                          <Package className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                        </div>
                        <span className="text-white text-xs sm:text-sm font-medium truncate">{item.product}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-300 sm:px-4 sm:py-3.5 sm:text-sm truncate">{item.warehouse}</td>
                    <td className="px-2 py-2 text-center text-xs text-white font-medium sm:px-4 sm:py-3.5 sm:text-sm">{item.available_stock}</td>
                    <td className="px-2 py-2 text-center text-xs text-slate-900 dark:text-blue-400 sm:px-4 sm:py-3.5 sm:text-sm">{item.reserved_stock}</td>
                    <td className={`px-2 py-2 text-center text-xs sm:px-4 sm:py-3.5 sm:text-sm ${item.backload > 0 ? 'text-slate-900 dark:text-red-400' : 'text-slate-900 dark:text-slate-500'}`}>{item.backload}</td>
                    <td className="px-2 py-2 sm:px-4 sm:py-3.5"><StatusBadge status={item.status} /></td>
                    <td className="px-2 py-2 text-xs text-slate-400 sm:px-4 sm:py-3.5 sm:text-sm">{formatLastUpdated(item.updated_at)}</td>
                    <td className="px-2 py-2 sm:px-4 sm:py-3.5">
                      <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                        <button
                          onClick={() => handleViewDetails(item)}
                          className="p-1 sm:p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                        <button
                          onClick={() => handleReserveStock(item)}
                          className="p-1 sm:p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                          title="Reserve Stock"
                        >
                          <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(item)}
                          className="p-1 sm:p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                          title="Edit"
                        >
                          <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                        <button
                          onClick={() => handleMovementHistory(item)}
                          className="p-1 sm:p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all hidden sm:flex"
                          title="Movement History"
                        >
                          <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                        <button
                          onClick={() => handlePrintBarcode(item)}
                          className="p-1 sm:p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all hidden sm:flex"
                          title="Print Barcode"
                        >
                          <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedItems.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                      No inventory records found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={filteredItems.length}
            itemsPerPage={itemsPerPage}
          />
        </div>
      ) : (
        // Grid View
        <>
          <div className="bg-[#0d1322] border border-slate-800 rounded-2xl p-4 sm:p-5">
            <InventoryGrid
              items={paginatedItems}
              onViewDetails={handleViewDetails}
              onReserveStock={handleReserveStock}
              onEdit={handleEdit}
              onMovementHistory={handleMovementHistory}
              onPrintBarcode={handlePrintBarcode}
            />
            {paginatedItems.length === 0 && (
              <div className="text-center text-slate-400 py-8">
                No inventory records found matching your criteria.
              </div>
            )}
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={filteredItems.length}
            itemsPerPage={itemsPerPage}
          />
        </>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0d1322]" aria-labelledby="recent-movements-title">
        <div className="border-b border-slate-800 px-4 py-4 sm:px-5">
          <h2 id="recent-movements-title" className="text-lg font-semibold text-white">Recent Inventory Movements</h2>
          <p className="mt-1 text-sm text-slate-400">Latest completed Stock In and Stock Out activity.</p>
        </div>
        <MovementTable movements={recentMovements} loading={recentMovementsLoading} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0d1322]" aria-labelledby="inventory-history-title">
        <div className="border-b border-slate-800 px-4 py-4 sm:px-5">
          <h2 id="inventory-history-title" className="text-lg font-semibold text-white">Inventory History</h2>
          <p className="mt-1 text-sm text-slate-400">Historical activity from existing Stock In and Stock Out records.</p>
        </div>
        <div className="grid gap-3 border-b border-slate-800 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <label className="xl:col-span-1">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Search</span>
            <input value={historySearch} onChange={event => { setHistorySearch(event.target.value); setHistoryPage(1); }} placeholder="Product, barcode, warehouse..." className="min-h-11 w-full rounded-xl border border-slate-700 bg-[#090d16] px-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40" />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Type</span>
            <select value={historyType} onChange={event => { setHistoryType(event.target.value as 'ALL' | InventoryMovementType); setHistoryPage(1); }} className="min-h-11 w-full cursor-pointer rounded-xl border border-slate-700 bg-[#090d16] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
              <option value="ALL">All Types</option><option value="STOCK_IN">Stock In</option><option value="STOCK_OUT">Stock Out</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Warehouse</span>
            <select value={historyWarehouse} onChange={event => { setHistoryWarehouse(event.target.value); setHistoryPage(1); }} className="min-h-11 w-full cursor-pointer rounded-xl border border-slate-700 bg-[#090d16] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
              <option value="">All Warehouses</option>
              {warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-slate-400">From</span>
            <input type="date" value={historyDateFrom} onChange={event => { setHistoryDateFrom(event.target.value); setHistoryPage(1); }} className="min-h-11 w-full rounded-xl border border-slate-700 bg-[#090d16] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40" />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-slate-400">To</span>
            <input type="date" min={historyDateFrom || undefined} value={historyDateTo} onChange={event => { setHistoryDateTo(event.target.value); setHistoryPage(1); }} className="min-h-11 w-full rounded-xl border border-slate-700 bg-[#090d16] px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40" />
          </label>
        </div>
        <MovementTable movements={historyMovements} loading={movementsLoading} />
        <Pagination currentPage={historyPage} totalPages={historyLastPage} onPageChange={setHistoryPage} totalItems={historyTotal} itemsPerPage={10} />
      </section>

      {/* Modals */}
      <InventoryFormModal
        isOpen={showFormModal}
        mode={formMode}
        onClose={() => { setShowFormModal(false); setSelectedProduct(null); }}
        product={selectedProduct}
        warehouses={warehouses}
        onSubmit={handleFormSubmit}
      />
      <ReserveStockModal
        isOpen={showReserveModal}
        onClose={() => setShowReserveModal(false)}
        product={selectedProduct}
        onReserve={handleReserveSubmit}
      />
      <BackloadStockModal
        isOpen={showBackloadModal}
        onClose={() => setShowBackloadModal(false)}
        items={items}
      />
      <DetailsDrawer
        isOpen={showDetailsDrawer}
        onClose={() => setShowDetailsDrawer(false)}
        product={selectedProduct}
      />
    </div>
  );
};

// ============================================
// PLACEHOLDER COMPONENTS FOR OTHER TABS
// ============================================

export const ManageLocations: React.FC = () => (
  <div className="text-slate-400 text-center py-12">Manage Locations - Coming Soon</div>
);

// ============================================
// MAIN WAREHOUSE MODULE (with Tabs & outer container)
// ============================================

const WarehouseModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'locations'>('inventory');

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#090d16]">
      <main className="flex-1 overflow-y-auto py-4 sm:py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <span>Dashboard</span>
            <ChevronBreadcrumb className="w-4 h-4" />
            <span className="text-white font-medium">Warehouse</span>
          </div>

          {/* Navigation Tabs */}
          <div className="border-b border-slate-800">
            <div className="flex gap-6">
              <button
                onClick={() => setActiveTab('inventory')}
                className={`pb-3 text-sm font-medium transition-all relative flex items-center gap-2 ${
                  activeTab === 'inventory'
                    ? 'text-white border-b-2 border-cyan-500'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Package className="w-4 h-4" />
                Inventory List
              </button>
              <button
                onClick={() => setActiveTab('locations')}
                className={`pb-3 text-sm font-medium transition-all relative flex items-center gap-2 ${
                  activeTab === 'locations'
                    ? 'text-white border-b-2 border-cyan-500'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <MapPin className="w-4 h-4" />
                Manage Locations
              </button>
            </div>
          </div>

          {/* Page Content */}
          {activeTab === 'inventory' && <InventoryList />}
          {activeTab === 'locations' && <ManageLocations />}
        </div>
      </main>
    </div>
  );
};

export default WarehouseModule;
