// src/pages/admin/Reports.tsx
import React, { useState } from 'react';
import {
  FileText,
  Eye,
  Printer,
  Download,
  FileSpreadsheet,
  BarChart3,
  Clock,
  Calendar,
  ChevronRight,
  X,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface Report {
  id: string;
  title: string;
  recordCount: string;
  description: string;
  updated: string;
}

interface ScheduledReport {
  id: string;
  name: string;
  schedule: string;
  format: 'PDF' | 'Excel';
}

// ============================================
// MOCK DATA
// ============================================

const reports: Report[] = [
  {
    id: '1',
    title: 'Inventory Report',
    recordCount: '1,284 records',
    description: 'Stock levels, valuation and aging across all zones.',
    updated: 'Updated 2 hours ago',
  },
  {
    id: '2',
    title: 'Stock Movement',
    recordCount: '9,081 entries',
    description: 'Receiving, release and adjustment ledger by period.',
    updated: 'Updated 35 minutes ago',
  },
  {
    id: '3',
    title: 'Supplier Report',
    recordCount: '5 suppliers',
    description: 'Lead times, fill rate and quality scoring per supplier.',
    updated: 'Updated today',
  },
  {
    id: '4',
    title: 'Purchase Report',
    recordCount: '96 orders',
    description: 'Purchase order spend, status and cost variance.',
    updated: 'Updated today',
  },
  {
    id: '5',
    title: 'Shipment Report',
    recordCount: '312 shipments',
    description: 'Outbound delivery performance and transit times.',
    updated: 'Updated 1 hour ago',
  },
];

const scheduledReports: ScheduledReport[] = [
  {
    id: '1',
    name: 'Daily inventory snapshot',
    schedule: 'Every day · 06:00',
    format: 'PDF',
  },
  {
    id: '2',
    name: 'Weekly stock movement',
    schedule: 'Mondays · 07:30',
    format: 'Excel',
  },
  {
    id: '3',
    name: 'Monthly supplier scorecard',
    schedule: '1st of month · 08:00',
    format: 'PDF',
  },
];

// ============================================
// MAIN COMPONENT
// ============================================

const Reports: React.FC = () => {
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  const showNotification = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handlePreview = (report: Report) => {
    setSelectedReport(report);
    setShowPreviewModal(true);
  };

  const handlePrint = (report: Report) => {
    showNotification(`Printing ${report.title}...`);
  };

  const handlePDF = (report: Report) => {
    showNotification(`Generating PDF for ${report.title}...`);
  };

  const handleExcel = (report: Report) => {
    showNotification(`Exporting ${report.title} to Excel...`);
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span>Admin</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-100">Reports</span>
      </div>

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-sm text-slate-400">
            Operational reporting for inventory, purchasing and logistics
          </p>
        </div>
        <button className="p-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {reports.map((report) => (
          <div
            key={report.id}
            className="bg-[#0f172a]/70 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all shadow-sm"
          >
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{report.title}</h3>
                <p className="text-xs text-slate-400">{report.recordCount}</p>
              </div>
            </div>

            {/* Description & Timestamp */}
            <p className="text-sm text-slate-400 flex-1">{report.description}</p>
            <p className="text-xs text-slate-500">{report.updated}</p>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                onClick={() => handlePreview(report)}
                className="bg-[#101929] hover:bg-[#18253d] border border-slate-700/60 text-slate-200 text-xs font-medium py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all"
              >
                <Eye className="w-4 h-4" /> Preview
              </button>
              <button
                onClick={() => handlePrint(report)}
                className="bg-[#101929] hover:bg-[#18253d] border border-slate-700/60 text-slate-200 text-xs font-medium py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all"
              >
                <Printer className="w-4 h-4" /> Print
              </button>
              <button
                onClick={() => handlePDF(report)}
                className="bg-[#101929] hover:bg-[#18253d] border border-slate-700/60 text-slate-200 text-xs font-medium py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all"
              >
                <Download className="w-4 h-4" /> PDF
              </button>
              <button
                onClick={() => handleExcel(report)}
                className="bg-[#101929] hover:bg-[#18253d] border border-slate-700/60 text-slate-200 text-xs font-medium py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all"
              >
                <FileSpreadsheet className="w-4 h-4" /> Excel
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Scheduled Reports */}
      <div className="bg-[#0f172a]/50 border border-slate-800/80 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Scheduled Reports</h3>
            <p className="text-sm text-slate-400">
              Automatically delivered to operations leads
            </p>
          </div>
          <button className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
            Manage schedules
          </button>
        </div>

        <div className="space-y-3">
          {scheduledReports.map((item) => (
            <div
              key={item.id}
              className="bg-[#101929]/70 border border-slate-800/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:border-slate-700/80 transition-all"
            >
              <div>
                <p className="text-sm font-medium text-white">{item.name}</p>
                <p className="text-xs text-slate-400">{item.schedule}</p>
              </div>
              <div className="mt-2 sm:mt-0">
                <span className="px-3 py-1 rounded-lg text-xs font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  {item.format}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============================================ */}
      {/* PREVIEW MODAL */}
      {/* ============================================ */}
      {showPreviewModal && selectedReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowPreviewModal(false)}
        >
          <div
            className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">{selectedReport.title}</h2>
                <p className="text-sm text-slate-400">Preview</p>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-[#101929] rounded-xl p-4 border border-slate-800">
                <p className="text-sm text-slate-400">{selectedReport.description}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <Clock className="w-3 h-3" />
                  <span>{selectedReport.updated}</span>
                </div>
              </div>

              {/* Mock table preview */}
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#101929] border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                        Column 1
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                        Column 2
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                        Column 3
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3, 4].map((i) => (
                      <tr
                        key={i}
                        className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="px-4 py-2.5 text-slate-300">Sample Data {i}</td>
                        <td className="px-4 py-2.5 text-slate-300">Value {i}</td>
                        <td className="px-4 py-2.5 text-slate-300">{i * 100}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="px-5 py-2.5 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowPreviewModal(false);
                    handlePDF(selectedReport);
                  }}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 flex items-center gap-2 bg-cyan-500 text-slate-950"
                >
                  <Download className="w-4 h-4" /> Export PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-300">
          <CheckCircle className="w-5 h-5 text-emerald-400" />
          <span className="text-sm">{toastMessage}</span>
          <button
            onClick={() => setShowToast(false)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default Reports;