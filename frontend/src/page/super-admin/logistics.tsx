import React, { useState, useMemo } from 'react';
import {
  Truck,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Package,
  Clock,
  CheckCircle,
  AlertTriangle,
  MapPin
} from 'lucide-react';

// ---------- TYPES ----------
interface Shipment {
  id: string;
  trackingId: string;
  origin: string;
  destination: string;
  driver: string;
  vehicle: string;
  eta: string;
  status: 'In Transit' | 'Delivered' | 'Delayed';
}

// ---------- MOCK DATA ----------
const mockShipments: Shipment[] = [
  { id: '1', trackingId: 'TRK-10421', origin: 'Manila', destination: 'Cebu', driver: 'A. Reyes', vehicle: 'VH-301', eta: '2026-07-29', status: 'In Transit' },
  { id: '2', trackingId: 'TRK-10422', origin: 'Davao', destination: 'Iloilo', driver: 'M. Cruz', vehicle: 'VH-118', eta: '2026-07-30', status: 'In Transit' },
  { id: '3', trackingId: 'TRK-10423', origin: 'Cebu', destination: 'Davao', driver: 'R. Diaz', vehicle: 'VH-445', eta: '2026-07-28', status: 'Delivered' },
  { id: '4', trackingId: 'TRK-10424', origin: 'Manila', destination: 'Davao', driver: 'K. Tan', vehicle: 'VH-220', eta: '2026-07-31', status: 'Delayed' },
  { id: '5', trackingId: 'TRK-10425', origin: 'Iloilo', destination: 'Cebu', driver: 'L. Reyes', vehicle: 'VH-332', eta: '2026-07-29', status: 'Delivered' },
  { id: '6', trackingId: 'TRK-10426', origin: 'Cebu', destination: 'Manila', driver: 'J. Lim', vehicle: 'VH-410', eta: '2026-08-01', status: 'In Transit' },
  { id: '7', trackingId: 'TRK-10427', origin: 'Davao', destination: 'Manila', driver: 'S. Ong', vehicle: 'VH-155', eta: '2026-07-30', status: 'Delayed' },
  { id: '8', trackingId: 'TRK-10428', origin: 'Manila', destination: 'Iloilo', driver: 'P. Go', vehicle: 'VH-289', eta: '2026-07-29', status: 'Delivered' },
  { id: '9', trackingId: 'TRK-10429', origin: 'Cebu', destination: 'Davao', driver: 'T. Uy', vehicle: 'VH-501', eta: '2026-08-02', status: 'In Transit' },
  { id: '10', trackingId: 'TRK-10430', origin: 'Iloilo', destination: 'Manila', driver: 'N. Sy', vehicle: 'VH-377', eta: '2026-07-31', status: 'Delayed' }
];

const statusOptions = ['All Status', 'In Transit', 'Delivered', 'Delayed'];

// ---------- HELPER COMPONENTS ----------
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    'In Transit': { color: 'text-blue-400 bg-blue-400/10 border-blue-400/20', icon: Truck },
    'Delivered': { color: 'text-green-400 bg-green-400/10 border-green-400/20', icon: CheckCircle },
    'Delayed': { color: 'text-red-400 bg-red-400/10 border-red-400/20', icon: AlertTriangle }
  };
  const { color, icon: Icon } = config[status] || config['In Transit'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${color}`}>
      <Icon className="w-3.5 h-3.5" />
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
  <div className="bg-[#162033] border border-[#263244] rounded-2xl p-5 hover:border-[#3B82F6]/30 transition-all duration-200 h-full flex flex-col">
    <div className="flex items-start justify-between flex-1">
      <div>
        <p className="text-[#94A3B8] text-xs font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-white mt-1.5">{value}</p>
        {subtitle && <p className="text-[#64748B] text-xs mt-1">{subtitle}</p>}
      </div>
      <div className="p-2.5 bg-[#0E1624] rounded-lg shrink-0">{icon}</div>
    </div>
  </div>
);

const SearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder = 'Search...' }) => (
  <div className="relative flex-1 min-w-[180px]">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[#0E1624] border border-[#263244] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-all"
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
      className="w-full bg-[#0E1624] border border-[#263244] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/50 focus:border-[#3B82F6] transition-all appearance-none cursor-pointer"
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
    <div className="flex items-center justify-between px-6 py-4 border-t border-[#263244] bg-[#0B1220]/30">
      <div className="text-sm text-[#94A3B8]">
        Showing <span className="text-white font-medium">{start}</span> to{' '}
        <span className="text-white font-medium">{end}</span> of{' '}
        <span className="text-white font-medium">{totalItems}</span> shipments
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="p-1.5 rounded-xl border border-[#263244] text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {getPages().map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`px-3 py-1 rounded-xl text-sm font-medium transition-all ${
              currentPage === page
                ? 'bg-blue-500 text-white'
                : 'text-[#94A3B8] hover:text-white hover:bg-[#1E293B]'
            }`}
          >
            {page}
          </button>
        ))}
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-xl border border-[#263244] text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ---------- MAIN COMPONENT ----------
const Logistics: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const filteredShipments = useMemo(() => {
    return mockShipments.filter((shipment) => {
      const matchSearch =
        shipment.trackingId.toLowerCase().includes(search.toLowerCase()) ||
        shipment.origin.toLowerCase().includes(search.toLowerCase()) ||
        shipment.destination.toLowerCase().includes(search.toLowerCase()) ||
        shipment.driver.toLowerCase().includes(search.toLowerCase()) ||
        shipment.vehicle.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All Status' || shipment.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter]);

  const totalPages = Math.ceil(filteredShipments.length / itemsPerPage);
  const paginatedShipments = filteredShipments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const activeShipments = mockShipments.filter((s) => s.status === 'In Transit').length;
  const delayedShipments = mockShipments.filter((s) => s.status === 'Delayed').length;
  const deliveredShipments = mockShipments.filter((s) => s.status === 'Delivered').length;
  const onTimeRate = mockShipments.length > 0 ? Math.round((deliveredShipments / mockShipments.length) * 100) : 0;
  const activeFleet = new Set(mockShipments.map((s) => s.vehicle)).size;

  return (
    <div className="space-y-6 p-6 font-sans">
      <div>
        <h1 className="text-2xl font-bold text-white">Logistics & Tracking (DTRS)</h1>
        <p className="text-[#94A3B8] text-sm mt-1">
          Manage delivery routes, fleet status, and shipment tracking across warehouses and branches.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Active Shipments" value={activeShipments} icon={<Truck className="w-5 h-5 text-blue-400" />} />
        <KPICard label="On-Time Delivery Rate" value={`${onTimeRate}%`} icon={<CheckCircle className="w-5 h-5 text-green-400" />} subtitle="Based on delivered orders" />
        <KPICard label="Delayed Shipments" value={delayedShipments} icon={<AlertTriangle className="w-5 h-5 text-red-400" />} />
        <KPICard label="Active Fleet" value={activeFleet} icon={<Package className="w-5 h-5 text-yellow-400" />} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-blue-500 text-white">
          <Plus className="w-4 h-4" /> Create Shipment
        </button>
        <button className="px-4 py-2.5 border border-[#263244] rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-all flex items-center gap-2 text-sm">
          <Search className="w-4 h-4" /> Filter
        </button>
      </div>

      <div className="bg-[#162033] border border-[#263244] rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search shipments..." />
          <FilterSelect value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
        </div>
      </div>

      <div className="bg-[#162033] border border-[#263244] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#0B1220]/50 border-b border-[#263244]">
              <tr>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Tracking ID</th>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Origin</th>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Destination</th>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Driver</th>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Vehicle</th>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">ETA</th>
                <th className="px-5 py-3.5 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedShipments.map((shipment) => (
                <tr key={shipment.id} className="border-b border-[#1E293B] hover:bg-[#1E293B]/30 transition-all duration-150">
                  <td className="px-5 py-3.5 text-white text-sm font-medium">{shipment.trackingId}</td>
                  <td className="px-5 py-3.5 text-[#94A3B8] text-sm">{shipment.origin}</td>
                  <td className="px-5 py-3.5 text-[#94A3B8] text-sm">{shipment.destination}</td>
                  <td className="px-5 py-3.5 text-[#94A3B8] text-sm">{shipment.driver}</td>
                  <td className="px-5 py-3.5 text-[#94A3B8] text-sm font-mono">{shipment.vehicle}</td>
                  <td className="px-5 py-3.5 text-[#94A3B8] text-sm">{shipment.eta}</td>
                  <td className="px-5 py-3.5"><StatusBadge status={shipment.status} /></td>
                </tr>
              ))}
              {paginatedShipments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Truck className="w-10 h-10 text-[#64748B]" />
                      <p className="text-[#94A3B8] font-medium">No shipments found matching your filters</p>
                    </div>
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
    </div>
  );
};

export default Logistics;
