import React, { useEffect, useMemo, useRef, useState } from 'react';
import CompactDatePicker from '../../../components/ui/CompactDatePicker';
import type { ReportDefinition, ReportFilterValues, ReportOptions } from './reportApi';

export const fieldClass = 'w-full min-h-11 rounded-xl border border-slate-800 bg-[#070a12] px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 sm:text-sm';
export const labelClass = 'mb-1.5 block text-xs font-medium text-slate-300';

interface Props {
  definition: ReportDefinition;
  values: ReportFilterValues;
  onChange: (values: ReportFilterValues) => void;
  options: ReportOptions | null;
  hideDates?: boolean;
  hideWarehouse?: boolean;
  idPrefix: string;
}

/** Renders only the filters the selected report definition declares. */
const ReportFilterFields: React.FC<Props> = ({ definition, values, onChange, options, hideDates = false, hideWarehouse = false, idPrefix }) => {
  const set = (key: keyof ReportFilterValues, value: string) => onChange({ ...values, [key]: value || undefined });
  const has = (filter: ReportDefinition['filters'][number]) => definition.filters.includes(filter);
  const dateInvalid = Boolean(values.date_from && values.date_to && values.date_to < values.date_from);
  const visible = definition.filters.filter((filter) => !((hideDates && filter === 'date') || (hideWarehouse && filter === 'warehouse')));
  const [productOpen, setProductOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const productBox = useRef<HTMLDivElement>(null);
  const eligibleProducts = useMemo(() => (options?.products ?? []).filter((product) =>
    (!values.category || product.category === values.category)
    && (!productSearch.trim() || product.name.toLowerCase().includes(productSearch.trim().toLowerCase()))
  ), [options?.products, productSearch, values.category]);
  const selectedProduct = options?.products.find((product) => String(product.id) === values.product_id);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!productBox.current?.contains(event.target as Node)) setProductOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const setCategory = (category: string) => {
    const selectedStillValid = !values.product_id || options?.products.some((product) => String(product.id) === values.product_id && (!category || product.category === category));
    onChange({ ...values, category: category || undefined, product_id: selectedStillValid ? values.product_id : undefined });
    setProductSearch('');
  };

  if (visible.length === 0) {
    return <p className="text-xs text-slate-500">This report has no filters. It always reflects current data.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {has('date') && !hideDates && (
        <>
          <div>
            <span className={labelClass}>{definition.date_label ?? 'Date'} — From</span>
            <CompactDatePicker value={values.date_from ?? ''} max={values.date_to || undefined} onChange={(value) => set('date_from', value)} label={`${definition.date_label ?? 'Date'} from`} />
          </div>
          <div>
            <span className={labelClass}>{definition.date_label ?? 'Date'} — To</span>
            <CompactDatePicker value={values.date_to ?? ''} min={values.date_from || undefined} onChange={(value) => set('date_to', value)} label={`${definition.date_label ?? 'Date'} to`} />
            {dateInvalid && <p role="alert" className="mt-1 text-xs text-red-500">To date must be on or after the From date.</p>}
          </div>
        </>
      )}
      {has('warehouse') && !hideWarehouse && (
        <div>
          <label htmlFor={`${idPrefix}-warehouse`} className={labelClass}>Warehouse</label>
          <select id={`${idPrefix}-warehouse`} value={values.warehouse_id ?? ''} onChange={(event) => set('warehouse_id', event.target.value)} className={fieldClass}>
            <option value="">All warehouses</option>
            {options?.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>)}
          </select>
        </div>
      )}
      {has('product') && (
        <div ref={productBox} className="relative">
          <label id={`${idPrefix}-product-label`} className={labelClass}>Product</label>
          <button type="button" aria-labelledby={`${idPrefix}-product-label`} aria-haspopup="listbox" aria-expanded={productOpen} onClick={() => setProductOpen((open) => !open)} className={`${fieldClass} flex items-center justify-between gap-2 text-left`}>
            <span className="truncate">{selectedProduct?.name ?? (values.category ? `All products in ${values.category}` : 'All products')}</span><span aria-hidden="true">▾</span>
          </button>
          {productOpen && <div className="absolute left-0 top-full z-[80] mt-1 w-full min-w-[16rem] rounded-xl border border-slate-700 bg-[#0b101d] p-2 shadow-2xl">
            <input type="search" autoFocus value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search products…" aria-label="Search products" className={`${fieldClass} mb-2`} />
            <div role="listbox" aria-labelledby={`${idPrefix}-product-label`} className="max-h-56 overflow-y-auto overscroll-contain">
              <button type="button" role="option" aria-selected={!values.product_id} onClick={() => { set('product_id', ''); setProductOpen(false); }} className="min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 focus:bg-slate-800 focus:outline-none">{values.category ? `All products in ${values.category}` : 'All products'}</button>
              {eligibleProducts.map((product) => <button key={product.id} type="button" role="option" aria-selected={String(product.id) === values.product_id} onClick={() => { set('product_id', String(product.id)); setProductOpen(false); }} className={`min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-800 focus:bg-slate-800 focus:outline-none ${String(product.id) === values.product_id ? 'bg-cyan-500/10 text-cyan-300' : 'text-slate-200'}`}>{product.name}<span className="ml-2 text-xs text-slate-500">{product.category ?? 'Uncategorized'}</span></button>)}
              {eligibleProducts.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-500">No matching products.</p>}
            </div>
          </div>}
        </div>
      )}
      {has('supplier') && (
        <div>
          <label htmlFor={`${idPrefix}-supplier`} className={labelClass}>Supplier</label>
          <select id={`${idPrefix}-supplier`} value={values.supplier_id ?? ''} onChange={(event) => set('supplier_id', event.target.value)} className={fieldClass}>
            <option value="">All suppliers</option>
            {options?.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} ({supplier.supplier_code})</option>)}
          </select>
        </div>
      )}
      {has('category') && (
        <div>
          <label htmlFor={`${idPrefix}-category`} className={labelClass}>Product category</label>
          <select id={`${idPrefix}-category`} value={values.category ?? ''} onChange={(event) => setCategory(event.target.value)} className={fieldClass}>
            <option value="">All categories</option>
            {options?.product_categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
      )}
      {has('status') && definition.statuses.length > 0 && (
        <div>
          <label htmlFor={`${idPrefix}-status`} className={labelClass}>Status</label>
          <select id={`${idPrefix}-status`} value={values.status ?? ''} onChange={(event) => set('status', event.target.value)} className={fieldClass}>
            <option value="">All statuses</option>
            {definition.statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
        </div>
      )}
      {has('movement_type') && (
        <div>
          <label htmlFor={`${idPrefix}-movement`} className={labelClass}>Movement type</label>
          <select id={`${idPrefix}-movement`} value={values.movement_type ?? ''} onChange={(event) => set('movement_type', event.target.value)} className={fieldClass}>
            <option value="">Stock In and Stock Out</option>
            <option value="STOCK_IN">Stock In</option>
            <option value="STOCK_OUT">Stock Out</option>
          </select>
        </div>
      )}
    </div>
  );
};

export default ReportFilterFields;
