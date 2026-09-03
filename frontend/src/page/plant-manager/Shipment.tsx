// src/page/plant-manager/Shipments.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import {
  Search,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
  X,
  Eye,
  Clipboard,
  ChevronLeft,
  Check,
  Plus,
  Truck,
  AlertTriangle,
  Loader2,
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
  destination: string;
  warehouse: string;
  preparedBy: string;
  preparedDate: string;
  assignedDate: string;
  targetDelivery: string;
  status: ShipmentStatus;
  items: ShipmentItem[];
  totalItems: number;
  totalQuantity: number;
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
// ORDER -> SHIPMENT MAPPING (existing orders / order_items)
// ============================================

const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(value)) : '—';

const mapOrderToShipment = (order: any): Shipment => {
  const items: ShipmentItem[] = (order.items || []).map((item: any) => ({
    id: String(item.id),
    name: item.product_name,
    sku: '',
    requestedQty: Number(item.required_quantity) || 0,
    availableQty: Number(item.required_quantity) || 0,
    barcode: '',
    verified: true,
  }));

  return {
    id: String(order.id),
    shipmentNo: order.order_no,
    orderNo: order.order_no,
    customer: order.customer_name,
    destination: order.customer_address || '—',
    warehouse: order.warehouse?.name || 'Unassigned',
    preparedBy: order.prepared_by || '—',
    preparedDate: formatDate(order.assigned_at),
    assignedDate: formatDate(order.assigned_at),
    targetDelivery: formatDate(order.required_delivery_date),
    status: 'Ready for Shipment',
    items,
    totalItems: Number(order.items_count ?? items.length),
    totalQuantity: items.reduce((sum, item) => sum + item.requestedQty, 0),
    packing: { packageId: '', boxes: 0, weight: 0, fragile: false, notes: '' },
    checklist: {
      correctProduct: false,
      correctQty: false,
      barcodeVerified: false,
      packageCondition: false,
      itemsComplete: false,
    },
    barcodeVerifiedAll: false,
    timeline: [],
  };
};

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
    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-white dark:bg-[#0b0f19]/30">
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
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 rounded-lg text-sm font-medium transition-all"
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
                      ? 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950'
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
// CREATE SHIPMENT MODAL COMPONENT
// ============================================

interface CreateShipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    orderNo: string;
    customer: string;
    warehouse: string;
    preparedBy: string;
    productSummary: string;
    shipmentNo: string;
  }) => void;
  nextShipmentNo: string;
}

const CreateShipmentModal: React.FC<CreateShipmentModalProps> = ({ isOpen, onClose, onSave, nextShipmentNo }) => {
  const [orderNo, setOrderNo] = useState('');
  const [customer, setCustomer] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [productSummary, setProductSummary] = useState('');
  const [preparedBy, setPreparedBy] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!orderNo.trim() || !customer.trim() || !warehouse.trim() || !preparedBy.trim()) {
      alert('Please fill in Order No, Customer, Warehouse, and Prepared By.');
      return;
    }
    onSave({ orderNo, customer, warehouse, preparedBy, productSummary, shipmentNo: nextShipmentNo });
    setOrderNo('');
    setCustomer('');
    setWarehouse('');
    setProductSummary('');
    setPreparedBy('');
  };

  const handleCancel = () => {
    setOrderNo('');
    setCustomer('');
    setWarehouse('');
    setProductSummary('');
    setPreparedBy('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0d1322] border border-slate-800 rounded-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">Create Shipment</h2>
            <p className="text-sm text-slate-400">Fill in the details to create a new shipment.</p>
          </div>
          <button onClick={handleCancel} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Shipment No.</label>
            <input
              type="text"
              value={nextShipmentNo}
              disabled
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-400 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Order No.</label>
            <input
              type="text"
              value={orderNo}
              onChange={(e) => setOrderNo(e.target.value)}
              className="w-full bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              placeholder="e.g., PO-2860"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Customer Name</label>
            <input
              type="text"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="w-full bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              placeholder="e.g., Northwind Traders"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Warehouse</label>
            <input
              type="text"
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
              className="w-full bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              placeholder="e.g., Central Depot"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Product Summary</label>
            <input
              type="text"
              value={productSummary}
              onChange={(e) => setProductSummary(e.target.value)}
              className="w-full bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              placeholder="e.g., Industrial LED Panel 40W x 12"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Prepared By</label>
            <input
              type="text"
              value={preparedBy}
              onChange={(e) => setPreparedBy(e.target.value)}
              className="w-full bg-[#0b0f19] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              placeholder="e.g., M. Santos"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-slate-800">
          <button
            onClick={handleCancel}
            className="px-5 py-2.5 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 rounded-xl text-sm font-medium transition-all"
          >
            Create Shipment
          </button>
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
  const [isViewDrawerOpen, setIsViewDrawerOpen] = useState(false);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmForwardFor, setConfirmForwardFor] = useState<Shipment | null>(null);
  const [isForwarding, setIsForwarding] = useState(false);

  // Strictly the orders sitting in the Shipment stage (status READY_FOR_SHIPMENT).
  // Forwarded orders move to FORWARDED_TO_LOGISTICS and drop out of this endpoint.
  useEffect(() => {
    let cancelled = false;

    const loadReadyOrders = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await apiClient.get('/plant-manager/shipments', {
          params: { per_page: 100 },
        });
        const records = response.data?.data ?? [];
        if (!cancelled) setShipments(records.map(mapOrderToShipment));
      } catch (error: any) {
        if (!cancelled) {
          setLoadError(error?.response?.data?.message ?? 'Unable to load orders ready for shipment.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadReadyOrders();
    return () => {
      cancelled = true;
    };
  }, []);

  // Filtered shipments
  const filteredShipments = useMemo(() => {
    return shipments.filter((s) => {
      const matchSearch =
        s.shipmentNo.toLowerCase().includes(search.toLowerCase()) ||
        s.orderNo.toLowerCase().includes(search.toLowerCase()) ||
        s.customer.toLowerCase().includes(search.toLowerCase()) ||
        s.warehouse.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [shipments, search, statusFilter]);

  const totalPages = Math.ceil(filteredShipments.length / itemsPerPage);
  const paginatedShipments = filteredShipments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // KPI counts
  const readyForPicking = shipments.filter((s) => s.status === 'Preparing').length;
  const beingPacked = shipments.filter((s) => s.status === 'Packing').length;
  const readyForShipment = shipments.filter((s) => s.status === 'Ready for Shipment').length;
  const pickedToday = shipments.filter((s) => s.status === 'Picked Up' && s.timeline.some(t => t.step === 'Picked Up' && t.timestamp?.startsWith('2026-08-02'))).length;
  const packedToday = shipments.filter((s) => s.status === 'Ready for Shipment' && s.timeline.some(t => t.step === 'Ready for Shipment' && t.timestamp?.startsWith('2026-08-02'))).length;
  const pendingPickup = shipments.filter((s) => s.status === 'Ready for Shipment').length;

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

  // Forwarding moves the order to FORWARDED_TO_LOGISTICS, so it leaves this stage.
  const dropForwardedShipment = (id: string) => {
    setShipments((prev) => prev.filter((item) => item.id !== id));
    setSelectedShipment((prev) => (prev?.id === id ? null : prev));
    setIsViewDrawerOpen(false);
  };

  const handleForwardToLogistics = (shipment: Shipment) => {
    setConfirmForwardFor(shipment);
  };

  const handleConfirmForward = async () => {
    const shipment = confirmForwardFor;
    if (!shipment) return;

    setConfirmForwardFor(null);
    setIsForwarding(true);
    try {
      await apiClient.post(`/plant-manager/shipments/${shipment.id}/forward-to-logistics`);
      dropForwardedShipment(shipment.id);
      showToast(`${shipment.orderNo} forwarded to Admin Logistics (DTRS).`, 'success');
    } catch (error: any) {
      // This stage serves only READY_FOR_SHIPMENT orders, so a 404 means the order was
      // already forwarded elsewhere rather than a failure.
      if (error?.response?.status === 404) {
        dropForwardedShipment(shipment.id);
        showToast(`${shipment.orderNo} was already forwarded to Admin Logistics (DTRS).`, 'info');
      } else {
        showToast(
          error?.response?.data?.message ?? `Unable to forward ${shipment.orderNo} to Admin Logistics.`,
          'error',
        );
      }
    } finally {
      setIsForwarding(false);
    }
  };

  const handleCreateShipment = (data: {
    orderNo: string;
    customer: string;
    warehouse: string;
    preparedBy: string;
    productSummary: string;
    shipmentNo: string;
  }) => {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newShipment: Shipment = {
      id: Date.now().toString(),
      shipmentNo: data.shipmentNo,
      orderNo: data.orderNo,
      customer: data.customer,
      destination: '—',
      warehouse: data.warehouse,
      preparedBy: data.preparedBy,
      preparedDate: today,
      assignedDate: today,
      targetDelivery: '—',
      status: 'Preparing',
      items: data.productSummary
        ? [
            {
              id: `i-${Date.now()}`,
              name: data.productSummary,
              sku: '',
              requestedQty: 0,
              availableQty: 0,
              barcode: '',
              verified: false,
            },
          ]
        : [],
      totalItems: 0,
      totalQuantity: 0,
      totalWeight: 0,
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
        { step: 'Shipment Created', completed: true, timestamp },
        { step: 'Preparing', completed: false },
      ],
    };
    setShipments(prev => [newShipment, ...prev]);
    showToast('Shipment created successfully.', 'success');
  };

  const nextShipmentNo = `SHP-${shipments.reduce((max, s) => {
    const num = parseInt(s.shipmentNo.replace('SHP-', ''), 10);
    return num > max ? num : max;
  }, 3305) + 1}`;

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
        <button onClick={() => setIsCreateModalOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors">
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
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Order No.</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Customer / Destination</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Products</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Items</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Assigned Date</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Target Delivery</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedShipments.map((shipment) => (
                <tr key={shipment.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-all">
                  <td className="px-4 py-3.5 text-sm font-medium text-white">{shipment.orderNo}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">
                    <p className="text-white">{shipment.customer}</p>
                    <p className="text-xs text-slate-500">{shipment.destination}</p>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">
                    {shipment.items.length === 0 && '—'}
                    {shipment.items.slice(0, 2).map((item) => (
                      <p key={item.id}>{item.name}</p>
                    ))}
                    {shipment.items.length > 2 && (
                      <p className="text-xs text-slate-500">+{shipment.items.length - 2} more</p>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">
                    <p className="text-white">{shipment.totalItems} item{shipment.totalItems === 1 ? '' : 's'}</p>
                    <p className="text-xs text-slate-500">{shipment.totalQuantity} units</p>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">{shipment.assignedDate}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-300">{shipment.targetDelivery}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={shipment.status} /></td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => {
                          setSelectedShipment(shipment);
                          setIsViewDrawerOpen(true);
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
                    {isLoading
                      ? 'Loading orders ready for shipment...'
                      : loadError ?? 'No shipments found matching your criteria.'}
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

      {/* Create Shipment Modal */}
      <CreateShipmentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSave={handleCreateShipment}
        nextShipmentNo={nextShipmentNo}
      />

      {/* Prepare Modal */}
      {selectedShipment && (
        <PrepareModal
          shipment={selectedShipment}
          isOpen={showPrepareModal}
          onClose={() => setShowPrepareModal(false)}
          onMarkReady={handleMarkReady}
        />
      )}

      {/* View Shipment Drawer */}
      {isViewDrawerOpen && selectedShipment && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsViewDrawerOpen(false)}
          />
          {/* Drawer Panel */}
          <div className="relative w-full max-w-md bg-[#0d1322] border-l border-slate-800 shadow-2xl h-full overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-[#0d1322] border-b border-slate-800 p-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white">{selectedShipment.shipmentNo}</h2>
                <p className="text-xs text-slate-400">Order No. {selectedShipment.orderNo}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedShipment.status} />
                <button
                  onClick={() => setIsViewDrawerOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-5">
              {/* Customer & Warehouse Details Card */}
              <div className="bg-[#0b0f19] border border-slate-800 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Customer Name</p>
                  <p className="text-sm text-white font-medium mt-0.5">{selectedShipment.customer}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Order No.</p>
                  <p className="text-sm text-white font-medium mt-0.5">{selectedShipment.orderNo}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Warehouse</p>
                  <p className="text-sm text-white font-medium mt-0.5">{selectedShipment.warehouse}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Prepared By</p>
                  <p className="text-sm text-white font-medium mt-0.5">{selectedShipment.preparedBy}</p>
                </div>
              </div>

              {/* Stock Allocation Checklist */}
              <div>
                <h3 className="text-sm font-medium text-slate-300 mb-3">Stock Allocation</h3>
                <div className="space-y-3">
                  {selectedShipment.items.map((item) => {
                    const progress = item.requestedQty > 0
                      ? Math.min((item.availableQty / item.requestedQty) * 100, 100)
                      : 0;
                    const isAllocated = item.availableQty >= item.requestedQty;
                    return (
                      <div key={item.id} className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm text-white font-medium">{item.name}</p>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              isAllocated
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}
                          >
                            {isAllocated ? 'Allocated' : 'Insufficient'}
                          </span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2 mb-1 mt-2">
                          <div
                            className="bg-cyan-500 h-2 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>Requested: {item.requestedQty}</span>
                          <span>Available: {item.availableQty}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Plant Manager Actions */}
              <div className="space-y-2 pt-4 border-t border-slate-800">
                <button
                  onClick={() => handleForwardToLogistics(selectedShipment)}
                  disabled={isForwarding}
                  className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    isForwarding
                      ? 'bg-slate-900/50 text-white/70 dark:bg-cyan-500/50 dark:text-slate-950/70 cursor-not-allowed'
                      : 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950'
                  }`}
                >
                  {isForwarding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                  {isForwarding ? 'Forwarding...' : 'Forward to Logistics'}
                </button>
                <button className="w-full px-4 py-2.5 border border-red-700/50 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all text-sm flex items-center justify-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Flag Stock Issue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Forward to Logistics Confirmation */}
      {confirmForwardFor && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setConfirmForwardFor(null)}
        >
          <div
            className="bg-[#0d1322] border border-slate-800 rounded-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                <Truck className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="text-lg font-bold text-white">Forward to Logistics</h2>
            </div>

            <p className="text-sm text-slate-400 mt-4">
              Are you sure you want to forward Order {confirmForwardFor.orderNo} to Admin Logistics?
              This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-5 mt-5 border-t border-slate-800">
              <button
                onClick={() => setConfirmForwardFor(null)}
                className="px-5 py-2.5 border border-slate-700 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmForward}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-slate-950 rounded-xl text-sm font-medium transition-all"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
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
