import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Download, Filter, RefreshCw, X } from 'lucide-react';
import { apiClient } from '../../../lib/api';
import ReportFilterFields from './ReportFilterFields';
import ReportTable from './ReportTable';
import {
  applicableFilters, downloadReport, errorMessage, FORMAT_LABELS, formatDateTime,
  type ReportDefinition, type ReportFilterValues, type ReportFormat, type ReportOptions, type ReportPreview,
} from './reportApi';

interface Props {
  definition: ReportDefinition;
  options: ReportOptions | null;
  onClose: () => void;
  /** Called after every export attempt so history refreshes; null means failure (shown inline). */
  onGenerated: (message: string | null) => void;
}

const PER_PAGE = 25;

const ReportPreviewDrawer: React.FC<Props> = ({ definition, options, onClose, onGenerated }) => {
  const [draft, setDraft] = useState<ReportFilterValues>({});
  const [applied, setApplied] = useState<ReportFilterValues>({});
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<ReportFormat | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const dateInvalid = Boolean(draft.date_from && draft.date_to && draft.date_to < draft.date_from);

  const load = useCallback(async (filters: ReportFilterValues, targetPage: number, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<ReportPreview>('/admin/reports/preview', {
        params: { report_key: definition.key, page: targetPage, per_page: PER_PAGE, ...applicableFilters(definition, filters) },
        signal,
      });
      setPreview(data);
    } catch (requestError: any) {
      if (requestError?.code !== 'ERR_CANCELED') setError(await errorMessage(requestError, 'Unable to load the report preview.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [definition]);

  useEffect(() => {
    const controller = new AbortController();
    void load(applied, page, controller.signal);
    return () => controller.abort();
  }, [applied, page, load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const applyFilters = () => {
    if (dateInvalid) return;
    setPage(1);
    setApplied({ ...draft });
  };

  const resetFilters = () => {
    setDraft({});
    setPage(1);
    setApplied({});
  };

  const exportAs = async (format: ReportFormat) => {
    setExporting(format);
    setError(null);
    try {
      const result = await downloadReport({ report_key: definition.key, format, ...applicableFilters(definition, applied) });
      onGenerated(`${result.filename} downloaded${Number.isFinite(result.rows) ? ` (${result.rows.toLocaleString()} records)` : ''}.`);
    } catch (requestError) {
      setError(await errorMessage(requestError, 'Unable to export this report.'));
      onGenerated(null);
    } finally {
      setExporting(null);
    }
  };

  const columns = preview?.report.columns ?? definition.columns;
  const hasFilters = definition.filters.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-labelledby="report-preview-title">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto flex h-full w-full min-w-0 max-w-5xl flex-col overflow-hidden border-l border-slate-700/80 bg-[#0b101d] shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800/60 p-4 sm:p-5">
          <div className="min-w-0">
            <h2 id="report-preview-title" className="truncate text-[15px] font-semibold text-white sm:text-lg">{definition.name}</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {definition.category_label} · Generated {preview ? formatDateTime(preview.generated_at) : '…'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close report preview" className="min-h-11 min-w-11 shrink-0 cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
            <X className="mx-auto h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <p className="text-xs leading-5 text-slate-400">{definition.description}</p>

          {hasFilters && (
            <div className="rounded-xl border border-slate-800/80 bg-[#070a12] p-3 sm:p-4">
              <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 rounded-lg">
                <span className="inline-flex items-center gap-2"><Filter className="h-3.5 w-3.5 text-cyan-400" />Filters</span>
                <ChevronRight className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-90' : ''}`} />
              </button>
              {filtersOpen && (
                <div className="mt-3 space-y-3">
                  <ReportFilterFields definition={definition} values={draft} onChange={setDraft} options={options} idPrefix="preview" />
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={resetFilters} className="min-h-11 cursor-pointer rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 sm:text-sm">Reset</button>
                    <button type="button" onClick={applyFilters} disabled={dateInvalid || loading} className="min-h-11 cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 sm:text-sm">Apply filters</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400" aria-live="polite">
            <span className="font-medium text-slate-300">Filters applied:</span>
            {(preview?.filters_applied.length ?? 0) === 0
              ? <span>None — all records</span>
              : preview?.filters_applied.map((filter) => <span key={filter} className="whitespace-nowrap rounded-full border border-slate-700 px-2 py-0.5">{filter}</span>)}
          </div>

          {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300 sm:text-sm">{error}</p>}

          <ReportTable columns={columns} rows={preview?.rows ?? []} loading={loading} caption={definition.name} />

          <div className="flex flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {preview && preview.total > 0
                ? `Showing ${((preview.page - 1) * preview.per_page + 1).toLocaleString()}–${Math.min(preview.page * preview.per_page, preview.total).toLocaleString()} of ${preview.total.toLocaleString()} records`
                : 'No records'}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((current) => current - 1)} disabled={loading || page <= 1} aria-label="Previous page" className="min-h-9 min-w-9 cursor-pointer rounded-lg border border-slate-700 p-1.5 text-slate-400 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
                <ChevronRight className="mx-auto h-4 w-4 rotate-180" />
              </button>
              <span className="px-2 tabular-nums">Page {preview?.page ?? page} of {preview?.last_page ?? 1}</span>
              <button onClick={() => setPage((current) => current + 1)} disabled={loading || !preview || page >= preview.last_page} aria-label="Next page" className="min-h-9 min-w-9 cursor-pointer rounded-lg border border-slate-700 p-1.5 text-slate-400 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
                <ChevronRight className="mx-auto h-4 w-4" />
              </button>
              <button onClick={() => void load(applied, page)} disabled={loading} aria-label="Refresh preview" title="Refresh preview" className="ml-1 min-h-9 min-w-9 cursor-pointer rounded-lg border border-slate-700 p-1.5 text-slate-400 transition-colors hover:bg-slate-800 disabled:opacity-40">
                <RefreshCw className={`mx-auto h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-800/60 p-4 sm:p-5">
          <span className="mr-auto text-xs text-slate-500">Export uses the filters applied above.</span>
          {definition.formats.map((format) => (
            <button key={format} onClick={() => void exportAs(format)} disabled={exporting !== null || loading}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 sm:text-sm">
              <Download className="h-3.5 w-3.5" />
              {exporting === format ? 'Generating…' : `Download ${FORMAT_LABELS[format]}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ReportPreviewDrawer;
