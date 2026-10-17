import { CheckCircle2, LoaderCircle } from 'lucide-react';
import type { ProductionStatus } from './productionApi';
import { STATUS_LABELS } from './productionPresentation';
import { PAGE_CONTENT_CLASS } from '../../components/layout/pageLayout';

export const pageClass = `${PAGE_CONTENT_CLASS} space-y-5 text-slate-900 dark:text-slate-100`;
export const panelClass = 'min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0d1322] sm:p-6';
export const inputClass = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-cyan-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:text-sm';
export const primaryClass = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-sky-800 px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
export const secondaryClass = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-medium transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800';

export function ProductionStatusBadge({ status }: { status: ProductionStatus }) {
  const tone = status === 'CANCELLED' ? 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
    : status === 'STOCKED_IN' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
      : status === 'PENDING_QA' || status === 'QA_COMPLETED' ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>{STATUS_LABELS[status] ?? status}</span>;
}
export function ProductionError({ message }: { message: string }) {
  return message ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{message}</p> : null;
}
export function ProductionNotice({ message }: { message: string }) {
  return message ? <p role="status" className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true"/>{message}</p> : null;
}
export function ProductionLoading({ message = 'Loading production…' }: { message?: string }) {
  return <p role="status" className="flex min-h-24 items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400"><LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true"/>{message}</p>;
}
