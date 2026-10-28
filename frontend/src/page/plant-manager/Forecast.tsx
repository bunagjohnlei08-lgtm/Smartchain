import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Brain, RefreshCw, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '@/components/layout/PageContainer';
import { loadForecastRecommendations, wholePackage, type ForecastRecommendation } from '../../lib/forecastRecommendations';

const quantity = (value: number | undefined, unit: string) => `${(value ?? 0).toLocaleString()} ${unit}`;
const Forecast: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ForecastRecommendation[]>([]);
  const [scope, setScope] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await loadForecastRecommendations();
      setRows(response.data); setScope(response.scope); setWarehouse(response.warehouse?.name ?? 'Assigned warehouse');
    } catch (cause: any) {
      setRows([]);
      setError(cause?.response?.data?.message || 'Forecast recommendations are unavailable. Please try again.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => rows.filter((row) => row.product_name.toLowerCase().includes(search.toLowerCase())), [rows, search]);
  const actionable = rows.filter((row) => row.actionable && !row.stale).length;

  return <PageContainer><div className="min-w-0 space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">{warehouse}</p><h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">AI Forecast</h1><p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">Four-week demand decision support with whole-package reorder planning.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)] focus-visible:outline-2 focus-visible:outline-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>Refresh</button>
    </header>

    <section className="grid gap-3 sm:grid-cols-3" aria-label="Forecast summary">
      {[['Forecast products', rows.length], ['Actionable reorders', actionable], ['Planning horizon', '4 weeks']].map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4"><p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</p><p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{value}</p></div>)}
    </section>

    <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-[var(--text-secondary)]"><div className="flex items-start gap-3"><Brain className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600 dark:text-cyan-400"/><div><p className="font-semibold text-[var(--text-primary)]">Planning estimate — rounded up to whole packages</p><p className="mt-1">{scope} Raw model predictions and Global MAE remain decimal statistical values. Confirmed incoming stock is not modeled by the current workflow.</p></div></div></div>

    {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300"><p className="font-semibold">Forecast service unavailable</p><p className="mt-1">{error}</p></div>}
    {loading && <div role="status" className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center text-sm text-[var(--text-secondary)]">Loading authorized warehouse recommendations…</div>}

    {!loading && !error && <section className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
      <div className="flex flex-col gap-3 border-b border-[var(--border-color)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-[var(--text-primary)]">Product forecasts and reorder recommendations</h2><p className="text-xs text-[var(--text-muted)]">No successful forecast is never treated as zero demand.</p></div><label className="relative"><span className="sr-only">Search forecast products</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product" className="min-h-11 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] pl-9 pr-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500"/></label></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[980px]"><thead><tr className="border-b border-[var(--border-color)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]"><th className="px-4 py-3">Product</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Warehouse</th><th className="px-4 py-3 text-right">Available</th><th className="px-4 py-3 text-right">Raw 4-week demand</th><th className="px-4 py-3 text-right">Planning demand</th><th className="px-4 py-3 text-right">Recommended reorder</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
      <tbody>{visible.map((row) => <tr key={`${row.product_id}-${row.warehouse_id}`} className="border-b border-[var(--border-color)] align-top last:border-0"><td className="px-4 py-4"><p className="max-w-64 break-words font-semibold text-[var(--text-primary)]">{row.product_name}</p></td><td className="px-4 py-4 text-sm text-[var(--text-secondary)]">{row.item_classification?.replace('_', ' ') ?? '—'}</td><td className="px-4 py-4 text-sm text-[var(--text-secondary)]">{row.warehouse_name}</td><td className="px-4 py-4 text-right text-sm text-[var(--text-primary)]">{quantity(row.available_stock, row.unit)}</td><td className="px-4 py-4 text-right text-sm text-[var(--text-primary)]">{row.raw_demand === undefined ? '—' : `${row.raw_demand.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${row.unit}`}</td><td className="px-4 py-4 text-right text-sm text-[var(--text-primary)]">{row.planning_demand === undefined ? '—' : quantity(wholePackage(row.raw_demand ?? 0), row.unit)}</td><td className="px-4 py-4 text-right font-semibold text-cyan-700 dark:text-cyan-300">{row.recommended_reorder === undefined ? '—' : quantity(row.recommended_reorder, row.unit)}</td><td className="px-4 py-4"><p className="text-sm font-medium text-[var(--text-primary)]">{row.existing_request ? `${row.existing_request.reference} · ${row.existing_request.status}` : row.status.replaceAll('_', ' ')}</p>{row.stale && <p className="mt-1 text-xs font-semibold text-amber-600">Stale forecast — refresh required</p>}</td><td className="px-4 py-4 text-right"><button type="button" disabled={!row.actionable || row.stale} onClick={() => navigate(`/plant-manager/procurement?ai_product=${row.product_id}`)} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-cyan-700 px-3 text-sm font-semibold text-white hover:bg-cyan-600 focus-visible:outline-2 focus-visible:outline-cyan-500 disabled:cursor-not-allowed disabled:opacity-40">Review replenishment<ArrowRight className="h-4 w-4"/></button></td></tr>)}</tbody></table></div>
      {!visible.length && <div className="p-10 text-center text-sm text-[var(--text-secondary)]"><AlertTriangle className="mx-auto mb-3 h-6 w-6"/>No forecast rows match this search.</div>}
    </section>}
  </div></PageContainer>;
};

export default Forecast;
