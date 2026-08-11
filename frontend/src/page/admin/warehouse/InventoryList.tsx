// src/page/admin/Inventory.tsx
import React, { useState, useMemo } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Package,
  MapPin,
  ClipboardList,
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
  ArrowUp,
  ArrowDown,
  Coins,
  Layers,
  Truck,
  Filter,
  QrCode,
  ArrowRight,
  AlertTriangle,
  Info,
  Check,
  LayoutList,
  LayoutGrid,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface InventoryItem {
 id: string;
 sku: string;
 barcode: string;
 productName: string;
 warehouse: string;
 rack: string;
 shelf: string;
 bin: string;
 batchLot: string | null;
 availableQty: number;
 reservedQty: number;
 damagedQty: number;
 totalQty: number;
 unit: string;
 reorderLevel: number;
 image?: string;
 category: string;
 brand: string;
 serialTracked: boolean;
 costPrice: number;
 lastUpdated: string;
 supplierRef?: string;
 supplierName?: string;
 receivingReference?: string;
 receivedDate?: string;
 movements?: MovementLog[];
 pendingReceiving?: boolean;
}

interface MovementLog {
 id: string;
 date: string;
 type: 'Stock In' | 'Stock Out' | 'Transfer' | 'Adjustment' | 'Reserved' | 'QA Passed' | 'Receiving';
 qty: number;
 user: string;
 reason?: string;
 reference?: string;
}

interface DamagedRecord {
 id: string;
 productId: string;
 productName: string;
 barcode: string;
 quantity: number;
 reason: string;
 reportedBy: string;
 date: string;
 inspectionReference: string;
}

// ============================================
// MOCK DATA
// ============================================

const mockDamagedRecords: DamagedRecord[] = [
 {
  id: 'd1',
  productId: '4',
  productName: 'Stainless Steel Bottle',
  barcode: 'SKU-BOTTLE-002',
  quantity: 2,
  reason: 'Damaged during shipping',
  reportedBy: 'A. Reyes',
  date: '2026-08-05',
  inspectionReference: 'INSP-2026-008',
 },
 {
  id: 'd2',
  productId: '3',
  productName: 'Organic Green Tea',
  barcode: 'SKU-ORG-TEA-001',
  quantity: 1,
  reason: 'Expired',
  reportedBy: 'L. Cruz',
  date: '2026-08-03',
  inspectionReference: 'INSP-2026-012',
 },
];

const mockInventory: InventoryItem[] = [
 {
  id: '1',
  sku: 'SKU-IPAD-AIRRR',
  barcode: '8806091234567',
  productName: 'IPAD AIR',
  warehouse: 'Central Depot',
  rack: 'A-02',
  shelf: '2',
  bin: 'B',
  batchLot: null,
  availableQty: 2,
  reservedQty: 0,
  damagedQty: 0,
  totalQty: 2,
  unit: 'pcs',
  reorderLevel: 3,
  category: 'Electronics',
  brand: 'Apple',
  serialTracked: true,
  costPrice: 10000,
  lastUpdated: '2 mins ago',
  supplierRef: 'SUP-001',
  supplierName: 'Apple Inc.',
  receivingReference: 'PO-2026-001',
  receivedDate: '2026-08-01',
  movements: [
   { id: 'm1', date: '2026-08-01 10:30', type: 'Receiving', qty: 10, user: 'A. Reyes', reference: 'PO-2026-001' },
   { id: 'm2', date: '2026-08-01 11:00', type: 'QA Passed', qty: 10, user: 'Q. Inspector' },
   { id: 'm3', date: '2026-08-02 09:15', type: 'Stock In', qty: 10, user: 'A. Reyes' },
   { id: 'm4', date: '2026-08-05 14:20', type: 'Stock Out', qty: -8, user: 'M. Lim' },
  ],
  pendingReceiving: false,
 },
 {
  id: '2',
  sku: 'SKU-SONY-XM5',
  barcode: '8806092345678',
  productName: 'Sony WH-1000XM5',
  warehouse: 'Central Depot',
  rack: 'B-04',
  shelf: '1',
  bin: 'C',
  batchLot: null,
  availableQty: 95,
  reservedQty: 4,
  damagedQty: 0,
  totalQty: 99,
  unit: 'pcs',
  reorderLevel: 10,
  category: 'Electronics',
  brand: 'Sony',
  serialTracked: false,
  costPrice: 15000,
  lastUpdated: '1 hr ago',
  supplierRef: 'SUP-002',
  supplierName: 'Sony Corp.',
  receivingReference: 'PO-2026-005',
  receivedDate: '2026-07-20',
  movements: [
   { id: 'm5', date: '2026-07-20 08:00', type: 'Receiving', qty: 50, user: 'A. Reyes', reference: 'PO-2026-005' },
   { id: 'm6', date: '2026-07-20 09:00', type: 'QA Passed', qty: 50, user: 'Q. Inspector' },
   { id: 'm7', date: '2026-07-21 10:00', type: 'Stock In', qty: 50, user: 'A. Reyes' },
   { id: 'm8', date: '2026-08-01 16:30', type: 'Stock Out', qty: -5, user: 'R. Diaz' },
   { id: 'm9', date: '2026-08-05 11:00', type: 'Reserved', qty: 4, user: 'Sales Team', reason: 'Customer order #1234' },
  ],
  pendingReceiving: false,
 },
 {
  id: '3',
  sku: 'SKU-ORG-TEA-001',
  barcode: '8806093456789',
  productName: 'Organic Green Tea',
  warehouse: 'Northgate',
  rack: 'C-12',
  shelf: '3',
  bin: 'A',
  batchLot: 'BATCH-2024-01',
  availableQty: 39,
  reservedQty: 5,
  damagedQty: 1,
  totalQty: 45,
  unit: 'box',
  reorderLevel: 20,
  category: 'Beverages',
  brand: "Nature's Best",
  serialTracked: false,
  costPrice: 250,
  lastUpdated: 'Aug 10, 2026',
  supplierRef: 'SUP-003',
  supplierName: 'Nature’s Best Co.',
  receivingReference: 'PO-2026-012',
  receivedDate: '2026-08-02',
  movements: [
   { id: 'm10', date: '2026-08-02 09:00', type: 'Receiving', qty: 30, user: 'A. Reyes', reference: 'PO-2026-012' },
   { id: 'm11', date: '2026-08-02 09:30', type: 'QA Passed', qty: 30, user: 'Q. Inspector' },
   { id: 'm12', date: '2026-08-03 10:00', type: 'Stock In', qty: 30, user: 'A. Reyes' },
   { id: 'm13', date: '2026-08-05 13:00', type: 'Stock Out', qty: -5, user: 'J. Santos' },
   { id: 'm14', date: '2026-08-06 08:00', type: 'Reserved', qty: 5, user: 'Sales Team', reason: 'Customer order #5678' },
   { id: 'm15', date: '2026-08-07 09:00', type: 'Adjustment', qty: -1, user: 'L. Cruz', reason: 'Damaged' },
  ],
  pendingReceiving: false,
 },
 {
  id: '4',
  sku: 'SKU-BOTTLE-002',
  barcode: '8806094567890',
  productName: 'Stainless Steel Bottle',
  warehouse: 'Eastside',
  rack: 'D-08',
  shelf: '2',
  bin: 'F',
  batchLot: null,
  availableQty: 0,
  reservedQty: 0,
  damagedQty: 2,
  totalQty: 2,
  unit: 'pcs',
  reorderLevel: 5,
  category: 'Kitchenware',
  brand: 'EcoLife',
  serialTracked: false,
  costPrice: 450,
  lastUpdated: 'Aug 9, 2026',
  supplierRef: 'SUP-004',
  supplierName: 'EcoLife Inc.',
  receivingReference: 'PO-2026-020',
  receivedDate: '2026-07-15',
  movements: [
   { id: 'm16', date: '2026-07-15 08:00', type: 'Receiving', qty: 10, user: 'A. Reyes', reference: 'PO-2026-020' },
   { id: 'm17', date: '2026-07-15 09:00', type: 'QA Passed', qty: 10, user: 'Q. Inspector' },
   { id: 'm18', date: '2026-07-16 10:00', type: 'Stock In', qty: 10, user: 'A. Reyes' },
   { id: 'm19', date: '2026-08-01 13:00', type: 'Stock Out', qty: -8, user: 'J. Santos' },
   { id: 'm20', date: '2026-08-05 11:00', type: 'Adjustment', qty: -2, user: 'L. Cruz', reason: 'Damaged' },
  ],
  pendingReceiving: false,
 },
 {
  id: '5',
  sku: 'SKU-MBP-M3',
  barcode: '8806095678901',
  productName: 'Macbook Pro M3',
  warehouse: 'Southpark',
  rack: 'E-01',
  shelf: '1',
  bin: 'A',
  batchLot: null,
  availableQty: 3,
  reservedQty: 2,
  damagedQty: 0,
  totalQty: 5,
  unit: 'pcs',
  reorderLevel: 4,
  category: 'Electronics',
  brand: 'Apple',
  serialTracked: true,
  costPrice: 150000,
  lastUpdated: 'Aug 8, 2026',
  supplierRef: 'SUP-001',
  supplierName: 'Apple Inc.',
  receivingReference: 'PO-2026-025',
  receivedDate: '2026-07-28',
  movements: [
   { id: 'm21', date: '2026-07-28 09:00', type: 'Receiving', qty: 20, user: 'A. Reyes', reference: 'PO-2026-025' },
   { id: 'm22', date: '2026-07-28 10:00', type: 'QA Passed', qty: 20, user: 'Q. Inspector' },
   { id: 'm23', date: '2026-07-29 10:00', type: 'Stock In', qty: 20, user: 'A. Reyes' },
   { id: 'm24', date: '2026-08-03 12:00', type: 'Stock Out', qty: -15, user: 'M. Santos' },
   { id: 'm25', date: '2026-08-05 14:00', type: 'Reserved', qty: 2, user: 'Sales Team', reason: 'Customer order #9012' },
  ],
  pendingReceiving: false,
 },
 {
  id: '6',
  sku: 'SKU-CHAIR-001',
  barcode: '8806096789012',
  productName: 'Ergonomic Chair',
  warehouse: 'Central Depot',
  rack: 'F-03',
  shelf: '2',
  bin: 'D',
  batchLot: null,
  availableQty: 12,
  reservedQty: 3,
  damagedQty: 0,
  totalQty: 15,
  unit: 'pcs',
  reorderLevel: 6,
  category: 'Furniture',
  brand: 'FlexiSeat',
  serialTracked: false,
  costPrice: 12000,
  lastUpdated: '5 mins ago',
  supplierRef: 'SUP-006',
  supplierName: 'FlexiSeat Ltd.',
  receivingReference: 'PO-2026-030',
  receivedDate: '2026-07-25',
  movements: [
   { id: 'm26', date: '2026-07-25 08:00', type: 'Receiving', qty: 8, user: 'A. Reyes', reference: 'PO-2026-030' },
   { id: 'm27', date: '2026-07-25 09:00', type: 'QA Passed', qty: 8, user: 'Q. Inspector' },
   { id: 'm28', date: '2026-07-26 10:00', type: 'Stock In', qty: 8, user: 'A. Reyes' },
   { id: 'm29', date: '2026-08-02 11:00', type: 'Reserved', qty: 3, user: 'Sales Team', reason: 'Customer order #3456' },
  ],
  pendingReceiving: false,
 },
 {
  id: '7',
  sku: 'SKU-NEW-001',
  barcode: '8806097890123',
  productName: 'Wireless Keyboard',
  warehouse: 'Central Depot',
  rack: 'G-01',
  shelf: '1',
  bin: 'A',
  batchLot: null,
  availableQty: 0,
  reservedQty: 0,
  damagedQty: 0,
  totalQty: 0,
  unit: 'pcs',
  reorderLevel: 10,
  category: 'Electronics',
  brand: 'Logitech',
  serialTracked: false,
  costPrice: 2500,
  lastUpdated: '1 day ago',
  supplierRef: 'SUP-007',
  supplierName: 'Logitech',
  receivingReference: 'PO-2026-035',
  receivedDate: '2026-08-06',
  movements: [
   { id: 'm30', date: '2026-08-06 08:00', type: 'Receiving', qty: 20, user: 'A. Reyes', reference: 'PO-2026-035' },
   { id: 'm31', date: '2026-08-06 09:00', type: 'QA Passed', qty: 20, user: 'Q. Inspector' },
  ],
  pendingReceiving: true,
 },
];

// ============================================
// CONSTANTS
// ============================================

const warehouses = ['All Warehouses', 'Central Depot', 'Northgate', 'Eastside', 'Southpark'];
const statuses = ['All Status', 'Healthy', 'Low Stock', 'Critical', 'Out of Stock'];
const categories = ['All Categories', 'Electronics', 'Beverages', 'Kitchenware', 'Furniture'];
const brands = ['All Brands', 'Apple', 'Sony', "Nature's Best", 'EcoLife', 'FlexiSeat', 'Logitech'];
const sortOptions = ['Name A-Z', 'Name Z-A', 'Stock Low-High', 'Stock High-Low', 'Last Updated'];

// ============================================
// HELPER FUNCTIONS
// ============================================

const getStatus = (availableQty: number, reorderLevel: number): 'Healthy' | 'Low Stock' | 'Critical' | 'Out of Stock' => {
 if (availableQty <= 0) return 'Out of Stock';
 if (availableQty < reorderLevel * 0.5) return 'Critical';
 if (availableQty < reorderLevel) return 'Low Stock';
 return 'Healthy';
};

const getStatusColor = (status: string) => {
 switch (status) {
  case 'Healthy': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  case 'Low Stock': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
  case 'Critical': return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
  case 'Out of Stock': return 'text-red-400 bg-red-500/10 border-red-500/20';
  default: return 'text-gray-400 bg-slate-500/10 border-slate-500/20';
 }
};

const getStatusIcon = (status: string) => {
 switch (status) {
  case 'Healthy': return CheckCircle;
  case 'Low Stock': return AlertCircle;
  case 'Critical': return AlertTriangle;
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

// ----- KPI Card -----
const KPICard: React.FC<{
 label: string;
 value: string | number;
 subtitle: string;
 icon: React.ReactNode;
 trend?: { value: string; positive: boolean };
 onClick?: () => void;
 clickable?: boolean;
 iconContainerClassName?: string;
}> = ({ label, value, subtitle, icon, trend, onClick, clickable, iconContainerClassName }) => {
 return (
  <div
   className={`relative overflow-hidden bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-5 hover:border-gray-700 hover:border-gray-700 transition-all duration-200 ${clickable ? 'cursor-pointer hover:bg-gray-800/50 hover:bg-[#111927]' : ''}`}
   onClick={onClick}
  >
   <div className="flex items-start justify-between">
    <div>
     <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">{label}</p>
     <p className="text-2xl font-bold text-white mt-1.5">{value}</p>
     <p className="text-gray-400 text-xs mt-1">{subtitle}</p>
    </div>
    <div className={iconContainerClassName || 'p-2.5 bg-gray-800/50 bg-gray-800/60 rounded-lg'}>{icon}</div>
   </div>
   {trend && (
    <div className="mt-2 flex items-center gap-1 text-xs">
     <span className={trend.positive ? 'text-emerald-400' : 'text-red-400'}>
      {trend.positive ? '↑' : '↓'} {trend.value}
     </span>
     <span className="text-gray-400">vs last month</span>
    </div>
   )}
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
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
  <input
   type="text"
   value={value}
   onChange={(e) => onChange(e.target.value)}
   placeholder={placeholder}
   className="w-full bg-gray-800/50 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-gray-400 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all"
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
   className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer"
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
  <div className="flex items-center justify-between px-3 py-3 sm:px-6 sm:py-4 border-t border-gray-800 border-gray-800 bg-[#0b0f19]/30">
   <div className="text-sm text-gray-400">
    Showing <span className="text-white font-medium">{start}</span> to{' '}
    <span className="text-white font-medium">{end}</span> of{' '}
    <span className="text-white font-medium">{totalItems}</span> items
   </div>
   <div className="flex items-center gap-1">
    <button
     onClick={() => onPageChange(Math.max(1, currentPage - 1))}
     disabled={currentPage === 1}
     className="p-1.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
        : 'text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800'
      }`}
     >
      {page}
     </button>
    ))}
    <button
     onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
     disabled={currentPage === totalPages}
     className="p-1.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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

// ----- Stock Adjustment Modal -----
const StockAdjustmentModal: React.FC<{
 isOpen: boolean;
 onClose: () => void;
 product: InventoryItem | null;
 onAdjust: (id: string, adjustment: { type: 'increase' | 'decrease'; qty: number; reason: string; notes: string }) => void;
}> = ({ isOpen, onClose, product, onAdjust }) => {
 const [adjustmentType, setAdjustmentType] = useState<'increase' | 'decrease'>('increase');
 const [qty, setQty] = useState<number>(0);
 const [reason, setReason] = useState('');
 const [notes, setNotes] = useState('');

 if (!isOpen || !product) return null;

 const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  if (qty <= 0) return;
  onAdjust(product.id, { type: adjustmentType, qty, reason, notes });
  onClose();
 };

 return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
   <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
    <div className="flex items-center justify-between mb-6">
     <h2 className="text-xl font-bold text-white">Stock Adjustment</h2>
     <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-all">
      <X className="w-5 h-5" />
     </button>
    </div>
    <div className="mb-4 p-4 bg-gray-800/50 rounded-xl border border-gray-800 border-gray-800">
     <p className="text-sm text-gray-400">Product</p>
     <p className="text-white font-medium">{product.productName}</p>
     <p className="text-gray-400 text-xs">SKU: {product.sku} | Current Stock: {product.totalQty} {product.unit}</p>
    </div>
    <form onSubmit={handleSubmit} className="space-y-4">
     <div>
      <label className="block text-sm font-medium mb-1.5 text-gray-300 text-gray-300">Adjustment Type</label>
      <div className="flex gap-3">
       <button
        type="button"
        onClick={() => setAdjustmentType('increase')}
        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
         adjustmentType === 'increase'
          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          : 'bg-gray-800/50 bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:bg-gray-700'
        }`}
       >
        <ArrowUp className="w-4 h-4 inline mr-1.5" /> Increase
       </button>
       <button
        type="button"
        onClick={() => setAdjustmentType('decrease')}
        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
         adjustmentType === 'decrease'
          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
          : 'bg-gray-800/50 bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:bg-gray-700'
        }`}
       >
        <ArrowDown className="w-4 h-4 inline mr-1.5" /> Decrease
       </button>
      </div>
     </div>
     <div>
      <label className="block text-sm font-medium mb-1.5 text-gray-300 text-gray-300">Quantity *</label>
      <input
       type="number"
       min="1"
       value={qty}
       onChange={(e) => setQty(Number(e.target.value))}
       className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-400 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
       required
      />
     </div>
     <div>
      <label className="block text-sm font-medium mb-1.5 text-gray-300 text-gray-300">Reason *</label>
      <select
       value={reason}
       onChange={(e) => setReason(e.target.value)}
       className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none"
       required
      >
       <option value="">Select reason</option>
       <option>Damaged</option>
       <option>Expired</option>
       <option>Lost</option>
       <option>Found</option>
       <option>Correction</option>
       <option>Transferred</option>
      </select>
     </div>
     <div>
      <label className="block text-sm font-medium mb-1.5 text-gray-300 text-gray-300">Notes</label>
      <textarea
       value={notes}
       onChange={(e) => setNotes(e.target.value)}
       rows={2}
       className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-400 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
       placeholder="Additional details..."
      />
     </div>
     <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-800 border-gray-800">
      <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-700 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800 transition-all">
       Cancel
      </button>
      <button type="submit" className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 text-slate-950">
       <Save className="w-4 h-4" /> Apply Adjustment
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
 onReserve: (id: string, qty: number, reason: string) => void;
}> = ({ isOpen, onClose, product, onReserve }) => {
 const [qty, setQty] = useState<number>(0);
 const [reason, setReason] = useState('');

 if (!isOpen || !product) return null;

 const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  if (qty <= 0 || qty > product.availableQty) return;
  onReserve(product.id, qty, reason);
  onClose();
 };

 return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
   <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
    <div className="flex items-center justify-between mb-6">
     <h2 className="text-xl font-bold text-white">Reserve Stock</h2>
     <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-all">
      <X className="w-5 h-5" />
     </button>
    </div>
    <div className="mb-4 p-4 bg-gray-800/50 rounded-xl border border-gray-800 border-gray-800">
     <p className="text-sm text-gray-400">Product</p>
     <p className="text-white font-medium">{product.productName}</p>
     <p className="text-gray-400 text-xs">Available: {product.availableQty} {product.unit}</p>
    </div>
    <form onSubmit={handleSubmit} className="space-y-4">
     <div>
      <label className="block text-sm font-medium mb-1.5 text-gray-300 text-gray-300">Quantity to Reserve *</label>
      <input
       type="number"
       min="1"
       max={product.availableQty}
       value={qty}
       onChange={(e) => setQty(Number(e.target.value))}
       className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-400 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
       required
      />
      <p className="text-xs text-gray-400 mt-1">Max: {product.availableQty}</p>
     </div>
     <div>
      <label className="block text-sm font-medium mb-1.5 text-gray-300 text-gray-300">Reason (e.g., Order #)</label>
      <input
       type="text"
       value={reason}
       onChange={(e) => setReason(e.target.value)}
       placeholder="Customer order, internal use, etc."
       className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-400 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
      />
     </div>
     <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-800 border-gray-800">
      <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-700 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800 transition-all">
       Cancel
      </button>
      <button type="submit" className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-blue-500 text-slate-950">
       <Save className="w-4 h-4" /> Reserve
      </button>
     </div>
    </form>
   </div>
  </div>
 );
};

// ----- Damaged Stock Modal -----
const DamagedStockModal: React.FC<{
 isOpen: boolean;
 onClose: () => void;
 records: DamagedRecord[];
}> = ({ isOpen, onClose, records }) => {
 if (!isOpen) return null;

 return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
   <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
    <div className="flex items-center justify-between mb-6">
     <h2 className="text-xl font-bold text-white">Damaged Stock</h2>
     <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-all">
      <X className="w-5 h-5" />
     </button>
    </div>
    {records.length === 0 ? (
     <p className="text-gray-400 text-center py-8">No damaged stock records.</p>
    ) : (
     <div className="overflow-x-auto">
      <table className="w-full min-w-[600px]">
       <thead className="bg-gray-800/50 bg-gray-800/50 border-b border-gray-800 border-gray-800">
        <tr>
         <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Product</th>
         <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Barcode</th>
         <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-400">Qty</th>
         <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Reason</th>
         <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Reported By</th>
         <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Date</th>
        </tr>
       </thead>
       <tbody>
        {records.map((record) => (
         <tr key={record.id} className="border-b border-gray-800 border-gray-800 hover:bg-gray-800/50 hover:bg-gray-800/30">
          <td className="px-4 py-3 text-sm text-white">{record.productName}</td>
          <td className="px-4 py-3 text-sm font-mono text-gray-400 text-gray-300">{record.barcode}</td>
          <td className="px-4 py-3 text-center text-sm text-white">{record.quantity}</td>
          <td className="px-4 py-3 text-sm text-gray-400 text-gray-300">{record.reason}</td>
          <td className="px-4 py-3 text-sm text-gray-400 text-gray-300">{record.reportedBy}</td>
          <td className="px-4 py-3 text-sm text-gray-400">{record.date}</td>
         </tr>
        ))}
       </tbody>
      </table>
     </div>
    )}
    <div className="flex justify-end pt-4 border-t border-gray-800 border-gray-800 mt-4">
     <button onClick={onClose} className="px-5 py-2.5 border border-gray-700 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800 transition-all">
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

 const movements = product.movements || [];

 const inventoryValue = product.totalQty * product.costPrice;

 const status = getStatus(product.availableQty, product.reorderLevel);

 return (
  <div className="fixed inset-0 z-50 flex justify-end">
   <div className="bg-black/60 backdrop-blur-sm w-full" onClick={onClose}></div>
   <div className="bg-[#0d1322] border-l border-gray-800 border-gray-800 shadow-sm w-full sm:w-[480px] h-full overflow-y-auto p-4 sm:p-6 animate-in slide-in-from-right duration-300">
    <div className="flex items-center justify-between mb-6">
     <h2 className="text-xl font-bold text-white">Product Details</h2>
     <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-all">
      <X className="w-5 h-5" />
     </button>
    </div>

    <div className="space-y-6">
     <div className="flex items-start gap-4">
      <div className="w-20 h-20 rounded-xl bg-gray-800/50 bg-gray-800/50 border border-gray-800 border-gray-700 flex items-center justify-center text-gray-400 text-gray-400">
       <Package className="w-10 h-10" />
      </div>
      <div>
       <h3 className="text-white font-semibold text-lg">{product.productName}</h3>
       <p className="text-gray-400 text-sm">SKU: {product.sku}</p>
       <p className="text-gray-400 text-sm">Barcode: {product.barcode}</p>
       <p className="text-gray-400 text-sm">Category: {product.category} | Brand: {product.brand}</p>
      </div>
     </div>

     <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-800 border-gray-800 text-center">
      <p className="text-gray-400 text-xs mb-2">QR Code</p>
      <div className="flex justify-center">
       <div className="w-28 h-28 bg-[#0d1322] rounded-lg flex items-center justify-center">
        <QrCode className="w-20 h-20 text-black" />
       </div>
      </div>
     </div>

     <div className="grid grid-cols-2 gap-3 text-sm">
      <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-800 border-gray-800">
       <p className="text-gray-400">Warehouse</p>
       <p className="text-white">{product.warehouse}</p>
      </div>
      <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-800 border-gray-800">
       <p className="text-gray-400">Rack / Shelf / Bin</p>
       <p className="text-white">{product.rack} • {product.shelf} / {product.bin}</p>
      </div>
      <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-800 border-gray-800">
       <p className="text-gray-400">Batch / Lot</p>
       <p className="text-white">{product.batchLot || 'N/A'}</p>
      </div>
      <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-800 border-gray-800">
       <p className="text-gray-400">Supplier</p>
       <p className="text-white">{product.supplierName || 'N/A'}</p>
      </div>
      <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-800 border-gray-800">
       <p className="text-gray-400">Receiving Reference</p>
       <p className="text-white">{product.receivingReference || 'N/A'}</p>
      </div>
      <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-800 border-gray-800">
       <p className="text-gray-400">Received Date</p>
       <p className="text-white">{product.receivedDate || 'N/A'}</p>
      </div>
      <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-800 border-gray-800">
       <p className="text-gray-400">Unit</p>
       <p className="text-white">{product.unit}</p>
      </div>
      <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-800 border-gray-800">
       <p className="text-gray-400">Reorder Level</p>
       <p className="text-white">{product.reorderLevel}</p>
      </div>
      <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-800 border-gray-800 col-span-2">
       <p className="text-gray-400">Inventory Value</p>
       <p className="text-white font-bold">₱{inventoryValue.toLocaleString()}</p>
      </div>
     </div>

     <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-800 border-gray-800">
      <p className="text-gray-400 text-xs mb-2">Stock Breakdown</p>
      <div className="grid grid-cols-3 gap-2 text-sm">
       <div className="text-center">
        <p className="text-emerald-400">Available</p>
        <p className="text-white font-medium">{product.availableQty}</p>
       </div>
       <div className="text-center">
        <p className="text-blue-400">Reserved</p>
        <p className="text-white font-medium">{product.reservedQty}</p>
       </div>
       <div className="text-center">
        <p className="text-red-400">Damaged</p>
        <p className="text-white font-medium">{product.damagedQty}</p>
       </div>
      </div>
      <div className="mt-2 text-center text-sm text-gray-400">
       Total Physical: {product.totalQty} {product.unit}
      </div>
      <div className="mt-2 flex justify-center">
       <StatusBadge status={status} />
      </div>
     </div>

     <div>
      <h4 className="text-sm font-medium text-gray-300 text-gray-300 mb-2">Movement History</h4>
      <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
       {movements.length > 0 ? (
        movements.map((mov) => (
         <div key={mov.id} className="flex items-start gap-3 text-sm">
          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
           mov.type === 'Stock In' || mov.type === 'Receiving' || mov.type === 'QA Passed' ? 'bg-emerald-500' :
           mov.type === 'Stock Out' ? 'bg-red-500' :
           mov.type === 'Transfer' ? 'bg-blue-500' :
           mov.type === 'Reserved' ? 'bg-yellow-500' :
           'bg-purple-500'
          }`} />
          <div className="flex-1">
           <p className="text-white">{mov.type}</p>
           <p className="text-gray-400 text-xs">
            {mov.qty > 0 ? `+${mov.qty}` : mov.qty} {mov.reason ? `(${mov.reason})` : ''}
            {mov.reference && ` • Ref: ${mov.reference}`}
           </p>
           <p className="text-gray-400 text-xs">{mov.date} • {mov.user}</p>
          </div>
         </div>
        ))
       ) : (
        <p className="text-gray-400 text-sm">No movement history.</p>
       )}
      </div>
     </div>

     <div className="flex justify-end pt-4 border-t border-gray-800 border-gray-800">
      <button onClick={onClose} className="px-5 py-2.5 border border-gray-700 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800 transition-all">
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
 onAdjustStock: (item: InventoryItem) => void;
 onMovementHistory: (item: InventoryItem) => void;
 onPrintBarcode: (item: InventoryItem) => void;
}> = ({
 items,
 onViewDetails,
 onReserveStock,
 onAdjustStock,
 onMovementHistory,
 onPrintBarcode,
}) => {
 return (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
   {items.map((item) => {
    const status = getStatus(item.availableQty, item.reorderLevel);
    const inventoryValue = item.totalQty * item.costPrice;
    return (
     <div
      key={item.id}
      className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-4 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/5 hover:-translate-y-1 flex flex-col h-full"
     >
      {/* Product Image & Name */}
      <div className="flex items-start gap-3 mb-3">
       <div className="w-14 h-14 rounded-xl bg-gray-800/50 bg-gray-800/50 border border-gray-800 border-gray-700 flex items-center justify-center text-gray-400 text-gray-400 flex-shrink-0">
        <Package className="w-7 h-7" />
       </div>
       <div className="flex-1 min-w-0">
        <h3 className="text-white font-semibold text-base truncate">{item.productName}</h3>
        <p className="text-gray-400 text-xs truncate">SKU: {item.sku}</p>
        <p className="text-gray-400 text-xs truncate">Barcode: {item.barcode}</p>
       </div>
      </div>

      {/* Category & Warehouse */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mb-3">
       <span className="bg-gray-800/50 bg-gray-800/50 px-2 py-1 rounded-lg truncate">{item.category}</span>
       <span className="bg-gray-800/50 bg-gray-800/50 px-2 py-1 rounded-lg truncate">{item.warehouse}</span>
      </div>

      {/* Stock Quantities */}
      <div className="grid grid-cols-3 gap-2 text-center mb-3">
       <div className="bg-gray-800/50 rounded-xl p-2">
        <p className="text-emerald-400 text-xs font-medium">Available</p>
        <p className="text-white text-lg font-bold">{item.availableQty}</p>
       </div>
       <div className="bg-gray-800/50 rounded-xl p-2">
        <p className="text-blue-400 text-xs font-medium">Reserved</p>
        <p className="text-white text-lg font-bold">{item.reservedQty}</p>
       </div>
       <div className="bg-gray-800/50 rounded-xl p-2">
        <p className="text-red-400 text-xs font-medium">Damaged</p>
        <p className="text-white text-lg font-bold">{item.damagedQty}</p>
       </div>
      </div>

      {/* Status & Inventory Value */}
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-800 border-gray-800">
       <StatusBadge status={status} />
       <div className="text-right">
        <p className="text-gray-400 text-xs">Inventory Value</p>
        <p className="text-cyan-400 text-sm font-bold">₱{inventoryValue.toLocaleString()}</p>
       </div>
      </div>

      {/* Last Updated */}
      <div className="text-xs text-gray-400 mt-2">
       Updated: {item.lastUpdated}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-gray-800 border-gray-800">
       <button
        onClick={() => onViewDetails(item)}
        className="p-1.5 rounded-lg hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-all"
        title="View Details"
       >
        <Eye className="w-4 h-4" />
       </button>
       <button
        onClick={() => onReserveStock(item)}
        className="p-1.5 rounded-lg hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-all"
        title="Reserve Stock"
       >
        <Layers className="w-4 h-4" />
       </button>
       <button
        onClick={() => onAdjustStock(item)}
        className="p-1.5 rounded-lg hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-all"
        title="Stock Adjustment"
       >
        <Edit className="w-4 h-4" />
       </button>
       <button
        onClick={() => onMovementHistory(item)}
        className="p-1.5 rounded-lg hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-all"
        title="Movement History"
       >
        <History className="w-4 h-4" />
       </button>
       <button
        onClick={() => onPrintBarcode(item)}
        className="p-1.5 rounded-lg hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-all"
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

// ============================================
// MAIN INVENTORY LIST COMPONENT
// ============================================

export const InventoryList: React.FC = () => {
 // State
 const [search, setSearch] = useState('');
 const [warehouseFilter, setWarehouseFilter] = useState('All Warehouses');
 const [statusFilter, setStatusFilter] = useState('All Status');
 const [categoryFilter, setCategoryFilter] = useState('All Categories');
 const [brandFilter, setBrandFilter] = useState('All Brands');
 const [sortBy, setSortBy] = useState('Name A-Z');
 const [currentPage, setCurrentPage] = useState(1);
 const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
 const itemsPerPage = 10;

 // Modal states
 const [showAdjustModal, setShowAdjustModal] = useState(false);
 const [showReserveModal, setShowReserveModal] = useState(false);
 const [showDamagedModal, setShowDamagedModal] = useState(false);
 const [showDetailsDrawer, setShowDetailsDrawer] = useState(false);
 const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);

 // Quick actions handlers
 const handleReceiveStock = () => {
  alert('Navigate to Receiving module');
 };

 const handleStockIn = () => {
  alert('Open Stock In modal (increase stock)');
 };

 const handleStockOut = () => {
  alert('Open Stock Out modal (decrease stock)');
 };

 const handleTransferStock = () => {
  alert('Open Transfer Stock modal');
 };

 const handleExport = () => {
  alert('Export inventory data');
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

 const handleAdjustStock = (product: InventoryItem) => {
  setSelectedProduct(product);
  setShowAdjustModal(true);
 };

 const handleMovementHistory = (product: InventoryItem) => {
  setSelectedProduct(product);
  setShowDetailsDrawer(true);
 };

 const handlePrintBarcode = (product: InventoryItem) => {
  alert(`Print barcode for ${product.productName}`);
 };

 const handleDamagedKPIClick = () => {
  setShowDamagedModal(true);
 };

 const handleAdjustSubmit = (id: string, adjustment: { type: 'increase' | 'decrease'; qty: number; reason: string; notes: string }) => {
  alert(`Stock adjusted: ${adjustment.type} ${adjustment.qty} units for ${id}. Reason: ${adjustment.reason}`);
 };

 const handleReserveSubmit = (id: string, qty: number, reason: string) => {
  alert(`Reserved ${qty} units for ${id}. Reason: ${reason}`);
 };

 // Filter and sort
 const filteredItems = useMemo(() => {
  let items = mockInventory.filter(item => {
   const searchLower = search.toLowerCase();
   const matchSearch = 
    item.productName.toLowerCase().includes(searchLower) ||
    item.sku.toLowerCase().includes(searchLower) ||
    item.barcode.toLowerCase().includes(searchLower) ||
    (item.supplierName && item.supplierName.toLowerCase().includes(searchLower)) ||
    (item.batchLot && item.batchLot.toLowerCase().includes(searchLower)) ||
    (item.receivingReference && item.receivingReference.toLowerCase().includes(searchLower)) ||
    `${item.rack}${item.shelf}${item.bin}`.toLowerCase().includes(searchLower);

   const matchWarehouse = warehouseFilter === 'All Warehouses' || item.warehouse === warehouseFilter;
   const matchCategory = categoryFilter === 'All Categories' || item.category === categoryFilter;
   const matchBrand = brandFilter === 'All Brands' || item.brand === brandFilter;

   const computedStatus = getStatus(item.availableQty, item.reorderLevel);
   const matchStatus = statusFilter === 'All Status' || computedStatus === statusFilter;

   return matchSearch && matchWarehouse && matchCategory && matchBrand && matchStatus;
  });

  switch (sortBy) {
   case 'Name A-Z':
    items.sort((a, b) => a.productName.localeCompare(b.productName));
    break;
   case 'Name Z-A':
    items.sort((a, b) => b.productName.localeCompare(a.productName));
    break;
   case 'Stock Low-High':
    items.sort((a, b) => a.availableQty - b.availableQty);
    break;
   case 'Stock High-Low':
    items.sort((a, b) => b.availableQty - a.availableQty);
    break;
   case 'Last Updated':
    items.sort((a, b) => a.lastUpdated.localeCompare(b.lastUpdated));
    break;
   default:
    break;
  }
  return items;
 }, [search, warehouseFilter, statusFilter, categoryFilter, brandFilter, sortBy]);

 const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
 const paginatedItems = filteredItems.slice(
  (currentPage - 1) * itemsPerPage,
  currentPage * itemsPerPage
 );

 // KPI calculations
 const totalAvailable = mockInventory.reduce((sum, item) => sum + item.availableQty, 0);
 const totalReserved = mockInventory.reduce((sum, item) => sum + item.reservedQty, 0);
 const totalDamaged = mockInventory.reduce((sum, item) => sum + item.damagedQty, 0);
 const lowStockCount = mockInventory.filter(item => getStatus(item.availableQty, item.reorderLevel) === 'Low Stock').length;
 const criticalCount = mockInventory.filter(item => getStatus(item.availableQty, item.reorderLevel) === 'Critical').length;
 const outOfStockCount = mockInventory.filter(item => getStatus(item.availableQty, item.reorderLevel) === 'Out of Stock').length;
 const pendingReceivingCount = mockInventory.filter(item => item.pendingReceiving).length;
 const inventoryValue = mockInventory.reduce((sum, item) => sum + (item.totalQty * item.costPrice), 0);

 const belowReorderCount = mockInventory.filter(item => item.availableQty < item.reorderLevel && item.availableQty > 0).length;
 const reservedForShipmentCount = mockInventory.filter(item => item.reservedQty > 0).length;
 const readyForStockInCount = mockInventory.filter(item => item.pendingReceiving && item.availableQty === 0).length;

 return (
  <div className="space-y-6">
   {/* Header with actions on the right */}
   <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
     <h1 className="text-2xl font-bold text-white">Inventory</h1>
     <p className="text-gray-400 text-sm mt-1">Monitor warehouse inventory, stock movements, and stock valuation.</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
     <button
      onClick={handleReceiveStock}
      className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
     >
      <Plus className="w-4 h-4" /> Receive Stock
     </button>
     <button
      onClick={handleStockIn}
      className="px-4 py-2 border border-gray-700 hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 text-gray-300 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
     >
      <ArrowUp className="w-4 h-4" /> Stock In
     </button>
     <button
      onClick={handleStockOut}
      className="px-4 py-2 border border-gray-700 hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 text-gray-300 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
     >
      <ArrowDown className="w-4 h-4" /> Stock Out
     </button>
     <button
      onClick={handleTransferStock}
      className="px-4 py-2 border border-gray-700 hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 text-gray-300 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
     >
      <ArrowRight className="w-4 h-4" /> Transfer Stock
     </button>
     <button
      onClick={handleExport}
      className="px-4 py-2 border border-gray-700 hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 text-gray-300 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
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
     trend={{ value: '8%', positive: true }}
    />
    <KPICard
     label="Reserved Stock"
     value={totalReserved}
     subtitle="For shipments"
     icon={<Layers className="w-5 h-5 text-blue-400" />}
    />
    <KPICard
     label="Damaged Stock"
     value={totalDamaged}
     subtitle="Pending disposal"
     icon={<AlertTriangle className="w-5 h-5 text-red-400" />}
     clickable
     onClick={handleDamagedKPIClick}
    />
    <KPICard
     label="Low Stock Items"
     value={lowStockCount + criticalCount}
     subtitle={`${criticalCount} critical`}
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
     trend={{ value: '5.2%', positive: true }}
    />
   </div>

   {/* Alert Pills */}
   <div className="flex flex-wrap gap-2 sm:gap-3">
    {belowReorderCount > 0 && (
     <AlertPill
      title="Below Reorder"
      count={belowReorderCount}
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
   </div>

   {/* Filters - Two rows */}
   <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-3 sm:p-4 space-y-3">
    {/* Row 1: Search + main filters */}
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
     <SearchInput
      value={search}
      onChange={setSearch}
      placeholder="Search by SKU, Barcode, Product, Supplier, Batch, Location..."
      className="flex-[2] min-w-[160px] sm:min-w-[200px]"
     />
     <FilterSelect
      value={warehouseFilter}
      onChange={setWarehouseFilter}
      options={warehouses}
      className="flex-1 min-w-[100px] sm:min-w-[130px]"
     />
     <FilterSelect
      value={categoryFilter}
      onChange={setCategoryFilter}
      options={categories}
      className="flex-1 min-w-[100px] sm:min-w-[130px]"
     />
     <FilterSelect
      value={brandFilter}
      onChange={setBrandFilter}
      options={brands}
      className="flex-1 min-w-[100px] sm:min-w-[130px]"
     />
    </div>
    {/* Row 2: Status, Sort, Advanced, Reset */}
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
     <FilterSelect
      value={statusFilter}
      onChange={setStatusFilter}
      options={statuses}
      className="min-w-[100px] sm:min-w-[130px]"
     />
     <FilterSelect
      value={sortBy}
      onChange={setSortBy}
      options={sortOptions}
      className="min-w-[120px] sm:min-w-[140px]"
     />
     <button className="p-2 sm:p-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800 transition-all">
      <Filter className="w-4 h-4" />
     </button>
     <button
      onClick={() => {
       setSearch('');
       setWarehouseFilter('All Warehouses');
       setStatusFilter('All Status');
       setCategoryFilter('All Categories');
       setBrandFilter('All Brands');
       setSortBy('Name A-Z');
       setCurrentPage(1);
      }}
      className="px-3 py-2 sm:px-3.5 sm:py-2.5 border border-gray-700 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/50 hover:bg-gray-800 transition-all text-xs sm:text-sm"
     >
      Reset
     </button>
     <div className="flex-1 hidden md:block"></div>
     <div className="flex items-center gap-2">
      {outOfStockCount > 0 && (
       <span className="px-2 py-1 sm:px-3 sm:py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full text-[10px] sm:text-xs font-medium flex items-center gap-1">
        <XCircle className="w-3 h-3" /> {outOfStockCount} Out of Stock
       </span>
      )}
      {criticalCount > 0 && (
       <span className="px-2 py-1 sm:px-3 sm:py-1 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full text-[10px] sm:text-xs font-medium flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" /> {criticalCount} Critical
       </span>
      )}
     </div>
    </div>
   </div>

   {/* View Toggle & Results Count */}
   <div className="flex items-center justify-between">
    <div className="flex items-center gap-2 bg-[#0d1322] border border-gray-800/50 rounded-xl p-1">
     <button
      onClick={() => setViewMode('table')}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
       viewMode === 'table'
        ? 'bg-cyan-500 text-slate-950'
        : 'text-gray-400 hover:text-white'
      }`}
     >
      <LayoutList className="w-4 h-4" /> Table
     </button>
     <button
      onClick={() => setViewMode('grid')}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
       viewMode === 'grid'
        ? 'bg-cyan-500 text-slate-950'
        : 'text-gray-400 hover:text-white'
      }`}
     >
      <LayoutGrid className="w-4 h-4" /> Grid
     </button>
    </div>
    <div className="text-sm text-gray-400">
     {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
    </div>
   </div>

   {/* Inventory Display - Table or Grid */}
   {viewMode === 'table' ? (
    // Table View
    <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl overflow-hidden">
     <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
      <table className="w-full min-w-[1000px] text-left border-collapse">
       <thead className="bg-gray-800/50 bg-gray-800/50 border-b border-gray-800 border-gray-800 sticky top-0 z-10">
        <tr>
         <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400 sm:px-4 sm:py-3.5">Barcode</th>
         <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400 sm:px-4 sm:py-3.5 hidden lg:table-cell">SKU</th>
         <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400 sm:px-4 sm:py-3.5">Product</th>
         <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400 sm:px-4 sm:py-3.5">Warehouse</th>
         <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400 sm:px-4 sm:py-3.5 hidden 2xl:table-cell">Rack</th>
         <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400 sm:px-4 sm:py-3.5 hidden 2xl:table-cell">Shelf</th>
         <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400 sm:px-4 sm:py-3.5 hidden 2xl:table-cell">Bin</th>
         <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400 sm:px-4 sm:py-3.5 hidden 2xl:table-cell">Batch / Lot</th>
         <th className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-400 sm:px-4 sm:py-3.5">Available</th>
         <th className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-400 sm:px-4 sm:py-3.5 hidden lg:table-cell">Reserved</th>
         <th className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-400 sm:px-4 sm:py-3.5">Damaged</th>
         <th className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-400 sm:px-4 sm:py-3.5 hidden 2xl:table-cell">Reorder Level</th>
         <th className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-400 sm:px-4 sm:py-3.5">Status</th>
         <th className="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400 sm:px-4 sm:py-3.5 hidden xl:table-cell">Last Updated</th>
         <th className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-400 sm:px-4 sm:py-3.5">Actions</th>
        </tr>
       </thead>
       <tbody>
        {paginatedItems.map((item) => {
         const status = getStatus(item.availableQty, item.reorderLevel);
         return (
          <tr key={item.id} className="border-b border-gray-800 border-gray-800 hover:bg-gray-800/50 hover:bg-gray-800/30 transition-all">
           <td className="px-2 py-2 text-xs font-mono text-gray-400 text-gray-300 sm:px-4 sm:py-3.5 sm:text-sm truncate">{item.barcode}</td>
           <td className="px-2 py-2 text-xs font-mono text-gray-400 text-gray-300 sm:px-4 sm:py-3.5 sm:text-sm truncate hidden lg:table-cell">{item.sku}</td>
           <td className="px-2 py-2 sm:px-4 sm:py-3.5">
            <div className="flex items-center gap-2 sm:gap-3">
             <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-md sm:rounded-lg bg-gray-800/50 bg-gray-800/50 border border-gray-800 border-gray-700 flex items-center justify-center text-gray-400 text-gray-400">
              <Package className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
             </div>
             <span className="text-white text-xs sm:text-sm font-medium truncate">{item.productName}</span>
            </div>
           </td>
           <td className="px-2 py-2 text-xs text-gray-400 text-gray-300 sm:px-4 sm:py-3.5 sm:text-sm truncate">{item.warehouse}</td>
           <td className="px-2 py-2 text-xs text-gray-400 text-gray-300 sm:px-4 sm:py-3.5 sm:text-sm truncate hidden 2xl:table-cell">{item.rack}</td>
           <td className="px-2 py-2 text-xs text-gray-400 text-gray-300 sm:px-4 sm:py-3.5 sm:text-sm truncate hidden 2xl:table-cell">{item.shelf}</td>
           <td className="px-2 py-2 text-xs text-gray-400 text-gray-300 sm:px-4 sm:py-3.5 sm:text-sm truncate hidden 2xl:table-cell">{item.bin}</td>
           <td className="px-2 py-2 text-xs text-gray-400 text-gray-300 sm:px-4 sm:py-3.5 sm:text-sm truncate hidden 2xl:table-cell">{item.batchLot || '—'}</td>
           <td className="px-2 py-2 text-center text-xs text-white font-medium sm:px-4 sm:py-3.5 sm:text-sm">{item.availableQty}</td>
           <td className="px-2 py-2 text-center text-xs text-blue-400 sm:px-4 sm:py-3.5 sm:text-sm hidden lg:table-cell">{item.reservedQty}</td>
           <td className="px-2 py-2 text-center text-xs text-red-400 sm:px-4 sm:py-3.5 sm:text-sm">{item.damagedQty}</td>
           <td className="px-2 py-2 text-center text-xs text-gray-400 text-gray-300 sm:px-4 sm:py-3.5 sm:text-sm hidden 2xl:table-cell">{item.reorderLevel}</td>
           <td className="px-2 py-2 sm:px-4 sm:py-3.5"><StatusBadge status={status} /></td>
           <td className="px-2 py-2 text-xs text-gray-400 sm:px-4 sm:py-3.5 sm:text-sm hidden xl:table-cell">{item.lastUpdated}</td>
           <td className="px-2 py-2 sm:px-4 sm:py-3.5">
            <div className="flex items-center justify-center gap-0.5 sm:gap-1">
             <button
              onClick={() => handleViewDetails(item)}
              className="p-1 sm:p-1.5 rounded-lg hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-all"
              title="View Details"
             >
              <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
             </button>
             <button
              onClick={() => handleReserveStock(item)}
              className="p-1 sm:p-1.5 rounded-lg hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-all"
              title="Reserve Stock"
             >
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
             </button>
             <button
              onClick={() => handleAdjustStock(item)}
              className="p-1 sm:p-1.5 rounded-lg hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-all"
              title="Stock Adjustment"
             >
              <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
             </button>
             <button
              onClick={() => handleMovementHistory(item)}
              className="p-1 sm:p-1.5 rounded-lg hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-all hidden sm:flex"
              title="Movement History"
             >
              <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
             </button>
             <button
              onClick={() => handlePrintBarcode(item)}
              className="p-1 sm:p-1.5 rounded-lg hover:bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-all hidden sm:flex"
              title="Print Barcode"
             >
              <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
             </button>
            </div>
           </td>
          </tr>
         );
        })}
        {paginatedItems.length === 0 && (
         <tr>
          <td colSpan={15} className="px-4 py-8 text-center text-gray-400">
           No items found matching your criteria.
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
     <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-4 sm:p-5">
      <InventoryGrid
       items={paginatedItems}
       onViewDetails={handleViewDetails}
       onReserveStock={handleReserveStock}
       onAdjustStock={handleAdjustStock}
       onMovementHistory={handleMovementHistory}
       onPrintBarcode={handlePrintBarcode}
      />
      {paginatedItems.length === 0 && (
       <div className="text-center text-gray-400 py-8">
        No items found matching your criteria.
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

   {/* Modals */}
   <StockAdjustmentModal
    isOpen={showAdjustModal}
    onClose={() => setShowAdjustModal(false)}
    product={selectedProduct}
    onAdjust={handleAdjustSubmit}
   />
   <ReserveStockModal
    isOpen={showReserveModal}
    onClose={() => setShowReserveModal(false)}
    product={selectedProduct}
    onReserve={handleReserveSubmit}
   />
   <DamagedStockModal
    isOpen={showDamagedModal}
    onClose={() => setShowDamagedModal(false)}
    records={mockDamagedRecords}
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
 <div className="text-gray-400 text-center py-12">Manage Locations - Coming Soon</div>
);
export const StockCounting: React.FC = () => (
 <div className="text-gray-400 text-center py-12">Stock Counting - Coming Soon</div>
);

// ============================================
// MAIN WAREHOUSE MODULE (with Tabs & outer container)
// ============================================

const WarehouseModule: React.FC = () => {
 const [activeTab, setActiveTab] = useState<'inventory' | 'locations' | 'counting'>('inventory');

 return (
  <div className="flex-1 flex flex-col overflow-hidden bg-transparent">
   <main className="flex-1 overflow-y-auto py-4 sm:py-6">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
     {/* Breadcrumb */}
     <div className="flex items-center gap-2 text-gray-400 text-sm">
      <span>Dashboard</span>
      <ChevronBreadcrumb className="w-4 h-4" />
      <span className="text-white font-medium">Warehouse</span>
     </div>

     {/* Navigation Tabs */}
     <div className="border-b border-gray-800 border-gray-800">
      <div className="flex gap-6">
       <button
        onClick={() => setActiveTab('inventory')}
        className={`pb-3 text-sm font-medium transition-all relative flex items-center gap-2 ${
         activeTab === 'inventory'
          ? 'text-white border-b-2 border-cyan-500'
          : 'text-gray-400 hover:text-white'
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
          : 'text-gray-400 hover:text-white'
        }`}
       >
        <MapPin className="w-4 h-4" />
        Manage Locations
       </button>
       <button
        onClick={() => setActiveTab('counting')}
        className={`pb-3 text-sm font-medium transition-all relative flex items-center gap-2 ${
         activeTab === 'counting'
          ? 'text-white border-b-2 border-cyan-500'
          : 'text-gray-400 hover:text-white'
        }`}
       >
        <ClipboardList className="w-4 h-4" />
        Stock Counting
       </button>
      </div>
     </div>

     {/* Page Content */}
     {activeTab === 'inventory' && <InventoryList />}
     {activeTab === 'locations' && <ManageLocations />}
     {activeTab === 'counting' && <StockCounting />}
    </div>
   </main>
  </div>
 );
};

export default WarehouseModule;