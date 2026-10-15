import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight, Download, Printer, LockKeyhole, RefreshCw } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { productionError, useProductionBatch, useProductionOptions } from './productionApi';
import type { ProductionBatchRecord } from './productionApi';
import { batchProgress, dateTime, listQuery, productionLink, STEPS } from './productionPresentation';
import type { ProductionStep } from './productionPresentation';
import { pageClass, panelClass, inputClass, primaryClass, secondaryClass, ProductionError, ProductionLoading, ProductionNotice, ProductionStatusBadge } from './ProductionUi';

import ProductionDialog from './ProductionDialog';
import { ProductionHistory, ProductionMaterials } from './ProductionReadPanels';
import useProductionCountdown from './useProductionCountdown';

function IssueConfirmation({ batch, busy, error, onConfirm, onClose }: { batch: ProductionBatchRecord; busy: boolean; error: string; onConfirm: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} aria-labelledby="issue-confirmation-title" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-black/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
    <h2 id="issue-confirmation-title" className="text-lg font-semibold">Confirm Material Issue</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">This deducts the required materials from {batch.warehouse.name} and moves this batch to In Production.</p>
    <ul className="my-4 space-y-2 text-sm">{batch.materials.map(material => <li key={material.id} className="flex justify-between gap-4"><span className="break-words">{material.product_name}</span><span className="shrink-0 font-semibold tabular-nums">{material.required_quantity_exact} {material.unit}</span></li>)}</ul>
    <ProductionError message={error}/>
    <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={onClose} disabled={busy} className={secondaryClass}>Keep Planned</button><button type="button" onClick={onConfirm} disabled={busy} className={primaryClass}>{busy ? 'Issuing…' : 'Confirm Material Issue'}</button></div>
  </dialog>;
}

function Facts({ items }: { items: Array<[string, string | number]> }) {
  return <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm font-medium leading-6">{value}</dd></div>)}</dl>;
}

export default function PlantManagerProductionDetail() {
  const { batchId } = useParams(), [params, setParams] = useSearchParams(), location = useLocation(), navigate = useNavigate();
  const resource = useProductionBatch(batchId), options = useProductionOptions();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState<string>((location.state as { productionNotice?: string } | null)?.productionNotice ?? '');
  const [excessConfirm, setExcessConfirm] = useState(false), [exporting, setExporting] = useState(false);
  const [issueConfirm, setIssueConfirm] = useState(false), [cancelOpen, setCancelOpen] = useState(false);
  const [produced, setProduced] = useState(''), [qaId, setQaId] = useState('');
  const [cancelReason, setCancelReason] = useState(''), [disposition, setDisposition] = useState(''), [confirmUnused, setConfirmUnused] = useState(false), [confirmCancellation, setConfirmCancellation] = useState(false);
  const busyRef = useRef(false), requestScope = useRef<AbortController | null>(null);
  const batch = resource.data, countdown = useProductionCountdown(batch), query = listQuery(params), readOnly = params.get('mode') !== 'continue';
  const progress = batch ? batchProgress(batch) : null;
  const requestedStep = Number(params.get('step'));
  const step: ProductionStep = progress && Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= progress.unlocked ? requestedStep as ProductionStep : progress?.current ?? 1;
  useEffect(() => {
    const scope = new AbortController(); requestScope.current = scope;
    busyRef.current = false; setBusy(false);
    setError(''); setUncertain(false); setProduced(''); setQaId(''); setCancelOpen(false); setIssueConfirm(false); setExcessConfirm(false);
    return () => scope.abort();
  }, [batchId]);
  useEffect(() => {
    if ((location.state as { productionNotice?: string } | null)?.productionNotice) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [location.pathname, location.search, location.state, navigate]);
  useEffect(() => { if (resource.data) setUncertain(false); }, [resource.data]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); }, [notice]);
  const selectStep = (value: ProductionStep) => {
    if (busy || !progress || value > progress.unlocked) return;
    const next = new URLSearchParams(params); next.set('step', String(value)); setParams(next, { replace: true });
  };
  const mutate = async (action: 'issue' | 'output' | 'stock-in' | 'cancel', payload?: object) => {
    if (!batch || !progress || readOnly || busyRef.current || uncertain || !requestScope.current) return;
    if ((action === 'issue' && !progress.canIssue) || (action === 'output' && (!progress.canOutput || !countdown.ready)) || (action === 'stock-in' && !progress.canStockIn) || (action === 'cancel' && !progress.canCancel)) return;
    const scope = requestScope.current; busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const response = await apiClient.post<{ data: ProductionBatchRecord }>(`/production/batches/${batch.id}/${action}`, payload);
      if (scope.signal.aborted) return;
      resource.accept(response.data.data); setIssueConfirm(false); setCancelOpen(false); setExcessConfirm(false);
      const next = new URLSearchParams(params); next.set('step', String(batchProgress(response.data.data).current)); setParams(next, { replace: true });
      setNotice(action === 'issue' ? 'Materials issued.' : action === 'output' ? 'Output saved and sent to QA.' : action === 'stock-in' ? 'Passed goods stocked in.' : 'Batch cancelled with its material disposition recorded.');
    } catch (cause) {
      if (scope.signal.aborted) return;
      setError(productionError(cause));
      // A lost response may have committed. Read persisted state before permitting any retry.
      if (!(cause as { response?: unknown }).response) {
        setUncertain(true);
        try { const response = await apiClient.get<{ data: ProductionBatchRecord }>(`/production/batches/${batch.id}`); if (!scope.signal.aborted) { resource.accept(response.data.data); setIssueConfirm(false); } }
        catch { /* Keep actions gated until a successful explicit refresh. */ }
      }
    } finally { if (!scope.signal.aborted) { busyRef.current = false; setBusy(false); } }
  };
  const sendOutput = (confirmed = false) => {
    if (!batch || !outputValid || !countdown.ready) return;
    const payload: Record<string, unknown> = { actual_quantity: Number(produced), assigned_qa_user_id: Number(qaId) };
    if (Number(produced) > batch.target_quantity) {
      if (!confirmed) { setError(''); setExcessConfirm(true); return; }
      payload.excess_confirmation = { target_quantity: batch.target_quantity, actual_quantity: Number(produced), confirmed: true };
    }
    void mutate('output', payload);
  };
  const submitOutput = (event: FormEvent) => { event.preventDefault(); sendOutput(); };
  const exportPickList = async (format: 'pdf' | 'html') => {
    if (!batch || exporting) return;
    const printWindow = format === 'html' ? window.open('', '_blank') : null;
    if (format === 'html' && !printWindow) { setError('Allow a print window for this page, then try Print Pick List again.'); return; }
    if (printWindow) { printWindow.opener = null; printWindow.document.title = 'Loading Production Pick List'; printWindow.document.body.textContent = 'Loading pick list…'; }
    setExporting(true); setError('');
    try {
      if (format === 'pdf') {
        const response = await apiClient.get<Blob>(`/production/batches/${batch.id}/pick-list`, { params: { format }, responseType: 'blob' });
        if (!response.data.type.includes('application/pdf')) throw new Error('Invalid PDF response');
        const url = URL.createObjectURL(response.data), link = document.createElement('a');
        link.href = url; link.download = `${batch.batch_number}-pick-list.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const response = await apiClient.get<string>(`/production/batches/${batch.id}/pick-list`, { params: { format }, responseType: 'text' });
        if (printWindow && !printWindow.closed) { printWindow.document.open(); printWindow.document.write(response.data); printWindow.document.close(); printWindow.focus(); printWindow.print(); }
      }
    } catch (cause) { printWindow?.close(); setError(productionError(cause)); }
    finally { setExporting(false); }
  };
  const cancel = (event: FormEvent) => {
    event.preventDefault(); if (!confirmCancellation || !progress?.canCancel) return;
    void mutate('cancel', { reason: cancelReason, material_disposition: disposition || null, confirm_unused_materials: confirmUnused });
  };
  const outputValid = produced !== '' && Number.isInteger(Number(produced)) && Number(produced) >= 1 && Number(produced) <= 1000000 && !!qaId && !!options.data?.qa_assignees.some(user => String(user.id) === qaId);
  const editable = !readOnly && !uncertain;
  const qaName = batch?.assigned_qa_name ?? (batch?.assigned_qa_user_id ? options.data?.qa_assignees.find(user => user.id === batch.assigned_qa_user_id)?.name ?? `QA Supervisor #${batch.assigned_qa_user_id}` : 'Not assigned');
  return <div className={pageClass}>
    <div className="flex flex-wrap justify-between gap-2"><Link to={productionLink('', query)} className={secondaryClass}><ArrowLeft className="h-4 w-4" aria-hidden="true"/>Back to Batches</Link><button type="button" className={secondaryClass} disabled={busy || resource.loading} onClick={() => { resource.reload(); options.reload(); setIssueConfirm(false); }}><RefreshCw className="h-4 w-4" aria-hidden="true"/>Refresh</button></div>
    {resource.loading ? <ProductionLoading message="Loading batch workflow…"/> : resource.error ? <section className={panelClass}><ProductionError message={resource.error}/><button type="button" onClick={resource.reload} className={`${secondaryClass} mt-3`}>Try Again</button></section> : batch && progress && <>
      <header className={panelClass}>
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-600 dark:text-slate-400">Production Batch</p><h1 className="mt-1 break-words font-mono text-xl font-bold">{batch.batch_number}</h1><p className="mt-2 break-words text-base font-semibold">{batch.product_name}</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Target: {batch.target_quantity.toLocaleString()} {batch.unit} · {batch.warehouse.name}</p></div><ProductionStatusBadge status={batch.status}/></div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800"><p className="max-w-3xl text-sm leading-6">{progress.canOutput && countdown.ready ? 'Record actual produced quantity and assign a QA Supervisor.' : progress.next}</p>
          {readOnly && progress.canContinue ? <Link to={productionLink(`/${batch.id}`, query, { mode: 'continue' })} className={primaryClass}>Continue Batch<ChevronRight className="h-4 w-4" aria-hidden="true"/></Link>
            : editable && step !== progress.current && progress.canContinue ? <button type="button" className={primaryClass} disabled={busy} onClick={() => selectStep(progress.current)}>Go to {STEPS[progress.current - 1]}<ChevronRight className="h-4 w-4" aria-hidden="true"/></button>
              : editable && step === 2 && progress.canIssue ? <button type="button" className={primaryClass} disabled={busy} onClick={() => { setError(''); setIssueConfirm(true); }}>Issue Materials to Production</button>
                : editable && step === 3 && progress.canOutput ? <button type="submit" form="production-output-form" className={primaryClass} disabled={busy || !outputValid || !countdown.ready}>{busy ? 'Sending…' : 'Send Output to QA'}</button>
                  : editable && step === 5 && progress.canStockIn ? <button type="button" className={primaryClass} disabled={busy} onClick={() => void mutate('stock-in')}>{busy ? 'Stocking in…' : 'Stock In Passed Goods'}</button> : null}
        </div>
        {readOnly && <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">Read-only review. Opening a batch or step does not change stock.</p>}
      </header>
      <ProductionNotice message={notice}/>
      {uncertain && <ProductionError message="The saved state could not be confirmed. Refresh this batch successfully before trying another action."/>}
      <nav aria-label="Production workflow steps" className="min-w-0 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-[#0d1322]">
        <p className="px-2 py-2 text-sm font-medium sm:sr-only">Step {step} of 5 · {STEPS[step - 1]}</p>
        <ol className="grid gap-1 sm:grid-cols-5">{STEPS.map((label, index) => {
          const value = index + 1 as ProductionStep, available = value <= progress.unlocked, completed = progress.completed(value);
          return <li key={label}><button type="button" disabled={!available || busy} onClick={() => selectStep(value)} aria-current={step === value ? 'step' : undefined} className={`flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:cursor-not-allowed ${step === value ? 'bg-slate-100 font-semibold text-slate-950 dark:bg-slate-800 dark:text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900'} ${!available ? 'opacity-60' : ''}`}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current">{completed ? <Check className="h-3.5 w-3.5" aria-hidden="true"/> : !available ? <LockKeyhole className="h-3 w-3" aria-hidden="true"/> : value}</span><span>{label}<span className="block text-[11px] font-normal">{completed ? 'Recorded' : !available ? 'Not yet available' : progress.current === value ? (progress.cancelled ? 'Cancelled' : 'Current stage') : 'Review'}</span></span></button></li>;
        })}</ol>
      </nav>
      <section className={panelClass} aria-labelledby="production-step-heading">
        <h2 id="production-step-heading" className="mb-4 text-lg font-semibold">{step}. {STEPS[step - 1]}</h2>
        {step === 1 && <div className="space-y-5"><Facts items={[
          ['Batch Number', batch.batch_number], ['Finished Product', batch.product_name], ['Target Quantity', `${batch.target_quantity} ${batch.unit}`], ['Assigned Warehouse', batch.warehouse.name],
          ['Prepared By', batch.created_by_name ?? 'Not recorded'], ['Minimum Processing Time', `${batch.timing?.minimum_processing_minutes ?? batch.minimum_processing_minutes ?? 30} minutes`], ['Created', dateTime(batch.created_at)], ['Saved BOM', `BOM #${batch.bom_id} · ${batch.bom_output_quantity} ${batch.unit} formula output`], ['Raw Materials', batch.materials.length],
        ]}/><p className="text-sm leading-6 text-slate-600 dark:text-slate-400">This batch retains its saved formula and material requirements. The existing workflow does not permit editing the planned target or formula here.</p>{progress.cancelled && <div className="rounded-lg bg-slate-50 p-3 text-sm leading-6 dark:bg-slate-900"><p className="font-medium">Cancelled {dateTime(batch.cancelled_at)}</p><p>{batch.cancellation_reason}</p><p>Review Materials and History for any recorded return or disposal.</p></div>}</div>}
        {step === 2 && <div className="space-y-4">
          {progress.issued ? <p role="status" className="text-sm leading-6 text-emerald-800 dark:text-emerald-300">Materials were issued {dateTime(batch.issued_at)}. Recorded issue quantities remain in history; this action is unavailable again.</p> : <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">Review every required unit before issuing. Exact fractional demand is shown as recorded; quantities are never rounded or converted.</p>}
          <div className="flex flex-wrap gap-2"><button type="button" disabled={exporting || busy} onClick={() => void exportPickList('pdf')} className={secondaryClass}><Download className="h-4 w-4" aria-hidden="true"/>{exporting ? 'Preparing…' : 'Export Pick List (PDF)'}</button><button type="button" disabled={exporting || busy} onClick={() => void exportPickList('html')} className={secondaryClass}><Printer className="h-4 w-4" aria-hidden="true"/>Print Pick List</button></div>
          <ProductionMaterials batch={batch}/>
          {!batch.materials.length && <ProductionError message="No saved material requirements are available. Refresh the batch or ask Admin to review its BOM."/>}
          {!progress.issued && progress.shortage && <p role="status" className="text-sm leading-6 text-amber-900 dark:text-amber-200">Material issue is blocked by the requirements above. Resolve stock shortages through the separate existing replenishment process, or ask Admin to review incompatible demand.</p>}
          <p className="text-xs leading-6 text-slate-600 dark:text-slate-400">Available quantity shows current stock in this warehouse. Issue Materials advances production without a separate Start Production action or barcode scan.</p>
        </div>}
        {step === 3 && <div className="space-y-4">
          {!progress.output && progress.issued && <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900"><Facts items={[
            ['Minimum Processing Time', `${batch.timing?.minimum_processing_minutes ?? batch.minimum_processing_minutes ?? 30} minutes`], ['Production Started', dateTime(batch.timing?.production_started_at)], ['Earliest Output', dateTime(batch.timing?.output_available_at)],
          ]}/><p role="status" className="text-sm font-medium">{!batch.timing ? 'Refresh to load the server processing deadline before recording output.' : countdown.ready ? 'Minimum processing time elapsed. Record output only when production is physically ready.' : `Processing time remaining: ${countdown.duration}`}</p>{batch.timing?.compatibility === 'legacy_no_recorded_start' && <p className="text-xs leading-6 text-amber-900 dark:text-amber-200">This existing batch has no reliable recorded start time. Its legacy output path is retained; no start time was invented. Verify physical readiness before submitting.</p>}<p className="text-xs leading-6 text-slate-600 dark:text-slate-400">The server enforces this deadline. Elapsed time does not complete production or submit output automatically.</p></div>}
          {editable && progress.canOutput ? <form id="production-output-form" onSubmit={submitOutput} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm"><span className="mb-2 block font-medium">Produced Quantity ({batch.unit}) *</span><input id="production-output-quantity" required type="number" min={1} max={1000000} step={1} disabled={busy || !countdown.ready} value={produced} onChange={event => { setProduced(event.target.value); setExcessConfirm(false); }} className={inputClass}/></label><label className="block text-sm"><span className="mb-2 block font-medium">QA Supervisor *</span><select required value={qaId} disabled={busy || !countdown.ready || options.loading || !options.data?.qa_assignees.length} onChange={event => { setQaId(event.target.value); setExcessConfirm(false); }} className={inputClass}><option value="">Select QA Supervisor</option>{options.data?.qa_assignees.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label></div><ProductionError message={options.error}/>{!options.loading && !options.data?.qa_assignees.length && <p role="status" className="text-sm text-amber-900 dark:text-amber-200">No eligible QA Supervisor is available. Ask Admin to check active QA assignments for this warehouse.</p>}</form>
            : <Facts items={progress.output ? [['Produced Quantity', `${batch.actual_quantity} ${batch.unit}`], ['Assigned QA Supervisor', qaName], ['Sent to QA', dateTime(batch.output_recorded_at)]] : [['Produced Quantity', 'Not recorded'], ['Assigned QA Supervisor', 'Not assigned']]}/>}
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">Recorded output becomes sellable only after passed QA and finished-goods stock-in. Output is recorded once; it cannot be submitted again after the saved handoff.</p>
        </div>}
        {step === 4 && <div className="space-y-5">
          <p role="status" className={`rounded-lg border p-3 text-sm leading-6 ${progress.inspected ? 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900' : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'}`}>{progress.inspected ? 'QA inspection is recorded. Only its passed quantity can enter finished-goods stock.' : `Waiting for ${qaName} to inspect the recorded output. No finished goods can be stocked in yet.`}</p>
          <Facts items={[
            ['Assigned QA Supervisor', qaName], ['Produced Quantity', `${batch.actual_quantity ?? 'Not recorded'}${batch.actual_quantity !== null ? ` ${batch.unit}` : ''}`],
            ['Passed Quantity', batch.passed_quantity === null ? 'Not inspected' : `${batch.passed_quantity} ${batch.unit}`], ['Failed Quantity', batch.failed_quantity === null ? 'Not inspected' : `${batch.failed_quantity} ${batch.unit}`], ['Inspection Completed', dateTime(batch.qa_completed_at)],
          ]}/>{batch.qa_notes && <div><h3 className="text-sm font-semibold">Inspection Notes</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{batch.qa_notes}</p></div>}
          {batch.non_conformance && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><h3 className="font-semibold">Internal Production Non-Conformance</h3><p>{batch.non_conformance.quantity} {batch.unit} failed · {batch.non_conformance.disposition.replaceAll('_', ' ')}</p><p className="mt-1 whitespace-pre-wrap break-words">{batch.non_conformance.notes}</p><p className="mt-2 text-xs">The assigned QA Supervisor handles internal disposition on the existing Production Inspections page. Failed goods remain outside sellable stock, Supplier Rejected Items and Backload.</p></div>}
          <p className="text-xs leading-6 text-slate-600 dark:text-slate-400">Plant Managers review this handoff and its results. Inspection and non-conformance actions remain with the assigned QA Supervisor.</p>
        </div>}
        {step === 5 && <div className="space-y-4"><Facts items={[
          ['QA-passed Output', `${progress.eligible} ${batch.unit}`], ['Already Stocked In', `${progress.stockedQuantity} ${batch.unit}`], ['Remaining Eligible', `${progress.remaining} ${batch.unit}`],
          ['Destination Warehouse', batch.warehouse.name], ['Failed Output (Excluded)', `${batch.failed_quantity ?? 0} ${batch.unit}`], ['Stocked In', dateTime(batch.stocked_in_at)],
        ]}/><p role="status" className="text-sm leading-6">{progress.stocked ? 'The passed quantity has been stocked in. Stock-in is unavailable again.' : progress.canStockIn ? 'Only the QA-passed goods will enter the existing inventory. Matching-unit warehouse capacity is validated when you submit.' : 'No output is currently eligible for finished-goods stock-in.'}</p><p className="text-xs leading-6 text-slate-600 dark:text-slate-400">The current workflow stocks all passed goods in one posting. It does not support partial stock-in; failed or uninspected output is excluded.</p></div>}
        {!issueConfirm && !excessConfirm && !cancelOpen && <div className="mt-4"><ProductionError message={error}/></div>}
      </section>
      <details className={panelClass}><summary className="min-h-11 cursor-pointer rounded text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">Production History · {batch.events.length} events</summary><div className="mt-4"><ProductionHistory batch={batch}/></div>{!batch.events.length && <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">No events are available.</p>}</details>
      {editable && progress.canCancel && <aside className={panelClass} aria-label="Secondary batch actions"><h2 className="text-sm font-semibold">Secondary Actions</h2><p className="mt-2 text-xs leading-6 text-slate-600 dark:text-slate-400">{progress.issued ? 'Issued materials require documented disposal or confirmed physical return of all unused materials before cancellation. Returned quantities must fit the warehouse allocation.' : 'A planned batch can be cancelled with a recorded reason.'}</p><button type="button" onClick={() => { setCancelOpen(value => !value); setError(''); }} disabled={busy} className={`${secondaryClass} mt-3 text-red-800 dark:text-red-300`}>{cancelOpen ? 'Keep Batch Active' : 'Cancel Batch'}</button>
        {cancelOpen && <form onSubmit={cancel} className="mt-4 max-w-2xl space-y-4"><label className="block text-sm"><span className="mb-2 block font-medium">Cancellation Reason *</span><textarea required minLength={3} maxLength={2000} value={cancelReason} onChange={event => setCancelReason(event.target.value)} rows={3} className={`${inputClass} py-3`}/></label>{progress.issued && <><label className="block text-sm"><span className="mb-2 block font-medium">Issued Material Disposition *</span><select required value={disposition} onChange={event => { setDisposition(event.target.value); setConfirmUnused(false); }} className={inputClass}><option value="">Choose disposition</option><option value="RETURN_UNUSED">Return all unused materials</option><option value="DISPOSED">Document consumed / disposed materials</option></select></label>{disposition === 'RETURN_UNUSED' && <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input required type="checkbox" checked={confirmUnused} onChange={event => setConfirmUnused(event.target.checked)} className="mt-1.5 h-4 w-4"/>All issued materials are unused and physically returned to this warehouse. Consumed materials cannot be returned.</label>}</>}
          <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input required type="checkbox" checked={confirmCancellation} onChange={event => setConfirmCancellation(event.target.checked)} className="mt-1.5 h-4 w-4"/>I confirm cancellation and the recorded material disposition. The batch cannot continue afterward.</label>
          <ProductionError message={error}/><button disabled={busy || !confirmCancellation || cancelReason.trim().length < 3 || (progress.issued && (!disposition || (disposition === 'RETURN_UNUSED' && !confirmUnused)))} className={`${secondaryClass} border-red-300 text-red-800 dark:border-red-900 dark:text-red-300`}>{busy ? 'Cancelling…' : 'Confirm Cancellation'}</button>
        </form>}
      </aside>}
      {!progress.canCancel && !progress.cancelled && <p className="text-xs leading-6 text-slate-600 dark:text-slate-400">Cancellation is unavailable after output is recorded. Continue QA, passed-goods stock-in and internal failure disposition through their existing roles.</p>}
      {excessConfirm && <ProductionDialog title="Confirm Over-Target Output" busy={busy} onClose={() => { setExcessConfirm(false); requestAnimationFrame(() => document.getElementById('production-output-quantity')?.focus()); }} footer={<><button type="button" className={secondaryClass} disabled={busy} onClick={() => { setExcessConfirm(false); requestAnimationFrame(() => document.getElementById('production-output-quantity')?.focus()); }}>Review Quantity</button><button type="button" className={primaryClass} disabled={busy || !outputValid || !countdown.ready} onClick={() => sendOutput(true)}>{busy ? 'Sending…' : 'Confirm and Send to QA'}</button></>}><div className="space-y-4"><Facts items={[
        ['Target', `${batch.target_quantity} ${batch.unit}`], ['Entered Output', `${produced} ${batch.unit}`], ['Above Target', `${Number(produced) - batch.target_quantity} ${batch.unit}`],
      ]}/><p className="text-sm leading-6">Actual output is above the planned target. Confirm that you verified this quantity before sending it to QA. The saved target and issued materials stay as recorded. QA independently verifies the output, and sellable stock requires a later passed-goods stock-in.</p><ProductionError message={error}/></div></ProductionDialog>}
      {issueConfirm && <IssueConfirmation batch={batch} busy={busy} error={error} onClose={() => setIssueConfirm(false)} onConfirm={() => void mutate('issue')}/>}
    </>}
  </div>;
}
