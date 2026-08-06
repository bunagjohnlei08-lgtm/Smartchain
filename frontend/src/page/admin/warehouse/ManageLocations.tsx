import React, { useState, useMemo } from 'react';
import { Plus, Edit, Trash2, Search } from 'lucide-react';
import PageContainer from '@/components/layout/PageContainer';

// ============================================
// TYPES
// ============================================

interface WarehouseLocation {
 id: string;
 name: string;
 code: string;
 rack: string;
 shelf: string;
 bin: string;
 capacity: number;
 utilized: number;
 available: number;
 status: 'Active' | 'Inactive' | 'Full';
 zone: string;
}

// ============================================
// MOCK DATA
// ============================================

const mockLocations: WarehouseLocation[] = [
 {
  id: '1',
  name: 'Central Depot',
  code: 'WH-CENTRAL',
  rack: 'A',
  shelf: '1',
  bin: '001',
  capacity: 500,
  utilized: 320,
  available: 180,
  status: 'Active',
  zone: 'A'
 },
 {
  id: '2',
  name: 'Northgate Warehouse',
  code: 'WH-NORTH',
  rack: 'B',
  shelf: '2',
  bin: '003',
  capacity: 350,
  utilized: 280,
  available: 70,
  status: 'Active',
  zone: 'B'
 },
 {
  id: '3',
  name: 'Eastside Storage',
  code: 'WH-EAST',
  rack: 'C',
  shelf: '1',
  bin: '005',
  capacity: 200,
  utilized: 200,
  available: 0,
  status: 'Full',
  zone: 'C'
 },
 {
  id: '4',
  name: 'Southpark Facility',
  code: 'WH-SOUTH',
  rack: 'D',
  shelf: '3',
  bin: '002',
  capacity: 300,
  utilized: 150,
  available: 150,
  status: 'Active',
  zone: 'D'
 }
];

// ============================================
// COMPONENTS
// ============================================

// ----- Status Badge -----
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
 const config: Record<string, { color: string }> = {
  'Active': { color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  'Inactive': { color: 'text-gray-400 bg-gray-400/10 border-gray-400/20' },
  'Full': { color: 'text-red-400 bg-red-400/10 border-red-400/20' }
 };
 const { color } = config[status] || config['Active'];
 return (
  <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${color} flex items-center gap-1.5 whitespace-nowrap`}>
   {status}
  </span>
 );
};

// ----- Search Input -----
const SearchInput: React.FC<{
 value: string;
 onChange: (value: string) => void;
 placeholder?: string;
}> = ({ value, onChange, placeholder = 'Search...' }) => (
 <div className="relative flex-1 min-w-[200px]">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
  <input
   type="text"
   value={value}
   onChange={(e) => onChange(e.target.value)}
   placeholder={placeholder}
   className="w-full bg-gray-800/50 border-gray-700 text-white rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder-slate-500 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
  />
 </div>
);

// ----- Filter Select -----
const FilterSelect: React.FC<{
 value: string;
 onChange: (value: string) => void;
 options: string[];
}> = ({ value, onChange, options }) => (
 <div className="min-w-[140px]">
  <select
   value={value}
   onChange={(e) => onChange(e.target.value)}
   className="w-full bg-gray-800/50 border-gray-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all appearance-none cursor-pointer"
  >
   {options.map((opt) => (
    <option key={opt} value={opt}>{opt}</option>
   ))}
  </select>
 </div>
);

// ============================================
// PAGE: MANAGE LOCATIONS
// ============================================

const ManageLocations: React.FC = () => {
 const [search, setSearch] = useState('');
 const [zoneFilter, setZoneFilter] = useState('All Zones');

 const filteredLocations = useMemo(() => {
  return mockLocations.filter(loc =>
   loc.name.toLowerCase().includes(search.toLowerCase()) ||
   loc.code.toLowerCase().includes(search.toLowerCase())
  );
 }, [search]);

 return (
  <PageContainer>
   <div className="space-y-8">
    {/* Header */}
    <div>
   <h1 className="text-2xl font-bold text-white">Manage Locations</h1>
   <p className="text-gray-400 text-sm mt-2">
      View and manage warehouse locations, rack assignments, and capacity utilization.
     </p>
    </div>

   {/* Filter Toolbar */}
   <div className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-5">
    <div className="flex flex-wrap items-center gap-4">
     <SearchInput
      value={search}
      onChange={setSearch}
      placeholder="Search locations by name or code..."
     />
     <FilterSelect
      value={zoneFilter}
      onChange={setZoneFilter}
      options={['All Zones', 'Zone A', 'Zone B', 'Zone C', 'Zone D']}
     />
     <button className="px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-1.5 ml-auto"
      style={{ backgroundColor: '#5B8CFF', color: '#FFFFFF' }}>
      <Plus className="w-4 h-4" /> Add Location
     </button>
    </div>
   </div>

   {/* Location Cards Grid */}
   <div className="grid grid-cols-2 gap-4">
    {filteredLocations.map((location) => {
     const utilizationPercentage = Math.round((location.utilized / location.capacity) * 100);
     const statusColor = utilizationPercentage >= 90 ? 'text-red-400' :
               utilizationPercentage >= 70 ? 'text-yellow-400' :
               'text-green-400';

     return (
      <div key={location.id} className="bg-[#0d1322] border border-gray-800/50 shadow-sm rounded-2xl p-5 hover:border-blue-500/30 transition-all duration-200">
       <div className="flex items-start justify-between mb-4">
        <div>
         <h3 className="text-white font-semibold text-lg">{location.name}</h3>
         <p className="text-gray-400 text-sm">{location.code}</p>
        </div>
        <StatusBadge status={location.status} />
       </div>

       <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-800/50 rounded-xl p-3 text-center">
         <p className="text-gray-400 text-xs">Rack</p>
         <p className="text-white font-medium">{location.rack}</p>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-3 text-center">
         <p className="text-gray-400 text-xs">Shelf</p>
         <p className="text-white font-medium">{location.shelf}</p>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-3 text-center">
         <p className="text-gray-400 text-xs">Bin</p>
         <p className="text-white font-medium">{location.bin}</p>
        </div>
       </div>

        <div className="space-y-2">
         <div className="flex justify-between text-sm">
          <span className="text-gray-400">Capacity</span>
          <span className="text-white">{location.capacity} units</span>
         </div>
         <div className="flex justify-between text-sm">
          <span className="text-gray-400">Utilized</span>
          <span className="text-white">{location.utilized} units</span>
         </div>
         <div className="flex justify-between text-sm">
          <span className="text-gray-400">Available</span>
          <span className={`font-medium ${statusColor}`}>{location.available} units</span>
         </div>
         <div className="w-full bg-gray-800/50 rounded-full h-1.5 mt-1">
         <div
          className="h-1.5 rounded-full transition-all"
          style={{
           width: `${utilizationPercentage}%`,
           backgroundColor: utilizationPercentage >= 90 ? '#EF4444' :
                   utilizationPercentage >= 70 ? '#F59E0B' :
                   '#22C55E'
          }}
         />
        </div>
       </div>

       <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-gray-800 border-gray-800">
        <button className="p-1.5 rounded-lg hover:bg-gray-800 hover:bg-gray-800 text-gray-400 hover:text-white transition-all">
         <Edit className="w-4 h-4" />
        </button>
        <button className="p-1.5 rounded-lg hover:bg-gray-800 hover:bg-gray-800 text-gray-400 hover:text-red-400 transition-all">
         <Trash2 className="w-4 h-4" />
        </button>
       </div>
      </div>
     );
    })}
   </div>
  </div>
  </PageContainer>
 );
};

export { ManageLocations };
export default ManageLocations;
