import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { productionError, useProductionOptions } from './productionApi';
import type { ProductionBatchRecord } from './productionApi';
import { listQuery, productionLink } from './productionPresentation';
import { pageClass, panelClass, inputClass, primaryClass, secondaryClass, ProductionError, ProductionLoading } from './ProductionUi';

export default function PlantManagerProductionCreate() {
  const options = useProductionOptions(), navigate = useNavigate();
  const [params] = useSearchParams(), query = listQuery(params);
  const [productId, setProductId] = useState(''), [target, setTarget] = useState('1');
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const submitting = useRef(false);
  const products = options.data?.products.filter(item => item.bom_id && ['PCS', 'SACK', 'DRUM'].includes(item.unit)) ?? [];
  const product = products.find(item => String(item.id) === productId);
  const targetNumber = Number(target);
  const valid = !!product?.bom_id && !!options.data?.warehouse && Number.isInteger(targetNumber) && targetNumber >= 1 && targetNumber <= 1000000;
  const create = async (event: FormEvent) => {
    event.preventDefault(); if (submitting.current || !valid || !options.data?.warehouse) return;
    submitting.current = true; setSaving(true); setError('');
    try {
      const response = await apiClient.post<{ data: ProductionBatchRecord }>('/production/batches', { product_id: Number(productId), warehouse_id: options.data.warehouse.id, target_quantity: targetNumber });
      navigate(productionLink(`/${response.data.data.id}`, query, { mode: 'continue', step: '1' }), { replace: true, state: { productionNotice: 'Planned batch created. No materials have been issued.' } });
    } catch (cause) { setError(productionError(cause)); }
    finally { submitting.current = false; setSaving(false); }
  };
  return <div className={pageClass}>
    <Link to={productionLink('', query)} className={secondaryClass}><ArrowLeft className="h-4 w-4" aria-hidden="true"/>Back to Batches</Link>
    <header><h1 className="text-2xl font-bold">Create Production Batch</h1><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">Plan a finished product using its saved BOM in your assigned warehouse.</p></header>
    <section className={`${panelClass} max-w-3xl`}>
      {options.loading ? <ProductionLoading message="Loading finished products and warehouse…"/> : <>
        <ProductionError message={options.error}/>{options.error && <button type="button" className={`${secondaryClass} mt-3`} onClick={options.reload}>Try Again</button>}
        {options.data && <form onSubmit={create} className="space-y-5">
          <div><h2 className="text-sm font-semibold">Assigned Warehouse</h2><p className="mt-1 text-sm">{options.data.warehouse?.name ?? 'No warehouse assigned'}</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">Batches and materials stay within your warehouse assignment.</p></div>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm"><span className="mb-2 block font-medium">Finished Product *</span><select required value={productId} onChange={event => setProductId(event.target.value)} className={inputClass}><option value="">Select finished product</option>{products.map(item => <option key={item.id} value={item.id}>{item.name} — {item.unit}</option>)}</select></label><label className="block text-sm"><span className="mb-2 block font-medium">Target Quantity ({product?.unit ?? 'stock units'}) *</span><input required type="number" min={1} max={1000000} step={1} value={target} onChange={event => setTarget(event.target.value)} className={inputClass}/></label></div>
          {!products.length && <p role="status" className="text-sm text-amber-900 dark:text-amber-200">No finished products with a valid BOM are available for your warehouse. Ask an administrator to configure a formula.</p>}
          {product && <div role="status" className={`rounded-lg border p-3 text-sm leading-6 ${product.bom_id ? 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300' : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'}`}><p className="font-medium">{product.bom_id ? `BOM #${product.bom_id} configured` : 'BOM setup required'}</p><p>{product.bom_id ? 'The saved formula is copied into this batch. Review exact material demand before issuing.' : 'Ask Admin to configure this finished product’s BOM before creating a batch.'}</p></div>}
          <p className="flex items-start gap-2 text-sm leading-6 text-slate-600 dark:text-slate-400"><Info className="mt-1 h-4 w-4 shrink-0" aria-hidden="true"/>Creating a planned batch does not deduct stock or submit a replenishment request.</p>
          <ProductionError message={error}/>
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800"><Link to={productionLink('', query)} className={secondaryClass}>Cancel</Link><button disabled={saving || !valid} className={primaryClass}>{saving ? 'Creating…' : 'Create Planned Batch'}</button></div>
        </form>}
      </>}
    </section>
  </div>;
}
