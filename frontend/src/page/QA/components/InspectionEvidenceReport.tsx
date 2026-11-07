import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Eye, Search, X } from 'lucide-react';
import { EvidenceGallery } from './EvidenceGallery';
import { paginateInspectionEvidence, type EvidenceFilters, type InspectionEvidence } from '../inspectionEvidence';

const control = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const action = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-cyan-700 transition-colors hover:bg-cyan-50 focus-visible:outline-2 focus-visible:outline-cyan-500 dark:text-cyan-300 dark:hover:bg-cyan-500/10';
const dateLabel = (value: string) => new Date(value).toLocaleString();

function EvidenceModal({ inspection, onClose }: { inspection: InspectionEvidence; onClose: () => void }) {
  const heading = useId();
  const content = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      const nested = content.current?.querySelector<HTMLElement>('[role="dialog"]');
      if (event.key === 'Escape' && !nested) { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const scope = nested ?? content.current;
      const buttons = scope?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, [tabindex="0"]');
      if (!buttons?.length) return;
      const first = buttons[0]; const last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || !scope?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !scope?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keydown); trigger?.focus(); };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 sm:p-6" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={content} role="dialog" aria-modal="true" aria-labelledby={heading} className="max-h-[90dvh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 dark:border-slate-700 dark:bg-[#0d1322] dark:text-slate-100 sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><h2 id={heading} className="text-lg font-semibold">Inspection Evidence</h2><p className="text-sm text-slate-600 dark:text-slate-400">{inspection.receiving_no} · Cycle {inspection.cycle_number} · Inspection #{inspection.inspection_id}</p></div><button ref={close} type="button" onClick={onClose} aria-label="Close inspection evidence" className={action}><X className="h-5 w-5" /></button></div>
        <dl className="my-4 grid grid-cols-1 gap-x-6 gap-y-3 border-y border-slate-200 py-4 text-sm dark:border-slate-700 sm:grid-cols-2">
          {Object.entries({ 'Receiving No.': inspection.receiving_no, 'Purchase Order': inspection.purchase_order || '—', Supplier: inspection.supplier, 'Inspection Date': dateLabel(inspection.completed_at), 'Inspection Result': inspection.status, 'QA Supervisor': inspection.inspected_by || 'Not recorded', 'Inspection Cycle': inspection.cycle_number, 'Evidence Files': inspection.attachments.length }).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-slate-600 dark:text-slate-400">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}
        </dl>
        <EvidenceGallery attachments={inspection.attachments} receivingId={inspection.receiving_id} showDownload showMetadata title="Inspection evidence files" description="Private QA evidence for this inspection cycle." emptyMessage="No inspection evidence was attached to this inspection." />
      </div>
    </div>, document.body);
}

export default function InspectionEvidenceReport({ inspections, filters, onFiltersChange }: { inspections: InspectionEvidence[]; filters: EvidenceFilters; onFiltersChange: (filters: EvidenceFilters) => void }) {
  const [requestedPage, setPage] = useState(1);
  const [selected, setSelected] = useState<InspectionEvidence | null>(null);
  const { page, pageCount, rows } = paginateInspectionEvidence(inspections, requestedPage);
  const update = (next: EvidenceFilters) => { setPage(1); onFiltersChange(next); };
  const view = (inspection: InspectionEvidence) => <button type="button" onClick={() => setSelected(inspection)} className={action} aria-label={`View evidence for ${inspection.receiving_no}, cycle ${inspection.cycle_number}, inspection ${inspection.inspection_id}`}><Eye className="h-4 w-4" />View Evidence</button>;
  const closeModal = useRef(() => setSelected(null)).current;
  return <section aria-labelledby="inspection-evidence-report-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-800/50 dark:bg-[#0d1322] sm:p-5">
    <h2 id="inspection-evidence-report-title" className="text-lg font-semibold">Inspection Evidence Report</h2>
    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Completed inspections by cycle. Uses the report period above; exports include all matching rows.</p>
    <div className="my-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
      <label className="min-w-0 text-xs font-medium"><span className="mb-1.5 block">Search inspections</span><span className="relative block"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" /><input type="search" placeholder="Receiving, PO or supplier" value={filters.search} onChange={(event) => update({ ...filters, search: event.target.value })} className={`${control} w-full pl-9`} /></span></label>
      <label className="text-xs font-medium"><span className="mb-1.5 block">Inspection result</span><select value={filters.status} onChange={(event) => update({ ...filters, status: event.target.value })} className={`${control} w-full cursor-pointer`}><option value="">All Results</option>{['Passed', 'Partial', 'Rejected'].map((status) => <option key={status}>{status}</option>)}</select></label>
      <label className="text-xs font-medium"><span className="mb-1.5 block">Evidence availability</span><select value={filters.availability} onChange={(event) => update({ ...filters, availability: event.target.value as EvidenceFilters['availability'] })} className={`${control} w-full cursor-pointer`}><option value="with-evidence">With Evidence</option><option value="all">All Inspections</option></select></label>
    </div>
    {rows.length === 0 ? <p role="status" className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-400">{filters.availability === 'with-evidence' ? 'No inspection evidence matches these filters. Choose All Inspections to include records without evidence.' : 'No completed inspections match these filters.'}</p> : <>
      <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><caption className="sr-only">Inspection evidence for the selected report period</caption><thead><tr>{['Receiving No.', 'Purchase Order', 'Supplier', 'Inspection Date', 'Inspection Result', 'Evidence Count', 'Actions'].map((heading) => <th scope="col" key={heading} className="whitespace-nowrap border-b border-slate-200 px-3 py-3 text-xs font-semibold dark:border-slate-700">{heading}</th>)}</tr></thead><tbody>{rows.map((inspection) => <tr key={inspection.inspection_id} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"><td className="px-3 py-2 font-medium">{inspection.receiving_no}<span className="block text-xs font-normal text-slate-600 dark:text-slate-400">Cycle {inspection.cycle_number} · #{inspection.inspection_id}</span></td><td className="px-3 py-2">{inspection.purchase_order || '—'}</td><td className="max-w-52 break-words px-3 py-2">{inspection.supplier}</td><td className="px-3 py-2">{dateLabel(inspection.completed_at)}</td><td className="px-3 py-2">{inspection.status}</td><td className="px-3 py-2 tabular-nums">{inspection.attachments.length} files</td><td className="whitespace-nowrap px-3 py-2">{view(inspection)}</td></tr>)}</tbody></table></div>
      <div className="divide-y divide-slate-200 dark:divide-slate-800 md:hidden">{rows.map((inspection) => <article key={inspection.inspection_id} className="py-3"><div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-semibold">{inspection.receiving_no} · Cycle {inspection.cycle_number}</h3><span className="text-sm">{inspection.status}</span></div><p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-400">{inspection.purchase_order || 'No PO reference'} · {inspection.supplier}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{dateLabel(inspection.completed_at)} · {inspection.attachments.length} files</p>{view(inspection)}</article>)}</div>
    </>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><p role="status" className="text-slate-600 dark:text-slate-400">{inspections.length ? `${(page - 1) * 8 + 1}–${Math.min(page * 8, inspections.length)} of ${inspections.length} inspections` : '0 inspections'}</p><nav aria-label="Inspection evidence pagination" className="flex items-center gap-2"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Previous evidence page" className={`${action} disabled:cursor-not-allowed disabled:opacity-40`}><ChevronLeft className="h-4 w-4" />Previous</button><span aria-current="page">{page} / {pageCount}</span><button type="button" disabled={page === pageCount} onClick={() => setPage(page + 1)} aria-label="Next evidence page" className={`${action} disabled:cursor-not-allowed disabled:opacity-40`}>Next<ChevronRight className="h-4 w-4" /></button></nav></div>
    {selected && <EvidenceModal key={selected.inspection_id} inspection={selected} onClose={closeModal} />}
  </section>;
}
