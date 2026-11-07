import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Eye, Plus, RefreshCw, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import ReturnOrderSelect from './ReturnOrderSelect';
import { apiClient } from '../../lib/api';
import { useAdminDetailOverlay } from '../layout/AdminDetailOverlayContext';
import { usePlantManagerDetailOverlay } from '../layout/PlantManagerDetailOverlayContext';
import { EvidenceGallery, type QaAttachment } from '../../page/QA/components/EvidenceGallery';
import { returnAction, returnActionLabel, returnEmptyMessage, returnLoadError, returnTabLabel } from './customerReturnUi';

type Mode = 'admin' | 'receiving' | 'qa' | 'stock-in';
type ReturnRow = {
  id: number; reference: string; order_no: string; customer: string; product: string; warehouse: string; unit: string;
  status: string; verification_status: string; reason: string; requested_quantity: number; received_quantity: number;
  passed_quantity: number; failed_quantity: number; quarantine_quantity: number; restocked_quantity: number; disposed_quantity: number;
  restock_status: string; disposal_status: string; qa_inspector: string | null; received_at: string | null; inspected_at: string | null;
  receipt_shortage_reason: string | null; verification_reference: string | null; qa_findings: string | null; suitability_reference: string | null;
  evidence?: (QaAttachment & { stage: string })[]; events?: { id: number; action: string; actor: string; created_at: string; details: Record<string, unknown> }[];
};
type ReturnLine = { order_item_id: number; product: string; warehouse_id: number; warehouse: string; unit: string; fulfilled_quantity: number; previously_returned_quantity: number; remaining_returnable_quantity: number };
const statuses = ['REQUESTED','AWAITING_RETURN','PENDING_QA','PENDING_DISPOSITION','COMPLETED','REJECTED','CANCELLED'];
const button = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800';
const input = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const label = (value: string) => value.replaceAll('_',' ');
const errorText = (error: any) => Object.values(error?.response?.data?.errors ?? {}).flat().join(' ') || error?.response?.data?.message || 'The request could not be completed. Please retry.';

function ReturnDialog({ title, busy, children, onClose }: { title: string; busy: boolean; children: ReactNode; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const latest = useRef({ busy, onClose });
  useEffect(() => { latest.current = { busy, onClose }; }, [busy,onClose]);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; close.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      const nested = panel.current?.querySelector('[role="dialog"]');
      if (event.key === 'Escape' && !nested && !latest.current.busy) { event.preventDefault(); latest.current.onClose(); }
      if (event.key !== 'Tab') return;
      const scope = nested ?? panel.current;
      const controls = scope?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]');
      if (!controls?.length) return;
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !scope?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !scope?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown',keydown);
    return () => { document.removeEventListener('keydown',keydown); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus(); };
  },[]);
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-3 sm:p-6"><div ref={panel} role="dialog" aria-modal="true" aria-labelledby="customer-return-dialog-title" className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-[#0d1322] dark:text-slate-100"><header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-700"><h2 id="customer-return-dialog-title" className="break-words text-lg font-semibold">{title}</h2><button ref={close} type="button" disabled={busy} onClick={onClose} aria-label="Close customer return" className={button}><X className="h-5 w-5" /></button></header><div data-return-dialog-scroll className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">{children}</div></div></div>;
}

export function CustomerReturns({ mode }: { mode: Mode }) {
  const [search,setSearch] = useState(''); const [status,setStatus] = useState(mode === 'qa' ? 'PENDING_QA' : ''); const [page,setPage] = useState(1);
  const [rows,setRows] = useState<ReturnRow[]>([]); const [total,setTotal] = useState(0); const [lastPage,setLastPage] = useState(1);
  const [loading,setLoading] = useState(true); const [error,setError] = useState(''); const [notice,setNotice] = useState(''); const [reload,setReload] = useState(0);
  const [selected,setSelected] = useState<ReturnRow | null>(null); const [detailLoading,setDetailLoading] = useState(false); const [detailFailed,setDetailFailed] = useState(false);
  const [create,setCreate] = useState(false); const [busy,setBusy] = useState(false); const busyRef = useRef(false);
  const [dialogError,setDialogError] = useState(''); const alertRef = useRef<HTMLParagraphElement>(null);
  const [orderSearch,setOrderSearch] = useState(''); const [orders,setOrders] = useState<{ id: number; order_no: string; customer_name: string }[]>([]);
  const [ordersLoading,setOrdersLoading] = useState(false); const [ordersError,setOrdersError] = useState(''); const [optionsLoading,setOptionsLoading] = useState(false); const [optionsError,setOptionsError] = useState(''); const [selectedOrderLabel,setSelectedOrderLabel] = useState('');
  const [orderId,setOrderId] = useState(''); const [orderInfo,setOrderInfo] = useState<{ customer: string; status: string } | null>(null);
  const [lines,setLines] = useState<ReturnLine[]>([]); const [lineKey,setLineKey] = useState(''); const [reasons,setReasons] = useState<string[]>([]);
  const [qaUsers,setQaUsers] = useState<{ id: number; name: string }[]>([]); const [action,setAction] = useState('');
  const [form,setForm] = useState<Record<string,string>>({}); const [files,setFiles] = useState<File[]>([]);
  const submission = useRef(''); const detailRequest = useRef(0); const optionsRequest = useRef(0);
  useAdminDetailOverlay(mode === 'admin' && (create || selected !== null));
  usePlantManagerDetailOverlay((mode === 'receiving' || mode === 'stock-in') && selected !== null);
  const showError = (text: string) => { setDialogError(text); requestAnimationFrame(() => { alertRef.current?.focus(); alertRef.current?.scrollIntoView({ block:'nearest' }); }); };
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    apiClient.get('/customer-returns',{ params:{ search:search || undefined,status:status || undefined,page },signal:controller.signal })
      .then(response => { if (controller.signal.aborted) return; if (page > response.data.last_page) { setPage(Math.max(1,response.data.last_page)); return; } setRows(response.data.data); setTotal(response.data.total); setLastPage(response.data.last_page); })
      .catch(requestError => { if (!controller.signal.aborted) { setRows([]); setTotal(0); setLastPage(1); setError(returnLoadError(requestError)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  },[search,status,page,reload]);
  useEffect(() => {
    if (!create || mode !== 'admin') return;
    const controller = new AbortController(); setOrdersLoading(true); setOrdersError('');
    const timeout = window.setTimeout(() => { apiClient.get('/admin/orders',{ params:{ search:orderSearch || undefined,per_page:20 },signal:controller.signal })
      .then(response => { if (!controller.signal.aborted) setOrders(response.data.data); })
      .catch(requestError => { if (!controller.signal.aborted) { setOrders([]); setOrdersError(returnLoadError(requestError)); } })
      .finally(() => { if (!controller.signal.aborted) setOrdersLoading(false); }); },250);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  },[create,orderSearch,mode]);
  const loadOptions = async (id: string) => {
    const request = ++optionsRequest.current; setOrderId(id); setLineKey(''); setLines([]); setOrderInfo(null); setDialogError(''); setOptionsError(''); setOptionsLoading(Boolean(id));
    const order = orders.find(item => String(item.id) === id); setSelectedOrderLabel(order ? `${order.order_no} / ${order.customer_name}` : '');
    if (!id) return;
    try { const response = await apiClient.get('/customer-returns/options',{ params:{ order_id:id } }); if (request !== optionsRequest.current) return; setLines(response.data.lines); setReasons(response.data.reasons); setOrderInfo(response.data.order); }
    catch (requestError) { if (request === optionsRequest.current) setOptionsError(returnLoadError(requestError)); }
    finally { if (request === optionsRequest.current) setOptionsLoading(false); }
  };
  const open = async (row: ReturnRow, requestedAction = '') => {
    const request = ++detailRequest.current; setSelected(row); setDetailLoading(true); setDetailFailed(false); setDialogError(''); setAction(''); setFiles([]); setForm({});
    try { const response = await apiClient.get(`/customer-returns/${row.id}`); if (request === detailRequest.current) { setSelected(response.data.data); if (requestedAction && returnAction(mode,response.data.data) === requestedAction) await chooseAction(requestedAction,response.data.data); } }
    catch (requestError) { if (request === detailRequest.current) { setDetailFailed(true); showError(errorText(requestError)); } }
    finally { if (request === detailRequest.current) setDetailLoading(false); }
  };
  const chooseAction = async (value: string, row = selected) => {
    const today = new Intl.DateTimeFormat('en-CA',{ timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
    setAction(value); setDialogError(''); setFiles([]); setForm({ received_at:today,disposal_date:today,quantity:String(row?.requested_quantity ?? ''),passed_quantity:'0',failed_quantity:String(row?.received_quantity ?? 0) });
    if (value === 'receive') { const request = detailRequest.current; setQaUsers([]); try { const response = await apiClient.get('/customer-returns/options'); if (request === detailRequest.current) setQaUsers(response.data.qa_users); } catch (requestError) { if (request === detailRequest.current) showError(errorText(requestError)); } }
  };
  const submit = async () => {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setDialogError('');
    try {
      if (create) {
        const line = lines.find(item => `${item.order_item_id}:${item.warehouse_id}` === lineKey);
        if (!line) throw new Error('Select a fulfilled order item and its original warehouse.');
        if (optionsLoading || optionsError || !Number.isInteger(Number(form.quantity)) || Number(form.quantity) < 1 || Number(form.quantity) > line.remaining_returnable_quantity || !reasons.includes(form.reason)) throw new Error('Select a return reason and a positive whole quantity within the remaining returnable balance.');
        await apiClient.post('/customer-returns',{ submission_key:submission.current,order_item_id:line.order_item_id,warehouse_id:line.warehouse_id,quantity:Number(form.quantity),reason:form.reason });
        setCreate(false); setNotice('Return registered. Admin verification and approval are required before receipt. No stock was changed.');
      } else if (selected && action) {
        const body = new FormData();
        for (const [key,value] of Object.entries(form)) if (value !== '') body.append(key,value);
        files.forEach(file => body.append('evidence[]',file));
        const response = await apiClient.post(`/customer-returns/${selected.id}/${action}`,body);
        setSelected(response.data.data); setAction(''); setFiles([]); setForm({}); setNotice('Customer return updated.');
      }
      setReload(value => value + 1);
    } catch (requestError: any) { showError(requestError?.response ? errorText(requestError) : requestError.message); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const set = (key: string,value: string) => { setForm(current => ({ ...current,[key]:value })); setDialogError(''); };
  const textField = (key: string,title: string,type = 'text') => <label className="block text-sm font-medium">{title}<input type={type} min={type === 'number' ? '0' : undefined} step={type === 'number' ? '1' : undefined} maxLength={type === 'text' ? 2000 : undefined} required value={form[key] ?? ''} onChange={event => set(key,event.target.value)} className={input} /></label>;
  const actionChoices = selected ? mode === 'admin'
    ? [...(selected.status === 'REQUESTED' ? ['approve','reject'] : []),...(['REQUESTED','AWAITING_RETURN'].includes(selected.status) ? ['cancel'] : []),...(returnAction(mode,selected) === 'dispose' ? ['dispose'] : [])]
    : mode === 'receiving' ? selected.status === 'AWAITING_RETURN' ? ['receive'] : []
    : mode === 'qa' ? selected.status === 'PENDING_QA' ? ['inspect'] : []
    : returnAction(mode,selected) === 'restock' ? ['restock'] : [] : [];
  const currentLine = lines.find(item => `${item.order_item_id}:${item.warehouse_id}` === lineKey);
  const close = useCallback(() => { if (busyRef.current) return; detailRequest.current += 1; optionsRequest.current += 1; setSelected(null); setCreate(false); setAction(''); setFiles([]); setForm({}); setDialogError(''); },[]);
  return <section className="min-h-screen min-w-0 space-y-4 bg-slate-50 p-4 text-slate-900 dark:bg-[#090d16] dark:text-slate-100 sm:p-6">
    {(mode === 'admin' || mode === 'qa') && <nav aria-label="Breadcrumb" className="text-sm text-slate-600 dark:text-slate-400"><ol className="flex flex-wrap items-center gap-2"><li><Link to={mode === 'admin' ? '/admin/dashboard' : '/qa/dashboard'} className="inline-flex min-h-11 items-center rounded px-1 hover:text-cyan-700 focus-visible:outline-2 focus-visible:outline-cyan-500 dark:hover:text-cyan-300">{mode === 'admin' ? 'Admin' : 'QA'}</Link></li>{mode === 'admin' && <li><span aria-hidden="true">/ </span>Smart Warehousing System</li>}<li aria-current="page"><span aria-hidden="true">/ </span>{returnTabLabel(mode)}</li></ol></nav>}

    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-bold">{returnTabLabel(mode)}</h1><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Customer returns stay in quarantine until QA and all authorized dispositions are complete.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setReload(value => value + 1)} className={button}><RefreshCw className="h-4 w-4" />Refresh</button>{mode === 'admin' && <button type="button" onClick={() => { submission.current = crypto.randomUUID(); setCreate(true); setForm({}); setLineKey(''); setOrderId(''); setOrderInfo(null); setLines([]); setOptionsError(''); setOptionsLoading(false); setSelectedOrderLabel(''); setOrders([]); setOrderSearch(''); setDialogError(''); }} className={button}><Plus className="h-4 w-4" />Register Return</button>}</div></header>
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Search<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Return, order, customer or product" className={input} /></label><label className="text-sm">Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className={input}><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label></div>
    {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-[#0d1322]"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr>{['Return / Order','Customer / Product','Warehouse','Quantity / Unit','Status','Actions'].map(title => <th key={title} className="border-b border-slate-200 px-3 py-3 font-semibold dark:border-slate-700">{title}</th>)}</tr></thead><tbody>{!loading && !error && rows.map(row => <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800"><td className="px-3 py-3"><strong className="block">{row.reference}</strong>{row.order_no}</td><td className="max-w-64 break-words px-3 py-3">{row.customer}<span className="block text-slate-600 dark:text-slate-400">{row.product}</span></td><td className="px-3 py-3">{row.warehouse}</td><td className="px-3 py-3">Requested: {row.requested_quantity} {row.unit}<span className="block">Quarantine: {row.quarantine_quantity} {row.unit}</span><span className="block">Received: {row.received_quantity} {row.unit}</span>{(mode === 'qa' || mode === 'stock-in') && <><span className="block">Passed: {row.passed_quantity} {row.unit}</span><span className="block">Failed: {row.failed_quantity} {row.unit}</span></>}</td><td className="px-3 py-3"><span className="inline-block rounded-full border border-slate-300 px-2 py-1 text-xs font-semibold dark:border-slate-600">{label(row.status)}</span><span className="mt-1 block text-xs">Receiving: {row.received_at ? 'Received / quarantined' : row.status === 'AWAITING_RETURN' ? 'Awaiting receipt' : 'Not received'}</span>{mode === 'qa' && <span className="block text-xs">Inspection: {row.inspected_at ? 'Completed' : row.status === 'PENDING_QA' ? 'Ready for inspection' : 'Not ready'}</span>}{mode === 'stock-in' && <span className="block text-xs">Restock: {label(row.restock_status)}</span>}{mode === 'admin' && <span className="block text-xs">Disposal: {label(row.disposal_status)}</span>}{row.verification_status === 'DELIVERY_VERIFICATION_HOLD' && <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">Delivery verification hold</span>}</td><td className="px-3 py-3"><button type="button" onClick={() => void open(row)} className={button} aria-label={`View ${row.reference}`}><Eye className="h-4 w-4" />View Details</button>{returnAction(mode,row) && <button type="button" onClick={() => void open(row,returnAction(mode,row))} className={`${button} mt-2`}>{returnActionLabel(returnAction(mode,row))}</button>}</td></tr>)}{!error && (loading || !rows.length) && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-600 dark:text-slate-400">{loading ? 'Loading customer returns…' : returnEmptyMessage(mode,Boolean(search || (status && !(mode === 'qa' && status === 'PENDING_QA'))))}</td></tr>}</tbody></table></div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p>{total ? (page-1)*8+1 : 0}–{Math.min(page*8,total)} of {total} returns</p><nav aria-label="Customer returns pages" className="flex items-center gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(value => value-1)} className={button}>Previous</button><span>{page} / {lastPage}</span><button type="button" disabled={page >= lastPage || loading} onClick={() => setPage(value => value+1)} className={button}>Next</button></nav></div>
    {(create || selected) && <ReturnDialog title={create ? 'Register Return Order' : selected!.reference} busy={busy} onClose={close}>
      {dialogError && <p ref={alertRef} tabIndex={-1} role="alert" className="mb-4 break-words rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 outline-none focus:ring-2 focus:ring-rose-500 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">{dialogError}</p>}
      {create ? <form onSubmit={event => { event.preventDefault(); void submit(); }} className="space-y-4">
        <label className="block text-sm">Find original order<input type="search" value={orderSearch} onChange={event => setOrderSearch(event.target.value)} className={input} placeholder="Search by order number or customer" /></label>
        <ReturnOrderSelect label="Original order" value={orderId} onChange={value => void loadOptions(value)} selectedLabel={selectedOrderLabel} placeholder={ordersLoading ? 'Loading original orders...' : 'Select original order'} disabled={ordersLoading} options={orders.map(order => ({ value:String(order.id), label:`${order.order_no} / ${order.customer_name}` }))} />
        {ordersError && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{ordersError} Change the search to retry.</p>}
        {!ordersLoading && !ordersError && !orders.length && <p role="status" className="text-sm text-slate-600 dark:text-slate-400">No original orders match this search. Try a different order reference or customer.</p>}
        {orderInfo && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">Customer: {orderInfo.customer} · Order: {orderInfo.status}. {orderInfo.status === 'DELIVERED' ? 'Delivered order; internal return approval is still required.' : 'Delivery is unconfirmed. This return will remain on verification hold until Admin records independent delivery evidence.'}</p>}
        <ReturnOrderSelect label="Fulfilled product and original warehouse" value={lineKey} onChange={value => { setLineKey(value); set('quantity',''); }} placeholder={optionsLoading ? 'Loading fulfilled items...' : 'Select fulfilled order item'} disabled={!orderId || optionsLoading || Boolean(optionsError)} options={lines.map(line => ({ value:`${line.order_item_id}:${line.warehouse_id}`, label:`${line.product} / ${line.warehouse} / ${line.unit} / ${line.remaining_returnable_quantity} returnable`, disabled:line.remaining_returnable_quantity === 0 }))} />
        {optionsLoading && <p role="status" className="text-sm text-slate-600 dark:text-slate-400">Loading fulfilled items and original warehouse...</p>}
        {optionsError && <div role="alert" className="text-sm text-rose-700 dark:text-rose-300"><p>{optionsError}</p><button type="button" onClick={() => void loadOptions(orderId)} className={button}>Retry item lookup</button></div>}
        {orderId && !optionsLoading && !optionsError && lines.length > 0 && lines.every(line => line.remaining_returnable_quantity === 0) && <p role="status" className="text-sm text-amber-800 dark:text-amber-200">No remaining returnable quantity. Prior or pending returns have reserved the fulfilled balance.</p>}
        {orderId && !optionsLoading && !optionsError && !lines.length && <p className="text-sm text-slate-600 dark:text-slate-400">No eligible fulfilled items were found. A matching Stock Out record, supported catalog unit, and original inventory/warehouse identity are required; a Delivered order status alone is insufficient.</p>}
        {currentLine && <dl className="grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900">{Object.entries({ Fulfilled:currentLine.fulfilled_quantity,'Previously reserved / returned':currentLine.previously_returned_quantity,Returnable:currentLine.remaining_returnable_quantity }).map(([title,value]) => <div key={title}><dt className="text-xs">{title}</dt><dd className="mt-1 font-semibold">{value} {currentLine.unit}</dd></div>)}</dl>}
        <label className="block text-sm font-medium">Requested Return Quantity<input type="number" min="1" max={currentLine?.remaining_returnable_quantity} step="1" required value={form.quantity ?? ''} onChange={event => set('quantity',event.target.value)} className={input} /></label>
        <ReturnOrderSelect label="Return reason" value={form.reason ?? ''} onChange={value => set('reason',value)} placeholder="Select reason" disabled={optionsLoading || !orderInfo} options={reasons.map(reason => ({ value:reason, label:label(reason) }))} />
        <button type="submit" disabled={busy || optionsLoading || Boolean(optionsError) || !currentLine || !Number.isInteger(Number(form.quantity)) || Number(form.quantity) < 1 || Number(form.quantity) > currentLine.remaining_returnable_quantity || !reasons.includes(form.reason)} className={button}>{busy ? 'Registering…' : 'Register Return Request'}</button>
      </form> : detailLoading ? <p role="status">Loading current return details…</p> : detailFailed ? <button type="button" className={button} onClick={() => selected && void open(selected)}>Retry loading details</button> : selected && <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">{Object.entries({ Order:selected.order_no,Customer:selected.customer,Product:selected.product,Warehouse:selected.warehouse,Unit:selected.unit,Status:label(selected.status),Reason:label(selected.reason),Requested:selected.requested_quantity,Received:selected.received_quantity,'Date received':selected.received_at ? new Date(selected.received_at).toLocaleString() : 'Not received','Inspection date':selected.inspected_at ? new Date(selected.inspected_at).toLocaleString() : 'Not inspected',Restockable:selected.passed_quantity,'Failed / disposal':selected.failed_quantity,Restocked:selected.restocked_quantity,Disposed:selected.disposed_quantity,Quarantine:selected.quarantine_quantity,'QA inspector':selected.qa_inspector ?? 'Not assigned',Verification:label(selected.verification_status),'Restock state':label(selected.restock_status),'Disposal state':label(selected.disposal_status) }).map(([title,value]) => <div key={title} className="min-w-0"><dt className="text-xs text-slate-600 dark:text-slate-400">{title}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>
        {selected.qa_findings && <p className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900">QA findings: {selected.qa_findings}<br />Suitability / handling policy: {selected.suitability_reference}</p>}
        {selected.receipt_shortage_reason && <p className="text-sm">Unreceived balance: {selected.requested_quantity-selected.received_quantity} {selected.unit}. {selected.receipt_shortage_reason}</p>}
        <div className="flex flex-wrap gap-2">{actionChoices.map(value => <button key={value} type="button" disabled={busy} onClick={() => void chooseAction(value)} className={button}>{({ approve:'Verify & Approve Return',reject:'Reject Return',cancel:'Cancel Return',receive:'Receive Return',inspect:'Inspect Return',restock:'Stock In Passed Quantity',dispose:'Document Completed Disposal' } as Record<string,string>)[value]}</button>)}</div>
        {action && <form onSubmit={event => { event.preventDefault(); void submit(); }} className="space-y-3 rounded-xl border border-slate-300 p-4 dark:border-slate-700"><h3 className="font-semibold">{label(action)}</h3>
          {action === 'approve' && <>{textField('verification_reference','Delivery / ownership verification reference')}<label className="flex gap-2 text-sm"><input type="checkbox" required checked={form.delivery_verified === '1'} onChange={event => set('delivery_verified',event.target.checked ? '1' : '0')} />I verified delivery and the customer return using independent evidence. This does not change the original order status.</label></>}
          {['reject','cancel','dispose'].includes(action) && textField('reason','Documented reason')}
          {action === 'receive' && <>{textField('quantity','Actual received quantity','number')}{textField('received_at','Date received','date')}<label className="block text-sm">Physical condition<select required value={form.condition ?? ''} onChange={event => set('condition',event.target.value)} className={input}><option value="">Select condition</option>{['SEALED','DAMAGED','OPENED','LEAKING','OTHER'].map(value => <option key={value}>{value}</option>)}</select></label><label className="block text-sm">Assign QA Supervisor<select required value={form.qa_user_id ?? ''} onChange={event => set('qa_user_id',event.target.value)} className={input}><option value="">Select QA</option>{qaUsers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label className="block text-sm">Unreceived-balance explanation (required for a short receipt)<textarea value={form.shortage_reason ?? ''} onChange={event => set('shortage_reason',event.target.value)} maxLength={2000} className={input} /></label><p className="text-sm">Received goods go to Returned Products Area quarantine only.</p></>}
          {action === 'inspect' && <>{textField('passed_quantity','Passed / restockable quantity','number')}{textField('failed_quantity','Failed / for disposal quantity','number')}{textField('findings','QA findings')}{textField('policy_reference','Applicable QA / chemical storage suitability policy reference')}<label className="flex gap-2 text-sm"><input type="checkbox" checked={form.suitability_confirmed === '1'} onChange={event => set('suitability_confirmed',event.target.checked ? '1' : '0')} />I verified restocking suitability, including chemical/product condition and storage policy. Intact packaging alone is insufficient.</label><p className="text-sm">Passed + failed must equal {selected.received_quantity} {selected.unit}. QA completion does not increase available stock.</p></>}
          {action === 'dispose' && <>{textField('disposal_date','Actual disposal date','date')}{textField('policy_reference','Approved disposal / regulated handling record reference')}<label className="flex gap-2 text-sm"><input type="checkbox" required checked={form.physical_disposal_confirmed === '1'} onChange={event => set('physical_disposal_confirmed',event.target.checked ? '1' : '0')} />As Admin, I authorize and document completed physical disposal under the applicable handling policy. This records {selected.failed_quantity} {selected.unit}; it does not perform or instruct physical disposal.</label></>}
          {action === 'restock' && <p className="text-sm">Move exactly {selected.passed_quantity} {selected.unit} from this return's quarantine to available stock in {selected.warehouse}. Warehouse capacity and duplicate-movement checks apply.</p>}
          {['approve','receive','inspect','dispose'].includes(action) && <label className="block text-sm">Supporting evidence (JPG/PNG/PDF, 5 MB each, up to 5)<input type="file" multiple required accept=".jpg,.jpeg,.png,.pdf" onChange={event => setFiles(Array.from(event.target.files ?? []))} className={input} /></label>}
          <button type="submit" disabled={busy} className={button}>{busy ? 'Saving…' : 'Confirm '+label(action)}</button>
        </form>}
        {['approve','receive','inspect','dispose'].map(stage => {
          const evidence = selected.evidence?.filter(file => file.stage === stage) ?? [];
          return evidence.length > 0 ? <EvidenceGallery key={stage} attachments={evidence} receivingId={selected.id} title={`${label(stage)} evidence`} description="Private customer-return documents for this stage only. Up to 5 files per action." showDownload /> : null;
        })}
        <section><h3 className="font-semibold">Return History</h3><ol className="mt-3 space-y-3">{selected.events?.map(event => <li key={event.id} className="border-l-2 border-cyan-500/40 pl-3 text-sm"><strong>{label(event.action)}</strong><p className="text-xs text-slate-600 dark:text-slate-400">{event.actor} · {new Date(event.created_at).toLocaleString()}</p><p className="mt-1 break-words text-xs">{Object.entries(event.details).map(([key,value]) => `${label(key)}: ${String(value)}`).join(' · ')}</p></li>)}</ol></section>
      </div>}
    </ReturnDialog>}
  </section>;
}

export default function CustomerReturnWorkspace({ mode, normalLabel, children }: { mode: Mode; normalLabel: string; children: ReactNode }) {
  const [tab,setTab] = useState<'normal' | 'returns'>('normal');
  const [returnsVisited,setReturnsVisited] = useState(false);
  return <div className="min-w-0">
    <nav aria-label="Workflow selection" className="flex flex-wrap gap-2 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#0d1322]">
      {(['normal','returns'] as const).map(value => <button key={value} type="button" aria-pressed={tab === value} aria-controls={`customer-return-${mode}-${value}`} onClick={() => { setTab(value); if (value === 'returns') setReturnsVisited(true); }} className={`${button} ${tab === value ? 'border-cyan-600 font-semibold ring-1 ring-cyan-600' : ''}`}>
        {value === 'normal' ? normalLabel : returnTabLabel(mode)}
      </button>)}
    </nav>
    <div id={`customer-return-${mode}-normal`} hidden={tab !== 'normal'}>{children}</div>
    <div id={`customer-return-${mode}-returns`} hidden={tab !== 'returns'}>{returnsVisited && <CustomerReturns mode={mode} />}</div>
  </div>;
}
