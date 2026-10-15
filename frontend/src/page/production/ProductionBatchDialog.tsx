import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../lib/api';
import { readStoredUser } from '../../lib/authUser';
import ProductionDialog from './ProductionDialog';
import { QUALITY_CHECKS, type CheckKey } from './productionPresentation';
import { productionError, useProductionBatch } from './productionApi';
import type { ProductionBatchRecord } from './productionApi';
import { inputClass, primaryClass, secondaryClass, ProductionError, ProductionLoading, ProductionNotice } from './ProductionUi';
import { ProductionHistory, ProductionMaterials, ProductionNonConformance, ProductionOverview, ProductionQaSummary, ProductionStockSummary } from './ProductionReadPanels';

type Intent = 'inspect' | 'view' | 'non-conformance';
const unchecked = (): Record<CheckKey, boolean> => ({ quantity_verified: false, passed_inspected: false, passed_meets_requirements: false, failed_excluded: false });

export default function ProductionBatchDialog({ id, role, intent, onClose, onSaved, onWarehouse }: {
  id: number; role: 'admin' | 'qa'; intent: Intent; onClose: () => void; onSaved: () => void; onWarehouse?: (name: string | null) => void;
}) {
  const resource = useProductionBatch(String(id)), batch = resource.data;
  const [step, setStep] = useState(1), [tab, setTab] = useState(intent === 'non-conformance' ? 'Non-Conformance' : role === 'admin' ? 'Overview' : 'Summary');
  const [passed, setPassed] = useState(''), [failed, setFailed] = useState(''), [notes, setNotes] = useState('');
  const [checks, setChecks] = useState(unchecked), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [disposition, setDisposition] = useState('HOLD'), [dispositionNotes, setDispositionNotes] = useState('');
  const submitting = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onWarehouse?.(batch?.warehouse.name ?? null); return () => onWarehouse?.(null); }, [batch?.warehouse.name, onWarehouse]);
  useEffect(() => {
    if (batch?.non_conformance) { setDisposition(batch.non_conformance.disposition); setDispositionNotes(batch.non_conformance.notes); }
  }, [batch?.non_conformance]);
  const authorized = role === 'qa' && batch?.assigned_qa_user_id === readStoredUser()?.id;
  const inspecting = intent === 'inspect' && authorized && batch?.status === 'PENDING_QA' && !batch.qa_completed_at;
  const over = !!batch && (batch.actual_quantity ?? 0) > batch.target_quantity;
  const passedNumber = Number(passed), failedNumber = Number(failed);
  const valid = passed !== '' && failed !== '' && Number.isInteger(passedNumber) && Number.isInteger(failedNumber) && passedNumber >= 0 && failedNumber >= 0 && passedNumber + failedNumber === batch?.actual_quantity && notes.trim().length >= 3 && notes.length <= 2000;
  const applicable: CheckKey[] = ['quantity_verified', ...(passedNumber > 0 ? ['passed_inspected','passed_meets_requirements'] as CheckKey[] : []), ...(failedNumber > 0 ? ['failed_excluded'] as CheckKey[] : [])];
  const confirmed = !over || applicable.every(key => checks[key]);
  const dirty = !!inspecting && (passed !== '' || failed !== '' || notes !== '') || (intent === 'non-conformance' && !!batch?.non_conformance && (disposition !== batch.non_conformance.disposition || dispositionNotes !== batch.non_conformance.notes));
  const change = (setter: (value: string) => void, value: string) => { setter(value); setChecks(unchecked()); setError(''); };
  const save = async (action: 'qa' | 'non-conformance', payload: object) => {
    if (!batch || !authorized || submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const response = await apiClient.post<{ data: ProductionBatchRecord }>(`/production/batches/${batch.id}/${action}`, payload);
      if (!alive.current) return; resource.accept(response.data.data); setTab(action === 'qa' ? 'Summary' : 'Non-Conformance');
      setNotice(action === 'qa' ? 'Production QA recorded. Stock remains unchanged.' : 'Internal disposition recorded.'); onSaved();
    } catch (cause) {
      if (!alive.current) return; setError(productionError(cause));
      if (!(cause as { response?: unknown }).response) resource.reload();
    } finally { submitting.current = false; if (alive.current) setBusy(false); }
  };
  const inspect = () => {
    if (!batch || !inspecting || !valid || !confirmed) return;
    const payload: Record<string, unknown> = { passed_quantity: passedNumber, failed_quantity: failedNumber, notes };
    if (over) payload.excess_confirmation = { target_quantity: batch.target_quantity, actual_quantity: batch.actual_quantity, passed_quantity: passedNumber, failed_quantity: failedNumber, inspection_notes: notes, ...checks };
    void save('qa', payload);
  };
  const tabs = role === 'admin' ? ['Overview','Materials','Output & QA','Stock In','History'] : ['Summary','Materials', ...(batch?.non_conformance ? ['Non-Conformance'] : []), 'History'];
  const nextStep = () => { if (step === 1 || valid) { setStep(value => value + 1); setError(''); } };
  const footer = inspecting ? <>
    <button type="button" disabled={busy} className={secondaryClass} onClick={() => { if (dirty) { document.querySelector<HTMLButtonElement>('[aria-label="Close production dialog"]')?.click(); } else onClose(); }}>Cancel</button>
    {step > 1 && <button type="button" disabled={busy} className={secondaryClass} onClick={() => setStep(value => value - 1)}>{step === 3 ? 'Back to Inspection' : 'Back'}</button>}
    {step < 3 ? <button type="button" disabled={busy || step === 2 && !valid} className={primaryClass} onClick={nextStep}>Next</button> : <button type="button" disabled={busy || !valid || !confirmed} className={primaryClass} onClick={inspect}>{busy ? 'Completing…' : over ? 'Confirm QA Result' : 'Complete Production QA'}</button>}
  </> : <button type="button" className={secondaryClass} disabled={busy} onClick={() => document.querySelector<HTMLButtonElement>('[aria-label="Close production dialog"]')?.click()}>Close</button>;
  return <ProductionDialog title={inspecting ? `Inspect ${batch?.batch_number ?? 'Production Batch'}` : `${batch?.batch_number ?? 'Production Batch'} — ${role === 'admin' ? 'Details' : 'Result'}`} busy={busy} dirty={dirty} onClose={onClose} footer={footer}>
    {resource.loading ? <ProductionLoading message="Loading authorized batch details…"/> : resource.error ? <><ProductionError message={resource.error}/><button type="button" className={`${secondaryClass} mt-3`} onClick={resource.reload}>Try Again</button></> : batch && <div className="space-y-5">
      <ProductionNotice message={notice}/>
      {inspecting ? <>
        <ol aria-label="Inspection steps" className="grid gap-2 sm:grid-cols-3">{['Review Batch','Record Inspection','Review & Confirm'].map((label,index) => <li key={label} aria-current={step === index+1 ? 'step' : undefined} className={`rounded-lg border px-3 py-2 text-sm ${step === index+1 ? 'border-slate-400 bg-slate-50 font-semibold dark:border-slate-600 dark:bg-slate-900' : 'border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400'}`}>{index+1}. {label}</li>)}</ol>
        {step === 1 && <><ProductionOverview batch={batch}/><p className="text-sm leading-6 text-slate-600 dark:text-slate-400">Review the saved target, actual output and warehouse before recording the manual inspection. No stock is increased during QA.</p></>}
        {step === 2 && <div className="space-y-4"><p className="text-sm font-medium">Actual output: {batch.actual_quantity} {batch.unit}. Passed + failed must equal actual output.</p><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm"><span className="mb-2 block font-medium">Passed Quantity ({batch.unit}) *</span><input required type="number" min={0} max={batch.actual_quantity ?? 1000000} step={1} disabled={busy} value={passed} onChange={event => change(setPassed,event.target.value)} className={inputClass}/></label><label className="block text-sm"><span className="mb-2 block font-medium">Failed Quantity ({batch.unit}) *</span><input required type="number" min={0} max={batch.actual_quantity ?? 1000000} step={1} disabled={busy} value={failed} onChange={event => change(setFailed,event.target.value)} className={inputClass}/></label></div><label className="block text-sm"><span className="mb-2 block font-medium">Inspection Notes *</span><textarea required minLength={3} maxLength={2000} disabled={busy} rows={4} value={notes} onChange={event => change(setNotes,event.target.value)} className={`${inputClass} py-3`}/></label>{passed !== '' && failed !== '' && passedNumber+failedNumber !== batch.actual_quantity && <p role="status" className="text-sm text-amber-900 dark:text-amber-200">Entered total: {passedNumber+failedNumber} {batch.unit}. It must equal {batch.actual_quantity} {batch.unit} actual output.</p>}</div>}
        {step === 3 && <div className="space-y-4"><dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-900">{[['Target',batch.target_quantity],['Actual',batch.actual_quantity],['Over Target',Math.max(0,(batch.actual_quantity??0)-batch.target_quantity)],['Passed',passedNumber],['Failed',failedNumber]].map(([label,value]) => <div key={String(label)}><dt className="text-xs text-slate-600 dark:text-slate-400">{label}</dt><dd className="mt-1 font-semibold">{value} {batch.unit}</dd></div>)}</dl><p className="whitespace-pre-wrap break-words text-sm leading-6">{notes}</p>
          {over && <section className="space-y-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"><h3 className="font-semibold">Verify Over-Target Output</h3><p>Actual output is {batch.actual_quantity} {batch.unit}, which exceeds the target of {batch.target_quantity} {batch.unit} by {batch.actual_quantity!-batch.target_quantity} {batch.unit}. Verify the quantities and confirm the applicable quality checks for the units marked as passed before completing this inspection.</p>{applicable.map(key => <label key={key} className="flex min-h-11 cursor-pointer items-start gap-3"><input type="checkbox" disabled={busy} checked={checks[key]} onChange={event => setChecks(value => ({...value,[key]:event.target.checked}))} className="mt-1.5 h-4 w-4 shrink-0"/>{QUALITY_CHECKS[key]}</label>)}{passedNumber === 0 && <p className="text-xs">Passed-unit acceptance criteria: not applicable. No units are marked as passed; quantity verification and exclusion of failed output remain required.</p>}{failedNumber === 0 && <p className="text-xs">Failed-unit exclusion criterion: not applicable. No failed units are recorded.</p>}<p className="text-xs">These generic confirmations do not add product specifications. Use the approved criteria for the product you inspected.</p></section>}
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{passedNumber === 0 ? 'All output remains outside sellable stock and enters the existing internal failure/hold path.' : `Only ${passedNumber} ${batch.unit} becomes eligible for the Plant Manager’s later stock-in. ${failedNumber} ${batch.unit} remains excluded.`}</p>
        </div>}
        <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><summary className="min-h-11 cursor-pointer text-sm font-semibold">Optional Materials & History</summary><div className="mt-3 space-y-5"><ProductionMaterials batch={batch}/><h3 className="text-sm font-semibold">Event History</h3><ProductionHistory batch={batch}/></div></details>
      </> : <>
        <div role="tablist" aria-label="Batch detail sections" className="flex flex-wrap gap-1 border-b border-slate-200 pb-2 dark:border-slate-800">{tabs.map(label => <button key={label} type="button" role="tab" aria-selected={tab===label} aria-controls="batch-detail-panel" tabIndex={tab===label?0:-1} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(tabs.indexOf(label)+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;setTab(tabs[index]);event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();}} disabled={busy} onClick={() => setTab(label)} className={`min-h-11 cursor-pointer rounded-lg px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${tab===label ? 'bg-slate-100 font-semibold dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-900'}`}>{label}</button>)}</div>
        <section role="tabpanel" id="batch-detail-panel" aria-label={tab}>
          {(tab==='Overview'||tab==='Summary') && <ProductionOverview batch={batch}/>}
          {tab==='Summary' && <div className="mt-5"><ProductionQaSummary batch={batch}/></div>}
          {tab==='Materials' && <ProductionMaterials batch={batch}/>}
          {tab==='History' && <ProductionHistory batch={batch}/>}
          {tab==='Output & QA' && <ProductionQaSummary batch={batch}/>}
          {tab==='Stock In' && <ProductionStockSummary batch={batch}/>}
          {tab==='Non-Conformance' && <div className="space-y-4"><ProductionNonConformance batch={batch}/>{intent==='non-conformance' && authorized && batch.non_conformance && !batch.non_conformance.resolved_at && <form onSubmit={event => {event.preventDefault();void save('non-conformance',{disposition,notes:dispositionNotes});}} className="space-y-4"><label className="block text-sm"><span className="mb-2 block font-medium">Internal Disposition</span><select value={disposition} disabled={busy} onChange={event => setDisposition(event.target.value)} className={inputClass}><option value="HOLD">Hold</option><option value="REWORK">Plan Rework</option><option value="DISPOSAL">Dispose Failed Output</option></select></label><label className="block text-sm"><span className="mb-2 block font-medium">Disposition Notes *</span><textarea required minLength={3} maxLength={2000} value={dispositionNotes} disabled={busy} onChange={event => setDispositionNotes(event.target.value)} rows={3} className={`${inputClass} py-3`}/></label><button disabled={busy} className={primaryClass}>{busy?'Saving…':'Record Internal Disposition'}</button></form>}</div>}
        </section>
      </>}
      <ProductionError message={error}/>
    </div>}
  </ProductionDialog>;
}
