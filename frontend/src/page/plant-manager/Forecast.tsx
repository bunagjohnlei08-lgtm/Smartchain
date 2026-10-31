import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Brain, CalendarDays, PackageCheck, RefreshCw, Search, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PageContainer from '@/components/layout/PageContainer';
import { loadForecastRecommendations, type ForecastRecommendation } from '../../lib/forecastRecommendations';

const qty = (value: number | undefined, unit: string) => value === undefined ? 'Unavailable' : `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${unit}`;
const rowKey = (row: ForecastRecommendation) => `${row.product_id}-${row.warehouse_id}`;
const unitColor = (unit: string) => ({ DRUM: '#10B981', PCS: '#A855F7', SACK: '#F59E0B' }[unit.toUpperCase()] ?? '#0891B2');
const shortDate = (date: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const generatedDate = (date?: string) => date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : 'Unavailable';

const Forecast: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ForecastRecommendation[]>([]);
  const [scope, setScope] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [search, setSearch] = useState('');
  const [selectorSearch, setSelectorSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<'reorder' | 'product'>('reorder');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await loadForecastRecommendations();
      setRows(response.data); setScope(response.scope); setWarehouse(response.warehouse?.name ?? 'Assigned warehouse');
    } catch (cause: any) {
      setRows([]); setError(cause?.response?.data?.message || 'Forecast recommendations are unavailable. Please try again.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const suggestions = useMemo(() => rows.filter((row) => (row.recommended_reorder ?? 0) > 0), [rows]);
  const forecastProducts = useMemo(() => rows.filter((row) => row.forecast?.length), [rows]);
  const horizon = Math.max(0, ...rows.map((row) => row.horizon_weeks ?? row.forecast?.length ?? 0));
  const selectorRows = useMemo(() => forecastProducts.filter((row) => row.product_name.toLowerCase().includes(selectorSearch.trim().toLowerCase())), [forecastProducts, selectorSearch]);

  useEffect(() => {
    if (!forecastProducts.length) { setSelectedKey(''); return; }
    if (!forecastProducts.some((row) => rowKey(row) === selectedKey)) setSelectedKey(rowKey(forecastProducts[0]));
  }, [forecastProducts, selectedKey]);

  const selected = forecastProducts.find((row) => rowKey(row) === selectedKey);
  const chartData = selected?.forecast?.map((point) => ({ week: shortDate(point.week_start), weekStart: point.week_start, demand: point.expected_quantity })) ?? [];
  const visible = useMemo(() => {
    const filtered = (showAll ? rows : suggestions).filter((row) => row.product_name.toLowerCase().includes(search.trim().toLowerCase()));
    return [...filtered].sort((a, b) => sort === 'product' ? a.product_name.localeCompare(b.product_name) : (b.recommended_reorder ?? -1) - (a.recommended_reorder ?? -1));
  }, [rows, suggestions, search, showAll, sort]);
  const summary = [
    { label: 'Forecast Products', value: forecastProducts.length, icon: TrendingUp },
    { label: 'Reorder Suggestions', value: suggestions.length, icon: PackageCheck },
    { label: 'Forecast Horizon', value: horizon ? `${horizon} weeks` : 'Unavailable', icon: CalendarDays },
  ];

  return <PageContainer><div className="min-w-0 space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">{warehouse}</p><h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">AI Forecast Insights</h1><p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">Visual demand planning and reorder decision support for your assigned warehouse.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)] focus-visible:outline-2 focus-visible:outline-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>Refresh AI</button>
    </header>

    <section className="grid gap-3 sm:grid-cols-3" aria-label="Forecast summary">
      {summary.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</p><Icon className="h-5 w-5 text-cyan-600 dark:text-cyan-400" aria-hidden="true"/></div><p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{value}</p></div>)}
    </section>

    <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-[var(--text-secondary)]"><div className="flex items-start gap-3"><Brain className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600 dark:text-cyan-400"/><div><p className="font-semibold text-[var(--text-primary)]">Planning estimate — rounded up to whole packages</p><p className="mt-1">{scope} Raw model predictions and Global MAE remain decimal statistical values. Confirmed incoming stock is not modeled by the current workflow.</p></div></div></div>
    {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300"><p className="font-semibold">Forecast service unavailable</p><p className="mt-1">{error}</p></div>}
    {loading && <div role="status" className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center text-sm text-[var(--text-secondary)]">Loading authorized warehouse recommendations…</div>}

    {!loading && !error && <>
      <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-5" aria-labelledby="weekly-demand-title">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h2 id="weekly-demand-title" className="text-lg font-semibold text-[var(--text-primary)]">Weekly demand forecast</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Select a product to inspect its model-provided weekly demand.</p></div><div className="grid w-full gap-2 sm:grid-cols-2 lg:max-w-xl">
          <label className="relative"><span className="sr-only">Search products for chart</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"/><input value={selectorSearch} onChange={(event) => setSelectorSearch(event.target.value)} placeholder="Search chart products" className="min-h-11 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] pl-9 pr-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500"/></label>
          <label><span className="sr-only">Product shown in weekly demand chart</span><select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} disabled={!selectorRows.length} className="min-h-11 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50">{selectorRows.map((row) => <option key={rowKey(row)} value={rowKey(row)}>{row.product_name} · {row.unit}</option>)}</select></label>
        </div></div>
        {selected && chartData.length ? <>
          <div className="mt-5 w-full min-w-0 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface-alt)] p-2 sm:p-3" role="img" aria-label={`${selected.product_name} weekly demand forecast in ${selected.unit}`}>
            <div className="h-[280px] min-h-[280px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={280} minWidth={0}>
                <LineChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false}/>
                  <XAxis dataKey="week" stroke="#94A3B8" tick={{ fontSize: 12 }} tickLine={false} axisLine={false}/>
                  <YAxis stroke="#94A3B8" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={48} domain={[0, 'auto']}/>
                  <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.weekStart ? `Week of ${shortDate(payload[0].payload.weekStart)}` : ''} formatter={(value) => [`${typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : value ?? 'Unavailable'} ${selected.unit}`, 'Expected demand']} contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', borderRadius: 12, color: 'var(--text-primary)' }}/>
                  <Legend formatter={() => `${selected.product_name} · Expected demand (${selected.unit})`} wrapperStyle={{ color: 'var(--text-secondary)', fontSize: 12 }}/>
                  <Line type="monotone" dataKey="demand" name="Expected demand" stroke={unitColor(selected.unit)} strokeWidth={3} dot={{ r: 5, fill: unitColor(selected.unit), stroke: 'var(--bg-card)', strokeWidth: 2 }} activeDot={{ r: 7 }} isAnimationActive={false}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Available stock', qty(selected.available_stock, selected.unit)], [`${selected.horizon_weeks ?? chartData.length}-week demand`, qty(selected.raw_demand, selected.unit)], ['Recommended reorder', qty(selected.recommended_reorder, selected.unit)], ['Forecast generated', generatedDate(selected.generated_at)]].map(([label, value]) => <div key={label} className="rounded-xl bg-[var(--bg-surface-alt)] p-3"><dt className="text-xs font-semibold text-[var(--text-muted)]">{label}</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{value}</dd></div>)}</dl>
        </> : <div className="mt-5 rounded-xl border border-dashed border-[var(--border-color)] p-10 text-center text-sm text-[var(--text-secondary)]"><TrendingUp className="mx-auto mb-3 h-6 w-6"/><p className="font-semibold text-[var(--text-primary)]">Weekly forecast unavailable</p><p className="mt-1">No successful weekly model values are available for this product selection.</p></div>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]" aria-labelledby="insights-title">
        <div className="flex flex-col gap-3 border-b border-[var(--border-color)] p-4 lg:flex-row lg:items-end lg:justify-between"><div><h2 id="insights-title" className="font-semibold text-[var(--text-primary)]">Reorder insights</h2><p className="text-xs text-[var(--text-muted)]">{showAll ? 'Showing all forecast products.' : 'Showing products with positive reorder suggestions.'}</p></div><div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative"><span className="sr-only">Search forecast products</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product" className="min-h-11 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] pl-9 pr-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500 sm:w-52"/></label>
          <label><span className="sr-only">Sort reorder insights</span><select value={sort} onChange={(event) => setSort(event.target.value as 'reorder' | 'product')} className="min-h-11 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-500"><option value="reorder">Highest reorder</option><option value="product">Product A–Z</option></select></label>
          <button type="button" onClick={() => setShowAll((current) => !current)} className="min-h-11 cursor-pointer rounded-xl border border-[var(--border-color)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-alt)] focus-visible:outline-2 focus-visible:outline-cyan-500">{showAll ? 'Show Suggestions Only' : 'Show All Products'}</button>
        </div></div>
        <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Reorder insights table, horizontally scrollable"><table className="forecast-insights-table w-full min-w-[860px]"><thead><tr className="border-b border-[var(--border-color)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]"><th scope="col" className="px-4 py-3">Product</th><th scope="col" className="px-4 py-3 text-right">Forecast demand</th><th scope="col" className="px-4 py-3 text-right">Available</th><th scope="col" className="px-4 py-3 text-right">Reorder</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3 text-right">Action</th></tr></thead>
          <tbody>{visible.map((row) => <tr key={rowKey(row)} className="border-b border-[var(--border-color)] align-middle last:border-0"><th scope="row" className="px-4 py-4 text-left"><p className="max-w-64 break-words font-semibold text-[var(--text-primary)]">{row.product_name}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{row.warehouse_name} · {row.unit}</p></th><td className="px-4 py-4 text-right text-sm text-[var(--text-primary)]">{qty(row.raw_demand, row.unit)}</td><td className="px-4 py-4 text-right text-sm text-[var(--text-primary)]">{qty(row.available_stock, row.unit)}</td><td className="px-4 py-4 text-right font-semibold" style={{ color: unitColor(row.unit) }}>{qty(row.recommended_reorder, row.unit)}</td><td className="px-4 py-4"><p className="text-sm font-medium text-[var(--text-primary)]">{row.existing_request ? `${row.existing_request.reference} · ${row.existing_request.status}` : row.status.replaceAll('_', ' ')}</p>{row.stale && <p className="mt-1 text-xs font-semibold text-amber-600">Stale forecast — refresh required</p>}</td><td className="px-4 py-4 text-right"><button type="button" disabled={!row.actionable || row.stale} onClick={() => navigate(`/plant-manager/procurement?ai_product=${row.product_id}`)} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white transition-colors enabled:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-cyan-500 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-cyan-500 dark:enabled:hover:bg-cyan-400">{row.existing_request ? 'View Request' : 'Review Replenishment'}<ArrowRight className="h-4 w-4"/></button></td></tr>)}</tbody></table></div>
        {!visible.length && <div className="p-10 text-center text-sm text-[var(--text-secondary)]"><AlertTriangle className="mx-auto mb-3 h-6 w-6"/>{search ? 'No forecast rows match this search.' : showAll ? 'No forecast products are available.' : 'No products currently have a positive reorder suggestion.'}</div>}
      </section>
    </>}
  </div></PageContainer>;
};

export default Forecast;
