import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Plus, Save, Trash2 } from 'lucide-react';
import { apiClient } from '../../lib/api';

type Option = { id: number; name: string; unit: string };
type Material = { product_id: number; required_quantity: string; product: Option };
type Bom = { id: number; product_id: number; output_quantity: number; materials: Material[]; product: Option };
type Data = { data: Bom[]; finished_products: Option[]; raw_materials: Option[] };
const input = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:text-sm';
const errorText = (error: unknown) => { const cause = error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }; return cause.response?.data?.errors ? Object.values(cause.response.data.errors).flat().join(' ') : cause.response?.data?.message ?? 'Unable to save the formula.'; };

export default function Boms() {
  const location = useLocation();
  const [data, setData] = useState<Data>({ data: [], finished_products: [], raw_materials: [] });
  const [productId, setProductId] = useState(new URLSearchParams(location.search).get('product_id') ?? '');
  const [outputQuantity, setOutputQuantity] = useState('1');
  const [materials, setMaterials] = useState<Array<{ product_id: string; required_quantity: string }>>([]);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await apiClient.get<Data>('/admin/boms'); setData(response.data); }
    catch (cause) { setError(errorText(cause)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const bom = data.data.find(item => String(item.product_id) === productId);
    setOutputQuantity(String(bom?.output_quantity ?? 1));
    setMaterials(bom?.materials.map(item => ({ product_id: String(item.product_id), required_quantity: item.required_quantity })) ?? []);
  }, [productId, data]);
  const product = data.finished_products.find(item => String(item.id) === productId);
  const currentBom = data.data.find(item => String(item.product_id) === productId);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    const payload = { product_id: Number(productId), output_quantity: Number(outputQuantity), materials: materials.map(item => ({ product_id: Number(item.product_id), required_quantity: item.required_quantity })) };
    try {
      if (currentBom) await apiClient.put(`/admin/boms/${currentBom.id}`, payload); else await apiClient.post('/admin/boms', payload);
      setNotice('Formula saved. Existing production batches retain their original material requirements.'); await load();
    } catch (cause) { setError(errorText(cause)); } finally { setSaving(false); }
  };
  return <main className="space-y-6 p-4 text-slate-900 dark:text-slate-100 sm:p-6">
    <header><h1 className="text-2xl font-bold">BOM / Formulas</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">Define raw materials for an internally produced finished product. Its supplier replenishment process remains available.</p></header>
    <div className="flex flex-wrap gap-3 text-sm"><Link to="/admin/product-catalog" className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 dark:border-slate-700">Product Catalog</Link><Link to="/admin/production" className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 dark:border-slate-700">Production Oversight</Link></div>
    {loading && <p role="status">Loading formulas…</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">{notice}</p>}
    {!loading && <form onSubmit={save} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0d1322] sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm"><span className="mb-2 block">Finished Product *</span><select required value={productId} onChange={event => { setProductId(event.target.value); setNotice(''); }} className={input}><option value="">Select finished product</option>{data.finished_products.map(item => <option key={item.id} value={item.id}>{item.name} — {item.unit}{data.data.some(bom => bom.product_id === item.id) ? ' · BOM configured' : ''}</option>)}</select></label><label className="block text-sm"><span className="mb-2 block">Formula output quantity ({product?.unit ?? 'stock units'}) *</span><input required type="number" min={1} max={1000000} step={1} value={outputQuantity} onChange={event => setOutputQuantity(event.target.value)} className={input}/></label></div>
      {!data.finished_products.length && <p className="text-sm text-amber-800 dark:text-amber-300">Add a Finished Product in Product Catalog first.</p>}
      {!data.raw_materials.length && <p className="text-sm text-amber-800 dark:text-amber-300">Classify actual raw materials in Product Catalog before adding formula ingredients.</p>}
      <fieldset className="space-y-3"><legend className="mb-3 font-semibold">Raw Materials</legend>{materials.map((material, index) => {
        const raw = data.raw_materials.find(item => String(item.id) === material.product_id);
        return <div key={index} className="grid min-w-0 gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-[1fr_1fr_auto]">
          <label className="block text-sm"><span className="mb-1.5 block">Material {index + 1} *</span><select required value={material.product_id} onChange={event => setMaterials(old => old.map((item, row) => row === index ? { ...item, product_id: event.target.value } : item))} className={input}><option value="">Select raw material</option>{data.raw_materials.map(item => <option key={item.id} value={item.id}>{item.name} — {item.unit}</option>)}</select></label>
          <label className="block text-sm"><span className="mb-1.5 block">Required quantity ({raw?.unit ?? 'stock units'}) *</span><input required type="number" min="0.000001" max="1000000" step="0.000001" value={material.required_quantity} onChange={event => setMaterials(old => old.map((item, row) => row === index ? { ...item, required_quantity: event.target.value } : item))} className={input}/></label>
          <button type="button" onClick={() => setMaterials(old => old.filter((_, row) => row !== index))} aria-label={`Remove material ${index + 1}`} className="min-h-11 min-w-11 self-end rounded-xl border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"><Trash2 className="mx-auto h-4 w-4"/></button>
        </div>;
      })}</fieldset>
      <button type="button" disabled={!data.raw_materials.length} onClick={() => setMaterials(old => [...old, { product_id: '', required_quantity: '1' }])} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 disabled:opacity-50 dark:border-slate-700"><Plus className="h-4 w-4"/>Add Raw Material</button>
      <p className="max-w-3xl text-xs leading-6 text-slate-600 dark:text-slate-400">Material demand scales exactly with the batch target. Fractional formula quantities are allowed up to six decimal places. Issuance requires whole quantities in the current stock units; incompatible batch quantities are blocked with a precise explanation.</p>
      <button disabled={saving || !productId || !materials.length} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-800 px-5 text-sm font-semibold text-white hover:bg-sky-900 disabled:opacity-50"><Save className="h-4 w-4"/>{saving ? 'Saving…' : 'Save BOM'}</button>
    </form>}
  </main>;
}
