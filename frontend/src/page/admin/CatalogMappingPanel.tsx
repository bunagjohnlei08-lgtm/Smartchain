import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link2, PackagePlus, Search, X } from 'lucide-react';
import { apiClient } from '../../lib/api';

type Supplier = { id: number; code: string; name: string; status: string; is_active: boolean };
type Offering = { id: number; name: string; category: string | null; description: string | null; application_number: string | null; supplier: Supplier | null; suggested_product: { id: number; name: string; category: string | null } | null };
type Option = { id: number; name: string };
type ProductMatch = { id: number; name: string; category: string | null };
type Action = { kind: 'link' | 'create'; offering: Offering };

const apiError = (cause: any, fallback: string) => {
  const errors = cause?.response?.data?.errors;
  return errors ? Object.values(errors).flat().join(' ') : cause?.response?.data?.message ?? fallback;
};
const inputClass = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white';
const readOnlyClass = 'flex h-11 w-full items-center rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300';

/** Admin review of approved suppliers' product offerings awaiting Product Catalog mapping. */
export default function CatalogMappingPanel({ warehouses, onMapped }: { warehouses: Option[]; onMapped: () => void }) {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [error, setError] = useState('');
  const [action, setAction] = useState<Action | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get<{ data: Offering[] }>('/admin/catalog-mapping/offerings');
      setOfferings(Array.isArray(data?.data) ? data.data : []);
      setError('');
    } catch (cause) {
      setError(apiError(cause, 'Unable to load supplier offerings.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!offerings.length && !error) return null;

  return <section aria-labelledby="catalog-mapping-heading" className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-500/5 sm:p-5">
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
      <h2 id="catalog-mapping-heading" className="text-base font-bold text-slate-900 dark:text-white">Supplier Offerings — Pending Catalog Mapping</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">{offerings.length} offering{offerings.length === 1 ? '' : 's'} from approved suppliers</p>
    </div>
    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Link each offering to an existing product or create a new one. Nothing is added to the catalog automatically.</p>
    {error && <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    <ul className="mt-4 grid gap-3 lg:grid-cols-2">{offerings.map((offering) => <li key={offering.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0d1322]">
      <p className="break-words font-semibold text-slate-900 dark:text-white">{offering.name}</p>
      <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{offering.category || 'No category'} · {offering.supplier?.name ?? 'Unknown supplier'}{offering.supplier && !offering.supplier.is_active ? ` (${offering.supplier.status.replaceAll('_', ' ').toLowerCase()})` : ''}</p>
      {offering.suggested_product && <p className="mt-2 text-sm text-cyan-700 dark:text-cyan-300">Suggested existing product: <span className="font-semibold">{offering.suggested_product.name}</span></p>}
      {offering.supplier && !offering.supplier.is_active && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">The supplier must be active before this offering can be mapped.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!offering.supplier?.is_active} onClick={() => setAction({ kind: 'link', offering })} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Link2 className="h-4 w-4" aria-hidden="true" />Link Existing Product</button>
        <button type="button" disabled={!offering.supplier?.is_active} onClick={() => setAction({ kind: 'create', offering })} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"><PackagePlus className="h-4 w-4" aria-hidden="true" />Create New Product</button>
      </div>
    </li>)}</ul>
    {action && <MappingDialog action={action} warehouses={warehouses} onClose={() => setAction(null)} onDone={() => { setAction(null); void load(); onMapped(); }} />}
  </section>;
}

function MappingDialog({ action, warehouses, onClose, onDone }: { action: Action; warehouses: Option[]; onClose: () => void; onDone: () => void }) {
  const { offering } = action;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(offering.suggested_product?.name ?? offering.name);
  const [matches, setMatches] = useState<ProductMatch[]>([]);
  const [productId, setProductId] = useState<number | null>(offering.suggested_product?.id ?? null);
  const [makePrimary, setMakePrimary] = useState(false);
  const [form, setForm] = useState({ name: offering.name, category: offering.category ?? '', brand: '', warehouse_id: warehouses.length === 1 ? String(warehouses[0].id) : '' });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (action.kind !== 'link') return;
    const timer = setTimeout(async () => {
      try {
        const { data } = await apiClient.get('/admin/products', { params: { search: search.trim() || undefined, per_page: 10 } });
        setMatches((Array.isArray(data?.data) ? data.data : []).map((product: any) => ({ id: Number(product.id), name: String(product.name), category: product.category ?? null })));
      } catch { setMatches([]); }
    }, 250);
    return () => clearTimeout(timer);
  }, [action.kind, search]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      if (action.kind === 'link') {
        await apiClient.post(`/admin/catalog-mapping/offerings/${offering.id}/link`, { product_id: productId, make_primary: makePrimary });
      } else {
        await apiClient.post(`/admin/catalog-mapping/offerings/${offering.id}/create-product`, { ...form, warehouse_id: Number(form.warehouse_id), unit: 'PCS' });
      }
      onDone();
    } catch (cause) {
      setError(apiError(cause, 'Unable to map this offering.'));
    } finally { setSaving(false); }
  };

  const title = action.kind === 'link' ? 'Link to Existing Product' : 'Create Product from Offering';
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby="mapping-dialog-title" className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 dark:border-slate-800 dark:bg-[#0d1322] dark:text-slate-100 sm:p-6" onClick={(event) => event.stopPropagation()}>
      <div className="mb-4 flex shrink-0 items-start justify-between gap-3"><div className="min-w-0"><h2 id="mapping-dialog-title" className="text-lg font-bold">{title}</h2><p className="mt-0.5 break-words text-sm text-slate-600 dark:text-slate-400">{offering.name} · {offering.supplier?.name}</p></div><button type="button" aria-label="Close dialog" onClick={onClose} className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
          {action.kind === 'link' ? <>
            <label className="block text-sm"><span className="mb-1.5 block text-slate-600 dark:text-slate-400">Search Product Catalog</span><span className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputClass} pl-9`} /></span></label>
            <fieldset><legend className="mb-1.5 text-sm text-slate-600 dark:text-slate-400">Select product</legend>
              <div className="max-h-56 space-y-1 overflow-y-auto">{matches.map((product) => <label key={product.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm ${productId === product.id ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-500/10' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60'}`}><input type="radio" name="product" checked={productId === product.id} onChange={() => setProductId(product.id)} className="h-4 w-4" /><span className="min-w-0 flex-1 break-words">{product.name}<span className="block text-xs text-slate-500 dark:text-slate-400">{product.category || 'No category'}{offering.suggested_product?.id === product.id ? ' · Suggested match' : ''}</span></span></label>)}{!matches.length && <p className="text-sm text-slate-500 dark:text-slate-400">No matching products.</p>}</div>
            </fieldset>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={makePrimary} onChange={(event) => setMakePrimary(event.target.checked)} className="h-4 w-4" />Make {offering.supplier?.name} the primary supplier (otherwise primary only if none is set)</label>
          </> : <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2"><span className="mb-1.5 block text-slate-600 dark:text-slate-400">Product Name *</span><input required maxLength={255} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} /></label>
            <label className="block text-sm"><span className="mb-1.5 block text-slate-600 dark:text-slate-400">Category</span><input maxLength={255} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClass} /></label>
            <label className="block text-sm"><span className="mb-1.5 block text-slate-600 dark:text-slate-400">Brand</span><input maxLength={255} value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} className={inputClass} /></label>
            <div className="text-sm"><span className="mb-1.5 block text-slate-600 dark:text-slate-400">Primary Supplier</span><span className={readOnlyClass}>{offering.supplier?.name}</span></div>
            <div className="text-sm"><span className="mb-1.5 block text-slate-600 dark:text-slate-400">Unit</span><span className={readOnlyClass}>PCS</span></div>
            <label className="block text-sm sm:col-span-2"><span className="mb-1.5 block text-slate-600 dark:text-slate-400">Warehouse *</span><select required value={form.warehouse_id} onChange={(event) => setForm({ ...form, warehouse_id: event.target.value })} className={inputClass}><option value="">Select warehouse</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
            <p className="text-xs text-slate-600 dark:text-slate-400 sm:col-span-2">An empty inventory record (0 PCS) is created, so the product appears in Plant Manager Replenishment Planning as Critical. No replenishment request is created automatically.</p>
          </div>}
        </div>
        <div className="mt-4 flex shrink-0 justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800"><button type="button" onClick={onClose} className="h-11 cursor-pointer rounded-xl px-4 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button><button disabled={saving || (action.kind === 'link' && productId === null)} className="h-11 cursor-pointer rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400">{saving ? 'Saving…' : action.kind === 'link' ? 'Link Product' : 'Create Product'}</button></div>
      </form>
    </div>
  </div>;
}
