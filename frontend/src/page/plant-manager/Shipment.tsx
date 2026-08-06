// src/page/plant-manager/Shipments.tsx
import React, { useState, useMemo } from 'react';
import {
  Search,
  ChevronRight,
  Package,
  CheckCircle,
  Clock,
  AlertCircle,
  X,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  User,
  Box,
  Clipboard,
  Check,
  Scan,
  Truck,
  Calendar,
  ArrowRight,
  Plus,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

type ShipmentStatus =
  | 'Preparing'
  | 'Packing'
  | 'Ready for Shipment'
  | 'Picked Up'
  | 'Delivered';

interface ShipmentItem {
  id: string;
  name: string;
  sku: string;
  requestedQty: number;
  availableQty: number;
  barcode: string;
  verified: boolean;
}

interface Shipment {
  id: string;
  shipmentNo: string;
  orderNo: string;
  customer: string;
  warehouse: string;
  preparedBy: string;
  preparedDate: string;
  status: ShipmentStatus;
  items: ShipmentItem[];
  totalItems: number;
  totalWeight?: number;
  weightUnit?: string;
  packing: {
    packageId: string;
    boxes: number;
    weight: number;
    fragile: boolean;
    notes: string;
  };
  checklist: {
    correctProduct: boolean;
    correctQty: boolean;
    barcodeVerified: boolean;
    packageCondition: boolean;
    itemsComplete: boolean;
  };
  barcodeVerifiedAll: boolean;
  timeline: {
    step: string;
    completed: boolean;
    timestamp?: string;
  }[];
}

// ============================================
// MOCK DATA
// ============================================

const mockShipments: Shipment[] = [
  {
    id: '1',
    shipmentNo: 'SHP-3301',
    orderNo: 'PO-2857',
    customer: 'Northwind Traders',
    warehouse: 'Central Depot',
    preparedBy: 'M. Santos',
    preparedDate: '2026-08-01',
    status: 'Preparing',
    items: [
      {
        id: 'i1',
        name: 'Industrial LED Panel 40W',
        sku: 'ELC-LED-040',
        requestedQty: 12,
        availableQty: 15,
        barcode: '8801234500011',
        verified: false,
      },
      {
        id: 'i2',
        name: 'Aluminium Profile 6m',
        sku: 'RAW-ALU-006',
        requestedQty: 8,
        availableQty: 10,
        barcode: '8801234500097',
        verified: false,
      },
    ],
    totalItems: 20,
    totalWeight: 450,
    weightUnit: 'kg',
    packing: {
      packageId: '',
      boxes: 0,
      weight: 0,
      fragile: false,
      notes: '',
    },
    checklist: {
      correctProduct: false,
      correctQty: false,
      barcodeVerified: false,
      packageCondition: false,
      itemsComplete: false,
    },
    barcodeVerifiedAll: false,
    timeline: [
      { step: 'Shipment Created', completed: true, timestamp: '2026-08-01 10:30' },
      { step: 'Preparing', completed: false },
    ],
  },
  {
    id: '2',
    shipmentNo: 'SHP-3302',
    orderNo: 'PO-2851',
    customer: 'Cebu Logistics Co.',
    warehouse: 'Northgate',
    preparedBy: 'L. Cruz',
    preparedDate: '2026-07-30',
    status: 'Packing',
    items: [
      {
        id: 'i3',
        name: 'Corrugated Box 60x40x40',
        sku: 'PKG-BOX-604',
        requestedQty: 8,
        availableQty: 12,
        barcode: '8801234500028',
        verified: true,
      },
    ],
    totalItems: 8,
    totalWeight: 620,
    weightUnit: 'kg',
    packing: {
      packageId: 'PKG-001',
      boxes: 2,
      weight: 620,
      fragile: false,
      notes: 'Stack carefully',
    },
    checklist: {
      correctProduct: true,
      correctQty: true,
      barcodeVerified: true,
      packageCondition: true,
      itemsComplete: true,
    },
    barcodeVerifiedAll: true,
    timeline: [
      { step: 'Shipment Created', completed: true, timestamp: '2026-07-30 09:00' },
      { step: 'Preparing', completed: true, timestamp: '2026-07-30 10:15' },
      { step: 'Packing', completed: false },
    ],
  },
  {
    id: '3',
    shipmentNo: 'SHP-3303',
    orderNo: 'PO-2855',
    customer: 'Kraft Industrial',
    warehouse: 'Southpark',
    preparedBy: 'R. Diaz',
    preparedDate: '2026-07-28',
    status: 'Ready for Shipment',
    items: [
      {
        id: 'i4',
        name: 'Steel Sheet 2mm',
        sku: 'RAW-SST-002',
        requestedQty: 20,
        availableQty: 25,
        barcode: '8801234500035',
        verified: true,
      },
    ],
    totalItems: 20,
    totalWeight: 1200,
    weightUnit: 'kg',
    packing: {
      packageId: 'PKG-002',
      boxes: 4,
      weight: 1200,
      fragile: true,
      notes: 'Heavy, use forklift',
    },
    checklist: {
      correctProduct: true,
      correctQty: true,
      barcodeVerified: true,
      packageCondition: true,
      itemsComplete: true,
    },
    barcodeVerifiedAll: true,
    timeline: [
      { step: 'Shipment Created', completed: true, timestamp: '2026-07-28 11:00' },
      { step: 'Preparing', completed: true, timestamp: '2026-07-28 12:30' },
      { step: 'Packing', completed: true, timestamp: '2026-07-28 15:00' },
      { step: 'Ready for Shipment', completed: true, timestamp: '2026-07-28 16:45' },
    ],
  },
  {
    id: '4',
    shipmentNo: 'SHP-3304',
    orderNo: 'PO-2843',
    customer: 'Apex Components',
    warehouse: 'Eastside',
    preparedBy: 'J. Santos',
    preparedDate: '2026-08-02',
    status: 'Delivered',
    items: [
      {
        id: 'i5',
        name: 'Wireless Earbuds Pro',
        sku: 'SKU-1001',
        requestedQty: 3,
        availableQty: 5,
        barcode: '8801234500042',
        verified: true,
      },
    ],
    totalItems: 3,
    totalWeight: 120,
    weightUnit: 'kg',
    packing: {
      packageId: 'PKG-003',
      boxes: 1,
      weight: 120,
      fragile: true,
      notes: 'Handle with care',
    },
    checklist: {
      correctProduct: true,
      correctQty: true,
      barcodeVerified: true,
      packageCondition: true,
      itemsComplete: true,
    },
    barcodeVerifiedAll: true,
    timeline: [
      { step: 'Shipment Created', completed: true, timestamp: '2026-08-02 08:00' },
      { step: 'Preparing', completed: true, timestamp: '2026-08-02 08:30' },
      { step: 'Packing', completed: true, timestamp: '2026-08-02 09:00' },
      { step: 'Ready for Shipment', completed: true, timestamp: '2026-08-02 09:30' },
      { step: 'Picked Up', completed: true, timestamp: '2026-08-02 10:00' },
      { step: 'Delivered', completed: true, timestamp: '2026-08-02 14:00' },
    ],
  },
  {
    id: '5',
    shipmentNo: 'SHP-3305',
    orderNo: 'PO-2859',
    customer: 'Meridian Supply',
    warehouse: 'Central Depot',
    preparedBy: 'L. Reyes',
    preparedDate: '2026-07-31',
    status: 'Picked Up',
    items: [
      {
        id: 'i6',
        name: 'Safety Helmet Class E',
        sku: 'SAF-HLM-001',
        requestedQty: 5,
        availableQty: 10,
        barcode: '8801234500059',
        verified: true,
      },
    ],
    totalItems: 5,
    totalWeight: 240,
    weightUnit: 'kg',
    packing: {
      packageId: 'PKG-004',
      boxes: 1,
      weight: 240,
      fragile: false,
      notes: '',
    },
    checklist: {
      correctProduct: true,
      correctQty: true,
      barcodeVerified: true,
      packageCondition: true,
      itemsComplete: true,
    },
    barcodeVerifiedAll: true,
    timeline: [
      { step: 'Shipment Created', completed: true, timestamp: '2026-07-31 14:00' },
      { step: 'Preparing', completed: true, timestamp: '2026-07-31 14:30' },
      { step: 'Packing', completed: true, timestamp: '2026-07-31 15:30' },
      { step: 'Ready for Shipment', completed: true, timestamp: '2026-07-31 16:00' },
      { step: 'Picked Up', completed: true, timestamp: '2026-08-01 08:00' },
    ],
  },
];

// ============================================
// CONSTANTS
// ============================================

const statusOptions = [
  'All',
  'Preparing',
  'Packing',
  'Ready for Shipment',
  'Picked Up',
  'Delivered',
];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: ShipmentStatus }> = ({ status }) => {
  const config: Record<
    ShipmentStatus,
    { color: string; bg: string; dotColor: string }
  > = {
    Preparing: {
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
      dotColor: 'bg-amber-400',
    },
    Packing: {
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      dotColor: 'bg-blue-400',
    },
    'Ready for Shipment': {
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10 border-cyan-500/20',
      dotColor: 'bg-cyan-400',
    },
    'Picked Up': {
      color: 'text-purple-400',
      bg: 'bg-purple-500/10 border-purple-500/20',
      dotColor: 'bg-purple-400',
    },
    Delivered: {
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      dotColor: 'bg-emerald-400',
    },
  };
  const { color, bg, dotColor } = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color} ${bg}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {status}
    </span>
  );
};

const KPICard: React.FC<{
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
}> = ({ label, value, subtitle, icon }) => (
  <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 hover:border-slate-600 transition-all duration-200 h-full flex flex-col">
    <div className="flex items-start justify-between flex-1">
      <div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-white mt-1.5">{value}</p>
        {subtitle && <p className="text-slate-500 text-xs mt-1">{subtitle}</p>}
      </div>
      <div className="p-2.5 bg-slate-800/60 rounded-lg shrink-0">{icon}</div>
    </div>
  </div>
);

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

const FilterSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: string[];
}> = ({ value, onChange, options }) => (
  <div className="min-w-[130px]">
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
        <span className="text-white font-medium">{totalItems}</span> shipments
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
// PREPARE/PACK MODAL COMPONENT
// ============================================

interface PrepareModalProps {
  shipment: Shipment | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkReady: (shipmentId: string, packingData: Partial<Shipment['packing']>, checklist: Shipment['checklist']) => void;
}

const PrepareModal: React.FC<PrepareModalProps> = ({ shipment, isOpen, onClose, onMarkReady }) => {
  const [packing, setPacking] = useState({
    packageId: '',
    boxes: 0,
    weight: 0,
    fragile: false,
    notes: '',
  });
  const [checklist, setChecklist] = useState({
    correctProduct: false,
    correctQty: false,
    barcodeVerified: false,
    packageCondition: false,
    itemsComplete: false,
  });
  const [barcodeInputs, setBarcodeInputs] = useState<Record<string, string>>({});
  const [verificationStatus, setVerificationStatus] = useState<Record<string, 'idle' | 'success' | 'failed'>>({});

  if (!shipment) return null;

  // Initialize state when shipment changes
  React.useEffect(() => {
    if (shipment) {
      setPacking({
        packageId: shipment.packing?.packageId || '',
        boxes: shipment.packing?.boxes || 0,
        weight: shipment.packing?.weight || 0,
        fragile: shipment.packing?.fragile || false,
        notes: shipment.packing?.notes || '',
      });
      setChecklist({
        correctProduct: shipment.checklist?.correctProduct || false,
        correctQty: shipment.checklist?.correctQty || false,
        barcodeVerified: shipment.checklist?.barcodeVerified || false,
        packageCondition: shipment.checklist?.packageCondition || false,
        itemsComplete: shipment.checklist?.itemsComplete || false,
      });
      const initialInputs: Record<string, string> = {};
      shipment.items.forEach(item => {
        initialInputs[item.id] = '';
      });
      setBarcodeInputs(initialInputs);
      const initialStatus: Record<string, 'idle' | 'success' | 'failed'> = {};
      shipment.items.forEach(item => {
        initialStatus[item.id] = item.verified ? 'success' : 'idle';
      });
      setVerificationStatus(initialStatus);
    }
  }, [shipment]);

  const handleBarcodeChange = (itemId: string, value: string) => {
    setBarcodeInputs(prev => ({ ...prev, [itemId]: value }));
  };

  const verifyBarcode = (itemId: string) => {
    const item = shipment.items.find(i => i.id === itemId);
    if (!item) return;
    const input = barcodeInputs[itemId] || '';
    const match = input === item.barcode;
    setVerificationStatus(prev => ({ ...prev, [itemId]: match ? 'success' : 'failed' }));
    // If successful, update the item's verified status in the shipment (we'll pass it up on submit)
  };

  const allItemsVerified = shipment.items.every(item => verificationStatus[item.id] === 'success');
  const checklistComplete = Object.values(checklist).every(v => v === true);

  const handleSubmit = () => {
    if (!allItemsVerified || !checklistComplete) {
      alert('Please ensure all items are verified and checklist is complete.');
      return;
    }
    // Mark the shipment as ready
    onMarkReady(shipment.id, packing, checklist);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0d1322] border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">Prepare Shipment</h2>
            <p className="text-sm text-slate-400">{shipment.shipmentNo} · {shipment.customer}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Order Details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-400">Order No.</p>
              <p className="text-white">{shipment.orderNo}</p>
            </div>
            <div>
              <p className="text-slate-400">Warehouse</p>
              <p className="text-white">{shipment.warehouse}</p>
            </div>
            <div>
              <p className="text-slate-400">Prepared By</p>
              <p className="text-white">{shipment.preparedBy}</p>
            </div>
            <div>
              <p className="text-slate-400">Prepared Date</p>
              <p className="text-white">{shipment.preparedDate}</p>
            </div>
          </div>

          {/* Items with Barcode Verification */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">Items & Barcode Verification</h3>
            <div className="space-y-3">
              {shipment.items.map((item) => (
                <div key={item.id} className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-white text-sm font-medium">{item.name}</p>
                      <p className="text-slate-400 text-xs">SKU: {item.sku}</p>
                      <p className="text-slate-400 text-xs">Requested: {item.requestedQty} | Available: {item.availableQty}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {verificationStatus[item.id] === 'success' && (
                        <span className="text-emerald-400 text-xs flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Verified</span>
                      )}
                      {verificationStatus[item.id] === 'failed' && (
                        <span className="text-red-400 text-xs flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Failed</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      placeholder="Scan barcode"
                      value={barcodeInputs[item.id] || ''}
                      onChange={(e) => handleBarcodeChange(item.id, e.target.value)}
                      className="flex-1 bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                    <button
                      onClick={() => verifyBarcode(item.id)}
                      className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-sm font-medium transition-all"
                    >
                      Verify
                    </button>
                    <span className="text-xs text-slate-500">Expected: {item.barcode}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Picking Checklist */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">Picking Checklist</h3>
            <div className="space-y-2">
              {Object.entries(checklist).map(([key, value]) => {
                const labelMap: Record<string, string> = {
                  correctProduct: 'Correct Product',
                  correctQty: 'Correct Quantity',
                  barcodeVerified: 'Barcode Verified',
                  packageCondition: 'Package Condition',
                  itemsComplete: 'Items Complete',
                };
                return (
                  <label key={key} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={() => setChecklist(prev => ({ ...prev, [key]: !prev[key as keyof typeof checklist] }))}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                    />
                    {labelMap[key] || key}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Packing Information */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">Packing Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Package ID</label>
                <input
                  type="text"
                  value={packing.packageId}
                  onChange={(e) => setPacking({ ...packing, packageId: e.target.value })}
                  className="w-full bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  placeholder="e.g., PKG-001"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Number of Boxes</label>
                <input
                  type="number"
                  value={packing.boxes}
                  onChange={(e) => setPacking({ ...packing, boxes: parseInt(e.target.value) || 0 })}
                  className="w-full bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Estimated Weight (kg)</label>
                <input
                  type="number"
                  value={packing.weight}
                  onChange={(e) => setPacking({ ...packing, weight: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  step="0.1"
                  min="0"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={packing.fragile}
                    onChange={(e) => setPacking({ ...packing, fragile: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                  />
                  Fragile
                </label>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Packing Notes</label>
                <textarea
                  value={packing.notes}
                  onChange={(e) => setPacking({ ...packing, notes: e.target.value })}
                  rows={2}
                  className="w-full bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  placeholder="Any special instructions..."
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              onClick={onClose}
              className="px-5 py-2.5 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!allItemsVerified || !checklistComplete}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                allItemsVerified && checklistComplete
                  ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Check className="w-4 h-4" /> Mark Ready for Shipment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const Shipments: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [showPrepareModal, setShowPrepareModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Filtered shipments
  const filteredShipments = useMemo(() => {
    return mockShipments.filter((s) => {
      const matchSearch =
        s.shipmentNo.toLowerCase().includes(search.toLowerCase()) ||
        s.orderNo.toLowerCase().includes(search.toLowerCase()) ||
        s.customer.toLowerCase().includes(search.toLowerCase()) ||
        s.warehouse.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter]);

  const totalPages = Math.ceil(filteredShipments.length / itemsPerPage);
  const paginatedShipments = filteredShipments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // KPI counts
  const readyForPicking = mockShipments.filter((s) => s.status === 'Preparing').length;
  const beingPacked = mockShipments.filter((s) => s.status === 'Packing').length;
  const readyForShipment = mockShipments.filter((s) => s.status === 'Ready for Shipment').length;
  const pickedToday = mockShipments.filter((s) => s.status === 'Picked Up' && s.timeline.some(t => t.step === 'Picked Up' && t.timestamp?.startsWith('2026-08-02'))).length;
  const packedToday = mockShipments.filter((s) => s.status === 'Ready for Shipment' && s.timeline.some(t => t.step === 'Ready for Shipment' && t.timestamp?.startsWith('2026-08-02'))).length;
  const pendingPickup = mockShipments.filter((s) => s.status === 'Ready for Shipment').length;

  // Handlers
  const handlePrepare = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    setShowPrepareModal(true);
  };

  const handleMarkReady = (shipmentId: string, packingData: Partial<Shipment['packing']>, checklist: Shipment['checklist']) => {
    // In a real app, we would update the shipment status and data.
    // For mock, we show a toast.
    setToast({
      message: `Shipment ${shipmentId} marked as Ready for Shipment.`,
      type: 'success',
    });
    setTimeout(() => setToast(null), 5000);
  };

  const showToast = (message: string, type: 'success' | 'info' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span>Plant Manager</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-100">Shipments</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Shipments</h1>
          <p className="text-sm text-slate-400">Prepare and pack orders for shipment to customers.</p>
        </div>
        <button className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> Create Shipment
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[#0d1322] border border-slate-800/80 rounded-2xl p-4 text-center hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Ready for Picking</p>
          <p className="text-2xl font-bold text-white mt-1">{readyForPicking}</p>
        </div>
        <div className="bg-[#0d1322] border border-slate-800/80 rounded-2xl p-4 text-center hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Being Packed</p>
          <p className="text-2xl font-bold text-white mt-1">{beingPacked}</p>
        </div>
        <div className="bg-[#0d1322] border border-slate-800/80 rounded-2xl p-4 text-center hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Ready for Shipment</p>
          <p className="text-2xl font-bold text-white mt-1">{readyForShipment}</p>
        </div>
        <div className="bg-[#0d1322] border border-slate-800/80 rounded-2xl p-4 text-center hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Picked Today</p>
          <p className="text-2xl font-bold text-white mt-1">{pickedToday}</p>
        </div>
        <div className="bg-[#0d1322] border border-slate-800/80 rounded-2xl p-4 text-center hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Packed Today</p>
          <p className="text-2xl font-bold text-white mt-1">{packedToday}</p>
        </div>
        <div className="bg-[#0d1322] border border-slate-800/80 rounded-2xl p-4 text-center hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Pending Pickup</p>
          <p className="text-2xl font-bold text-white mt-1">{pendingPickup}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#0d1322]/60 border border-slate-800/80 rounded-2xl p-4 flex flex-wrap items-center gap-3">
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
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search Shipment #, PO #, Customer..."
          />
        </div>
      </div>

      {/* Shipment Table */}
      <div className="bg-[#0d1322] border border-slate-800/80 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-[#0b0f19]/50 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Shipment No.</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Order No.</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Customer</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Warehouse</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Products Summary</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Prepared By</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedShipments.map((shipment) => (
                <tr key={shipment.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-all">
                  <td className="px-4 py-3.5 text-sm font-medium text-white">{shipment.shipmentNo}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">{shipment.orderNo}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">{shipment.customer}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">{shipment.warehouse}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">
                    {shipment.items.length} item{shipment.items.length > 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">{shipment.preparedBy}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={shipment.status} /></td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => {
                          setSelectedShipment(shipment);
                          // Could open a view-only modal
                        }}
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {(shipment.status === 'Preparing' || shipment.status === 'Packing') && (
                        <button
                          onClick={() => handlePrepare(shipment)}
                          className="p-1.5 rounded-lg hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 transition-all"
                          title="Prepare / Pack"
                        >
                          <Clipboard className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedShipments.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No shipments found matching your criteria.
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
          totalItems={filteredShipments.length}
          itemsPerPage={itemsPerPage}
        />
      </div>

      {/* Right Insights Panel (optional) */}
      <div className="bg-[#0d1322] border border-slate-800/80 rounded-2xl p-5">
        <h3 className="text-lg font-semibold text-white mb-3">Shipment Insights</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-800/30 rounded-xl p-3">
            <p className="text-xs text-slate-400">Orders Ready Today</p>
            <p className="text-xl font-bold text-white">{readyForPicking}</p>
          </div>
          <div className="bg-slate-800/30 rounded-xl p-3">
            <p className="text-xs text-slate-400">Pending Packing</p>
            <p className="text-xl font-bold text-white">{beingPacked}</p>
          </div>
          <div className="bg-slate-800/30 rounded-xl p-3">
            <p className="text-xs text-slate-400">Ready for Shipment</p>
            <p className="text-xl font-bold text-white">{readyForShipment}</p>
          </div>
          <div className="bg-slate-800/30 rounded-xl p-3">
            <p className="text-xs text-slate-400">Avg Prep Time</p>
            <p className="text-xl font-bold text-white">45 mins</p>
          </div>
        </div>
      </div>

      {/* Prepare Modal */}
      {selectedShipment && (
        <PrepareModal
          shipment={selectedShipment}
          isOpen={showPrepareModal}
          onClose={() => setShowPrepareModal(false)}
          onMarkReady={handleMarkReady}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm text-white flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        }`}>
          {toast.type === 'success' && <CheckCircle className="w-5 h-5" />}
          {toast.type === 'error' && <AlertCircle className="w-5 h-5" />}
          {toast.type === 'info' && <Clock className="w-5 h-5" />}
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default Shipments;