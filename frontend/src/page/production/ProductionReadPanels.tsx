import type { ProductionBatchRecord } from './productionApi';
import { batchProgress, dateTime, QUALITY_CHECKS, type CheckKey } from './productionPresentation';
import { ProductionStatusBadge } from './ProductionUi';

export function ProductionFacts({ items }: { items: Array<[string, string | number]> }) {
  return <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-slate-600 dark:text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm font-medium leading-6">{value}</dd></div>)}</dl>;
}
export function ProductionMaterials({ batch }: { batch: ProductionBatchRecord }) {
  return <div className="space-y-3"><p className="text-xs leading-6 text-slate-600 dark:text-slate-400">Available is current warehouse stock, not historical stock at issue. Fulfilled requirements are not shortages when warehouse stock later decreases.</p><div tabIndex={0} role="region" aria-label="Production materials table" className="max-w-full overflow-x-auto rounded-lg border border-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:border-slate-800"><table className="w-full min-w-[680px] text-left text-sm"><caption className="sr-only">Saved raw material requirements and recorded issue</caption><thead className="bg-slate-50 text-xs dark:bg-slate-900"><tr>{['Raw Material','Required','Available Now','Issued','Remaining','Unit','Readiness'].map(title => <th key={title} scope="col" className="px-3 py-3">{title}</th>)}</tr></thead><tbody>{batch.materials.map(material => {
    const remaining = material.required_quantity === null ? null : Math.max(material.required_quantity - material.issued_quantity, 0);
    const shortage = remaining === null ? null : Math.max(remaining - material.available_quantity, 0);
    const ready = remaining === 0 ? 'Fulfilled' : material.blocking_reason ?? (remaining === null ? 'Exact demand unresolved' : shortage ? `${shortage} ${material.unit} short` : 'Ready for issue');
    return <tr key={material.id} className="border-t border-slate-200 dark:border-slate-800"><th scope="row" className="max-w-[220px] break-words px-3 py-3 font-medium">{material.product_name}</th><td className="px-3 py-3 tabular-nums">{material.required_quantity_exact}</td><td className="px-3 py-3 tabular-nums">{material.available_quantity}</td><td className="px-3 py-3 tabular-nums">{material.issued_quantity}</td><td className="px-3 py-3 tabular-nums">{remaining ?? 'Exact demand unresolved'}</td><td className="px-3 py-3">{material.unit}</td><td className={`max-w-xs px-3 py-3 text-xs leading-6 ${remaining === 0 ? 'text-emerald-800 dark:text-emerald-300' : material.blocking_reason || shortage ? 'text-amber-900 dark:text-amber-200' : ''}`}>{ready}{material.disposition && <span className="block">{material.disposition.replaceAll('_',' ')}</span>}</td></tr>;
  })}</tbody></table></div></div>;
}
export function ProductionHistory({ batch }: { batch: ProductionBatchRecord }) {
  return <ol className="space-y-4">{batch.events.map(event => <li key={event.id} className="border-l-2 border-slate-200 pl-4 text-sm dark:border-slate-700"><p className="font-semibold">{event.action.toLowerCase().replaceAll('_',' ').replace(/^./, value => value.toUpperCase())}</p><p className="mt-1 break-words leading-6 text-slate-600 dark:text-slate-400">{event.notes ?? 'No description recorded.'}</p><p className="mt-1 text-xs text-slate-500">{dateTime(event.occurred_at)}{event.actor_name ? ` · ${event.actor_name}` : ''}</p><RecordedConfirmation event={event} unit={batch.unit}/></li>)}</ol>;
}
function RecordedConfirmation({ event, unit }: { event: ProductionBatchRecord['events'][number]; unit: string }) {
  const value = event.metadata?.excess_confirmation;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const ack = value as Record<string, unknown>, checks = ack.checks as Record<string, unknown> | undefined;
  const quantity = (key: string) => typeof ack[key] === 'number' ? `${ack[key]} ${unit}` : 'Not recorded';
  return <details className="mt-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"><summary className="min-h-11 cursor-pointer text-xs font-semibold">Recorded Over-Target Confirmation</summary><div className="mt-2 space-y-3"><ProductionFacts items={[
    ['Target',quantity('target_quantity')],['Actual Output',quantity('actual_quantity')],['Above Target',quantity('excess_quantity')],['Confirmed',dateTime(typeof ack.confirmed_at === 'string' ? ack.confirmed_at : null)],
    ...(checks ? [['Passed',quantity('passed_quantity')],['Failed',quantity('failed_quantity')]] as Array<[string,string]> : []),
  ]}/>{checks && <ul className="space-y-2 text-xs leading-6">{(Object.keys(QUALITY_CHECKS) as CheckKey[]).map(key => <li key={key}><span className="font-semibold">{checks[key] === true ? 'Confirmed' : checks[key] === 'not_applicable' ? 'Not applicable' : 'Not recorded'}: </span>{QUALITY_CHECKS[key]}</li>)}</ul>}</div></details>;
}
export function ProductionOverview({ batch }: { batch: ProductionBatchRecord }) {
  return <div className="space-y-4"><div className="flex flex-wrap gap-2"><ProductionStatusBadge status={batch.status}/>{(batch.actual_quantity ?? 0) > batch.target_quantity && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{batch.actual_quantity! - batch.target_quantity} {batch.unit} over target</span>}</div><ProductionFacts items={[
    ['Finished Product',batch.product_name],['Warehouse',batch.warehouse.name],['Target Quantity',`${batch.target_quantity} ${batch.unit}`],['Actual Output',batch.actual_quantity === null ? 'Not recorded' : `${batch.actual_quantity} ${batch.unit}`],['Prepared By',batch.created_by_name ?? 'Not recorded'],['Created',dateTime(batch.created_at)],['Saved Formula',`BOM #${batch.bom_id} · ${batch.bom_output_quantity} ${batch.unit}`],
    ['Minimum Processing Time',`${batch.timing?.minimum_processing_minutes ?? batch.minimum_processing_minutes ?? 30} minutes`],['Production Started',dateTime(batch.timing?.production_started_at ?? batch.production_started_at)],['Earliest Output',dateTime(batch.timing?.output_available_at ?? batch.output_available_at)],
  ]}/>{batch.status === 'CANCELLED' && <p className="rounded-lg bg-slate-50 p-3 text-sm leading-6 dark:bg-slate-900">Cancellation: {batch.cancellation_reason ?? 'No reason recorded.'}</p>}</div>;
}
export function ProductionQaSummary({ batch }: { batch: ProductionBatchRecord }) {
  const progress=batchProgress(batch);
  return <div className="space-y-4"><ProductionFacts items={[
    ['Assigned QA',batch.assigned_qa_name ?? (batch.assigned_qa_user_id ? `QA Supervisor #${batch.assigned_qa_user_id}` : 'Not assigned')],['Actual Output',batch.actual_quantity === null ? 'Not recorded' : `${batch.actual_quantity} ${batch.unit}`],
    ['Passed',batch.passed_quantity === null ? 'Not inspected' : `${batch.passed_quantity} ${batch.unit}`],['Failed',batch.failed_quantity === null ? 'Not inspected' : `${batch.failed_quantity} ${batch.unit}`],['Sent to QA',dateTime(batch.output_recorded_at)],['QA Completed',dateTime(batch.qa_completed_at)],
  ]}/><p className="text-sm leading-6">{progress.inspected ? 'Inspection is recorded. Only passed output is eligible for stock-in.' : 'Inspection is pending. Recorded output remains outside sellable stock.'}</p>{batch.qa_notes && <div><h3 className="text-sm font-semibold">Inspection Notes</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{batch.qa_notes}</p></div>}{batch.non_conformance && <ProductionNonConformance batch={batch}/>}</div>;
}
export function ProductionNonConformance({ batch }: { batch: ProductionBatchRecord }) {
  const record=batch.non_conformance;
  return record ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><h3 className="font-semibold">Internal Production Non-Conformance</h3><p>{record.quantity} {batch.unit} · {record.disposition.replaceAll('_',' ')}</p><p className="mt-2 whitespace-pre-wrap break-words">{record.notes}</p><p className="mt-2 text-xs">Failed output is excluded from sellable inventory. Supplier Rejected Items and Backload remain separate.</p>{record.resolved_at && <p className="mt-2 text-xs">Resolved: {dateTime(record.resolved_at)}</p>}</div> : <p className="text-sm text-slate-600 dark:text-slate-400">No internal non-conformance is recorded.</p>;
}
export function ProductionStockSummary({ batch }: { batch: ProductionBatchRecord }) {
  const progress=batchProgress(batch);
  return <div className="space-y-4"><ProductionFacts items={[
    ['Destination',batch.warehouse.name],['QA-passed Output',`${progress.eligible} ${batch.unit}`],['Already Stocked In',`${progress.stockedQuantity} ${batch.unit}`],['Remaining Eligible',`${progress.remaining} ${batch.unit}`],['Failed / Excluded',`${batch.failed_quantity ?? 0} ${batch.unit}`],['Stocked In',dateTime(batch.stocked_in_at)],
  ]}/><p className="text-xs leading-6 text-slate-600 dark:text-slate-400">Only passed output is posted by the Plant Manager. The existing workflow posts all eligible passed units atomically; this read-only view does not change stock.</p></div>;
}
