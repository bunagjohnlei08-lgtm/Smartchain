import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Ban, Download, Printer, RefreshCw, Search } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { formatStatusLabel, normalizeInspectionStatus } from './inspectionStatus';

interface RejectedItemApi {
  id: number;
  receiving_no: string | null;
  supplier: string | null;
  product: string | null;
  delivered_qty: number | null;
  rejected_qty: number;
  unit: string | null;
  reason: string | null;
  inspection_result: unknown;
  inspected_by: string | null;
  submitted_by: string | null;
  inspection_date: string | null;
}

interface RejectedRecord {
  id: number;
  receivingNo: string;
  supplier: string;
  product: string;
  deliveredQty: number;
  rejectedQty: number;
  unit: string;
  reason: string;
  inspectionResult: unknown;
  inspector: string;
  inspectionDate: string;
}

const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

const oneCalendarMonthAgo = (now: Date): Date => {
  const cutoff = new Date(now);
  const targetDay = cutoff.getDate();
  cutoff.setDate(1);
  cutoff.setMonth(cutoff.getMonth() - 1);
  const lastDayOfTargetMonth = new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate();
  cutoff.setDate(Math.min(targetDay, lastDayOfTargetMonth));
  return cutoff;
};

const escapeCsv = (value: string | number): string => `"${String(value).replace(/"/g, '""')}"`;

const escapeHtml = (value: string | number): string => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const ResultBadge: React.FC<{ result: unknown }> = ({ result }) => {
  const normalized = normalizeInspectionStatus(result);
  const label = normalized ?? formatStatusLabel(result);
  const classes = normalized === 'Rejected'
    ? 'text-red-400 bg-red-500/10 border-red-500/20'
    : normalized === 'Partial'
      ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
      : 'text-slate-300 bg-slate-500/10 border-slate-500/20';

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${classes}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
};

const RejectedItems: React.FC = () => {
  const [records, setRecords] = useState<RejectedRecord[]>([]);
  const [supplier, setSupplier] = useState('All suppliers');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const itemsPerPage = 10;

  const fetchRejectedItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<{ data: RejectedItemApi[] }>('/qa/rejected-items');
      setRecords((response.data.data ?? []).map((item) => ({
        id: item.id,
        receivingNo: item.receiving_no ?? '-',
        supplier: item.supplier ?? '-',
        product: item.product ?? '-',
        deliveredQty: item.delivered_qty ?? 0,
        rejectedQty: item.rejected_qty,
        unit: item.unit ?? '-',
        reason: item.reason?.trim() || '-',
        inspectionResult: item.inspection_result,
        inspector: item.submitted_by ?? item.inspected_by ?? '-',
        inspectionDate: item.inspection_date ?? '',
      })));
    } catch {
      setRecords([]);
      setError('Unable to load rejected items. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRejectedItems();
  }, [fetchRejectedItems]);

  const visibleRecords = useMemo(() => {
    const now = new Date();
    const cutoff = oneCalendarMonthAgo(now);

    return records.filter((item) => {
      const inspectionDate = new Date(item.inspectionDate);
      return !Number.isNaN(inspectionDate.getTime()) && inspectionDate >= cutoff && inspectionDate <= now;
    });
  }, [records]);
  const supplierOptions = useMemo(
    () => ['All suppliers', ...Array.from(new Set(visibleRecords.map((item) => item.supplier))).sort()],
    [visibleRecords]
  );
  const filteredData = useMemo(() => {
    const term = search.trim().toLowerCase();
    return visibleRecords.filter((item) => {
      const matchesSearch = !term || [item.product, item.supplier, item.receivingNo, item.reason, item.inspector]
        .some((value) => value.toLowerCase().includes(term));
      return matchesSearch && (supplier === 'All suppliers' || item.supplier === supplier);
    });
  }, [search, supplier, visibleRecords]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, supplier]);

  const totalRejectedQuantity = visibleRecords.reduce((sum, item) => sum + item.rejectedQty, 0);
  const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredData.length);
  const currentItems = filteredData.slice(startIndex, endIndex);

  const exportCsv = () => {
    const headers = ['Receiving No.', 'Inspection Date', 'Supplier', 'Product', 'Delivered Qty', 'Rejected Qty', 'Unit', 'Inspection Result', 'Reason', 'Inspector'];
    const rows = filteredData.map((item) => [
      item.receivingNo,
      formatDate(item.inspectionDate),
      item.supplier,
      item.product,
      item.deliveredQty,
      item.rejectedQty,
      item.unit,
      formatStatusLabel(item.inspectionResult),
      item.reason,
      item.inspector,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `qa-rejected-items-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('The print window was blocked. Allow pop-ups and try again.');
      return;
    }
    printWindow.opener = null;
    const rows = filteredData.map((item) => `
      <tr>
        <td>${escapeHtml(item.receivingNo)}</td><td>${escapeHtml(formatDate(item.inspectionDate))}</td>
        <td>${escapeHtml(item.supplier)}</td><td>${escapeHtml(item.product)}</td>
        <td>${escapeHtml(item.rejectedQty)}</td><td>${escapeHtml(item.unit)}</td>
        <td>${escapeHtml(item.reason)}</td><td>${escapeHtml(item.inspector)}</td>
      </tr>`).join('');
    printWindow.document.write(`<!doctype html><html><head><title>QA Rejected Items</title><style>body{font-family:Arial,sans-serif;color:#111;padding:24px}h1{font-size:20px;margin-bottom:4px}p{margin-top:0;color:#555}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#eee}@media print{body{padding:0}}</style></head><body><h1>QA Rejected Items Report</h1><p>Generated ${escapeHtml(new Date().toLocaleString())}</p><table><thead><tr><th>Receiving No.</th><th>Inspection Date</th><th>Supplier</th><th>Product</th><th>Rejected Qty</th><th>Unit</th><th>Reason</th><th>Inspector</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white">Rejected Items</h1>
          <p className="text-sm text-slate-400">Rejected quantities recorded during completed QA inspections.</p>
        </div>
        <div className="ml-auto flex w-full shrink-0 items-center justify-end gap-3 sm:w-auto">
          <button onClick={exportCsv} disabled={filteredData.length === 0} className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"><Download className="w-4 h-4" /> Export CSV</button>
          <button onClick={printReport} disabled={filteredData.length === 0} className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition-all hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"><Printer className="w-4 h-4" /> Print</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 flex items-start justify-between"><div><p className="text-xs font-medium uppercase tracking-wider text-slate-400">Rejected Records</p><p className="text-2xl font-bold text-white mt-1.5">{visibleRecords.length}</p><p className="text-xs text-slate-500 mt-1">Most recent month</p></div><div className="p-2.5 rounded-full bg-red-500/10 text-red-400"><Ban className="w-6 h-6" /></div></div>
        <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 flex items-start justify-between"><div><p className="text-xs font-medium uppercase tracking-wider text-slate-400">Rejected Quantity</p><p className="text-2xl font-bold text-white mt-1.5">{totalRejectedQuantity.toLocaleString()}</p><p className="text-xs text-slate-500 mt-1">Within the visible month</p></div><div className="p-2.5 rounded-full bg-amber-500/10 text-amber-400"><AlertCircle className="w-6 h-6" /></div></div>
      </div>

      <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="block text-xs font-medium text-slate-400 mb-1.5">Supplier</label><select value={supplier} onChange={(event) => setSupplier(event.target.value)} className="w-full bg-[#090d16] border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 appearance-none">{supplierOptions.map((option) => <option key={option}>{option}</option>)}</select></div>
        <div><label className="block text-xs font-medium text-slate-400 mb-1.5">Search</label><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receiving, supplier, product, reason..." className="w-full bg-[#090d16] border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500" /></div></div>
      </div>

      {error && <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-sm text-rose-300 flex items-center justify-between gap-3"><span>{error}</span><button onClick={fetchRejectedItems} className="px-3 py-1.5 rounded-lg border border-rose-400/30 hover:bg-rose-500/10 flex items-center gap-1.5"><RefreshCw className="w-4 h-4" /> Retry</button></div>}

      <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="w-full overflow-x-auto"><table className="w-full min-w-[1000px]"><thead className="bg-[#090d16] border-b border-gray-800/50"><tr>{['Receiving No.', 'Inspection Date', 'Supplier', 'Product', 'Delivered Qty', 'Rejected Qty', 'Unit', 'Reason', 'Result'].map((heading) => <th key={heading} className={`px-4 py-3.5 text-xs font-medium uppercase tracking-wider text-slate-400 ${heading.includes('Qty') ? 'text-right' : 'text-left'}`}>{heading}</th>)}</tr></thead>
          <tbody>{loading ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Loading rejected items...</td></tr> : currentItems.length === 0 ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No rejected records found.</td></tr> : currentItems.map((item) => <tr key={item.id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors"><td className="px-4 py-3.5 text-sm font-medium text-slate-200">{item.receivingNo}</td><td className="px-4 py-3.5 text-sm text-slate-300">{formatDate(item.inspectionDate)}</td><td className="px-4 py-3.5 text-sm text-slate-300">{item.supplier}</td><td className="px-4 py-3.5 text-sm text-slate-200">{item.product}</td><td className="px-4 py-3.5 text-right text-sm text-slate-300">{item.deliveredQty.toLocaleString()}</td><td className="px-4 py-3.5 text-right text-sm font-medium text-red-400">{item.rejectedQty.toLocaleString()}</td><td className="px-4 py-3.5 text-sm text-slate-300">{item.unit}</td><td className="px-4 py-3.5 text-sm text-slate-300">{item.reason}</td><td className="px-4 py-3.5"><ResultBadge result={item.inspectionResult} /></td></tr>)}</tbody></table></div>
        <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-gray-800/50 bg-[#090d16]/50"><div className="text-sm text-slate-400">Showing {filteredData.length > 0 ? startIndex + 1 : 0} to {endIndex} of {filteredData.length} records</div><div className="flex items-center gap-3 mt-2 sm:mt-0"><button disabled={safePage === 1} onClick={() => setCurrentPage(Math.max(1, safePage - 1))} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-700 text-slate-300 hover:bg-gray-800/50 disabled:opacity-50 disabled:cursor-not-allowed">Previous</button><span className="text-sm text-slate-400">Page {safePage} / {totalPages}</span><button disabled={safePage === totalPages} onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-700 text-slate-300 hover:bg-gray-800/50 disabled:opacity-50 disabled:cursor-not-allowed">Next</button></div></div>
      </div>
    </div>
  );
};

export default RejectedItems;
