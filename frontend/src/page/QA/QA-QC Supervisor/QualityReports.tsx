// src/page/qa/QualityReports.tsx
import React, { useState } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Printer,
  ClipboardList,
  CheckCircle2,
  XCircle,
  PackageX,
  Download,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LabelList,
} from 'recharts';

// ============================================
// TYPES
// ============================================

interface KpiData {
  label: string;
  value: string | number;
  subtext: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}

// ============================================
// MOCK DATA
// ============================================

// Data for Inspection Trend (line chart)
const trendData = [
  { date: 'Jul 30', passed: 28, rejected: 6, damaged: 3 },
  { date: 'Jul 31', passed: 35, rejected: 8, damaged: 5 },
  { date: 'Aug 01', passed: 42, rejected: 9, damaged: 4 },
  { date: 'Aug 02', passed: 30, rejected: 5, damaged: 2 },
  { date: 'Aug 03', passed: 38, rejected: 7, damaged: 6 },
  { date: 'Aug 04', passed: 45, rejected: 10, damaged: 4 },
  { date: 'Aug 05', passed: 40, rejected: 6, damaged: 3 },
];

// Data for Donut chart
const donutData = [
  { name: 'Passed', value: 77.1, color: '#22C55E' },
  { name: 'Rejected', value: 13.4, color: '#EF4444' },
  { name: 'Damaged', value: 9.5, color: '#F59E0B' },
];

// Data for Top Rejected Products (horizontal bar)
const topRejectedData = [
  { product: 'Hex Bolt M12', quantity: 5000 },
  { product: 'Tile Adhesive', quantity: 1800 },
  { product: 'Steel Angle Bar', quantity: 1200 },
  { product: 'G.I. Pipe 2"', quantity: 800 },
  { product: 'PVC Pipe 4"', quantity: 600 },
  { product: 'THHN Wire #12', quantity: 400 },
];

// Data for Supplier Quality Rating
const supplierQualityData = [
  { name: 'Northgate Steel Works', passRate: 96, inspections: 42 },
  { name: 'Cordillera Cement Corp.', passRate: 91, inspections: 55 },
  { name: 'Atlas Polymer Supply', passRate: 94, inspections: 30 },
  { name: 'Volt Prime Electricals', passRate: 84, inspections: 27 },
  { name: 'Ironclad Fasteners Inc.', passRate: 62, inspections: 21 },
  { name: 'Pacific Metal Traders', passRate: 88, inspections: 18 },
  { name: 'Summit Industrial Supply', passRate: 97, inspections: 15 },
];

// ============================================
// HELPER COMPONENTS
// ============================================

const KpiCard: React.FC<{
  label: string;
  value: string | number;
  subtext: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}> = ({ label, value, subtext, icon, iconBg, iconColor }) => (
  <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <p className="text-2xl font-bold text-white mt-1.5">{value}</p>
        <p className="text-xs text-slate-500 mt-1">{subtext}</p>
      </div>
      <div className={`p-2.5 rounded-full ${iconBg} ${iconColor}`}>{icon}</div>
    </div>
  </div>
);

// ============================================
// MAIN COMPONENT
// ============================================

const QualityReports: React.FC = () => {
  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Quality Reports</h1>
          <p className="text-sm text-slate-400">
            Aggregated quality performance for the current reporting period.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="border border-gray-700 bg-[#0d1322] hover:bg-gray-800 text-white font-medium px-4 py-2 rounded-xl flex items-center gap-2 text-sm transition-all">
            <FileText className="w-4 h-4" /> Export PDF
          </button>
          <button className="border border-gray-700 bg-[#0d1322] hover:bg-gray-800 text-white font-medium px-4 py-2 rounded-xl flex items-center gap-2 text-sm transition-all">
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </button>
          <button className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold px-4 py-2 rounded-xl flex items-center gap-2 text-sm transition-all">
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="INSPECTION SUMMARY"
          value="284"
          subtext="Inspections completed"
          icon={<ClipboardList className="w-6 h-6" />}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-400"
        />
        <KpiCard
          label="PASSED"
          value="77.1%"
          subtext="219 batches"
          icon={<CheckCircle2 className="w-6 h-6" />}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-400"
        />
        <KpiCard
          label="REJECTED"
          value="13.4%"
          subtext="38 batches"
          icon={<XCircle className="w-6 h-6" />}
          iconBg="bg-red-500/10"
          iconColor="text-red-400"
        />
        <KpiCard
          label="DAMAGED"
          value="9.5%"
          subtext="27 batches"
          icon={<PackageX className="w-6 h-6" />}
          iconBg="bg-amber-500/10"
          iconColor="text-amber-400"
        />
      </div>

      {/* Row 1: Inspection Trend + Pass vs Reject */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Inspection Trend */}
        <div className="lg:col-span-7 bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
          <h3 className="text-lg font-semibold text-white">Inspection Trend</h3>
          <p className="text-sm text-slate-400 mb-4">
            Passed, rejected and damaged batches per day.
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
              <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#1e293b',
                  color: '#f1f5f9',
                }}
              />
              <Legend
                iconType="circle"
                formatter={(value) => (
                  <span className="text-slate-300 text-sm">{value}</span>
                )}
              />
              <Line
                type="monotone"
                dataKey="passed"
                stroke="#22C55E"
                strokeWidth={2}
                dot={{ r: 4, fill: '#22C55E' }}
                activeDot={{ r: 6 }}
                name="Passed"
              />
              <Line
                type="monotone"
                dataKey="rejected"
                stroke="#EF4444"
                strokeWidth={2}
                dot={{ r: 4, fill: '#EF4444' }}
                activeDot={{ r: 6 }}
                name="Rejected"
              />
              <Line
                type="monotone"
                dataKey="damaged"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={{ r: 4, fill: '#F59E0B' }}
                activeDot={{ r: 6 }}
                name="Damaged"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Pass vs Reject Donut */}
        <div className="lg:col-span-5 bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
          <h3 className="text-lg font-semibold text-white">Pass vs Reject</h3>
          <p className="text-sm text-slate-400 mb-4">
            Distribution of inspection outcomes.
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="85%"
                paddingAngle={4}
                dataKey="value"
                label={false}
              >
                {donutData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#0d1322" strokeWidth={2} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-6 mt-4">
            {donutData.map((entry) => (
              <span key={entry.name} className="flex items-center gap-2 text-sm text-slate-300 font-medium">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                {entry.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Top Rejected Products + Supplier Quality Rating */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Rejected Products */}
        <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
          <h3 className="text-lg font-semibold text-white">Top Rejected Products</h3>
          <p className="text-sm text-slate-400 mb-4">
            Rejected quantity by product.
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              layout="vertical"
              data={topRejectedData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
              <YAxis
                type="category"
                dataKey="product"
                stroke="#94a3b8"
                tick={{ fill: '#94a3b8' }}
                width={100}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#1e293b',
                  color: '#f1f5f9',
                }}
              />
              <Bar dataKey="quantity" fill="#06b6d4" radius={[0, 4, 4, 0]}>
                <LabelList
                  dataKey="quantity"
                  position="right"
                  style={{ fill: '#94a3b8', fontSize: 12 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Supplier Quality Rating */}
        <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
          <h3 className="text-lg font-semibold text-white">Supplier Quality Rating</h3>
          <p className="text-sm text-slate-400 mb-4">
            Pass rate weighted by inspected volume.
          </p>
          <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {supplierQualityData.map((item, idx) => (
              <div key={idx}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-200">{item.name}</span>
                  <span className="text-slate-300 font-medium">
                    {item.passRate}% • {item.inspections} insp.
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-800 rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-cyan-500 transition-all"
                    style={{ width: `${item.passRate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QualityReports;