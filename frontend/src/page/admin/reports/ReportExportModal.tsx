import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import ReportFilterFields, { fieldClass, labelClass } from './ReportFilterFields';
import {
  applicableFilters, downloadReport, errorMessage, FORMAT_LABELS,
  type ReportDefinition, type ReportFilterValues, type ReportFormat, type ReportOptions,
} from './reportApi';

export type ExportMode = 'STANDARD' | 'RAW' | 'CUSTOM';

const TITLES: Record<ExportMode, { title: string; hint: string; action: string }> = {
  STANDARD: { title: 'Export Data', hint: 'Export a predefined report with the filters it supports.', action: 'Export' },
  RAW: { title: 'Export Raw Data', hint: 'Row-level exports use the same safe, predefined report columns — never raw tables or protected fields.', action: 'Export' },
  CUSTOM: { title: 'Create Custom Report', hint: 'Combine a predefined report with your own filters and title. Columns and data sources stay fixed.', action: 'Generate & Download' },
};

interface Props {
  mode: ExportMode;
  definitions: ReportDefinition[];
  categories: Array<{ id: string; label: string }>;
  options: ReportOptions | null;
  initialCategory: string;
  initialReportKey?: string;
  onClose: () => void;
  onGenerated: (message: string | null) => void;
}

const ReportExportModal: React.FC<Props> = ({ mode, definitions, categories, options, initialCategory, initialReportKey, onClose, onGenerated }) => {
  const available = useMemo(() => definitions.filter((definition) => definition.available), [definitions]);
  const startCategory = available.some((definition) => definition.category === initialCategory) ? initialCategory : (available[0]?.category ?? '');
  const [category, setCategory] = useState(startCategory);
  const inCategory = available.filter((definition) => definition.category === category);
  const [reportKey, setReportKey] = useState(initialReportKey && available.some((definition) => definition.key === initialReportKey) ? initialReportKey : (inCategory[0]?.key ?? ''));
  const definition = available.find((item) => item.key === reportKey) ?? null;
  const [format, setFormat] = useState<ReportFormat>('CSV');
  const [filters, setFilters] = useState<ReportFilterValues>({});
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateInvalid = Boolean(filters.date_from && filters.date_to && filters.date_to < filters.date_from);
  const titleInvalid = mode === 'CUSTOM' && title.trim() !== '' && !/^[A-Za-z0-9 ,.()_-]+$/.test(title.trim());

  useEffect(() => {
    if (definition && !definition.formats.includes(format)) setFormat(definition.formats[0] ?? 'CSV');
  }, [definition, format]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const changeCategory = (next: string) => {
    setCategory(next);
    setReportKey(available.find((item) => item.category === next)?.key ?? '');
    setFilters({});
  };

  const submit = async () => {
    if (!definition) return;
    if (mode === 'CUSTOM' && !title.trim()) { setError('Enter a report title.'); return; }
    if (dateInvalid || titleInvalid) return;
    setBusy(true);
    setError(null);
    try {
      const result = await downloadReport({
        report_key: definition.key, format, source: mode,
        ...(mode === 'CUSTOM' ? { title: title.trim() } : {}),
        ...applicableFilters(definition, filters),
      });
      onGenerated(`${result.filename} downloaded${Number.isFinite(result.rows) ? ` (${result.rows.toLocaleString()} records)` : ''}.`);
      onClose();
    } catch (requestError) {
      setError(await errorMessage(requestError, 'Unable to export report data.'));
      onGenerated(null);
    } finally {
      setBusy(false);
    }
  };

  const copy = TITLES[mode];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="report-export-title">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700/80 bg-white shadow-2xl dark:bg-[#0b101d]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800/60 p-4 sm:p-5">
          <div>
            <h2 id="report-export-title" className="text-[15px] font-semibold text-slate-900 dark:text-white sm:text-lg">{copy.title}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{copy.hint}</p>
          </div>
          <button onClick={onClose} disabled={busy} aria-label={`Close ${copy.title}`} className="min-h-11 min-w-11 shrink-0 cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
            <X className="mx-auto h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          {available.length === 0 && <p className="text-sm text-slate-400">No reports are currently available for export.</p>}
          {mode === 'CUSTOM' && (
            <div>
              <label htmlFor="custom-title" className={labelClass}>Report title</label>
              <input id="custom-title" type="text" maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. September Low Stock Review" aria-invalid={titleInvalid} className={fieldClass} />
              {titleInvalid && <p role="alert" className="mt-1 text-xs text-red-500">Use letters, numbers, spaces and , . ( ) _ - only.</p>}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="export-category" className={labelClass}>Category</label>
              <select id="export-category" value={category} onChange={(event) => changeCategory(event.target.value)} className={fieldClass}>
                {categories.filter((item) => available.some((definition) => definition.category === item.id)).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="export-report" className={labelClass}>Report</label>
              <select id="export-report" value={reportKey} onChange={(event) => { setReportKey(event.target.value); setFilters({}); }} className={fieldClass}>
                {inCategory.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
              </select>
            </div>
          </div>

          {definition && (
            <>
              <p className="text-xs leading-5 text-slate-500">{definition.description}</p>
              <fieldset>
                <legend className={labelClass}>Format</legend>
                <div className="flex flex-wrap gap-2">
                  {definition.formats.map((item) => (
                    <label key={item} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs sm:text-sm ${format === item ? 'border-cyan-500/60 bg-cyan-500/10 text-slate-900 dark:text-cyan-300' : 'border-slate-800 text-slate-300'}`}>
                      <input type="radio" name="export-format" value={item} checked={format === item} onChange={() => setFormat(item)} className="accent-cyan-500" />
                      {FORMAT_LABELS[item]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <ReportFilterFields definition={definition} values={filters} onChange={setFilters} options={options} idPrefix="export" />
            </>
          )}
          {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300 sm:text-sm">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-800/60 p-4 sm:p-5">
          <button onClick={onClose} disabled={busy} className="min-h-11 cursor-pointer rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50 sm:text-sm">Cancel</button>
          <button onClick={() => void submit()} disabled={busy || !definition || dateInvalid || titleInvalid}
            className="min-h-11 cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 sm:text-sm">
            {busy ? 'Generating…' : `${copy.action} ${FORMAT_LABELS[format]}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportExportModal;
