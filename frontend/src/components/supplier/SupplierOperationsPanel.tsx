import { useCallback, useEffect, useState } from 'react';
import { Award, CheckCircle2, PackageCheck, RefreshCw, Truck, X } from 'lucide-react';
import { apiClient } from '../../lib/api';

type Order = {
  id: number; po_number: string; award_reference: string | null; rfq_reference: string | null;
  issue_date: string; currency: string; total_amount: string; expected_delivery_date: string;
  delivery_details: string; tax_included: boolean; freight_included: boolean;
  commercial_terms: string | null; status: string;
  acknowledgment: null | { action: string; remarks: string | null; acted_at: string };
  items: { id: number; product_name: string; unit: string; ordered_quantity: number; unit_price: string; total_price: string; quantity_received: number; quantity_accepted: number; quantity_rejected: number; remaining_quantity: number }[];
  deliveries: { reference: string; delivery_date: string; delivery_status: string; inspection_status: string | null }[];
};
type Performance = { overall_score: number | null; recognition: string | null; scoring_message: string; metrics: Record<string, number | null>; counts: Record<string, number> };
type HistoryRow = { id: number; recognition_tier: string | null; calculated_at: string };
type Props = { view: 'orders' | 'deliveries' | 'performance'; onMessage: (value: string) => void; onError: (value: string) => void };

const button = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus:outline-none focus:ring-4 focus:ring-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50';
const card = 'rounded-2xl border border-slate-800 bg-slate-900/80 shadow-[0_20px_60px_-40px_rgba(8,145,178,.5)]';
const date = (value: string) => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(value));

export default function SupplierOperationsPanel({ view, onMessage, onError }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Order | null>(null);
  const [action, setAction] = useState('RECEIVED');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (view === 'performance') {
        const response = await apiClient.get('/supplier-account/performance');
        setPerformance(response.data.data);
        setHistory(response.data.history || []);
      } else {
        const response = await apiClient.get('/supplier-account/purchase-orders');
        setOrders(response.data.data || []);
      }
      onError('');
    } catch (requestError: any) {
      onError(requestError?.response?.data?.message || 'Supplier operations could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [onError, view]);

  useEffect(() => { void load(); }, [load]);

  const acknowledge = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await apiClient.post(`/supplier-account/purchase-orders/${selected.id}/acknowledgments`, {
        action, remarks: remarks || null, idempotency_key: crypto.randomUUID(),
      });
      onMessage('Purchase Order response recorded and routed to Procurement.');
      setSelected(null); setRemarks(''); await load();
    } catch (requestError: any) {
      onError(requestError?.response?.data?.message || (Object.values(requestError?.response?.data?.errors || {}).flat()[0] as string) || 'Response could not be recorded.');
    } finally { setBusy(false); }
  };

  if (loading) return <div role="status" className={`${card} grid min-h-48 place-items-center p-8 text-center`}><div><RefreshCw className="mx-auto h-6 w-6 animate-spin text-cyan-400" /><p className="mt-3 text-sm font-semibold">Loading authorized records…</p></div></div>;

  if (view === 'performance') return <section className="space-y-4">
    <div className={`${card} p-5 lg:p-6`}><h3 className="flex items-center gap-2 text-lg font-bold text-white"><Award className="h-5 w-5 text-amber-300" />Verified performance</h3><p className="mt-2 text-sm leading-6 text-slate-400">Scores use completed PO, warehouse receiving, and QA records only.</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><Metric label="Current score" value={performance?.overall_score == null ? 'Not yet rated' : `${performance.overall_score}/100`} featured /><Metric label="Recognition tier" value={performance?.recognition || 'Not Yet Rated'} featured /><Metric label="Completed transactions" value={String(performance?.counts?.eligible_purchase_orders || 0)} featured /></div>{performance?.scoring_message && <p className="mt-4 text-sm leading-6 text-slate-300">{performance.scoring_message}</p>}</div>
    <div className="grid gap-3 sm:grid-cols-3"><MetricCard label="On-time delivery" value={pct(performance?.metrics?.on_time_delivery)} /><MetricCard label="QA acceptance" value={pct(performance?.metrics?.qa_acceptance)} /><MetricCard label="Fulfillment" value={pct(performance?.metrics?.fulfillment)} /></div>
    <div className={`${card} p-5 lg:p-6`}><h3 className="font-bold text-white">Recognition history</h3>{history.length ? <ul className="mt-3 space-y-2">{history.map((row) => <li key={row.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300"><span className="font-semibold text-white">{row.recognition_tier || 'Not Yet Rated'}</span> · {date(row.calculated_at)}</li>)}</ul> : <p className="mt-2 text-sm leading-6 text-slate-400">No approved performance snapshots yet. Draft policy thresholds do not create official rewards.</p>}</div>
  </section>;

  const visible = view === 'deliveries' ? orders.filter((order) => order.deliveries.length) : orders;
  return <section className="space-y-4">
    <div className={`${card} p-5`}><h3 className="flex items-center gap-2 text-lg font-bold text-white">{view === 'orders' ? <PackageCheck className="h-5 w-5 text-cyan-300" /> : <Truck className="h-5 w-5 text-cyan-300" />}{view === 'orders' ? 'Authorized purchase orders' : 'Warehouse-confirmed deliveries'}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{view === 'orders' ? 'Only Purchase Orders issued to your company are shown.' : 'Quantities are warehouse and QA confirmed; supplier acknowledgment is not proof of delivery.'}</p></div>
    {visible.map((order) => <article key={order.id} className={`${card} p-5 lg:p-6`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-sm text-cyan-400">{order.po_number}</p><h3 className="mt-1 break-words font-bold text-white">{order.rfq_reference || 'Direct purchase'} · {order.award_reference || 'No award reference'}</h3></div><span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">{order.status}</span></div>
      {view === 'orders' ? <><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><Metric label="Issue date" value={date(order.issue_date)} /><Metric label="Expected delivery" value={date(order.expected_delivery_date)} /><Metric label="Total" value={`${order.currency} ${order.total_amount}`} /><Metric label="Acknowledgment" value={order.acknowledgment?.action.replaceAll('_', ' ') || 'Awaiting response'} /></dl><LineTable order={order} /><details className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300"><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-white">Commercial and delivery terms</summary><p>{order.delivery_details}</p><p className="mt-2">Taxes {order.tax_included ? 'included' : 'excluded'} · Freight {order.freight_included ? 'included' : 'excluded'}</p><p className="mt-2">{order.commercial_terms || 'No additional approved terms.'}</p></details><button disabled={!['Sent to Supplier', 'Partially Received'].includes(order.status)} onClick={() => setSelected(order)} className={`${button} mt-4 bg-cyan-600 text-white hover:bg-cyan-500`}>Respond to PO</button></> : <div className="mt-4 space-y-3">{order.items.map((item) => <div key={item.id} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm sm:grid-cols-2 lg:grid-cols-5"><Metric label="Product" value={`${item.product_name} (${item.unit})`} /><Metric label="Received" value={String(item.quantity_received)} /><Metric label="Accepted" value={String(item.quantity_accepted)} /><Metric label="Rejected" value={String(item.quantity_rejected)} /><Metric label="Remaining" value={String(item.remaining_quantity)} /></div>)}{order.deliveries.map((delivery) => <p key={delivery.reference} className="rounded-xl bg-slate-950/60 p-3 text-sm leading-6 text-slate-400"><span className="font-mono text-cyan-400">{delivery.reference}</span> · {delivery.delivery_status} · QA {delivery.inspection_status || 'pending'} · warehouse confirmed</p>)}</div>}
    </article>)}
    {!visible.length && <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-800 text-cyan-300">{view === 'orders' ? <PackageCheck className="h-5 w-5" /> : <Truck className="h-5 w-5" />}</span><h3 className="mt-4 font-bold text-white">No authorized records available</h3><p className="mt-2 text-sm text-slate-400">Records assigned to your supplier account will appear here.</p></div></div>}
    {selected && <div role="dialog" aria-modal="true" aria-labelledby="po-response-title" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm"><div className="my-auto w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-cyan-400">Purchase order response</p><h2 id="po-response-title" className="mt-1 text-lg font-bold">Respond to {selected.po_number}</h2></div><button type="button" onClick={() => setSelected(null)} aria-label="Close purchase order response" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-4 focus:ring-cyan-400/20"><X className="h-5 w-5" /></button></div><label className="mt-4 block text-sm font-semibold">Response<select value={action} onChange={(event) => setAction(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/15"><option value="RECEIVED">Acknowledge receipt</option><option value="ACCEPTED">Confirm acceptance</option><option value="CLARIFICATION_REQUESTED">Request clarification</option><option value="DECLINED">Unable to fulfill</option></select></label><label className="mt-4 block text-sm font-semibold">Remarks<textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} className="mt-1.5 min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-slate-100 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/15" maxLength={3000} /></label><p className="mt-3 text-xs leading-5 text-slate-400">This response does not change approved quantities, prices, receiving, QA, or inventory.</p><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={() => setSelected(null)} className={`${button} border border-slate-700 hover:bg-slate-800`}>Cancel</button><button disabled={busy || (['CLARIFICATION_REQUESTED', 'DECLINED'].includes(action) && !remarks.trim())} onClick={() => void acknowledge()} className={`${button} bg-cyan-600 text-white hover:bg-cyan-500`}><CheckCircle2 className="h-4 w-4" />{busy ? 'Recording…' : 'Confirm response'}</button></div></div></div>}
  </section>;
}

function LineTable({ order }: { order: Order }) {
  return <div className="mt-5 overflow-x-auto rounded-xl border border-slate-800"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Product</th><th className="px-3 py-3">Quantity</th><th className="px-3 py-3">Unit price</th><th className="px-3 py-3">Line total</th><th className="px-3 py-3">Received</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id} className="border-t border-slate-800 text-slate-300"><td className="px-3 py-3 font-medium text-white">{item.product_name}</td><td className="px-3">{item.ordered_quantity} {item.unit}</td><td className="px-3">{order.currency} {item.unit_price}</td><td className="px-3">{order.currency} {item.total_price}</td><td className="px-3">{item.quantity_received} {item.unit}</td></tr>)}</tbody></table></div>;
}
function Metric({ label, value, featured = false }: { label: string; value: string; featured?: boolean }) { return <div className={featured ? 'rounded-xl border border-slate-800 bg-slate-950/70 p-4' : ''}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-100">{value}</dd></div>; }
function MetricCard({ label, value }: { label: string; value: string }) { return <dl className={`${card} p-5`}><Metric label={label} value={value} /></dl>; }
function pct(value: number | null | undefined) { return value == null ? 'Not available' : `${value.toFixed(2)}%`; }
