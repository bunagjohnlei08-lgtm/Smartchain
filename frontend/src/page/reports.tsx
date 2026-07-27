// Reports.tsx
import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  FileText,
  Package,
  ShoppingCart,
  Truck,
  Layers,
  AlertCircle,
  Calendar,
  ChevronRight as ChevronBreadcrumb
} from 'lucide-react';

// ---------- TYPES ----------
interface Report {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: string;
}

// ---------- MOCK DATA ----------
const mockReports: Report[] = [
  {
    id: '1',
    name: 'Inventory Valuation',
    description: 'Detailed stock value, units, cost & retail allocations.',
    icon: <Package className="w-6 h-6" />,
    category: 'Inventory'
  },
  {
    id: '2',
    name: 'Sales Transactions',
    description: 'Summary of sales orders, invoice values & payments.',
    icon: <BarChart3 className="w-6 h-6" />,
    category: 'Sales'
  },
  {
    id: '3',
    name: 'Purchase Orders',
    description: 'Transactions, stock imports, and total supplier spend.',
    icon: <ShoppingCart className="w-6 h-6" />,
    category: 'Procurement'
  },
  {
    id: '4',
    name: 'Supplier Purchases',
    description: 'Consolidated vendor transaction quantities & values.',
    icon: <Truck className="w-6 h-6" />,
    category: 'Procurement'
  },
  {
    id: '5',
    name: 'Product Stock Catalog',
    description: 'Global SKU balance list grouped by brand/category.',
    icon: <Layers className="w-6 h-6" />,
    category: 'Inventory'
  },
  {
    id: '6',
    name: 'Low Stock Alert List',
    description: 'Items currently under their assigned order limits.',
    icon: <AlertCircle className="w-6 h-6" />,
    category: 'Inventory'
  },
  {
    id: '7',
    name: 'Expiration & Batches',
    description: 'Remaining stock sorted by batch.',
    icon: <Calendar className="w-6 h-6" />,
    category: 'Inventory'
  }
];

// ---------- CONSTANTS ----------
const categories = ['All Categories', ...new Set(mockReports.map(r => r.category))];
const warehouses = ['All Warehouses', 'Central Depot', 'Northgate', 'Eastside', 'Southpark'];

// ---------- HELPER COMPONENTS ----------
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
  className?: string;
}> = ({ value, onChange, options, className = '' }) => (
  <div className={`min-w-[130px] ${className}`}>
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

// ---------- MAIN COMPONENT ----------
const Reports: React.FC = () => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [selectedReport, setSelectedReport] = useState<string | null>('1');

  const filteredReports = useMemo(() => {
    return mockReports.filter(report => {
      const matchSearch = report.name.toLowerCase().includes(search.toLowerCase()) ||
                          report.description.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === 'All Categories' || report.category === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [search, categoryFilter]);

  const selectedReportData = mockReports.find(r => r.id === selectedReport);

  // Mock inventory valuation data
  const inventoryValuationData = [
    { product: 'IPAD AIR', sku: 'SKU-IPAD-AIRRR', category: 'Electronics', warehouse: 'Central Depot', qty: 2, cost: 10000, retail: 20000 },
    { product: 'IPAD AIR (256)', sku: 'SKU-IPAD-AIRRR-256', category: 'Electronics', warehouse: 'Unassigned', qty: 0, cost: 10000, retail: 20000 },
    { product: 'Apple iPad Air (64GB)', sku: 'SKU-IPAD-AIR', category: 'Electronics', warehouse: 'Unassigned', qty: 0, cost: 25000, retail: 25000 },
    { product: 'Sony WH-800XM4', sku: 'SKU-SONY-XM5', category: 'Electronics', warehouse: 'Central Depot', qty: 99, cost: 15000, retail: 1881000 }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Reports & Exports</h1>
        <p className="text-[#94A3B8] text-sm mt-1">
          Generate printable PDF sheets, filter inventory parameters, and export raw tabular data to Excel.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Reports Directory */}
        <div className="col-span-1">
          <div className="bg-[#162033] border border-[#263244] rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-4">
              <SearchInput value={search} onChange={setSearch} placeholder="Search reports..." />
              <FilterSelect value={categoryFilter} onChange={setCategoryFilter} options={categories} className="min-w-[120px]" />
            </div>
            <div className="space-y-1">
              {filteredReports.map((report) => (
                <button
                  key={report.id}
                  onClick={() => setSelectedReport(report.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all duration-200 flex items-start gap-3 ${
                    selectedReport === report.id
                      ? 'bg-[#5B8CFF]/10 border border-[#5B8CFF]/30'
                      : 'hover:bg-[#1E293B]'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${selectedReport === report.id ? 'bg-[#5B8CFF]/20' : 'bg-[#0E1624]'}`}>
                    {report.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${selectedReport === report.id ? 'text-[#5B8CFF]' : 'text-white'}`}>
                      {report.name}
                    </p>
                    <p className="text-[#64748B] text-xs truncate">{report.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Report Content */}
        <div className="col-span-2">
          <div className="bg-[#162033] border border-[#263244] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white font-semibold text-lg">
                  {selectedReportData?.name || 'Select a report'}
                </h3>
                <p className="text-[#94A3B8] text-sm">{selectedReportData?.description || 'Choose a report from the left panel'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3.5 py-2 border border-[#263244] rounded-xl text-[#94A3B8] hover:text-white hover:bg-[#1E293B] transition-all flex items-center gap-1.5 text-sm">
                  <Download className="w-4 h-4" /> Export
                </button>
                <button className="px-3.5 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-1.5" style={{ backgroundColor: '#5B8CFF', color: '#FFFFFF' }}>
                  <Printer className="w-4 h-4" /> Print
                </button>
              </div>
            </div>

            {selectedReport === '1' && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[#94A3B8] text-sm">6 records matched.</span>
                  <div className="flex items-center gap-3">
                    <FilterSelect value="All Warehouses" onChange={() => {}} options={warehouses} className="min-w-[140px]" />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-[#263244]">
                      <tr>
                        <th className="px-4 py-3 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Product Name</th>
                        <th className="px-4 py-3 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">SKU</th>
                        <th className="px-4 py-3 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Category</th>
                        <th className="px-4 py-3 text-left text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Warehouse</th>
                        <th className="px-4 py-3 text-right text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Stock Qty</th>
                        <th className="px-4 py-3 text-right text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Cost Price</th>
                        <th className="px-4 py-3 text-right text-[#94A3B8] text-xs font-medium uppercase tracking-wider">Retail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryValuationData.map((item, idx) => (
                        <tr key={idx} className="border-b border-[#1E293B] hover:bg-[#1E293B]/30 transition-all">
                          <td className="px-4 py-3 text-white text-sm">{item.product}</td>
                          <td className="px-4 py-3 text-[#94A3B8] text-sm font-mono">{item.sku}</td>
                          <td className="px-4 py-3 text-[#94A3B8] text-sm">{item.category}</td>
                          <td className="px-4 py-3 text-[#94A3B8] text-sm">{item.warehouse}</td>
                          <td className="px-4 py-3 text-right text-white text-sm">{item.qty}</td>
                          <td className="px-4 py-3 text-right text-white text-sm">₱{item.cost.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right text-white text-sm">₱{item.retail.toFixed(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {selectedReport !== '1' && selectedReportData && (
              <div className="flex items-center justify-center py-12 text-[#64748B]">
                <div className="text-center">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-[#64748B]" />
                  <p>Report content preview not available</p>
                  <p className="text-sm mt-1">Click Export to download this report</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;