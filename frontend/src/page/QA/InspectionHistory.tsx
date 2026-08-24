import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calendar, CheckCircle2, User, XCircle } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { formatStatusLabel, normalizeInspectionStatus } from './inspectionStatus';

type DecisionStatus = 'Passed' | 'Partial' | 'Rejected';

interface InspectionHistoryApi {
  id: number;
  receiving_no: string;
  supplier: string;
  product: string | null;
  accepted_qty: number;
  rejected_qty: number;
  inspection_result: unknown;
  remarks: string | null;
  inspected_by: string | null;
  submitted_by: string | null;
  completed_at: string | null;
}

interface InspectionRecord {
  id: string;
  product: string;
  supplier: string;
  inspector: string;
  completedAt: string;
  passed: number;
  rejected: number;
  receivingNo: string;
  status: unknown;
  normalizedStatus: DecisionStatus | null;
  remarks: string;
}

const timeFilters = ['Today', 'This Week', 'This Month'] as const;
const statusOptions: Array<'All decisions' | DecisionStatus> = ['All decisions', 'Passed', 'Partial', 'Rejected'];

const StatusBadge: React.FC<{ status: unknown }> = ({ status }) => {
  const config: Record<DecisionStatus, { color: string; bg: string; icon: React.ReactNode }> = {
    Passed: {
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    Partial: {
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      icon: <AlertCircle className="w-3.5 h-3.5" />,
    },
    Rejected: {
      color: 'text-red-400',
      bg: 'bg-red-500/10 border-red-500/20',
      icon: <XCircle className="w-3.5 h-3.5" />,
    },
  };
  const normalizedStatus = normalizeInspectionStatus(status);
  const badgeConfig = normalizedStatus && normalizedStatus in config
    ? config[normalizedStatus as DecisionStatus]
    : {
        color: 'text-slate-300',
        bg: 'bg-slate-500/10 border-slate-500/20',
        icon: <AlertCircle className="w-3.5 h-3.5" />,
      };
  const label = normalizedStatus && normalizedStatus in config
    ? normalizedStatus
    : formatStatusLabel(status);

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${badgeConfig.color} ${badgeConfig.bg}`}>
      {badgeConfig.icon}
      {label}
    </span>
  );
};

const isWithinTimeFilter = (dateString: string, filter: typeof timeFilters[number]): boolean => {
  const completedAt = new Date(dateString);
  if (Number.isNaN(completedAt.getTime())) return false;

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (filter === 'This Week') {
    start.setDate(start.getDate() - start.getDay());
  } else if (filter === 'This Month') {
    start.setDate(1);
  }

  return completedAt >= start && completedAt <= now;
};

const InspectionHistory: React.FC = () => {
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [activeTimeFilter, setActiveTimeFilter] = useState<typeof timeFilters[number]>('This Week');
  const [supplier, setSupplier] = useState('All suppliers');
  const [product, setProduct] = useState('All products');
  const [status, setStatus] = useState<'All decisions' | DecisionStatus>('All decisions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<{ data: InspectionHistoryApi[] }>('/qa/inspection-history');
      const history = (response.data.data ?? []).map((item) => {
        const normalizedStatus = normalizeInspectionStatus(item.inspection_result);
        const decisionStatus = normalizedStatus && ['Passed', 'Partial', 'Rejected'].includes(normalizedStatus)
          ? normalizedStatus as DecisionStatus
          : null;

        return {
          id: String(item.id),
          product: item.product ?? '-',
          supplier: item.supplier,
          inspector: item.submitted_by ?? item.inspected_by ?? '-',
          completedAt: item.completed_at ?? '',
          passed: item.accepted_qty,
          rejected: item.rejected_qty,
          receivingNo: item.receiving_no,
          status: item.inspection_result,
          normalizedStatus: decisionStatus,
          remarks: item.remarks?.trim() || '-',
        };
      });

      setRecords(history.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)));
    } catch {
      setError('Unable to load inspection history. Please try again.');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const supplierOptions = useMemo(
    () => ['All suppliers', ...Array.from(new Set(records.map((item) => item.supplier))).sort()],
    [records]
  );
  const productOptions = useMemo(
    () => ['All products', ...Array.from(new Set(records.map((item) => item.product))).sort()],
    [records]
  );
  const filteredData = useMemo(() => records.filter((item) =>
    (supplier === 'All suppliers' || item.supplier === supplier) &&
    (product === 'All products' || item.product === product) &&
    (status === 'All decisions' || item.normalizedStatus === status) &&
    isWithinTimeFilter(item.completedAt, activeTimeFilter)
  ), [activeTimeFilter, product, records, status, supplier]);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6 bg-[#090d16] text-slate-100 min-h-screen">
      <div>
        <h1 className="text-2xl font-bold text-white">Inspection History</h1>
        <p className="text-sm text-slate-400">Full audit trail of quality decisions made on received deliveries.</p>
      </div>

      <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {timeFilters.map((label) => (
            <button key={label} onClick={() => setActiveTimeFilter(label)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTimeFilter === label ? 'bg-cyan-500 text-black' : 'bg-transparent border border-gray-700 text-slate-400 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[
            { label: 'Supplier', value: supplier, setValue: setSupplier, options: supplierOptions },
            { label: 'Product', value: product, setValue: setProduct, options: productOptions },
          ].map((filter) => (
            <div key={filter.label}>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">{filter.label}</label>
              <select value={filter.value} onChange={(event) => filter.setValue(event.target.value)} className="w-full bg-[#090d16] border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 appearance-none">
                {filter.options.map((option) => <option key={option}>{option}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Status</label>
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="w-full bg-[#090d16] border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 appearance-none">
              {statusOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-sm text-rose-300 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={fetchHistory} className="px-3 py-1.5 rounded-lg border border-rose-400/30 hover:bg-rose-500/10">Retry</button>
        </div>
      )}

      <div className="space-y-6">
        {loading ? (
          <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-8 text-center text-slate-400">Loading inspection history...</div>
        ) : filteredData.length === 0 ? (
          <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-8 text-center text-slate-400">No inspection records found.</div>
        ) : filteredData.map((record, index) => {
          const dotColor = record.normalizedStatus === 'Passed' ? 'bg-emerald-500' : record.normalizedStatus === 'Partial' ? 'bg-blue-500' : record.normalizedStatus === 'Rejected' ? 'bg-red-500' : 'bg-slate-500';
          const dotBorder = record.normalizedStatus === 'Passed' ? 'border-emerald-500' : record.normalizedStatus === 'Partial' ? 'border-blue-500' : record.normalizedStatus === 'Rejected' ? 'border-red-500' : 'border-slate-500';
          return (
            <div key={record.id} className="relative pl-6">
              {index < filteredData.length - 1 && <div className="absolute left-1.5 top-7 bottom-0 w-0.5 bg-gray-800" />}
              <div className={`absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 ${dotBorder} ${dotColor} ring-2 ring-gray-800/80`} />
              <div className="bg-[#0d1322] border border-gray-800/50 rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div><h3 className="text-lg font-semibold text-white">{record.product}</h3><p className="text-sm text-slate-400">{record.supplier}</p></div>
                  <StatusBadge status={record.status} />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-300">
                  <span className="flex items-center gap-1.5"><User className="w-4 h-4 text-slate-500" />{record.inspector}</span>
                  <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-slate-500" />{record.completedAt ? new Date(record.completedAt).toLocaleString() : '-'}</span>
                  <span>Accepted <span className="text-emerald-400 font-medium">{record.passed.toLocaleString()}</span> / Rejected <span className="text-red-400 font-medium">{record.rejected.toLocaleString()}</span></span>
                  <span className="text-slate-500 font-mono text-xs">{record.receivingNo}</span>
                </div>
                <div className="bg-[#090d16] border border-gray-800/60 rounded-xl p-3.5 text-sm text-gray-300">{record.remarks}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default InspectionHistory;
