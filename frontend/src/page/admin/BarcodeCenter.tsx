// src/pages/admin/BarcodeCenter.tsx
import React, { useState, useMemo } from 'react';
import {
  ChevronRight,
  Search,
  Printer,
  FileText,
  Barcode,
  Download,
  X,
  CheckCircle,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface BarcodeItem {
  id: string;
  productName: string;
  sku: string;
  category: string;
  barcode: string;
  format: string;
}

// ============================================
// MOCK DATA
// ============================================

const mockBarcodes: BarcodeItem[] = [
  {
    id: '1',
    productName: 'Industrial LED Panel 40W',
    sku: 'ELC-LED-040',
    category: 'Electronics',
    barcode: '8801234500011',
    format: 'EAN-13',
  },
  {
    id: '2',
    productName: 'Corrugated Box 60x40x40',
    sku: 'PKG-BOX-604',
    category: 'Packaging',
    barcode: '8801234500028',
    format: 'EAN-13',
  },
  {
    id: '3',
    productName: 'Stainless Steel Sheet 2mm',
    sku: 'RAW-SST-002',
    category: 'Raw Materials',
    barcode: '8801234500035',
    format: 'EAN-13',
  },
  {
    id: '4',
    productName: 'Cordless Impact Driver',
    sku: 'TLS-IMP-018',
    category: 'Tools & Hardware',
    barcode: '8801234500042',
    format: 'EAN-13',
  },
  {
    id: '5',
    productName: 'Safety Helmet Class E',
    sku: 'SAF-HLM-001',
    category: 'Safety Equipment',
    barcode: '8801234500059',
    format: 'EAN-13',
  },
  {
    id: '6',
    productName: 'Thermal Label Roll 4x6',
    sku: 'PKG-LBL-046',
    category: 'Packaging',
    barcode: '8801234500066',
    format: 'EAN-13',
  },
  {
    id: '7',
    productName: 'Servo Motor 400W',
    sku: 'ELC-SRV-400',
    category: 'Electronics',
    barcode: '8801234500073',
    format: 'EAN-13',
  },
  {
    id: '8',
    productName: 'Nitrile Gloves (Box 100)',
    sku: 'SAF-GLV-100',
    category: 'Safety Equipment',
    barcode: '8801234500080',
    format: 'EAN-13',
  },
  {
    id: '9',
    productName: 'Aluminium Profile 6m',
    sku: 'RAW-ALU-006',
    category: 'Raw Materials',
    barcode: '8801234500097',
    format: 'EAN-13',
  },
];

// ============================================
// CONSTANTS
// ============================================

const categories = [
  'All categories',
  'Electronics',
  'Packaging',
  'Raw Materials',
  'Tools & Hardware',
  'Safety Equipment',
];

// ============================================
// HELPER COMPONENTS
// ============================================

const SearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, placeholder = 'Search...', className = '' }) => (
  <div className={`relative flex-1 min-w-[200px] ${className}`}>
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[#0d1322] border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all"
    />
  </div>
);

const FilterSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: string[];
  className?: string;
}> = ({ value, onChange, options, className = '' }) => (
  <div className={`min-w-[140px] ${className}`}>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[#0d1322] border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 appearance-none cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  </div>
);

// Barcode SVG Generator
const BarcodeSVG: React.FC<{ value: string }> = ({ value }) => {
  const digits = value.split('').map(Number);

  // Generate patterns for each digit
  const patterns = digits.map((d) => {
    const pattern = [];
    for (let i = 0; i < 5; i++) {
      const thickness = (d % 3 === 0) ? 2 : 1;
      pattern.push(thickness);
    }
    return pattern;
  }).flat();

  const barWidth = 2;
  const barSpacing = 1;
  const height = 50;

  return (
    <svg
      viewBox={`0 0 ${patterns.length * (barWidth + barSpacing)} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto max-h-14"
    >
      {patterns.map((thick, index) => (
        <rect
          key={index}
          x={index * (barWidth + barSpacing)}
          y={0}
          width={thick === 2 ? barWidth * 2 : barWidth}
          height={height}
          fill="currentColor"
          className="text-slate-200"
        />
      ))}
    </svg>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const BarcodeCenter: React.FC = () => {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  // Filter barcodes
  const filteredBarcodes = useMemo(() => {
    return mockBarcodes.filter((item) => {
      const matchSearch =
        item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.barcode.includes(searchQuery);
      const matchCategory =
        categoryFilter === 'All categories' || item.category === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [searchQuery, categoryFilter]);

  // Toast notification
  const showNotification = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // Handle actions
  const handlePrint = (productName: string) => {
    showNotification(`Printing barcode for ${productName}...`);
  };

  const handlePDF = (productName: string) => {
    showNotification(`Generating PDF for ${productName}...`);
  };

  const handlePrintSheet = () => {
    showNotification('Printing sheet...');
  };

  const handleDownloadPDF = () => {
    showNotification('Downloading PDF...');
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span>Admin</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-100">Barcode Center</span>
      </div>

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Barcode Center</h1>
          <p className="text-sm text-gray-400">
            {mockBarcodes.length} generated barcodes · EAN-13 format
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrintSheet}
            className="bg-[#0d1322] hover:bg-[#18253d] border border-slate-700/60 text-slate-200 text-xs font-medium px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
          >
            <Printer className="w-4 h-4" /> Print sheet
          </button>
          <button
            onClick={handleDownloadPDF}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" /> Download PDF
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-[#0f172a]/60 border border-slate-800/80 rounded-2xl p-4 md:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search product, SKU or barcode..."
            className="min-w-[280px]"
          />
          <div className="ml-auto w-full sm:w-auto">
            <FilterSelect
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categories}
            />
          </div>
        </div>
      </div>

      {/* Barcode Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredBarcodes.map((item) => (
          <div
            key={item.id}
            className="bg-[#0f172a]/80 border border-slate-800/90 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-md hover:border-slate-700 transition-all"
          >
            {/* Card Header */}
            <div>
              <div className="flex items-start justify-between mb-1">
                <h3 className="text-sm font-semibold text-white">
                  {item.productName}
                </h3>
                <span className="bg-[#0d1322] text-gray-400 text-[10px] px-2 py-0.5 rounded-full border border-slate-800 whitespace-nowrap ml-2">
                  {item.format}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                {item.sku} · {item.category}
              </p>
            </div>

            {/* Barcode Visual */}
            <div className="bg-[#0d1322] border border-slate-800/90 rounded-xl p-4 flex flex-col items-center justify-center space-y-2">
              <div className="w-full overflow-hidden">
                <BarcodeSVG value={item.barcode} />
              </div>
              <p className="text-xs font-mono text-gray-400 tracking-widest">
                {item.barcode.split('').join(' ')}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handlePrint(item.productName)}
                className="bg-[#0d1322] hover:bg-[#18253d] border border-slate-700/60 text-slate-200 text-xs font-medium py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <Printer className="w-4 h-4" /> Print
              </button>
              <button
                onClick={() => handlePDF(item.productName)}
                className="bg-[#0d1322] hover:bg-[#18253d] border border-slate-700/60 text-slate-200 text-xs font-medium py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <FileText className="w-4 h-4" /> PDF
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredBarcodes.length === 0 && (
        <div className="bg-[#0f172a]/60 border border-slate-800/80 rounded-2xl p-8 text-center">
          <Barcode className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-400">No barcodes found matching your search.</p>
        </div>
      )}

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-300">
          <CheckCircle className="w-5 h-5 text-emerald-400" />
          <span className="text-sm">{toastMessage}</span>
          <button
            onClick={() => setShowToast(false)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default BarcodeCenter;