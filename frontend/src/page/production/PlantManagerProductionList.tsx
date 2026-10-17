import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Eye, Plus, RefreshCw, Search, Warehouse } from 'lucide-react';
import { fetchProductionBatches, productionError, useProductionOptions } from './productionApi';
import type { ProductionBatchRecord, ProductionStatus } from './productionApi';
import { batchProgress, dateTime, listQuery, productionLink, STATUS_LABELS } from './productionPresentation';
import { pageClass, panelClass, inputClass, primaryClass, secondaryClass, ProductionError, ProductionLoading, ProductionStatusBadge } from './ProductionUi';

const PAGE_SIZE = 10;
export default function PlantManagerProductionList() {
  const [params, setParams] = useSearchParams();
  const options = useProductionOptions();
  const [records, setRecords] = useState<ProductionBatchRecord[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const search = params.get('q') ?? '', status = params.get('status') ?? '';
  const requestedPage = Math.max(1, Number(params.get('page')) || 1);
  const filtered = useMemo(() => records.filter(batch => (!status || batch.status === status)
    && `${batch.batch_number} ${batch.product_name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [records, status, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), page = Math.min(pages, Math.floor(requestedPage));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const query = listQuery(params);
  const update = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(listQuery(params));
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  }, [params, setParams]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    void fetchProductionBatches(controller.signal)
      .then(batches => { if (!controller.signal.aborted) setRecords(batches); })
      .catch(cause => { if (!controller.signal.aborted) { setRecords([]); setError(productionError(cause)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const refresh = () => { setRevision(value => value + 1); options.reload(); };
  const statuses = options.data?.statuses ?? Object.keys(STATUS_LABELS) as ProductionStatus[];
  return <div className={pageClass}>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold">Production Batches</h1><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">Track internal production from material issue through QA and finished-goods stock-in.</p>
        <p className="mt-2 flex items-center gap-2 text-sm font-medium"><Warehouse className="h-4 w-4" aria-hidden="true"/>Assigned warehouse: {options.data?.warehouse?.name ?? (options.loading ? 'Loading warehouse…' : 'Assignment unavailable')}</p>
      </div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={refresh} disabled={loading || options.loading} className={secondaryClass}><RefreshCw className="h-4 w-4" aria-hidden="true"/>Refresh</button><Link className={primaryClass} to={productionLink('/create', query)}><Plus className="h-4 w-4" aria-hidden="true"/>Create Batch</Link></div>
    </header>
    <ProductionError message={options.error}/>
    <section className={panelClass} aria-label="Production batch list">
      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <label className="block text-sm"><span className="mb-2 block font-medium">Search batches</span><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true"/><input type="search" value={search} onChange={event => update('q', event.target.value)} placeholder="Batch number or finished product" className={`${inputClass} pl-10`}/></div></label>
        <label className="block text-sm"><span className="mb-2 block font-medium">Status</span><select value={status} onChange={event => update('status', event.target.value)} className={inputClass}><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{STATUS_LABELS[value] ?? value}</option>)}</select></label>
      </div>
      <ProductionError message={error}/>
      {error && <button type="button" onClick={refresh} className={`${secondaryClass} mt-3`}>Try Again</button>}
      {loading ? <ProductionLoading message="Loading batches…"/> : !error && <>
        <div tabIndex={0} role="region" aria-label="Batch table, scroll horizontally on small screens" className="max-w-full overflow-x-auto rounded-lg border border-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:border-slate-800">
          <table className="w-full min-w-[840px] text-left text-sm"><caption className="sr-only">Production batches for the assigned warehouse</caption>
            <thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300"><tr>{['Batch Number', 'Finished Product', 'Target Quantity', 'Status', 'Created Date', 'Actions'].map((title, index) => <th key={title} scope="col" className={`px-3 py-3 font-semibold ${index === 2 ? 'text-right' : ''}`}>{title}</th>)}</tr></thead>
            <tbody>{visible.map(batch => <tr key={batch.id} className="border-t border-slate-200 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-900/50">
              <th scope="row" className="px-3 py-1.5 font-mono text-xs font-medium"><Link className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" to={productionLink(`/${batch.id}`, query, { mode: 'view' })}>{batch.batch_number}</Link></th>
              <td className="max-w-[280px] px-3 py-1.5"><span title={batch.product_name} className="line-clamp-2 break-words font-medium leading-5">{batch.product_name}</span></td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{batch.target_quantity.toLocaleString()} {batch.unit}</td>
              <td className="px-3 py-1.5"><ProductionStatusBadge status={batch.status}/></td>
              <td className="whitespace-nowrap px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400"><time dateTime={batch.created_at}>{dateTime(batch.created_at)}</time></td>
              <td className="px-3 py-1.5"><div className="flex gap-1"><Link aria-label={`View ${batch.batch_number}`} to={productionLink(`/${batch.id}`, query, { mode: 'view' })} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:hover:bg-slate-800"><Eye className="h-4 w-4" aria-hidden="true"/>View</Link>{batchProgress(batch).canContinue && <Link aria-label={`Continue ${batch.batch_number}`} to={productionLink(`/${batch.id}`, query, { mode: 'continue' })} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-sky-800 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 dark:text-sky-300 dark:hover:bg-sky-950/30">Continue<ArrowRight className="h-4 w-4" aria-hidden="true"/></Link>}</div></td>
            </tr>)}</tbody>
          </table>
        </div>
        {!visible.length && <div className="py-10 text-center"><p className="font-medium">{records.length ? 'No batches match your search or status filter.' : 'No production batches yet.'}</p><p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{records.length ? 'Change your filters to see other batches.' : 'Create a planned batch when your finished product and BOM are ready.'}</p>{records.length > 0 && <button type="button" className={`${secondaryClass} mt-4`} onClick={() => setParams({}, { replace: true })}>Clear Filters</button>}</div>}
        <nav aria-label="Batch pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-slate-600 dark:text-slate-400">{filtered.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} batches` : '0 batches'}</p><div className="flex items-center gap-2"><button type="button" className={secondaryClass} disabled={page <= 1} onClick={() => update('page', String(page - 1))}><ChevronLeft className="h-4 w-4" aria-hidden="true"/>Previous</button><span className="whitespace-nowrap">Page {page} of {pages}</span><button type="button" className={secondaryClass} disabled={page >= pages} onClick={() => update('page', String(page + 1))}>Next<ChevronRight className="h-4 w-4" aria-hidden="true"/></button></div></nav>
      </>}
    </section>
  </div>;
}
