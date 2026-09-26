import React from 'react';
import type { ReportColumn } from './reportApi';
import { formatDateTime } from './reportApi';

const GREEN = /^(healthy|completed|passed|delivered|success|active|sent|resolved|normal|stock in|yes|approved|po created)$/i;
const RED = /^(out of stock|rejected|failed|send failed|cancelled|full|blocked|inactive|expired)$/i;
const AMBER = /(low stock|partial|pending|warning|awaiting|in progress|in_transit|in transit|on_hold|on hold|sending|draft|replacement)/i;

export const StatusPill: React.FC<{ value: string }> = ({ value }) => {
  const tone = GREEN.test(value)
    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    : RED.test(value)
      ? 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400'
      : AMBER.test(value)
        ? 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400'
        : 'border-slate-500/25 bg-slate-500/10 text-white dark:text-slate-300';
  const label = /^[A-Z_]+$/.test(value) ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : value;

  return <span className={`admin-badge inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium sm:text-[11px] ${tone}`}>{label}</span>;
};

const displayValue = (column: ReportColumn, value: string | number | null): React.ReactNode => {
  if (value === null || value === '') return <span className="text-slate-500">—</span>;
  switch (column.type) {
    case 'datetime': return formatDateTime(String(value));
    case 'percent': return `${value}%`;
    case 'number': return typeof value === 'number' ? value.toLocaleString() : value;
    case 'status': return <StatusPill value={String(value)} />;
    default: return String(value);
  }
};

/** Column widths keep 10+ column reports readable; the container scrolls horizontally instead of squeezing. */
const columnWidth = (column: ReportColumn) => {
  if (column.type === 'number' || column.type === 'percent') return 110;
  if (column.type === 'status') return 140;
  if (column.type === 'datetime') return 170;
  if (column.type === 'date') return 120;
  return /products|details|description|destination|resolution|supplier|product|customer/i.test(column.key) ? 220 : 150;
};

interface Props {
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  loading?: boolean;
  emptyMessage?: string;
  caption: string;
}

const ReportTable: React.FC<Props> = ({ columns, rows, loading = false, emptyMessage = 'No records match the selected filters.', caption }) => {
  const minWidth = columns.reduce((sum, column) => sum + columnWidth(column), 0);

  return (
    <div className="admin-report-preview-scroll w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-slate-800/80" tabIndex={0} role="region" aria-label={`${caption} table, scrolls horizontally`}>
      <table className="admin-report-preview-table w-full table-fixed border-collapse text-left" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <colgroup>{columns.map((column) => <col key={column.key} style={{ width: columnWidth(column) }} />)}</colgroup>
        <thead className="border-b border-slate-800/60 bg-[#070a12]">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={`whitespace-nowrap px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300 sm:text-[11px] ${column.type === 'number' || column.type === 'percent' ? 'text-right' : ''}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/50">
          {loading && <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-xs text-slate-400">Loading report data…</td></tr>}
          {!loading && rows.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-xs text-slate-400">{emptyMessage}</td></tr>}
          {!loading && rows.map((row, index) => (
            <tr key={index} className="transition-colors hover:bg-slate-800/30">
              {columns.map((column) => {
                const raw = row[column.key];
                return (
                  <td key={column.key} title={raw === null || raw === undefined ? undefined : String(raw)}
                    className={`truncate px-3 py-2 text-xs text-slate-200 md:text-[13px] ${column.type === 'number' || column.type === 'percent' ? 'text-right tabular-nums' : ''}`}>
                    {displayValue(column, raw ?? null)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ReportTable;
