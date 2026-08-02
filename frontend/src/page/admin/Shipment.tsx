// src/pages/admin/Shipments.tsx
import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  ChevronRight,
  Truck,
  Package,
  MapPin,
  Calendar,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  MoreVertical,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Download,
  Printer,
  RefreshCw,
  Eye,
  Edit,
  X,
  Save,
  Clock,
  ArrowRight,
  Box,
  Weight,
  Ship,
  Plane,
  Car,
  Globe,
  User,
  Phone,
  Mail,
  Building2,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface Shipment {
  id: string;
  trackingNumber: string;
  poReference: string;
  carrier: string;
  method: string;
  origin: string;
  destination: string;
  departureDate: string;
  expectedArrival: string;
  packages: number;
  weight: number;
  weightUnit: string;
  status: 'In Transit' | 'Processing' | 'Delivered' | 'Delayed' | 'Cancelled';
  freightCost: number;
}

// ============================================
// MOCK DATA
// ============================================

const mockShipments: Shipment[] = [
  {
    id: '1',
    trackingNumber: 'SHP-3301',
    poReference: 'PO-2857',
    carrier: 'DHL Express',
    method: 'Air Freight',
    origin: 'Manila Wharf, PH',
    destination: 'QC Central Hub, PH',
    departureDate: '2026-08-01',
    expectedArrival: '2026-08-03',
    packages: 12,
    weight: 450,
    weightUnit: 'kg',
    status: 'In Transit',
    freightCost: 2840,
  },
  {
    id: '2',
    trackingNumber: 'SHP-3302',
    poReference: 'PO-2851',
    carrier: 'FedEx Freight',
    method: 'Ground',
    origin: 'Cebu Port, PH',
    destination: 'Davao DC, PH',
    departureDate: '2026-07-30',
    expectedArrival: '2026-08-02',
    packages: 8,
    weight: 620,
    weightUnit: 'kg',
    status: 'Processing',
    freightCost: 2100,
  },
  {
    id: '3',
    trackingNumber: 'SHP-3303',
    poReference: 'PO-2855',
    carrier: 'Maersk',
    method: 'Ocean Freight',
    origin: 'Singapore Port',
    destination: 'Manila Port, PH',
    departureDate: '2026-07-28',
    expectedArrival: '2026-08-10',
    packages: 20,
    weight: 1200,
    weightUnit: 'kg',
    status: 'In Transit',
    freightCost: 5200,
  },
  {
    id: '4',
    trackingNumber: 'SHP-3304',
    poReference: 'PO-2843',
    carrier: 'LBC Express',
    method: 'Same-day',
    origin: 'Pasig Hub, PH',
    destination: 'Makati Branch, PH',
    departureDate: '2026-08-02',
    expectedArrival: '2026-08-02',
    packages: 3,
    weight: 120,
    weightUnit: 'kg',
    status: 'Delivered',
    freightCost: 450,
  },
  {
    id: '5',
    trackingNumber: 'SHP-3305',
    poReference: 'PO-2859',
    carrier: 'Ninja Van',
    method: 'Next-day',
    origin: 'Cebu Sorting Center',
    destination: 'Bohol Warehouse',
    departureDate: '2026-07-31',
    expectedArrival: '2026-08-01',
    packages: 5,
    weight: 240,
    weightUnit: 'kg',
    status: 'Delayed',
    freightCost: 980,
  },
  {
    id: '6',
    trackingNumber: 'SHP-3306',
    poReference: 'PO-2860',
    carrier: 'J&T Express',
    method: 'Standard',
    origin: 'Manila Central Hub',
    destination: 'Clark Freeport Zone',
    departureDate: '2026-08-02',
    expectedArrival: '2026-08-04',
    packages: 15,
    weight: 760,
    weightUnit: 'kg',
    status: 'Processing',
    freightCost: 1800,
  },
  {
    id: '7',
    trackingNumber: 'SHP-3307',
    poReference: 'PO-2861',
    carrier: 'DHL Express',
    method: 'Air Freight',
    origin: 'Hong Kong Intl Airport',
    destination: 'Manila Wharf, PH',
    departureDate: '2026-08-01',
    expectedArrival: '2026-08-03',
    packages: 7,
    weight: 380,
    weightUnit: 'kg',
    status: 'In Transit',
    freightCost: 3200,
  },
  {
    id: '8',
    trackingNumber: 'SHP-3308',
    poReference: 'PO-2862',
    carrier: 'Maersk',
    method: 'Ocean Freight',
    origin: 'Shanghai Port, CN',
    destination: 'Cebu Port, PH',
    departureDate: '2026-07-25',
    expectedArrival: '2026-08-15',
    packages: 40,
    weight: 3200,
    weightUnit: 'kg',
    status: 'Cancelled',
    freightCost: 0,
  },
];

// ============================================
// CONSTANTS
// ============================================

const statusOptions = ['All', 'In Transit', 'Processing', 'Delivered', 'Delayed', 'Cancelled'];

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { color: string; dotColor: string }> = {
    'In Transit': {
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      dotColor: 'bg-blue-400',
    },
    Processing: {
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      dotColor: 'bg-amber-400',
    },
    Delivered: {
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      dotColor: 'bg-emerald-400',
    },
    Delayed: {
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      dotColor: 'bg-rose-400',
    },
    Cancelled: {
      color: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
      dotColor: 'bg-slate-400',
    },
  };
  const { color, dotColor } = config[status] || config['Processing'];
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

const Shipments: React.FC = () => {
  // State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Filtered shipments
  const filteredShipments = useMemo(() => {
    return mockShipments.filter((s) => {
      const matchSearch =
        s.trackingNumber.toLowerCase().includes(search.toLowerCase()) ||
        s.poReference.toLowerCase().includes(search.toLowerCase()) ||
        s.carrier.toLowerCase().includes(search.toLowerCase()) ||
        s.destination.toLowerCase().includes(search.toLowerCase()) ||
        s.origin.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter]);

  // KPI counts
  const totalInTransit = mockShipments.filter((s) => s.status === 'In Transit').length;
  const totalProcessing = mockShipments.filter((s) => s.status === 'Processing').length;
  const totalDelivered = mockShipments.filter((s) => s.status === 'Delivered').length;
  const totalDelayed = mockShipments.filter((s) => s.status === 'Delayed').length;
  const totalFreightCost = mockShipments.reduce((sum, s) => sum + s.freightCost, 0);

  const handleEdit = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    setShowEditModal(true);
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6 bg-[#0b0f19] text-slate-100">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span>Admin</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-100">Shipments</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Shipments</h1>
          <p className="text-sm text-slate-400">Track inbound and outbound goods, carriers, and delivery schedules</p>
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
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" /> Create Shipment
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-4 text-center hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider">In Transit</p>
          <p className="text-2xl font-bold text-white mt-1">{totalInTransit}</p>
        </div>
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-4 text-center hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Processing</p>
          <p className="text-2xl font-bold text-white mt-1">{totalProcessing}</p>
        </div>
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-4 text-center hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Delivered</p>
          <p className="text-2xl font-bold text-white mt-1">{totalDelivered}</p>
        </div>
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-4 text-center hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Delayed</p>
          <p className="text-2xl font-bold text-white mt-1">{totalDelayed}</p>
        </div>
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl p-4 text-center hover:border-slate-600 transition-colors">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Freight Cost</p>
          <p className="text-2xl font-bold text-white mt-1">${totalFreightCost.toLocaleString()}</p>
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
                placeholder="Search by Tracking #, Carrier, or PO"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-[#0f172a] border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 w-full sm:w-64"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Shipment Table */}
      <div className="bg-[#0f172a] border border-slate-800/80 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-slate-800/30 border-b border-slate-800/60">
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Tracking #
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Carrier / Method
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Origin → Destination
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  Dates
                </th>
                <th className="px-4 py-3.5 text-center text-xs font-medium uppercase tracking-wider text-slate-400">
                  Packages / Weight
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
              {filteredShipments.map((shipment) => (
                <tr
                  key={shipment.id}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-4 py-3.5">
                    <div>
                      <p className="text-sm font-medium text-white">{shipment.trackingNumber}</p>
                      <p className="text-xs text-slate-400">PO: {shipment.poReference}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div>
                      <p className="text-sm text-slate-300">{shipment.carrier}</p>
                      <p className="text-xs text-slate-400">{shipment.method}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1 text-sm text-slate-300">
                      <span className="truncate max-w-[80px]">{shipment.origin}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      <span className="truncate max-w-[80px]">{shipment.destination}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div>
                      <p className="text-sm text-slate-300">Dep: {shipment.departureDate}</p>
                      <p className="text-xs text-slate-400">ETA: {shipment.expectedArrival}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <div>
                      <p className="text-sm text-white">{shipment.packages} boxes</p>
                      <p className="text-xs text-slate-400">{shipment.weight} {shipment.weightUnit}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={shipment.status} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleEdit(shipment)}
                        className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-100 transition-colors"
                        title="Edit Shipment"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-100 transition-colors"
                        title="Track Shipment"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredShipments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No shipments found matching your criteria.
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
            <span className="text-white font-medium">{filteredShipments.length}</span> of{' '}
            <span className="text-white font-medium">{mockShipments.length}</span> shipments
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

      {/* ============================================ */}
      {/* CREATE/EDIT SHIPMENT MODAL */}
      {/* ============================================ */}
      {(showAddModal || showEditModal) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => {
            setShowAddModal(false);
            setShowEditModal(false);
          }}
        >
          <div
            className="bg-[#0f172a] border border-slate-800/80 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {showAddModal ? 'Create Shipment' : 'Edit Shipment'}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setShowEditModal(false);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Tracking Number *
                </label>
                <input
                  type="text"
                  placeholder="e.g., SHP-3301"
                  className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  defaultValue={selectedShipment?.trackingNumber || ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  PO Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g., PO-2857"
                  className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  defaultValue={selectedShipment?.poReference || ''}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">
                    Carrier *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., DHL Express"
                    className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    defaultValue={selectedShipment?.carrier || ''}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">
                    Method
                  </label>
                  <select
                    className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    defaultValue={selectedShipment?.method || 'Air Freight'}
                  >
                    <option>Air Freight</option>
                    <option>Ocean Freight</option>
                    <option>Ground</option>
                    <option>Same-day</option>
                    <option>Next-day</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">
                    Origin *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Manila Wharf"
                    className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    defaultValue={selectedShipment?.origin || ''}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">
                    Destination *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., QC Central Hub"
                    className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    defaultValue={selectedShipment?.destination || ''}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">
                    Departure Date
                  </label>
                  <input
                    type="date"
                    className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    defaultValue={selectedShipment?.departureDate || ''}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">
                    Expected Arrival
                  </label>
                  <input
                    type="date"
                    className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    defaultValue={selectedShipment?.expectedArrival || ''}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">
                    Packages *
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    defaultValue={selectedShipment?.packages || 0}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">
                    Weight (kg)
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                    defaultValue={selectedShipment?.weight || 0}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Status
                </label>
                <select
                  className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  defaultValue={selectedShipment?.status || 'Processing'}
                >
                  <option>In Transit</option>
                  <option>Processing</option>
                  <option>Delivered</option>
                  <option>Delayed</option>
                  <option>Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Freight Cost ($)
                </label>
                <input
                  type="number"
                  placeholder="0"
                  className="w-full bg-[#0b0f19] border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  defaultValue={selectedShipment?.freightCost || 0}
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                  }}
                  className="px-5 py-2.5 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 text-slate-950"
                >
                  <Save className="w-4 h-4" /> Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Shipments;